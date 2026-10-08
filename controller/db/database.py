import sqlite3
import json
from datetime import datetime
from typing import List, Optional, Dict, Any
from pathlib import Path
import threading
from loguru import logger

from models.models import Terminal, Account, TerminalConfig, TerminalStatus, PlatformType

class DatabaseManager:
    """SQLite database manager for controller state"""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.lock = threading.Lock()
        self._init_database()
    
    def _init_database(self):
        """Initialize database tables"""
        with self.lock:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Create terminals table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS terminals (
                    terminal_id TEXT PRIMARY KEY,
                    account_id TEXT NOT NULL,
                    platform_type TEXT NOT NULL,
                    process_id INTEGER,
                    status TEXT NOT NULL,
                    start_time TEXT,
                    last_heartbeat TEXT,
                    connection_attempts INTEGER DEFAULT 0,
                    max_connection_attempts INTEGER DEFAULT 3,
                    config_data TEXT,
                    error_message TEXT,
                    server_path TEXT NOT NULL,
                    data_path TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Create accounts table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS accounts (
                    account_id TEXT PRIMARY KEY,
                    login TEXT NOT NULL,
                    password TEXT NOT NULL,
                    server TEXT NOT NULL,
                    groupid TEXT NOT NULL,
                    platform_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    user_id INTEGER NOT NULL,
                    balance REAL,
                    state TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Create configurations table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS configurations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    account_id TEXT NOT NULL,
                    platform_type TEXT NOT NULL,
                    server TEXT NOT NULL,
                    login TEXT NOT NULL,
                    password TEXT NOT NULL,
                    groupid TEXT NOT NULL,
                    ea_settings TEXT,
                    risk_settings TEXT,
                    trading_settings TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (account_id) REFERENCES accounts (account_id)
                )
            ''')
            
            # Create server_usage table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS server_usage (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    server_name TEXT NOT NULL,
                    platform_type TEXT NOT NULL,
                    active_terminals INTEGER DEFAULT 0,
                    total_terminals INTEGER DEFAULT 0,
                    cpu_usage REAL DEFAULT 0,
                    memory_usage REAL DEFAULT 0,
                    disk_usage REAL DEFAULT 0,
                    last_updated TEXT DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            conn.commit()
            conn.close()
            logger.info(f"Database initialized at {self.db_path}")
    
    def add_terminal(self, terminal: Terminal) -> bool:
        """Add a new terminal to the database"""
        try:
            with self.lock:
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                
                cursor.execute('''
                    INSERT OR REPLACE INTO terminals 
                    (terminal_id, account_id, platform_type, process_id, status, 
                     start_time, last_heartbeat, connection_attempts, max_connection_attempts,
                     config_data, error_message, server_path, data_path)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    terminal.terminal_id,
                    terminal.account_id,
                    terminal.platform_type.value,
                    terminal.process_id,
                    terminal.status.value,
                    terminal.start_time.isoformat() if terminal.start_time else None,
                    terminal.last_heartbeat.isoformat() if terminal.last_heartbeat else None,
                    terminal.connection_attempts,
                    terminal.max_connection_attempts,
                    json.dumps(terminal.config_data),
                    terminal.error_message,
                    terminal.server_path,
                    terminal.data_path
                ))
                
                conn.commit()
                conn.close()
                logger.info(f"Terminal {terminal.terminal_id} added to database")
                return True
        except Exception as e:
            logger.error(f"Error adding terminal to database: {e}")
            return False
    
    def update_terminal(self, terminal_id: str, updates: Dict[str, Any]) -> bool:
        """Update terminal information"""
        try:
            with self.lock:
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                
                # Build update query dynamically
                set_clauses = []
                values = []
                
                for key, value in updates.items():
                    if key in ['config_data']:
                        set_clauses.append(f"{key} = ?")
                        values.append(json.dumps(value))
                    elif key in ['start_time', 'last_heartbeat'] and value:
                        set_clauses.append(f"{key} = ?")
                        values.append(value.isoformat())
                    else:
                        set_clauses.append(f"{key} = ?")
                        values.append(value)
                
                set_clauses.append("updated_at = CURRENT_TIMESTAMP")
                values.append(terminal_id)
                
                query = f"UPDATE terminals SET {', '.join(set_clauses)} WHERE terminal_id = ?"
                cursor.execute(query, values)
                
                conn.commit()
                conn.close()
                logger.info(f"Terminal {terminal_id} updated in database")
                return True
        except Exception as e:
            logger.error(f"Error updating terminal in database: {e}")
            return False
    
    def get_terminal(self, terminal_id: str) -> Optional[Terminal]:
        """Get terminal by ID"""
        try:
            with self.lock:
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                
                cursor.execute('SELECT * FROM terminals WHERE terminal_id = ?', (terminal_id,))
                row = cursor.fetchone()
                conn.close()
                
                if row:
                    return self._row_to_terminal(row)
                return None
        except Exception as e:
            logger.error(f"Error getting terminal from database: {e}")
            return None
    
    def get_terminals_by_account(self, account_id: str) -> List[Terminal]:
        """Get all terminals for an account"""
        try:
            with self.lock:
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                
                cursor.execute('SELECT * FROM terminals WHERE account_id = ?', (account_id,))
                rows = cursor.fetchall()
                conn.close()
                
                return [self._row_to_terminal(row) for row in rows]
        except Exception as e:
            logger.error(f"Error getting terminals for account: {e}")
            return []
    
    def get_all_terminals(self) -> List[Terminal]:
        """Get all terminals"""
        try:
            with self.lock:
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                
                cursor.execute('SELECT * FROM terminals')
                rows = cursor.fetchall()
                conn.close()
                
                return [self._row_to_terminal(row) for row in rows]
        except Exception as e:
            logger.error(f"Error getting all terminals: {e}")
            return []
    
    def delete_terminal(self, terminal_id: str) -> bool:
        """Delete terminal from database"""
        try:
            with self.lock:
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                
                cursor.execute('DELETE FROM terminals WHERE terminal_id = ?', (terminal_id,))
                conn.commit()
                conn.close()
                
                logger.info(f"Terminal {terminal_id} deleted from database")
                return True
        except Exception as e:
            logger.error(f"Error deleting terminal from database: {e}")
            return False
    
    def add_account(self, account: Account) -> bool:
        """Add a new account to the database"""
        try:
            with self.lock:
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                
                cursor.execute('''
                    INSERT OR REPLACE INTO accounts 
                    (account_id, login, password, server, groupid, platform_type, 
                     status, name, email, user_id, balance, state)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    account.account_id,
                    account.login,
                    account.password,
                    account.server,
                    account.groupid,
                    account.platform_type.value,
                    account.status.value,
                    account.name,
                    account.email,
                    account.user_id,
                    account.balance,
                    account.state
                ))
                
                conn.commit()
                conn.close()
                logger.info(f"Account {account.account_id} added to database")
                return True
        except Exception as e:
            logger.error(f"Error adding account to database: {e}")
            return False
    
    def get_account(self, account_id: str) -> Optional[Account]:
        """Get account by ID"""
        try:
            with self.lock:
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                
                cursor.execute('SELECT * FROM accounts WHERE account_id = ?', (account_id,))
                row = cursor.fetchone()
                conn.close()
                
                if row:
                    return self._row_to_account(row)
                return None
        except Exception as e:
            logger.error(f"Error getting account from database: {e}")
            return None
    
    def get_all_accounts(self) -> List[Account]:
        """Get all accounts"""
        try:
            with self.lock:
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                
                cursor.execute('SELECT * FROM accounts')
                rows = cursor.fetchall()
                conn.close()
                
                return [self._row_to_account(row) for row in rows]
        except Exception as e:
            logger.error(f"Error getting all accounts: {e}")
            return []
    
    def update_server_usage(self, server_name: str, platform_type: PlatformType, 
                          active_terminals: int, total_terminals: int,
                          cpu_usage: float, memory_usage: float, disk_usage: float) -> bool:
        """Update server usage statistics"""
        try:
            with self.lock:
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                
                cursor.execute('''
                    INSERT OR REPLACE INTO server_usage 
                    (server_name, platform_type, active_terminals, total_terminals,
                     cpu_usage, memory_usage, disk_usage, last_updated)
                    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ''', (
                    server_name,
                    platform_type.value,
                    active_terminals,
                    total_terminals,
                    cpu_usage,
                    memory_usage,
                    disk_usage
                ))
                
                conn.commit()
                conn.close()
                return True
        except Exception as e:
            logger.error(f"Error updating server usage: {e}")
            return False
    
    def get_accounts(self, account_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """Get accounts by IDs or all accounts if no IDs provided (dict format)"""
        try:
            with self.lock:
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                if account_ids:
                    placeholders = ','.join(['?' for _ in account_ids])
                    cursor.execute(f'SELECT * FROM accounts WHERE account_id IN ({placeholders})', account_ids)
                else:
                    cursor.execute('SELECT * FROM accounts')
                rows = cursor.fetchall()
                conn.close()
                accounts = []
                for row in rows:
                    accounts.append({
                        "account_id": row[0],
                        "login": row[1],
                        "password": row[2],
                        "server": row[3],
                        "groupid": row[4],
                        "platform_type": row[5],
                        "status": row[6],
                        "name": row[7],
                        "email": row[8],
                        "user_id": row[9],
                        "balance": row[10],
                        "state": row[11],
                        "created_at": row[12],
                        "updated_at": row[13]
                    })
                return accounts
        except Exception as e:
            logger.error(f"Error getting accounts from database: {e}")
            return []

    def get_account_by_login(self, login: str) -> Optional[Dict[str, Any]]:
        """Get account by login (dict format)"""
        try:
            with self.lock:
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                cursor.execute('SELECT * FROM accounts WHERE login = ?', (login,))
                row = cursor.fetchone()
                conn.close()
                if row:
                    return {
                        "account_id": row[0],
                        "login": row[1],
                        "password": row[2],
                        "server": row[3],
                        "groupid": row[4],
                        "platform_type": row[5],
                        "status": row[6],
                        "name": row[7],
                        "email": row[8],
                        "user_id": row[9],
                        "balance": row[10],
                        "state": row[11],
                        "created_at": row[12],
                        "updated_at": row[13]
                    }
                return None
        except Exception as e:
            logger.error(f"Error getting account by login from database: {e}")
            return None

    def create_account(self, account_data: Dict[str, Any]) -> bool:
        """Create a new account (dict input)"""
        try:
            with self.lock:
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO accounts 
                    (account_id, login, password, server, groupid, platform_type, 
                     status, name, email, user_id, balance, state, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    account_data.get("account_id"),
                    account_data.get("login"),
                    account_data.get("password"),
                    account_data.get("server"),
                    account_data.get("group", ""),
                    account_data.get("broker", "mt4"),
                    account_data.get("status", "1"),
                    account_data.get("name"),
                    account_data.get("email"),
                    account_data.get("user_id", 1),
                    account_data.get("balance"),
                    account_data.get("state", "creating"),
                    account_data.get("created_at"),
                    account_data.get("updated_at")
                ))
                conn.commit()
                conn.close()
                logger.info(f"Account {account_data.get('account_id')} created in database")
                return True
        except Exception as e:
            logger.error(f"Error creating account in database: {e}")
            return False

    def update_account(self, account_id: str, updates: Dict[str, Any]) -> bool:
        """Update account information (dict input)"""
        try:
            with self.lock:
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                set_clauses = []
                values = []
                for key, value in updates.items():
                    set_clauses.append(f"{key} = ?")
                    values.append(value)
                set_clauses.append("updated_at = CURRENT_TIMESTAMP")
                values.append(account_id)
                query = f"UPDATE accounts SET {', '.join(set_clauses)} WHERE account_id = ?"
                cursor.execute(query, values)
                conn.commit()
                conn.close()
                logger.info(f"Account {account_id} updated in database")
                return True
        except Exception as e:
            logger.error(f"Error updating account in database: {e}")
            return False

    def delete_account(self, account_id: str) -> bool:
        """Delete an account (by account_id)"""
        try:
            with self.lock:
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                cursor.execute('DELETE FROM accounts WHERE account_id = ?', (account_id,))
                conn.commit()
                conn.close()
                logger.info(f"Account {account_id} deleted from database")
                return True
        except Exception as e:
            logger.error(f"Error deleting account from database: {e}")
            return False
    
    def _row_to_terminal(self, row) -> Terminal:
        """Convert database row to Terminal object"""
        return Terminal(
            terminal_id=row[0],
            account_id=row[1],
            platform_type=PlatformType(row[2]),
            process_id=row[3],
            status=TerminalStatus(row[4]),
            start_time=datetime.fromisoformat(row[5]) if row[5] else None,
            last_heartbeat=datetime.fromisoformat(row[6]) if row[6] else None,
            connection_attempts=row[7],
            max_connection_attempts=row[8],
            config_data=json.loads(row[9]) if row[9] else {},
            error_message=row[10],
            server_path=row[11],
            data_path=row[12]
        )
    
    def _row_to_account(self, row) -> Account:
        """Convert database row to Account object"""
        return Account(
            account_id=row[0],
            login=row[1],
            password=row[2],
            server=row[3],
            groupid=row[4],
            platform_type=PlatformType(row[5]),
            status=row[6],
            name=row[7],
            email=row[8],
            user_id=row[9],
            balance=row[10],
            state=row[11],
            created_at=datetime.fromisoformat(row[12]) if row[12] else None,
            updated_at=datetime.fromisoformat(row[13]) if row[13] else None
        ) 