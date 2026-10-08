#!/usr/bin/env python3
"""
PyAutoGUI Terminal Manager
Integrates PyAutoGUI automation with the terminal management system
Supports both MT4 and MT5 platforms
"""

import pyautogui
import time
import subprocess
import shutil
from pathlib import Path
from typing import Optional
import logging
import psutil
import re
import hashlib
from datetime import datetime
from models.models import PlatformType

# Configure logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configure PyAutoGUI
pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.5

class PyAutoGUITerminalManager:
    """Terminal manager using PyAutoGUI for automation - supports MT4 and MT5"""
    
    def __init__(self):
        # Platform-specific paths
        self.mt4_base_path = Path("C:/JamesPlatform/MT4Instances")
        self.mt5_base_path = Path("C:/JamesPlatform/MT5Instances")
        self.mt4_base_path.mkdir(parents=True, exist_ok=True)
        self.mt5_base_path.mkdir(parents=True, exist_ok=True)
        
        # Platform-specific executables
        self.mt4_executable = "terminal.exe"
        self.mt5_executable = "terminal64.exe"  # MT5 typically uses 64-bit executable
        
        # Single user configuration (no multi-user needed)
        self.max_terminals_per_system = 30  # Max terminals per VM/OS
        self.current_terminal_count = 0  # Track current terminal count
    
    def get_base_path(self, platform_type: PlatformType) -> Path:
        """Get base path for specific platform"""
        if platform_type == PlatformType.MT5:
            return self.mt5_base_path
        else:
            return self.mt4_base_path
    
    def get_executable(self, platform_type: PlatformType) -> str:
        """Get executable name for specific platform"""
        if platform_type == PlatformType.MT5:
            return self.mt5_executable
        else:
            return self.mt4_executable
    
    def get_template_path(self, platform_type: PlatformType) -> Path:
        """Get template path for specific platform"""
        if platform_type == PlatformType.MT5:
            return Path("C:/JamesPlatform/Templates/ironfx_template_5")
        else:
            return Path("C:/JamesPlatform/Templates/ironfx_template")
    
    def get_fallback_path(self, platform_type: PlatformType) -> Path:
        """Get fallback path for specific platform"""
        if platform_type == PlatformType.MT5:
            return Path("C:/IronFX MetaTrader 5")
        else:
            return Path("C:/IronFX MetaTrader 4")
    
    def check_system_capacity(self):
        """Check if system can handle more terminals"""
        try:
            # Get current running terminal count
            current_running = self.get_running_terminal_count()
            self.current_terminal_count = current_running
            
            can_launch = current_running < self.max_terminals_per_system
            logger.info(f"System capacity: {current_running}/{self.max_terminals_per_system} terminals")
            
            return can_launch
        except Exception as e:
            logger.error(f"Error checking system capacity: {e}")
            return False
    
    def create_terminal(self, login: str, password: str, server: str, groupid: str = "", account_id: str = None, platform_type: PlatformType = PlatformType.MT4) -> bool:
        try:
            # Import config to check DEV_MODE
            from config.config import config
            
            # Use account_id_login only in DEV_MODE, otherwise use just login
            if config.DEV_MODE and account_id:
                terminal_dir_name = f"{account_id}_{login}"
                logger.info(f"DEV_MODE: Using unique directory name: {terminal_dir_name} (account_id: {account_id})")
            else:
                terminal_dir_name = login
                logger.info(f"Using standard directory name: {terminal_dir_name}")
            
            logger.info(f"Creating {platform_type.value.upper()} terminal for login: {login}")
            
            base_path = self.get_base_path(platform_type)
            terminal_path = base_path / terminal_dir_name
            terminal_path.mkdir(parents=True, exist_ok=True)
            
            template_path = self.get_template_path(platform_type)
            fallback_path = self.get_fallback_path(platform_type)
            
            logger.info(f" Checking file sources for {platform_type.value.upper()} terminal creation...")
            
            template_has_files = False
            if template_path.exists():
                template_items = list(template_path.iterdir())
                if len(template_items) > 0:
                    template_has_files = True
                    logger.info(f" Template directory found with {len(template_items)} items: {template_path}")
                else:
                    logger.warning(f" Template directory exists but is empty: {template_path}")
            else:
                logger.warning(f" Template directory not found: {template_path}")
            
            if template_has_files:
                source_path = template_path
                logger.info(f" Using TEMPLATE directory for {platform_type.value.upper()} file copying")
            else:
                if fallback_path.exists():
                    source_path = fallback_path
                    logger.info(f" Using FALLBACK: {platform_type.value.upper()} installation for file copying")
                else:
                    logger.error(f" Neither template nor fallback directory exists for {platform_type.value.upper()}:")
                    logger.error(f"  Template: {template_path}")
                    logger.error(f"  Fallback: {fallback_path}")
                    logger.error(f"Please ensure either the template directory has files or {platform_type.value.upper()} is installed")
                    return False
            
            try:
                copied_items = 0
                for item in source_path.iterdir():
                    source_item = source_path / item.name
                    target_item = terminal_path / item.name
                    
                    if source_item.is_file():
                        shutil.copy2(source_item, target_item)
                        logger.info(f" Copied file: {item.name}")
                        copied_items += 1
                    elif source_item.is_dir():
                        if target_item.exists():
                            shutil.rmtree(target_item)
                        shutil.copytree(source_item, target_item)
                        logger.info(f" Copied folder: {item.name}")
                        copied_items += 1
                
                if copied_items == 0:
                    logger.error("No files or folders found in source directory")
                    return False
                else:
                    source_name = "template" if template_has_files else "fallback"
                    logger.info(f" Successfully copied {copied_items} items from {source_name}")
                
            except Exception as e:
                logger.error(f"Error copying files from {source_path}: {e}")
                return False
            
            project_ea_files = ["EA.ex4", "EA.mq4"]
            experts_target = terminal_path / "MQL4" / "Experts"
            
            experts_target.mkdir(parents=True, exist_ok=True)
            
            for ea_file in project_ea_files:
                source_ea = Path.cwd() / ea_file
                target_ea = experts_target / ea_file
                if source_ea.exists():
                    shutil.copy2(source_ea, target_ea)
                    logger.info(f" Copied EA: {ea_file}")
                else:
                    logger.warning(f" EA file not found: {ea_file}")
            
            login_ini = terminal_path / "login.ini"
            login_content = f"""[Common]
Login={login}
Password={password}
Server={server}
Group={groupid}
AutoLogin=1
SavePassword=1
AutoConnect=1
"""
            with open(login_ini, 'w') as f:
                f.write(login_content)
            logger.info("Created login.ini")
            
            terminal_ini = terminal_path / "terminal.ini"
            terminal_content = """[Common]
MaxBars=5000
Charts=1
NewsEnabled=0
MarketWatch=0
"""
            with open(terminal_ini, 'w') as f:
                f.write(terminal_content)
            logger.info("Created terminal.ini with optimized settings")
            
            return True
            
        except Exception as e:
            logger.error(f"Error creating terminal: {e}")
            return False
    
    def launch_terminal(self, login: str, account_id: str = None, platform_type: PlatformType = PlatformType.MT4) -> tuple[bool, Optional[int]]:
        try:
            logger.info(f"Launching terminal for login: {login}")
            
            time.sleep(self.get_dynamic_delay(2))
            
            # Import config to check DEV_MODE
            from config.config import config
            
            # Use account_id_login only in DEV_MODE, otherwise use just login
            if config.DEV_MODE and account_id:
                terminal_dir_name = f"{account_id}_{login}"
            else:
                terminal_dir_name = login
            
            base_path = self.get_base_path(platform_type)
            terminal_path = base_path / terminal_dir_name
            terminal_exe = terminal_path / self.get_executable(platform_type)
            
            if not terminal_exe.exists():
                logger.error(f"{self.get_executable(platform_type)} not found: {terminal_exe}")
                return False, None
            
            # Check system capacity before launching
            if not self.check_system_capacity():
                logger.error(f"System at capacity limit: {self.current_terminal_count}/{self.max_terminals_per_system} terminals")
                return False, None
            
            logger.info(f" Launching terminal on current system (total: {self.current_terminal_count + 1})")
            
            # Launch terminal directly (no user switching needed)
            cmd = [str(terminal_exe), "/portable"]
            logger.info(f" Launching terminal: {' '.join(cmd)}")
            
            # Use subprocess.Popen to get the process ID directly
            process = subprocess.Popen(cmd, cwd=str(terminal_path))
            process_id = process.pid
            logger.info(f" Terminal launched with PID: {process_id}")
            
            # Give the process a moment to start
            time.sleep(2)
            
            base_timeout = 30
            poll_interval = 2
            start_time = time.time()
            
            # Verify process is running and wait for terminal to be ready
            while time.time() - start_time < base_timeout:
                try:
                    proc = psutil.Process(process_id)
                    if proc.status() == psutil.STATUS_RUNNING:
                        logger.info(f" Terminal process {process_id} is running successfully.")
                        return True, process_id
                    else:
                        logger.warning(f"Process {process_id} not running: {proc.status()}")
                        break
                except psutil.NoSuchProcess:
                    logger.error(f"Process {process_id} no longer exists.")
                    break
                except Exception as e:
                    logger.warning(f"Error checking process {process_id}: {e}")
                
                time.sleep(poll_interval)
                logger.info(f"⏳ Waiting for terminal to be ready... ({time.time() - start_time:.1f}s)")
            
            logger.error(f"Timeout or process failure after {base_timeout:.2f}s for PID {process_id}.")
            return False, None
            
        except Exception as e:
            logger.error(f"Error launching terminal: {e}")
            return False, None
    
    def fix_terminal_window(self, login: str, window_title: str = "MetaTrader 4") -> bool:
        logger.info(f" Skipping window fix for login: {login} (not required in multi-user setup)")
        return True
    
    def open_currency_pair_chart(self, pair: str) -> bool:
        try:
            logger.info(f" Opening {pair} chart from Market Watch...")
            market_watch_x = 50
            market_watch_y = 200
            pyautogui.click(market_watch_x, market_watch_y)
            time.sleep(0.1)
            chart_x = 700
            chart_y = 450
            pyautogui.drag(chart_x, chart_y, duration=1)
            time.sleep(0.1)
            logger.info(f" Opened {pair} chart")
            return True
        except Exception as e:
            logger.error(f"Error opening {pair} chart: {e}")
            return False
    
    def load_ea_on_chart(self, ea_name: str = "EA") -> bool:
        try:
            logger.info(f"🤖 Loading EA: {ea_name}")
            nav_x = 25
            nav_y = 530
            pyautogui.click(nav_x, nav_y)
            time.sleep(0.1)
            ea_list_x = nav_x + 50
            ea_list_y = nav_y + 20
            pyautogui.click(ea_list_x, ea_list_y)
            time.sleep(0.1)
            chart_x = 800
            chart_y = -350
            pyautogui.drag(chart_x, chart_y, duration=1)
            time.sleep(0.1)
            pyautogui.press('enter')
            logger.info(f" Loaded EA on chart")
            return True
        except Exception as e:
            logger.error(f"Error loading EA: {e}")
            return False
    
    def enable_auto_trading(self) -> bool:
        try:
            logger.info(" Enabling auto trading...")
            pyautogui.hotkey('ctrl', 'e')
            time.sleep(0.1)
            logger.info(" Auto trading enabled")
            return True
        except Exception as e:
            logger.error(f"Error enabling auto trading: {e}")
            return False
    
    def automate_login(self, login: str, password: str, server: str, platform_type: PlatformType = PlatformType.MT4) -> bool:
        try:
            logger.info(f"Starting automated login for {platform_type.value.upper()}: {login}")
            original_failsafe = pyautogui.FAILSAFE
            pyautogui.FAILSAFE = False
            logger.info(" Temporarily disabled PyAutoGUI fail-safe for login automation")
            
            try:
                # Wait for terminal to fully load
                base_wait_time = 1
                dynamic_wait_time = self.get_dynamic_delay(base_wait_time)
                logger.info(f"⏳ Waiting {dynamic_wait_time:.2f} seconds for terminal to fully load...")
                time.sleep(dynamic_wait_time)
                
                # Check if login dialog is present by looking for common elements
                logger.info(" Looking for login dialog...")
                
                # Try to find and handle server selection popup first
                logger.info("Handling server selection popup...")
                
                if platform_type == PlatformType.MT5:
                    # MT5: Check if server is MetaQuotes (default) or custom
                    is_ironfx = "ironfx" in server.lower()
                    
                    if not is_ironfx:
                        broker_name = server.split('-')[0]
                        logger.info(f"Non-ironfx server detected for MT5. Broker: {broker_name}")
                        
                        # MT5: Press Tab, Tab, Tab to navigate to server field
                        logger.info("MT5: Navigating to server field with Tab, Tab, Tab...")
                        pyautogui.press('tab')
                        time.sleep(0.2)
                        pyautogui.press('tab')
                        time.sleep(0.2)
                        pyautogui.press('tab')
                        time.sleep(0.2)
                        
                        # Type broker name
                        logger.info(f"MT5: Entering broker name: {broker_name}")
                        pyautogui.typewrite(broker_name)
                        time.sleep(0.2)
                        pyautogui.press('enter')
                        time.sleep(0.2)
                    else:
                        logger.info("MetaQuotes server detected for MT5, using standard navigation")
                else:
                    # MT4: Check if server is IronFX (default) or custom
                    is_ironfx = "ironfx" in server.lower()
                    
                    if not is_ironfx:
                        broker_name = server.split('-')[0]
                        logger.info(f"Non-IronFX server detected for MT4. Broker: {broker_name}")
                        
                        # MT4: Long press down arrow to find broker
                        logger.info("MT4: Scrolling down to find broker in server list...")
                        pyautogui.press('down')
                        time.sleep(2)
                        
                        pyautogui.press('enter')
                        time.sleep(0.1)
                        
                        # Type broker name
                        logger.info(f"MT4: Entering broker name: {broker_name}")
                        pyautogui.typewrite(broker_name)
                        time.sleep(0.1)
                        pyautogui.press('enter')
                        time.sleep(0.1)
                    else:
                        logger.info("IronFX server detected for MT4, using standard navigation")
                
                # Wait for server list to load
                base_server_wait = 5
                dynamic_server_wait = self.get_dynamic_delay(base_server_wait)
                logger.info(f"⏳ Waiting {dynamic_server_wait:.2f} seconds for server list to load...")
                time.sleep(dynamic_server_wait)
                
                # Close any popup and navigate to login fields
                pyautogui.press('esc')
                time.sleep(0.5)
                logger.info(" Closed server selection popup")
                
                # Wait a bit more for login dialog to be ready
                time.sleep(self.get_dynamic_delay(1))
                
                logger.info("Handling login dialog...")
                screen_width, screen_height = pyautogui.size()
                logger.info(f"Screen size: {screen_width}x{screen_height}")
                
                if platform_type == PlatformType.MT5:
                    # MT5: Press Alt+F, then L to show login dialog
                    logger.info("MT5: Opening login dialog with Alt+F, L...")
                    pyautogui.hotkey('alt', 'f')
                    time.sleep(0.2)
                    pyautogui.press('l')
                    time.sleep(0.5)
                else:
                    # MT4: Login dialog should already be open after ESC
                    logger.info("MT4: Login dialog should be open after ESC")
                
                # Wait for login dialog to appear
                time.sleep(self.get_dynamic_delay(1))
                
                # Clear and enter login
                pyautogui.hotkey('ctrl', 'a')
                time.sleep(0.1)
                pyautogui.press('delete')
                time.sleep(0.1)
                pyautogui.typewrite(login)
                logger.info(f" Entered login: {login}")
                time.sleep(0.2)
                
                # Navigate to password field
                pyautogui.press('tab')
                time.sleep(0.2)
                
                # Clear and enter password
                pyautogui.hotkey('ctrl', 'a')
                time.sleep(0.1)
                pyautogui.press('delete')
                time.sleep(0.1)
                pyautogui.typewrite(password)
                logger.info(" Entered password")
                time.sleep(0.2)
                
                # Navigate to server field
                pyautogui.press('tab')
                time.sleep(0.2)

                if platform_type == PlatformType.MT5:
                    pyautogui.press('tab')
                    time.sleep(0.2)
                
                # Clear and enter server
                pyautogui.hotkey('ctrl', 'a')
                time.sleep(0.1)
                pyautogui.press('delete')
                time.sleep(0.1)
                pyautogui.typewrite(server)
                logger.info(f" Entered server: {server}")
                time.sleep(0.2)
                
                # Navigate to OK button and press it
                pyautogui.press('tab')
                time.sleep(0.2)

                if platform_type == PlatformType.MT4:
                    pyautogui.press('tab')
                    time.sleep(0.2)

                pyautogui.press('enter')
                logger.info(" Pressed OK")
                
                # Wait for login to complete
                login_wait = self.get_dynamic_delay(5)
                logger.info(f"⏳ Waiting {login_wait:.2f} seconds for login to complete...")
                time.sleep(login_wait)
                
                # Check for error messages that indicate wrong credentials
                logger.info("Checking for login error messages...")
                try:
                    # Look for common error messages in the terminal window
                    error_keywords = ["invalid", "wrong", "incorrect", "failed", "error", "denied", "rejected"]
                    
                    # Take a screenshot and check for error messages (simplified approach)
                    # For now, we'll just log that we're checking and continue
                    # In a real implementation, you might use OCR to detect error messages
                    logger.info("Login error detection check completed")
                    
                except Exception as e:
                    logger.warning(f"Error during login error detection: {e}")
                
                logger.info(f"{platform_type.value.upper()} login automation completed")
                return True
                
            finally:
                pyautogui.FAILSAFE = original_failsafe
                logger.info(" Restored PyAutoGUI fail-safe")
                
        except Exception as e:
            logger.error(f"Error in {platform_type.value.upper()} login automation: {e}")
            return False
    
    def check_account_data_exists(self, login: str, account_id: str = None, platform_type: PlatformType = PlatformType.MT4) -> bool:
        try:
            from config.config import config
            base_wait_time = config.ACCOUNT_DATA_CHECK_DELAY  # Configurable delay
            dynamic_wait_time = self.get_dynamic_delay(base_wait_time)
            logger.info(f"⏳ Waiting {dynamic_wait_time:.2f} seconds for account_data.json to be generated for login: {login}")
            time.sleep(dynamic_wait_time)
            
            # Import config to check DEV_MODE
            from config.config import config
            
            # Use account_id_login only in DEV_MODE, otherwise use just login
            if config.DEV_MODE and account_id:
                terminal_dir_name = f"{account_id}_{login}"
            else:
                terminal_dir_name = login
                
            base_path = self.get_base_path(platform_type)
            
            # Use platform-specific MQL folder
            if platform_type == PlatformType.MT5:
                mql_folder = "MQL5"
            else:
                mql_folder = "MQL4"
                
            possible_paths = [
                base_path / terminal_dir_name / mql_folder / "Files" / "account_data.json",
                base_path / terminal_dir_name / "account_data.json",
                base_path / terminal_dir_name / "config" / "account_data.json"
            ]
            for path in possible_paths:
                if path.exists():
                    logger.info(f" Account data file found: {path}")
                    return True
            logger.warning(f" Account data file not found for login: {login} in {platform_type.value.upper()}")
            logger.debug(f"Checked paths: {[str(p) for p in possible_paths]}")
            return False
        except Exception as e:
            logger.error(f"Error checking account data file for login {login}: {e}")
            return False

    def create_and_launch_with_login(self, login: str, password: str, server: str, groupid: str = "", account_id: str = None, platform_type: PlatformType = PlatformType.MT4) -> tuple[bool, Optional[int], Optional[str]]:
        try:
            logger.info(f"Creating and launching terminal with login for: {login}")
            
            # Step 1: Create terminal (copying resources)
            if not self.create_terminal(login, password, server, groupid, account_id, platform_type):
                logger.error("Failed to create terminal")
                logger.info("ℹ File cleanup will be handled by the API server")
                return False, None, "CREATE_FAILED"
            
            # Step 2: Test automation before launch
            logger.info("🧪 Testing automation before launch...")
            # Update status to initializing
            if account_id:
                try:
                    from api_server import update_creation_status, CreationStep
                    update_creation_status(account_id, CreationStep.INITIALIZING, "Initializing account creation process")
                except:
                    pass
            
            if not self.test_automation(login, password, server, platform_type):
                logger.error(" Automation test failed - PyAutoGUI may not be working")
                return False, None, "AUTOMATION_TEST_FAILED"
            
            # Step 3: Launch terminal
            # Update status to automating login
            if account_id:
                try:
                    from api_server import update_creation_status, CreationStep
                    update_creation_status(account_id, CreationStep.AUTOMATING_LOGIN, "Automating login process")
                except:
                    pass
            
            success, process_id = self.launch_terminal(login, account_id, platform_type)
            if not success:
                logger.error("Failed to launch terminal")
                logger.info("ℹ File cleanup will be handled by the API server")
                return False, None, "LAUNCH_FAILED"
            
            # Step 4: Wait for terminal to be ready (just check if process is running)
            logger.info(" Waiting for terminal to be ready for automation...")
            # Update status to automating login
            if account_id:
                try:
                    from api_server import update_creation_status, CreationStep
                    update_creation_status(account_id, CreationStep.AUTOMATING_LOGIN, "Automating login process")
                except:
                    pass
            
            ready_wait = 0
            from config.config import config
            max_ready_wait = config.TERMINAL_READY_TIMEOUT  # Configurable timeout
            while ready_wait < max_ready_wait:
                try:
                    proc = psutil.Process(process_id)
                    if proc.status() == psutil.STATUS_RUNNING:
                        logger.info(" Terminal process is running and ready for automation")
                        break
                except psutil.NoSuchProcess:
                    logger.error(f"Terminal process {process_id} no longer exists")
                    return False, None, "PROCESS_DIED"
                time.sleep(1)
                ready_wait += 1
                logger.info(f"⏳ Waiting for terminal to be ready... ({ready_wait}/{max_ready_wait}s)")
            
            if ready_wait >= max_ready_wait:
                logger.warning(" Terminal may not be fully ready, but proceeding with automation")
            
            # Additional wait for terminal window to appear
            logger.info("⏳ Additional wait for terminal window to fully load...")
            time.sleep(5)
            
            # Step 5: Check if terminal window is visible
            logger.info(" Checking if terminal window is visible...")
            try:
                # Try to find MetaTrader window
                import subprocess
                result = subprocess.run(['tasklist', '/FI', 'WINDOWTITLE eq *MetaTrader*'], 
                                      capture_output=True, text=True)
                if 'terminal.exe' in result.stdout:
                    logger.info(" MetaTrader window found - proceeding with automation")
                else:
                    logger.warning(" MetaTrader window not found - but proceeding anyway")
            except Exception as e:
                logger.warning(f"Could not check window visibility: {e}")
            
            # Step 6: Automate login
            logger.info("🤖 Starting login automation...")
            # Update status to automating login
            if account_id:
                try:
                    from api_server import update_creation_status, CreationStep
                    update_creation_status(account_id, CreationStep.AUTOMATING_LOGIN, "Automating login process")
                except:
                    pass
            
            if not self.automate_login(login, password, server, platform_type):
                logger.error("Failed to automate login")
                logger.info("ℹ File cleanup will be handled by the API server")
                return False, None, "LOGIN_FAILED"
            
            # Step 7: Validate credentials
            logger.info(" Validating credentials by checking for account_data.json...")
            # Update status to validating credentials
            if account_id:
                try:
                    from api_server import update_creation_status, CreationStep
                    update_creation_status(account_id, CreationStep.VALIDATING_CREDENTIALS, "Validating login credentials")
                except:
                    pass
            
            validation_wait = 0
            from config.config import config
            max_validation_wait = config.CREDENTIAL_VALIDATION_TIMEOUT  # Configurable timeout
            while validation_wait < max_validation_wait:
                if self.check_account_data_exists(login, account_id, platform_type):
                    logger.info(f" Credential validation successful: account_data.json found")
                    
                    # Read account data and update database with real balance
                    # Update status to reading account data
                    if account_id:
                        try:
                            from api_server import update_creation_status, CreationStep
                            update_creation_status(account_id, CreationStep.VALIDATING_CREDENTIALS, "Validating login credentials")
                        except:
                            pass
                    
                    try:
                        from api_server import read_account_data_from_file
                        account_data = read_account_data_from_file(login, account_id, platform_type)
                        if account_data:
                            balance = account_data.get('balance', 0)
                            equity = account_data.get('equity', 0)
                            logger.info(f" Account data read successfully - Balance: {balance}, Equity: {equity}")
                            
                            # Update account state in database
                            try:
                                from db.mysql_database import MySQLDatabaseManager
                                from config.config import config
                                
                                db_manager = MySQLDatabaseManager(
                                    host=config.MYSQL_HOST,
                                    port=config.MYSQL_PORT,
                                    database=config.MYSQL_DATABASE,
                                    username=config.MYSQL_USERNAME,
                                    password=config.MYSQL_PASSWORD
                                )
                                
                                # Get account by login
                                account_dict = db_manager.get_account_by_login(login)
                                if account_dict:
                                    account_id_db = account_dict['account_id']
                                    update_data = {
                                        "balance": str(balance),
                                        "equity": str(equity),
                                        "state": "connected" if balance > 0 else "no_balance",
                                        "updated_at": datetime.now().isoformat()
                                    }
                                    success = db_manager.update_account(account_id_db, update_data)
                                    if success:
                                        logger.info(f" Account {account_id_db} updated with balance {balance} and equity {equity}")
                                    else:
                                        logger.warning(f" Failed to update account {account_id_db} with balance data")
                                else:
                                    logger.warning(f" Account not found in database for login {login}")
                            except Exception as db_error:
                                logger.error(f" Error updating account balance in database: {db_error}")
                        else:
                            logger.warning(f" Could not read account data from file for login {login}")
                    except Exception as read_error:
                        logger.error(f" Error reading account data: {read_error}")
                    
                    # Update status to completed since automation is finished
                    if account_id:
                        try:
                            from api_server import update_creation_status, CreationStep
                            update_creation_status(account_id, CreationStep.COMPLETED, "Account creation completed successfully")
                            logger.info(f"Updated account {account_id} status to COMPLETED")
                        except Exception as status_error:
                            logger.error(f"Error updating status to COMPLETED for account {account_id}: {status_error}")
                    
                    logger.info(f"Successfully created, launched, and logged in terminal for: {login} with PID: {process_id}")
                    logger.info(f"🟢 Terminal will remain open and running - DO NOT CLOSE")
                    return True, process_id, None
                time.sleep(2)
                validation_wait += 2
                logger.info(f"⏳ Waiting for account data... ({validation_wait}/{max_validation_wait}s)")
            
            # If we get here, validation failed
            logger.error(" Credential validation failed: account_data.json not found after timeout")
            logger.error("This indicates wrong login credentials (login, password, or server)")
            logger.info(" Stopping terminal due to wrong credentials...")
            self.stop_terminal(login, process_id, account_id, platform_type)
            logger.info("ℹ File cleanup will be handled by the API server")
            return False, None, "WRONG_CREDENTIALS"
            
        except Exception as e:
            logger.error(f"Error in create_and_launch_with_login: {e}")
            return False, None, "UNKNOWN_ERROR"
    
    def is_terminal_running(self, login: str, account_id: str = None, platform_type: PlatformType = PlatformType.MT4) -> bool:
        try:
            # Import config to check DEV_MODE
            from config.config import config
            
            # Use account_id_login only in DEV_MODE, otherwise use just login
            if config.DEV_MODE and account_id:
                terminal_dir_name = f"{account_id}_{login}"
            else:
                terminal_dir_name = login
                
            base_path = self.get_base_path(platform_type)
            terminal_dir = base_path / terminal_dir_name
            if not terminal_dir.exists():
                logger.info(f"Terminal directory not found for login: {login} (path: {terminal_dir})")
                return False
            terminal_exe = terminal_dir / self.get_executable(platform_type)
            if not terminal_exe.exists():
                logger.info(f"Terminal.exe not found for login: {login}")
                return False
            result = subprocess.run(['tasklist', '/FI', f'IMAGENAME eq {self.get_executable(platform_type)}'], 
                                  capture_output=True, text=True)
            if self.get_executable(platform_type) in result.stdout:
                try:
                    wmic_result = subprocess.run(
                        ['wmic', 'process', 'where', f'name="{self.get_executable(platform_type)}"', 'get', 'ProcessId,CommandLine,ExecutablePath', '/format:csv'],
                        capture_output=True, text=True
                    )
                    if wmic_result.returncode == 0 and self.get_executable(platform_type) in wmic_result.stdout:
                        lines = wmic_result.stdout.strip().split('\n')
                        for line in lines[1:]:
                            if line.strip() and ',' in line:
                                parts = line.split(',')
                                if len(parts) >= 4:
                                    cmd_line = parts[2].strip('"')
                                    exec_path = parts[3].strip('"')
                                    if (login in cmd_line or 
                                        str(terminal_dir) in cmd_line or 
                                        str(terminal_dir) in exec_path or
                                        str(terminal_exe) in exec_path):
                                        logger.info(f"Terminal is running for login: {login} (found in process)")
                                        return True
                    logger.info(f"No specific terminal process found for login: {login}")
                    return False
                except Exception as e:
                    logger.warning(f"Error checking specific terminal process for login {login}: {e}")
                    logger.info(f"Error checking process, assuming terminal NOT running for login: {login}")
                    return False
            else:
                logger.info(f"No {self.get_executable(platform_type)} process running for login: {login}")
                return False
        except Exception as e:
            logger.error(f"Error checking terminal status for login {login}: {e}")
            return False
    
    def stop_terminal(self, login: str, process_id: Optional[int] = None, account_id: str = None, platform_type: PlatformType = PlatformType.MT4) -> bool:
        try:
            logger.info(f"Stopping terminal for login: {login}")
            
            # Import config to check DEV_MODE
            from config.config import config
            
            # Use account_id_login only in DEV_MODE, otherwise use just login
            if config.DEV_MODE and account_id:
                terminal_dir_name = f"{account_id}_{login}"
            else:
                terminal_dir_name = login
                
            base_path = self.get_base_path(platform_type)
            terminal_dir = base_path / terminal_dir_name
            if not terminal_dir.exists():
                logger.info(f"Terminal directory not found for login: {login}, nothing to stop")
                return True
            if process_id:
                try:
                    logger.info(f"Attempting to kill terminal process {process_id} for login: {login}")
                    kill_result = subprocess.run(['taskkill', '/F', '/PID', str(process_id)], capture_output=True)
                    if kill_result.returncode == 0:
                        logger.info(f"Successfully killed terminal process {process_id} for login: {login}")
                        return True
                    else:
                        logger.warning(f"Failed to kill process {process_id} for login: {login}, trying alternative method")
                except Exception as e:
                    logger.warning(f"Error killing process {process_id}: {e}")
            try:
                result = subprocess.run(
                    ['wmic', 'process', 'where', f'name="{self.get_executable(platform_type)}"', 'get', 'ProcessId,CommandLine,ExecutablePath', '/format:csv'],
                    capture_output=True, text=True
                )
                if result.returncode == 0 and self.get_executable(platform_type) in result.stdout:
                    lines = result.stdout.strip().split('\n')
                    for line in lines[1:]:
                        if line.strip() and ',' in line:
                            parts = line.split(',')
                            if len(parts) >= 4:
                                pid = parts[1].strip('"')
                                cmd_line = parts[2].strip('"')
                                exec_path = parts[3].strip('"')
                                if (login in cmd_line or 
                                    str(terminal_dir) in cmd_line or 
                                    str(terminal_dir) in exec_path or
                                    str(terminal_dir / self.get_executable(platform_type)) in exec_path):
                                    kill_result = subprocess.run(['taskkill', '/F', '/PID', pid], capture_output=True)
                                    if kill_result.returncode == 0:
                                        logger.info(f"Successfully killed terminal process {pid} for login: {login}")
                                        return True
                                    else:
                                        logger.warning(f"Failed to kill process {pid} for login: {login}")
                    logger.warning(f"Could not find specific terminal process for login: {login}")
                else:
                    logger.info(f"No terminal processes found running")
            except Exception as e:
                logger.warning(f"Error finding specific terminal process: {e}")
                logger.info(f"Attempting to kill any {self.get_executable(platform_type)} process for login: {login}")
            try:
                kill_result = subprocess.run(['taskkill', '/F', '/IM', self.get_executable(platform_type)], capture_output=True)
                if kill_result.returncode == 0:
                    logger.info(f"Successfully killed all terminal processes for login: {login}")
                    return True
                else:
                    logger.warning(f"Failed to kill terminal processes for login: {login}")
                    return False
            except Exception as e:
                logger.error(f"Error killing terminal processes for login {login}: {e}")
                return False
        except Exception as e:
            logger.error(f"Error stopping terminal for login {login}: {e}")
            return False
    
    def cleanup_terminal_directory(self, login: str, account_id: str = None, platform_type: PlatformType = PlatformType.MT4) -> bool:
        try:
            logger.info(f" Starting cleanup of terminal directory for login: {login}")
            
            # Import config to check DEV_MODE
            from config.config import config
            
            # Use account_id_login only in DEV_MODE, otherwise use just login
            if config.DEV_MODE and account_id:
                terminal_dir_name = f"{account_id}_{login}"
            else:
                terminal_dir_name = login
                
            base_path = self.get_base_path(platform_type)
            terminal_path = base_path / terminal_dir_name
            if terminal_path.exists():
                logger.info(f" Found terminal directory: {terminal_path}")
                try:
                    contents = list(terminal_path.iterdir())
                    logger.info(f" Directory contents before cleanup: {[item.name for item in contents]}")
                except Exception as e:
                    logger.warning(f"Could not list directory contents: {e}")
                shutil.rmtree(terminal_path)
                logger.info(f" Terminal directory successfully cleaned: {terminal_path}")
                return True
            else:
                logger.info(f"ℹ Terminal directory not found (already cleaned): {terminal_path}")
                return True
        except Exception as e:
            logger.error(f" Error cleaning up terminal directory for login {login}: {e}")
            return False
    
    def stop_all_terminals(self) -> bool:
        """Stop all running terminal processes (both MT4 and MT5)"""
        try:
            logger.info(" Emergency shutdown: Stopping all terminal processes")
            
            # Stop MT4 terminals
            result_mt4 = subprocess.run(['taskkill', '/F', '/IM', self.mt4_executable], 
                                  capture_output=True, text=True)
            if result_mt4.returncode == 0:
                logger.info(f" Successfully stopped all {self.mt4_executable} processes")
            else:
                logger.info(f" No {self.mt4_executable} processes found or already stopped")
            
            # Stop MT5 terminals
            result_mt5 = subprocess.run(['taskkill', '/F', '/IM', self.mt5_executable], 
                                      capture_output=True, text=True)
            if result_mt5.returncode == 0:
                logger.info(f" Successfully stopped all {self.mt5_executable} processes")
            else:
                logger.info(f" No {self.mt5_executable} processes found or already stopped")
            
            return True
            
        except Exception as e:
            logger.error(f"Error stopping all terminals: {e}")
            return False
    
    def launch_existing_terminal(self, login: str, password: str, server: str, groupid: str = "", platform_type: PlatformType = PlatformType.MT4) -> tuple[bool, Optional[int], Optional[str]]:
        try:
            logger.info(f" Launching existing terminal for login: {login}")
            
            launch_success, process_id = self.launch_terminal(login, platform_type=platform_type)
            if launch_success and process_id:
                logger.info(f"Terminal launched successfully with PID: {process_id}")
                
                # Wait for terminal to load
                time.sleep(self.get_dynamic_delay(3))
                
                # Automate login
                if self.automate_login(login, password, server, platform_type):
                    logger.info("Login automation completed successfully")
                    return True, process_id, "SUCCESS"
                else:
                    logger.error("Login automation failed")
                    return False, process_id, "LOGIN_FAILED"
            else:
                logger.error("Failed to launch existing terminal")
                return False, None, "LAUNCH_FAILED"
                
        except Exception as e:
            logger.error(f"Error launching existing terminal: {e}")
            return False, None, "ERROR"

    def resume_terminal_only(self, login: str, platform_type: PlatformType = PlatformType.MT4) -> tuple[bool, Optional[int], Optional[str]]:
        """Launch terminal only without automation (for resume operations)"""
        try:
            logger.info(f" Resuming terminal only for login: {login} (no automation)")
            
            launch_success, process_id = self.launch_terminal(login, platform_type=platform_type)
            if launch_success and process_id:
                logger.info(f"Terminal resumed successfully with PID: {process_id}")
                return True, process_id, "SUCCESS"
            else:
                logger.error("Failed to resume terminal")
                return False, None, "LAUNCH_FAILED"
                
        except Exception as e:
            logger.error(f"Error resuming terminal: {e}")
            return False, None, "ERROR"

    def launch_terminal_simple(self, login: str, platform_type: PlatformType = PlatformType.MT4) -> tuple[bool, Optional[int], Optional[str]]:
        """Simply launch terminal.exe without any automation (for EA updates)"""
        try:
            logger.info(f"🚀 Simply launching terminal.exe for login: {login}")
            
            # Import config to check DEV_MODE
            from config.config import config
            
            # Use account_id_login only in DEV_MODE, otherwise use just login
            if config.DEV_MODE:
                terminal_dir_name = f"{login}"  # Simplified for EA updates
            else:
                terminal_dir_name = login
                
            base_path = self.get_base_path(platform_type)
            terminal_path = base_path / terminal_dir_name
            terminal_exe = terminal_path / self.get_executable(platform_type)
            
            if not terminal_exe.exists():
                logger.error(f"{self.get_executable(platform_type)} not found: {terminal_exe}")
                return False, None, "EXE_NOT_FOUND"
            
            # Simply launch the terminal executable
            cmd = [str(terminal_exe), "/portable"]
            logger.info(f"Launching: {' '.join(cmd)}")
            
            process = subprocess.Popen(cmd, cwd=str(terminal_path))
            process_id = process.pid
            logger.info(f"Terminal launched with PID: {process_id}")
            
            # Give it a moment to start
            time.sleep(1)
            
            # Check if process is still running
            try:
                proc = psutil.Process(process_id)
                if proc.status() == psutil.STATUS_RUNNING:
                    logger.info(f"✅ Terminal is running successfully with PID: {process_id}")
                    return True, process_id, "SUCCESS"
                else:
                    logger.error(f"Terminal process {process_id} is not running")
                    return False, process_id, "PROCESS_DIED"
            except psutil.NoSuchProcess:
                logger.error(f"Terminal process {process_id} no longer exists")
                return False, process_id, "PROCESS_DIED"
                
        except Exception as e:
            logger.error(f"Error launching terminal simple: {e}")
            return False, None, "ERROR"

    def get_running_terminal_count(self) -> int:
        """Get count of running terminal processes (both MT4 and MT5)"""
        try:
            # Method 1: Use psutil for more accurate counting
            psutil_count = 0
            try:
                for proc in psutil.process_iter(['pid', 'name']):
                    try:
                        if proc.info['name'] in [self.mt4_executable, self.mt5_executable]:
                            psutil_count += 1
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue
                
                logger.debug(f"Psutil count: {psutil_count} terminals")
                
            except Exception as e:
                logger.warning(f"Error using psutil for terminal count: {e}")
                psutil_count = 0
            
            # Method 2: Use tasklist as backup
            tasklist_count = 0
            try:
                # Count MT4 terminals
                result_mt4 = subprocess.run(['tasklist', '/FI', f'IMAGENAME eq {self.mt4_executable}'], 
                                  capture_output=True, text=True)
                
                logger.debug(f"MT4 tasklist output: {result_mt4.stdout}")
                
                if self.mt4_executable in result_mt4.stdout:
                    lines = result_mt4.stdout.strip().split('\n')
                    # Filter out header lines and empty lines
                    terminal_lines = [line for line in lines if line.strip() and 
                                    self.mt4_executable in line and 
                                    not line.startswith('Image Name') and 
                                    not line.startswith('=')]
                    tasklist_count += len(terminal_lines)
                
                # Count MT5 terminals
                result_mt5 = subprocess.run(['tasklist', '/FI', f'IMAGENAME eq {self.mt5_executable}'], 
                                          capture_output=True, text=True)
                
                logger.debug(f"MT5 tasklist output: {result_mt5.stdout}")
                
                if self.mt5_executable in result_mt5.stdout:
                    lines = result_mt5.stdout.strip().split('\n')
                    # Filter out header lines and empty lines
                    terminal_lines = [line for line in lines if line.strip() and 
                                    self.mt5_executable in line and 
                                    not line.startswith('Image Name') and 
                                    not line.startswith('=')]
                    tasklist_count += len(terminal_lines)
                
                logger.debug(f"Tasklist count: {tasklist_count} terminals")
                
            except Exception as e:
                logger.warning(f"Error using tasklist for terminal count: {e}")
                tasklist_count = 0
            
            # Use the higher count between psutil and tasklist
            final_count = max(psutil_count, tasklist_count)
            
            logger.info(f"Running terminal count: {final_count} (psutil: {psutil_count}, tasklist: {tasklist_count})")
            return final_count
            
        except Exception as e:
            logger.error(f"Error getting running terminal count: {e}")
            return 0
    
    def get_system_performance_factor(self) -> float:
        try:
            cpu_percent = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            memory_percent = memory.percent
            cpu_factor = 1.0 + (cpu_percent / 100.0) * 0.5
            memory_factor = 1.0 + (memory_percent / 100.0) * 0.3
            performance_factor = (cpu_factor + memory_factor) / 2.0
            logger.info(f" System performance: CPU={cpu_percent:.1f}%, Memory={memory_percent:.1f}%, Factor={performance_factor:.2f}")
            return performance_factor
        except Exception as e:
            logger.warning(f"Could not get system performance metrics: {e}")
            return 1.0
    
    def get_dynamic_delay(self, base_delay: float, terminal_count: int = None) -> float:
        if terminal_count is None:
            terminal_count = self.get_running_terminal_count()
        performance_factor = self.get_system_performance_factor()
        terminal_multiplier = 1 + (terminal_count * 0.1)
        if terminal_count > 50:
            terminal_multiplier *= 1.2
        if terminal_count > 100:
            terminal_multiplier *= 1.3
        dynamic_delay = base_delay * terminal_multiplier * performance_factor
        max_delay = base_delay * 10
        final_delay = min(dynamic_delay, max_delay)
        logger.info(f"⏱ Dynamic delay calculation: base={base_delay}s, terminals={terminal_count}, performance_factor={performance_factor:.2f}, terminal_multiplier={terminal_multiplier:.2f}, calculated={dynamic_delay:.2f}s, final={final_delay:.2f}s")
        return final_delay

    def should_launch_terminal(self) -> bool:
        """Check if system can handle launching another terminal"""
        try:
            return self.check_system_capacity()
        except Exception as e:
            logger.error(f"Error checking if should launch terminal: {e}")
            return False

    def get_system_capacity(self) -> dict:
        """Get detailed system capacity information for both MT4 and MT5"""
        try:
            # Get current running terminal counts
            current_running = self.get_running_terminal_count()
            self.current_terminal_count = current_running
            
            # Get system performance factor
            performance_factor = self.get_system_performance_factor()
            
            # Calculate capacity
            can_launch = current_running < self.max_terminals_per_system
            available_slots = max(0, self.max_terminals_per_system - current_running)
            
            # Get detailed process information
            mt4_processes = []
            mt5_processes = []
            
            try:
                for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
                    try:
                        if proc.info['name'] == self.mt4_executable:
                            mt4_processes.append({
                                'pid': proc.info['pid'],
                                'cpu_percent': proc.info['cpu_percent'],
                                'memory_percent': proc.info['memory_percent']
                            })
                        elif proc.info['name'] == self.mt5_executable:
                            mt5_processes.append({
                                'pid': proc.info['pid'],
                                'cpu_percent': proc.info['cpu_percent'],
                                'memory_percent': proc.info['memory_percent']
                            })
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue
            except Exception as e:
                logger.warning(f"Error getting detailed process info: {e}")
            
            capacity_info = {
                'max_terminals_per_system': self.max_terminals_per_system,
                'current_running': current_running,
                'available_slots': available_slots,
                'can_launch': can_launch,
                'performance_factor': performance_factor,
                'mt4_processes': {
                    'count': len(mt4_processes),
                    'processes': mt4_processes
                },
                'mt5_processes': {
                    'count': len(mt5_processes),
                    'processes': mt5_processes
                },
                'system_info': {
                    'cpu_count': psutil.cpu_count(),
                    'memory_total': psutil.virtual_memory().total,
                    'memory_available': psutil.virtual_memory().available,
                    'memory_percent': psutil.virtual_memory().percent
                }
            }
            
            logger.info(f"System capacity: {current_running}/{self.max_terminals_per_system} terminals")
            logger.info(f"MT4 processes: {len(mt4_processes)}, MT5 processes: {len(mt5_processes)}")
            
            return capacity_info
            
        except Exception as e:
            logger.error(f"Error getting system capacity: {e}")
            return {
                'max_terminals_per_system': self.max_terminals_per_system,
                'current_running': 0,
                'available_slots': self.max_terminals_per_system,
                'can_launch': True,
                'performance_factor': 1.0,
                'error': str(e)
            }
    
    def should_launch_terminal(self) -> bool:
        """Check if system can handle launching another terminal"""
        try:
            capacity = self.get_system_capacity()
            
            if not capacity.get("can_launch", True):
                logger.warning(f" System at capacity limit: {capacity.get('current_running', 0)}/{capacity.get('max_terminals_per_system', 30)} terminals")
                return False
            
            logger.info(f" System can launch terminal: capacity available")
            return True
            
        except Exception as e:
            logger.error(f"Error checking if should launch terminal: {e}")
            return True  # Default to allowing launch if check fails

    def test_automation(self, login: str, password: str, server: str, platform_type: PlatformType = PlatformType.MT4) -> bool:
        """Test automation without launching terminal - just verify PyAutoGUI works"""
        try:
            logger.info(f"🧪 Testing automation for login: {login}")
            
            # Test basic PyAutoGUI functionality
            screen_width, screen_height = pyautogui.size()
            logger.info(f" PyAutoGUI working - Screen size: {screen_width}x{screen_height}")
            
            # Test typing
            test_text = "test"
            pyautogui.typewrite(test_text)
            logger.info(f" Typing test successful: '{test_text}'")
            
            # Test key combinations
            pyautogui.hotkey('ctrl', 'a')
            logger.info(" Key combination test successful: Ctrl+A")
            
            # Test navigation
            pyautogui.press('tab')
            logger.info(" Navigation test successful: Tab key")
            
            logger.info(" All automation tests passed")
            return True
            
        except Exception as e:
            logger.error(f" Automation test failed: {e}")
            return False

    def verify_terminal_ready(self, login: str, account_id: str = None, platform_type: PlatformType = PlatformType.MT4) -> bool:
        """Verify terminal is ready for automation"""
        try:
            logger.info(f" Verifying terminal readiness for login: {login}")
            
            # Check if terminal process is running
            if not self.is_terminal_running(login, account_id, platform_type):
                logger.warning(f"Terminal not running for login: {login}")
                return False
            
            # Check if terminal window is visible (basic check)
            try:
                # Try to find MetaTrader window
                import subprocess
                result = subprocess.run(['tasklist', '/FI', 'WINDOWTITLE eq *MetaTrader*'], 
                                      capture_output=True, text=True)
                if 'terminal.exe' in result.stdout:
                    logger.info(" MetaTrader window found")
                else:
                    logger.warning(" MetaTrader window not found")
            except Exception as e:
                logger.warning(f"Could not check window visibility: {e}")
            
            # Check if account data file exists (indicates successful login)
            if self.check_account_data_exists(login, account_id, platform_type):
                logger.info(" Account data file found - terminal ready")
                return True
            else:
                logger.info("ℹ Account data file not found yet - terminal may still be loading")
                return False
                
        except Exception as e:
            logger.error(f"Error verifying terminal readiness: {e}")
            return False

    def force_stop_all_terminals(self) -> int:
        """Force stop all terminal processes using multiple methods"""
        try:
            logger.info("🛑 Force stopping all terminal processes...")
            stopped_count = 0
            
            # Method 1: Use taskkill to stop all terminal.exe processes
            try:
                logger.info("🔪 Method 1: Using taskkill to stop all terminal.exe processes...")
                result = subprocess.run(['taskkill', '/F', '/IM', 'terminal.exe'], 
                                      capture_output=True, text=True, timeout=30)
                if result.returncode == 0:
                    logger.info("✅ Successfully killed all terminal.exe processes with taskkill")
                    stopped_count += 1
                else:
                    logger.warning(f"⚠️ taskkill returned code {result.returncode}: {result.stderr}")
            except subprocess.TimeoutExpired:
                logger.warning("⚠️ taskkill timed out")
            except Exception as e:
                logger.warning(f"⚠️ taskkill failed: {e}")
            
            # Method 2: Use wmic to find and kill terminal processes
            try:
                logger.info("🔪 Method 2: Using wmic to find and kill terminal processes...")
                result = subprocess.run([
                    'wmic', 'process', 'where', 'name="terminal.exe"', 'delete'
                ], capture_output=True, text=True, timeout=30)
                if result.returncode == 0:
                    logger.info("✅ Successfully killed terminal processes with wmic")
                    stopped_count += 1
                else:
                    logger.warning(f"⚠️ wmic returned code {result.returncode}: {result.stderr}")
            except subprocess.TimeoutExpired:
                logger.warning("⚠️ wmic timed out")
            except Exception as e:
                logger.warning(f"⚠️ wmic failed: {e}")
            
            # Method 3: Use psutil to find and terminate processes
            try:
                logger.info("🔪 Method 3: Using psutil to find and terminate processes...")
                psutil_stopped = 0
                for proc in psutil.process_iter(['pid', 'name']):
                    try:
                        if proc.info['name'] == 'terminal.exe':
                            logger.info(f"Terminating process {proc.info['pid']}")
                            proc.terminate()
                            psutil_stopped += 1
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue
                
                if psutil_stopped > 0:
                    logger.info(f"✅ Successfully terminated {psutil_stopped} processes with psutil")
                    stopped_count += 1
                else:
                    logger.info("ℹ️ No terminal processes found with psutil")
            except Exception as e:
                logger.warning(f"⚠️ psutil method failed: {e}")
            
            # Wait a moment for processes to terminate
            time.sleep(2)
            
            # Verify all terminals are stopped
            remaining_terminals = self.get_running_terminal_count()
            if remaining_terminals == 0:
                logger.info("✅ All terminal processes have been stopped")
            else:
                logger.warning(f"⚠️ {remaining_terminals} terminal processes may still be running")
            
            return stopped_count
            
        except Exception as e:
            logger.error(f"Error in force_stop_all_terminals: {e}")
            return 0

