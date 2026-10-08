#!/usr/bin/env python3
"""
JamesPlatform MetaTrader API Server
Manages MetaTrader accounts and terminals using FastAPI
"""

from re import A
from fastapi import FastAPI, HTTPException, APIRouter, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import uvicorn
from models.models import Terminal, Account, PlatformType, TerminalStatus
import logging
from datetime import datetime, timedelta
import json
import os
import sys
import time
import shutil
import requests
from pathlib import Path
import psutil
import asyncio
try:
    import asyncio_mqtt as aiomqtt
    MQTT_AVAILABLE = True
except ImportError:
    MQTT_AVAILABLE = False
    logging.getLogger(__name__).warning("MQTT support not available. Install with: pip install asyncio-mqtt")

# Add the controller directory to the path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config.config import ControllerConfig
from models.terminal_manager import TerminalManager
from batch.batch_manager import BatchManager
from db.mysql_database import MySQLDatabaseManager
from api.api_client import LaravelAPIClient
from pyautogui_terminal_manager import PyAutoGUITerminalManager

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('C:/JamesPlatform/logs/api_server.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="JamesPlatform MetaTrader API Server",
    description="API server for managing MetaTrader accounts and terminals",
    version="1.0.0"
)

# Create API router for /api prefix
api_router = APIRouter()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize components
config = ControllerConfig()
db_manager = MySQLDatabaseManager(
    host=config.MYSQL_HOST,
    port=config.MYSQL_PORT,
    database=config.MYSQL_DATABASE,
    username=config.MYSQL_USERNAME,
    password=config.MYSQL_PASSWORD
)
terminal_manager = TerminalManager(db_manager)
batch_manager = BatchManager()
laravel_client = LaravelAPIClient()
pyautogui_manager = PyAutoGUITerminalManager()

# Global busy state for human activity simulation
server_busy = False
busy_start_time = None
busy_reason = None

# Add status tracking system at the top of the file after imports
import threading
from typing import Dict, Optional, Any
from datetime import datetime, timedelta

# Global status tracking for account creation
account_creation_status = {}
status_lock = threading.Lock()

class CreationStep:
    """Enum for creation steps"""
    QUEUED = "queued"
    INITIALIZING = "initializing"
    AUTOMATING_LOGIN = "automating_login"
    VALIDATING_CREDENTIALS = "validating_credentials"
    COMPLETED = "completed"
    FAILED = "failed"

def set_server_busy(reason: str = "Human activity simulation in progress"):
    """Set server to busy state"""
    global server_busy, busy_start_time, busy_reason
    server_busy = True
    busy_start_time = time.time()
    busy_reason = reason
    logger.info(f" Server set to busy state: {reason}")

def set_server_ready():
    """Set server to ready state"""
    global server_busy, busy_start_time, busy_reason
    if server_busy:
        duration = time.time() - busy_start_time if busy_start_time else 0
        logger.info(f" Server ready state restored after {duration:.2f} seconds")
    server_busy = False
    busy_start_time = None
    busy_reason = None

def is_server_busy() -> tuple[bool, Optional[str], Optional[float]]:
    """Check if server is busy and return reason and duration"""
    duration = time.time() - busy_start_time if busy_start_time and server_busy else None
    return server_busy, busy_reason, duration

def update_creation_status(account_id: str, step: str, message: str = "", progress: int = 0, estimated_completion: Optional[datetime] = None):
    """Update the creation status for an account"""
    with status_lock:
        if account_id not in account_creation_status:
            account_creation_status[account_id] = {
                "step": step,
                "message": message,
                "progress": progress,
                "start_time": datetime.now(),
                "last_update": datetime.now(),
                "estimated_completion": estimated_completion,
                "steps_completed": []
            }
        else:
            account_creation_status[account_id].update({
                "step": step,
                "message": message,
                "progress": progress,
                "last_update": datetime.now(),
                "estimated_completion": estimated_completion
            })
            if step not in account_creation_status[account_id]["steps_completed"]:
                account_creation_status[account_id]["steps_completed"].append(step)

def get_creation_status(account_id: str) -> Optional[Dict[str, Any]]:
    """Get the creation status for an account"""
    with status_lock:
        return account_creation_status.get(account_id)

def clear_creation_status(account_id: str):
    """Clear the creation status for an account (after completion or failure)"""
    with status_lock:
        if account_id in account_creation_status:
            del account_creation_status[account_id]

def cleanup_old_creation_status():
    """Clean up old creation status entries (older than 1 hour)"""
    current_time = datetime.now()
    with status_lock:
        accounts_to_remove = []
        for account_id, status_data in account_creation_status.items():
            # If status is completed or failed and older than 1 hour, remove it
            if status_data["step"] in ["completed", "failed"]:
                time_diff = current_time - status_data["last_update"]
                if time_diff.total_seconds() > 3600:  # 1 hour
                    accounts_to_remove.append(account_id)
        
        for account_id in accounts_to_remove:
            del account_creation_status[account_id]
            logger.info(f"Cleaned up old creation status for account {account_id}")
        
        if accounts_to_remove:
            logger.info(f"Cleaned up {len(accounts_to_remove)} old creation status entries")

def get_step_progress(step: str, steps_completed: List[str] = None) -> int:
    """Get progress percentage for a step, considering completed steps"""
    # Define step order with only the 4 main steps
    step_order = [
        CreationStep.INITIALIZING,
        CreationStep.AUTOMATING_LOGIN,
        CreationStep.VALIDATING_CREDENTIALS,
        CreationStep.COMPLETED,
        CreationStep.FAILED
    ]
    
    # Fixed progress values for the 5 main steps
    step_progress = {
        CreationStep.QUEUED: 0,
        CreationStep.INITIALIZING: 10,
        CreationStep.AUTOMATING_LOGIN: 50,
        CreationStep.VALIDATING_CREDENTIALS: 90,
        CreationStep.COMPLETED: 100,
        CreationStep.FAILED: 100
    }
    
    # Return progress based on current step
    return step_progress.get(step, 0)

def get_step_description(step: str) -> str:
    """Get human-readable description for a step"""
    step_descriptions = {
        CreationStep.QUEUED: "Account creation request queued - waiting for available VM",
        CreationStep.INITIALIZING: "Initializing account creation process",
        CreationStep.AUTOMATING_LOGIN: "Automating login process",
        CreationStep.VALIDATING_CREDENTIALS: "Validating login credentials",
        CreationStep.COMPLETED: "Account creation completed successfully",
        CreationStep.FAILED: "Account creation failed"
    }
    return step_descriptions.get(step, "Unknown step")

def estimate_completion_time(step: str, start_time: datetime) -> Optional[datetime]:
    """Estimate completion time based on current step"""
    step_durations = {
        CreationStep.QUEUED: 0,
        CreationStep.INITIALIZING: 10,
        CreationStep.AUTOMATING_LOGIN: 30,
        CreationStep.VALIDATING_CREDENTIALS: 20,
        CreationStep.COMPLETED: 0,
        CreationStep.FAILED: 0
    }
    
    duration = step_durations.get(step, 60)
    elapsed = (datetime.now() - start_time).total_seconds()
    remaining = max(0, duration - elapsed)
    
    return datetime.now() + timedelta(seconds=remaining)

# Pydantic models for API requests/responses
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
    user_id: Optional[int] = None
    platform_type: PlatformType

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


# Global EA data tracking for disconnected accounts
ea_disconnect_timers = {}
ea_timer_lock = threading.Lock()

def handle_disconnected_account(account_id: str, login: str):
    """Handle disconnected account - start timer for cleanup"""
    with ea_timer_lock:
        if account_id not in ea_disconnect_timers:
            ea_disconnect_timers[account_id] = {
                'login': login,
                'disconnect_time': time.time(),
                'timer_started': True
            }
            logger.info(f"Started disconnect timer for account {account_id} (login: {login})")
        else:
            # Update existing timer
            ea_disconnect_timers[account_id]['disconnect_time'] = time.time()
            logger.info(f"Updated disconnect timer for account {account_id} (login: {login})")

def handle_connected_account(account_id: str, login: str):
    """Handle connected account - clear disconnect timer"""
    with ea_timer_lock:
        if account_id in ea_disconnect_timers:
            del ea_disconnect_timers[account_id]
            logger.info(f"Cleared disconnect timer for account {account_id} (login: {login}) - account reconnected")

async def check_disconnect_timers():
    """Check disconnect timers and cleanup accounts that have been disconnected for 30+ seconds"""
    current_time = time.time()
    accounts_to_cleanup = []
    
    with ea_timer_lock:
        for account_id, timer_data in ea_disconnect_timers.items():
            disconnect_duration = current_time - timer_data['disconnect_time']
            if disconnect_duration >= 30:  # 30 seconds
                accounts_to_cleanup.append((account_id, timer_data['login']))
    
    # Cleanup accounts outside the lock
    for account_id, login in accounts_to_cleanup:
        logger.warning(f"Account {account_id} (login: {login}) has been disconnected for 30+ seconds, starting cleanup")
        await cleanup_disconnected_account(account_id, login)

async def cleanup_disconnected_account(account_id: str, login: str):
    """Cleanup disconnected account: turn off terminal, delete folder, remove from database"""
    try:
        logger.info(f"Starting cleanup for disconnected account {account_id} (login: {login})")
        
        # 1. Get terminal information and stop terminal
        process_id = None
        try:
            terminals = db_manager.get_terminals_by_account(account_id)
            if terminals:
                # Get the latest terminal record
                latest_terminal = max(terminals, key=lambda t: t.start_time if t.start_time else datetime.min)
                process_id = latest_terminal.process_id
                logger.info(f"Found process_id {process_id} for account {account_id}")
            else:
                logger.warning(f"No terminal records found for account {account_id}")
        except Exception as e:
            logger.error(f"Error getting process_id for account {account_id}: {e}")
        
        # Stop terminal using pyautogui_manager
        terminal_stopped = False
        if process_id:
            # Try to determine platform type
            try:
                account = db_manager.get_account(account_id)
                if account and hasattr(account, 'platform_type'):
                    platform_type = PlatformType(account.platform_type)
                else:
                    platform_type = PlatformType.MT4  # Default to MT4
            except:
                platform_type = PlatformType.MT4
            
            terminal_result = pyautogui_manager.stop_terminal(login, process_id, account_id, platform_type)
            if terminal_result:
                logger.info(f"Successfully stopped terminal with process_id {process_id} for account {account_id}")
                terminal_stopped = True
            else:
                logger.error(f"Failed to stop terminal with process_id {process_id} for account {account_id}")
        else:
            logger.warning(f"No valid process_id found for account {account_id}")
        
        # Wait a bit for terminal to fully stop
        if terminal_stopped:
            await asyncio.sleep(3)
            logger.info(f"Waited 3 seconds for terminal to fully stop")
        
        # 2. Delete folder - try both MT4 and MT5 paths
        mt4_path = os.path.join(config.MT4_INSTANCES_PATH, login)
        mt5_path = os.path.join(config.MT5_INSTANCES_PATH, login)
        
        folder_deleted = False
        for folder_path in [mt4_path, mt5_path]:
            if os.path.exists(folder_path):
                try:
                    shutil.rmtree(folder_path)
                    logger.info(f"Successfully deleted folder: {folder_path}")
                    folder_deleted = True
                    break
                except Exception as e:
                    logger.error(f"Failed to delete folder {folder_path}: {e}")
        
        if not folder_deleted:
            logger.warning(f"No folders found to delete for account {account_id} (login: {login})")
        
        # 3. Get account details before deletion for notification
        notification_data = None
        try:
            account = db_manager.get_account(account_id)
            if account:
                notification_data = {
                    "account_id": account_id,
                    "email": getattr(account, 'email', 'unknown@example.com'),
                    "login": login,
                    "password": getattr(account, 'password', 'unknown'),
                    "server": getattr(account, 'server', 'unknown'),
                    "language": "en"
                }
                logger.info(f"Prepared notification data for account {account_id}")
            else:
                logger.warning(f"Could not get account details for notification - account not found")
        except Exception as e:
            logger.error(f"Error getting account details for notification: {e}")
        
        # 4. Remove from database
        database_deleted = False
        try:
            db_manager.delete_account(account_id)
            logger.info(f"Successfully removed account {account_id} from database")
            database_deleted = True
        except Exception as e:
            logger.error(f"Failed to remove account {account_id} from database: {e}")
        
        # 5. Send notification if database deletion was successful
        if database_deleted and notification_data:
            try:
                # Send notification
                notification_url = "https://login.jamestradinggroup.com/api/accounts/send-account-deleted-notification"
                response = requests.post(notification_url, json=notification_data, timeout=10)
                
                if response.status_code == 200:
                    logger.info(f"✅ Successfully sent account deletion notification for account {account_id}")
                else:
                    logger.warning(f"⚠️ Failed to send notification for account {account_id}: HTTP {response.status_code}")
                    
            except Exception as e:
                logger.error(f"Error sending account deletion notification for account {account_id}: {e}")
        elif database_deleted and not notification_data:
            logger.warning(f"Database deleted but no notification data available for account {account_id}")
        
        # 6. Remove from disconnect timers
        with ea_timer_lock:
            if account_id in ea_disconnect_timers:
                del ea_disconnect_timers[account_id]
        
        logger.info(f"Completed cleanup for disconnected account {account_id} (login: {login})")
        
    except Exception as e:
        logger.error(f"Error during cleanup for account {account_id}: {e}")


class AccountResponse(BaseModel):
    account_id: str
    login: str
    server: str
    name: str
    email: str
    groupid: Optional[str] = None
    status: str
    state: Optional[str] = None
    balance: Optional[float] = None
    equity: Optional[float] = None
    created_at: str
    updated_at: str

class ApiResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None
    error_code: Optional[str] = None

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

