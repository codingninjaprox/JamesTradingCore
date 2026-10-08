#!/usr/bin/env python3
"""
Fix dependency issues for JamesPlatform Controller
"""

import subprocess
import sys
from pathlib import Path

def run_command(command, description):
    """Run a command and handle errors"""
    print(f"Running: {description}")
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ {description} completed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} failed: {e}")
        print(f"Error output: {e.stderr}")
        return False

def main():
    """Main fix function"""
    print("JamesPlatform Controller - Dependency Fix")
    print("=" * 50)
    
    # Check if we're in a virtual environment
    if not hasattr(sys, 'real_prefix') and not (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix):
        print("❌ Please activate your virtual environment first:")
        print("   venv\\Scripts\\activate")
        return False
    
    print("✅ Virtual environment detected")
    
    # Remove problematic packages
    print("\nRemoving problematic packages...")
    run_command("pip uninstall asyncio-mqtt paho-mqtt -y", "Remove asyncio-mqtt and paho-mqtt")
    
    # Ensure pydantic-settings is installed
    print("\nEnsuring pydantic-settings is installed...")
    run_command("pip install pydantic-settings==2.0.3", "Install pydantic-settings")
    
    # Install correct dependencies
    print("\nInstalling correct dependencies...")
    if not run_command("pip install -r requirements.txt", "Install requirements"):
        return False
    
    # Test imports
    print("\nTesting imports...")
    try:
        import requests
        import psutil
        import schedule
        import dotenv
        import websockets
        import pydantic
        import pydantic_settings
        import loguru
        import watchdog
        print("✅ All dependencies imported successfully")
    except ImportError as e:
        print(f"❌ Import error: {e}")
        return False
    
    print("\n" + "=" * 50)
    print("✅ Dependency fix completed successfully!")
    print("You can now run: python start.py")
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 