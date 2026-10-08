import os
import platform
from typing import List, Dict, Any
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Load environment variables
load_dotenv()

# Detect operating system
IS_WINDOWS = platform.system() == "Windows"
IS_LINUX = platform.system() == "Linux"

# Set base paths based on OS
if IS_WINDOWS:
    DEFAULT_BASE_PATH = "C:/JamesPlatform"
    DEFAULT_MT4_BASE_PATH = "C:/MetaTrader4"
    DEFAULT_MT5_BASE_PATH = "C:/MetaTrader5"
    DEFAULT_IRONFX_MT4_PATH = "C:/IronFX MetaTrader 4"
    DEFAULT_IRONFX_MT5_PATH = "C:/IronFX MetaTrader 5"
    DEFAULT_T4TRADE_MT4_PATH = "C:/T4Trade MetaTrader 4"
    DEFAULT_T4TRADE_MT5_PATH = "C:/T4Trade MetaTrader 5"
    DEFAULT_FBS_MT4_PATH = "C:/FBS MetaTrader 4"
    DEFAULT_FBS_MT5_PATH = "C:/FBS MetaTrader 5"
    DEFAULT_STARTUP_PATH = os.path.expanduser('~/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup')
else:  # Linux/Ubuntu
    DEFAULT_BASE_PATH = "/opt/JamesPlatform"
    DEFAULT_MT4_BASE_PATH = "/opt/MetaTrader4"
    DEFAULT_MT5_BASE_PATH = "/opt/MetaTrader5"
    DEFAULT_IRONFX_MT4_PATH = "/opt/IronFX MetaTrader 4"
    DEFAULT_IRONFX_MT5_PATH = "/opt/IronFX MetaTrader 5"
    DEFAULT_T4TRADE_MT4_PATH = "/opt/T4Trade MetaTrader 4"
    DEFAULT_T4TRADE_MT5_PATH = "/opt/T4Trade MetaTrader 5"
    DEFAULT_FBS_MT4_PATH = "/opt/FBS MetaTrader 4"
    DEFAULT_FBS_MT5_PATH = "/opt/FBS MetaTrader 5"
    DEFAULT_STARTUP_PATH = os.path.expanduser('~/.config/autostart')

