#!/usr/bin/env python3
"""
Router Server for Distributed Terminal Management
Distributes terminal creation requests across multiple VM API servers
"""

from fastapi import FastAPI, HTTPException, APIRouter, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import uvicorn
import logging
import logging.handlers
import os
import time
import requests
import json
from datetime import datetime
import asyncio
import aiohttp
from contextlib import asynccontextmanager
import cloudscraper
from bs4 import BeautifulSoup

# Configure logging to both file and console
def setup_logging():
    # Create logs directory if it doesn't exist
    os.makedirs('logs', exist_ok=True)
    
    # Create logger
    logger = logging.getLogger('router_server')
    logger.setLevel(logging.INFO)
    
    # Remove existing handlers
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
    
    # Create formatters
    file_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    console_formatter = logging.Formatter('%(levelname)s - %(message)s')
    
    # File handler (daily rotation, keep 7 days)
    file_handler = logging.handlers.TimedRotatingFileHandler(
        'logs/router_server.log',
        when='midnight',
        interval=1,
        backupCount=7
    )
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(file_formatter)
    
    # Console handler (less verbose)
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(console_formatter)
    
    # Add handlers to logger
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    
    return logger

# Setup logging
logger = setup_logging()

# Create API router for /api prefix
api_router = APIRouter()

# VM Configuration
class VMConfig:
    def __init__(self):
        # List of VM API servers (add your VM IPs here)
        self.vm_servers = [
            "http://192.168.1.175",  # VM1
            # "http://192.168.1.176",  # VM2
            # "http://192.168.1.188",  # VM3
            # "http://192.168.1.189",  # VM4
            # "http://192.168.1.190",  # VM5
            # "http://192.168.1.191",  # VM6
            # "http://192.168.1.192",  # VM7
            # "http://192.168.1.193",  # VM8
        ]
        self.max_terminals_per_vm = 30  # Desktop heap limit per VM
        self.timeout = 300  # 5 minutes timeout
        self.health_check_interval = 30  # 30 seconds

# Initialize VM configuration
vm_config = VMConfig()

# WebSocket connection manager
class WebSocketManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.account_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, account_id: Optional[str] = None):
        await websocket.accept()
        self.active_connections.append(websocket)
        if account_id:
            if account_id not in self.account_connections:
                self.account_connections[account_id] = []
            self.account_connections[account_id].append(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket, account_id: Optional[str] = None):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if account_id and account_id in self.account_connections:
            if websocket in self.account_connections[account_id]:
                self.account_connections[account_id].remove(websocket)
            if not self.account_connections[account_id]:
                del self.account_connections[account_id]
        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                self.active_connections.remove(connection)

    async def send_to_account(self, message: str, account_id: str):
        if account_id in self.account_connections:
            dead_connections = []
            for connection in self.account_connections[account_id]:
                try:
                    await connection.send_text(message)
                except:
                    dead_connections.append(connection)
            for dead_connection in dead_connections:
                self.account_connections[account_id].remove(dead_connection)
            if not self.account_connections[account_id]:
                del self.account_connections[account_id]

# Initialize WebSocket manager
websocket_manager = WebSocketManager()

# VM Status Tracking
class VMStatus:
    def __init__(self):
        self.vm_status = {}  # Track status of each VM
        self.vm_terminal_counts = {}  # Track terminal count per VM
        self.vm_last_health_check = {}  # Track last health check time
        self.account_to_vm_mapping = {}  # Track which VM has which account
        self.login_to_vm_mapping = {}  # Track which VM has which login
        self.vm_locks = {}  # Track which VMs are currently locked (processing)
        self.vm_lock_timestamps = {}  # Track when VMs were locked
        
    def update_vm_status(self, vm_url: str, status: str, terminal_count: int = 0):
        """Update VM status and terminal count"""
        self.vm_status[vm_url] = status
        self.vm_terminal_counts[vm_url] = terminal_count
        self.vm_last_health_check[vm_url] = time.time()
    
    def get_available_vms(self) -> List[str]:
        """Get list of available VMs with capacity and not locked"""
        available_vms = []
        for vm_url in vm_config.vm_servers:
            status = self.vm_status.get(vm_url, "unknown")
            terminal_count = self.vm_terminal_counts.get(vm_url, 0)
            is_locked = self.is_vm_locked(vm_url)
            
            if status == "healthy" and terminal_count < vm_config.max_terminals_per_vm and not is_locked:
                available_vms.append(vm_url)
            elif is_locked:
                lock_duration = self.get_vm_lock_duration(vm_url)
                # Removed verbose logging: logger.info(f"VM {vm_url} is locked (duration: {lock_duration:.1f}s)")
        
        return available_vms
    
    def get_best_vm(self) -> Optional[str]:
        """Get the VM with the least terminals"""
        available_vms = self.get_available_vms()
        if not available_vms:
            logger.warning("No available VMs found")
            return None
        
        # Find VM with least terminals
        vm_terminals = [(vm, self.vm_terminal_counts.get(vm, 0)) for vm in available_vms]
        vm_terminals.sort(key=lambda x: x[1])  # Sort by terminal count
        
        best_vm = vm_terminals[0][0]
        best_count = vm_terminals[0][1]
        
        # Removed verbose logging:
        # logger.info(f"Available VMs sorted by terminal count:")
        # for vm, count in vm_terminals:
        #     logger.info(f"  {vm}: {count} terminals")
        # logger.info(f"Selected best VM: {best_vm} with {best_count} terminals")
        
        return best_vm
    
    def get_vm_for_account(self, account_id: str) -> Optional[str]:
        """Get the VM that has a specific account"""
        return self.account_to_vm_mapping.get(account_id)
    
    def map_account_to_vm(self, account_id: str, vm_url: str):
        """Map an account to a specific VM"""
        self.account_to_vm_mapping[account_id] = vm_url
        logger.info(f"Mapped account {account_id} to VM {vm_url}")
    
    def map_login_to_vm(self, login: str, vm_url: str):
        """Map a login to a specific VM"""
        self.login_to_vm_mapping[login] = vm_url
        logger.info(f"Mapped login {login} to VM {vm_url}")
    
    def get_vm_for_login(self, login: str) -> Optional[str]:
        """Get the VM that has a specific login"""
        return self.login_to_vm_mapping.get(login)
    
    def remove_login_mapping(self, login: str):
        """Remove a login mapping"""
        if login in self.login_to_vm_mapping:
            del self.login_to_vm_mapping[login]
            logger.info(f"Removed login mapping for {login}")
    
    def remove_account_mapping(self, account_id: str):
        """Remove an account mapping"""
        if account_id in self.account_to_vm_mapping:
            del self.account_to_vm_mapping[account_id]
            logger.info(f"Removed account mapping for {account_id}")
    
    def get_vm_terminal_count(self, vm_url: str) -> int:
        """Get terminal count for a specific VM"""
        return self.vm_terminal_counts.get(vm_url, 0)
    
    def increment_vm_terminal_count(self, vm_url: str):
        """Increment terminal count for a specific VM"""
        current_count = self.vm_terminal_counts.get(vm_url, 0)
        self.vm_terminal_counts[vm_url] = current_count + 1
        logger.info(f"Incremented terminal count for VM {vm_url}: {current_count} -> {current_count + 1}")
    
    def decrement_vm_terminal_count(self, vm_url: str):
        """Decrement terminal count for a specific VM"""
        current_count = self.vm_terminal_counts.get(vm_url, 0)
        new_count = max(0, current_count - 1)
        self.vm_terminal_counts[vm_url] = new_count
        logger.info(f"Decremented terminal count for VM {vm_url}: {current_count} -> {new_count}")
    
    def lock_vm(self, vm_url: str):
        """Lock a VM (mark as processing)"""
        self.vm_locks[vm_url] = True
        self.vm_lock_timestamps[vm_url] = time.time()
        logger.info(f"Locked VM {vm_url}")
    
    def unlock_vm(self, vm_url: str):
        """Unlock a VM (mark as available)"""
        if vm_url in self.vm_locks:
            del self.vm_locks[vm_url]
        if vm_url in self.vm_lock_timestamps:
            del self.vm_lock_timestamps[vm_url]
        logger.info(f"Unlocked VM {vm_url}")
    
    def is_vm_locked(self, vm_url: str) -> bool:
        """Check if a VM is currently locked"""
        return vm_url in self.vm_locks
    
    def get_vm_lock_duration(self, vm_url: str) -> float:
        """Get how long a VM has been locked (in seconds)"""
        if vm_url in self.vm_lock_timestamps:
            return time.time() - self.vm_lock_timestamps[vm_url]
        return 0.0

# Initialize VM status tracker
vm_status = VMStatus()

# Global variables for tracking account creation
logins_being_created = set()
logins_creation_timestamps = {}
logins_creation_lock = asyncio.Lock()

# Global variables
queued_accounts = set()  # Track which account_ids are in the queue
accounts_being_created = set()  # Track which account_ids are currently being created
account_creation_queue = asyncio.Queue()
queue_processing_task = None
queue_processing_lock = asyncio.Lock()

# VM Synchronizer class
class VMSynchronizer:
    def __init__(self):
        self.sync_in_progress = False
        self.last_sync_time = {}
        self.sync_interval = 300  # 5 minutes
    
    async def sync_all_vms(self) -> int:
        """Sync all VMs and return total mappings"""
        self.sync_in_progress = True
        total_mappings = 0
        
        try:
            for vm_url in vm_config.vm_servers:
                if vm_status.vm_status.get(vm_url) == "healthy":
                    mappings = await self.sync_vm(vm_url)
                    total_mappings += mappings
                    self.last_sync_time[vm_url] = time.time()
        finally:
            self.sync_in_progress = False
        
        return total_mappings
    
    async def sync_vm(self, vm_url: str) -> int:
        """Sync a single VM and return number of mappings"""
        try:
            async with aiohttp.ClientSession() as session:
                url = f"{vm_url}/api/accounts"
                async with session.get(url, timeout=30) as response:
                    if response.status == 200:
                        result = await response.json()
                        accounts = result.get("accounts", [])
                        
                        mappings = 0
                        for account in accounts:
                            account_id = account.get("account_id")
                            login = account.get("login")
                            if account_id and login:
                                vm_status.account_to_vm_mapping[account_id] = vm_url
                                vm_status.login_to_vm_mapping[login] = vm_url
                                mappings += 1
                        
                        return mappings
        except Exception as e:
            logger.warning(f"Error syncing VM {vm_url}: {e}")
        
        return 0

# Initialize VM synchronizer
vm_synchronizer = VMSynchronizer()

async def cleanup_stale_creation_entries():
    """Remove stale entries from being_created set"""
    current_time = time.time()
    stale_threshold = 300  # 5 minutes
    
    async with logins_creation_lock:
        stale_logins = []
        for login, timestamp in logins_creation_timestamps.items():
            if current_time - timestamp > stale_threshold:
                stale_logins.append(login)
        
        for login in stale_logins:
            logins_being_created.discard(login)
            logins_creation_timestamps.pop(login, None)
        
        if stale_logins:
            logger.info(f"Cleaned up {len(stale_logins)} stale creation entries")