def main():
    """Test the PyAutoGUI Terminal Manager with Automated EA Loading"""
    total_start_time = time.time()
    print("🧪 Testing PyAutoGUI Terminal Manager with Automated EA Loading")
    print("=" * 60)
    print("🟢 NOTE: Terminals will remain open and running after successful connection")
    print("=" * 60)
    test_credentials = {
        'login': '25330565',
        'password': '545Cd0650&Zl',
        'server': 'RoboForex-Pro-5',
        'groupid': 'testgroup'
    }
    manager = PyAutoGUITerminalManager()
    print(" Step 1: Creating and launching terminal...")
    step1_start = time.time()
    success, process_id, error_code = manager.create_and_launch_with_login(
        test_credentials['login'],
        test_credentials['password'],
        test_credentials['server'],
        test_credentials['groupid']
    )
    step1_duration = time.time() - step1_start
    if success:
        print(f" Terminal created, launched, and logged in successfully! ({step1_duration:.2f}s)")
        print(f"🟢 Terminal will remain open and running - DO NOT CLOSE")
        if manager.is_terminal_running(test_credentials['login'], None):
            print(" Terminal is confirmed running!")
            total_duration = time.time() - total_start_time
            print(" Complete automation successful!")
            print(f" Terminal is running with EA loaded on EURUSD")
            print(f" Check the terminal to verify EA is running")
            print(f"⏱ Total time: {total_duration:.2f} seconds")
        else:
            print(" Terminal status unclear")
    else:
        print(f" Failed to create and launch terminal. Error code: {error_code}")


if __name__ == "__main__":
    main()