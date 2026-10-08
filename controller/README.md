# MT4/MT5 Controller

A Python-based controller for managing MetaTrader 4 and MetaTrader 5 terminal instances. This controller integrates with the JamesPlatform Laravel backend to provide automated terminal management, monitoring, and scaling capabilities.

## Features

- **Multi-Platform Support**: Manages both MT4 and MT5 terminals
- **Automated Terminal Management**: Launches, monitors, and stops terminals based on account status
- **Real-time Monitoring**: Tracks terminal health, performance, and resource usage
- **Auto-scaling**: Automatically scales terminals based on server resource usage
- **Laravel Integration**: Communicates with Laravel API for account management
- **Heartbeat System**: Sends regular status updates to the backend
- **Configuration Management**: Manages EA files, trading settings, and risk parameters
- **Logging & Monitoring**: Comprehensive logging and performance monitoring

## Architecture

The controller consists of several key components:

- **Main Controller** (`main.py`): Orchestrates all components and manages the main control loop
- **Terminal Manager** (`terminal_manager.py`): Handles terminal process management and lifecycle
- **API Client** (`api_client.py`): Communicates with Laravel backend API
- **Database Manager** (`database.py`): Manages local SQLite database for state persistence
- **Configuration** (`config.py`): Centralized configuration management

## Requirements

- **Windows Server** (Windows 10/11 or Windows Server 2019/2022)
- Python 3.8 or higher
- MetaTrader 4 and/or MetaTrader 5 installed
- Network access to Laravel API
- Administrator privileges (for batch file creation and process management)

## Installation

### 1. **Setup Virtual Environment (Recommended)**

**For Windows Server:**

```cmd
# Navigate to controller directory
cd C:\workspace\jamestrading_core\controller

# Create virtual environment
python -m venv venv

# Activate virtual environment
venv\Scripts\activate

# Verify activation (should show venv path)
where python
```

**For Production Server (Recommended):**

```cmd
# Create virtual environment in a dedicated location
python -m venv C:\JamesPlatform\venv

# Activate virtual environment
C:\JamesPlatform\venv\Scripts\activate

# Navigate to controller directory
cd C:\JamesPlatform\controller
```

### 2. **Install Dependencies**

```cmd
# Ensure virtual environment is activated
venv\Scripts\activate

# Install all required packages
pip install -r requirements.txt

# Verify installation
python -c "import requests, psutil, schedule, dotenv; print('All dependencies installed successfully')"
```

### 3. **Configure Environment**

```cmd
# Run startup script to create default .env file and folder structure
python start.py

# Or run the Windows setup batch file manually
setup_folders.bat

# Edit .env file with your settings
notepad .env
```

### 4. **Install MetaTrader**

- Install MetaTrader 4 and MetaTrader 5 to your preferred locations
- Common installation paths:
  - `C:\MetaTrader4\terminal.exe`
  - `C:\Program Files\MetaTrader 4\terminal.exe`
  - `C:\MetaTrader5\terminal64.exe`
  - `C:\Program Files\MetaTrader 5\terminal64.exe`
- Update the paths in your `.env` file to match your installation
- Ensure both are working and can connect to your brokers

### 5. **Automatic Folder Setup**

The controller automatically creates all necessary folders and directory structures:

```cmd
# Option 1: Use Python startup script (recommended - silent)
python start.py

# Option 2: Use Windows batch file directly (interactive)
setup_folders.bat

# Option 3: Test setup without making changes
python test_setup.py

# Option 4: Manual setup (not recommended)
mkdir C:\JamesPlatform\logs C:\JamesPlatform\ea_files C:\JamesPlatform\configs C:\JamesPlatform\batch_files
mkdir C:\JamesPlatform\MT4Instances C:\JamesPlatform\MT5Instances
```

**What gets created automatically:**
- ✅ JamesPlatform base directory (`C:\JamesPlatform`)
- ✅ Controller directories (`C:\JamesPlatform\logs`, `ea_files`, `configs`, `batch_files`)
- ✅ MT4/MT5 instances directories (`C:\JamesPlatform\MT4Instances`, `MT5Instances`)
- ✅ Individual account folders when accounts are added
- ✅ Windows startup batch file integration
- ✅ Example account structure for testing
- ✅ MetaTrader path detection and validation
- ✅ Silent and interactive setup options