async def auto_clear_stale_cache_for_login(login: str):
    """Automatically clear stale cache for a specific login when duplicate error occurs"""
    try:
        logger.info(f"Auto-clearing stale cache for login '{login}'")
        
        # Remove from mappings
        if login in vm_status.login_to_vm_mapping:
            del vm_status.login_to_vm_mapping[login]
            logger.info(f"Removed stale login mapping for '{login}'")
        
        # Remove from being_created set
        async with logins_creation_lock:
            if login in logins_being_created:
                logins_being_created.discard(login)
                logins_creation_timestamps.pop(login, None)
                logger.info(f"Removed '{login}' from being_created set")
        
        # Also clear any stale account mappings that might be related
        stale_accounts = []
        for account_id, vm_url in vm_status.account_to_vm_mapping.items():
            # This is a simple heuristic - in a real system you might want to verify
            # if the account_id actually corresponds to the login
            if vm_url in vm_config.vm_servers:
                stale_accounts.append(account_id)
        
        for account_id in stale_accounts[:5]:  # Limit to first 5 to avoid clearing too much
            del vm_status.account_to_vm_mapping[account_id]
            logger.info(f"Removed potentially stale account mapping for account_id '{account_id}'")
        
    except Exception as e:
        logger.error(f"Error auto-clearing stale cache for login '{login}': {e}")

async def background_cache_cleanup():
    """Background task to periodically clean up stale cache"""
    while True:
        try:
            await asyncio.sleep(300)  # Run every 5 minutes
            await cleanup_stale_creation_entries()
            
            # Also check for stale mappings periodically
            if len(vm_status.login_to_vm_mapping) > 100:  # Only if we have many mappings
                logger.info("Running periodic cache cleanup due to large mapping size")
                await auto_clear_stale_cache_bulk()
                
        except Exception as e:
            logger.error(f"Error in background cache cleanup: {e}")

async def auto_clear_stale_cache_bulk():
    """Clear stale cache entries in bulk"""
    try:
        logger.info("Running bulk cache cleanup")
        
        # Clear all mappings (this is aggressive but effective)
        vm_status.account_to_vm_mapping.clear()
        vm_status.login_to_vm_mapping.clear()
        
        # Clear being_created set
        async with logins_creation_lock:
            logins_being_created.clear()
            logins_creation_timestamps.clear()
        
        logger.info("Bulk cache cleanup completed")
        
    except Exception as e:
        logger.error(f"Error in bulk cache cleanup: {e}")

async def process_account_creation_queue():
    """Background task to process queued account creation requests in parallel"""
    global queue_processing_task
    
    logger.info("Starting account creation queue processor")
    
    while True:
        try:
            # Process all available queued requests in parallel
            await process_queued_requests_batch()
            
            # Brief pause before next batch check
            await asyncio.sleep(0.5)  # Check more frequently
                
        except Exception as e:
            logger.error(f"Error in queue processing: {e}")
            await asyncio.sleep(1)  # Brief pause before retrying
    
    logger.info("Account creation queue processor stopped")

async def process_queued_requests_batch():
    """Process a batch of queued requests in parallel"""
    try:
        # Get all available VMs
        available_vms = vm_status.get_available_vms()
        if not available_vms:
            return  # No VMs available, wait for next batch
        
        # Get queued requests (up to the number of available VMs)
        queued_requests = []
        max_requests = len(available_vms)
        
        # Try to get multiple requests from queue
        for _ in range(max_requests):
            try:
                # Non-blocking get from queue
                queue_item = account_creation_queue.get_nowait()
                if queue_item is None:  # Shutdown signal
                    break
                queued_requests.append(queue_item)
            except asyncio.QueueEmpty:
                break  # No more requests in queue
        
        if not queued_requests:
            return  # No requests to process
        
        logger.info(f"Processing {len(queued_requests)} queued requests with {len(available_vms)} available VMs")
        
        # Process requests in parallel WITHOUT waiting for all to complete
        for i, (request, future) in enumerate(queued_requests):
            # Assign VM to request (round-robin or least loaded)
            vm_url = available_vms[i % len(available_vms)]
            # Create task but don't wait for it - let it run independently
            asyncio.create_task(process_single_queued_request(request, future, vm_url))
            
    except Exception as e:
        logger.error(f"Error in batch processing: {e}")

async def process_single_queued_request(request, future, vm_url):
    """Process a single queued request on a specific VM"""
    try:
        logger.info(f"Processing queued account creation for login: {request.login} on VM: {vm_url}")
        
        # Generate account_id for tracking (consistent with VM)
        account_id = f"{request.user_id or 1}"
        
        # Remove from queue tracking since we're now processing it
        if account_id in queued_accounts:
            queued_accounts.remove(account_id)
            logger.info(f"Removed account {account_id} from queue tracking - now processing")
        
        # Add to being created tracking
        accounts_being_created.add(account_id)
        logger.info(f"Added account {account_id} to being created tracking")
        
        try:
            # Lock the VM for this request
            vm_status.lock_vm(vm_url)
            logger.info(f"Locked VM {vm_url} for login: {request.login}")
            
            # Try to create the account on the assigned VM
            result = await create_account_on_specific_vm(request, vm_url)
            logger.info(f"Queued account creation successful for login: {request.login}")
            
            # Remove from being created tracking since it's now completed
            if account_id in accounts_being_created:
                accounts_being_created.remove(account_id)
                logger.info(f"Removed account {account_id} from being created tracking - now completed")
            
            # Set the result in the future
            future.set_result(result)
            
        except Exception as e:
            logger.error(f"Queued account creation failed for login {request.login}: {e}")
            # Remove from being created tracking on error
            if account_id in accounts_being_created:
                accounts_being_created.remove(account_id)
                logger.info(f"Removed account {account_id} from being created tracking - failed")
            # Set the exception in the future
            future.set_exception(e)
            
        finally:
            # Unlock the VM
            vm_status.unlock_vm(vm_url)
            logger.info(f"Unlocked VM {vm_url} for login: {request.login}")
            account_creation_queue.task_done()
            
    except Exception as e:
        logger.error(f"Error processing single queued request for {request.login}: {e}")
        # Make sure VM is unlocked and future is set
        vm_status.unlock_vm(vm_url)
        if not future.done():
            future.set_exception(e)
        account_creation_queue.task_done()

# Pydantic models
class AccountCreateRequest(BaseModel):
    login: str
    password: str
    server: str
    name: str
    email: str
    groupid: Optional[str] = None
    subscription: Optional[str] = None
    environment: str = "Real"
    status: str = "1"
    broker: str = "mt4"
    platform_type: str = "mt4"
    user_id: Optional[int] = None

class AccountUpdateRequest(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    groupid: Optional[str] = None
    version: Optional[str] = None
    state: Optional[str] = None

class EADataRequest(BaseModel):
    account_id: str
    login: str
    server: str
    currency: str
    leverage: int
    balance: float
    equity: float
    margin: float
    free_margin: float
    profit: float
    margin_level: float
    open_positions: int
    pending_orders: int
    connected: bool
    trade_allowed: bool
    timestamp: str
    source: str

class RouterResponse(BaseModel):
    success: bool
    message: str
    vm_url: Optional[str] = None
    account_id: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    error_code: Optional[str] = None

async def create_account_on_available_vm(request: AccountCreateRequest):
    """Create account on an available VM (used by queue processor)"""
    try:
        # Wait for a VM to become available
        max_wait_time = 300  # 5 minutes
        start_time = time.time()
        
        while time.time() - start_time < max_wait_time:
            best_vm = vm_status.get_best_vm()
            if best_vm:
                logger.info(f"VM {best_vm} is available for queued request login: {request.login}")
                return await create_account_on_specific_vm(request, best_vm)
            
            logger.info(f"Waiting for VM to become available for login: {request.login}")
            await asyncio.sleep(5)  # Wait 5 seconds before checking again
        
        # If we get here, no VM became available in time
        raise HTTPException(status_code=503, detail="No VMs available after waiting 5 minutes")
        
    except Exception as e:
        logger.error(f"Error in create_account_on_available_vm for login {request.login}: {e}")
        raise

async def create_account_on_specific_vm(request: AccountCreateRequest, vm_url: str) -> dict:
    """Create account on a specific VM"""
    try:
        logger.info(f"Creating account on VM {vm_url} with {vm_status.vm_terminal_counts.get(vm_url)} terminals (will become {vm_status.vm_terminal_counts.get(vm_url) + 1})")
        
        # Lock the VM before starting account creation
        vm_status.lock_vm(vm_url)
        
        # Prepare the request data for the VM API server
        vm_request_data = {
            "login": request.login,
            "password": request.password,
            "server": request.server,   # server name (e.g. "127.0.0.1:5001")
            "name": request.name,
            "email": request.email,
            "groupid": request.groupid,
            "subscription": request.subscription,
            "environment": request.environment,
            "status": request.status,
            "broker": request.broker,
            "platform_type": request.platform_type,  # Convert broker to platform_type
            "user_id": request.user_id or 1  # Use default user_id if None
        }
        
        logger.info(f"Forwarding account creation request to {vm_url}/api/accounts")
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{vm_url}/api/accounts",
                json=vm_request_data,
                timeout=300  # 5 minutes timeout for account creation
            ) as response:
                response_text = await response.text()
                
                # Unlock VM after getting response
                vm_status.unlock_vm(vm_url)
                logger.info(f"Unlocked VM {vm_url} - request completed")
                
                if response.status == 200:
                    result = await response.json()
                    logger.info(f"Successfully created account on VM {vm_url}")
                    
                    # Increment terminal count for this VM
                    vm_status.vm_terminal_counts[vm_url] = vm_status.vm_terminal_counts.get(vm_url, 0) + 1
                    
                    # Map the account to this VM
                    if result.get("success") and result.get("account"):
                        account_id = result["account"].get("account_id")
                        if account_id:
                            vm_status.map_account_to_vm(account_id, vm_url)
                            vm_status.map_login_to_vm(request.login, vm_url)
                            logger.info(f"Mapped account {account_id} (login {request.login}) to VM {vm_url}")
                    
                    return result
                elif response.status == 503:  # SERVER_BUSY
                    logger.warning(f"VM {vm_url} is busy (503), will retry or queue")
                    raise HTTPException(status_code=503, detail="VM is busy")
                elif response.status == 405:  # Method Not Allowed (VM busy)
                    logger.warning(f"VM {vm_url} returned 405 (Method Not Allowed) - VM is busy")
                    raise HTTPException(status_code=503, detail="VM is busy")
                else:
                    logger.error(f"VM {vm_url} returned error: {response.status} - {response_text}")
                    
                    # Handle duplicate login error with automatic cache clearing
                    if "already exists" in response_text.lower() or "duplicate" in response_text.lower():
                        logger.warning(f"Duplicate login detected for {request.login}, clearing cache and retrying")
                        await auto_clear_stale_cache_for_login(request.login)
                        
                        # Retry once after clearing cache
                        logger.info(f"Retrying account creation for {request.login} after cache clear")
                        async with session.post(
                            f"{vm_url}/api/accounts",
                            json=vm_request_data,
                            timeout=300
                        ) as retry_response:
                            retry_text = await retry_response.text()
                            if retry_response.status == 200:
                                result = await retry_response.json()
                                logger.info(f"Successfully created account on retry for VM {vm_url}")
                                
                                # Increment terminal count for this VM
                                vm_status.vm_terminal_counts[vm_url] = vm_status.vm_terminal_counts.get(vm_url, 0) + 1
                                
                                # Map the account to this VM
                                if result.get("success") and result.get("account"):
                                    account_id = result["account"].get("account_id")
                                    if account_id:
                                        vm_status.map_account_to_vm(account_id, vm_url)
                                        vm_status.map_login_to_vm(request.login, vm_url)
                                        logger.info(f"Mapped account {account_id} (login {request.login}) to VM {vm_url}")
                                
                                return result
                            else:
                                logger.error(f"VM {vm_url} retry failed: {retry_response.status} - {retry_text}")
                                raise Exception(f"VM communication error: {retry_text}")
                    else:
                        raise Exception(f"VM communication error: {response_text}")
                        
    except Exception as e:
        logger.error(f"Error communicating with VM {vm_url}: {e}")
        # Make sure VM is unlocked even on error
        vm_status.unlock_vm(vm_url)
        raise

