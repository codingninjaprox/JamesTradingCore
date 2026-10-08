#!/usr/bin/env python3
"""
MT4/MT5 Controller - Main Entry Point
Manages MetaTrader terminal instances and communicates with Laravel API
"""

import asyncio
import signal
import sys
import time
import threading
from datetime import datetime
from typing import Dict, List, Optional
from pathlib import Path

from loguru import logger
import schedule
import psutil

from config.config import config
from models.models import Terminal, Account, TerminalConfig, TerminalStatus, PlatformType, HeartbeatData
from db.mysql_database import MySQLDatabaseManager
from models.terminal_manager import TerminalManager
from batch.batch_manager import BatchManager
from api.api_client import LaravelAPIClient

class MTController:
    """Main MT4/MT5 Controller"""
    
    def __init__(self):
        # Initialize components
        self.db_manager = MySQLDatabaseManager(
            host=config.MYSQL_HOST,
            port=config.MYSQL_PORT,
            database=config.MYSQL_DATABASE,
            username=config.MYSQL_USERNAME,
            password=config.MYSQL_PASSWORD
        )
        self.terminal_manager = TerminalManager(self.db_manager)
        self.batch_manager = BatchManager()
        self.api_client = LaravelAPIClient()
        
        # State management
        self.running = False
        self.accounts: Dict[str, Account] = {}
        self.terminals: Dict[str, Terminal] = {}
        
        # Threading
        self.heartbeat_thread = None
        self.sync_thread = None
        self.monitoring_thread = None
        
        # Setup logging
        self._setup_logging()
        
        # Setup signal handlers
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
    
    def _setup_logging(self):
        """Setup logging configuration"""
        # Remove default handler
        logger.remove()
        
        # Add console handler
        logger.add(
            sys.stdout,
            level=config.LOG_LEVEL,
            format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>"
        )
        
        # Add file handler
        log_file = Path(config.LOG_FILE)
        log_file.parent.mkdir(parents=True, exist_ok=True)
        logger.add(
            log_file,
            level=config.LOG_LEVEL,
            format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
            rotation="1 day",
            retention="30 days"
        )
        
        logger.info("MT4/MT5 Controller starting...")
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        logger.info(f"Received signal {signum}, shutting down...")
        self.shutdown()
    
    def start(self):
        """Start the controller"""
        try:
            logger.info("Starting MT4/MT5 Controller...")
            self.running = True
            
            # Start terminal monitoring
            self.terminal_manager.start_monitoring()
            
            # Start background threads
            self._start_background_threads()
            
            # Create startup batch file
            self.batch_manager.create_startup_batch()
            
            # Initial sync with Laravel API
            self._sync_accounts()
            
            # Start main loop
            self._main_loop()
            
        except Exception as e:
            logger.error(f"Error starting controller: {e}")
            self.shutdown()
    
    def shutdown(self):
        """Shutdown the controller gracefully"""
        logger.info("Shutting down MT4/MT5 Controller...")
        self.running = False
        
        # Stop background threads
        if self.heartbeat_thread:
            self.heartbeat_thread.join(timeout=5)
        if self.sync_thread:
            self.sync_thread.join(timeout=5)
        if self.monitoring_thread:
            self.monitoring_thread.join(timeout=5)
        
        # Stop terminal monitoring
        self.terminal_manager.stop_monitoring()
        
        # Stop all terminals
        self._stop_all_terminals()
        
        logger.info("MT4/MT5 Controller shutdown complete")
    
    def _start_background_threads(self):
        """Start background threads"""
        # Heartbeat thread
        self.heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self.heartbeat_thread.start()
        
        # Account sync thread
        self.sync_thread = threading.Thread(target=self._sync_loop, daemon=True)
        self.sync_thread.start()
        
        # Monitoring thread
        self.monitoring_thread = threading.Thread(target=self._monitoring_loop, daemon=True)
        self.monitoring_thread.start()
        
        logger.info("Background threads started")
    
    def _main_loop(self):
        """Main controller loop"""
        logger.info("Controller main loop started")
        
        while self.running:
            try:
                # Process account changes
                self._process_account_changes()
                
                # Update startup batch file
                self._update_startup_batch()
                
                # Auto-scaling logic
                if config.AUTO_SCALE_ENABLED:
                    self._auto_scale_terminals()
                
                # Performance monitoring
                if config.MONITORING_ENABLED:
                    self._update_performance_metrics()
                
                time.sleep(10)  # Main loop interval
                
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                time.sleep(10)
    
    def _heartbeat_loop(self):
        """Send heartbeat data to Laravel API"""
        logger.info("Heartbeat loop started")
        
        while self.running:
            try:
                terminals = self.terminal_manager.get_all_terminals()
                
                for terminal in terminals:
                    heartbeat_data = HeartbeatData(
                        terminal_id=terminal.terminal_id,
                        account_id=terminal.account_id,
                        platform_type=terminal.platform_type,
                        status=terminal.status,
                        timestamp=datetime.now(),
                        performance_data=self._get_performance_data(terminal),
                        error_data=self._get_error_data(terminal)
                    )
                    
                    success = self.api_client.send_heartbeat(heartbeat_data)
                    if success:
                        # Update last heartbeat
                        self.db_manager.update_terminal(
                            terminal.terminal_id,
                            {"last_heartbeat": datetime.now()}
                        )
                
                time.sleep(config.HEARTBEAT_INTERVAL)
                
            except Exception as e:
                logger.error(f"Error in heartbeat loop: {e}")
                time.sleep(config.HEARTBEAT_INTERVAL)
    
    def _sync_loop(self):
        """Sync accounts with Laravel API"""
        logger.info("Account sync loop started")
        
        while self.running:
            try:
                self._sync_accounts()
                time.sleep(60)  # Sync every minute
                
            except Exception as e:
                logger.error(f"Error in sync loop: {e}")
                time.sleep(60)
    
    def _monitoring_loop(self):
        """Monitor system performance and health"""
        logger.info("Monitoring loop started")
        
        while self.running:
            try:
                # Check terminal health
                self._check_terminal_health()
                
                # Update server usage
                self._update_server_usage()
                
                time.sleep(config.PERFORMANCE_CHECK_INTERVAL)
                
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                time.sleep(config.PERFORMANCE_CHECK_INTERVAL)
    
    def _sync_accounts(self):
        """Sync accounts from Laravel API"""
        try:
            # Get all accounts from API
            api_accounts = self.api_client.get_all_accounts()
            
            # Update local accounts
            for account in api_accounts:
                self.accounts[account.account_id] = account
                self.db_manager.add_account(account)
            
            logger.info(f"Synced {len(api_accounts)} accounts from API")
            
        except Exception as e:
            logger.error(f"Error syncing accounts: {e}")
    
    def _process_account_changes(self):
        """Process account status changes"""
        try:
            for account_id, account in self.accounts.items():
                if account.status == "1":  # Active
                    # Ensure terminal is running
                    if not self._has_active_terminal(account_id):
                        self._launch_terminal_for_account(account)
                elif account.status == "0":  # Paused
                    # Stop terminal
                    self._stop_terminal_for_account(account_id)
                elif account.status == "deleted":
                    # Stop and remove terminal
                    self._stop_terminal_for_account(account_id)
                    del self.accounts[account_id]
            
        except Exception as e:
            logger.error(f"Error processing account changes: {e}")
    
    def _launch_terminal_for_account(self, account: Account) -> Optional[str]:
        """Launch terminal for an account"""
        try:
            # Check if terminal already exists
            existing_terminals = self.terminal_manager.get_terminals_by_account(account.account_id)
            if existing_terminals:
                logger.info(f"Terminal already exists for account {account.account_id}")
                return existing_terminals[0].terminal_id
            
            # Create terminal configuration
            config = TerminalConfig(
                account_id=account.account_id,
                platform_type=account.platform_type,
                server=account.server,
                login=account.login,
                password=account.password,
                groupid=account.groupid
            )
            
            # Launch terminal
            terminal_id = self.terminal_manager.launch_terminal(config)
            if terminal_id:
                logger.info(f"Launched terminal {terminal_id} for account {account.account_id}")
                return terminal_id
            else:
                logger.error(f"Failed to launch terminal for account {account.account_id}")
                return None
                
        except Exception as e:
            logger.error(f"Error launching terminal for account {account.account_id}: {e}")
            return None
    
    def _update_startup_batch(self):
        """Update startup batch file with current active accounts"""
        try:
            active_accounts = []
            for account in self.accounts.values():
                if account.status == "1":  # Active accounts only
                    active_accounts.append({
                        'login': account.login,
                        'account_id': account.account_id
                    })
            
            self.batch_manager.update_startup_batch_with_accounts(active_accounts)
            logger.info(f"Updated startup batch with {len(active_accounts)} active accounts")
            
        except Exception as e:
            logger.error(f"Error updating startup batch: {e}")
    
    def _stop_terminal_for_account(self, account_id: str) -> bool:
        """Stop terminal for an account"""
        try:
            terminals = self.terminal_manager.get_terminals_by_account(account_id)
            
            for terminal in terminals:
                success = self.terminal_manager.stop_terminal(terminal.terminal_id)
                if success:
                    logger.info(f"Stopped terminal {terminal.terminal_id} for account {account_id}")
                else:
                    logger.error(f"Failed to stop terminal {terminal.terminal_id} for account {account_id}")
            
            return True
            
        except Exception as e:
            logger.error(f"Error stopping terminal for account {account_id}: {e}")
            return False
    
    def _has_active_terminal(self, account_id: str) -> bool:
        """Check if account has an active terminal"""
        terminals = self.terminal_manager.get_terminals_by_account(account_id)
        return any(terminal.status in [TerminalStatus.RUNNING, TerminalStatus.CONNECTED] for terminal in terminals)
    
    def _stop_all_terminals(self):
        """Stop all running terminals"""
        try:
            terminals = self.terminal_manager.get_all_terminals()
            
            for terminal in terminals:
                self.terminal_manager.stop_terminal(terminal.terminal_id, force=True)
            
            logger.info(f"Stopped {len(terminals)} terminals")
            
        except Exception as e:
            logger.error(f"Error stopping all terminals: {e}")
    
    def _auto_scale_terminals(self):
        """Auto-scale terminals based on server usage"""
        try:
            # Get server usage statistics
            server_usage = self.api_client.get_server_usage()
            if not server_usage:
                return
            
            # Check CPU and memory usage for each server
            for server_name, server_data in server_usage.items():
                cpu_usage = server_data.get('cpu_usage', 0)
                memory_usage = server_data.get('memory_usage', 0)
                
                if cpu_usage > config.SCALE_UP_THRESHOLD or memory_usage > config.SCALE_UP_THRESHOLD:
                    logger.warning(f"High resource usage on {server_name}: CPU {cpu_usage}%, Memory {memory_usage}%")
                    # Could implement scaling down logic here
                
                elif cpu_usage < config.SCALE_DOWN_THRESHOLD and memory_usage < config.SCALE_DOWN_THRESHOLD:
                    logger.info(f"Low resource usage on {server_name}: CPU {cpu_usage}%, Memory {memory_usage}%")
                    # Could implement scaling up logic here
                    
        except Exception as e:
            logger.error(f"Error in auto-scaling: {e}")
    
    def _update_performance_metrics(self):
        """Update performance metrics"""
        try:
            import psutil
            
            # Get system metrics
            cpu_percent = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            
            # Use C: drive for Windows, / for Unix
            try:
                disk = psutil.disk_usage('C:/')
            except Exception:
                try:
                    disk = psutil.disk_usage('/')
                except Exception:
                    # If both fail, create a mock disk object
                    class MockDisk:
                        percent = 0.0
                    disk = MockDisk()
            
            # Update server usage in database
            for platform_type in [PlatformType.MT4, PlatformType.MT5]:
                terminals = [t for t in self.terminal_manager.get_all_terminals() if t.platform_type == platform_type]
                active_terminals = len([t for t in terminals if t.status in [TerminalStatus.RUNNING, TerminalStatus.CONNECTED]])
                
                self.db_manager.update_server_usage(
                    server_name="localhost",
                    platform_type=platform_type,
                    active_terminals=active_terminals,
                    total_terminals=len(terminals),
                    cpu_usage=cpu_percent,
                    memory_usage=memory.percent,
                    disk_usage=disk.percent
                )
                
        except Exception as e:
            logger.error("Error updating performance metrics: {}".format(str(e)))
    
    def _check_terminal_health(self):
        """Check health of all terminals"""
        try:
            terminals = self.terminal_manager.get_all_terminals()
            
            for terminal in terminals:
                # Check if terminal is responsive
                if terminal.status == TerminalStatus.RUNNING:
                    # Could implement health check logic here
                    # For now, just log the status
                    pass
                
                # Check for stuck terminals
                if terminal.status == TerminalStatus.STARTING:
                    start_time = terminal.start_time
                    if start_time and (datetime.now() - start_time).seconds > config.CONNECTION_TIMEOUT:
                        logger.warning(f"Terminal {terminal.terminal_id} stuck in starting state")
                        # Could implement restart logic here
                        
        except Exception as e:
            logger.error(f"Error checking terminal health: {e}")
    
    def _update_server_usage(self):
        """Update server usage statistics"""
        try:
            # This would typically send usage data to Laravel API
            # For now, just log the current state
            terminals = self.terminal_manager.get_all_terminals()
            active_count = len([t for t in terminals if t.status in [TerminalStatus.RUNNING, TerminalStatus.CONNECTED]])
            
            logger.info(f"Server usage: {active_count}/{len(terminals)} terminals active")
            
        except Exception as e:
            logger.error(f"Error updating server usage: {e}")
    
    def _get_performance_data(self, terminal: Terminal) -> Optional[Dict]:
        """Get performance data for terminal"""
        try:
            if terminal.process_id:
                process = psutil.Process(terminal.process_id)
                return {
                    'cpu_percent': process.cpu_percent(),
                    'memory_percent': process.memory_percent(),
                    'memory_rss': process.memory_info().rss,
                    'num_threads': process.num_threads()
                }
        except Exception as e:
            logger.error(f"Error getting performance data for terminal {terminal.terminal_id}: {e}")
        
        return None
    
    def _get_error_data(self, terminal: Terminal) -> Optional[Dict]:
        """Get error data for terminal"""
        if terminal.error_message:
            return {
                'error_message': terminal.error_message,
                'connection_attempts': terminal.connection_attempts
            }
        return None

def main():
    """Main entry point"""
    try:
        # Create and start controller
        controller = MTController()
        controller.start()
        
    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt")
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 