@app.on_event("startup")
async def startup_event():
    """Initialize the API server"""
    logger.info(" Starting JamesPlatform MetaTrader API Server")
    os.makedirs(config.MT4_INSTANCES_PATH, exist_ok=True)
    os.makedirs(config.MT5_INSTANCES_PATH, exist_ok=True)
    os.makedirs(config.LOGS_PATH, exist_ok=True)
    global db_manager, pyautogui_manager
    db_manager = MySQLDatabaseManager(
        host=config.MYSQL_HOST,
        port=config.MYSQL_PORT,
        database=config.MYSQL_DATABASE,
        username=config.MYSQL_USERNAME,
        password=config.MYSQL_PASSWORD
    )
    pyautogui_manager = PyAutoGUITerminalManager()
    
    # Start background task for checking disconnect timers
    asyncio.create_task(background_disconnect_check())
    
    
    # Start background task for restarting terminals (with delay to ensure everything is ready)
    asyncio.create_task(background_terminal_restart())
    
    # Start background account cleaner
    asyncio.create_task(background_account_cleaner())
    
    logger.info(" API Server initialized successfully")

async def background_disconnect_check():
    """Background task to periodically check disconnect timers"""
    while True:
        try:
            await check_disconnect_timers()
        except Exception as e:
            logger.error(f"Error in background disconnect check: {e}")
        
        await asyncio.sleep(10)  # Check every 10 seconds


async def background_terminal_restart():
    """Background task to resume terminals for connected accounts after server startup (NO AUTOMATION)"""
    try:
        # Wait a bit for everything to be fully initialized
        logger.info("Waiting 10 seconds before resuming terminals...")
        await asyncio.sleep(10)
        
        # Resume terminals for connected accounts
        logger.info("Starting terminal resume process...")
        await restart_terminals_for_connected_accounts()
        logger.info("Terminal resume process completed")
        
        # After initial resume, check every 11 minutes for any disconnected terminals
        while True:
            try:
                await asyncio.sleep(660)  # Wait 11 minutes
                logger.info("Checking for disconnected terminals that need resume...")
                await restart_terminals_for_connected_accounts()
                logger.info("Periodic terminal resume check completed")
            except Exception as e:
                logger.error(f"Error in periodic terminal resume: {e}")
                await asyncio.sleep(300)  # Wait 5 minutes before retrying
                
    except Exception as e:
        logger.error(f"Error in background terminal resume: {e}")
        # Try to resume after a delay
        try:
            await asyncio.sleep(60)  # Wait 1 minute
            await restart_terminals_for_connected_accounts()
        except Exception as retry_e:
            logger.error(f"Retry failed: {retry_e}")




async def background_account_cleaner():
    """Account cleaner - tests accounts with balance > 0 by removing account_data.json and checking regeneration (runs every 10 minutes)"""
    while True:
        try:
            await asyncio.sleep(300)  # Wait 5 minutes before first run
            
            logger.info("🧹 Starting account cleaner...")
            
            # Get all accounts from database
            accounts = db_manager.get_all_accounts()
            logger.info(f"Found {len(accounts)} accounts to check")
            
            cleaned_count = 0
            
            for account in accounts:
                try:
                    # Get account details
                    account_id = account.account_id
                    login = account.login
                    status = str(account.status) if hasattr(account, 'status') else '0'
                    state = account.state if hasattr(account, 'state') else ''
                    balance = float(account.balance) if hasattr(account, 'balance') and account.balance else 0
                    created_at = account.created_at if hasattr(account, 'created_at') else None
                    
                    logger.debug(f"Checking account {account_id} (login: {login}): status={status}, state={state}, balance={balance}")
                    
                    # Check if account is newly created (less than 30 minutes old)
                    if created_at:
                        try:
                            if isinstance(created_at, str):
                                created_time = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                            else:
                                created_time = created_at
                            
                            time_diff = datetime.now(created_time.tzinfo) - created_time
                            minutes_old = time_diff.total_seconds() / 60
                            
                            if minutes_old < 10:
                                logger.info(f"⏰ Skipping newly created account {account_id} (login: {login}) - only {minutes_old:.1f} minutes old (less than 30 minutes)")
                                continue  # Skip this account
                            else:
                                logger.debug(f"Account {account_id} is {minutes_old:.1f} minutes old - eligible for health check")
                        except Exception as e:
                            logger.warning(f"Error parsing created_at for account {account_id}: {e}, proceeding with health check")
                    
                    # Check accounts with balance > 0 (regardless of state, since state might be timestamp)
                    # This will catch accounts that should be connected but are actually disconnected
                    if balance > 0:
                        logger.info(f"🔍 Testing account {account_id} (login: {login}) - has balance {balance}, testing if really connected")
                        
                        # Check both MT4 and MT5 paths
                        mt4_path = os.path.join(config.MT4_INSTANCES_PATH, login)
                        mt5_path = os.path.join(config.MT5_INSTANCES_PATH, login)
                        
                        logger.info(f"   Checking paths:")
                        logger.info(f"   MT4 path: {mt4_path} (exists: {os.path.exists(mt4_path)})")
                        logger.info(f"   MT5 path: {mt5_path} (exists: {os.path.exists(mt5_path)})")
                        
                        account_data_removed = False
                        account_data_regenerated = False
                        platform_type = None
                        
                        # Try MT4 path first
                        mt4_account_data_path = os.path.join(mt4_path, "MQL4", "Files", "account_data.json")
                        if os.path.exists(mt4_account_data_path):
                            try:
                                os.remove(mt4_account_data_path)
                                logger.info(f"🗑️ Removed account_data.json from MT4 path: {mt4_account_data_path}")
                                account_data_removed = True
                                platform_type = "MT4"
                            except Exception as e:
                                logger.error(f"Failed to remove MT4 account_data.json: {e}")
                        
                        # Try MT5 path if MT4 didn't work
                        if not account_data_removed:
                            mt5_account_data_path = os.path.join(mt5_path, "MQL5", "Files", "account_data.json")
                            if os.path.exists(mt5_account_data_path):
                                try:
                                    os.remove(mt5_account_data_path)
                                    logger.info(f"🗑️ Removed account_data.json from MT5 path: {mt5_account_data_path}")
                                    account_data_removed = True
                                    platform_type = "MT5"
                                except Exception as e:
                                    logger.error(f"Failed to remove MT5 account_data.json: {e}")
                        
                        if account_data_removed:
                            # Wait 10 seconds for regeneration
                            logger.info(f"⏳ Waiting 10 seconds for account {account_id} to regenerate account_data.json...")
                            await asyncio.sleep(10)
                            
                            # Check if file was regenerated
                            if platform_type == "MT4":
                                check_path = mt4_account_data_path
                            else:
                                check_path = mt5_account_data_path
                            
                            if os.path.exists(check_path):
                                try:
                                    with open(check_path, 'r') as f:
                                        account_data = json.load(f)
                                    
                                    new_balance = account_data.get('balance', 0)
                                    logger.info(f"✅ Account {account_id} regenerated account_data.json with balance: {new_balance}")
                                    account_data_regenerated = True
                                    
                                except Exception as e:
                                    logger.error(f"Error reading regenerated account_data.json for account {account_id}: {e}")
                            else:
                                logger.warning(f"❌ Account {account_id} did not regenerate account_data.json after 10 seconds")
                        
                        # If account_data.json was not regenerated, clean up the account
                        if account_data_removed and not account_data_regenerated:
                            logger.warning(f"🗑️ Account {account_id} (login: {login}) failed to regenerate account_data.json - cleaning up")
                            
                            # Clean up this account
                            await cleanup_disconnected_account(account_id, login)
                            cleaned_count += 1
                        
                        elif not account_data_removed:
                            logger.info(f"ℹ️ Account {account_id} (login: {login}) - no account_data.json found to test")
                    
                    else:
                        logger.debug(f"Skipping account {account_id} (login: {login}) - no balance: balance={balance}")
                
                except Exception as e:
                    logger.error(f"Error checking account {account_id}: {e}")
            
            logger.info(f"🧹 Account cleaner completed - cleaned {cleaned_count} accounts")
            
        except Exception as e:
            logger.error(f"Error in account cleaner: {e}")
            await asyncio.sleep(300)  # Wait 5 minutes before retrying

@app.on_event("shutdown")
async def shutdown_event():
    """Clean up resources on shutdown"""
    try:
        logger.info(" Shutting down API Server...")
        await stop_all_terminals()
        logger.info(" API Server shutdown completed")
    except Exception as e:
        logger.error(f" Error during API Server shutdown: {e}")
        try:
            logger.info(" Emergency shutdown: Force stopping all terminals...")
            pyautogui_manager.stop_all_terminals()
        except Exception as emergency_e:
            logger.error(f" Emergency shutdown failed: {emergency_e}")

async def stop_all_terminals():
    """Stop all running terminals when server shuts down"""
    try:
        logger.info(" Stopping all running terminals...")
        
        # Import required modules at the top
        import psutil
        from config.config import config
        
        logger.info(f" DEV_MODE: {config.DEV_MODE}")
        logger.info(f" DEV_MODE_ALLOW_DUPLICATES: {getattr(config, 'DEV_MODE_ALLOW_DUPLICATES', False)}")
        
        accounts = db_manager.get_all_accounts()
        logger.info(f" Found {len(accounts)} accounts to check")
        stopped_count = 0
        updated_count = 0
        for account in accounts:
            try:
                # Check if terminal is running by checking database first
                terminals = db_manager.get_terminals_by_account(account.account_id)
                terminal_running = False
                
                if terminals:
                    latest_terminal = max(terminals, key=lambda t: t.start_time if t.start_time else datetime.min)
                    if latest_terminal.process_id:
                        try:
                            proc = psutil.Process(latest_terminal.process_id)
                            if proc.status() == psutil.STATUS_RUNNING:
                                terminal_running = True
                        except psutil.NoSuchProcess:
                            pass
                        except Exception as e:
                            logger.warning(f"Error checking terminal process {latest_terminal.process_id} for account {account.account_id}: {e}")
                
                if terminal_running:
                    logger.info(f"Stopping terminal for account {account.account_id} (login: {account.login})")
                    process_id = None
                    try:
                        terminals = db_manager.get_terminals_by_account(account.account_id)
                        if terminals:
                            latest_terminal = max(terminals, key=lambda t: t.start_time if t.start_time else datetime.min)
                            process_id = latest_terminal.process_id
                            logger.info(f"Found process ID {process_id} for account {account.account_id}")
                        else:
                            logger.warning(f"No terminal records found for account {account.account_id}")
                    except Exception as e:
                        logger.warning(f"Error getting process ID for account {account.account_id}: {e}")
                    # Get platform_type from account
                    platform_type = getattr(account, 'platform_type', PlatformType.MT4)
                    # Convert platform_type to enum if it's a string
                    if isinstance(platform_type, str):
                        platform_type = PlatformType(platform_type)
                    stop_success = pyautogui_manager.stop_terminal(account.login, process_id, account.account_id, platform_type)
                    if stop_success:
                        stopped_count += 1
                        logger.info(f" Stopped terminal for account {account.account_id}")
                    else:
                        logger.warning(f" Failed to stop terminal for account {account.account_id}")
                else:
                    logger.info(f"Terminal not running for account {account.account_id} (login: {account.login})")
                
                # Update terminal status to STOPPED instead of deleting records
                try:
                    terminals = db_manager.get_terminals_by_account(account.account_id)
                    if terminals:
                        latest_terminal = max(terminals, key=lambda t: t.start_time if t.start_time else datetime.min)
                        # Update terminal status to STOPPED instead of deleting
                        update_data = {
                            "status": TerminalStatus.STOPPED,
                            "process_id": None,  # Clear process ID since terminal is stopped
                            "updated_at": datetime.now().isoformat()
                        }
                        update_success = db_manager.update_terminal(latest_terminal.terminal_id, update_data)
                        if update_success:
                            updated_count += 1
                            logger.info(f" Updated terminal status to STOPPED for account {account.account_id}")
                        else:
                            logger.warning(f" Failed to update terminal status for account {account.account_id}")
                    else:
                        logger.info(f"No terminal records to update for account {account.account_id}")
                except Exception as e:
                    logger.error(f"Error updating terminal status for account {account.account_id}: {e}")
            except Exception as e:
                logger.error(f"Error stopping terminal for account {account.account_id}: {e}")
        logger.info(" Emergency cleanup: Force stopping all terminal processes...")
        try:
            emergency_stop_success = pyautogui_manager.stop_all_terminals()
            if emergency_stop_success:
                logger.info(" Emergency terminal cleanup successful")
            else:
                logger.warning(" Emergency terminal cleanup may have failed")
        except Exception as e:
            logger.error(f" Emergency terminal cleanup failed: {e}")
        logger.info(f" Stopped {stopped_count} terminals and updated {updated_count} terminal records during shutdown")
    except Exception as e:
        logger.error(f"Error in stop_all_terminals: {e}")
        raise