# Health check functions
async def check_vm_health(vm_url: str) -> Dict[str, Any]:
    """Check health of a VM API server"""
    try:
        async with aiohttp.ClientSession() as session:
            # First try the status endpoint
            async with session.get(f"{vm_url}/api/status", timeout=10) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    # Get terminal count from multiple possible fields for backward compatibility
                    terminal_count = data.get("current_terminals", 0)
                    
                    if terminal_count == 0:
                        # Try alternative field names
                        terminal_count = data.get("terminals", {}).get("current", 0)
                    if terminal_count == 0:
                        # Try to get from system capacity if available
                        terminal_count = data.get("system_capacity", {}).get("current_terminals", 0)
                    
                    # If still no terminal count, try the dedicated endpoint
                    if terminal_count == 0:
                        try:
                            async with session.get(f"{vm_url}/api/terminals/count", timeout=5) as count_response:
                                if count_response.status == 200:
                                    count_data = await count_response.json()
                                    terminal_count = count_data.get("current_terminals", 0)
                                else:
                                    logger.warning(f"VM {vm_url} terminals/count returned HTTP {count_response.status}")
                        except Exception as count_e:
                            logger.warning(f"Could not get terminal count from dedicated endpoint for {vm_url}: {count_e}")
                    return {
                        "status": "healthy",
                        "data": data,
                        "terminal_count": terminal_count
                    }
                else:
                    logger.error(f"VM {vm_url} status endpoint returned HTTP {response.status}")
                    return {"status": "unhealthy", "error": f"HTTP {response.status}"}
    except Exception as e:
        logger.error(f"Error checking VM {vm_url}: {e}")
        return {"status": "unhealthy", "error": str(e)}

async def health_check_all_vms():
    """Check health of all VM API servers"""
    
    for vm_url in vm_config.vm_servers:
        try:
            health_result = await check_vm_health(vm_url)
            if health_result["status"] == "healthy":
                terminal_count = health_result.get("terminal_count", 0)
                vm_status.update_vm_status(vm_url, "healthy", terminal_count)
                # Only log if there's a change in status or if unhealthy
                # logger.info(f"VM {vm_url}: healthy ({terminal_count} terminals)")  # Removed verbose logging
            else:
                vm_status.update_vm_status(vm_url, "unhealthy", 0)
                logger.warning(f"VM {vm_url} is unhealthy: {health_result.get('error', 'unknown')}")
        except Exception as e:
            vm_status.update_vm_status(vm_url, "unhealthy", 0)
            logger.error(f"Error checking VM {vm_url}: {e}")
    
    available_vms = vm_status.get_available_vms()

# Background health check task
async def background_health_check():
    """Background task to periodically check VM health"""
    while True:
        try:
            await health_check_all_vms()
        except Exception as e:
            logger.error(f"Background health check error: {e}")
        
        await asyncio.sleep(vm_config.health_check_interval)