class ControllerConfig(BaseSettings):
    """Configuration for MT4/MT5 Controller - Cross-platform support"""
    
    # Laravel API Configuration
    LARAVEL_API_BASE_URL: str = os.getenv('LARAVEL_API_BASE_URL', 'http://localhost:8000/api')
    LARAVEL_API_TOKEN: str = os.getenv('LARAVEL_API_TOKEN', '')
    DEFAULT_USER_ID: int = int(os.getenv('DEFAULT_USER_ID', '1'))
    LARAVEL_EMAIL: str = os.getenv('LARAVEL_EMAIL', 'jamestradingroup@gmail.com')
    LARAVEL_PASSWORD: str = os.getenv('LARAVEL_PASSWORD', 'g0326159487')
    
    # JamesPlatform Base Directory
    JAMESPLATFORM_BASE: str = os.getenv('JAMESPLATFORM_BASE', DEFAULT_BASE_PATH)
    
    # MetaTrader Configuration - Configurable paths
    MT4_BASE_PATH: str = os.getenv('MT4_BASE_PATH', DEFAULT_MT4_BASE_PATH)
    MT5_BASE_PATH: str = os.getenv('MT5_BASE_PATH', DEFAULT_MT5_BASE_PATH)
    MT4_INSTANCES_PATH: str = os.getenv('MT4_INSTANCES_PATH', f"{DEFAULT_BASE_PATH}/MT4Instances")
    MT5_INSTANCES_PATH: str = os.getenv('MT5_INSTANCES_PATH', f"{DEFAULT_BASE_PATH}/MT5Instances")
    
    # Broker-specific terminal paths
    IRONFX_MT4_BASE_PATH: str = os.getenv('IRONFX_MT4_BASE_PATH', DEFAULT_IRONFX_MT4_PATH)
    IRONFX_MT5_BASE_PATH: str = os.getenv('IRONFX_MT5_BASE_PATH', DEFAULT_IRONFX_MT5_PATH)
    T4TRADE_MT4_BASE_PATH: str = os.getenv('T4TRADE_MT4_BASE_PATH', DEFAULT_T4TRADE_MT4_PATH)
    T4TRADE_MT5_BASE_PATH: str = os.getenv('T4TRADE_MT5_BASE_PATH', DEFAULT_T4TRADE_MT5_PATH)
    FBS_MT4_BASE_PATH: str = os.getenv('FBS_MT4_BASE_PATH', DEFAULT_FBS_MT4_PATH)
    FBS_MT5_BASE_PATH: str = os.getenv('FBS_MT5_BASE_PATH', DEFAULT_FBS_MT5_PATH)
    
    # Terminal Management
    MAX_TERMINALS_PER_SERVER: int = int(os.getenv('MAX_TERMINALS_PER_SERVER', '10'))
    TERMINAL_LAUNCH_DELAY: int = int(os.getenv('TERMINAL_LAUNCH_DELAY', '2'))
    HEARTBEAT_INTERVAL: int = int(os.getenv('HEARTBEAT_INTERVAL', '30'))
    CONNECTION_TIMEOUT: int = int(os.getenv('CONNECTION_TIMEOUT', '60'))
    
    # Staggered Launch Configuration
    STAGGERED_LAUNCH_COUNT: int = int(os.getenv('STAGGERED_LAUNCH_COUNT', '5'))
    STAGGERED_LAUNCH_DELAY: int = int(os.getenv('STAGGERED_LAUNCH_DELAY', '10'))
    
    # File Management - JamesPlatform Structure
    EA_FILES_PATH: str = os.getenv('EA_FILES_PATH', f"{DEFAULT_BASE_PATH}/ea_files")
    CONFIG_FILES_PATH: str = os.getenv('CONFIG_FILES_PATH', f"{DEFAULT_BASE_PATH}/configs")
    LOGS_PATH: str = os.getenv('LOGS_PATH', f"{DEFAULT_BASE_PATH}/logs")
    BATCH_FILES_PATH: str = os.getenv('BATCH_FILES_PATH', f"{DEFAULT_BASE_PATH}/batch_files")
    
    # Server Configuration
    CONTROLLER_HOST: str = os.getenv('CONTROLLER_HOST', 'localhost')
    CONTROLLER_PORT: int = int(os.getenv('CONTROLLER_PORT', '8080'))
    
    # Database Configuration (MySQL)
    MYSQL_HOST: str = os.getenv('MYSQL_HOST', 'localhost')
    MYSQL_PORT: int = int(os.getenv('MYSQL_PORT', '3306'))
    MYSQL_DATABASE: str = os.getenv('MYSQL_DATABASE', 'controller')
    MYSQL_USERNAME: str = os.getenv('MYSQL_USERNAME', 'root')
    MYSQL_PASSWORD: str = os.getenv('MYSQL_PASSWORD', '')
    
    # Logging
    LOG_LEVEL: str = os.getenv('LOG_LEVEL', 'INFO')
    LOG_FILE: str = os.getenv('LOG_FILE', f"{DEFAULT_BASE_PATH}/logs/controller.log")
    
    # Auto-scaling Configuration
    AUTO_SCALE_ENABLED: bool = os.getenv('AUTO_SCALE_ENABLED', 'true').lower() == 'true'
    SCALE_UP_THRESHOLD: int = int(os.getenv('SCALE_UP_THRESHOLD', '80'))
    SCALE_DOWN_THRESHOLD: int = int(os.getenv('SCALE_DOWN_THRESHOLD', '20'))
    
    # Monitoring
    MONITORING_ENABLED: bool = os.getenv('MONITORING_ENABLED', 'true').lower() == 'true'
    PERFORMANCE_CHECK_INTERVAL: int = int(os.getenv('PERFORMANCE_CHECK_INTERVAL', '60'))
    
    # Development Mode Configuration
    DEV_MODE: bool = os.getenv('DEV_MODE', 'false').lower() == 'true'
    DEV_MODE_ALLOW_DUPLICATES: bool = os.getenv('DEV_MODE_ALLOW_DUPLICATES', 'true').lower() == 'true'
    
    # Startup Configuration
    STARTUP_FOLDER_PATH: str = os.getenv('STARTUP_FOLDER_PATH', DEFAULT_STARTUP_PATH)
    
    class Config:
        env_file = ".env"

# Global configuration instance
config = ControllerConfig()

# Terminal templates configuration - Cross-platform
TERMINAL_TEMPLATES = {
    'mt4': {
        'executable': 'terminal.exe' if IS_WINDOWS else 'terminal64',
        'portable_flag': '/portable',
        'min_flag': '/min',
        'config_file': 'login.ini',
        'profiles_path': 'profiles',
        'experts_path': 'MQL4/Experts',
        'scripts_path': 'MQL4/Scripts',
        'logs_path': 'logs',
        'data_path': 'MQL4/Files'
    },
    'mt5': {
        'executable': 'terminal64.exe' if IS_WINDOWS else 'terminal64',
        'portable_flag': '/portable',
        'min_flag': '/min',
        'config_file': 'login.ini',
        'profiles_path': 'profiles',
        'experts_path': 'MQL5/Experts',
        'scripts_path': 'MQL5/Scripts',
        'logs_path': 'logs',
        'data_path': 'MQL5/Files'
    }
}

# Server configurations
SERVER_CONFIGS = {
    'ironfx': {
        'mt4_servers': ['IronFX-Live', 'IronFX-Demo'],
        'mt5_servers': ['IronFX-MT5-Live', 'IronFX-MT5-Demo'],
        'default_group': 'aXciiLZp'
    },
    't4trade': {
        'mt4_servers': ['T4Trade-Live', 'T4Trade-Demo'],
        'mt5_servers': ['T4Trade-MT5-Live', 'T4Trade-MT5-Demo'],
        'default_group': 'bXciiLZp'
    },
    'fbs': {
        'mt4_servers': ['FBS-Demo', 'FBS-Live', 'FBS-Real', 'FBS-Real9'],
        'mt5_servers': ['FBS-MT5-Demo', 'FBS-MT5-Live'],
        'default_group': 'fbs'
    }
} 