async def restart_terminals_for_connected_accounts():
    """Restart terminals for all accounts that should be connected (SERVER RESTART SCENARIO - NO AUTOMATION)"""
    try:
        logger.info(" Resuming terminals for connected accounts after server restart (NO AUTOMATION)...")
        
        # Import required modules at the top
        import psutil
        from config.config import config
        
        logger.info(f" DEV_MODE: {config.DEV_MODE}")
        logger.info(f" DEV_MODE_ALLOW_DUPLICATES: {getattr(config, 'DEV_MODE_ALLOW_DUPLICATES', False)}")
        
        # Get all accounts that should be restarted
        accounts = db_manager.get_accounts()
        logger.info(f"Found {len(accounts)} total accounts in database")
        
        eligible_accounts = 0
        restarted_count = 0
        cleaned_count = 0
        
        for account in accounts:
            try:
                account_state = account.get('state', None)
                account_status = account.get('status', None)
                balance = account.get('balance', 0)
                
                # Convert balance to float if it's a string
                if isinstance(balance, str):
                    try:
                        balance = float(balance)
                    except (ValueError, TypeError):
                        balance = 0
                
                has_balance = balance > 0
                is_connected = account_state == 'connected'
                is_paused = account_status == '0' and account_state == 'connected' and has_balance
                
                # Should restart if:
                # 1. Currently connected AND active (status='1') with balance (normal case)
                # 2. OR if account was recently stopped due to restart process (state='stopped' but has balance and is active)
                should_restart = (is_connected and account_status == '1' and has_balance) or \
                                (account_state == 'stopped' and account_status == '1' and has_balance)
                
                logger.info(f"Account {account.get('account_id')} ({account.get('login')}): connected={is_connected}, status={account_status}, has_balance={has_balance}, should_restart={should_restart}")
                
                if should_restart:
                    eligible_accounts += 1
                    logger.info(f"Account {account.get('account_id')} ({account.get('login')}) eligible for restart: connected={is_connected}, status={account_status}, has_balance={has_balance}")
                    
                    # Check if terminal is already running
                    terminal_running = pyautogui_manager.is_terminal_running(account.get("login"), account.get("account_id"))
                    
                    if not terminal_running:
                        logger.info(f"Restarting terminal for account {account.get('account_id')} ({account.get('login')}) - SERVER RESTART SCENARIO")
                        
                        # Get platform_type and convert to enum if needed
                        platform_type_raw = account.get("platform_type", "mt4")
                        if isinstance(platform_type_raw, str):
                            platform_type = PlatformType(platform_type_raw)
                        else:
                            platform_type = platform_type_raw
                        
                        # Launch existing terminal WITHOUT automation (just resume the terminal)
                        # This is for server restart - no need for login automation since accounts are already configured
                        success, process_id, error_code = pyautogui_manager.resume_terminal_only(
                            login=account.get("login"),
                            platform_type=platform_type
                        )
                        
                        if success and process_id:
                            # Update terminal record
                            terminal_updates = {
                                "process_id": process_id,
                                "status": "running",
                                "start_time": datetime.now().isoformat()
                            }
                            
                            # Get existing terminal record
                            terminals = db_manager.get_terminals_by_account(account.get("account_id"))
                            if terminals:
                                latest_terminal = max(terminals, key=lambda t: t.start_time if t.start_time else datetime.min)
                                db_manager.update_terminal(latest_terminal.terminal_id, terminal_updates)
                                logger.info(f"Terminal restarted successfully for account {account.get('account_id')} with PID {process_id}")
                                restarted_count += 1
                                
                                # Update account state back to connected after successful restart
                                db_manager.update_account(account.get("account_id"), {
                                    "state": "connected",
                                    "updated_at": datetime.now().isoformat()
                                })
                                logger.info(f"Updated account {account.get('account_id')} state to connected")
                            else:
                                logger.warning(f"No terminal record found for account {account.get('account_id')}")
                        else:
                            logger.error(f"Failed to restart terminal for account {account.get('account_id')}: {error_code}")
                    else:
                        logger.debug(f"Terminal already running for account {account.get('account_id')} ({account.get('login')})")
                        
                        # Clean up old terminal records (keep only the latest)
                        terminals = db_manager.get_terminals_by_account(account.get("account_id"))
                        if len(terminals) > 1:
                            # Sort by start_time and keep only the latest
                            sorted_terminals = sorted(terminals, key=lambda t: t.start_time if t.start_time else datetime.min, reverse=True)
                            for old_terminal in sorted_terminals[1:]:
                                db_manager.delete_terminal(old_terminal.terminal_id)
                                logger.debug(f"Cleaned up old terminal record {old_terminal.terminal_id} for account {account.get('account_id')}")
                                cleaned_count += 1
                else:
                    if is_paused:
                        logger.debug(f"Account {account.get('account_id')} ({account.get('login')}) is PAUSED (status={account_status}, state={account_state}) - will NOT restart terminal")
                    else:
                        logger.debug(f"Account {account.get('account_id')} ({account.get('login')}) not eligible for restart: connected={is_connected}, status={account_status}, has_balance={has_balance}")
                    
            except Exception as e:
                logger.error(f"Error restarting terminal for account {account.get('account_id')}: {e}")
                continue
        
        logger.info(f" Found {eligible_accounts} eligible accounts for resume")
        logger.info(f" Resumed {restarted_count} terminals and cleaned {cleaned_count} old terminal records during startup")
    except Exception as e:
        logger.error(f"Error in restart_terminals_for_connected_accounts: {e}")
        raise

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "JamesPlatform MetaTrader API Server",
        "version": "1.0.0",
        "status": "running"
    }

@api_router.get("/status")
async def server_status():
    """Get server status including busy state and terminal count"""
    is_busy, busy_reason, duration = is_server_busy()
    
    # Get current terminal count
    terminal_count_response = await get_terminal_count()
    current_terminals = terminal_count_response.get("current_terminals", 0)
    
    return {
        "server": "JamesPlatform MetaTrader API Server",
        "version": "1.0.0",
        "status": "busy" if is_busy else "ready",
        "current_terminals": current_terminals,
        "max_terminals": pyautogui_manager.max_terminals_per_system,
        "busy": {
            "is_busy": is_busy,
            "reason": busy_reason,
            "duration_seconds": duration
        },
        "timestamp": datetime.now().isoformat()
    }

