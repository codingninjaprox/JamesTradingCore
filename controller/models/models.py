from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field

class PlatformType(str, Enum):
    MT4 = "mt4"
    MT5 = "mt5"

class TerminalStatus(str, Enum):
    STARTING = "starting"
    RUNNING = "running"
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    ERROR = "error"
    STOPPED = "stopped"
    CRASHED = "crashed"
    FAILED = "failed"

class AccountStatus(str, Enum):
    ACTIVE = "1"
    PAUSED = "0"
    DELETED = "deleted"

class Account(BaseModel):
    """Account model for MT4/MT5 accounts"""
    account_id: str
    login: str
    password: str
    server: str
    groupid: Optional[str] = None
    platform_type: PlatformType = PlatformType.MT4
    status: AccountStatus = AccountStatus.ACTIVE
    name: str
    email: str
    user_id: int
    balance: Optional[float] = None
    equity: Optional[float] = None
    state: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class Terminal(BaseModel):
    """Terminal instance model"""
    terminal_id: str
    account_id: str
    platform_type: PlatformType
    process_id: Optional[int] = None
    status: TerminalStatus = TerminalStatus.STARTING
    start_time: Optional[datetime] = None
    last_heartbeat: Optional[datetime] = None
    connection_attempts: int = 0
    max_connection_attempts: int = 3
    config_data: Dict[str, Any] = Field(default_factory=dict)
    error_message: Optional[str] = None
    server_path: str
    data_path: str

class TerminalConfig(BaseModel):
    """Configuration for terminal instances"""
    account_id: str
    platform_type: PlatformType
    server: str
    login: str
    password: str
    groupid: Optional[str] = None
    ea_settings: Dict[str, Any] = Field(default_factory=dict)
    risk_settings: Dict[str, Any] = Field(default_factory=dict)
    trading_settings: Dict[str, Any] = Field(default_factory=dict)

class HeartbeatData(BaseModel):
    """Heartbeat data sent to Laravel API"""
    terminal_id: str
    account_id: str
    platform_type: PlatformType
    status: TerminalStatus
    timestamp: datetime
    performance_data: Optional[Dict[str, Any]] = None
    error_data: Optional[Dict[str, Any]] = None

class ServerUsage(BaseModel):
    """Server usage statistics"""
    server_name: str
    platform_type: PlatformType
    active_terminals: int
    total_terminals: int
    cpu_usage: float
    memory_usage: float
    disk_usage: float
    last_updated: datetime

class EASettings(BaseModel):
    """Expert Advisor settings"""
    ea_name: str
    magic_number: int
    initial_lot: float = 0.01
    max_pairs: int = 5
    active_pairs: List[str] = Field(default_factory=list)
    risk_multiplier: float = 1.0
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    max_drawdown: Optional[float] = None
    enabled: bool = True

class RiskSettings(BaseModel):
    """Risk management settings"""
    max_daily_loss: Optional[float] = None
    max_weekly_loss: Optional[float] = None
    max_monthly_loss: Optional[float] = None
    max_open_positions: int = 10
    max_lot_size: float = 10.0
    min_lot_size: float = 0.01
    leverage_limit: Optional[int] = None

class TradingSettings(BaseModel):
    """Trading configuration settings"""
    allowed_symbols: List[str] = Field(default_factory=list)
    trading_hours: Dict[str, Any] = Field(default_factory=dict)
    news_filter: bool = False
    weekend_trading: bool = False
    auto_lot_calculation: bool = True
    martingale_enabled: bool = False
    martingale_multiplier: float = 2.0

class ControllerStats(BaseModel):
    """Controller statistics"""
    total_terminals: int
    active_terminals: int
    connected_terminals: int
    error_terminals: int
    total_accounts: int
    active_accounts: int
    paused_accounts: int
    server_usage: List[ServerUsage]
    uptime: float
    last_updated: datetime

class APIResponse(BaseModel):
    """Standard API response model"""
    success: bool
    message: str
    data: Optional[Any] = None
    errors: Optional[List[str]] = None

class TerminalLaunchRequest(BaseModel):
    """Request to launch a new terminal"""
    account_id: str
    platform_type: PlatformType
    server: str
    login: str
    password: str
    groupid: str
    priority: int = 1  # Higher priority = launch sooner

class TerminalStopRequest(BaseModel):
    """Request to stop a terminal"""
    terminal_id: str
    force: bool = False

class ConfigUpdateRequest(BaseModel):
    """Request to update terminal configuration"""
    terminal_id: str
    config_type: str  # 'ea', 'risk', 'trading'
    config_data: Dict[str, Any] 