## Configuration

### Environment Variables

Create a `.env` file in the controller directory with the following settings:

```env
# JamesPlatform Base Directory
JAMESPLATFORM_BASE=C:/JamesPlatform

# Laravel API Configuration
LARAVEL_API_BASE_URL=http://localhost:8000/api
LARAVEL_API_TOKEN=your_api_token_here

# MetaTrader Configuration (configurable paths)
# Update these paths to match your MetaTrader installation locations
MT4_BASE_PATH=C:/MetaTrader4
MT5_BASE_PATH=C:/MetaTrader5
MT4_INSTANCES_PATH=C:/JamesPlatform/MT4Instances
MT5_INSTANCES_PATH=C:/JamesPlatform/MT5Instances

# Terminal Management
MAX_TERMINALS_PER_SERVER=10
TERMINAL_LAUNCH_DELAY=2
HEARTBEAT_INTERVAL=30
CONNECTION_TIMEOUT=60

# Staggered Launch Configuration
STAGGERED_LAUNCH_COUNT=5
STAGGERED_LAUNCH_DELAY=10

# File Management - JamesPlatform Structure
EA_FILES_PATH=C:/JamesPlatform/ea_files
CONFIG_FILES_PATH=C:/JamesPlatform/configs
LOGS_PATH=C:/JamesPlatform/logs
BATCH_FILES_PATH=C:/JamesPlatform/batch_files

# Database Configuration
SQLITE_DB_PATH=C:/JamesPlatform/controller.db

# Logging
LOG_LEVEL=INFO
LOG_FILE=C:/JamesPlatform/logs/controller.log

# Auto-scaling Configuration
AUTO_SCALE_ENABLED=true
SCALE_UP_THRESHOLD=80
SCALE_DOWN_THRESHOLD=20

# Monitoring
MONITORING_ENABLED=true
PERFORMANCE_CHECK_INTERVAL=60

# Startup Configuration
STARTUP_FOLDER_PATH=%APPDATA%/Microsoft/Windows/Start Menu/Programs/Startup
```

### Directory Structure

The controller automatically creates the following directory structure:

```
C:\JamesPlatform\                    # Main JamesPlatform directory
├── logs\                            # Controller log files
├── ea_files\                        # Expert Advisor files
├── configs\                         # Configuration files
├── batch_files\                     # Batch files for launching terminals
├── controller.db                    # SQLite database
├── .env                             # Environment configuration
├── MT4Instances\                    # MT4 account instances (auto-created)
│   ├── 12345\                      # Account login folders (auto-created)
│   │   ├── login.ini               # Account configuration
│   │   ├── profiles\               # Terminal profiles
│   │   ├── MQL4\Experts\           # EA files
│   │   ├── MQL4\Files\             # EA data files
│   │   └── logs\                   # Terminal logs
│   └── 67890\
│       └── ...
└── MT5Instances\                    # MT5 account instances (auto-created)
    └── ...

# Controller files (in controller directory)
controller/
├── start.py                         # Setup script (silent)
├── test_setup.py                    # Setup verification script
├── fix_dependencies.py              # Dependency fix script
├── setup_folders.bat                # Interactive setup (Windows)
├── setup_folders_silent.bat         # Silent setup (Windows)
├── env_template.txt                 # Environment template
└── main.py                          # Main controller

# MetaTrader installations (configurable paths)
C:\MetaTrader4\terminal.exe          # MT4 executable (configurable)
C:\MetaTrader5\terminal64.exe        # MT5 executable (configurable)
```

**Automatic Folder Creation:**
- ✅ JamesPlatform base directory created automatically
- ✅ Controller directories created by `python start.py`
- ✅ MT4/MT5 instances directories created automatically
- ✅ Individual account folders created when accounts are added
- ✅ Windows batch files include folder creation logic
- ✅ Standalone `setup_folders.bat` for manual setup
- ✅ MetaTrader path detection and validation

