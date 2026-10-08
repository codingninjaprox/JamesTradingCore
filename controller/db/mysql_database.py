import mysql.connector
import json
from datetime import datetime
from typing import List, Optional, Dict, Any, Union
import threading
from loguru import logger

from models.models import Terminal, Account, TerminalConfig, TerminalStatus, PlatformType

class MySQLDatabaseManager:
    """MySQL database manager for controller state"""
    
    def __init__(self, host: str, port: int, database: str, username: str, password: str):
        self.host = host
        self.port = port
        self.database = database
        self.username = username
        self.password = password
        self.lock = threading.Lock()
        self._init_database()
    
    def _get_connection(self):
        """Get MySQL connection"""
        return mysql.connector.connect(
            host=self.host,
            port=self.port,
            database=self.database,
            user=self.username,
            password=self.password,
            autocommit=True
        )
    
    def _init_database(self):
        """Initialize database tables"""
        try:
            with self.lock:
                conn = self._get_connection()
                cursor = conn.cursor()
                
                # Create terminals table
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS terminals (
                        terminal_id VARCHAR(255) PRIMARY KEY,
                        account_id VARCHAR(255) NOT NULL,
                        platform_type VARCHAR(50) NOT NULL,
                        process_id INT,
                        status VARCHAR(50) NOT NULL,
                        start_time DATETIME,
                        last_heartbeat DATETIME,
                        connection_attempts INT DEFAULT 0,
                        max_connection_attempts INT DEFAULT 3,
                        config_data JSON,
                        error_message TEXT,
                        server_path VARCHAR(500) NOT NULL,
                        data_path VARCHAR(500) NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    )
                ''')
                
                # Create accounts table
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS accounts (
                        account_id VARCHAR(255) PRIMARY KEY,
                        login VARCHAR(100) NOT NULL,
                        password VARCHAR(255) NOT NULL,
                        server VARCHAR(100) NOT NULL,
                        groupid VARCHAR(100) NOT NULL,
                        platform_type VARCHAR(50) NOT NULL,
                        status VARCHAR(50) NOT NULL,
                        name VARCHAR(255) NOT NULL,
                        email VARCHAR(255) NOT NULL,
                        user_id INT NOT NULL,
                        balance DECIMAL(15,2),
                        equity DECIMAL(15,2),
                        state VARCHAR(50),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    )
                ''')
                
                # Add equity column if it doesn't exist (for existing databases)
                try:
                    cursor.execute('ALTER TABLE accounts ADD COLUMN equity DECIMAL(15,2)')
                    logger.info("Added equity column to accounts table")
                except Exception as e:
                    # Column already exists, ignore error
                    pass
                
                # Create configurations table
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS configurations (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        account_id VARCHAR(255) NOT NULL,
                        platform_type VARCHAR(50) NOT NULL,
                        server VARCHAR(100) NOT NULL,
                        login VARCHAR(100) NOT NULL,
                        password VARCHAR(255) NOT NULL,
                        groupid VARCHAR(100) NOT NULL,
                        ea_settings JSON,
                        risk_settings JSON,
                        trading_settings JSON,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        FOREIGN KEY (account_id) REFERENCES accounts (account_id)
                    )
                ''')
                
                # Create server_usage table
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS server_usage (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        server_name VARCHAR(100) NOT NULL,
                        platform_type VARCHAR(50) NOT NULL,
                        active_terminals INT DEFAULT 0,
                        total_terminals INT DEFAULT 0,
                        cpu_usage DECIMAL(5,2) DEFAULT 0,
                        memory_usage DECIMAL(5,2) DEFAULT 0,
                        disk_usage DECIMAL(5,2) DEFAULT 0,
                        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    )
                ''')
                
                # Create account_history table
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS account_history (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        account_id VARCHAR(255) NOT NULL,
                        login VARCHAR(100) NOT NULL,
                        server VARCHAR(100) NOT NULL,
                        currency VARCHAR(10),
                        leverage INT,
                        balance DECIMAL(15,2),
                        equity DECIMAL(15,2),
                        margin DECIMAL(15,2),
                        free_margin DECIMAL(15,2),
                        profit DECIMAL(15,2),
                        margin_level DECIMAL(10,2),
                        open_positions INT,
                        pending_orders INT,
                        connected BOOLEAN,
                        trade_allowed BOOLEAN,
                        source VARCHAR(50),
                        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_account_id (account_id),
                        INDEX idx_login (login),
                        INDEX idx_recorded_at (recorded_at)
                    )
                ''')
                
                conn.commit()
                conn.close()
                logger.info(f"MySQL database initialized at {self.host}:{self.port}/{self.database}")
        except Exception as e:
            logger.error(f"Error initializing MySQL database: {e}")
            raise
    
    def add_terminal(self, terminal: Terminal) -> bool:
        """Add a new terminal to the database"""
        try:
            with self.lock:
                conn = self._get_connection()
                cursor = conn.cursor()
                
                cursor.execute('''
                    INSERT INTO terminals 
                    (terminal_id, account_id, platform_type, process_id, status, 
                     start_time, last_heartbeat, connection_attempts, max_connection_attempts,
                     config_data, error_message, server_path, data_path)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                    platform_type = VALUES(platform_type),
                    process_id = VALUES(process_id),
                    status = VALUES(status),
                    start_time = VALUES(start_time),
                    last_heartbeat = VALUES(last_heartbeat),
                    connection_attempts = VALUES(connection_attempts),
                    max_connection_attempts = VALUES(max_connection_attempts),
                    config_data = VALUES(config_data),
                    error_message = VALUES(error_message),
                    server_path = VALUES(server_path),
                    data_path = VALUES(data_path),
                    updated_at = CURRENT_TIMESTAMP
                ''', (
                    terminal.terminal_id,
                    terminal.account_id,
                    terminal.platform_type.value,
                    terminal.process_id,
                    terminal.status.value,
                    terminal.start_time,
                    terminal.last_heartbeat,
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
                conn = self._get_connection()
                cursor = conn.cursor()
                
                # Build update query dynamically
                set_clauses = []
                values = []
                
                for key, value in updates.items():
                    if key in ['config_data']:
                        set_clauses.append(f"{key} = %s")
                        values.append(json.dumps(value))
                    else:
                        set_clauses.append(f"{key} = %s")
                        values.append(value)
                
                values.append(terminal_id)
                
                query = f"UPDATE terminals SET {', '.join(set_clauses)} WHERE terminal_id = %s"
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
                conn = self._get_connection()
                cursor = conn.cursor()
                
                cursor.execute('SELECT * FROM terminals WHERE terminal_id = %s', (terminal_id,))
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
                conn = self._get_connection()
                cursor = conn.cursor()
                
                cursor.execute('SELECT * FROM terminals WHERE account_id = %s', (account_id,))
                rows = cursor.fetchall()
                conn.close()
                
                return [self._row_to_terminal(row) for row in rows]
        except Exception as e:
            logger.error(f"Error getting terminals from database: {e}")
            return []
    
    def get_all_terminals(self) -> List[Terminal]:
        """Get all terminals"""
        try:
            with self.lock:
                conn = self._get_connection()
                cursor = conn.cursor()
                
                cursor.execute('SELECT * FROM terminals')
                rows = cursor.fetchall()
                conn.close()
                
                return [self._row_to_terminal(row) for row in rows]
        except Exception as e:
            logger.error(f"Error getting all terminals from database: {e}")
            return []
    
    def delete_terminal(self, terminal_id: str) -> bool:
        """Delete terminal by ID"""
        try:
            with self.lock:
                conn = self._get_connection()
                cursor = conn.cursor()
                
                cursor.execute('DELETE FROM terminals WHERE terminal_id = %s', (terminal_id,))
                conn.commit()
                conn.close()
                
                logger.info(f"Terminal {terminal_id} deleted from database")
                return True
        except Exception as e:
            logger.error(f"Error deleting terminal from database: {e}")
            return False
    
    def delete_terminals_by_account(self, account_id: str) -> bool:
        """Delete all terminals for a specific account"""
        try:
            with self.lock:
                conn = self._get_connection()
                cursor = conn.cursor()
                
                cursor.execute('DELETE FROM terminals WHERE account_id = %s', (account_id,))
                deleted_count = cursor.rowcount
                conn.commit()
                conn.close()
                
                logger.info(f"Deleted {deleted_count} terminals for account {account_id}")
                return True
        except Exception as e:
            logger.error(f"Error deleting terminals for account {account_id}: {e}")
            return False
    
    def add_account(self, account: Account) -> bool:
        """Add a new account to the database"""
        try:
            with self.lock:
                conn = self._get_connection()
                cursor = conn.cursor()
                
                cursor.execute('''
                    INSERT INTO accounts 
                    (account_id, login, password, server, groupid, platform_type, status, name, email, user_id, balance, state)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                    password = VALUES(password),
                    server = VALUES(server),
                    groupid = VALUES(groupid),
                    platform_type = VALUES(platform_type),
                    status = VALUES(status),
                    name = VALUES(name),
                    email = VALUES(email),
                    user_id = VALUES(user_id),
                    balance = VALUES(balance),
                    state = VALUES(state),
                    updated_at = CURRENT_TIMESTAMP
                ''', (
                    account.account_id,
                    account.login,
                    account.password,
                    account.server,
                    account.groupid,
                    account.platform_type.value,
                    account.status,
                    account.name,
                    account.email,
                    account.user_id,
                    account.balance or 0,  # Convert None to 0
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
            logger.info(f"Database: Looking up account_id: {account_id}")
            with self.lock:
                conn = self._get_connection()
                cursor = conn.cursor()
                
                cursor.execute('SELECT * FROM accounts WHERE account_id = %s', (account_id,))
                row = cursor.fetchone()
                conn.close()
                
                if row:
                    logger.info(f"Database: Found account_id {account_id} in database")
                    logger.info(f"Database: Raw row data: {row}")
                    logger.info(f"Database: Row length: {len(row)}")
                    logger.info(f"Database: Balance at index 10: {row[10] if len(row) > 10 else 'N/A'}")
                    logger.info(f"Database: Equity at index 11: {row[11] if len(row) > 11 else 'N/A'}")
                    logger.info(f"Database: State at index 12: {row[12] if len(row) > 12 else 'N/A'}")
                    return self._row_to_account(row)
                else:
                    logger.info(f"Database: Account_id {account_id} not found in database")
                return None
        except Exception as e:
            logger.error(f"Error getting account from database: {e}")
            return None
    
    def get_all_accounts(self) -> List[Account]:
        """Get all accounts"""
        try:
            with self.lock:
                conn = self._get_connection()
                cursor = conn.cursor()
                
                cursor.execute('SELECT * FROM accounts')
                rows = cursor.fetchall()
                conn.close()
                
                return [self._row_to_account(row) for row in rows]
        except Exception as e:
            logger.error(f"Error getting all accounts from database: {e}")
            return []
    
    def update_server_usage(self, server_name: str, platform_type: PlatformType, 
                          active_terminals: int, total_terminals: int,
                          cpu_usage: float, memory_usage: float, disk_usage: float) -> bool:
        """Update server usage statistics"""
        try:
            with self.lock:
                conn = self._get_connection()
                cursor = conn.cursor()
                
                cursor.execute('''
                    INSERT INTO server_usage 
                    (server_name, platform_type, active_terminals, total_terminals, cpu_usage, memory_usage, disk_usage)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                    active_terminals = VALUES(active_terminals),
                    total_terminals = VALUES(total_terminals),
                    cpu_usage = VALUES(cpu_usage),
                    memory_usage = VALUES(memory_usage),
                    disk_usage = VALUES(disk_usage),
                    last_updated = CURRENT_TIMESTAMP
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
        """Get accounts as dictionaries for API responses"""
        try:
            with self.lock:
                conn = self._get_connection()
                cursor = conn.cursor(dictionary=True)
                
                if account_ids:
                    placeholders = ','.join(['%s'] * len(account_ids))
                    query = f'SELECT * FROM accounts WHERE account_id IN ({placeholders})'
                    cursor.execute(query, account_ids)
                else:
                    cursor.execute('SELECT * FROM accounts')
                
                rows = cursor.fetchall()
                conn.close()
                
                # Convert datetime objects to strings for JSON serialization
                accounts = []
                for row in rows:
                    account = dict(row)  # type: ignore
                    # Convert bytes keys to strings
                    account = {k.decode() if isinstance(k, bytes) else k: v for k, v in account.items()}
                    created_at = account.get('created_at')
                    if created_at and hasattr(created_at, 'isoformat'):
                        account['created_at'] = created_at.isoformat()  # type: ignore
                    updated_at = account.get('updated_at')
                    if updated_at and hasattr(updated_at, 'isoformat'):
                        account['updated_at'] = updated_at.isoformat()  # type: ignore
                    # Convert null balance to 0
                    if account.get('balance') is None:
                        account['balance'] = 0.0  # type: ignore
                    accounts.append(account)
                
                return accounts
        except Exception as e:
            logger.error(f"Error getting accounts from database: {e}")
            return []
    
    def get_account_by_login(self, login: str) -> Optional[Dict[str, Any]]:
        """Get account by login"""
        try:
            with self.lock:
                conn = self._get_connection()
                cursor = conn.cursor(dictionary=True)
                
                cursor.execute('SELECT * FROM accounts WHERE login = %s', (login,))
                row = cursor.fetchone()
                conn.close()
                
                if row:
                    # Convert datetime objects to strings
                    account = dict(row)  # type: ignore
                    # Convert bytes keys to strings
                    account = {k.decode() if isinstance(k, bytes) else k: v for k, v in account.items()}
                    created_at = account.get('created_at')
                    if created_at and hasattr(created_at, 'isoformat'):
                        account['created_at'] = created_at.isoformat()  # type: ignore
                    updated_at = account.get('updated_at')
                    if updated_at and hasattr(updated_at, 'isoformat'):
                        account['updated_at'] = updated_at.isoformat()  # type: ignore
                    # Convert null balance to 0
                    if account.get('balance') is None:
                        account['balance'] = 0.0  # type: ignore
                    return account
                return None
        except Exception as e:
            logger.error(f"Error getting account by login from database: {e}")
            return None
    
    def get_accounts_by_user_id(self, user_id: int) -> List[Dict[str, Any]]:
        """Get all accounts for a specific user ID"""
        try:
            with self.lock:
                conn = self._get_connection()
                cursor = conn.cursor(dictionary=True)
                
                cursor.execute('SELECT * FROM accounts WHERE user_id = %s ORDER BY created_at', (user_id,))
                rows = cursor.fetchall()
                conn.close()
                
                accounts = []
                for row in rows:
                    # Convert datetime objects to strings
                    account = dict(row)  # type: ignore
                    # Convert bytes keys to strings
                    account = {k.decode() if isinstance(k, bytes) else k: v for k, v in account.items()}
                    created_at = account.get('created_at')
                    if created_at and hasattr(created_at, 'isoformat'):
                        account['created_at'] = created_at.isoformat()  # type: ignore
                    updated_at = account.get('updated_at')
                    if updated_at and hasattr(updated_at, 'isoformat'):
                        account['updated_at'] = updated_at.isoformat()  # type: ignore
                    # Convert null balance to 0
                    if account.get('balance') is None:
                        account['balance'] = 0.0  # type: ignore
                    accounts.append(account)
                
                return accounts
        except Exception as e:
            logger.error(f"Error getting accounts by user_id from database: {e}")
            return []
    
    def create_account(self, account_data: Dict[str, Any]) -> bool:
        """Create a new account"""
        try:
            with self.lock:
                conn = self._get_connection()
                cursor = conn.cursor()
                
                cursor.execute('''
                    INSERT INTO accounts 
                    (account_id, login, password, server, groupid, platform_type, status, name, email, user_id, balance, state)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ''', (
                    account_data['account_id'],
                    account_data['login'],
                    account_data['password'],
                    account_data['server'],
                    account_data.get('groupid') or '',  # Convert None to empty string
                    account_data.get('platform_type', 'mt4'),
                    account_data.get('status', '1'),
                    account_data.get('name', ''),
                    account_data.get('email', ''),
                    account_data.get('user_id', 1),
                    account_data.get('balance', 0) or 0,  # Convert None to 0
                    account_data.get('state')
                ))
                
                conn.commit()
                conn.close()
                logger.info(f"Account {account_data['account_id']} created in database")
                return True
        except Exception as e:
            logger.error(f"Error creating account in database: {e}")
            logger.error(f"Account data: {account_data}")
            return False
    
    def update_account(self, account_id: str, updates: Dict[str, Any]) -> bool:
        """Update account information"""
        try:
            with self.lock:
                conn = self._get_connection()
                cursor = conn.cursor()
                
                # Build update query dynamically
                set_clauses = []
                values = []
                
                for key, value in updates.items():
                    set_clauses.append(f"{key} = %s")
                    values.append(value)
                
                values.append(account_id)
                
                query = f"UPDATE accounts SET {', '.join(set_clauses)} WHERE account_id = %s"
                logger.info(f"Database UPDATE query: {query}")
                logger.info(f"Database UPDATE values: {values}")
                cursor.execute(query, values)
                
                # Verify the update by reading back the data
                cursor.execute('SELECT balance, equity, state FROM accounts WHERE account_id = %s', (account_id,))
                verify_row = cursor.fetchone()
                if verify_row:
                    logger.info(f"Database verification after UPDATE - balance: {verify_row[0]}, equity: {verify_row[1]}, state: {verify_row[2]}")
                
                conn.commit()
                conn.close()
                logger.info(f"Account {account_id} updated in database")
                return True
        except Exception as e:
            logger.error(f"Error updating account in database: {e}")
            return False
    
    def delete_account(self, account_id: str) -> bool:
        """Delete account by ID"""
        try:
            with self.lock:
                conn = self._get_connection()
                cursor = conn.cursor()
                
                cursor.execute('DELETE FROM accounts WHERE account_id = %s', (account_id,))
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
            start_time=row[5] if row[5] else None,
            last_heartbeat=row[6] if row[6] else None,
            connection_attempts=row[7],
            max_connection_attempts=row[8],
            config_data=json.loads(row[9]) if row[9] else {},
            error_message=row[10],
            server_path=row[11],
            data_path=row[12]
        )
    
    def _row_to_account(self, row) -> Account:
        """Convert database row to Account object"""
        # Debug: Log the platform_type value from database
        raw_platform_type = row[5]
        logger.info(f"Database platform_type value: {raw_platform_type} (type: {type(raw_platform_type)})")
        
        try:
            platform_type = PlatformType(raw_platform_type)
            logger.info(f"Successfully converted to PlatformType: {platform_type}")
        except Exception as e:
            logger.error(f"Error converting platform_type '{raw_platform_type}' to enum: {e}")
            # Fallback to MT4 if conversion fails
            platform_type = PlatformType.MT4
            logger.info(f"Using fallback platform_type: {platform_type}")
        
        # Handle data type mismatches
        # Handle equity field - convert string "connected" to None
        equity_raw = row[11] if len(row) > 11 else None
        equity = None
        if equity_raw is not None:
            if isinstance(equity_raw, (int, float)):
                equity = float(equity_raw)
            elif isinstance(equity_raw, str):
                try:
                    equity = float(equity_raw)
                except (ValueError, TypeError):
                    # If it's not a number (like "connected"), set to None
                    logger.warning(f"Equity field contains non-numeric value: {equity_raw}, setting to None")
                    equity = None
            else:
                equity = None
        
        # Handle state field - convert datetime to string
        state_raw = row[12] if len(row) > 12 else None
        state = None
        if state_raw is not None:
            if isinstance(state_raw, datetime):
                state = state_raw.strftime('%Y-%m-%d %H:%M:%S')
            elif isinstance(state_raw, str):
                state = state_raw
            else:
                state = str(state_raw)
        
        # Handle balance field similarly
        balance_raw = row[10] if len(row) > 10 else None
        logger.info(f"Database balance_raw value: {balance_raw} (type: {type(balance_raw)})")
        balance = 0
        if balance_raw is not None:
            if isinstance(balance_raw, (int, float)):
                balance = float(balance_raw)
                logger.info(f"Database balance converted from {type(balance_raw)} to float: {balance}")
            elif isinstance(balance_raw, str):
                try:
                    balance = float(balance_raw)
                    logger.info(f"Database balance converted from string '{balance_raw}' to float: {balance}")
                except (ValueError, TypeError):
                    logger.warning(f"Database balance string '{balance_raw}' could not be converted to float, setting to 0")
                    balance = 0
            else:
                # Try to convert any other type to float (including Decimal)
                try:
                    balance = float(balance_raw)
                    logger.info(f"Database balance converted from {type(balance_raw)} '{balance_raw}' to float: {balance}")
                except (ValueError, TypeError):
                    logger.warning(f"Database balance {type(balance_raw)} '{balance_raw}' could not be converted to float, setting to 0")
                    balance = 0
        else:
            logger.warning(f"Database balance_raw is None, setting to 0")
        
        logger.info(f"Final balance value: {balance}")
        
        return Account(
            account_id=row[0],
            login=row[1],
            password=row[2],
            server=row[3],
            groupid=row[4] or None,  # Convert empty string to None
            platform_type=platform_type,
            status=row[6],
            name=row[7],
            email=row[8],
            user_id=row[9],
            balance=balance,
            equity=equity,
            state=state,
            created_at=row[13] if len(row) > 13 else None,  # created_at column
            updated_at=row[14] if len(row) > 14 else None   # updated_at column
        )

    def save_account_history(self, account_id: str, ea_data: Dict[str, Any]) -> bool:
        """Save account data to history table - update if same day, insert if different day"""
        try:
            with self.lock:
                conn = self._get_connection()
                
                # Step 1: Find the most recent record for this account_id and login
                cursor1 = conn.cursor()
                cursor1.execute('''
                    SELECT id, recorded_at FROM account_history 
                    WHERE account_id = %s AND login = %s
                    ORDER BY recorded_at DESC 
                    LIMIT 1
                ''', (account_id, ea_data.get('login', '')))
                
                recent_record = cursor1.fetchone()
                cursor1.close()
                
                # Step 2: Check if we should update or insert
                should_update = False
                if recent_record:
                    # Handle different date types from database
                    recent_timestamp = recent_record[1]
                    if hasattr(recent_timestamp, 'date'):
                        recent_date = recent_timestamp.date()  # type: ignore
                    else:
                        # If it's a string, parse it
                        recent_date = datetime.strptime(str(recent_timestamp), '%Y-%m-%d %H:%M:%S').date()
                    
                    today_date = datetime.now().date()
                    should_update = (recent_date == today_date)
                
                if should_update:
                    # Update the most recent record for today
                    cursor2 = conn.cursor()
                    cursor2.execute('''
                        UPDATE account_history SET
                        server = %s, currency = %s, leverage = %s,
                        balance = %s, equity = %s, margin = %s, free_margin = %s,
                        profit = %s, margin_level = %s, open_positions = %s,
                        pending_orders = %s, connected = %s, trade_allowed = %s,
                        source = %s, recorded_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                    ''', (  # type: ignore
                        ea_data.get('server', ''),
                        ea_data.get('currency', ''),
                        ea_data.get('leverage', 0),
                        ea_data.get('balance', 0.0),
                        ea_data.get('equity', 0.0),
                        ea_data.get('margin', 0.0),
                        ea_data.get('free_margin', 0.0),
                        ea_data.get('profit', 0.0),
                        ea_data.get('margin_level', 0.0),
                        ea_data.get('open_positions', 0),
                        ea_data.get('pending_orders', 0),
                        ea_data.get('connected', False),
                        ea_data.get('trade_allowed', False),
                        ea_data.get('source', 'james_trading_ea'),
                        recent_record[0] if recent_record else 0  # Use the ID of the most recent record
                    ))
                    
                    cursor2.close()
                    action = "updated"
                else:
                    # Insert new record for today (or different day)
                    cursor3 = conn.cursor()
                    cursor3.execute('''
                        INSERT INTO account_history 
                        (account_id, login, server, currency, leverage, balance, equity, 
                         margin, free_margin, profit, margin_level, open_positions, 
                         pending_orders, connected, trade_allowed, source)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ''', (
                        account_id,
                        ea_data.get('login', ''),
                        ea_data.get('server', ''),
                        ea_data.get('currency', ''),
                        ea_data.get('leverage', 0),
                        ea_data.get('balance', 0.0),
                        ea_data.get('equity', 0.0),
                        ea_data.get('margin', 0.0),
                        ea_data.get('free_margin', 0.0),
                        ea_data.get('profit', 0.0),
                        ea_data.get('margin_level', 0.0),
                        ea_data.get('open_positions', 0),
                        ea_data.get('pending_orders', 0),
                        ea_data.get('connected', False),
                        ea_data.get('trade_allowed', False),
                        ea_data.get('source', 'james_trading_ea')
                    ))
                    
                    cursor3.close()
                    action = "inserted"
                
                conn.commit()
                conn.close()
                
                logger.info(f"Account history {action} for {account_id}: Balance={ea_data.get('balance')}, Equity={ea_data.get('equity')}")
                return True
                
        except Exception as e:
            logger.error(f"Error saving account history for {account_id}: {e}")
            return False 