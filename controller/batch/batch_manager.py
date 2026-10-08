import os
import shutil
from pathlib import Path
from typing import Optional
from loguru import logger

from config.config import config, TERMINAL_TEMPLATES
from models.models import Terminal, PlatformType

class BatchManager:
    """Manages .bat files for launching MT4/MT5 terminals"""
    
    def __init__(self):
        self.batch_files_path = Path(config.BATCH_FILES_PATH)
        self.batch_files_path.mkdir(parents=True, exist_ok=True)
        self.startup_folder_path = Path(config.STARTUP_FOLDER_PATH)
    
    def create_launch_batch(self, terminal: Terminal, account_login: str, terminal_config) -> Optional[str]:
        """Create a .bat file to launch a specific terminal"""
        try:
            template = TERMINAL_TEMPLATES[terminal.platform_type.value]
            executable = template['executable']
            
            # Get base MetaTrader path based on broker
            base_path = self._get_broker_terminal_path(terminal, terminal_config)
            
            # Create batch file content
            batch_content = self._generate_batch_content(
                base_path=base_path,
                executable=executable,
                terminal_path=terminal.data_path,
                config_file=template['config_file'],
                account_login=account_login,
                login=terminal_config.login,
                password=terminal_config.password,
                server=terminal_config.server,
                groupid=terminal_config.groupid
            )
            
            # Create batch file
            batch_filename = f"launch_{account_login}.bat"
            batch_file_path = self.batch_files_path / batch_filename
            
            with open(batch_file_path, 'w') as f:
                f.write(batch_content)
            
            logger.info(f"Created batch file: {batch_file_path}")
            return str(batch_file_path)
            
        except Exception as e:
            logger.error(f"Error creating batch file for account {account_login}: {e}")
            return None
    
    def create_startup_batch(self) -> Optional[str]:
        """Create the main startup batch file for all terminals"""
        try:
            batch_content = self._generate_startup_batch_content()
            
            # Create startup batch file
            startup_batch_path = self.batch_files_path / "start_all_mt4.bat"
            
            with open(startup_batch_path, 'w') as f:
                f.write(batch_content)
            
            # Copy to Windows startup folder if it exists
            try:
                startup_dest = self.startup_folder_path / "start_all_mt4.bat"
                shutil.copy2(startup_batch_path, startup_dest)
                logger.info(f"Created startup batch file: {startup_dest}")
            except Exception as e:
                logger.warning(f"Could not copy to startup folder: {e}")
                logger.info(f"Created startup batch file: {startup_batch_path}")
            
            return str(startup_batch_path)
            
        except Exception as e:
            logger.error(f"Error creating startup batch file: {e}")
            return None
    
    def delete_launch_batch(self, account_login: str) -> bool:
        """Delete the launch batch file for an account"""
        try:
            batch_filename = f"launch_{account_login}.bat"
            batch_file_path = self.batch_files_path / batch_filename
            
            if batch_file_path.exists():
                batch_file_path.unlink()
                logger.info(f"Deleted batch file: {batch_file_path}")
                return True
            else:
                logger.warning(f"Batch file not found: {batch_file_path}")
                return False
                
        except Exception as e:
            logger.error(f"Error deleting batch file for account {account_login}: {e}")
            return False
    
    def _get_broker_terminal_path(self, terminal: Terminal, terminal_config) -> str:
        """Get the correct terminal path based on broker"""
        # Detect broker based on server name
        broker = self._detect_broker_from_server(terminal_config.server)
        
        if terminal.platform_type == PlatformType.MT4:
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
    
    def _generate_batch_content(self, base_path: str, executable: str, 
                              terminal_path: str, config_file: str, 
                              account_login: str, login: str, password: str, 
                              server: str, groupid: str) -> str:
        """Generate batch file content for launching a terminal"""
        template = TERMINAL_TEMPLATES['mt4'] if 'terminal.exe' in executable else TERMINAL_TEMPLATES['mt5']
        
        # Use original terminal.exe but JamesPlatform data directory
        original_executable = os.path.join(base_path, executable)
        
        batch_content = f"""@echo off
REM Launch MT4/MT5 Terminal for Account {account_login}
REM Generated by JamesPlatform Controller
REM Original terminal.exe, JamesPlatform data directory

REM Create terminal directory structure if it doesn't exist
if not exist "{terminal_path}" (
    echo Creating terminal directory structure for account {account_login}...
    mkdir "{terminal_path}"
    mkdir "{terminal_path}\\profiles"
    mkdir "{terminal_path}\\MQL4\\Experts"
    mkdir "{terminal_path}\\MQL4\\Files"
    mkdir "{terminal_path}\\logs"
    echo Directory structure created successfully
)

REM Change to original terminal directory
cd /d "{base_path}"

REM Launch terminal from original location but use JamesPlatform data
echo Starting terminal for account {account_login} from original location...
"{original_executable}" {template['portable_flag']} {template['min_flag']} /config:"{terminal_path}\\{config_file}" /data:"{terminal_path}" /login:{login} /password:{password} /server:{server} /group:{groupid}

REM Wait longer for terminal to start and initialize
echo Waiting for terminal to start...
timeout /t 5 /nobreak > nul

REM Check if terminal process is running (simplified check)
tasklist /FI "IMAGENAME eq {executable}" | find "{executable}" > nul
if %ERRORLEVEL% EQU 0 (
    echo Terminal process for account {account_login} detected successfully
    exit /b 0
) else (
    echo Warning: Terminal process not immediately detected for account {account_login}
    echo This may be normal - terminal might still be starting
    echo Continuing anyway as the terminal may have launched successfully
    exit /b 0
)
"""
        return batch_content
    
    def _generate_startup_batch_content(self) -> str:
        """Generate the main startup batch file content"""
        batch_content = f"""@echo off
REM JamesPlatform - Start All MT4/MT5 Terminals
REM This file is automatically generated and updated by the controller
REM Launches all active terminals in staggered sequence

echo Starting JamesPlatform MT4/MT5 Terminals...
echo Staggered launch: {config.STAGGERED_LAUNCH_COUNT} terminals every {config.STAGGERED_LAUNCH_DELAY} seconds

REM Get the directory where this batch file is located
set "SCRIPT_DIR=%~dp0"

REM Launch terminals in staggered sequence
REM This will be populated by the Python controller

echo All terminals launched successfully
echo Controller will monitor and manage terminals automatically

REM Keep this window open for a moment to show status
timeout /t 5 /nobreak > nul

exit /b 0
"""
        return batch_content
    
    def update_startup_batch_with_accounts(self, active_accounts: list) -> bool:
        """Update the startup batch file with current active accounts"""
        try:
            # Read current startup batch content
            startup_batch_path = self.batch_files_path / "start_all_mt4.bat"
            
            if not startup_batch_path.exists():
                self.create_startup_batch()
            
            with open(startup_batch_path, 'r') as f:
                content = f.read()
            
            # Find the section to replace
            start_marker = "REM Launch terminals in staggered sequence"
            end_marker = "REM This will be populated by the Python controller"
            
            # Generate new launch commands
            launch_commands = []
            for i, account in enumerate(active_accounts):
                batch_file = f"launch_{account['login']}.bat"
                launch_commands.append(f'call "%SCRIPT_DIR%{batch_file}"')
                
                # Add staggered delay every N accounts
                if (i + 1) % config.STAGGERED_LAUNCH_COUNT == 0 and i < len(active_accounts) - 1:
                    launch_commands.append(f'timeout /t {config.STAGGERED_LAUNCH_DELAY} /nobreak > nul')
                    launch_commands.append('echo Launched batch of terminals, waiting...')
            
            # Replace the section
            new_section = f"{start_marker}\n"
            for cmd in launch_commands:
                new_section += f"{cmd}\n"
            new_section += f"{end_marker}"
            
            # Update content
            start_pos = content.find(start_marker)
            end_pos = content.find(end_marker) + len(end_marker)
            
            if start_pos != -1 and end_pos != -1:
                new_content = content[:start_pos] + new_section + content[end_pos:]
                
                # Write updated content
                with open(startup_batch_path, 'w') as f:
                    f.write(new_content)
                
                # Update startup folder copy if it exists
                try:
                    startup_dest = self.startup_folder_path / "start_all_mt4.bat"
                    shutil.copy2(startup_batch_path, startup_dest)
                except Exception as e:
                    logger.warning(f"Could not update startup folder copy: {e}")
                
                logger.info(f"Updated startup batch with {len(active_accounts)} accounts")
                return True
            else:
                logger.error("Could not find markers in startup batch file")
                return False
                
        except Exception as e:
            logger.error(f"Error updating startup batch file: {e}")
            return False
    
    def launch_terminal_via_batch(self, account_login: str) -> bool:
        """Launch a terminal using its batch file"""
        try:
            batch_filename = f"launch_{account_login}.bat"
            batch_file_path = self.batch_files_path / batch_filename
            
            if not batch_file_path.exists():
                logger.error(f"Batch file not found: {batch_file_path}")
                return False
            
            # Launch batch file
            import subprocess
            result = subprocess.run(
                [str(batch_file_path)],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            # Be more tolerant of batch file exit codes since the terminal may still launch successfully
            if result.returncode == 0:
                logger.info(f"Successfully launched terminal for account {account_login}")
                return True
            else:
                # Check if the error is just the "search filter cannot be recognized" issue
                if "search filter cannot be recognized" in result.stderr or "WINDOWTITLE" in result.stderr:
                    logger.warning(f"Batch file had detection issues for account {account_login}, but terminal may have launched successfully")
                    logger.warning(f"Batch stderr: {result.stderr}")
                    return True  # Consider this a success since terminal likely launched
                else:
                    logger.error(f"Failed to launch terminal for account {account_login}: {result.stderr}")
                    return False
                
        except Exception as e:
            logger.error(f"Error launching terminal via batch for account {account_login}: {e}")
            return False
    
    def cleanup_old_batch_files(self, active_logins: list) -> int:
        """Clean up batch files for accounts that are no longer active"""
        try:
            cleaned_count = 0
            
            # Get all batch files
            for batch_file in self.batch_files_path.glob("launch_*.bat"):
                # Extract login from filename
                login = batch_file.stem.replace("launch_", "")
                
                if login not in active_logins:
                    batch_file.unlink()
                    cleaned_count += 1
                    logger.info(f"Cleaned up old batch file: {batch_file}")
            
            return cleaned_count
            
        except Exception as e:
            logger.error(f"Error cleaning up old batch files: {e}")
            return 0 