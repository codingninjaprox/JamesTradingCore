import requests
import json
import time
from datetime import datetime
from typing import List, Optional, Dict, Any
from loguru import logger

from config.config import config
from models.models import Account, Terminal, HeartbeatData, TerminalStatus, PlatformType

class LaravelAPIClient:
    """Client for communicating with Laravel API"""
    
    def __init__(self):
        self.base_url = config.LARAVEL_API_BASE_URL
        self.token = config.LARAVEL_API_TOKEN
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
        self.auth_token = None
        self._authenticate()
    
    def _authenticate(self):
        """Authenticate with Laravel API to get token"""
        try:
            login_data = {
                'email': config.LARAVEL_EMAIL,
                'password': config.LARAVEL_PASSWORD
            }
            
            response = self.session.post(f"{self.base_url}/auth/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                if data.get('success') and data.get('data', {}).get('token'):
                    self.auth_token = data['data']['token']
                    self.session.headers.update({
                        'Authorization': f'Bearer {self.auth_token}'
                    })
                    logger.info("Successfully authenticated with Laravel API")
                else:
                    logger.error(f"Authentication failed: {data}")
            else:
                logger.error(f"Authentication request failed: {response.status_code} - {response.text}")
                
        except Exception as e:
            logger.error(f"Error during authentication: {e}")
    
    def _refresh_auth_if_needed(self):
        """Refresh authentication if token is missing"""
        if not self.auth_token:
            logger.warning("No auth token, attempting to re-authenticate")
            self._authenticate()
    
    def _make_request(self, method: str, endpoint: str, data: Optional[Dict] = None) -> Optional[Dict]:
        """Make HTTP request to Laravel API"""
        try:
            # Ensure we have authentication
            self._refresh_auth_if_needed()
            
            url = f"{self.base_url}/{endpoint.lstrip('/')}"
            
            if method.upper() == 'GET':
                response = self.session.get(url, params=data)
            elif method.upper() == 'POST':
                response = self.session.post(url, json=data)
            elif method.upper() == 'PUT':
                response = self.session.put(url, json=data)
            elif method.upper() == 'DELETE':
                response = self.session.delete(url, json=data)
            else:
                logger.error(f"Unsupported HTTP method: {method}")
                return None
            
            if response.status_code == 200:
                return response.json()
            elif response.status_code == 401:
                logger.error("Authentication failed - attempting to re-authenticate")
                self._authenticate()
                # Retry the request once after re-authentication
                if self.auth_token:
                    if method.upper() == 'GET':
                        response = self.session.get(url, params=data)
                    elif method.upper() == 'POST':
                        response = self.session.post(url, json=data)
                    elif method.upper() == 'PUT':
                        response = self.session.put(url, json=data)
                    elif method.upper() == 'DELETE':
                        response = self.session.delete(url, json=data)
                    
                    if response.status_code == 200:
                        return response.json()
                
                logger.error("Authentication retry failed")
                return None
            else:
                logger.error(f"API request failed: {response.status_code} - {response.text}")
                return None
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Request error: {e}")
            return None
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error: {e}")
            return None
    
    def get_accounts(self, user_id: Optional[int] = None) -> List[Account]:
        """Get accounts from Laravel API"""
        try:
            # The Laravel API requires a user_id for the new-accounts endpoint
            if not user_id:
                logger.warning("No user_id provided, cannot fetch accounts")
                return []
            
            endpoint = f"new-accounts/get/{user_id}"
            response = self._make_request('GET', endpoint)
            
            if response and response.get('success'):
                accounts_data = response.get('data', [])
                accounts = []
                
                for account_data in accounts_data:
                    try:
                        account = Account(
                            account_id=account_data.get('account_id'),
                            login=account_data.get('login'),
                            password=account_data.get('password', ''),
                            server=account_data.get('server'),
                            groupid=account_data.get('groupid'),
                            platform_type=PlatformType(account_data.get('platform_type', 'mt4')),
                            status=account_data.get('status', '1'),
                            name=account_data.get('name'),
                            email=account_data.get('email', ''),
                            user_id=account_data.get('user_id'),
                            balance=account_data.get('balance'),
                            state=account_data.get('state')
                        )
                        accounts.append(account)
                    except Exception as e:
                        logger.error(f"Error parsing account data: {e}")
                
                return accounts
            else:
                logger.error(f"Failed to get accounts: {response}")
                return []
                
        except Exception as e:
            logger.error(f"Error getting accounts: {e}")
            return []
    
    def get_all_accounts(self) -> List[Account]:
        """Get all accounts from Laravel API (for controller use)"""
        try:
            # Use the new controller-specific endpoint
            response = self._make_request('GET', 'controller/all-accounts')
            
            if response and response.get('success'):
                accounts_data = response.get('data', [])
                accounts = []
                
                for account_data in accounts_data:
                    try:
                        account = Account(
                            account_id=account_data.get('account_id'),
                            login=account_data.get('login'),
                            password=account_data.get('password', ''),
                            server=account_data.get('server'),
                            groupid=account_data.get('groupid'),
                            platform_type=PlatformType(account_data.get('platform_type', 'mt4')),
                            status=account_data.get('status', '1'),
                            name=account_data.get('name'),
                            email=account_data.get('user_email', ''),
                            user_id=account_data.get('user_id'),
                            balance=account_data.get('balance'),
                            state=account_data.get('state')
                        )
                        accounts.append(account)
                    except Exception as e:
                        logger.error(f"Error parsing account data: {e}")
                
                logger.info(f"Retrieved {len(accounts)} accounts from controller API")
                return accounts
            else:
                logger.error(f"Failed to get all accounts: {response}")
                return []
                
        except Exception as e:
            logger.error(f"Error getting all accounts: {e}")
            return []
    
    def get_account(self, account_id: str) -> Optional[Account]:
        """Get single account from Laravel API"""
        try:
            response = self._make_request('GET', f"new-accounts/{account_id}")
            
            if response and response.get('success'):
                account_data = response.get('data')
                if account_data:
                    return Account(
                        account_id=account_data.get('account_id'),
                        login=account_data.get('login'),
                        password=account_data.get('password', ''),
                        server=account_data.get('server'),
                        groupid=account_data.get('groupid'),
                        platform_type=PlatformType(account_data.get('platform_type', 'mt4')),
                        status=account_data.get('status', '1'),
                        name=account_data.get('name'),
                        email=account_data.get('email', ''),
                        user_id=account_data.get('user_id'),
                        balance=account_data.get('balance'),
                        state=account_data.get('state')
                    )
            else:
                logger.error(f"Failed to get account {account_id}: {response}")
                return None
                
        except Exception as e:
            logger.error(f"Error getting account {account_id}: {e}")
            return None
    
    def create_account(self, account_data: Dict[str, Any]) -> Optional[Account]:
        """Create new account via Laravel API"""
        try:
            response = self._make_request('POST', 'new-accounts', account_data)
            
            if response and response.get('success'):
                response_data: Optional[Dict[str, Any]] = response.get('data')
                if response_data and isinstance(response_data, dict):
                    required_fields = ['account_id', 'login', 'server', 'groupid', 'name', 'user_id']
                    if all(response_data.get(field) is not None for field in required_fields):
                        return Account(
                            account_id=str(response_data['account_id']),
                            login=str(response_data['login']),
                            password=str(response_data.get('password', '')),
                            server=str(response_data['server']),
                            groupid=str(response_data['groupid']),
                            platform_type=PlatformType(response_data.get('platform_type', 'mt4')),
                            status=response_data.get('status', '1'),
                            name=str(response_data['name']),
                            email=str(response_data.get('email', '')),
                            user_id=int(response_data['user_id']),
                            balance=response_data.get('balance'),
                            state=response_data.get('state')
                        )
                    else:
                        logger.warning(f"Account data missing required fields: {response_data}")
                        return None
            else:
                logger.error(f"Failed to create account: {response}")
                return None
                
        except Exception as e:
            logger.error(f"Error creating account: {e}")
            return None
    
    def update_account(self, account_id: str, update_data: Dict[str, Any]) -> Optional[Account]:
        """Update account via Laravel API"""
        try:
            update_data['account_id'] = account_id
            response = self._make_request('POST', 'new-accounts/update', update_data)
            
            if response and response.get('success'):
                account_data = response.get('data')
                if account_data:
                    return Account(
                        account_id=account_data.get('account_id'),
                        login=account_data.get('login'),
                        password=account_data.get('password', ''),
                        server=account_data.get('server'),
                        groupid=account_data.get('groupid'),
                        platform_type=PlatformType(account_data.get('platform_type', 'mt4')),
                        status=account_data.get('status', '1'),
                        name=account_data.get('name'),
                        email=account_data.get('email', ''),
                        user_id=account_data.get('user_id'),
                        balance=account_data.get('balance'),
                        state=account_data.get('state')
                    )
            else:
                logger.error(f"Failed to update account {account_id}: {response}")
                return None
                
        except Exception as e:
            logger.error(f"Error updating account {account_id}: {e}")
            return None
    
    def delete_account(self, account_id: str, user_id: int, email: str) -> bool:
        """Delete account via Laravel API"""
        try:
            delete_data = {
                'account_id': account_id,
                'user_id': user_id,
                'email': email
            }
            response = self._make_request('POST', 'new-accounts/delete', delete_data)
            
            if response and response.get('success'):
                logger.info(f"Account {account_id} deleted successfully")
                return True
            else:
                logger.error(f"Failed to delete account {account_id}: {response}")
                return False
                
        except Exception as e:
            logger.error(f"Error deleting account {account_id}: {e}")
            return False
    
    def pause_account(self, account_id: str, user_id: int, email: str) -> bool:
        """Pause account via Laravel API"""
        try:
            pause_data = {
                'account_id': account_id,
                'user_id': user_id,
                'email': email
            }
            response = self._make_request('POST', 'new-accounts/pause', pause_data)
            
            if response and response.get('success'):
                logger.info(f"Account {account_id} paused successfully")
                return True
            else:
                logger.error(f"Failed to pause account {account_id}: {response}")
                return False
                
        except Exception as e:
            logger.error(f"Error pausing account {account_id}: {e}")
            return False
    
    def resume_account(self, account_id: str, user_id: int, email: str) -> bool:
        """Resume account via Laravel API"""
        try:
            resume_data = {
                'account_id': account_id,
                'user_id': user_id,
                'email': email
            }
            response = self._make_request('POST', 'new-accounts/resume', resume_data)
            
            if response and response.get('success'):
                logger.info(f"Account {account_id} resumed successfully")
                return True
            else:
                logger.error(f"Failed to resume account {account_id}: {response}")
                return False
                
        except Exception as e:
            logger.error(f"Error resuming account {account_id}: {e}")
            return False
    
    def send_heartbeat(self, heartbeat_data: HeartbeatData) -> bool:
        """Send heartbeat data to Laravel API"""
        try:
            data = {
                'terminal_id': heartbeat_data.terminal_id,
                'account_id': heartbeat_data.account_id,
                'platform_type': heartbeat_data.platform_type.value,
                'status': heartbeat_data.status.value,
                'timestamp': heartbeat_data.timestamp.isoformat(),
                'performance_data': heartbeat_data.performance_data,
                'error_data': heartbeat_data.error_data
            }
            
            response = self._make_request('POST', 'controller/heartbeat', data)
            
            if response and response.get('success'):
                return True
            else:
                logger.error(f"Failed to send heartbeat: {response}")
                return False
                
        except Exception as e:
            logger.error(f"Error sending heartbeat: {e}")
            return False
    
    def get_trading_settings(self, account_id: str, user_id: int) -> Optional[Dict[str, Any]]:
        """Get trading settings for account"""
        try:
            params = {
                'account_id': account_id,
                'user_id': user_id
            }
            response = self._make_request('GET', 'new-accounts/trading-settings', params)
            
            if response and response.get('success'):
                return response.get('data')
            else:
                logger.error(f"Failed to get trading settings: {response}")
                return None
                
        except Exception as e:
            logger.error(f"Error getting trading settings: {e}")
            return None
    
    def update_trading_settings(self, account_id: str, user_id: int, settings: Dict[str, Any]) -> bool:
        """Update trading settings for account"""
        try:
            data = {
                'account_id': account_id,
                'user_id': user_id,
                **settings
            }
            response = self._make_request('POST', 'new-accounts/trading-settings', data)
            
            if response and response.get('success'):
                logger.info(f"Trading settings updated for account {account_id}")
                return True
            else:
                logger.error(f"Failed to update trading settings: {response}")
                return False
                
        except Exception as e:
            logger.error(f"Error updating trading settings: {e}")
            return False
    
    def get_server_usage(self) -> Optional[Dict[str, Any]]:
        """Get server usage statistics"""
        try:
            # Use the new controller-specific endpoint
            response = self._make_request('GET', 'controller/server-usage')
            
            if response and response.get('success'):
                return response.get('data')
            else:
                logger.error(f"Failed to get server usage: {response}")
                return None
                
        except Exception as e:
            logger.error(f"Error getting server usage: {e}")
            return None
    
    def report_terminal_status(self, terminal_id: str, status: TerminalStatus, error_message: Optional[str] = None) -> bool:
        """Report terminal status to Laravel API"""
        try:
            data = {
                'terminal_id': terminal_id,
                'status': status.value,
                'timestamp': datetime.now().isoformat(),
                'error_message': error_message
            }
            
            response = self._make_request('POST', 'controller/terminal-status', data)
            
            if response and response.get('success'):
                return True
            else:
                logger.error(f"Failed to report terminal status: {response}")
                return False
                
        except Exception as e:
            logger.error(f"Error reporting terminal status: {e}")
            return False 