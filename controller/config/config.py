import os
from typing import List, Dict, Any
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Load environment variables
load_dotenv()

class ControllerConfig(BaseSettings):
    """Configuration for MT4/MT5 Controller"""
    
    # Laravel API Configuration
    LARAVEL_API_BASE_URL: str = os.getenv('LARAVEL_API_BASE_URL', 'http://localhost:8000/api')
    LARAVEL_API_TOKEN: str = os.getenv('LARAVEL_API_TOKEN', '')
    DEFAULT_USER_ID: int = int(os.getenv('DEFAULT_USER_ID', '1'))
    LARAVEL_EMAIL: str = os.getenv('LARAVEL_EMAIL', 'jamestradingroup@gmail.com')
    LARAVEL_PASSWORD: str = os.getenv('LARAVEL_PASSWORD', 'g0326159487')
    
    # JamesPlatform Base Directory
    JAMESPLATFORM_BASE: str = os.getenv('JAMESPLATFORM_BASE', 'C:/JamesPlatform')
    
    # MetaTrader Configuration - Configurable paths
    MT4_BASE_PATH: str = os.getenv('MT4_BASE_PATH', 'C:/MetaTrader4')
    MT5_BASE_PATH: str = os.getenv('MT5_BASE_PATH', 'C:/MetaTrader5')
    MT4_INSTANCES_PATH: str = os.getenv('MT4_INSTANCES_PATH', 'C:/JamesPlatform/MT4Instances')
    MT5_INSTANCES_PATH: str = os.getenv('MT5_INSTANCES_PATH', 'C:/JamesPlatform/MT5Instances')
    
    # Broker-specific terminal paths
    IRONFX_MT4_BASE_PATH: str = os.getenv('IRONFX_MT4_BASE_PATH', 'C:/IronFX MetaTrader 4')
    IRONFX_MT5_BASE_PATH: str = os.getenv('IRONFX_MT5_BASE_PATH', 'C:/IronFX MetaTrader 5')
    T4TRADE_MT4_BASE_PATH: str = os.getenv('T4TRADE_MT4_BASE_PATH', 'C:/T4Trade MetaTrader 4')
    T4TRADE_MT5_BASE_PATH: str = os.getenv('T4TRADE_MT5_BASE_PATH', 'C:/T4Trade MetaTrader 5')
    FBS_MT4_BASE_PATH: str = os.getenv('FBS_MT4_BASE_PATH', 'C:/FBS MetaTrader 4')
    FBS_MT5_BASE_PATH: str = os.getenv('FBS_MT5_BASE_PATH', 'C:/FBS MetaTrader 5')
    
    # Terminal Management
    MAX_TERMINALS_PER_SERVER: int = int(os.getenv('MAX_TERMINALS_PER_SERVER', '10'))
    TERMINAL_LAUNCH_DELAY: int = int(os.getenv('TERMINAL_LAUNCH_DELAY', '2'))
    HEARTBEAT_INTERVAL: int = int(os.getenv('HEARTBEAT_INTERVAL', '30'))
    CONNECTION_TIMEOUT: int = int(os.getenv('CONNECTION_TIMEOUT', '60'))
    
    # Timeout Configuration for Wrong Credentials
    CREDENTIAL_VALIDATION_TIMEOUT: int = int(os.getenv('CREDENTIAL_VALIDATION_TIMEOUT', '15'))  # Reduced from 30
    TERMINAL_READY_TIMEOUT: int = int(os.getenv('TERMINAL_READY_TIMEOUT', '15'))  # Reduced from 15
    ACCOUNT_DATA_CHECK_DELAY: int = int(os.getenv('ACCOUNT_DATA_CHECK_DELAY', '2'))  # Reduced from 2
    
    # Staggered Launch Configuration - CORRECTED
    STAGGERED_LAUNCH_COUNT: int = int(os.getenv('STAGGERED_LAUNCH_COUNT', '5'))
    STAGGERED_LAUNCH_DELAY: int = int(os.getenv('STAGGERED_LAUNCH_DELAY', '10'))
    
    # File Management - JamesPlatform Structure
    EA_FILES_PATH: str = os.getenv('EA_FILES_PATH', 'C:/JamesPlatform/ea_files')
    CONFIG_FILES_PATH: str = os.getenv('CONFIG_FILES_PATH', 'C:/JamesPlatform/configs')
    LOGS_PATH: str = os.getenv('LOGS_PATH', 'C:/JamesPlatform/logs')
    BATCH_FILES_PATH: str = os.getenv('BATCH_FILES_PATH', 'C:/JamesPlatform/batch_files')
    
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
    LOG_FILE: str = os.getenv('LOG_FILE', 'C:/JamesPlatform/logs/controller.log')
    
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
    STARTUP_FOLDER_PATH: str = os.getenv('STARTUP_FOLDER_PATH', os.path.expanduser('~/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup'))
    
    class Config:
        env_file = ".env"

# Global configuration instance
config = ControllerConfig()

# Terminal templates configuration - CORRECTED
TERMINAL_TEMPLATES = {
    'mt4': {
        'executable': 'terminal.exe',
        'portable_flag': '/portable',
        'min_flag': '/min',
        'config_file': 'login.ini',  # CORRECTED: login.ini not config.ini
        'profiles_path': 'profiles',
        'experts_path': 'MQL4/Experts',
        'scripts_path': 'MQL4/Scripts',
        'logs_path': 'logs',
        'data_path': 'MQL4/Files'
    },
    'mt5': {
        'executable': 'terminal64.exe',
        'portable_flag': '/portable',
        'min_flag': '/min',
        'config_file': 'login.ini',  # CORRECTED: login.ini not config.ini
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