## Usage

### Quick Start

1. **Activate virtual environment**:
   ```cmd
   venv\Scripts\activate
   ```

2. **Run the startup script** (creates directories and config):
   ```cmd
   python start.py
   ```

3. **Test the setup** (optional but recommended):
   ```cmd
   python test_setup.py
   ```

4. **Start the main controller**:
   ```cmd
   python main.py
   ```

**Alternative Setup Options:**
- **Silent setup**: `python start.py` (automated, no user interaction)
- **Interactive setup**: `setup_folders.bat` (manual, with detailed feedback)
- **Test only**: `python test_setup.py` (verify setup without changes)

### Production Deployment

1. **Create Windows Service (Recommended)**:
   ```cmd
   # Install as Windows service using NSSM
   nssm install JamesPlatformController "C:\JamesPlatform\venv\Scripts\python.exe" "C:\JamesPlatform\controller\main.py"
   nssm set JamesPlatformController AppDirectory "C:\JamesPlatform\controller"
   nssm start JamesPlatformController
   ```

2. **Manual Startup**:
   ```cmd
   # Activate environment and start
   C:\JamesPlatform\venv\Scripts\activate
   cd C:\JamesPlatform\controller
   python main.py
   ```

3. **Auto-Start on Boot**:
   - The controller automatically creates `start_all_mt4.bat` in Windows startup folder
   - This ensures all terminals restart after server reboot

### Manual Setup

1. **Check Python version**:
   ```cmd
   python --version
   ```

2. **Setup virtual environment**:
   ```cmd
   python -m venv venv
   venv\Scripts\activate
   ```

3. **Install dependencies**:
   ```cmd
   pip install -r requirements.txt
   ```

4. **Create configuration**:
   ```cmd
   python start.py
   notepad .env
   ```

5. **Start the controller**:
   ```cmd
   python main.py
   ```

## API Integration

The controller communicates with the Laravel backend through the following endpoints:

### Account Management
- `GET /api/new-accounts` - Get all accounts
- `GET /api/new-accounts/{id}` - Get specific account
- `POST /api/new-accounts` - Create new account
- `POST /api/new-accounts/update` - Update account
- `POST /api/new-accounts/delete` - Delete account
- `POST /api/new-accounts/pause` - Pause account
- `POST /api/new-accounts/resume` - Resume account

### Trading Settings
- `GET /api/new-accounts/trading-settings` - Get trading settings
- `POST /api/new-accounts/trading-settings` - Update trading settings

### Controller Communication
- `POST /api/controller/heartbeat` - Send heartbeat data
- `POST /api/controller/terminal-status` - Report terminal status
- `GET /api/controller/server-usage` - Get server usage statistics

## Terminal Management

### Terminal Lifecycle

1. **Account Creation**: When a new account is created in Laravel, the controller syncs and launches a terminal
2. **Terminal Launch**: Creates portable MT4/MT5 installation with account configuration
3. **Monitoring**: Continuously monitors terminal health and performance
4. **Configuration Updates**: Applies EA settings, risk parameters, and trading configurations
5. **Account Status Changes**: Responds to pause/resume/delete commands from Laravel
6. **Terminal Cleanup**: Stops and removes terminals when accounts are deleted

### Terminal Configuration

Each terminal is configured with:
- Account credentials (login, password, server)
- EA files and settings
- Risk management parameters
- Trading configuration
- Performance monitoring

## Monitoring & Logging

### Log Files

- **Controller Log**: `logs/controller.log` - Main controller activity
- **Terminal Logs**: Individual terminal logs in their respective directories
- **Error Logs**: Error tracking and debugging information

### Performance Monitoring

The controller monitors:
- CPU and memory usage per terminal
- Overall system resource utilization
- Terminal connection status
- EA performance metrics
- Error rates and recovery

### Health Checks

- Terminal process monitoring
- Connection status verification
- Resource usage tracking
- Automatic restart on failures

## Testing & Verification

### Setup Testing

Use the test script to verify your setup is working correctly:

```cmd
python test_setup.py
```