# Lifespan event handler
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for FastAPI"""
    # Startup
    logger.info("Starting Router Server for Distributed Terminal Management")
    
    # Initial health check
    await health_check_all_vms()
    
    # Start background health check task
    asyncio.create_task(background_health_check())
    
    # Start background cache cleanup task
    asyncio.create_task(background_cache_cleanup())
    
    # Start account creation queue processor
    global queue_processing_task
    queue_processing_task = asyncio.create_task(process_account_creation_queue())
    
    logger.info("Router Server initialized successfully")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Router Server")

# Create FastAPI app
app = FastAPI(
    title="Router Server for Distributed Terminal Management",
    description="Routes terminal creation requests across multiple VM API servers",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Route definitions will be added here

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Router Server for Distributed Terminal Management",
        "version": "1.0.0",
        "status": "running",
        "total_vms": len(vm_config.vm_servers),
        "available_vms": len(vm_status.get_available_vms())
    }

# API router endpoints
@api_router.get("/status")
async def router_status():
    """Get router server status and VM health"""
    available_vms = vm_status.get_available_vms()
    total_terminals = sum(vm_status.vm_terminal_counts.values())
    queue_size = account_creation_queue.qsize()
    
    # Check if router is busy (has queued requests)
    is_busy = queue_size > 0
    busy_reason = f"Processing {queue_size} queued account creation requests" if is_busy else None
    
    return {
        "server": "JamesPlatform Distributed Terminal Management Router",
        "version": "1.0.0",
        "status": "busy" if is_busy else "ready",
        "current_terminals": total_terminals,
        "max_terminals": len(vm_config.vm_servers) * vm_config.max_terminals_per_vm,
        "busy": {
            "is_busy": is_busy,
            "reason": busy_reason,
            "duration_seconds": 0  # Queue processing is continuous
        },
        "queue": {
            "size": queue_size,
            "processing": queue_processing_task is not None and not queue_processing_task.done(),
            "available_vms": len(available_vms),
            "total_vms": len(vm_config.vm_servers)
        },
        "vms": {
            vm_url: {
                "status": vm_status.vm_status.get(vm_url, "unknown"),
                "terminals": vm_status.vm_terminal_counts.get(vm_url, 0),
                "max_terminals": vm_config.max_terminals_per_vm,
                "available": vm_status.vm_terminal_counts.get(vm_url, 0) < vm_config.max_terminals_per_vm,
                "last_check": vm_status.vm_last_health_check.get(vm_url, 0)
            } for vm_url in vm_config.vm_servers
        },
        "timestamp": datetime.now().isoformat()
    }

@api_router.post("/accounts")
async def create_account_distributed(request: AccountCreateRequest):
    """Create account on the VM with least terminals or queue if no VMs available"""
    try:
        logger.info(f"Received account creation request for login: {request.login}")
        
        # Log current VM terminal distribution before selection
        logger.info("Current VM terminal distribution:")
        for vm_url in vm_config.vm_servers:
            terminal_count = vm_status.vm_terminal_counts.get(vm_url, 0)
            status = vm_status.vm_status.get(vm_url, "unknown")
            logger.info(f"  {vm_url}: {terminal_count} terminals ({status})")
        
        # Get best VM for account creation (VM with least terminals)
        best_vm = vm_status.get_best_vm()
        
        if best_vm:
            # VM is available, try to create account directly
            logger.info(f"VM {best_vm} is available, creating account directly")
            try:
                return await create_account_on_specific_vm(request, best_vm)
            except HTTPException as e:
                if e.status_code == 503:  # VM is busy
                    logger.info(f"VM {best_vm} is busy, adding account creation to queue for login: {request.login}")
                    # Fall through to queue logic
                else:
                    raise
            except Exception as e:
                logger.error(f"Error creating account on VM {best_vm}: {e}")
                # Fall through to queue logic
        
        # No VMs available or all VMs busy, add to queue
        logger.info(f"No VMs available or all VMs busy, adding account creation to queue for login: {request.login}")
        
        # Generate account_id for tracking (consistent with VM)
        account_id = f"{request.user_id or 1}"
        
        # Add to queue tracking using account_id
        queued_accounts.add(account_id)
        logger.info(f"Added account {account_id} to queue tracking")
        
        # Create a future to get the result
        future = asyncio.Future()
        
        # Add to queue for background processing
        await account_creation_queue.put((request, future))
        
        # Wait for the result (with timeout)
        try:
            result = await asyncio.wait_for(future, timeout=600)  # 10 minutes timeout
            logger.info(f"Queued account creation completed successfully for login: {request.login}")
            return result
        except asyncio.TimeoutError:
            logger.error(f"Queued account creation timed out for login: {request.login}")
            # Remove from queue tracking on timeout
            if account_id in queued_accounts:
                queued_accounts.remove(account_id)
            # Remove from being created tracking on timeout
            if account_id in accounts_being_created:
                accounts_being_created.remove(account_id)
            raise HTTPException(status_code=504, detail="Account creation timed out in queue")
        except Exception as e:
            logger.error(f"Queued account creation failed for login {request.login}: {e}")
            # Remove from queue tracking on error
            if account_id in queued_accounts:
                queued_accounts.remove(account_id)
            # Remove from being created tracking on error
            if account_id in accounts_being_created:
                accounts_being_created.remove(account_id)
            if isinstance(e, HTTPException):
                raise
            else:
                raise HTTPException(status_code=500, detail=f"Queued account creation failed: {str(e)}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in distributed account creation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/accounts")
async def get_accounts_distributed(account_ids: Optional[str] = None):
    """Get accounts from all VMs"""
    try:
        logger.info("Getting accounts from all VMs")
        
        all_accounts = []
        vm_accounts = {}
        
        # Get accounts from each healthy VM
        for vm_url in vm_config.vm_servers:
            if vm_status.vm_status.get(vm_url) == "healthy":
                try:
                    async with aiohttp.ClientSession() as session:
                        url = f"{vm_url}/api/accounts"
                        if account_ids:
                            url += f"?account_ids={account_ids}"
                        
                        async with session.get(url, timeout=30) as response:
                            if response.status == 200:
                                result = await response.json()
                                accounts = result.get("accounts", [])
                                vm_accounts[vm_url] = accounts
                                all_accounts.extend(accounts)
                                logger.info(f"Got {len(accounts)} accounts from VM {vm_url}")
                            else:
                                logger.warning(f"VM {vm_url} returned {response.status}")
                except Exception as e:
                    logger.warning(f"Error getting accounts from VM {vm_url}: {e}")
        
        return {
            "success": True,
            "total_accounts": len(all_accounts),
            "accounts": all_accounts,
            "vm_breakdown": vm_accounts
        }
        
    except Exception as e:
        logger.error(f"Error getting distributed accounts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/accounts/{account_id}")
async def get_account_distributed(account_id: str, action: Optional[str] = None):
    """Get a single account by ID with comprehensive terminal management - distributed"""
    try:
        logger.info(f"Getting account {account_id} with action: {action}")
        
        # Find which VM has this account
        account_vm = None
        for vm_url in vm_config.vm_servers:
            if vm_status.vm_status.get(vm_url) == "healthy":
                try:
                    async with aiohttp.ClientSession() as session:
                        url = f"{vm_url}/api/accounts/{account_id}"
                        if action:
                            url += f"?action={action}"
                        
                        async with session.get(url, timeout=30) as response:
                            if response.status == 200:
                                result = await response.json()
                                account_vm = vm_url
                                logger.info(f"Found account {account_id} on VM {vm_url}")
                                return result
                except Exception as e:
                    logger.warning(f"Error checking VM {vm_url} for account {account_id}: {e}")
        
        if not account_vm:
            raise HTTPException(status_code=404, detail=f"Account {account_id} not found on any VM")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting account {account_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/accounts/search")
async def account_exists_distributed(login: str):
    """Check if an account exists by login - distributed"""
    try:
        logger.info(f"Searching for account with login: {login}")
        
        # Search all VMs for this account
        for vm_url in vm_config.vm_servers:
            if vm_status.vm_status.get(vm_url) == "healthy":
                try:
                    async with aiohttp.ClientSession() as session:
                        url = f"{vm_url}/api/accounts/search?login={login}"
                        async with session.get(url, timeout=30) as response:
                            if response.status == 200:
                                result = await response.json()
                                if result.get("account_id") != "0":
                                    logger.info(f"Found account {login} on VM {vm_url}")
                                    return result
                except Exception as e:
                    logger.warning(f"Error searching VM {vm_url} for login {login}: {e}")
        
        # Account not found on any VM
        return {
            "success": True,
            "account_id": "0"
        }
        
    except Exception as e:
        logger.error(f"Error searching for account {login}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/accounts/{account_id}")
async def update_account_distributed(account_id: str, request: AccountUpdateRequest):
    """Update account - distributed"""
    try:
        logger.info(f"Updating account {account_id}")
        
        # First, try to find the VM using our mapping
        account_vm = vm_status.get_vm_for_account(account_id)
        logger.info(f"Account mapping lookup result: {account_vm}")
        
        # If we have a mapped VM, try it first with extended waiting
        if account_vm and vm_status.vm_status.get(account_vm) == "healthy":
            logger.info(f"Found account {account_id} on mapped VM {account_vm}")
            
            # Try the mapped VM with extended retry logic (up to 2 minutes)
            for retry_attempt in range(12):  # 12 attempts with progressive waiting
                try:
                    async with aiohttp.ClientSession() as session:
                        url = f"{account_vm}/api/accounts/{account_id}"
                        logger.info(f"Making update request to {url} (attempt {retry_attempt + 1})")
                        
                        vm_request_data = {
                            "name": request.name,
                            "status": request.status,
                            "groupid": request.groupid,
                            "version": request.version,
                            "state": request.state
                        }
                        logger.info(f"Sending PUT request data: {vm_request_data}")
                        
                        async with session.put(url, json=vm_request_data, timeout=30) as response:
                            logger.info(f"VM {account_vm} returned status {response.status}")
                            if response.status == 200:
                                result = await response.json()
                                # Check if the response indicates server busy
                                if result.get("success") == False and result.get("error_code") == "SERVER_BUSY":
                                    busy_duration = result.get("duration", 0)
                                    wait_time = min(5 + (retry_attempt * 2), 15)  # Progressive: 5s, 7s, 9s, 11s, 13s, 15s...
                                    logger.warning(f"VM {account_vm} is busy for account {account_id} (duration: {busy_duration}s), waiting {wait_time}s")
                                    await asyncio.sleep(wait_time)
                                    continue
                                else:
                                    logger.info(f"Successfully updated account {account_id} on VM {account_vm}")
                                    return result
                            elif response.status == 404:
                                logger.warning(f"Account {account_id} not found on mapped VM {account_vm}")
                                break  # Account not on this VM, search others
                            else:
                                response_text = await response.text()
                                logger.warning(f"VM {account_vm} returned {response.status} for update: {response_text}")
                                break
                except Exception as e:
                    logger.warning(f"Error updating account on VM {account_vm}: {e}")
                    break
            
            logger.info(f"Exhausted retries for mapped VM {account_vm}, searching other VMs")
        
        # Search all VMs with retry logic for SERVER_BUSY
        logger.info(f"Searching all VMs for account {account_id}")
        
        for attempt in range(3):  # Retry up to 3 times for race conditions
            for vm_url in vm_config.vm_servers:
                vm_health = vm_status.vm_status.get(vm_url)
                logger.info(f"Checking VM {vm_url} (health: {vm_health})")
                
                if vm_health == "healthy":
                    try:
                        async with aiohttp.ClientSession() as session:
                            url = f"{vm_url}/api/accounts/{account_id}"
                            logger.info(f"Making update request to {url} (attempt {attempt + 1})")
                            
                            vm_request_data = {
                                "name": request.name,
                                "status": request.status,
                                "groupid": request.groupid,
                                "version": request.version,
                                "state": request.state
                            }
                            logger.info(f"Sending PUT request data: {vm_request_data}")
                            
                            async with session.put(url, json=vm_request_data, timeout=30) as response:
                                logger.info(f"VM {vm_url} returned status {response.status}")
                                if response.status == 200:
                                    result = await response.json()
                                    # Check if the response indicates server busy
                                    if result.get("success") == False and result.get("error_code") == "SERVER_BUSY":
                                        busy_duration = result.get("duration", 0)
                                        logger.warning(f"VM {vm_url} is busy for account {account_id} (duration: {busy_duration}s)")
                                        continue  # Try next VM (don't retry for all-VM search)
                                    else:
                                        # Map the account to this VM for future requests
                                        vm_status.map_account_to_vm(account_id, vm_url)
                                        logger.info(f"Successfully updated account {account_id} on VM {vm_url}")
                                        return result
                                elif response.status == 404:
                                    logger.warning(f"Account {account_id} not found on VM {vm_url}")
                                    continue  # Try next VM
                                else:
                                    response_text = await response.text()
                                    logger.warning(f"VM {vm_url} returned {response.status} for update: {response_text}")
                                    continue  # Try next VM
                    except Exception as e:
                        logger.warning(f"Error updating account on VM {vm_url}: {e}")
                        continue  # Try next VM
            
            # If we get here, all VMs returned 404 or errors
            if attempt < 2:  # Not the last attempt
                logger.info(f"All VMs returned errors for account {account_id}, retrying in 0.5s")
                await asyncio.sleep(0.5)
            else:
                logger.error(f"Account {account_id} not found on any VM after all retries")
                raise HTTPException(status_code=404, detail=f"Account {account_id} not found on any VM")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating account {account_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/accounts/{account_id}")
async def delete_account_distributed(account_id: str):
    """Delete account and clean up all associated resources - distributed"""
    try:
        logger.info(f"Deleting account {account_id}")
        
        # First, try to find the VM using our mapping
        account_vm = vm_status.get_vm_for_account(account_id)
        logger.info(f"Account mapping lookup result: {account_vm}")
        
        # If we have a mapped VM, try it first with extended waiting
        if account_vm and vm_status.vm_status.get(account_vm) == "healthy":
            logger.info(f"Found account {account_id} on mapped VM {account_vm}")
            
            # Try the mapped VM with extended retry logic (up to 2 minutes)
            for retry_attempt in range(12):  # 12 attempts with progressive waiting
                try:
                    async with aiohttp.ClientSession() as session:
                        url = f"{account_vm}/api/accounts/{account_id}"
                        logger.info(f"Making delete request to {url} (attempt {retry_attempt + 1})")
                        async with session.delete(url, timeout=30) as response:
                            logger.info(f"VM {account_vm} returned status {response.status}")
                            if response.status == 200:
                                result = await response.json()
                                # Check if the response indicates server busy
                                if result.get("success") == False and result.get("error_code") == "SERVER_BUSY":
                                    busy_duration = result.get("duration", 0)
                                    wait_time = min(5 + (retry_attempt * 2), 15)  # Progressive: 5s, 7s, 9s, 11s, 13s, 15s...
                                    logger.warning(f"VM {account_vm} is busy for account {account_id} (duration: {busy_duration}s), waiting {wait_time}s")
                                    await asyncio.sleep(wait_time)
                                    continue
                                else:
                                    logger.info(f"Successfully deleted account {account_id} on VM {account_vm}")
                                    
                                    # Clean up mappings and decrement terminal count
                                    vm_status.remove_account_mapping(account_id)
                                    vm_status.decrement_vm_terminal_count(account_vm)
                                    logger.info(f"Cleaned up mappings for account {account_id}")
                                    
                                    return result
                            elif response.status == 404:
                                logger.warning(f"Account {account_id} not found on mapped VM {account_vm}")
                                break  # Account not on this VM, search others
                            else:
                                response_text = await response.text()
                                logger.warning(f"VM {account_vm} returned {response.status} for delete: {response_text}")
                                break
                except Exception as e:
                    logger.warning(f"Error deleting account on VM {account_vm}: {e}")
                    break
            
            logger.info(f"Exhausted retries for mapped VM {account_vm}, searching other VMs")
        
        # Search all VMs with retry logic for race conditions
        logger.info(f"Searching all VMs for account {account_id}")
        
        for attempt in range(3):  # Retry up to 3 times for race conditions
            for vm_url in vm_config.vm_servers:
                vm_health = vm_status.vm_status.get(vm_url)
                logger.info(f"Checking VM {vm_url} (health: {vm_health})")
                
                if vm_health == "healthy":
                    try:
                        async with aiohttp.ClientSession() as session:
                            url = f"{vm_url}/api/accounts/{account_id}"
                            logger.info(f"Making delete request to {url} (attempt {attempt + 1})")
                            async with session.delete(url, timeout=30) as response:
                                logger.info(f"VM {vm_url} returned status {response.status}")
                                if response.status == 200:
                                    result = await response.json()
                                    # Check if the response indicates server busy
                                    if result.get("success") == False and result.get("error_code") == "SERVER_BUSY":
                                        busy_duration = result.get("duration", 0)
                                        logger.warning(f"VM {vm_url} is busy for account {account_id} (duration: {busy_duration}s)")
                                        continue  # Try next VM (don't retry for all-VM search)
                                    else:
                                        logger.info(f"Successfully deleted account {account_id} on VM {vm_url}")
                                        
                                        # Clean up mappings and decrement terminal count
                                        vm_status.remove_account_mapping(account_id)
                                        vm_status.decrement_vm_terminal_count(vm_url)
                                        logger.info(f"Cleaned up mappings for account {account_id}")
                                        
                                        return result
                                elif response.status == 404:
                                    logger.warning(f"Account {account_id} not found on VM {vm_url}")
                                    continue  # Try next VM
                                else:
                                    response_text = await response.text()
                                    logger.warning(f"VM {vm_url} returned {response.status} for delete: {response_text}")
                                    continue  # Try next VM
                    except Exception as e:
                        logger.warning(f"Error deleting account on VM {vm_url}: {e}")
                        continue  # Try next VM
            
            # If we get here, all VMs returned 404 or errors
            if attempt < 2:  # Not the last attempt
                logger.info(f"All VMs returned errors for account {account_id}, retrying in 0.5s")
                await asyncio.sleep(0.5)
            else:
                logger.error(f"Account {account_id} not found on any VM after all retries")
                raise HTTPException(status_code=404, detail=f"Account {account_id} not found on any VM")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting account {account_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time EA data communication - distributed"""
    await websocket_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                if message.get("type") == "subscribe_account":
                    account_id = message.get("account_id")
                    if account_id:
                        websocket_manager.disconnect(websocket)
                        await websocket_manager.connect(websocket, account_id)
                        await websocket_manager.send_personal_message(
                            json.dumps({
                                "type": "subscription_confirmed",
                                "account_id": account_id,
                                "message": f"Subscribed to account {account_id} updates"
                            }),
                            websocket
                        )
                elif message.get("type") == "ping":
                    await websocket_manager.send_personal_message(
                        json.dumps({"type": "pong", "timestamp": datetime.now().isoformat()}),
                        websocket
                    )
                else:
                    await websocket_manager.send_personal_message(
                        json.dumps({
                            "type": "error",
                            "message": "Unknown message type"
                        }),
                        websocket
                    )
            except json.JSONDecodeError:
                await websocket_manager.send_personal_message(
                    json.dumps({
                        "type": "error",
                        "message": "Invalid JSON format"
                    }),
                    websocket
                )
    except WebSocketDisconnect:
        websocket_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        websocket_manager.disconnect(websocket)

