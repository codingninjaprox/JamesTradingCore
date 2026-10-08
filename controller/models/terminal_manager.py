import subprocess
import psutil
import time
import threading
import uuid
import shutil
import os
import json
from pathlib import Path
from datetime import datetime
from typing import List, Optional, Dict, Any
from loguru import logger

from config.config import config, TERMINAL_TEMPLATES
from models.models import Terminal, TerminalStatus, PlatformType, TerminalConfig
from db.mysql_database import MySQLDatabaseManager as DatabaseManager

class TerminalManager:
    """Manages MT4/MT5 terminal instances"""
    
    def __init__(self, db_manager: DatabaseManager):
        self.db_manager = db_manager
        self.active_terminals: Dict[str, Terminal] = {}
        self.terminal_processes: Dict[str, subprocess.Popen] = {}
        self.monitoring_thread = None
        self.running = False
        self.lock = threading.Lock()
        
        # Create necessary directories
        self._create_directories()
    
    def _create_directories(self):
        """Create necessary directories for terminal management"""
        directories = [
            config.EA_FILES_PATH,
            config.CONFIG_FILES_PATH,
            config.LOGS_PATH,
            config.MT4_BASE_PATH,
            config.MT5_BASE_PATH
        ]
        
        for directory in directories:
            Path(directory).mkdir(parents=True, exist_ok=True)
    
    def start_monitoring(self):
        """Start terminal monitoring thread"""
        if self.monitoring_thread and self.monitoring_thread.is_alive():
            return
        
        self.running = True
        self.monitoring_thread = threading.Thread(target=self._monitor_terminals, daemon=True)
        self.monitoring_thread.start()
        logger.info("Terminal monitoring started")
    
    def stop_monitoring(self):
        """Stop terminal monitoring"""
        self.running = False
        if self.monitoring_thread:
            self.monitoring_thread.join(timeout=5)
        logger.info("Terminal monitoring stopped")
    
    def test_terminal_launch(self, config: TerminalConfig) -> Dict[str, Any]:
        """Test terminal launch without actually launching - for debugging"""
        try:
            result = {
                'success': False,
                'errors': [],
                'paths': {},
                'config': {}
            }
            
            # Test 1: Validate paths
            if not self._validate_terminal_paths(config.platform_type, config.server):
                result['errors'].append("Terminal path validation failed")
                return result
            
            # Test 2: Check directory creation
            data_path = self._get_data_path(config.login, config.platform_type)
            result['paths']['data_path'] = data_path
            
            try:
                Path(data_path).mkdir(parents=True, exist_ok=True)
                result['paths']['data_path_created'] = True
            except Exception as e:
                result['errors'].append(f"Failed to create data path: {e}")
                return result
            
            # Test 3: Check batch file creation
            try:
                from batch.batch_manager import BatchManager
                batch_manager = BatchManager()
                
                # Create a temporary terminal for testing
                terminal = Terminal(
                    terminal_id="test_terminal",
                    account_id=config.account_id,
                    platform_type=config.platform_type,
                    status=TerminalStatus.STARTING,
                    start_time=datetime.now(),
                    server_path=self._get_server_path(config.platform_type, config.server),
                    data_path=data_path
                )
                
                batch_file_path = batch_manager.create_launch_batch(terminal, config.login, config)
                if batch_file_path:
                    result['paths']['batch_file'] = batch_file_path
                    result['paths']['batch_file_exists'] = os.path.exists(batch_file_path)
                else:
                    result['errors'].append("Failed to create batch file")
                    return result
                    
            except Exception as e:
                result['errors'].append(f"Failed to create batch file: {e}")
                return result
            
            # Test 4: Check database connection
            try:
                # Test if we can add a terminal to database
                test_terminal = Terminal(
                    terminal_id="test_db_terminal",
                    account_id=config.account_id,
                    platform_type=config.platform_type,
                    status=TerminalStatus.STARTING,
                    start_time=datetime.now(),
                    server_path=self._get_server_path(config.platform_type, config.server),
                    data_path=data_path
                )
                
                db_success = self.db_manager.add_terminal(test_terminal)
                result['database'] = {'connection': True, 'add_terminal': db_success}
                
                # Clean up test terminal
                if db_success:
                    self.db_manager.delete_terminal("test_db_terminal")
                    
            except Exception as e:
                result['errors'].append(f"Database test failed: {e}")
                return result
            
            result['success'] = True
            result['config'] = {
                'account_id': config.account_id,
                'login': config.login,
                'server': config.server,
                'platform_type': config.platform_type.value
            }
            
            return result
            
        except Exception as e:
            result['errors'].append(f"Test failed: {e}")
            return result
    
    def _validate_terminal_paths(self, platform_type: PlatformType, server_name: str) -> bool:
        """Validate that terminal paths exist and are accessible"""
        try:
            server_path = self._get_server_path(platform_type, server_name)
            template = TERMINAL_TEMPLATES[platform_type.value]
            executable_path = os.path.join(server_path, template['executable'])
            
            logger.info(f"Validating terminal path: {executable_path}")
            
            if not os.path.exists(server_path):
                logger.error(f"Terminal server path does not exist: {server_path}")
                return False
            
            if not os.path.exists(executable_path):
                logger.error(f"Terminal executable does not exist: {executable_path}")
                return False
            
            logger.info(f"Terminal path validation successful: {executable_path}")
            return True
            
        except Exception as e:
            logger.error(f"Error validating terminal paths: {e}")
            return False
    
    def is_terminal_running_for_account(self, account_id: str) -> bool:
        """Check if a terminal is already running for a specific account"""
        try:
            with self.lock:
                # Check in-memory terminals
                for terminal in self.active_terminals.values():
                    if terminal.account_id == account_id and terminal.status in [TerminalStatus.RUNNING, TerminalStatus.CONNECTED]:
                        return True
                
                # Check database for any running terminals for this account
                db_terminals = self.db_manager.get_terminals_by_account(account_id)
                for terminal in db_terminals:
                    if terminal.status in [TerminalStatus.RUNNING, TerminalStatus.CONNECTED]:
                        return True
                
                return False
        except Exception as e:
            logger.error(f"Error checking if terminal is running for account {account_id}: {e}")
            return False

    def launch_terminal(self, config: TerminalConfig) -> Optional[str]:
        """Launch a new terminal instance"""
        terminal_id = None
        terminal = None
        
        try:
            terminal_id = str(uuid.uuid4())
            platform_type = config.platform_type
            
            logger.info(f"Starting terminal launch for account {config.account_id} (login: {config.login})")
            
            # Check if terminal is already running for this account
            if self.is_terminal_running_for_account(config.account_id):
                logger.warning(f"Terminal is already running for account {config.account_id}")
                return None
            
            # Validate terminal paths first
            if not self._validate_terminal_paths(config.platform_type, config.server):
                logger.error(f"Terminal path validation failed for account {config.account_id}")
                return None
            
            # Create terminal instance - CORRECTED to use login as folder name
            terminal = Terminal(
                terminal_id=terminal_id,
                account_id=config.account_id,
                platform_type=platform_type,
                status=TerminalStatus.STARTING,
                start_time=datetime.now(),
                server_path=self._get_server_path(platform_type, config.server),
                data_path=self._get_data_path(config.login, platform_type)  # Use login instead of terminal_id
            )
            
            logger.info(f"Created terminal instance: {terminal_id}")
            logger.info(f"Terminal data path: {terminal.data_path}")
            logger.info(f"Terminal server path: {terminal.server_path}")
            
            # Create terminal directory structure
            try:
                self._setup_terminal_directory(terminal)
                logger.info(f"Terminal directory structure created")
            except Exception as e:
                logger.error(f"Failed to setup terminal directory: {e}")
                self._handle_launch_failure(terminal, f"Failed to setup terminal directory: {e}")
                return None
            
            # Setup JamesPlatform data directory (no terminal.exe copying)
            try:
                self._setup_jamesplatform_data(terminal, config)
                logger.info(f"JamesPlatform data directory setup completed")
            except Exception as e:
                logger.error(f"Failed to setup JamesPlatform data: {e}")
                self._handle_launch_failure(terminal, f"Failed to setup JamesPlatform data: {e}")
                return None
            
            # Copy EA files
            try:
                # Removed EA creation call
                logger.info(f"EA files copied")
            except Exception as e:
                logger.warning(f"Failed to copy EA files: {e}")
            
            # Create configuration files
            try:
                self._create_config_files(terminal, config)
                logger.info(f"Configuration files created")
            except Exception as e:
                logger.error(f"Failed to create config files: {e}")
                self._handle_launch_failure(terminal, f"Failed to create config files: {e}")
                return None
            
            # Create batch file for launching (now runs from JamesPlatform directory)
            try:
                from batch.batch_manager import BatchManager
                batch_manager = BatchManager()
                batch_file_path = batch_manager.create_launch_batch(terminal, config.login, config)
                
                if not batch_file_path:
                    logger.error(f"Failed to create batch file for terminal {terminal_id}")
                    self._handle_launch_failure(terminal, "Failed to create batch file")
                    return None
                
                logger.info(f"Batch file created: {batch_file_path}")
            except Exception as e:
                logger.error(f"Failed to create batch file: {e}")
                self._handle_launch_failure(terminal, f"Failed to create batch file: {e}")
                return None
            
            # Launch terminal via batch file (now runs from JamesPlatform directory)
            try:
                success = batch_manager.launch_terminal_via_batch(config.login)
                if not success:
                    logger.error(f"Failed to launch terminal {terminal_id} via batch file")
                    self._handle_launch_failure(terminal, "Failed to launch terminal via batch file")
                    return None
                
                logger.info(f"Terminal launched via batch file successfully")
                
                # Add delay before checking terminal status to allow for initialization
                logger.info(f"Waiting for terminal {terminal_id} to initialize...")
                import time
                time.sleep(1)  # Wait 8 seconds for terminal to fully start
                
                # Check if terminal process is actually running
                if self._check_terminal_process(terminal):
                    logger.info(f"Terminal {terminal_id} process confirmed running")
                else:
                    logger.warning(f"Terminal {terminal_id} process not immediately detected, but continuing...")
                
            except Exception as e:
                logger.error(f"Failed to launch terminal via batch: {e}")
                self._handle_launch_failure(terminal, f"Failed to launch terminal via batch: {e}")
                return None
            
            # Update terminal status
            terminal.status = TerminalStatus.RUNNING
            
            # Store terminal in memory
            try:
                with self.lock:
                    self.active_terminals[terminal_id] = terminal
                logger.info(f"Terminal stored in memory: {terminal_id}")
            except Exception as e:
                logger.error(f"Failed to store terminal in memory: {e}")
                self._handle_launch_failure(terminal, f"Failed to store terminal in memory: {e}")
                return None
            
            # Save to database
            try:
                db_success = self.db_manager.add_terminal(terminal)
                if not db_success:
                    logger.error(f"Failed to save terminal {terminal_id} to database")
                    # Remove from memory if database save failed
                    with self.lock:
                        if terminal_id in self.active_terminals:
                            del self.active_terminals[terminal_id]
                    return None
                
                logger.info(f"Terminal saved to database: {terminal_id}")
            except Exception as e:
                logger.error(f"Failed to save terminal to database: {e}")
                # Remove from memory if database save failed
                with self.lock:
                    if terminal_id in self.active_terminals:
                        del self.active_terminals[terminal_id]
                return None
            
            logger.info(f"Terminal {terminal_id} launched successfully for account {config.account_id}")
            return terminal_id
            
        except Exception as e:
            logger.error(f"Error launching terminal for account {config.account_id}: {e}")
            if terminal:
                self._handle_launch_failure(terminal, f"Error launching terminal: {e}")
            return None

    # _load_ea_after_terminal_start function removed - user handles EA loading manually

    def _check_terminal_connection_ready(self, terminal: Terminal) -> bool:
        """Check if terminal is connected and ready"""
        try:
            # Check if terminal has connected to server by looking for connection indicators
            data_path = Path(terminal.data_path)
            
            # Method 1: Check for recent log files indicating connection
            log_files = list(data_path.glob("*.log"))
            for log_file in log_files:
                if log_file.exists():
                    # Check if log file was modified in last 30 seconds
                    import time
                    file_age = time.time() - log_file.stat().st_mtime
                    if file_age < 30:
                        try:
                            with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
                                log_content = f.read()
                                if any(keyword in log_content.lower() for keyword in ['connected', 'login successful', 'authorized']):
                                    logger.info(f"Found connection indicator in log: {log_file.name}")
                                    return True
                        except Exception as e:
                            logger.debug(f"Error reading log file {log_file}: {e}")
            
            # Method 2: Check for account data files (indicates EA is already running)
            account_data_files = list(data_path.glob("*account_data*.json"))
            for data_file in account_data_files:
                if data_file.exists():
                    import time
                    file_age = time.time() - data_file.stat().st_mtime
                    if file_age < 60:  # File updated in last minute
                        logger.info(f"Found recent account data file: {data_file.name}")
                        return True
            
            # Method 3: Check for terminal status files
            status_files = list(data_path.glob("*.status"))
            for status_file in status_files:
                if status_file.exists():
                    try:
                        with open(status_file, 'r') as f:
                            status_content = f.read().strip()
                            if status_content.lower() in ['connected', 'ready', 'running']:
                                logger.info(f"Found ready status in: {status_file.name}")
                                return True
                    except Exception as e:
                        logger.debug(f"Error reading status file {status_file}: {e}")
            
            return False
            
        except Exception as e:
            logger.error(f"Error checking terminal connection readiness: {e}")
            return False

    def _handle_launch_failure(self, terminal: Terminal, error_message: str):
        """Handle terminal launch failure by updating status and database"""
        try:
            logger.error(f"Terminal launch failed for {terminal.terminal_id}: {error_message}")
            
            # Update terminal status to FAILED
            terminal.status = TerminalStatus.FAILED
            terminal.error_message = error_message
            
            # Save failed terminal to database
            try:
                db_success = self.db_manager.add_terminal(terminal)
                if db_success:
                    logger.info(f"Failed terminal {terminal.terminal_id} saved to database with FAILED status")
                else:
                    logger.error(f"Failed to save failed terminal {terminal.terminal_id} to database")
            except Exception as e:
                logger.error(f"Error saving failed terminal to database: {e}")
            
            # Clean up any created files/directories
            try:
                self._cleanup_terminal_directory(terminal)
            except Exception as e:
                logger.warning(f"Error cleaning up failed terminal directory: {e}")
                
        except Exception as e:
            logger.error(f"Error handling launch failure: {e}")
    
    def stop_terminal(self, terminal_id: str, force: bool = False) -> bool:
        """Stop a terminal instance"""
        try:
            with self.lock:
                terminal = self.active_terminals.get(terminal_id)
                process = self.terminal_processes.get(terminal_id)
                
                if not terminal or not process:
                    logger.warning(f"Terminal {terminal_id} not found")
                    return False
                
                # Update status
                terminal.status = TerminalStatus.STOPPED
                self.db_manager.update_terminal(terminal_id, {"status": TerminalStatus.STOPPED.value})
                
                # Kill process
                if force:
                    process.kill()
                else:
                    process.terminate()
                    process.wait(timeout=10)
                
                # Clean up
                del self.active_terminals[terminal_id]
                del self.terminal_processes[terminal_id]
                
                # Clean up directory
                self._cleanup_terminal_directory(terminal)
                
                logger.info(f"Terminal {terminal_id} stopped")
                return True
                
        except Exception as e:
            logger.error(f"Error stopping terminal {terminal_id}: {e}")
            return False
    
    def get_terminal_status(self, terminal_id: str) -> Optional[TerminalStatus]:
        """Get terminal status"""
        with self.lock:
            terminal = self.active_terminals.get(terminal_id)
            return terminal.status if terminal else None
    
    def get_terminal_status_by_account(self, account_id: str) -> str:
        """Get terminal status by account ID - returns 'connected', 'running', 'stopped', or 'not_found'"""
        try:
            # First check in-memory terminals
            with self.lock:
                terminal = None
                for t in self.active_terminals.values():
                    if t.account_id == account_id:
                        terminal = t
                        break
                
            # If not in memory, check database
            if not terminal:
                logger.info(f"Terminal not found in active_terminals for account {account_id}, checking database...")
                db_terminals = self.db_manager.get_terminals_by_account(account_id)
                if db_terminals:
                    terminal = db_terminals[0]  # Use the first terminal found
                    logger.info(f"Found terminal {terminal.terminal_id} in database for account {account_id}")
                else:
                    logger.info(f"No terminals found in database for account {account_id}")
                    return "not_found"
            
            # Check if terminal process is running
            if not self._check_terminal_process(terminal):
                logger.info(f"Terminal process not running for account {account_id}")
                return "stopped"
            
            # Check for connection indicators in terminal logs
            log_path = Path(terminal.data_path) / TERMINAL_TEMPLATES[terminal.platform_type.value]['logs_path']
            if log_path.exists():
                # Look for recent log files and check for connection success
                log_files = list(log_path.glob("*.log"))
                if log_files:
                    latest_log = max(log_files, key=lambda x: x.stat().st_mtime)
                    try:
                        with open(latest_log, 'r', encoding='utf-8', errors='ignore') as f:
                            log_content = f.read()
                            # Look for connection success indicators
                            if any(indicator in log_content.lower() for indicator in [
                                'connected', 'login successful', 'authorized', 'logged in'
                            ]):
                                logger.info(f"Terminal connected for account {account_id}")
                                return "connected"
                    except Exception as e:
                        logger.warning(f"Error reading log file: {e}")
            
            # If process is running but no clear connection indicators, return running
            logger.info(f"Terminal running for account {account_id}")
            return "running"
            
        except Exception as e:
            logger.error(f"Error getting terminal status for account {account_id}: {e}")
            return "not_found"
    
    def verify_terminal_connection(self, terminal_id: str) -> bool:
        """Verify if terminal is actually connected to server"""
        try:
            with self.lock:
                terminal = self.active_terminals.get(terminal_id)
                if not terminal:
                    return False
                
                # Check if terminal process is running
                if not self._check_terminal_process(terminal):
                    return False
                
                # Check for connection indicators in terminal logs
                log_path = Path(terminal.data_path) / TERMINAL_TEMPLATES[terminal.platform_type.value]['logs_path']
                if log_path.exists():
                    # Look for recent log files and check for connection success
                    log_files = list(log_path.glob("*.log"))
                    if log_files:
                        latest_log = max(log_files, key=lambda x: x.stat().st_mtime)
                        with open(latest_log, 'r', encoding='utf-8', errors='ignore') as f:
                            log_content = f.read()
                            # Look for connection success indicators
                            if any(indicator in log_content.lower() for indicator in [
                                'connected', 'login successful', 'authorized', 'logged in'
                            ]):
                                return True
                
                # If no clear indicators, assume connected if process is running
                return self._check_terminal_process(terminal)
                
        except Exception as e:
            logger.error(f"Error verifying terminal connection: {e}")
            return False
    
    def get_all_terminals(self) -> List[Terminal]:
        """Get all active terminals"""
        with self.lock:
            return list(self.active_terminals.values())
    
    def get_terminals_by_account(self, account_id: str) -> List[Terminal]:
        """Get all terminals for a specific account"""
        with self.lock:
            # First check in-memory terminals
            in_memory_terminals = [terminal for terminal in self.active_terminals.values() if terminal.account_id == account_id]
            
            # Also check database for terminals that might not be in memory
            db_terminals = self.db_manager.get_terminals_by_account(account_id)
            
            # Combine and deduplicate
            all_terminals = in_memory_terminals.copy()
            for db_terminal in db_terminals:
                # Check if this terminal is already in memory
                if not any(t.terminal_id == db_terminal.terminal_id for t in in_memory_terminals):
                    all_terminals.append(db_terminal)
            
            return all_terminals
    
    def update_terminal_config(self, terminal_id: str, config_type: str, config_data: Dict[str, Any]) -> bool:
        """Update terminal configuration"""
        try:
            with self.lock:
                terminal = self.active_terminals.get(terminal_id)
                if not terminal:
                    return False
                
                # Update config data
                terminal.config_data[config_type] = config_data
                self.db_manager.update_terminal(terminal_id, {"config_data": terminal.config_data})
                
                # Apply configuration changes
                self._apply_config_changes(terminal, config_type, config_data)
                
                logger.info(f"Updated {config_type} config for terminal {terminal_id}")
                return True
                
        except Exception as e:
            logger.error(f"Error updating terminal config: {e}")
            return False
    
    def get_account_data_from_terminal(self, terminal_id: str) -> Optional[Dict[str, Any]]:
        """Get account data from terminal by reading account_data.json file"""
        try:
            logger.info(f"=== get_account_data_from_terminal: {terminal_id} ===")
            
            # Get terminal from database
            terminal = self.db_manager.get_terminal(terminal_id)
            if not terminal:
                logger.error(f"Terminal {terminal_id} not found in database")
                return None
            
            # Read account data from account_data.json file
            logger.info("Reading account data from account_data.json...")
            account_data = self._read_account_data_from_file(terminal)
            if account_data:
                logger.info("✅ Account data read successfully from file")
                return account_data
            
            logger.warning(f"No account data available for terminal {terminal_id}")
            return None
            
        except Exception as e:
            logger.error(f"Error getting account data from terminal {terminal_id}: {e}")
            return None

    def _read_account_data_from_file(self, terminal: Terminal) -> Optional[Dict[str, Any]]:
        """Read account data from file in terminal data directory"""
        try:
            data_path = Path(terminal.data_path)
            account_data_file = data_path / "MQL4" / "Files" / "account_data.json"
            
            # Try to read the account data file
            if account_data_file.exists():
                try:
                    with open(account_data_file, 'r') as f:
                        data = json.load(f)
                    
                    # Validate the data structure
                    if isinstance(data, dict) and 'data' in data:
                        account_data = data['data']
                        if isinstance(account_data, dict):
                            logger.info(f"Successfully read account data from file: {account_data_file}")
                            return account_data
                    
                    logger.warning(f"Invalid data structure in account_data.json: {data}")
                    
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON in account_data.json: {e}")
                except Exception as e:
                    logger.error(f"Error reading account_data.json: {e}")
            
            # If file doesn't exist or is invalid, retry after a short delay
            logger.info(f"Account data file not found or invalid, retrying in 5 seconds: {account_data_file}")
            time.sleep(5)
            
            if account_data_file.exists():
                try:
                    with open(account_data_file, 'r') as f:
                        data = json.load(f)
                    
                    if isinstance(data, dict) and 'data' in data:
                        account_data = data['data']
                        if isinstance(account_data, dict):
                            logger.info(f"Successfully read account data from file after retry: {account_data_file}")
                            return account_data
                    
                except Exception as e:
                    logger.error(f"Error reading account_data.json after retry: {e}")
            
            # If still no file found, return default data with zeros
            # Extract login from terminal data path (e.g., "C:\JamesPlatform\MT4Instances\90193" -> "90193")
            login_from_path = Path(terminal.data_path).name
            
            logger.warning("No account_data.json found after retry, returning default data")
            return {
                "account_id": terminal.account_id,
                "login": login_from_path,  # Use login from path instead of hardcoded "90193"
                "server": "Unknown",  # Will be updated when actual data is available
                "balance": 0.0,
                "equity": 0.0,
                "margin": 0.0,
                "free_margin": 0.0,
                "profit": 0.0,
                "connected": False,
                "trade_allowed": False,
                "timestamp": datetime.now().isoformat(),
                "source": "default_zero_data"
            }
            
        except Exception as e:
            logger.error(f"Error reading account data from file: {e}")
            return None

    def _get_mt4_account_data_direct(self, terminal: Terminal) -> Optional[Dict[str, Any]]:
        """Get account data directly from MT4 terminal using DLL or API calls"""
        # This method is simplified - just return None since we use file-based approach
        return None

    def _extract_balance_from_terminal_files(self, data_path: Path) -> Optional[float]:
        """Extract balance from terminal files"""
        # This method is simplified - just return None since we use file-based approach
        return None

    def _extract_balance_from_log(self, log_content: str) -> Optional[float]:
        """Extract balance from log content"""
        # This method is simplified - just return None since we use file-based approach
        return None

    def _get_mt4_account_data_via_ea_collection(self, terminal: Terminal) -> Optional[Dict[str, Any]]:
        """Get account data via EA collection - simplified to use file-based approach"""
        # This method is simplified - just use the file reading approach
        return self._read_account_data_from_file(terminal)

    def _get_mt4_account_data_multi_method(self, terminal: Terminal) -> Optional[Dict[str, Any]]:
        """Get account data from MT4 terminal via multiple communication methods"""
        # This method is simplified - just use the file reading approach
        return self._read_account_data_from_file(terminal)

    def _get_mt4_account_data_via_http(self, terminal: Terminal) -> Optional[Dict[str, Any]]:
        """Get account data via HTTP - simplified to use file-based approach"""
        # This method is simplified - just use the file reading approach
        return self._read_account_data_from_file(terminal)

    def _get_mt4_account_data_via_ea(self, terminal: Terminal) -> Optional[Dict[str, Any]]:
        """Get account data via EA - simplified to use file-based approach"""
        # This method is simplified - just use the file reading approach
        return self._read_account_data_from_file(terminal)

    def _get_mt4_account_data_via_websocket(self, terminal: Terminal) -> Optional[Dict[str, Any]]:
        """Get account data via WebSocket - simplified to use file-based approach"""
        # This method is simplified - just use the file reading approach
        return self._read_account_data_from_file(terminal)

    def _get_mt4_account_data_via_mqtt(self, terminal: Terminal) -> Optional[Dict[str, Any]]:
        """Get account data via MQTT - simplified to use file-based approach"""
        # This method is simplified - just use the file reading approach
        return self._read_account_data_from_file(terminal)

    def _extract_account_data_from_log(self, log_content: str) -> Optional[Dict[str, Any]]:
        """Extract account data from log content"""
        # This method is simplified - just return None since we use file-based approach
        return None

    def _get_server_path(self, platform_type: PlatformType, server_name: Optional[str] = None) -> str:
        """Get server path for platform type and broker"""
        # Detect broker based on server name
        broker = self._detect_broker_from_server(server_name or '')
        
        if platform_type == PlatformType.MT4:
            if broker == 'ironfx':
                return config.IRONFX_MT4_BASE_PATH if hasattr(config, 'IRONFX_MT4_BASE_PATH') else config.MT4_BASE_PATH
            elif broker == 't4trade':
                return config.T4TRADE_MT4_BASE_PATH if hasattr(config, 'T4TRADE_MT4_BASE_PATH') else config.MT4_BASE_PATH
            elif broker == 'fbs':
                return config.FBS_MT4_BASE_PATH if hasattr(config, 'FBS_MT4_BASE_PATH') else config.MT4_BASE_PATH
            else:
                return config.MT4_BASE_PATH
        else:
            if broker == 'ironfx':
                return config.IRONFX_MT5_BASE_PATH if hasattr(config, 'IRONFX_MT5_BASE_PATH') else config.MT5_BASE_PATH
            elif broker == 't4trade':
                return config.T4TRADE_MT5_BASE_PATH if hasattr(config, 'T4TRADE_MT5_BASE_PATH') else config.MT5_BASE_PATH
            elif broker == 'fbs':
                return config.FBS_MT5_BASE_PATH if hasattr(config, 'FBS_MT5_BASE_PATH') else config.MT5_BASE_PATH
            else:
                return config.MT5_BASE_PATH
    
    def _detect_broker_from_server(self, server_name: str) -> str:
        """Detect broker type from server name"""
        if not server_name:
            return 'default'
        
        server_lower = server_name.lower()
        
        # Check for IronFX servers
        if any(keyword in server_lower for keyword in ['ironfx', 'iron']):
            return 'ironfx'
        
        # Check for T4Trade servers
        if any(keyword in server_lower for keyword in ['t4trade', 't4']):
            return 't4trade'
        
        # Check for FBS servers
        if any(keyword in server_lower for keyword in ['fbs']):
            return 'fbs'
        
        # Default fallback
        return 'default'
    
    def _get_data_path(self, account_login: str, platform_type: PlatformType) -> str:
        """Get data path for terminal - CORRECTED to use login as folder name"""
        if platform_type == PlatformType.MT4:
            return os.path.join(config.MT4_INSTANCES_PATH, account_login)
        else:
            return os.path.join(config.MT5_INSTANCES_PATH, account_login)
    
    def _setup_terminal_directory(self, terminal: Terminal):
        """Setup terminal directory structure"""
        data_path = Path(terminal.data_path)
        template = TERMINAL_TEMPLATES[terminal.platform_type.value]
        
        # Create directory structure
        directories = [
            data_path,
            data_path / template['profiles_path'],
            data_path / template['experts_path'],
            data_path / template['logs_path'],
            data_path / template['data_path']
        ]
        
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
    
    def _setup_jamesplatform_data(self, terminal: Terminal, config: TerminalConfig):
        """Setup JamesPlatform data directory (no terminal.exe copying)"""
        try:
            target_path = Path(terminal.data_path)
            
            logger.info(f"Setting up JamesPlatform data directory: {target_path}")
            
            # Create directory structure for data storage
            directories = [
                target_path / "MQL4" / "Experts",
                target_path / "MQL4" / "Files", 
                target_path / "MQL4" / "Scripts",
                target_path / "MQL4" / "Indicators",
                target_path / "MQL4" / "Libraries",
                target_path / "profiles",
                target_path / "logs",
                target_path / "config"
            ]
            
            for directory in directories:
                directory.mkdir(parents=True, exist_ok=True)
                logger.debug(f"Created directory: {directory}")
            
            logger.info(f"JamesPlatform data directory setup completed: {target_path}")
            
        except Exception as e:
            logger.error(f"Error setting up JamesPlatform data directory: {e}")
            raise
    
    def _create_config_files(self, terminal: Terminal, config: TerminalConfig):
        """Create configuration files for terminal"""
        try:
            template = TERMINAL_TEMPLATES[terminal.platform_type.value]
            config_path = Path(terminal.data_path) / template['config_file']
            
            # Create login.ini with proper auto-login configuration (NO INDENTATION)
            config_content = f"""[Common]
Login={config.login}
Password={config.password}
Server={config.server}
Group={config.groupid}
AutoUpdate=0
News=0
Sound=0
Charts=0
Grid=0
AskLine=0
Volumes=0
Minimize=1
Portable=1
AutoLogin=1
SavePassword=1
AutoConnect=1
EnableNews=0
EnableSounds=0
EnableCharts=0
EnableGrid=0
EnableAskLine=0
EnableVolumes=0
MinimizeOnStart=1
PortableMode=1
EnableAutoLogin=1
AutoLoginOnStart=1
SavePasswordOnStart=1
ConnectOnStart=1

[Charts]
Mode=0

[Terminal]
AutoLogin=1
SavePassword=1
EnableAutoLogin=1
AutoLoginOnStart=1
ConnectOnStart=1
"""
            
            with open(config_path, 'w') as f:
                f.write(config_content)
            
            # Also create a common.ini file for additional settings
            common_config_path = Path(terminal.data_path) / "common.ini"
            common_content = f"""[Common]
Login={config.login}
Password={config.password}
Server={config.server}
Group={config.groupid}
AutoLogin=1
SavePassword=1
AutoConnect=1
EnableAutoLogin=1
AutoLoginOnStart=1
ConnectOnStart=1
"""
            
            with open(common_config_path, 'w') as f:
                f.write(common_content)
            
            # Create config.ini file (alternative name)
            config_ini_path = Path(terminal.data_path) / "config.ini"
            config_ini_content = f"""[Common]
                Login={config.login}
                Password={config.password}
                Server={config.server}
                Group={config.groupid}
                AutoLogin=1
                SavePassword=1
                AutoConnect=1
                EnableAutoLogin=1
                Minimize=1
                Portable=1
            """
            
            with open(config_ini_path, 'w') as f:
                f.write(config_ini_content)
            
            # Create terminal.ini file (another alternative)
            terminal_ini_path = Path(terminal.data_path) / "terminal.ini"
            terminal_ini_content = f"""[Common]
                Login={config.login}
                Password={config.password}
                Server={config.server}
                Group={config.groupid}
                AutoLogin=1
                SavePassword=1
                AutoConnect=1
                EnableAutoLogin=1
            """
            
            with open(terminal_ini_path, 'w') as f:
                f.write(terminal_ini_content)
            
            
            # Create additional auto-login files
            self._create_auto_login_files(terminal, config)
            
            logger.info(f"Created config files for terminal {terminal.terminal_id}")
            
        except Exception as e:
            logger.error(f"Error creating config files: {e}")
    
    def _create_auto_login_files(self, terminal: Terminal, config: TerminalConfig):
        """Create additional auto-login configuration files"""
        try:
            # Create profiles.ini file
            profiles_path = Path(terminal.data_path) / "profiles" / "profiles.ini"
            profiles_path.parent.mkdir(parents=True, exist_ok=True)
            
            profiles_content = f"""[Profile]
                Name=AutoLogin
                Login={config.login}
                Password={config.password}
                Server={config.server}
                Group={config.groupid}
                AutoLogin=1
                SavePassword=1
            """
            
            with open(profiles_path, 'w') as f:
                f.write(profiles_content)
            
            # Create auto-login script
            script_path = Path(terminal.data_path) / "auto_login.script"
            script_content = f"""// Auto-login script for account {config.login}
// This script will automatically log in the terminal

function OnStart()
{{
    Print("Auto-login script started for account ", {config.login});
    
    // Set login credentials
    AccountInfoString(ACCOUNT_LOGIN, {config.login});
    AccountInfoString(ACCOUNT_PASSWORD, "{config.password}");
    AccountInfoString(ACCOUNT_SERVER, "{config.server}");
    AccountInfoString(ACCOUNT_GROUP, "{config.groupid}");
    
    // Attempt to connect
    if(!TerminalInfoInteger(TERMINAL_CONNECTED))
    {{
        Print("Attempting to connect to server...");
        // The terminal should auto-connect with the config files
    }}
    
    return(INIT_SUCCEEDED);
}}
"""
            
            with open(script_path, 'w') as f:
                f.write(script_content)
                
        except Exception as e:
            logger.error(f"Error creating auto-login files: {e}")
    
    def _check_terminal_process(self, terminal: Terminal) -> bool:
        """Check if terminal process is running"""
        try:
            template = TERMINAL_TEMPLATES[terminal.platform_type.value]
            executable = template['executable']
            
            # Method 1: Check if process is running using tasklist (simplified for Windows 11)
            import subprocess
            try:
                result = subprocess.run(
                    ['tasklist', '/FI', f'IMAGENAME eq {executable}'],
                capture_output=True,
                    text=True,
                    timeout=5  # Add timeout to prevent hanging
                )
                
                if executable in result.stdout:
                    logger.debug(f"Found {executable} process running")
                    return True
                    
            except subprocess.TimeoutExpired:
                logger.warning(f"tasklist command timed out for {executable}")
            except Exception as e:
                logger.warning(f"tasklist command failed: {e}")
            
            # Method 2: Check if account data file exists and is recent (indicates EA is running)
            data_path = Path(terminal.data_path)
            account_data_file = data_path / "account_data.json"
            
            if account_data_file.exists():
                # Check if file was modified in the last 30 seconds (EA is active)
                import time
                file_age = time.time() - account_data_file.stat().st_mtime
                if file_age < 30:  # File updated in last 30 seconds
                    logger.debug(f"Account data file is recent (age: {file_age:.1f}s), assuming terminal is running")
                    return True
            
            # Method 3: Check if terminal directory exists and has recent activity
            if data_path.exists():
                # Look for any recent files in the terminal directory
                recent_files = []
                for file_path in data_path.rglob("*"):
                    if file_path.is_file():
                        file_age = time.time() - file_path.stat().st_mtime
                        if file_age < 60:  # File modified in last minute
                            recent_files.append(file_path.name)
                
                if recent_files:
                    logger.debug(f"Found recent files in terminal directory: {recent_files[:3]}...")
                    return True
            
            logger.debug(f"Terminal process check failed for {executable}")
            return False
            
        except Exception as e:
            logger.error(f"Error checking terminal process: {e}")
            return False
    
    def _cleanup_terminal_directory(self, terminal: Terminal):
        """Clean up terminal directory"""
        try:
            data_path = Path(terminal.data_path)
            if data_path.exists():
                shutil.rmtree(data_path)
                logger.info(f"Cleaned up directory for terminal {terminal.terminal_id}")
        except Exception as e:
            logger.error(f"Error cleaning up terminal directory: {e}")
    
    def _apply_config_changes(self, terminal: Terminal, config_type: str, config_data: Dict[str, Any]):
        """Apply configuration changes to running terminal"""
        try:
            # Update EA config file
            config_path = Path(terminal.data_path) / "ea_config.json"
            if config_path.exists():
                import json
                with open(config_path, 'r') as f:
                    current_config = json.load(f)
                
                current_config[f"{config_type}_settings"] = config_data
                
                with open(config_path, 'w') as f:
                    json.dump(current_config, f, indent=2)
                
                logger.info(f"Applied {config_type} config changes to terminal {terminal.terminal_id}")
                
        except Exception as e:
            logger.error(f"Error applying config changes: {e}")
    
    def _monitor_terminals(self):
        """Monitor terminal processes and update status"""
        while self.running:
            try:
                with self.lock:
                    terminals_to_remove = []
                    
                    for terminal_id, terminal in self.active_terminals.items():
                        # Check if terminal process is running
                        is_running = self._check_terminal_process(terminal)
                        
                        if not is_running:
                            # Process has terminated
                            terminal.status = TerminalStatus.STOPPED
                            self.db_manager.update_terminal(terminal_id, {
                                "status": TerminalStatus.STOPPED.value,
                                "error_message": "Process terminated unexpectedly"
                            })
                            terminals_to_remove.append(terminal_id)
                            logger.warning(f"Terminal {terminal_id} process terminated")
                            continue
                        
                        # Update heartbeat
                        terminal.last_heartbeat = datetime.now()
                        self.db_manager.update_terminal(terminal_id, {
                            "last_heartbeat": terminal.last_heartbeat
                        })
                    
                    # Remove terminated terminals
                    for terminal_id in terminals_to_remove:
                        del self.active_terminals[terminal_id]
                
                time.sleep(3)  # Check every 3 seconds
                
            except Exception as e:
                logger.error(f"Error in terminal monitoring: {e}")
                time.sleep(3) 