This will check:
- ✅ Directory structure creation
- ✅ Required files presence
- ✅ MetaTrader path detection
- ✅ Configuration file setup

### Manual Verification

You can also manually verify the setup:

```cmd
# Check directories
dir C:\JamesPlatform

# Check .env file
type .env

# Test MetaTrader paths
dir "C:\MetaTrader4\terminal.exe"
dir "C:\MetaTrader5\terminal64.exe"
```

## Troubleshooting

### Common Issues

1. **Setup Script Hanging**
   ```cmd
   # If start.py hangs, try:
   python test_setup.py  # Check what's missing
   setup_folders.bat     # Manual interactive setup
   
   # Or skip batch files entirely:
   # Edit start.py and comment out the batch file section
   ```

2. **Dependency Import Errors**
   ```cmd
   # If you get asyncio-mqtt, paho-mqtt, or pydantic-settings errors:
   python fix_dependencies.py  # Automatic fix
   
   # Or manual fix:
   pip uninstall asyncio-mqtt paho-mqtt -y
   pip install pydantic-settings==2.0.3
   pip install -r requirements.txt
   ```

2. **Virtual Environment Issues**
   ```cmd
   # If virtual environment is not activated
   venv\Scripts\activate
   
   # If activation fails, recreate environment
   rmdir /s venv
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **MetaTrader Not Found**
   - Verify MT4/MT5 installation paths in `.env`
   - Ensure MetaTrader is properly installed
   - Check if paths use correct Windows format: `C:\MetaTrader4`

3. **API Connection Issues**
   - Check Laravel API URL and token
   - Verify network connectivity
   - Check API endpoint availability
   - Test with: `curl http://your-api-url/api/new-accounts`

4. **Terminal Launch Failures**
   - Check MetaTrader executable paths
   - Verify account credentials
   - Check server connectivity
   - Run as Administrator if needed

5. **Permission Issues**
   - Run Command Prompt as Administrator
   - Check file/directory permissions
   - Verify antivirus exclusions for `C:\MT4Instances\`
   - Ensure Windows Defender allows batch file execution

6. **Batch File Issues**
   ```cmd
   # Check if batch files are created
   dir batch_files\*.bat
   
   # Test batch file manually
   batch_files\launch_12345.bat
   
   # Check Windows startup folder
   dir "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\"
   ```

7. **Service Installation Issues**
   ```cmd
   # If NSSM is not installed
   # Download from: https://nssm.cc/download
   
   # Check service status
   sc query JamesPlatformController
   
   # Restart service
   net stop JamesPlatformController
   net start JamesPlatformController
   ```

### Debug Mode

Enable debug logging by setting:
```env
LOG_LEVEL=DEBUG
```

### Manual Terminal Management

For debugging, you can manually manage terminals:
```cmd
# Activate virtual environment
venv\Scripts\activate

# Start Python interactive shell
python

# In Python shell:
>>> from terminal_manager import TerminalManager
>>> from database import DatabaseManager
>>> from models import TerminalConfig
>>> 
>>> db = DatabaseManager("controller.db")
>>> tm = TerminalManager(db)
>>> 
>>> # Launch terminal manually
>>> config = TerminalConfig(...)
>>> terminal_id = tm.launch_terminal(config)
>>> 
>>> # Stop terminal
>>> tm.stop_terminal(terminal_id)
```

### Windows-Specific Commands

```cmd
# Check running MT4 processes
tasklist /FI "IMAGENAME eq terminal.exe"

# Check specific account process
tasklist /FI "IMAGENAME eq terminal.exe" /FI "WINDOWTITLE eq *12345*"

# Kill all MT4 processes (emergency)
taskkill /F /IM terminal.exe

# Check Windows startup folder
dir "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\"