@api_router.websocket("/ws/{account_id}")
async def websocket_account_endpoint(websocket: WebSocket, account_id: str):
    """WebSocket endpoint for specific account real-time data - distributed"""
    await websocket_manager.connect(websocket, account_id)
    try:
        # Try to get account data from any VM
        account_data = None
        for vm_url in vm_config.vm_servers:
            if vm_status.vm_status.get(vm_url) == "healthy":
                try:
                    async with aiohttp.ClientSession() as session:
                        url = f"{vm_url}/api/accounts/{account_id}"
                        async with session.get(url, timeout=30) as response:
                            if response.status == 200:
                                result = await response.json()
                                account_data = result
                                break
                except Exception as e:
                    logger.warning(f"Error getting account data from VM {vm_url}: {e}")
        
        if account_data:
            await websocket_manager.send_personal_message(
                json.dumps({
                    "type": "account_data",
                    "account_id": account_id,
                    "data": account_data
                }),
                websocket
            )
        else:
            await websocket_manager.send_personal_message(
                json.dumps({
                    "type": "error",
                    "message": f"Account {account_id} not found on any VM"
                }),
                websocket
            )
        
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                if message.get("type") == "ping":
                    await websocket_manager.send_personal_message(
                        json.dumps({
                            "type": "pong",
                            "account_id": account_id,
                            "timestamp": datetime.now().isoformat()
                        }),
                        websocket
                    )
            except json.JSONDecodeError:
                await websocket_manager.send_personal_message(
                    json.dumps({
                        "type": "error",
                        "message": "Invalid JSON format"
                    }),
                    websocket
                )
    except WebSocketDisconnect:
        websocket_manager.disconnect(websocket, account_id)
    except Exception as e:
        logger.error(f"WebSocket error for account {account_id}: {e}")
        websocket_manager.disconnect(websocket, account_id)

@api_router.get("/health-check")
async def manual_health_check():
    """Manually trigger health check of all VMs"""
    try:
        logger.info("Manual health check triggered")
        await health_check_all_vms()
        return {
            "success": True,
            "message": "Health check completed",
            "available_vms": len(vm_status.get_available_vms()),
            "total_vms": len(vm_config.vm_servers)
        }
    except Exception as e:
        logger.error(f"Error in manual health check: {e}")
        return {
            "success": False,
            "message": f"Health check failed: {str(e)}"
        }