@api_router.get("/terminals/count")
async def get_terminal_count():
    """Get current terminal count and capacity information"""
    try:
        # Get raw process count
        raw_process_count = pyautogui_manager.get_running_terminal_count()
        
        # Get detailed terminal accounts to count running and paused separately
        try:
            # Get all accounts and count terminals by state
            accounts = db_manager.get_accounts()
            running_terminals_count = 0
            paused_terminals_count = 0
            
            for account in accounts:
                try:
                    # Check if terminal is running for this account
                    terminal_running = pyautogui_manager.is_terminal_running(account.get("login"), account.get("account_id"))
                    
                    # Get balance
                    balance = account.get('balance', 0)
                    if isinstance(balance, str):
                        try:
                            balance = float(balance)
                        except (ValueError, TypeError):
                            balance = 0
                    
                    has_balance = balance > 0
                    account_state = account.get('state', None)
                    account_status = account.get('status', None)
                    is_connected = account_state == 'connected'
                    # Paused accounts: status=0 (inactive) AND state=connected (was connected) AND has_balance
                    is_paused = account_status == '0' and account_state == 'connected' and has_balance
                    
                    # Count terminals based on connection and balance status
                    if has_balance:  # Only check for balance, not terminal_running
                        if is_connected and terminal_running:
                            running_terminals_count += 1
                        elif is_paused:
                            # Count paused accounts even if terminal is not running (for load balancing)
                            paused_terminals_count += 1
                            
                except Exception as e:
                    logger.warning(f"Error processing account {account.get('account_id')} for terminal count: {e}")
                    continue
            
            total_active_terminals = raw_process_count + paused_terminals_count
            
        except Exception as e:
            logger.warning(f"Error getting detailed terminal count, using raw process count: {e}")
            total_active_terminals = raw_process_count
            running_terminals_count = raw_process_count
            paused_terminals_count = 0
        
        system_capacity = pyautogui_manager.get_system_capacity()
        
        return {
            "success": True,
            "current_terminals": total_active_terminals,  # Total active terminals (running + paused)
            "running_terminals": running_terminals_count,
            "paused_terminals": paused_terminals_count,
            "raw_process_count": raw_process_count,  # Raw process count for debugging
            "max_terminals": pyautogui_manager.max_terminals_per_system,
            "system_capacity": system_capacity,
            "can_launch_more": total_active_terminals < pyautogui_manager.max_terminals_per_system,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting terminal count: {e}")
        return {
            "success": False,
            "error": str(e),
            "current_terminals": 0,
            "running_terminals": 0,
            "paused_terminals": 0,
            "raw_process_count": 0,
            "max_terminals": pyautogui_manager.max_terminals_per_system,
            "timestamp": datetime.now().isoformat()
        }

@api_router.get("/terminals/debug")
async def debug_terminal_count():
    """Debug endpoint to test terminal counting methods"""
    try:
        # Test different counting methods
        import subprocess
        
        # Method 1: Direct tasklist
        try:
            result = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq terminal.exe'], 
                                  capture_output=True, text=True)
            tasklist_raw = result.stdout
            tasklist_lines = [line for line in tasklist_raw.strip().split('\n') 
                            if line.strip() and 'terminal.exe' in line and 
                            not line.startswith('Image Name') and not line.startswith('=')]
            tasklist_count = len(tasklist_lines)
        except Exception as e:
            tasklist_raw = f"Error: {e}"
            tasklist_count = 0
        
        # Method 2: Psutil
        try:
            psutil_count = 0
            psutil_pids = []
            for proc in psutil.process_iter(['pid', 'name']):
                try:
                    if proc.info['name'] == 'terminal.exe':
                        psutil_count += 1
                        psutil_pids.append(proc.info['pid'])
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
        except Exception as e:
            psutil_count = 0
            psutil_pids = []
        
        # Method 3: PyAutoGUI manager method
        try:
            manager_count = pyautogui_manager.get_running_terminal_count()
        except Exception as e:
            manager_count = f"Error: {e}"
        
        return {
            "success": True,
            "counting_methods": {
                "tasklist": {
                    "count": tasklist_count,
                    "raw_output": tasklist_raw,
                    "lines": tasklist_lines
                },
                "psutil": {
                    "count": psutil_count,
                    "pids": psutil_pids
                },
                "manager_method": {
                    "count": manager_count
                }
            },
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error in debug terminal count: {e}")
        return {
            "success": False,
            "error": str(e),
        "timestamp": datetime.now().isoformat()
    }

@api_router.get("/detail/{account_id}")
def get_account_by_id(account_id: str):
    """Get all accounts or specific accounts by ID"""
    try:
        # GET operations should work even when server is busy
        account = db_manager.get_account(account_id)
        
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
        
        # Convert Account object to dictionary format for consistent API responses
        account_dict = {
            "account_id": account.account_id,
            "login": account.login,
            "password": account.password,
            "server": account.server,
            "groupid": account.groupid,
            "platform_type": account.platform_type.value if account.platform_type else "mt4",
            "status": account.status,
            "name": account.name,
            "email": account.email,
            "user_id": account.user_id,
            "balance": account.balance,
            "equity": account.equity,
            "state": account.state,
            "created_at": account.created_at.isoformat() if account.created_at else None,
            "updated_at": account.updated_at.isoformat() if account.updated_at else None
        }

        return {
            "success": True,
            "account": account_dict
        }
    except Exception as e:
        logger.error(f"Error getting accounts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/detail/status/{account_id}")
def get_account_creation_status(account_id: str):
    """Get the creation status for an account"""
    try:
        logger.info(f"Getting creation status for account_id: {account_id}")
        
        # First check if account is being created (this takes priority)
        creation_status = get_creation_status(account_id)
        logger.info(f"Creation status lookup result for account_id {account_id}: {creation_status is not None}")
        
        if creation_status:
            logger.info(f"Account {account_id} is being created, step: {creation_status['step']}")
            # Account is being created - return current status
            step = creation_status["step"]
            steps_completed = creation_status.get("steps_completed", [])
            progress = get_step_progress(step, steps_completed)
            step_description = get_step_description(step)
            
            return {
                "success": True,
                "status": "creating",
                "message": creation_status["message"],
                "progress": progress,
                "step": step,
                "step_description": step_description,
                "start_time": creation_status["start_time"].isoformat(),
                "last_update": creation_status["last_update"].isoformat(),
                "estimated_completion": creation_status["estimated_completion"].isoformat() if creation_status["estimated_completion"] else None,
                "steps_completed": creation_status["steps_completed"]
            }
        
        # If not being created, check if account exists in database
        account = db_manager.get_account(account_id)
        logger.info(f"Database lookup result for account_id {account_id}: {account is not None}")
        
        if account:
            logger.info(f"Account found in database: {account.account_id}, login: {account.login}, state: {account.state}")
            
            # If account state is "creating", it's still being created
            if account.state == "creating":
                logger.info(f"Account {account_id} is still being created (state: creating)")
                # Check if we have creation status for this account
                creation_status = get_creation_status(account_id)
                if creation_status:
                    logger.info(f"Found creation status for account {account_id}, step: {creation_status['step']}")
                    step = creation_status["step"]
                    steps_completed = creation_status.get("steps_completed", [])
                    progress = get_step_progress(step, steps_completed)
                    step_description = get_step_description(step)
                    
                    return {
                        "success": True,
                        "status": "creating",
                        "message": creation_status["message"],
                        "progress": progress,
                        "step": step,
                        "step_description": step_description,
                        "start_time": creation_status["start_time"].isoformat(),
                        "last_update": creation_status["last_update"].isoformat(),
                        "estimated_completion": creation_status["estimated_completion"].isoformat() if creation_status["estimated_completion"] else None,
                        "steps_completed": creation_status["steps_completed"]
                    }
                else:
                    logger.warning(f"Account {account_id} has state 'creating' but no creation status found")
                    return {
                        "success": True,
                        "status": "creating",
                        "message": "Account creation request queued - waiting for available VM",
                        "progress": 0,
                        "step": "queued",
                        "step_description": "Account creation request queued - waiting for available VM"
                    }
            
            # Account exists and is not being created - return completed status
            return {
                "success": True,
                "status": "completed",
                "message": "Account already exists",
                "account": {
                    "account_id": account.account_id,
                    "login": account.login,
                    "server": account.server,
                    "name": account.name,
                    "email": account.email,
                    "groupid": account.groupid,
                    "status": account.status,
                    "state": account.state,
                    "balance": account.balance,
                    "equity": account.equity,
                    "platform_type": account.platform_type.value if hasattr(account.platform_type, 'value') else str(account.platform_type),
                    "created_at": account.created_at.isoformat() if account.created_at else None,
                    "updated_at": account.updated_at.isoformat() if account.updated_at else None
                },
                "progress": 100,
                "step": "completed",
                "step_description": "Account creation completed successfully"
            }
        
        # Account doesn't exist and is not being created
        # Let's check what accounts are actually in the database for debugging
        try:
            all_accounts = db_manager.get_all_accounts()
            logger.info(f"Total accounts in database: {len(all_accounts)}")
            account_ids = [acc.account_id for acc in all_accounts]
            logger.info(f"Available account IDs: {account_ids}")
        except Exception as e:
            logger.error(f"Error getting all accounts for debugging: {e}")
        
        return {
            "success": False,
            "status": "not_found",
            "message": f"Account {account_id} not found and not being created",
            "error_code": "ACCOUNT_NOT_FOUND"
        }
        
    except Exception as e:
        logger.error(f"Error getting account creation status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/accounts")
def get_accounts(account_ids: Optional[str] = None):
    """Get all accounts or specific accounts by ID"""
    try:
        # GET operations should work even when server is busy
        account_id_list = account_ids.split(',') if account_ids else None
        accounts = db_manager.get_accounts(account_id_list)
        account_list = [
            {
                "account_id": account.get("account_id"),
                "login": account.get("login"),
                "server": account.get("server"),
                "name": account.get("name"),
                "email": account.get("email"),
                "groupid": account.get("groupid"),
                "status": account.get("status", "1"),
                "state": account.get("state"),
                "balance": account.get("balance"),
                "equity": account.get("equity"),
                "created_at": account.get("created_at"),
                "updated_at": account.get("updated_at")
            } for account in accounts
        ]
        return {
            "success": True,
            "accounts": account_list
        }
    except Exception as e:
        logger.error(f"Error getting accounts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/accounts/terminals")
def get_terminal_accounts():
    """Get all accounts with detailed terminal status information"""
    try:
        # GET operations should work even when server is busy
        
        # Get all accounts
        accounts = db_manager.get_accounts()
        terminal_accounts = []
        running_terminals_count = 0
        paused_terminals_count = 0
        
        for account in accounts:
            try:
                # Get terminal records for this account
                terminals = db_manager.get_terminals_by_account(account.get("account_id"))
                terminal_info = None
                terminal_running = False
                terminal_status = "no_terminal"
                
                if terminals:
                    # Get the latest terminal record
                    latest_terminal = max(terminals, key=lambda t: t.start_time if t.start_time else datetime.min)
                    terminal_info = {
                        "terminal_id": latest_terminal.terminal_id,
                        "process_id": latest_terminal.process_id,
                        "status": latest_terminal.status.value,
                        "start_time": latest_terminal.start_time.isoformat() if latest_terminal.start_time else None,
                        "server_path": latest_terminal.server_path,
                        "data_path": latest_terminal.data_path
                    }
                    
                    # Check if the terminal process is actually running
                    if latest_terminal.process_id:
                        try:
                            import psutil
                            proc = psutil.Process(latest_terminal.process_id)
                            if proc.status() == psutil.STATUS_RUNNING:
                                terminal_running = True
                                terminal_status = "running"
                            else:
                                terminal_status = f"stopped ({proc.status()})"
                        except psutil.NoSuchProcess:
                            terminal_status = "process_not_found"
                        except Exception as e:
                            terminal_status = f"error_checking ({str(e)})"
                    else:
                        terminal_status = "no_terminal_record"
                
                # Get account balance and equity - try database first, then file
                balance = account.get('balance', None)
                equity = account.get('equity', None)
                
                # If no balance in database and terminal is running, try to read from file
                if (balance is None or balance == 0) and terminal_running:
                    try:
                        # Get platform_type from account
                        platform_type = getattr(account, 'platform_type', PlatformType.MT4)
                        account_data = read_account_data_from_file(account.get("login"), account.get("account_id"), platform_type)
                        if account_data:
                            balance = account_data.get('balance', 0)
                            equity = account_data.get('equity', 0)
                    except Exception as e:
                        logger.error(f"Error reading account data from file for account {account.get('account_id')}: {e}")
                
                # Determine account state and trading status
                account_state = account.get('state', None)
                account_status = account.get('status', None)
                has_balance = balance and float(balance) > 0
                is_connected = account_state == 'connected'
                # Paused accounts: status=0 (inactive) AND state=connected (was connected) AND has_balance
                is_paused = account_status == '0' and account_state == 'connected' and has_balance
                
                # Debug logging for terminal counting
                logger.debug(f"Account {account.get('account_id')} ({account.get('login')}): state={account_state}, balance={balance}, has_balance={has_balance}, terminal_running={terminal_running}, is_connected={is_connected}, is_paused={is_paused}")
                
                # Count terminals based on connection and balance status
                if has_balance:  # Only check for balance, not terminal_running
                    if is_connected and terminal_running:
                        running_terminals_count += 1
                        logger.debug(f"  -> Counted as RUNNING terminal (account {account.get('account_id')})")
                    elif is_paused:
                        # Count paused accounts even if terminal is not running (for load balancing)
                        paused_terminals_count += 1
                        logger.debug(f"  -> Counted as PAUSED terminal (account {account.get('account_id')}) - terminal_running={terminal_running}")
                    else:
                        logger.debug(f"  -> NOT counted: has_balance={has_balance}, is_connected={is_connected}, is_paused={is_paused}, terminal_running={terminal_running}")
                else:
                    logger.debug(f"  -> NOT counted: has_balance={has_balance}")
                
                account_info = {
                    "account_id": account.get("account_id"),
                    "login": account.get("login"),
                    "server": account.get("server"),
                    "name": account.get("name"),
                    "email": account.get("email"),
                    "groupid": account.get("groupid"),
                    "status": account.get("status"),
                    "state": account_state,
                    "balance": balance,
                    "equity": equity,
                    "created_at": account.get("created_at"),
                    "updated_at": account.get("updated_at"),
                    "terminal": {
                        "running": terminal_running,
                        "status": terminal_status,
                        "info": terminal_info
                    },
                    "trading_status": {
                        "has_balance": has_balance,
                        "is_connected": is_connected,
                        "is_paused": is_paused,
                        "can_trade": terminal_running and has_balance and is_connected,
                        "is_paused_with_balance": terminal_running and has_balance and is_paused
                    }
                }
                
                terminal_accounts.append(account_info)
                
            except Exception as e:
                logger.error(f"Error processing account {account.get('account_id')} for terminal status: {e}")
                # Still include the account even if there's an error
                account_info = {
                    "account_id": account.get("account_id"),
                    "login": account.get("login"),
                    "server": account.get("server"),
                    "name": account.get("name"),
                    "email": account.get("email"),
                    "groupid": account.get("groupid"),
                    "status": account.get("status"),
                    "state": account.get("state"),
                    "balance": account.get("balance"),
                    "equity": account.get("equity"),
                    "created_at": account.get("created_at"),
                    "updated_at": account.get("updated_at"),
                    "terminal": {
                        "running": False,
                        "status": "error_processing",
                        "info": None
                    },
                    "trading_status": {
                        "has_balance": False,
                        "is_connected": False,
                        "is_paused": False,
                        "can_trade": False,
                        "is_paused_with_balance": False
                    }
                }
                terminal_accounts.append(account_info)
        
        # Summary logging for terminal counting
        logger.info(f"Terminal counting summary: total_accounts={len(terminal_accounts)}, running_terminals={running_terminals_count}, paused_terminals={paused_terminals_count}, total_active_terminals={running_terminals_count + paused_terminals_count}")
        
        return {
            "success": True,
            "accounts": terminal_accounts,
            "total_accounts": len(terminal_accounts),
            "running_terminals": running_terminals_count,
            "paused_terminals": paused_terminals_count,
            "total_active_terminals": running_terminals_count + paused_terminals_count,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting terminal accounts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/accounts/{account_id}")
def get_account(account_id: str, action: Optional[str] = None):
    """Get a single account by ID with comprehensive terminal management"""
    try:
        account = db_manager.get_account(account_id)
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
        logger.info(f"Processing account {account_id} with action: {action}")
        if action == "launch":
            return handle_terminal_launch(account_id, account)
        elif action == "stop":
            return handle_terminal_stop(account_id)
        elif action == "restart":
            return handle_terminal_restart(account_id, account)
        elif action == "cleanup":
            return handle_terminal_cleanup(account_id)
        return handle_account_status_check(account_id, account)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing account {account_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def handle_account_status_check(account_id: str, account) -> Dict[str, Any]:
    """Handle account status check action"""
    try:
        logger.info(f"Checking account status for account {account_id}")
        
        # Get platform type from account
        platform_type = getattr(account, 'platform_type', PlatformType.MT4)
        
        # Check if terminal is running
        terminal_running = pyautogui_manager.is_terminal_running(
            account.get("login"), 
            account_id, 
            platform_type
        )
        
        if terminal_running:
            logger.info(f"Terminal is running for account {account_id}")
            
            # Try to read balance from account_data.json if not in database
            current_balance = getattr(account, 'balance', None)
            if not current_balance or current_balance == 0:
                logger.info(f"Balance not found in database for account {account_id}, reading from file...")
                account_data = read_account_data_from_file(
                    account.get("login"), 
                    account_id, 
                    platform_type
                )
                
                if account_data:
                    balance = account_data.get('balance', 0)
                    equity = account_data.get('equity', 0)
                    logger.info(f"Read balance from file: {balance}, equity: {equity}")
                    
                    # Update database with balance
                    if balance > 0:
                        update_account_state_if_connected(account_id, balance, equity)
                        return {
                            "success": True,
                            "message": f"Account {account_id} is connected with balance {balance}",
                            "account_id": account_id,
                            "status": "connected",
                            "balance": balance,
                            "equity": equity,
                            "terminal_running": True
                        }
            
            # Return current status
            balance = getattr(account, 'balance', 0) or 0
            equity = getattr(account, 'equity', 0) or 0
            state = getattr(account, 'state', 'unknown')
            
            return {
                "success": True,
                "message": f"Account {account_id} status: {state}",
                "account_id": account_id,
                "status": state,
                "balance": balance,
                "equity": equity,
                "terminal_running": True
            }
        else:
            logger.info(f"Terminal is not running for account {account_id}")
            balance = getattr(account, 'balance', 0) or 0
            equity = getattr(account, 'equity', 0) or 0
            state = getattr(account, 'state', 'unknown')
            
            return {
                "success": True,
                "message": f"Account {account_id} status: {state} (terminal not running)",
                "account_id": account_id,
                "status": state,
                "balance": balance,
                "equity": equity,
                "terminal_running": False
            }
            
    except Exception as e:
        logger.error(f"Error checking account status for account {account_id}: {e}")
        return {
            "success": False,
            "message": f"Error checking account status: {str(e)}",
            "account_id": account_id,
            "error": str(e)
        }

def handle_terminal_launch(account_id: str, account) -> Dict[str, Any]:
    """Handle terminal launch action using PyAutoGUI"""
    try:
        start_time = time.time()
        
        # Get platform type from account
        platform_type = getattr(account, 'platform_type', PlatformType.MT4)
        
        # Update status to initializing
        update_creation_status(account_id, CreationStep.INITIALIZING, "Initializing account creation process")
        
        # Check if terminal is already running by checking database first
        terminals = db_manager.get_terminals_by_account(account_id)
        terminal_already_running = False
        
        if terminals:
            latest_terminal = max(terminals, key=lambda t: t.start_time if t.start_time else datetime.min)
            if latest_terminal.process_id:
                try:
                    import psutil
                    proc = psutil.Process(latest_terminal.process_id)
                    if proc.status() == psutil.STATUS_RUNNING:
                        terminal_already_running = True
                        logger.info(f"Terminal already running for account {account_id} with PID {latest_terminal.process_id}")
                except psutil.NoSuchProcess:
                    logger.info(f"Terminal process {latest_terminal.process_id} no longer exists for account {account_id}")
                except Exception as e:
                    logger.warning(f"Error checking terminal process {latest_terminal.process_id} for account {account_id}: {e}")
        
        if terminal_already_running:
            return {
                "success": True,
                "message": f"Terminal already running for account {account_id}",
                "account_id": account_id,
                "terminal_status": "already_running",
                "duration": "0.00s"
            }
        
        logger.info(f" Starting PyAutoGUI {platform_type.value.upper()} terminal launch for account {account_id}")
        
        # Use the working create_and_launch_with_login method directly
        success, process_id, error_code = pyautogui_manager.create_and_launch_with_login(
            login=account.login,
            password=account.password,
            server=account.server,
            groupid=getattr(account, 'groupid', ''),
            account_id=account_id,
            platform_type=platform_type
        )
        
        duration = time.time() - start_time
        
        if success and process_id:
            # Verify that the terminal process is actually running
            logger.info(f" {platform_type.value.upper()} terminal launched successfully for account {account_id} with PID: {process_id}")
            
            # Wait a moment for process to stabilize
            time.sleep(2)
            
            # Verify process is still running
            try:
                import psutil
                proc = psutil.Process(process_id)
                if proc.status() == psutil.STATUS_RUNNING:
                    logger.info(f" {platform_type.value.upper()} terminal process {process_id} verified as running")
                    logger.info(f"🟢 Terminal will remain open and running - DO NOT CLOSE")
                    # Import config to check DEV_MODE
                    from config.config import config
                    
                    # Use account_id_login only in DEV_MODE, otherwise use just login
                    if config.DEV_MODE and account_id:
                        terminal_dir_name = f"{account_id}_{account.login}"
                    else:
                        terminal_dir_name = account.login
                    
                    # Get platform-specific paths
                    if platform_type == PlatformType.MT5:
                        server_path = f"C:/JamesPlatform/MT5Instances/{terminal_dir_name}"
                        data_path = f"C:/JamesPlatform/MT5Instances/{terminal_dir_name}/MQL5/Files"
                    else:
                        server_path = f"C:/JamesPlatform/MT4Instances/{terminal_dir_name}"
                        data_path = f"C:/JamesPlatform/MT4Instances/{terminal_dir_name}/MQL4/Files"
                        
                    terminal_data = {
                        "terminal_id": f"terminal_{account.login}_{int(time.time())}",
                        "account_id": account_id,
                                "platform_type": platform_type,
                        "process_id": process_id,
                        "status": TerminalStatus.RUNNING,
                        "start_time": datetime.now(),
                                "server_path": server_path,
                                "data_path": data_path
                    }
                    terminal = Terminal(**terminal_data)
                    db_manager.add_terminal(terminal)
                    return {
                        "success": True,
                                "message": f"{platform_type.value.upper()} terminal launched successfully for account {account_id} and will remain running",
                        "account_id": account_id,
                        "terminal_status": "running",
                        "process_id": process_id,
                        "duration": f"{duration:.2f}s"
                    }
                else:
                    logger.error(f" {platform_type.value.upper()} terminal process {process_id} died after launch: {proc.status()}")
                    # Clean up on process death
                    login = account.login
                    pyautogui_manager.stop_terminal(login, process_id, account_id, platform_type)
                    pyautogui_manager.cleanup_terminal_directory(login, account_id, platform_type)
                    db_manager.delete_terminals_by_account(account_id)
                    db_manager.delete_account(account_id)
                    return {
                        "success": False,
                        "message": f"{platform_type.value.upper()} terminal process died after launch for account {account_id}",
                        "error_code": "PROCESS_DIED",
                        "account_id": account_id,
                        "terminal_status": "failed",
                        "duration": f"{duration:.2f}s"
                    }
            except psutil.NoSuchProcess:
                logger.error(f" {platform_type.value.upper()} terminal process {process_id} no longer exists after launch")
                # Clean up on process death
                login = account.login
                pyautogui_manager.stop_terminal(login, process_id, account_id, platform_type)
                pyautogui_manager.cleanup_terminal_directory(login, account_id, platform_type)
                db_manager.delete_terminals_by_account(account_id)
                db_manager.delete_account(account_id)
                return {
                    "success": False,
                    "message": f"{platform_type.value.upper()} terminal process died after launch for account {account_id}",
                    "error_code": "PROCESS_DIED",
                    "account_id": account_id,
                    "terminal_status": "failed",
                    "duration": f"{duration:.2f}s"
                }
            except Exception as e:
                logger.error(f" Error verifying {platform_type.value.upper()} terminal process {process_id}: {e}")
                # Clean up on verification error
                login = account.login
                pyautogui_manager.stop_terminal(login, process_id, account_id, platform_type)
                pyautogui_manager.cleanup_terminal_directory(login, account_id, platform_type)
                db_manager.delete_terminals_by_account(account_id)
                db_manager.delete_account(account_id)
                return {
                    "success": False,
                    "message": f"Error verifying {platform_type.value.upper()} terminal process for account {account_id}: {e}",
                    "error_code": "VERIFICATION_ERROR",
                    "account_id": account_id,
                    "terminal_status": "failed",
                    "duration": f"{duration:.2f}s"
                }
        elif success and not process_id:
            logger.error(f" {platform_type.value.upper()} terminal launch reported success but no process ID returned for account {account_id}")
            # Clean up on missing process ID
            login = account.login
            pyautogui_manager.cleanup_terminal_directory(login, account_id, platform_type)
            db_manager.delete_terminals_by_account(account_id)
            db_manager.delete_account(account_id)
            return {
                "success": False,
                "message": f"{platform_type.value.upper()} terminal launch succeeded but no process ID returned for account {account_id}",
                "error_code": "NO_PROCESS_ID",
                "account_id": account_id,
                "terminal_status": "failed",
                "duration": f"{duration:.2f}s"
            }
        else:
            login = account.login
            logger.error(f" {platform_type.value.upper()} terminal launch failed with error code: {error_code}")
            
            # Handle different error types
            if error_code == "WRONG_CREDENTIALS":
                logger.error(f" Credential validation failed for account {account_id}")
                db_manager.delete_terminals_by_account(account_id)
                pyautogui_manager.cleanup_terminal_directory(login, account_id, platform_type)
                db_manager.delete_account(account_id)
                return {
                    "success": False,
                    "message": f"Wrong credentials for account {account_id}. Please check login, password, and server.",
                    "error_code": "WRONG_CREDENTIALS",
                    "account_id": account_id,
                    "terminal_status": "failed",
                    "duration": f"{duration:.2f}s"
                }
            elif error_code == "AUTOMATION_TEST_FAILED":
                logger.error(f" Automation test failed for account {account_id}")
                return {
                    "success": False,
                    "message": f"Automation test failed for account {account_id}. PyAutoGUI may not be working properly.",
                    "error_code": "AUTOMATION_TEST_FAILED",
                    "account_id": account_id,
                    "terminal_status": "failed",
                    "duration": f"{duration:.2f}s"
                }
            elif error_code == "PROCESS_DIED":
                logger.error(f" {platform_type.value.upper()} terminal process died for account {account_id}")
                return {
                    "success": False,
                    "message": f"{platform_type.value.upper()} terminal process died for account {account_id}.",
                    "error_code": "PROCESS_DIED",
                    "account_id": account_id,
                    "terminal_status": "failed",
                    "duration": f"{duration:.2f}s"
                }
            else:
                # Clean up on any other failure
                if process_id:
                    pyautogui_manager.stop_terminal(login, process_id, account_id, platform_type)
                pyautogui_manager.cleanup_terminal_directory(login, account_id, platform_type)
                db_manager.delete_terminals_by_account(account_id)
                db_manager.delete_account(account_id)
                return {
                    "success": False,
                    "message": f"Failed to launch {platform_type.value.upper()} terminal for account {account_id}. Error: {error_code}",
                    "error_code": error_code,
                    "account_id": account_id,
                    "terminal_status": "failed",
                    "duration": f"{duration:.2f}s"
                }
                
    except Exception as e:
        duration = time.time() - start_time if 'start_time' in locals() else 0
        logger.error(f"Error launching {platform_type.value.upper()} terminal for account {account_id} after {duration:.2f}s: {e}")
        return {
            "success": False,
            "message": f"Error launching {platform_type.value.upper()} terminal: {str(e)}",
            "error_code": "LAUNCH_ERROR",
            "account_id": account_id,
            "terminal_status": "error",
            "duration": f"{duration:.2f}s"
        }

def handle_terminal_stop(account_id: str) -> Dict[str, Any]:
    """Handle terminal stop action"""
    try:
        terminals = db_manager.get_terminals_by_account(account_id)
        stopped_count = 0
        for terminal in terminals:
            if terminal.status.value in ['running', 'connected', 'starting']:
                # Get account information for stop_terminal
                account = db_manager.get_account(account_id)
                if account:
                    login = getattr(account, 'login', '')
                    platform_type = getattr(account, 'platform_type', PlatformType.MT4)
                    # Convert platform_type to enum if it's a string
                    if isinstance(platform_type, str):
                        platform_type = PlatformType(platform_type)
                    success = pyautogui_manager.stop_terminal(login, terminal.process_id, account_id, platform_type)
                if success:
                    stopped_count += 1
                else:
                    logger.warning(f"Could not get account information for account {account_id}")
        if stopped_count > 0:
            db_manager.update_account(account_id, {
                "state": "stopped",
                "updated_at": datetime.now().isoformat()
            })
        return {
            "success": True,
            "message": f"Stopped {stopped_count} terminals for account {account_id}",
            "stopped_count": stopped_count,
            "account_id": account_id,
            "terminal_status": "stopped"
        }
    except Exception as e:
        logger.error(f"Error stopping terminals for account {account_id}: {e}")
        return {
            "success": False,
            "message": f"Error stopping terminals: {str(e)}",
            "error_code": "STOP_ERROR",
            "account_id": account_id,
            "terminal_status": "error"
        }

def handle_terminal_restart(account_id: str, account) -> Dict[str, Any]:
    """Handle terminal restart action"""
    try:
        stop_result = handle_terminal_stop(account_id)
        if not stop_result["success"]:
            return stop_result
        time.sleep(2)
        return handle_terminal_launch(account_id, account)
    except Exception as e:
        logger.error(f"Error restarting terminal for account {account_id}: {e}")
        return {
            "success": False,
            "message": f"Error restarting terminal: {str(e)}",
            "error_code": "RESTART_ERROR",
            "account_id": account_id,
            "terminal_status": "error"
        }

def handle_terminal_cleanup(account_id: str) -> Dict[str, Any]:
    """Handle terminal cleanup action"""
    try:
        terminals = db_manager.get_terminals_by_account(account_id)
        cleaned_count = 0
        for terminal in terminals:
            if terminal.status.value == 'failed':
                db_manager.delete_terminal(terminal.terminal_id)
                cleaned_count += 1
        return {
            "success": True,
            "message": f"Cleaned up {cleaned_count} failed terminals for account {account_id}",
            "cleaned_count": cleaned_count,
            "account_id": account_id
        }
    except Exception as e:
        logger.error(f"Error cleaning up terminals for account {account_id}: {e}")
        return {
            "success": False,
            "message": f"Error cleaning up terminals: {str(e)}",
            "error_code": "CLEANUP_ERROR",
            "account_id": account_id
        }

def update_account_state_if_connected(account_id: str, balance: float, equity: float = None) -> bool:
    """Update account state to 'connected' if balance > 0, 'no_balance' if balance = 0"""
    try:
        if balance and float(balance) > 0:
            update_data = {
                "state": "connected",
                "balance": str(balance),
                "updated_at": datetime.now().isoformat()
            }
            if equity is not None:
                update_data["equity"] = str(equity)
            success = db_manager.update_account(account_id, update_data)
            if success:
                logger.info(f" Account {account_id} state updated to 'connected' (balance: {balance})")
                return True
            else:
                logger.warning(f" Failed to update account {account_id} state to 'connected'")
                return False
        else:
            update_data = {
                "state": "no_balance",
                "balance": str(balance) if balance else "0",
                "updated_at": datetime.now().isoformat()
            }
            if equity is not None:
                update_data["equity"] = str(equity)
            success = db_manager.update_account(account_id, update_data)
            if success:
                logger.info(f" Account {account_id} state updated to 'no_balance' (balance: {balance})")
                return True
            else:
                logger.warning(f" Failed to update account {account_id} state to 'no_balance'")
                return False
    except Exception as e:
        logger.error(f"Error updating account state for {account_id}: {e}")
        return False

def read_account_data_from_file(login: str, account_id: str = None, platform_type: PlatformType = PlatformType.MT4) -> Optional[Dict[str, Any]]:
    """Read account data from the account_data.json file"""
    try:
        # Import config to check DEV_MODE
        from config.config import config
        
        # Use account_id_login only in DEV_MODE, otherwise use just login
        if config.DEV_MODE and account_id:
            terminal_dir_name = f"{account_id}_{login}"
        else:
            terminal_dir_name = login
        
        # Get platform-specific base path
        if platform_type == PlatformType.MT5:
            base_path = Path("C:/JamesPlatform/MT5Instances")
            mql_folder = "MQL5"
        else:
            base_path = Path("C:/JamesPlatform/MT4Instances")
            mql_folder = "MQL4"
        
        possible_paths = [
            base_path / terminal_dir_name / mql_folder / "Files" / "account_data.json",
            base_path / terminal_dir_name / "account_data.json",
            base_path / terminal_dir_name / "config" / "account_data.json"
        ]
        
        for path in possible_paths:
            if path.exists():
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        logger.info(f"Successfully read account data from {path}")
                        return data
                except json.JSONDecodeError as e:
                    logger.warning(f"Invalid JSON in {path}: {e}")
                except Exception as e:
                    logger.warning(f"Error reading {path}: {e}")
        
        logger.warning(f"Account data file not found for login {login} in {platform_type.value.upper()} paths")
        return None
        
    except Exception as e:
        logger.error(f"Error reading account data file for login {login}: {e}")
        return None

@api_router.get("/accounts/search")
def account_exists(login: str):
    """Check if an account exists by login"""
    try:
        account = db_manager.get_account_by_login(login)
        return {
            "success": True,
            "account_id": account.get("account_id") if account else "0"
        }
    except Exception as e:
        logger.error(f"Error checking account existence for login {login}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/accounts")
def create_account(request: AccountCreateRequest):
    """Create a new MetaTrader account with PyAutoGUI automation"""
    try:
        total_start_time = time.time()
        logger.info(f" Creating account with PyAutoGUI automation for login: {request.login}")
        
        # Debug: Log the received platform_type
        logger.info(f"DEBUG: Received platform_type: {request.platform_type}")
        logger.info(f"DEBUG: platform_type type: {type(request.platform_type)}")
        logger.info(f"DEBUG: platform_type value: {request.platform_type.value}")
        logger.info(f"DEBUG: Is MT5: {request.platform_type == PlatformType.MT5}")
        
        is_busy, busy_reason, duration = is_server_busy()
        if is_busy:
            return {
                "success": False,
                "message": f"Server is busy ({busy_reason}). Please try again later.",
                "error_code": "SERVER_BUSY",
                "duration": duration
            }
        
        existing_account = db_manager.get_account_by_login(request.login)
        if existing_account and not (config.DEV_MODE and config.DEV_MODE_ALLOW_DUPLICATES):
            raise HTTPException(status_code=400, detail="Account with this login already exists")
        if config.DEV_MODE and config.DEV_MODE_ALLOW_DUPLICATES and existing_account:
            logger.info(f" DEV_MODE: Allowing duplicate login {request.login} for testing purposes")
        if config.DEV_MODE and config.DEV_MODE_ALLOW_DUPLICATES:
            existing_accounts = db_manager.get_accounts_by_user_id(request.user_id or config.DEFAULT_USER_ID)
            next_id = len(existing_accounts) + 1
            account_id = str(next_id)
            logger.info(f" DEV_MODE: Generated unique account ID {account_id} for login {request.login}")
        else:
            account_id = f"{request.user_id or config.DEFAULT_USER_ID}"
        
        # Initialize status tracking with correct account_id
        update_creation_status(account_id, CreationStep.QUEUED, "Account creation request queued - waiting for available VM")
        
        # Check if account already exists by account_id
        existing_account_by_id = db_manager.get_account(account_id)
        if existing_account_by_id:
            logger.info(f"Account with ID {account_id} already exists, returning existing account")
            # Return existing account data instead of creating new one
            return {
                "success": True,
                "message": f"Account {account_id} already exists",
                "account": {
                    "account_id": existing_account_by_id.account_id,
                    "login": existing_account_by_id.login,
                    "server": existing_account_by_id.server,
                    "name": existing_account_by_id.name,
                    "email": existing_account_by_id.email,
                    "groupid": existing_account_by_id.groupid,
                    "status": existing_account_by_id.status,
                    "state": existing_account_by_id.state,
                    "balance": existing_account_by_id.balance,
                    "equity": existing_account_by_id.equity,
                    "platform_type": existing_account_by_id.platform_type.value if hasattr(existing_account_by_id.platform_type, 'value') else str(existing_account_by_id.platform_type),
                    "created_at": existing_account_by_id.created_at.isoformat() if existing_account_by_id.created_at else None,
                    "updated_at": existing_account_by_id.updated_at.isoformat() if existing_account_by_id.updated_at else None
                },
                "duration": "0.00s"
            }
        
        # Update status to creating account
        update_creation_status(account_id, CreationStep.INITIALIZING, "Initializing account creation process")
        
        account_data = {
            "account_id": account_id,
            "login": request.login,
            "password": request.password,
            "server": request.server,
            "name": request.name,
            "email": request.email,
            "groupid": request.groupid,
            "subscription": request.subscription,
            "environment": request.environment,
            "status": request.status,
            "broker": request.broker,
            "user_id": request.user_id or config.DEFAULT_USER_ID,
            "platform_type": request.platform_type,
            "state": "creating",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }
        success = db_manager.create_account(account_data)
        if not success:
            logger.error(f"Failed to create account {account_id} in database")
            update_creation_status(account_id, CreationStep.FAILED, "Failed to create account in database")
            raise HTTPException(status_code=500, detail="Failed to create account in database")
        set_server_busy(f"Creating account {account_id} with PyAutoGUI automation")
        try:
            step1_start = time.time()
            # Update status to automating login
            update_creation_status(account_id, CreationStep.AUTOMATING_LOGIN, "Automating login process")
            terminal_result = handle_terminal_launch(account_id, type('Account', (), account_data)())
            step1_duration = time.time() - step1_start
            
            if not terminal_result["success"]:
                logger.error(f" Terminal launch failed: {terminal_result['message']}")
                
                # Handle specific error types
                if terminal_result.get("error_code") == "WRONG_CREDENTIALS":
                    update_creation_status(account_id, CreationStep.FAILED, f"Wrong credentials for account {account_id}")
                    return {
                        "success": False,
                        "message": f"Wrong credentials for account {account_id}. Please check login, password, and server.",
                        "error_code": "WRONG_CREDENTIALS",
                        "account_id": account_id,
                        "duration": f"{step1_duration:.2f}s"
                    }
                elif terminal_result.get("error_code") == "AUTOMATION_TEST_FAILED":
                    update_creation_status(account_id, CreationStep.FAILED, f"Automation test failed for account {account_id}")
                    return {
                        "success": False,
                        "message": f"Automation test failed for account {account_id}. PyAutoGUI may not be working properly.",
                        "error_code": "AUTOMATION_TEST_FAILED",
                        "account_id": account_id,
                        "duration": f"{step1_duration:.2f}s"
                    }
                elif terminal_result.get("error_code") == "PROCESS_DIED":
                    update_creation_status(account_id, CreationStep.FAILED, f"Terminal process died for account {account_id}")
                    return {
                        "success": False,
                        "message": f"Terminal process died for account {account_id}.",
                        "error_code": "PROCESS_DIED",
                        "account_id": account_id,
                        "duration": f"{step1_duration:.2f}s"
                    }
                else:
                    # Update account state to failed for other errors
                    update_creation_status(account_id, CreationStep.FAILED, f"Terminal launch failed: {terminal_result['message']}")
                    db_manager.update_account(account_id, {
                        "state": "failed",
                        "updated_at": datetime.now().isoformat()
                    })
                    raise HTTPException(status_code=500, detail=f"Terminal launch failed: {terminal_result['message']}")
            
            # Success case - terminal launched successfully
            total_duration = time.time() - total_start_time
            
            # Note: The actual login automation and validation is still running in the background
            # The status will be updated by the pyautogui_manager during the process
            # We don't set status to COMPLETED here because the process is still ongoing
            
            logger.info(f"Terminal launched successfully for account {account_id}. Login automation is running in background.")
            
            # Wait a moment for the terminal automation to potentially read account data
            time.sleep(3)
            
            # Get the current account data from database to return accurate balance/equity
            current_account = db_manager.get_account(account_id)
            current_balance = getattr(current_account, 'balance', 0) if current_account else 0
            current_equity = getattr(current_account, 'equity', 0) if current_account else 0

            account_dict = {
                "account_id": account_id,
                "login": request.login,
                "server": request.server,
                "name": request.name,
                "email": request.email,
                "groupid": request.groupid,
                "status": request.status,
                "state": "creating",  # Still creating, not completed
                "balance": current_balance,
                "equity": current_equity,
                "created_at": account_data["created_at"],
                "updated_at": datetime.now().isoformat()
            }
            logger.info(f"DEBUG: Is account_dict: {account_dict} {current_account}")
            
            # Return success response but don't mark as completed yet
            return {
                "success": True,
                "account": account_dict,
                "automation": {
                    "terminal_launch": {
                        "success": True,
                        "duration": f"{step1_duration:.2f}s",
                        "message": "Terminal launched successfully. Login automation is running in background."
                    }
                },
                "message": f"Account {account_id} terminal launched successfully. Login automation is running in background.",
                "duration": f"{total_duration:.2f}s"
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating account: {e}")
            # Update account state to failed
            update_creation_status(account_id, CreationStep.FAILED, f"Error creating account: {str(e)}")
            db_manager.update_account(account_id, {
                "state": "failed",
                "updated_at": datetime.now().isoformat()
            })
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            set_server_ready()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating account: {e}")
        set_server_ready()
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/accounts/{account_id}")
def update_account(account_id: str, request: AccountUpdateRequest):
    """Update an existing account"""
    try:
        # PUT operations should work even when server is busy (except for resume operations)
        # Only block if this is a resume operation (status change from 0 to 1)
        if request.status == '1':
            # Check if current status is 0 (paused) - this would be a resume operation
            existing_account = db_manager.get_account(account_id)
            if existing_account and getattr(existing_account, 'status', None) == '0':
                # This is a resume operation - check if server is busy
                is_busy, busy_reason, duration = is_server_busy()
                if is_busy:
                    return {
                        "success": False,
                        "message": f"Server is busy ({busy_reason}). Please try again later.",
                        "error_code": "SERVER_BUSY",
                        "duration": duration
                    }
        existing_account = db_manager.get_account(account_id)
        if not existing_account:
            raise HTTPException(status_code=404, detail="Account not found")
        should_stop_terminal = False
        should_start_terminal = False
        if request.status is not None:
            current_status = getattr(existing_account, 'status', None)
            if request.status == '0' and current_status != '0':
                # PAUSE: Simply stop the terminal
                should_stop_terminal = True
                logger.info(f" Account {account_id} status being set to '0' (PAUSE) - will stop terminal")
            elif request.status == '1' and current_status == '0':
                # RESUME: Simply start the terminal
                should_start_terminal = True
                logger.info(f" Account {account_id} status being set to '1' (RESUME) - will start terminal")
        update_data = {"updated_at": datetime.now().isoformat()}
        if request.name is not None:
            update_data["name"] = request.name
        if request.status is not None:
            update_data["status"] = request.status
        if request.groupid is not None:
            update_data["groupid"] = request.groupid
        if request.state is not None:
            update_data["state"] = request.state
            logger.info(f" Account {account_id} state being updated to: {request.state}")
        db_manager.update_account(account_id, update_data)
        if should_stop_terminal:
            try:
                logger.info(f" Stopping terminal for account {account_id} (status set to '0')")
                process_id = None
                try:
                    terminals = db_manager.get_terminals_by_account(account_id)
                    if terminals:
                        latest_terminal = max(terminals, key=lambda t: t.start_time if t.start_time else datetime.min)
                        process_id = latest_terminal.process_id
                        logger.info(f"Found process ID {process_id} for account {account_id}")
                    else:
                        logger.info(f"No terminal records found for account {account_id}")
                except Exception as e:
                    logger.warning(f"Error getting process ID from database: {e}")
                # Get platform_type from account
                platform_type = getattr(existing_account, 'platform_type', PlatformType.MT4)
                stop_success = pyautogui_manager.stop_terminal(existing_account.login, process_id, account_id, platform_type)
                if stop_success:
                    logger.info(f" Terminal stopped successfully for account {account_id}")
                else:
                    logger.warning(f" Failed to stop terminal for account {account_id}")
            except Exception as e:
                logger.error(f"Error stopping terminal for account {account_id}: {e}")
        if should_start_terminal:
            set_server_busy(f"Starting terminal for account {account_id}")
            try:
                logger.info(f" Starting terminal for account {account_id} (status set to '1')")
                # Resume terminal only without automation
                success, process_id, error_code = pyautogui_manager.resume_terminal_only(
                        login=existing_account.login,
                    platform_type=getattr(existing_account, 'platform_type', PlatformType.MT4)
                    )
                if success and process_id:
                    # Update terminal record
                    terminal_updates = {
                        "process_id": process_id,
                        "status": "running",
                        "start_time": datetime.now().isoformat()
                    }
                    
                    # Get existing terminal record
                    terminals = db_manager.get_terminals_by_account(account_id)
                    if terminals:
                        latest_terminal = max(terminals, key=lambda t: t.start_time if t.start_time else datetime.min)
                        db_manager.update_terminal(latest_terminal.terminal_id, terminal_updates)
                        logger.info(f" Terminal started successfully for account {account_id} with PID {process_id}")
                    else:
                        logger.warning(f"No terminal record found for account {account_id}")
                else:
                    logger.warning(f" Failed to start terminal for account {account_id}: {error_code}")
            except Exception as e:
                logger.error(f"Error starting terminal for account {account_id} after status change: {e}")
            finally:
                set_server_ready()
        updated_account = db_manager.get_account(account_id)
        if updated_account is not None:
            return {
                "success": True,
                "account": {
                    "account_id": updated_account.account_id,
                    "login": updated_account.login,
                    "server": updated_account.server,
                    "name": updated_account.name,
                    "email": updated_account.email,
                    "groupid": getattr(updated_account, 'groupid', None),
                    "status": updated_account.status,
                    "state": getattr(updated_account, 'state', None),
                    "balance": getattr(updated_account, 'balance', None),
                    "equity": getattr(updated_account, 'equity', None),
                    "created_at": getattr(updated_account, 'created_at', None),
                    "updated_at": getattr(updated_account, 'updated_at', None)
                }
            }
        else:
            raise HTTPException(status_code=404, detail="Account not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating account {account_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/accounts/{account_id}")
def delete_account(account_id: str):
    """Delete account and clean up all associated resources"""
    try:
        logger.info(f" Starting account deletion for account_id: {account_id}")
        account = db_manager.get_account(account_id)
        if not account:
            raise HTTPException(status_code=404, detail=f"Account {account_id} not found")
        login = account.login
        # Debug: Log platform_type information
        platform_type = getattr(account, 'platform_type', PlatformType.MT4)
        logger.info(f" Account details: login={login}, account_id={account_id}, platform_type={platform_type}")
        if hasattr(platform_type, 'value'):
            logger.info(f" Platform type value: {platform_type.value}")
        else:
            logger.info(f" Platform type is not an enum: {type(platform_type)}")
        try:
            logger.info(f" Step 1: Stopping terminal for login {login}")
            process_id = None
            try:
                terminals = db_manager.get_terminals_by_account(account_id)
                if terminals:
                    latest_terminal = max(terminals, key=lambda t: t.start_time if t.start_time else datetime.min)
                    process_id = latest_terminal.process_id
                    logger.info(f"Found process ID {process_id} for account {account_id}")
                else:
                    logger.info(f"No terminal records found for account {account_id}")
            except Exception as e:
                logger.warning(f"Error getting process ID from database: {e}")
            # Get platform_type from account
            platform_type = getattr(account, 'platform_type', PlatformType.MT4)
            stop_success = pyautogui_manager.stop_terminal(login, process_id, account_id, platform_type)
            if stop_success:
                logger.info(f" Terminal stopped successfully for login {login}")
            else:
                logger.warning(f" PyAutoGUI terminal stop failed for login {login}")
                logger.info(f" Attempting force stop for login {login}")
                force_stop_success = pyautogui_manager.stop_all_terminals()
                if force_stop_success:
                    logger.info(f" Force stop successful for login {login}")
                else:
                    logger.warning(f" Force stop also failed for login {login}")
        except Exception as e:
            logger.error(f"Error stopping terminal for account {account_id}: {e}")
        try:
            logger.info(f"🧹 Step 2: Cleaning up terminal directory for login {login}")
            
            # Get platform_type from account
            platform_type = getattr(account, 'platform_type', PlatformType.MT4)
            if hasattr(platform_type, 'value'):
                platform_type = platform_type.value
            
            logger.info(f" Using platform_type for cleanup: {platform_type}")
            cleanup_success = pyautogui_manager.cleanup_terminal_directory(login, account_id, platform_type)
            if cleanup_success:
                logger.info(f" Terminal directory cleaned successfully for login {login}")
            else:
                logger.warning(f" Terminal directory cleanup failed for login {login}")
                logger.info(f" Attempting manual directory cleanup for login {login}")
                manual_cleanup_success = _manual_cleanup_terminal_directory(login, account_id, platform_type)
                if manual_cleanup_success:
                    logger.info(f" Manual cleanup successful for login {login}")
                else:
                    logger.error(f" Manual cleanup also failed for login {login}")
        except Exception as e:
            logger.error(f"Error cleaning up terminal directory for login {login}: {e}")
        try:
            logger.info(f" Step 3: Deleting terminal records from database")
            terminal_delete_success = db_manager.delete_terminals_by_account(account_id)
            if terminal_delete_success:
                logger.info(f" Terminal records deleted from database")
            else:
                logger.warning(f" Failed to delete terminal records from database")
        except Exception as e:
            logger.error(f"Error deleting terminal records from database: {e}")
        try:
            logger.info(f" Step 4: Deleting account from database")
            success = db_manager.delete_account(account_id)
            if not success:
                raise HTTPException(status_code=500, detail="Failed to delete account from database")
            logger.info(f" Account deleted from database")
        except Exception as e:
            logger.error(f"Error deleting account from database: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to delete account from database: {e}")
        try:
            logger.info(f" Step 5: Final verification")
            time.sleep(2)
            # Check if terminal is still running by checking database first
            terminals = db_manager.get_terminals_by_account(account_id)
            still_running = False
            
            if terminals:
                latest_terminal = max(terminals, key=lambda t: t.start_time if t.start_time else datetime.min)
                if latest_terminal.process_id:
                    try:
                        import psutil
                        proc = psutil.Process(latest_terminal.process_id)
                        if proc.status() == psutil.STATUS_RUNNING:
                            still_running = True
                    except psutil.NoSuchProcess:
                        pass
                    except Exception as e:
                        logger.warning(f"Error checking terminal process {latest_terminal.process_id} for account {account_id}: {e}")
            if still_running:
                logger.warning(f" Terminal still running for login {login} after deletion")
                logger.info(f" Final force stop attempt for login {login}")
                pyautogui_manager.stop_all_terminals()
            else:
                logger.info(f" Terminal confirmed stopped for login {login}")
            # Import config to check DEV_MODE
            from config.config import config
            
            # Get platform_type from account
            platform_type = getattr(account, 'platform_type', PlatformType.MT4)
            if hasattr(platform_type, 'value'):
                platform_type = platform_type.value
            
            # Use account_id_login only in DEV_MODE, otherwise use just login
            if config.DEV_MODE and account_id:
                terminal_dir_name = f"{account_id}_{login}"
            else:
                terminal_dir_name = login
            
            # Get platform-specific base path
            if platform_type == "mt5":
                base_path = Path("C:/JamesPlatform/MT5Instances")
            else:
                base_path = Path("C:/JamesPlatform/MT4Instances")
                
            terminal_path = base_path / terminal_dir_name
            if terminal_path.exists():
                logger.warning(f" Terminal directory still exists: {terminal_path}")
                logger.info(f" Final manual cleanup attempt for login {login}")
                _manual_cleanup_terminal_directory(login, account_id, platform_type)
            else:
                logger.info(f" Terminal directory confirmed removed for login {login}")
        except Exception as e:
            logger.warning(f"Error during final verification: {e}")
        logger.info(f" Account deletion completed successfully for account_id: {account_id}")
        return {
            "success": True,
            "message": f"Account {account_id} deleted successfully",
            "account": {
                "account_id": account_id,
                "login": login,
                "status": "deleted"
            },
            "cleanup": {
                "terminal_stopped": True,
                "directory_cleaned": True,
                "terminal_records_deleted": True,
                "account_deleted": True,
                "final_verification": True
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting account {account_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def _manual_cleanup_terminal_directory(login: str, account_id: str = None, platform_type = "mt4") -> bool:
    """Manually cleanup terminal directory"""
    try:
        logger.info(f"Starting manual cleanup of terminal directory for login: {login} with platform_type: {platform_type}")
        
        # Import config to check DEV_MODE
        from config.config import config
        
        # Use account_id_login only in DEV_MODE, otherwise use just login
        if config.DEV_MODE and account_id:
            terminal_dir_name = f"{account_id}_{login}"
        else:
            terminal_dir_name = login
        
        # Get platform-specific base path
        if platform_type == "mt5":
            base_path = Path("C:/JamesPlatform/MT5Instances")
        else:
            base_path = Path("C:/JamesPlatform/MT4Instances")
        
        terminal_path = base_path / terminal_dir_name
        
        if terminal_path.exists():
            logger.info(f"Found terminal directory: {terminal_path}")
            try:
                shutil.rmtree(terminal_path)
                logger.info(f"Successfully cleaned up terminal directory: {terminal_path}")
                return True
            except Exception as e:
                logger.error(f"Error cleaning up terminal directory {terminal_path}: {e}")
                return False
        else:
            logger.info(f"Terminal directory not found: {terminal_path}")
            return True  # Consider it cleaned if it doesn't exist
            
    except Exception as e:
        logger.error(f"Error in manual cleanup for login {login}: {e}")
        return False

@app.post("/ea-data")
def receive_ea_data(request: EADataRequest):
    """Receive account data from Expert Advisor and save to database"""
    try:
        logger.info("Received EA data request")
        try:
            ea_data = json.loads(request.data)
            logger.info(f"Parsed EA data: {ea_data}")
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON from EA: {e}")
            raise HTTPException(status_code=400, detail="Invalid JSON data")
        login = ea_data.get("login")
        if not login:
            raise HTTPException(status_code=400, detail="Login ID missing from EA data")
        account_dict = db_manager.get_account_by_login(login)
        if not account_dict:
            logger.warning(f"Account not found for login {login}, creating new account")
            account_data = {
                "login": login,
                "password": "",
                "server": ea_data.get("server", ""),
                "name": f"EA Account {login}",
                "email": f"ea_{login}@jamesplatform.com",
                "groupid": "EA",
                "status": "1",
                "broker": "mt4",
                "environment": "Real"
            }
            account_id = db_manager.create_account(account_data)
            if not account_id:
                raise HTTPException(status_code=500, detail="Failed to create account")
            account_dict = db_manager.get_account_by_login(login)
            if not account_dict:
                raise HTTPException(status_code=500, detail="Failed to retrieve created account")
        balance = ea_data.get("balance", 0.0)
        equity = ea_data.get("equity", 0.0)
        state_updated = update_account_state_if_connected(account_dict["account_id"], balance, equity)
        history_success = db_manager.save_account_history(account_dict["account_id"], ea_data)
        logger.info(f"EA data processed for account {account_dict['account_id']}: Balance={balance}, Equity={equity}, State={'connected' if state_updated else 'update_failed'}, History={'saved' if history_success else 'failed'}")
        return ApiResponse(
            success=True,
            message="EA data received and saved successfully",
            data={
                "account_id": account_dict["account_id"],
                "login": login,
                "balance": balance,
                "equity": equity,
                "state": "connected" if state_updated else "update_failed",
                "history_saved": history_success,
                "timestamp": ea_data.get("timestamp")
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing EA data: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time EA data communication"""
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
    """WebSocket endpoint for specific account real-time data"""
    await websocket_manager.connect(websocket, account_id)
    try:
        account = db_manager.get_account(account_id)
        if account:
            await websocket_manager.send_personal_message(
                json.dumps({
                    "type": "account_data",
                    "account_id": account_id,
                    "data": {
                        "balance": getattr(account, 'balance', None),
                        "equity": getattr(account, 'equity', None),
                        "state": getattr(account, 'state', None),
                        "timestamp": datetime.now().isoformat()
                    }
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

@api_router.get("/accounts/state/{state}")
def get_accounts_by_state(state: str):
    """Get accounts filtered by state (e.g., connected, paused, no_balance, etc.)"""
    try:
        # GET operations should work even when server is busy
        
        # Get all accounts
        accounts = db_manager.get_accounts()
        filtered_accounts = []
        
        for account in accounts:
            try:
                # Get terminal records for this account
                terminals = db_manager.get_terminals_by_account(account.get("account_id"))
                terminal_info = None
                terminal_running = False
                terminal_status = "no_terminal"
                
                if terminals:
                    # Get the latest terminal record
                    latest_terminal = max(terminals, key=lambda t: t.start_time if t.start_time else datetime.min)
                    terminal_info = {
                        "terminal_id": latest_terminal.terminal_id,
                        "process_id": latest_terminal.process_id,
                        "status": latest_terminal.status.value,
                        "start_time": latest_terminal.start_time.isoformat() if latest_terminal.start_time else None,
                        "server_path": latest_terminal.server_path,
                        "data_path": latest_terminal.data_path
                    }
                    
                    # Check if the terminal process is actually running
                    if latest_terminal.process_id:
                        try:
                            import psutil
                            proc = psutil.Process(latest_terminal.process_id)
                            if proc.status() == psutil.STATUS_RUNNING:
                                terminal_running = True
                                terminal_status = "running"
                            else:
                                terminal_status = f"stopped ({proc.status()})"
                        except psutil.NoSuchProcess:
                            terminal_status = "process_not_found"
                        except Exception as e:
                            terminal_status = f"error_checking ({str(e)})"
                    else:
                        terminal_status = "no_process_id"
                else:
                    terminal_status = "no_terminal_record"
                
                # Get account balance and equity
                balance = account.get('balance', None)
                equity = account.get('equity', None)
                account_state = account.get('state', None)
                
                # Filter by state
                if account_state == state:
                    account_info = {
                        "account_id": account.get("account_id"),
                        "login": account.get("login"),
                        "server": account.get("server"),
                        "name": account.get("name"),
                        "email": account.get("email"),
                        "groupid": account.get("groupid"),
                        "status": account.get("status"),
                        "state": account_state,
                        "balance": balance,
                        "equity": equity,
                        "created_at": account.get("created_at"),
                        "updated_at": account.get("updated_at"),
                        "terminal": {
                            "running": terminal_running,
                            "status": terminal_status,
                            "info": terminal_info
                        },
                        "trading_status": {
                            "has_balance": balance and float(balance) > 0,
                            "is_connected": account_state == 'connected',
                            "is_paused": account_state == 'paused',
                            "can_trade": terminal_running and balance and account_state == 'connected',
                            "is_paused_with_balance": terminal_running and balance and account_state == 'paused'
                        }
                    }
                    filtered_accounts.append(account_info)
                    
            except Exception as e:
                logger.error(f"Error processing account {account.get('account_id')} for state filter: {e}")
                continue
        
        return {
            "success": True,
            "state": state,
            "accounts": filtered_accounts,
            "total_accounts": len(filtered_accounts),
            "running_terminals": sum(account["terminal"]["running"] for account in filtered_accounts),
            "paused_terminals": sum(account["terminal"]["running"] and account["trading_status"]["is_paused"] for account in filtered_accounts),
            "total_active_terminals": sum(account["terminal"]["running"] for account in filtered_accounts),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting accounts by state {state}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/accounts/paused-with-balance")
def get_paused_accounts_with_balance():
    """Get accounts that are paused but have balance and terminals running"""
    try:
        # GET operations should work even when server is busy
        
        # Get all accounts
        accounts = db_manager.get_accounts()
        paused_accounts = []
        paused_terminals_count = 0
        
        for account in accounts:
            try:
                # Get terminal records for this account
                terminals = db_manager.get_terminals_by_account(account.get("account_id"))
                terminal_info = None
                terminal_running = False
                terminal_status = "no_terminal"
                
                if terminals:
                    # Get the latest terminal record
                    latest_terminal = max(terminals, key=lambda t: t.start_time if t.start_time else datetime.min)
                    terminal_info = {
                        "terminal_id": latest_terminal.terminal_id,
                        "process_id": latest_terminal.process_id,
                        "status": latest_terminal.status.value,
                        "start_time": latest_terminal.start_time.isoformat() if latest_terminal.start_time else None,
                        "server_path": latest_terminal.server_path,
                        "data_path": latest_terminal.data_path
                    }
                    
                    # Check if the terminal process is actually running
                    if latest_terminal.process_id:
                        try:
                            import psutil
                            proc = psutil.Process(latest_terminal.process_id)
                            if proc.status() == psutil.STATUS_RUNNING:
                                terminal_running = True
                                terminal_status = "running"
                            else:
                                terminal_status = f"stopped ({proc.status()})"
                        except psutil.NoSuchProcess:
                            terminal_status = "process_not_found"
                        except Exception as e:
                            terminal_status = f"error_checking ({str(e)})"
                    else:
                        terminal_status = "no_process_id"
                else:
                    terminal_status = "no_terminal_record"
                
                # Get account balance and equity
                balance = account.get('balance', None)
                equity = account.get('equity', None)
                account_state = account.get('state', None)
                account_status = account.get('status', None)
                
                # Check if this is a paused account with balance and running terminal
                has_balance = balance and float(balance) > 0
                # Paused accounts: status=0 (inactive) AND state=connected (was connected) AND has_balance
                is_paused = account_status == '0' and account_state == 'connected' and has_balance
                
                if is_paused and has_balance and terminal_running:
                    paused_terminals_count += 1
                    
                    account_info = {
                        "account_id": account.get("account_id"),
                        "login": account.get("login"),
                        "server": account.get("server"),
                        "name": account.get("name"),
                        "email": account.get("email"),
                        "groupid": account.get("groupid"),
                        "status": account.get("status"),
                        "state": account_state,
                        "balance": balance,
                        "equity": equity,
                        "created_at": account.get("created_at"),
                        "updated_at": account.get("updated_at"),
                        "terminal": {
                            "running": terminal_running,
                            "status": terminal_status,
                            "info": terminal_info
                        },
                        "trading_status": {
                            "has_balance": has_balance,
                            "is_connected": False,
                            "is_paused": is_paused,
                            "can_trade": False,
                            "is_paused_with_balance": True
                        }
                    }
                    
                    paused_accounts.append(account_info)
                
            except Exception as e:
                logger.error(f"Error processing account {account.account_id} for paused status: {e}")
        
        return {
            "success": True,
            "description": "Accounts that are paused but have balance and terminals running",
            "accounts": paused_accounts,
            "total_paused_accounts": len(paused_accounts),
            "paused_terminals_count": paused_terminals_count,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting paused accounts with balance: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/ea-data")
async def receive_ea_data(request: EADataRequest):
    """Receive real-time EA data and handle connection status"""
    try:
        logger.info(f"Received EA data for account {request.login} from {request.source}")
        
        # Check if account exists by login
        # try:
        #     account_dict = db_manager.get_account_by_login(request.login)
        #     if not account_dict:
        #         logger.warning(f"Account with login {request.login} not found in database")
        #         raise HTTPException(status_code=404, detail=f"Account with login {request.login} not found")
            
        #     # Get the actual account_id from the database
        #     actual_account_id = account_dict.get('account_id')
        #     logger.info(f"Found account with login {request.login}, account_id: {actual_account_id}")
            
        #     # Verify account_id matches if provided
        #     if request.account_id and request.account_id != str(actual_account_id):
        #         logger.warning(f"Account ID mismatch for login {request.login}: EA={request.account_id}, DB={actual_account_id}")
        #         # Don't raise error, just log warning and use the actual account_id
            
        # except Exception as e:
        #     logger.error(f"Error verifying account {request.account_id}: {e}")
        #     raise HTTPException(status_code=500, detail=str(e))
        
        # # Handle connection status
        # if request.connected:
        #     # Account is connected - clear any disconnect timer
        #     handle_connected_account(actual_account_id, request.login)
        #     logger.info(f"Account {actual_account_id} (login: {request.login}) is connected")
        # else:
        #     # Account is disconnected - start/update disconnect timer
        #     handle_disconnected_account(actual_account_id, request.login)
        #     logger.warning(f"Account {actual_account_id} (login: {request.login}) is disconnected")
        
        # # Check disconnect timers for cleanup
        # check_disconnect_timers()
        
        # # Update account data in database if connected
        # if request.connected:
        #     try:
        #         update_data = {
        #             'balance': request.balance,
        #             'equity': request.equity,
        #             'updated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        #         }
        #         db_manager.update_account(actual_account_id, update_data)
        #         logger.info(f"Updated account {actual_account_id} with new balance/equity data")
        #     except Exception as e:
        #         logger.error(f"Error updating account {actual_account_id} data: {e}")
        
        return {
            "success": True,
            "message": f"EA data processed for (login: {request.login})",
            "connected": request.connected,
            "timestamp": request.timestamp
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing EA data for account {request.account_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/terminals/restart-all")
async def restart_all_terminals():
    """Restart all terminals by stopping them first, then restarting them"""
    try:
        logger.info("🔄 Starting restart all terminals process...")
        
        # Step 1: Stop all running terminals
        logger.info("🛑 Step 1: Stopping all running terminals...")
        stopped_count = 0
        failed_stops = 0
        
        # First, get all running terminal processes and stop them directly
        logger.info("🔍 Finding all running terminal processes...")
        all_terminals_stopped = pyautogui_manager.force_stop_all_terminals()
        logger.info(f"🛑 Force stopped all terminals: {all_terminals_stopped}")
        
        # Get all accounts and track which ones were running
        accounts = db_manager.get_accounts()
        running_accounts = []  # Track accounts that were running before restart
        
        for account in accounts:
            try:
                account_id = account.get('account_id')
                login = account.get('login')
                
                # Check if terminal was running before stopping
                was_running = pyautogui_manager.is_terminal_running(login, account_id)
                
                if was_running:
                    # Only update state to stopped for accounts that were actually running
                    db_manager.update_account(account_id, {
                        "state": "stopped",
                        "updated_at": datetime.now().isoformat()
                    })
                    running_accounts.append(account_id)
                    stopped_count += 1
                    logger.info(f"✅ Account {account_id} ({login}) had running terminal - marked for restart")
                else:
                    logger.debug(f"Account {account_id} ({login}) had no running terminal - will not restart")
                    
            except Exception as e:
                logger.error(f"Error checking account {account.get('account_id')}: {e}")
                failed_stops += 1
                continue
        
        logger.info(f"🛑 Stopped {stopped_count} terminals, {failed_stops} failed to stop")
        logger.info(f"📋 Accounts marked for restart: {running_accounts}")
        
        # Step 2: Wait a moment for processes to fully terminate
        logger.info("⏳ Waiting for processes to fully terminate...")
        await asyncio.sleep(3)
        
        # Step 3: Restart terminals using the existing restart logic
        logger.info("🚀 Step 3: Restarting terminals using existing restart logic...")
        
        # Reuse the existing restart_terminals_for_connected_accounts function
        await restart_terminals_for_connected_accounts()
        
        # Step 4: Get final status
        final_accounts = db_manager.get_accounts()
        running_count = 0
        for account in final_accounts:
            if pyautogui_manager.is_terminal_running(account.get('login'), account.get('account_id')):
                running_count += 1
        
        logger.info(f"✅ Restart all terminals completed. Final running count: {running_count}")
        
        return {
            "success": True,
            "message": f"Successfully restarted all terminals",
            "stopped_count": stopped_count,
            "failed_stops": failed_stops,
            "final_running_count": running_count,
            "total_accounts": len(final_accounts),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error in restart all terminals: {e}")
        raise HTTPException(status_code=500, detail=f"Error restarting all terminals: {str(e)}")

@api_router.post("/update-ea")
async def update_ea_script(
    ea_type: str = Form(..., description="EA type: 'mq4' or 'mq5'"),
    file: UploadFile = File(..., description="EA file to upload")
):
    """
    Update EA script and replace in all terminals
    
    This endpoint:
    1. Stops all running terminals
    2. Updates the source EA file in Templates directory
    3. Replaces EA files in all MT4/MT5 instance directories
    4. Restarts all connected terminals
    
    Form data:
    - ea_type: "mq4" or "mq5" (string)
    - file: EA file to upload (binary file)
    
    Example usage in Postman:
    - Method: POST
    - URL: http://localhost:8000/api/update-ea
    - Body: form-data
    - Key: ea_type, Value: mq4
    - Key: file, Type: File, Value: [select your EA.ex4 file]
    """
    try:
        import os
        from pathlib import Path
        
        logger.info(f"Starting EA update process for type: {ea_type}")
        
        # Validate EA type
        if ea_type not in ["mq4", "mq5"]:
            raise HTTPException(status_code=400, detail="ea_type must be 'mq4' or 'mq5'")
        
        # Read the uploaded file content
        try:
            file_content = await file.read()
            logger.info(f"Read {len(file_content)} bytes from uploaded file: {file.filename}")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error reading uploaded file: {str(e)}")
        
        # Step 1: Stop all terminals
        logger.info("🛑 Stopping all terminals before EA update...")
        stopped_count = pyautogui_manager.force_stop_all_terminals()
        logger.info(f"Stopped {stopped_count} terminal processes")
        
        # Wait a moment for processes to fully terminate
        await asyncio.sleep(1)  # Reduced from 3 to 1 second
        
        # Step 2: Update source EA files in Templates directories
        logger.info("📁 Updating source EA files in Templates directories...")
        
        if ea_type == "mq4":
            # Update MT4 template
            template_path = Path("C:/JamesPlatform/Templates/ironfx_template/MQL4/Experts/EA.ex4")
            template_path.parent.mkdir(parents=True, exist_ok=True)
            with open(template_path, 'wb') as f:
                f.write(file_content)
            logger.info(f"Updated MT4 template: {template_path}")
            
        elif ea_type == "mq5":
            # Update MT5 template
            template_path = Path("C:/JamesPlatform/Templates/ironfx_template_5/MQL5/Experts/EA.ex5")
            template_path.parent.mkdir(parents=True, exist_ok=True)
            with open(template_path, 'wb') as f:
                f.write(file_content)
            logger.info(f"Updated MT5 template: {template_path}")
        
        # Step 3: Replace EA files in all instance directories
        logger.info("🔄 Replacing EA files in all instance directories...")
        
        if ea_type == "mq4":
            # Update all MT4 instances
            mt4_base_path = Path("C:/JamesPlatform/MT4Instances")
            if mt4_base_path.exists():
                for instance_dir in mt4_base_path.iterdir():
                    if instance_dir.is_dir():
                        ea_path = instance_dir / "MQL4" / "Experts" / "EA.ex4"
                        if ea_path.parent.exists():
                            with open(ea_path, 'wb') as f:
                                f.write(file_content)
                            logger.info(f"Updated EA in MT4 instance: {ea_path}")
            
        elif ea_type == "mq5":
            # Update all MT5 instances
            mt5_base_path = Path("C:/JamesPlatform/MT5Instances")
            if mt5_base_path.exists():
                for instance_dir in mt5_base_path.iterdir():
                    if instance_dir.is_dir():
                        ea_path = instance_dir / "MQL5" / "Experts" / "EA.ex5"
                        if ea_path.parent.exists():
                            with open(ea_path, 'wb') as f:
                                f.write(file_content)
                            logger.info(f"Updated EA in MT5 instance: {ea_path}")
        
        # Step 4: Restart all terminals
        logger.info("🚀 Restarting all terminals after EA update...")
        
        # Get all connected accounts from database
        try:
            accounts = db_manager.get_all_accounts()
            logger.info(f"Retrieved {len(accounts)} total accounts from database")
            
            # Convert Account objects to dictionaries and filter connected accounts
            connected_accounts = []
            for acc in accounts:
                # Debug: Print all attributes to see what's available
                logger.info(f"Account attributes: {dir(acc)}")
                logger.info(f"Account state: {getattr(acc, 'state', 'unknown')}, login: {getattr(acc, 'login', 'unknown')}")
                
                # Try different possible state field names
                state_value = None
                for state_field in ['state', 'status', 'connection_status', 'account_state']:
                    if hasattr(acc, state_field):
                        state_value = getattr(acc, state_field)
                        logger.info(f"Found {state_field}: {state_value}")
                        if state_value == 'connected':
                            break
                
                # If we found a connected account, add it
                if state_value == 'connected':
                    # Convert Account object to dictionary
                    account_dict = {
                        'login': acc.login,
                        'password': acc.password,
                        'server': acc.server,
                        'platform_type': getattr(acc, 'platform_type', 'MT4'),
                        'account_id': getattr(acc, 'account_id', None)
                    }
                    connected_accounts.append(account_dict)
                    logger.info(f"Added connected account: {acc.login}")
                else:
                    logger.info(f"Account {acc.login} is not connected (state: {state_value})")
            
            logger.info(f"Found {len(connected_accounts)} connected accounts to restart")
            
            # Fallback: If no connected accounts found, restart all accounts
            if len(connected_accounts) == 0 and len(accounts) > 0:
                logger.info("No connected accounts found, restarting all accounts as fallback")
                for acc in accounts:
                    account_dict = {
                        'login': acc.login,
                        'password': acc.password,
                        'server': acc.server,
                        'platform_type': getattr(acc, 'platform_type', 'MT4'),
                        'account_id': getattr(acc, 'account_id', None)
                    }
                    connected_accounts.append(account_dict)
                    logger.info(f"Added account for restart: {acc.login}")
                
                logger.info(f"Fallback: Found {len(connected_accounts)} accounts to restart")
            
            # Restart each connected account in parallel for faster execution
            async def restart_single_terminal(account):
                try:
                    login = account['login']
                    password = account['password']
                    server = account['server']
                    platform_type = PlatformType.MT5 if account.get('platform_type') == 'MT5' else PlatformType.MT4
                    
                    # Simply launch terminal.exe without any automation
                    success, process_id, error_code = pyautogui_manager.launch_terminal_simple(
                        login, platform_type=platform_type
                    )
                    
                    if success:
                        logger.info(f"Successfully restarted terminal for login: {login}")
                        return True
                    else:
                        logger.warning(f"Failed to restart terminal for login: {login}, error: {error_code}")
                        return False
                        
                except Exception as e:
                    logger.error(f"Error restarting terminal for account {account.get('account_id', 'unknown')}: {e}")
                    return False
            
            # Execute all terminal restarts in parallel with small delays to avoid overwhelming system
            logger.info(f"🚀 Starting parallel restart of {len(connected_accounts)} terminals...")
            
            # Create tasks with small delays to stagger the launches
            restart_tasks = []
            for i, account in enumerate(connected_accounts):
                async def delayed_restart(account, delay):
                    await asyncio.sleep(delay)
                    return await restart_single_terminal(account)
                
                # Stagger launches by 0.1 seconds each
                restart_tasks.append(delayed_restart(account, i * 0.1))
            
            restart_results = await asyncio.gather(*restart_tasks, return_exceptions=True)
            
            # Count successful restarts
            restarted_count = sum(1 for result in restart_results if result is True)
            
            logger.info(f"Successfully restarted {restarted_count} out of {len(connected_accounts)} terminals")
            
        except Exception as e:
            logger.error(f"Error getting accounts for restart: {e}")
            # Still return success since EA files were updated
        
        logger.info("✅ EA update process completed successfully")
        return {
            "success": True,
            "message": f"EA script updated successfully for {ea_type}",
            "filename": file.filename,
            "file_size": len(file_content),
            "terminals_restarted": restarted_count if 'restarted_count' in locals() else 0
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in EA update process: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating EA script: {str(e)}")


# Include API router
app.include_router(api_router, prefix="/api")

if __name__ == "__main__":
    # Run the API server
    uvicorn.run(
        "api_server:app",
        host=config.CONTROLLER_HOST,
        port=config.CONTROLLER_PORT,
        reload=False,
        log_level="info"
    ) 