# Check controller logs
type logs\controller.log
```

## Development

### Adding New Features

1. **Extend Models**: Add new fields to data models in `models.py`
2. **Update Database**: Add new tables/columns in `database.py`
3. **Enhance API Client**: Add new API methods in `api_client.py`
4. **Modify Terminal Manager**: Update terminal management logic
5. **Update Configuration**: Add new config options in `config.py`

### Testing

1. **Unit Tests**: Test individual components
2. **Integration Tests**: Test API communication
3. **End-to-End Tests**: Test complete workflows

### Deployment

1. **Production Setup**: Configure for production environment
2. **Windows Service Installation**: Install as Windows service using NSSM
3. **Monitoring**: Set up external monitoring
4. **Backup**: Configure database and log backups
5. **Auto-Start**: Ensure startup batch file is in Windows startup folder

## Security Considerations

- Store API tokens securely in `.env` file
- Use HTTPS for API communication
- Implement proper authentication
- Monitor for suspicious activity
- Regular security updates
- Run as Windows service with limited privileges
- Restrict access to `C:\MT4Instances\` directory
- Use Windows Firewall to restrict network access
- Enable Windows Defender exclusions for MetaTrader processes

## Windows Server Deployment Guide

### Production Server Setup

1. **Server Requirements**:
   - Windows Server 2019/2022 or Windows 10/11 Pro
   - Minimum 16GB RAM (32GB recommended for 100+ terminals)
   - SSD storage for fast terminal launches
   - Stable internet connection

2. **Installation Steps**:
   ```cmd
   # Create dedicated directory
   mkdir C:\JamesPlatform
   cd C:\JamesPlatform
   
   # Download controller files
   # Extract to C:\JamesPlatform\controller\
   
   # Create virtual environment
   python -m venv venv
   venv\Scripts\activate
   
   # Install dependencies
   pip install -r requirements.txt
   
   # Configure environment
   python start.py
   notepad .env
   ```

3. **Windows Service Installation**:
   ```cmd
   # Download NSSM from https://nssm.cc/download
   # Extract nssm.exe to C:\Windows\System32\
   
   # Install as service
   nssm install JamesPlatformController "C:\JamesPlatform\venv\Scripts\python.exe" "C:\JamesPlatform\controller\main.py"
   nssm set JamesPlatformController AppDirectory "C:\JamesPlatform\controller"
   nssm set JamesPlatformController Description "JamesPlatform MT4/MT5 Controller"
   nssm set JamesPlatformController Start SERVICE_AUTO_START
   
   # Start service
   net start JamesPlatformController
   ```

4. **Firewall Configuration**:
   ```cmd
   # Allow controller to communicate with Laravel API
   netsh advfirewall firewall add rule name="JamesPlatform Controller" dir=out action=allow protocol=TCP remoteport=80,443
   
   # Allow MetaTrader connections
   netsh advfirewall firewall add rule name="MetaTrader Outbound" dir=out action=allow program="C:\MetaTrader4\terminal.exe"
   ```

5. **Windows Defender Exclusions**:
   - Add `C:\MT4Instances\` to Windows Defender exclusions
   - Add `C:\MT5Instances\` to Windows Defender exclusions
   - Add `C:\JamesPlatform\` to Windows Defender exclusions

### Performance Optimization

1. **System Settings**:
   ```cmd
   # Disable Windows visual effects
   # System Properties > Advanced > Performance Settings > Adjust for best performance
   
   # Set power plan to High Performance
   powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c
   ```

2. **MetaTrader Optimization**:
   - Disable AutoUpdate in MetaTrader
   - Disable News feed
   - Disable Sound alerts
   - Set charts to minimal mode

3. **Monitoring**:
   ```cmd
   # Check system resources
   taskmgr
   
   # Monitor specific processes
   tasklist /FI "IMAGENAME eq terminal.exe" /FO TABLE
   
   # Check controller logs
   type C:\JamesPlatform\controller\logs\controller.log
   ```

## Support

For issues and questions:
1. Check the logs for error messages: `type logs\controller.log`
2. Review the troubleshooting section
3. Verify configuration settings in `.env`
4. Check Windows Event Viewer for system errors
5. Contact the development team

### Emergency Procedures

```cmd
# Stop all MT4 processes (emergency)
taskkill /F /IM terminal.exe

# Stop controller service
net stop JamesPlatformController

# Restart controller service
net start JamesPlatformController

# Check service status
sc query JamesPlatformController
```

## License

This project is proprietary software for JamesPlatform. 