@api_router.get("/terminals/count")
async def get_distributed_terminal_count():
    """Get terminal count from all VMs"""
    try:
        logger.info("Getting terminal count from all VMs")
        
        vm_terminals = {}
        total_terminals = 0
        
        for vm_url in vm_config.vm_servers:
            try:
                async with aiohttp.ClientSession() as session:
                    # Try the dedicated terminal count endpoint first
                    async with session.get(f"{vm_url}/api/terminals/count", timeout=10) as response:
                        if response.status == 200:
                            data = await response.json()
                            terminal_count = data.get("current_terminals", 0)
                            vm_terminals[vm_url] = {
                                "terminals": terminal_count,
                                "max_terminals": data.get("max_terminals", 30),
                                "can_launch_more": data.get("can_launch_more", True),
                                "status": "healthy"
                            }
                            total_terminals += terminal_count
                            logger.info(f"VM {vm_url}: {terminal_count} terminals")
                        else:
                            vm_terminals[vm_url] = {
                                "terminals": 0,
                                "max_terminals": 30,
                                "can_launch_more": False,
                                "status": "unhealthy",
                                "error": f"HTTP {response.status}"
                            }
            except Exception as e:
                vm_terminals[vm_url] = {
                    "terminals": 0,
                    "max_terminals": 30,
                    "can_launch_more": False,
                    "status": "unhealthy",
                    "error": str(e)
                }
                logger.warning(f"Error getting terminal count from VM {vm_url}: {e}")
        
        return {
            "success": True,
            "total_terminals": total_terminals,
            "total_max_terminals": len(vm_config.vm_servers) * vm_config.max_terminals_per_vm,
            "available_slots": (len(vm_config.vm_servers) * vm_config.max_terminals_per_vm) - total_terminals,
            "vm_terminals": vm_terminals,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting distributed terminal count: {e}")
        return {
            "success": False,
            "error": str(e),
            "total_terminals": 0,
            "timestamp": datetime.now().isoformat()
        }

@api_router.get("/load-balance-test")
async def test_load_balancing():
    """Test endpoint to show current load balancing state"""
    try:
        logger.info("Load balancing test requested")
        
        # Get current VM status
        vm_status_info = {}
        for vm_url in vm_config.vm_servers:
            terminal_count = vm_status.vm_terminal_counts.get(vm_url, 0)
            status = vm_status.vm_status.get(vm_url, "unknown")
            vm_status_info[vm_url] = {
                "terminals": terminal_count,
                "status": status,
                "max_terminals": vm_config.max_terminals_per_vm,
                "available": terminal_count < vm_config.max_terminals_per_vm
            }
        
        # Get best VM for next account
        best_vm = vm_status.get_best_vm()
        
        return {
            "success": True,
            "current_distribution": vm_status_info,
            "best_vm_for_next_account": best_vm,
            "load_balancing_algorithm": "least_terminals_first",
            "expected_pattern": "VM1->1, VM2->1, VM1->2, VM2->2, VM1->3, VM2->3, ...",
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error in load balance test: {e}")
        return {
            "success": False,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@api_router.get("/vm-debug")
async def debug_vm_responses():
    """Debug endpoint to test what each VM is actually returning"""
    try:
        logger.info("VM debug test requested")
        
        vm_debug_info = {}
        
        for vm_url in vm_config.vm_servers:
            try:
                async with aiohttp.ClientSession() as session:
                    vm_debug_info[vm_url] = {}
                    
                    # Test status endpoint
                    try:
                        async with session.get(f"{vm_url}/api/status", timeout=10) as response:
                            if response.status == 200:
                                status_data = await response.json()
                                vm_debug_info[vm_url]["status_endpoint"] = {
                                    "success": True,
                                    "data": status_data,
                                    "current_terminals": status_data.get("current_terminals", "not_found")
                                }
                            else:
                                vm_debug_info[vm_url]["status_endpoint"] = {
                                    "success": False,
                                    "error": f"HTTP {response.status}"
                                }
                    except Exception as e:
                        vm_debug_info[vm_url]["status_endpoint"] = {
                            "success": False,
                            "error": str(e)
                        }
                    
                    # Test terminals/count endpoint
                    try:
                        async with session.get(f"{vm_url}/api/terminals/count", timeout=10) as response:
                            if response.status == 200:
                                count_data = await response.json()
                                vm_debug_info[vm_url]["terminals_count_endpoint"] = {
                                    "success": True,
                                    "data": count_data,
                                    "current_terminals": count_data.get("current_terminals", "not_found")
                                }
                            else:
                                vm_debug_info[vm_url]["terminals_count_endpoint"] = {
                                    "success": False,
                                    "error": f"HTTP {response.status}"
                                }
                    except Exception as e:
                        vm_debug_info[vm_url]["terminals_count_endpoint"] = {
                            "success": False,
                            "error": str(e)
                        }
                    
                    # Test terminals/debug endpoint
                    try:
                        async with session.get(f"{vm_url}/api/terminals/debug", timeout=10) as response:
                            if response.status == 200:
                                debug_data = await response.json()
                                vm_debug_info[vm_url]["terminals_debug_endpoint"] = {
                                    "success": True,
                                    "data": debug_data
                                }
                            else:
                                vm_debug_info[vm_url]["terminals_debug_endpoint"] = {
                                    "success": False,
                                    "error": f"HTTP {response.status}"
                                }
                    except Exception as e:
                        vm_debug_info[vm_url]["terminals_debug_endpoint"] = {
                            "success": False,
                            "error": str(e)
                        }
                        
            except Exception as e:
                vm_debug_info[vm_url] = {
                    "error": f"Failed to connect to VM: {str(e)}"
                }
        
        return {
            "success": True,
            "vm_debug_info": vm_debug_info,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error in VM debug test: {e}")
        return {
            "success": False,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@api_router.post("/clear-cache")
async def clear_router_cache():
    """Clear all cached data in the router (account mappings, login mappings, etc.)"""
    try:
        logger.info("Clearing router cache - resetting all mappings")
        
        # Clear account mappings
        vm_status.account_to_vm_mapping.clear()
        vm_status.login_to_vm_mapping.clear()
        
        # Clear being_created set
        async with logins_creation_lock:
            logins_being_created.clear()
            logins_creation_timestamps.clear()
        
        # Reset VM terminal counts
        for vm_url in vm_config.vm_servers:
            vm_status.vm_terminal_counts[vm_url] = 0
        
        logger.info("Router cache cleared successfully")
        
        return {
            "success": True,
            "message": "Router cache cleared successfully",
            "cleared_mappings": "all",
            "cleared_being_created": len(logins_being_created),
            "reset_vm_counts": len(vm_config.vm_servers)
        }
    except Exception as e:
        logger.error(f"Error clearing router cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/force-sync")
async def force_vm_sync():
    """Force a complete VM synchronization to refresh all mappings"""
    try:
        logger.info("Forcing complete VM synchronization")
        
        # Clear existing mappings first
        vm_status.account_to_vm_mapping.clear()
        vm_status.login_to_vm_mapping.clear()
        
        # Force sync all VMs
        total_mappings = await vm_synchronizer.sync_all_vms()
        
        logger.info(f"Force sync completed with {total_mappings} mappings")
        
        return {
            "success": True,
            "message": "Force VM synchronization completed",
            "total_mappings": total_mappings,
            "account_mappings": len(vm_status.account_to_vm_mapping),
            "login_mappings": len(vm_status.login_to_vm_mapping)
        }
    except Exception as e:
        logger.error(f"Error during force sync: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/queue-status")
async def get_queue_status():
    """Get the current status of the account creation queue"""
    try:
        return {
            "success": True,
            "queue_size": account_creation_queue.qsize(),
            "queue_processing": queue_processing_task is not None and not queue_processing_task.done(),
            "available_vms": len(vm_status.get_available_vms()),
            "total_vms": len(vm_config.vm_servers),
            "vm_status": {
                vm_url: {
                    "status": vm_status.vm_status.get(vm_url, "unknown"),
                    "terminals": vm_status.vm_terminal_counts.get(vm_url, 0),
                    "max_terminals": vm_config.max_terminals_per_vm,
                    "available": vm_status.vm_terminal_counts.get(vm_url, 0) < vm_config.max_terminals_per_vm
                } for vm_url in vm_config.vm_servers
            },
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting queue status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/detail/{account_id}")
async def get_account_detail_distributed(account_id: str):
    """Get account details by ID - distributed"""
    try:
        logger.info(f"Getting account details for account_id: {account_id}")
        
        # First, try to find the VM using our mapping
        account_vm = vm_status.get_vm_for_account(account_id)
        logger.info(f"Account mapping lookup result: {account_vm}")
        
        # If we have a mapped VM, try it first with extended waiting
        if account_vm and vm_status.vm_status.get(account_vm) == "healthy":
            logger.info(f"Found account {account_id} on mapped VM {account_vm}")
            
            # Try the mapped VM with extended retry logic (up to 2 minutes)
            for retry_attempt in range(12):  # 12 attempts with progressive waiting
                try:
                    async with aiohttp.ClientSession() as session:
                        url = f"{account_vm}/api/detail/{account_id}"
                        logger.info(f"Making request to {url} (attempt {retry_attempt + 1})")
                        async with session.get(url, timeout=30) as response:
                            logger.info(f"VM {account_vm} returned status {response.status}")
                            if response.status == 200:
                                result = await response.json()
                                logger.info(f"VM {account_vm} returned result: {result}")
                                # Only return if we actually found the account
                                if result.get("success") and result.get("account"):
                                    return result
                                elif result.get("success") == False and result.get("error_code") == "SERVER_BUSY":
                                    busy_duration = result.get("duration", 0)
                                    wait_time = min(5 + (retry_attempt * 2), 15)  # Progressive: 5s, 7s, 9s, 11s, 13s, 15s...
                                    logger.warning(f"VM {account_vm} is busy for account {account_id} (duration: {busy_duration}s), waiting {wait_time}s")
                                    await asyncio.sleep(wait_time)
                                    continue
                                else:
                                    logger.warning(f"VM {account_vm} returned success but no account data, continuing search")
                                    break
                            else:
                                response_text = await response.text()
                                logger.warning(f"VM {account_vm} returned {response.status} for account detail: {response_text}")
                                break
                except Exception as e:
                    logger.warning(f"Error getting account detail from VM {account_vm}: {e}")
                    break
            
            logger.info(f"Exhausted retries for mapped VM {account_vm}, searching other VMs")
        
        # Search all VMs with shorter retry logic for when all VMs are busy
        logger.info(f"Searching all VMs for account {account_id}")
        
        for retry_attempt in range(3):  # Try up to 3 times for all-VM search
            logger.info(f"All-VM search attempt {retry_attempt + 1} for account {account_id}")
            
            all_vms_busy = True  # Track if all VMs are busy
            
            for vm_url in vm_config.vm_servers:
                vm_health = vm_status.vm_status.get(vm_url)
                logger.info(f"Checking VM {vm_url} (health: {vm_health})")
                
                if vm_health == "healthy":
                    try:
                        async with aiohttp.ClientSession() as session:
                            url = f"{vm_url}/api/detail/{account_id}"
                            logger.info(f"Making request to {url}")
                            async with session.get(url, timeout=30) as response:
                                logger.info(f"VM {vm_url} returned status {response.status}")
                                if response.status == 200:
                                    result = await response.json()
                                    logger.info(f"VM {vm_url} returned result: {result}")
                                    # Only return if we actually found the account
                                    if result.get("success") and result.get("account"):
                                        # Map the account to this VM for future requests
                                        vm_status.map_account_to_vm(account_id, vm_url)
                                        logger.info(f"Mapped account {account_id} to VM {vm_url}")
                                        return result
                                    elif result.get("success") == False and result.get("error_code") == "SERVER_BUSY":
                                        busy_duration = result.get("duration", 0)
                                        logger.warning(f"VM {vm_url} is busy for account {account_id} (duration: {busy_duration}s)")
                                        # Continue searching other VMs (don't retry for GET requests)
                                    else:
                                        logger.warning(f"VM {vm_url} returned success but no account data, continuing search")
                                        all_vms_busy = False  # At least one VM responded (not busy)
                                else:
                                    response_text = await response.text()
                                    logger.warning(f"VM {vm_url} returned {response.status} for account detail: {response_text}")
                                    all_vms_busy = False  # At least one VM responded (not busy)
                    except Exception as e:
                        logger.warning(f"Error checking VM {vm_url} for account {account_id}: {e}")
                        all_vms_busy = False  # At least one VM responded (not busy)
            
            # If all VMs were busy and this is not the last retry attempt, wait and retry
            if all_vms_busy and retry_attempt < 2:
                wait_time = 2 + retry_attempt  # Wait 2s, then 3s, then 4s
                logger.info(f"All VMs were busy for account {account_id}, waiting {wait_time}s before retry")
                await asyncio.sleep(wait_time)
                continue
            elif all_vms_busy:
                logger.error(f"All VMs were busy for account {account_id} after all retry attempts")
                break
            else:
                # At least one VM responded (not busy), so account truly not found
                break
        
        # Account not found on any VM
        logger.error(f"Account {account_id} not found on any VM")
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found on any VM")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting account detail {account_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/detail/status/{account_id}")
async def get_account_creation_status_distributed(account_id: str):
    """Get the creation status for an account - distributed"""
    try:
        logger.info(f"Getting creation status for account {account_id}")
        
        # Step 1: Check if account_id is in queue (for backward compatibility)
        if account_id in queued_accounts:
            logger.info(f"Account {account_id} is in queue - returning 0% progress")
            return {
                "success": True,
                "status": "creating",
                "message": "Account creation request queued - waiting for available VM",
                "progress": 0,
                "step": "queued",
                "step_description": "Account creation request queued - waiting for available VM",
                "start_time": datetime.now().isoformat(),
                "last_update": datetime.now().isoformat(),
                "estimated_completion": None,
                "steps_completed": []
            }
        
        # Step 2: ALWAYS check ALL VMs first for real-time status (prioritize actual VM status over cached mapping)
        logger.info(f"Account {account_id} not in queue, checking ALL VMs for real-time status")
        
        # Helper function to get status from a specific VM
        async def get_status_from_vm(vm_url: str, account_id: str):
            try:
                async with aiohttp.ClientSession() as session:
                    # First check if account actually exists on this VM
                    detail_url = f"{vm_url}/api/detail/{account_id}"
                    async with session.get(detail_url, timeout=30) as detail_response:
                        if detail_response.status == 200:
                            detail_data = await detail_response.json()
                            if not detail_data.get("success") or not detail_data.get("account"):
                                logger.info(f"Account {account_id} not found on VM {vm_url}")
                                return None
                        else:
                            logger.info(f"Account {account_id} not found on VM {vm_url} (status: {detail_response.status})")
                            return None
                    
                    # If account exists, get its status
                    url = f"{vm_url}/api/detail/status/{account_id}"
                    async with session.get(url, timeout=30) as response:
                        if response.status == 200:
                            result = await response.json()
                            logger.info(f"VM {vm_url} returned status: {result.get('progress', 'unknown')}% for account {account_id}")
                            return result
                        elif response.status == 503:  # SERVER_BUSY
                            logger.info(f"VM {vm_url} is busy for account {account_id}, will retry once")
                            await asyncio.sleep(2)
                            async with session.get(url, timeout=30) as retry_response:
                                if retry_response.status == 200:
                                    result = await retry_response.json()
                                    logger.info(f"VM {vm_url} retry returned status: {result.get('progress', 'unknown')}% for account {account_id}")
                                    return result
                                else:
                                    logger.warning(f"VM {vm_url} retry failed for account {account_id}: {retry_response.status}")
                                    return None
                        else:
                            logger.warning(f"VM {vm_url} returned {response.status} for account {account_id}")
                            return None
            except Exception as e:
                logger.warning(f"Error getting status from VM {vm_url} for account {account_id}: {e}")
                return None
        
        # Check ALL VMs for the account status (prioritize real-time data over cached mapping)
        found_vm = None
        found_result = None
        
        # First check the mapped VM (if any) to see if it still has the account
        account_vm = vm_status.get_vm_for_account(account_id)
        if account_vm and vm_status.vm_status.get(account_vm) == "healthy":
            logger.info(f"Checking mapped VM {account_vm} first for account {account_id}")
            result = await get_status_from_vm(account_vm, account_id)
            if result:
                found_vm = account_vm
                found_result = result
                logger.info(f"Account {account_id} still exists on mapped VM {account_vm}")
        
        # If mapped VM doesn't have the account, check ALL other VMs
        if not found_result:
            logger.info(f"Account {account_id} not found on mapped VM, checking ALL VMs")
            for vm_url in vm_config.vm_servers:
                if vm_url != account_vm and vm_status.vm_status.get(vm_url) == "healthy":  # Skip mapped VM since we already checked it
                    logger.info(f"Checking VM {vm_url} for account {account_id}")
                    result = await get_status_from_vm(vm_url, account_id)
                    if result:
                        found_vm = vm_url
                        found_result = result
                        logger.info(f"Found account {account_id} on VM {vm_url} with status: {result.get('progress', 'unknown')}%")
                        break  # Found the account, no need to check other VMs
        
        # If we found the account on a VM, update the mapping and return the status
        if found_vm and found_result:
            vm_status.map_account_to_vm(account_id, found_vm)
            logger.info(f"Updated account {account_id} mapping to VM {found_vm}")
            return found_result
        
        # Step 4: Check if account is being created (only if not found on any VM)
        if account_id in accounts_being_created:
            logger.info(f"Account {account_id} is being created - returning 10% progress")
            return {
                "success": True,
                "status": "creating",
                "message": "Account creation in progress - initializing",
                "progress": 10,
                "step": "initializing",
                "step_description": "Account creation in progress - initializing",
                "start_time": datetime.now().isoformat(),
                "last_update": datetime.now().isoformat(),
                "estimated_completion": None,
                "steps_completed": []
            }
        
        # Step 5: Search by login (if account_id is actually a login)
        logger.info(f"Searching all VMs by login {account_id}")
        for vm_url in vm_config.vm_servers:
            if vm_status.vm_status.get(vm_url) == "healthy":
                try:
                    async with aiohttp.ClientSession() as session:
                        # Search by login
                        search_url = f"{vm_url}/api/accounts/search?login={account_id}"
                        async with session.get(search_url, timeout=30) as search_response:
                            if search_response.status == 200:
                                search_data = await search_response.json()
                                if search_data.get("success") and search_data.get("account"):
                                    # Found account by login, get its status
                                    found_account_id = search_data["account"].get("account_id")
                                    if found_account_id:
                                        status_url = f"{vm_url}/api/detail/status/{found_account_id}"
                                        async with session.get(status_url, timeout=30) as status_response:
                                            if status_response.status == 200:
                                                result = await status_response.json()
                                                logger.info(f"VM {vm_url} returned status for login {account_id}: {result.get('progress', 'unknown')}%")
                                                # Map the account to this VM for future requests
                                                vm_status.map_account_to_vm(found_account_id, vm_url)
                                                vm_status.map_login_to_vm(account_id, vm_url)
                                                return result
                except Exception as e:
                    logger.warning(f"Error searching VM {vm_url} for login {account_id}: {e}")
        
        # Account not found on any VM and not in queue
        logger.info(f"Account {account_id} not found on any VM and not in queue")
        return {
            "success": False,
            "status": "not_found",
            "message": f"Account {account_id} not found and not being created",
            "error_code": "ACCOUNT_NOT_FOUND"
        }
        
    except Exception as e:
        logger.error(f"Error getting account creation status for {account_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/debug/accounts")
async def debug_accounts_on_vms():
    """Debug endpoint to see what accounts are on each VM"""
    try:
        vm_accounts = {}
        
        for vm_url in vm_config.vm_servers:
            vm_health = vm_status.vm_status.get(vm_url)
            logger.info(f"Checking accounts on VM {vm_url} (health: {vm_health})")
            
            if vm_health == "healthy":
                try:
                    async with aiohttp.ClientSession() as session:
                        url = f"{vm_url}/api/accounts"
                        async with session.get(url, timeout=30) as response:
                            if response.status == 200:
                                result = await response.json()
                                accounts = result.get("accounts", [])
                                vm_accounts[vm_url] = {
                                    "health": vm_health,
                                    "account_count": len(accounts),
                                    "accounts": accounts
                                }
                                logger.info(f"VM {vm_url} has {len(accounts)} accounts")
                            else:
                                vm_accounts[vm_url] = {
                                    "health": vm_health,
                                    "error": f"HTTP {response.status}"
                                }
                except Exception as e:
                    vm_accounts[vm_url] = {
                        "health": vm_health,
                        "error": str(e)
                    }
            else:
                vm_accounts[vm_url] = {
                    "health": vm_health,
                    "error": "VM not healthy"
                }
        
        return {
            "success": True,
            "vm_accounts": vm_accounts,
            "account_mappings": vm_status.account_to_vm_mapping,
            "login_mappings": vm_status.login_to_vm_mapping,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error in debug accounts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/ea-data")
async def receive_ea_data(request: EADataRequest):
    """Receive real-time EA data and forward to appropriate VM"""
    try:
        logger.info(f"Received EA data for account {request.account_id} from {request.source}")
        
        # Find the VM that has this account
        account_vm = vm_status.get_vm_for_account(request.account_id)
        
        if account_vm:
            logger.info(f"Forwarding EA data for account {request.account_id} to VM {account_vm}")
            
            try:
                async with aiohttp.ClientSession() as session:
                    url = f"{account_vm}/api/ea-data"
                    logger.info(f"Forwarding to {url}")
                    
                    # Forward the EA data to the VM
                    async with session.post(url, json=request.dict(), timeout=30) as response:
                        logger.info(f"VM {account_vm} returned status {response.status}")
                        if response.status == 200:
                            result = await response.json()
                            logger.info(f"Successfully forwarded EA data for account {request.account_id}")
                            return result
                        else:
                            response_text = await response.text()
                            logger.warning(f"VM {account_vm} returned {response.status} for EA data: {response_text}")
                            raise HTTPException(status_code=response.status, detail=f"VM returned {response.status}")
            except Exception as e:
                logger.error(f"Error forwarding EA data to VM {account_vm}: {e}")
                raise HTTPException(status_code=500, detail=f"Error forwarding to VM: {str(e)}")
        else:
            logger.warning(f"Account {request.account_id} not found in VM mapping, searching all VMs")
            
            # Search all VMs for the account
            for vm_url in vm_config.vm_servers:
                vm_health = vm_status.vm_status.get(vm_url)
                if vm_health == "healthy":
                    try:
                        async with aiohttp.ClientSession() as session:
                            url = f"{vm_url}/api/ea-data"
                            logger.info(f"Trying VM {vm_url} for account {request.account_id}")
                            
                            async with session.post(url, json=request.dict(), timeout=30) as response:
                                logger.info(f"VM {vm_url} returned status {response.status}")
                                if response.status == 200:
                                    result = await response.json()
                                    # Map the account to this VM for future requests
                                    vm_status.map_account_to_vm(request.account_id, vm_url)
                                    logger.info(f"Mapped account {request.account_id} to VM {vm_url}")
                                    logger.info(f"Successfully forwarded EA data for account {request.account_id}")
                                    return result
                                else:
                                    response_text = await response.text()
                                    logger.warning(f"VM {vm_url} returned {response.status} for EA data: {response_text}")
                                    continue  # Try next VM
                    except Exception as e:
                        logger.warning(f"Error forwarding EA data to VM {vm_url}: {e}")
                        continue  # Try next VM
            
            # If we get here, no VM accepted the EA data
            logger.error(f"No VM found for account {request.account_id}")
            raise HTTPException(status_code=404, detail=f"Account {request.account_id} not found on any VM")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing EA data for account {request.account_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/debug/queue-status")
async def debug_queue_status():
    """Debug endpoint to check queue status"""
    try:
        queue_size = account_creation_queue.qsize()
        return {
            "success": True,
            "queue_size": queue_size,
            "queued_accounts": list(queued_accounts),
            "queue_processing": queue_processing_task is not None and not queue_processing_task.done(),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting queue status: {e}")
        return {
            "success": False,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

# Forex News functionality
def get_forex_calendar_data() -> List[Dict[str, Any]]:
    """
    Fetch forex calendar data from ForexFactory and return as list of dictionaries
    """
    url = "https://www.forexfactory.com/calendar?week=this"
    
    scraper = cloudscraper.create_scraper()  # Bypasses Cloudflare
    response = scraper.get(url)
    
    if response.status_code != 200:
        raise HTTPException(status_code=500, detail=f"Failed to fetch data: {response.status_code}")
    
    soup = BeautifulSoup(response.text, 'lxml')
    table = soup.find('table', class_='calendar__table')
    
    if not table:
        raise HTTPException(status_code=404, detail="Calendar table not found")
    
    rows = table.find_all('tr', class_='calendar__row')
    data = []
    
    current_date = ''  # Track the current date
    for row in rows:
        date_cell = row.find('td', class_='calendar__date')
        if date_cell and date_cell.text.strip():  # If this row has a date
            current_date = date_cell.text.strip()  # Update current date
        date = current_date  # Use the current date for this row
        
        time = row.find('td', class_='calendar__time').text.strip() if row.find('td', class_='calendar__time') else ''
        currency = row.find('td', class_='calendar__currency').text.strip() if row.find('td', class_='calendar__currency') else ''
        
        # Extract impact from CSS class
        impact_span = row.find('td', class_='calendar__impact').find('span') if row.find('td', class_='calendar__impact') else None
        if impact_span and impact_span.get('class'):
            classes = impact_span.get('class')
            if 'icon--ff-impact-ora' in classes:
                impact = 'Medium'
            elif 'icon--ff-impact-gra' in classes:
                impact = 'Non-Economic'
            elif 'icon--ff-impact-yel' in classes:
                impact = 'Low'
            elif 'icon--ff-impact-red' in classes:
                impact = 'High'
            else:
                impact = ''
        else:
            impact = ''
            
        event = row.find('td', class_='calendar__event').text.strip() if row.find('td', class_='calendar__event') else ''
        actual = row.find('td', class_='calendar__actual').text.strip() if row.find('td', class_='calendar__actual') else ''
        forecast = row.find('td', class_='calendar__forecast').text.strip() if row.find('td', class_='calendar__forecast') else ''
        previous = row.find('td', class_='calendar__previous').text.strip() if row.find('td', class_='calendar__previous') else ''
        
        # Only add row if it has meaningful data (not all empty)
        if any([time, currency, impact, event, actual, forecast, previous]):
            data.append({
                'date': date,
                'time': time,
                'currency': currency,
                'impact': impact,
                'event': event,
                'actual': actual,
                'forecast': forecast,
                'previous': previous
            })
    
    return data

# Forex News functionality
def get_forex_calendar_data() -> List[Dict[str, Any]]:
    """
    Fetch forex calendar data from ForexFactory and return as list of dictionaries
    """
    url = "https://www.forexfactory.com/calendar?week=this"
    
    scraper = cloudscraper.create_scraper()  # Bypasses Cloudflare
    response = scraper.get(url)
    
    if response.status_code != 200:
        raise HTTPException(status_code=500, detail=f"Failed to fetch data: {response.status_code}")
    
    soup = BeautifulSoup(response.text, 'lxml')
    table = soup.find('table', class_='calendar__table')
    
    if not table:
        raise HTTPException(status_code=404, detail="Calendar table not found")
    
    rows = table.find_all('tr', class_='calendar__row')
    data = []
    
    current_date = ''  # Track the current date
    for row in rows:
        date_cell = row.find('td', class_='calendar__date')
        if date_cell and date_cell.text.strip():  # If this row has a date
            current_date = date_cell.text.strip()  # Update current date
        date = current_date  # Use the current date for this row
        
        time = row.find('td', class_='calendar__time').text.strip() if row.find('td', class_='calendar__time') else ''
        currency = row.find('td', class_='calendar__currency').text.strip() if row.find('td', class_='calendar__currency') else ''
        
            
        event = row.find('td', class_='calendar__event').text.strip() if row.find('td', class_='calendar__event') else ''
        actual = row.find('td', class_='calendar__actual').text.strip() if row.find('td', class_='calendar__actual') else ''
        forecast = row.find('td', class_='calendar__forecast').text.strip() if row.find('td', class_='calendar__forecast') else ''
        previous = row.find('td', class_='calendar__previous').text.strip() if row.find('td', class_='calendar__previous') else ''
        
        # Only add row if it has meaningful data (not all empty)
        if any([time, currency, event, actual, forecast, previous]):
            data.append({
                'date': date,
                'time': time,
                'currency': currency,
                'event': event,
                'actual': actual,
                'forecast': forecast,
                'previous': previous
            })
    
    return data

def get_forex_calendar_data_from_json() -> List[Dict[str, Any]]:
    """
    Fetch forex calendar data from JSON API and return as list of dictionaries
    """
    url = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
    
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        
        # Process each item in the JSON array
        processed_data = []
        for item in data:
            # Parse the original date string
            original_date = item.get("date", "")
            
            if original_date:
                try:
                    # Parse the ISO datetime string
                    dt = datetime.fromisoformat(original_date.replace('Z', '+00:00'))
                    
                    # Convert to UTC properly
                    if dt.tzinfo is not None:
                        # Convert to UTC by subtracting the timezone offset
                        utc_offset = dt.tzinfo.utcoffset(dt)
                        dt_utc = dt - utc_offset
                        # Remove timezone info for formatting
                        dt = dt_utc.replace(tzinfo=None)
                    
                    # Format date as "Sun Sep 14"
                    formatted_date = dt.strftime("%a %b %d")
                    
                    # Format time as "11:30pm" (12-hour format)
                    formatted_time = dt.strftime("%I:%M%p").lower()
                    
                    # Remove leading zero from hour if present
                    if formatted_time.startswith('0'):
                        formatted_time = formatted_time[1:]
                    
                except (ValueError, TypeError) as e:
                    logger.warning(f"Error parsing date '{original_date}': {e}")
                    formatted_date = original_date
                    formatted_time = ""
            else:
                formatted_date = ""
                formatted_time = ""
            
            # Create the processed item
            processed_item = {
                "title": item.get("title", ""),
                "country": item.get("country", ""),
                "date": formatted_date,
                "time": formatted_time,
                "impact": item.get("impact", ""),
                "forecast": item.get("forecast", ""),
                "previous": item.get("previous", "")
            }
            
            processed_data.append(processed_item)
        
        return processed_data
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching data from {url}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch data: {str(e)}")
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing JSON response: {e}")
        raise HTTPException(status_code=500, detail=f"Invalid JSON response: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error in get_forex_calendar_data_from_json: {e}")
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")

@api_router.post("/terminals/restart-all")
async def restart_all_terminals_all_vms():
    """Restart all terminals on all VMs"""
    try:
        logger.info("🔄 Starting restart all terminals process across all VMs...")
        
        vm_results = {}
        total_stopped = 0
        total_failed_stops = 0
        total_final_running = 0
        successful_vms = 0
        failed_vms = 0
        
        # Call restart all terminals API on each VM
        for vm_url in vm_config.vm_servers:
            try:
                logger.info(f"🔄 Calling restart all terminals on {vm_url}...")
                
                async with aiohttp.ClientSession() as session:
                    async with session.post(f"{vm_url}/api/terminals/restart-all", timeout=300) as response:
                        if response.status == 200:
                            data = await response.json()
                            vm_results[vm_url] = {
                                "success": True,
                                "stopped_count": data.get("stopped_count", 0),
                                "failed_stops": data.get("failed_stops", 0),
                                "final_running_count": data.get("final_running_count", 0),
                                "total_accounts": data.get("total_accounts", 0),
                                "message": data.get("message", "Success")
                            }
                            
                            total_stopped += data.get("stopped_count", 0)
                            total_failed_stops += data.get("failed_stops", 0)
                            total_final_running += data.get("final_running_count", 0)
                            successful_vms += 1
                            
                            logger.info(f"✅ {vm_url}: Stopped {data.get('stopped_count', 0)} terminals, {data.get('final_running_count', 0)} running")
                            
                        else:
                            error_text = await response.text()
                            vm_results[vm_url] = {
                                "success": False,
                                "error": f"HTTP {response.status}: {error_text}",
                                "stopped_count": 0,
                                "failed_stops": 0,
                                "final_running_count": 0,
                                "total_accounts": 0
                            }
                            failed_vms += 1
                            logger.error(f"❌ {vm_url}: HTTP {response.status} - {error_text}")
                            
            except asyncio.TimeoutError:
                vm_results[vm_url] = {
                    "success": False,
                    "error": "Timeout after 5 minutes",
                    "stopped_count": 0,
                    "failed_stops": 0,
                    "final_running_count": 0,
                    "total_accounts": 0
                }
                failed_vms += 1
                logger.error(f"❌ {vm_url}: Timeout after 5 minutes")
                
            except Exception as e:
                vm_results[vm_url] = {
                    "success": False,
                    "error": str(e),
                    "stopped_count": 0,
                    "failed_stops": 0,
                    "final_running_count": 0,
                    "total_accounts": 0
                }
                failed_vms += 1
                logger.error(f"❌ {vm_url}: {e}")
        
        # Calculate overall success
        overall_success = successful_vms > 0
        
        logger.info(f"✅ Restart all terminals completed across all VMs")
        logger.info(f"📊 Summary: {successful_vms} successful, {failed_vms} failed")
        logger.info(f"📊 Total stopped: {total_stopped}, Total running: {total_final_running}")
        
        return {
            "success": overall_success,
            "message": f"Restart all terminals completed across {len(vm_config.vm_servers)} VMs",
            "summary": {
                "total_vms": len(vm_config.vm_servers),
                "successful_vms": successful_vms,
                "failed_vms": failed_vms,
                "total_stopped": total_stopped,
                "total_failed_stops": total_failed_stops,
                "total_final_running": total_final_running
            },
            "vm_results": vm_results,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error in restart all terminals across VMs: {e}")
        raise HTTPException(status_code=500, detail=f"Error restarting all terminals across VMs: {str(e)}")

@api_router.get("/news")
async def get_news():
    """
    Get forex calendar news data
    
    Returns:
        JSON response with forex calendar events
    """
    try:
        # First get scraped data (main data)
        scraped_data = get_forex_calendar_data()
        
        # Then get JSON data (for date and time only)
        json_data = get_forex_calendar_data_from_json()
        
        # Create a mapping of JSON data by title for easy lookup
        json_by_title = {}
        for item in json_data:
            title_key = item.get('title', '')
            if title_key:
                json_by_title[title_key] = {
                    'date': item.get('date', ''),
                    'time': item.get('time', ''),
                    'impact': item.get('impact', '')
                }
        
        # Update scraped data with JSON date and time
        updated_data = []
        current_time = ''  # Track the current time
        
        for item in scraped_data:
            # Try to match by event (scraped) vs title (JSON)
            item_event = item.get('event', '')
            if item_event in json_by_title:
                # Replace date, time, and impact with JSON data
                item['date'] = json_by_title[item_event]['date']
                item['time'] = json_by_title[item_event]['time']
                item['impact'] = json_by_title[item_event]['impact']
                current_time = item['time']  # Update current time
            elif item.get('time', '') and item.get('time', '').strip():  # If item has time but not matched
                current_time = item.get('time', '')  # Update current time
            elif not item.get('time', '') or not item.get('time', '').strip():  # If item has no time
                if current_time:  # Use previous time if available
                    item['time'] = current_time
            
            updated_data.append(item)
        
        # Format dates from "Mon Sep 22" to "09-22-2025"
        for item in updated_data:
            if 'date' in item and item['date']:
                try:
                    # Parse the date string (e.g., "Mon Sep 22")
                    from datetime import datetime
                    parsed_date = datetime.strptime(item['date'], "%a %b %d")
                    # Format as "MM-DD-YYYY" (assuming current year)
                    current_year = datetime.now().year
                    formatted_date = parsed_date.replace(year=current_year).strftime("%m-%d-%Y")
                    item['date'] = formatted_date
                except ValueError:
                    # If parsing fails, keep original date
                    pass
        
        return JSONResponse(content={
            "success": True,
            "count": len(updated_data),
            "data": updated_data
        })
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@api_router.post("/update-ea")
async def update_ea_script_all_vms(
    ea_type: str = Form(..., description="EA type: 'mq4' or 'mq5'"),
    file: UploadFile = File(..., description="EA file to upload")
):
    """
    Update EA script and replace in all terminals across all VMs
    
    This endpoint:
    1. Receives EA file and type from client
    2. Forwards the request to all VM API servers
    3. Aggregates responses from all VMs
    4. Returns consolidated results
    
    Form data:
    - ea_type: "mq4" or "mq5" (string)
    - file: EA file to upload (binary file)
    
    Example usage in Postman:
    - Method: POST
    - URL: http://localhost:8080/api/update-ea
    - Body: form-data
    - Key: ea_type, Value: mq4
    - Key: file, Type: File, Value: [select your EA.ex4 file]
    """
    try:
        logger.info(f"🔄 Starting EA update process for type: {ea_type} across all VMs")
        
        # Validate EA type
        if ea_type not in ["mq4", "mq5"]:
            raise HTTPException(status_code=400, detail="ea_type must be 'mq4' or 'mq5'")
        
        # Read the uploaded file content
        try:
            file_content = await file.read()
            logger.info(f"📁 Read {len(file_content)} bytes from uploaded file: {file.filename}")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error reading uploaded file: {str(e)}")
        
        # Prepare form data for VM requests
        form_data = aiohttp.FormData()
        form_data.add_field('ea_type', ea_type)
        form_data.add_field('file', file_content, filename=file.filename, content_type='application/octet-stream')
        
        vm_results = {}
        total_terminals_restarted = 0
        successful_vms = 0
        failed_vms = 0
        
        # Send EA update request to each VM
        for vm_url in vm_config.vm_servers:
            try:
                logger.info(f"🔄 Sending EA update to {vm_url}...")
                
                async with aiohttp.ClientSession() as session:
                    async with session.post(f"{vm_url}/api/update-ea", data=form_data, timeout=300) as response:
                        if response.status == 200:
                            data = await response.json()
                            vm_results[vm_url] = {
                                "success": True,
                                "message": data.get("message", "Success"),
                                "filename": data.get("filename", file.filename),
                                "file_size": data.get("file_size", len(file_content)),
                                "terminals_restarted": data.get("terminals_restarted", 0)
                            }
                            
                            total_terminals_restarted += data.get("terminals_restarted", 0)
                            successful_vms += 1
                            
                            logger.info(f"✅ {vm_url}: {data.get('terminals_restarted', 0)} terminals restarted")
                            
                        else:
                            error_text = await response.text()
                            vm_results[vm_url] = {
                                "success": False,
                                "error": f"HTTP {response.status}: {error_text}",
                                "terminals_restarted": 0
                            }
                            failed_vms += 1
                            logger.error(f"❌ {vm_url}: HTTP {response.status} - {error_text}")
                            
            except asyncio.TimeoutError:
                vm_results[vm_url] = {
                    "success": False,
                    "error": "Timeout after 5 minutes",
                    "terminals_restarted": 0
                }
                failed_vms += 1
                logger.error(f"❌ {vm_url}: Timeout after 5 minutes")
                
            except Exception as e:
                vm_results[vm_url] = {
                    "success": False,
                    "error": str(e),
                    "terminals_restarted": 0
                }
                failed_vms += 1
                logger.error(f"❌ {vm_url}: {e}")
        
        # Calculate overall success
        overall_success = successful_vms > 0
        
        logger.info(f"✅ EA update process completed across all VMs")
        logger.info(f"📊 Summary: {successful_vms} successful, {failed_vms} failed")
        logger.info(f"📊 Total terminals restarted: {total_terminals_restarted}")
        
        return {
            "success": overall_success,
            "message": f"EA script updated successfully for {ea_type} across {len(vm_config.vm_servers)} VMs",
            "filename": file.filename,
            "file_size": len(file_content),
            "summary": {
                "total_vms": len(vm_config.vm_servers),
                "successful_vms": successful_vms,
                "failed_vms": failed_vms,
                "total_terminals_restarted": total_terminals_restarted
            },
            "vm_results": vm_results,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in EA update process across VMs: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating EA script across VMs: {str(e)}")

# Include API router
app.include_router(api_router, prefix="/api")

if __name__ == "__main__":
    # Run the router server
    uvicorn.run(
        "router_server:app",
        host="0.0.0.0",
        port=8080,
        reload=False,
        log_level="info",
        proxy_headers=True,  # Trust forwarded headers (e.g., HTTPS scheme)
        forwarded_allow_ips="127.0.0.1"  # Trust only local Nginx
    )