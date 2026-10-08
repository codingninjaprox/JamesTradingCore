//+------------------------------------------------------------------+
//| JamesTradingEA.mq4
//| Expert Advisor for James Trading Platform
//| Advanced Trading System with API Integration, Template Management,
//| MACD Strategy, Martingale Logic, and News Filtering
//| Focused on 2 Major Pairs: GBPUSD & EURUSD
//+------------------------------------------------------------------+
#property copyright "JamesPlatform"
#property link "https://jamestradinggroup.com"
#property version "2.00"
#property strict
#property description "Advanced EA with API integration, template management, and smart trading logic. Trades GBPUSD and EURUSD pairs."

//+------------------------------------------------------------------+
//| INCLUDES AND IMPORTS
//+------------------------------------------------------------------+
#include <stdlib.mqh>

//+------------------------------------------------------------------+
//| ENUMS AND CONSTANTS
//+------------------------------------------------------------------+
enum ENUM_PLATFORM_TYPE
{
    PLATFORM_MT4 = 0,
    PLATFORM_MT5 = 1
};

enum ENUM_NEWS_IMPACT
{
    NEWS_IMPACT_LOW = 1,
    NEWS_IMPACT_MEDIUM = 2,
    NEWS_IMPACT_HIGH = 3
};

enum ENUM_TRADE_DIRECTION
{
    TRADE_BUY = 0,
    TRADE_SELL = 1
};

//+------------------------------------------------------------------+
//| INPUT PARAMETERS - STRATEGY SETTINGS
//+------------------------------------------------------------------+
// Core Strategy Parameters
input group "=== CORE STRATEGY SETTINGS ==="
input double InitialLot = 0.01;                    // Initial lot size
input double LotMultiplier = 2.0;                  // Lot multiplier for Martingale
input int StepDistance = 20;                       // Distance between trade levels (pips)
input int MinStepDistance = 10;                    // Minimum step distance (pips)
input int MaxTrades = 4;                           // Maximum initial trades per symbol
input double TPScalingPercent = 3.0;               // TP scaling percentage per step

// MACD Parameters
input group "=== MACD INDICATOR SETTINGS ==="
input int MACD_FastEMA = 12;                       // MACD Fast EMA
input int MACD_SlowEMA = 26;                       // MACD Slow EMA
input int MACD_SignalSMA = 9;                      // MACD Signal SMA

// Take Profit & Stop Loss
input group "=== RISK MANAGEMENT ==="
input double FixedTP = 30.0;                       // Fixed TP per InitialLot (in account currency)
input bool UseSmartTP = true;                      // Enable smart TP scaling
input bool UseStopLoss = false;                    // Enable stop loss
input double StopLossPips = 50.0;                  // Stop loss in pips

// Currency Exposure Limits
input group "=== CURRENCY EXPOSURE LIMITS ==="
input int MaxByCurrencyPrefix_EUR = 2;             // Max EUR pairs (EURUSD, EURJPY, etc.)
input int MaxByCurrencyPrefix_GBP = 2;             // Max GBP pairs (GBPUSD, GBPJPY, etc.)
input int MaxByCurrencyPrefix_USD = 3;             // Max USD pairs (EURUSD, GBPUSD, etc.)
input int MaxByCurrencySuffix_USD = 3;             // Max USD pairs (EURUSD, GBPUSD, etc.)
input int MaxByCurrencySuffix_JPY = 2;             // Max JPY pairs (EURJPY, GBPJPY, etc.)

// Symbol-Specific Settings
input group "=== SYMBOL-SPECIFIC SETTINGS ==="
input bool AllowTrades_EURUSD = true;              // Allow EURUSD trading
input bool AllowTrades_GBPUSD = true;              // Allow GBPUSD trading
input bool AllowTrades_USDJPY = true;              // Allow USDJPY trading
input bool AllowTrades_EURJPY = true;              // Allow EURJPY trading
input bool AllowTrades_GBPJPY = true;              // Allow GBPJPY trading
input bool AllowTrades_XAUUSD = true;              // Allow XAUUSD (Gold) trading
input double SymbolStepMultiplier_XAUUSD = 0.5;    // Gold step distance multiplier
input double SymbolTPScaling_XAUUSD = 5.0;        // Gold TP scaling percentage

// News Filter Settings
input group "=== NEWS FILTER SETTINGS ==="
input bool EnableNewsFilter = true;                // Enable news filter
input int NewsPauseBefore = 10;                    // Minutes before news to pause
input int NewsPauseAfter = 5;                      // Minutes after news to resume
input ENUM_NEWS_IMPACT NewsImpactLevel = NEWS_IMPACT_HIGH; // Minimum impact level

// API and Configuration Settings
input group "=== API & CONFIGURATION SETTINGS ==="
input string APIBaseURL = "https://api.jamestradinggroup.com"; // API base URL
input string APIToken = "";                        // API authentication token
input int ConfigUpdateInterval = 60;               // Config update interval (seconds)
input int HeartbeatInterval = 30;                  // Heartbeat interval (seconds)
input bool AutoApplyTemplate = true;               // Auto-apply template settings
input bool ManualOverrideAllowed = true;           // Allow manual input override
input bool DailyProfitLock = false;                // Enable daily profit lock
input double DailyProfitTarget = 100.0;            // Daily profit target

// Advanced Settings
input group "=== ADVANCED SETTINGS ==="
input bool AllowAllSymbols = false;                // Allow all broker symbols
input bool EnableGold = true;                      // Enable gold trading logic
input bool DebugMode = false;                      // Enable debug logging
input int MaxRetries = 3;                          // Maximum API retry attempts
input int RetryDelay = 5;                          // Delay between retries (seconds)

// Original EA Settings (Legacy)
input group "=== ORIGINAL EA SETTINGS ==="
input int httpUpdateInterval = 86400;              // Update HTTP every 24 hours (86400 seconds)
input int fileUpdateInterval = 10;                 // Update file every 10 seconds

//+------------------------------------------------------------------+
//| GLOBAL VARIABLES
//+------------------------------------------------------------------+
// EA State Management
bool g_isInitialized = false;
bool g_isConnected = false;
bool g_isTradingAllowed = false;
datetime g_lastConfigUpdate = 0;
datetime g_lastHeartbeat = 0;
datetime g_lastNewsCheck = 0;
int g_configHash = 0;
string g_templateName = "";
int g_templateVersion = 0;

// API Communication
string g_apiEndpoint = "";
string g_authToken = "";
int g_apiRetryCount = 0;
datetime g_lastApiError = 0;

// Trading State
int g_totalOpenTrades = 0;
int g_totalPendingOrders = 0;
double g_dailyProfit = 0.0;
double g_weeklyProfit = 0.0;
double g_monthlyProfit = 0.0;
double g_totalProfit = 0.0;

// News Filter State
bool g_newsFilterActive = false;
datetime g_newsPauseStart = 0;
datetime g_newsPauseEnd = 0;
string g_blockedSymbols = "";

// Symbol Management
int g_eurSymbolsCount = 0;
int g_gbpSymbolsCount = 0;
int g_usdSymbolsCount = 0;
int g_jpySymbolsCount = 0;

// Configuration Cache
struct CONFIG_CACHE
{
    bool isLoaded;
    datetime lastUpdate;
    int version;
    string data;
};
CONFIG_CACHE g_configCache;

// Original EA Variables
datetime lastHttpUpdateTime = 0;
datetime lastFileUpdateTime = 0;

// NEW: Trading Strategy Variables
bool g_strategyEnabled = true;
datetime g_lastTradeTime = 0;
int g_minTradeInterval = 60; // Minimum seconds between trades
double g_currentLotSize = 0.01;
int g_currentStep = 1;
string g_currentSymbol = "";

// === MULTI-PAIR TRADING & ORDER MANAGEMENT ===
// Global variables for multi-pair trading
string g_allowedSymbols[] = {"GBPUSD", "EURUSD"}; // Configurable allowed pairs - reduced to 2 pairs
int g_maxSymbols = 2; // Maximum number of symbols to trade - reduced to 2
bool g_multiPairEnabled = true; // Enable/disable multi-pair trading

// Order management variables
int g_openOrders[]; // Array to track all open order tickets
int g_openOrderCount = 0; // Number of currently open orders
int g_maxOpenOrders = 10; // Maximum number of open orders across all pairs

// Martingale recovery system
struct MARTINGALE_GROUP
{
    int magicNumber;        // Unique identifier for this group
    string symbol;          // Symbol being traded
    int orderCount;         // Number of orders in this group (1, 2, 3, 4)
    double totalVolume;     // Total volume across all orders
    double averagePrice;    // Average entry price
    datetime firstOrderTime; // Time of first order
    bool isRecoveryMode;    // True if in recovery mode
};
MARTINGALE_GROUP g_martingaleGroups[]; // Array to track Martingale groups
int g_martingaleGroupCount = 0; // Number of active Martingale groups

// === AUTOMATIC ORDER CLOSING ===
// TP/SL management
double g_defaultTakeProfit = 50.0; // Default TP in pips
double g_defaultStopLoss = 30.0;   // Default SL in pips
bool g_useTrailingStop = true;     // Enable trailing stop
double g_trailingStop = 20.0;      // Trailing stop distance in pips

// === PHASE 3: TEMPLATE MANAGEMENT & ADVANCED CONFIGURATION ===

// === EXTERNAL CONFIGURATION ===
string g_configFileName = "EA_Config.json";
bool g_useExternalConfig = true;
datetime g_lastConfigFileCheck = 0;
int g_configCheckInterval = 300; // Check config every 5 minutes

// === TEMPLATE MANAGEMENT ===
string g_chartTemplate = "JamesTrading_Default.tpl";
bool g_autoApplyTemplate = true;
bool g_templateApplied = false;

// === ADVANCED TRADING SETTINGS ===
bool g_enableNewsFilter = false;
int g_newsFilterMinutes = 30; // Avoid trading 30 min before/after news
bool g_enableVolatilityFilter = true;
double g_minVolatility = 0.5; // Minimum volatility required
double g_maxVolatility = 5.0; // Maximum volatility allowed

// === PERFORMANCE ANALYTICS ===
int g_totalTrades = 0;
int g_winningTrades = 0;
int g_losingTrades = 0;
double g_largestWin = 0.0;
double g_largestLoss = 0.0;
datetime g_startTime = 0;

// === ADVANCED EXIT LOGIC ===
bool g_enableBreakEven = true;
double g_breakEvenPips = 10.0; // Move SL to break-even after 10 pips profit
bool g_enablePartialClose = false;
double g_partialClosePercent = 50.0; // Close 50% at first target
double g_partialCloseTarget = 20.0; // First target in pips

//+------------------------------------------------------------------+
//| EXPERT ADVISOR INITIALIZATION FUNCTION
//+------------------------------------------------------------------+
int OnInit()
{
    Print("=== James Trading EA Initialization ===");
    
    // SAFETY CHECK: Check for any existing orders before starting
    int existingOrders = OrdersTotal();
    if (existingOrders > 0)
    {
        Print("WARNING: Found ", existingOrders, " existing orders in terminal");
        Print("These orders will be managed by the EA if they match allowed symbols");
    }
    
    // Initialize global variables
    InitializeGlobalVariables();
    
    // Initialize API connection
    if (!InitializeAPI()) 
    {
        Print("Failed to initialize API - continuing without API features");
        g_authToken = ""; // Disable API features
    }
    
    // PHASE 3: Load external configuration
    if (g_useExternalConfig)
    {
        // Create default config file if it doesn't exist
        CreateDefaultConfigFile();
        LoadExternalConfiguration();
    }
    
    // PHASE 3: Apply chart template
    ApplyChartTemplate();
    
    // Initialize trading logic
    if (!InitializeTradingLogic()) 
    {
        Print("Failed to initialize trading logic");
        return INIT_FAILED;
    }
    
    // Set up timers
    SetUpTimers();
    
    // Set initialized flag
    g_isInitialized = true;
    
    // PHASE 3: Initialize performance tracking
    g_startTime = TimeCurrent();
    
    Print("EA initialized successfully");
    Print("Strategy Status: ", (g_strategyEnabled ? "ENABLED" : "DISABLED"));
    
    // Call original EA initialization
    WriteAccountData();
    
    return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| EXPERT ADVISOR DEINITIALIZATION FUNCTION
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
    Print("=== James Trading EA Deinitialization ===");
    Print("Reason: ", GetDeinitReasonText(reason));
    
    // CRITICAL SAFETY: Close all open orders when EA stops
    if (reason == REASON_REMOVE || reason == REASON_PROGRAM || reason == REASON_CHARTCLOSE)
    {
        Print("Terminal closing - Closing all open orders for safety...");
        CloseAllOpenOrders();
    }
    
    // Send final heartbeat if API is available
    if (g_authToken != "")
    {
        SendHeartbeat(true); // isShutdown = true
    }
    
    // Call original EA deinitialization
    WriteAccountData();
    
    // Clean up resources
    CleanupResources();
    
    Print("EA deinitialized successfully");
}

// === SAFETY FUNCTION: CLOSE ALL ORDERS ===
void CloseAllOpenOrders()
{
    int totalOrders = OrdersTotal();
    int closedCount = 0;
    
    Print("Closing ", totalOrders, " open orders...");
    
    for (int i = totalOrders - 1; i >= 0; i--)
    {
        if (OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
        {
            int ticket = OrderTicket();
            string symbol = OrderSymbol();
            double lots = OrderLots();
            int type = OrderType();
            
            // Get current price for closing
            double closePrice;
            if (type == ORDER_TYPE_BUY)
            {
                closePrice = MarketInfo(symbol, MODE_BID);
            }
            else
            {
                closePrice = MarketInfo(symbol, MODE_ASK);
            }
            
            // Close the order
            bool result = OrderClose(ticket, lots, closePrice, 3, clrRed);
            if (result)
            {
                closedCount++;
                Print("Closed order ", ticket, " (", symbol, ") successfully");
            }
            else
            {
                Print("Failed to close order ", ticket, " Error: ", GetLastError());
            }
        }
    }
    
    Print("Closed ", closedCount, " out of ", totalOrders, " orders");
    
    // Clear EA tracking arrays
    g_openOrderCount = 0;
    g_martingaleGroupCount = 0;
}

//+------------------------------------------------------------------+
//| EXPERT ADVISOR TICK FUNCTION
//+------------------------------------------------------------------+
void OnTick()
{
    // Check if EA is initialized
    if (!g_isInitialized) return;
    
    // Check if trading is allowed
    if (!g_isTradingAllowed) return;
    
    // Handle original EA file/HTTP updates
    HandlePeriodicTasks();
    
    // Execute new trading logic
    ExecuteTradingLogic();
}

//+------------------------------------------------------------------+
//| EXPERT ADVISOR TIMER FUNCTION
//+------------------------------------------------------------------+
void OnTimer()
{
    // Handle periodic tasks
    HandlePeriodicTasks();
}

//+------------------------------------------------------------------+
//| INITIALIZATION FUNCTIONS
//+------------------------------------------------------------------+
void InitializeGlobalVariables()
{
    // Initialize API variables
    g_apiEndpoint = APIBaseURL;
    g_authToken = APIToken;
    g_apiRetryCount = 0;
    g_lastApiError = 0;
    
    // Initialize trading state
    g_totalOpenTrades = 0;
    g_totalPendingOrders = 0;
    g_dailyProfit = 0.0;
    g_weeklyProfit = 0.0;
    g_monthlyProfit = 0.0;
    g_totalProfit = 0.0;
    
    // Initialize news filter state
    g_newsFilterActive = false;
    g_newsPauseStart = 0;
    g_newsPauseEnd = 0;
    g_blockedSymbols = "";
    
    // Initialize symbol management
    g_eurSymbolsCount = 0;
    g_gbpSymbolsCount = 0;
    g_usdSymbolsCount = 0;
    g_jpySymbolsCount = 0;
    
    // Initialize configuration cache
    g_configCache.isLoaded = false;
    g_configCache.lastUpdate = 0;
    g_configCache.version = 0;
    g_configCache.data = "";
    
    // Initialize original EA variables
    lastHttpUpdateTime = 0;
    lastFileUpdateTime = 0;
    
    // Initialize trading strategy variables
    g_strategyEnabled = true;
    g_lastTradeTime = 0;
    g_minTradeInterval = 60;
    g_currentLotSize = 0.01;
    g_currentStep = 1;
    g_currentSymbol = "";
    
    // Initialize multi-pair variables
    g_maxSymbols = 2;
    g_multiPairEnabled = true;
    g_openOrderCount = 0;
    g_maxOpenOrders = 10;
    g_martingaleGroupCount = 0;
    
    // Initialize TP/SL management
    g_defaultTakeProfit = 50.0;
    g_defaultStopLoss = 30.0;
    g_useTrailingStop = true;
    g_trailingStop = 20.0;
    
    // Initialize arrays properly
    ArrayResize(g_openOrders, g_maxOpenOrders);
    ArrayResize(g_martingaleGroups, 20);
    
    // Enable trading
    g_isTradingAllowed = true;
    
    Print("Global variables initialized");
}

bool ValidateInputParameters()
{
    // Validate lot sizes
    if(InitialLot <= 0 || InitialLot > 100)
    {
        Print("ERROR: InitialLot must be between 0.01 and 100");
        return false;
    }
    
    if(LotMultiplier <= 1.0 || LotMultiplier > 10.0)
    {
        Print("ERROR: LotMultiplier must be between 1.1 and 10.0");
        return false;
    }
    
    // Validate distances
    if(StepDistance < 5 || StepDistance > 1000)
    {
        Print("ERROR: StepDistance must be between 5 and 1000 pips");
        return false;
    }
    
    if(MinStepDistance < 1 || MinStepDistance >= StepDistance)
    {
        Print("ERROR: MinStepDistance must be between 1 and less than StepDistance");
        return false;
    }
    
    // Validate limits
    if(MaxTrades < 1 || MaxTrades > 20)
    {
        Print("ERROR: MaxTrades must be between 1 and 20");
        return false;
    }
    
    // Validate API settings
    if(StringLen(APIBaseURL) < 10)
    {
        Print("ERROR: Invalid API base URL");
        return false;
    }
    
    Print("Input parameters validated successfully");
    return true;
}

bool InitializeAPI()
{
    if (g_authToken == "") 
    {
        Print("No API token provided - API features disabled");
        return false;
    }
    
    // Test API connection
    if (!TestAPIConnection())
    {
        Print("API connection test failed");
        return false;
    }
    
    Print("API initialized successfully");
    return true;
}

bool InitializeTradingLogic()
{
    // Initialize symbol tracking
    InitializeSymbolTracking();
    
    // Initialize currency exposure
    InitializeCurrencyExposure();
    
    // Load existing trades
    LoadExistingTrades();
    
    // Initialize multi-pair trading
    InitializeMultiPairTrading();
    
    Print("Trading logic initialized successfully");
    Print("Symbols tracked: ", g_maxSymbols);
    Print("Multi-pair trading enabled: ", g_multiPairEnabled);
    
    return true;
}

void SetUpTimers()
{
    // Set timer for periodic tasks (every 1 second)
    EventSetTimer(1);
    Print("Timers set up successfully");
}

//+------------------------------------------------------------------+
//| TRADING LOGIC FUNCTIONS
//+------------------------------------------------------------------+
void ExecuteTradingLogic()
{
    if (!g_strategyEnabled) return;
    
    // Check minimum trade interval
    if (TimeCurrent() - g_lastTradeTime < g_minTradeInterval) return;
    
    // PHASE 3: Check advanced filters before trading
    if (IsNewsFilterActive())
    {
        Print("News filter active - trading paused");
        return;
    }
    
    // Log trading activity every 5 minutes (not every tick)
    static datetime lastActivityLog = 0;
    if (TimeCurrent() - lastActivityLog >= 300) // 5 minutes
    {
        Print("=== EA Activity Report ===");
        Print("Active trades: ", g_openOrderCount, "/", g_maxOpenOrders);
        
        // Explain why there are 0 active trades
        if (g_openOrderCount == 0)
        {
            int totalOrders = OrdersTotal();
            if (totalOrders == 0)
            {
                Print("Reason: No orders found in terminal");
                Print("Status: Waiting for new trading signals");
            }
            else
            {
                Print("Reason: Found ", totalOrders, " orders but none match allowed symbols");
                Print("Allowed symbols: GBPUSD, EURUSD only");
                Print("Status: Waiting for allowed symbol signals");
            }
        }
        else
        {
            Print("Status: Managing ", g_openOrderCount, " active trades");
        }
        
        Print("Martingale groups: ", g_martingaleGroupCount);
        Print("Current symbol: ", Symbol());
        Print("Market time: ", TimeToString(TimeCurrent()));
        Print("========================");
        
        // Display detailed trade information
        DisplayManagedTrades();
        
        lastActivityLog = TimeCurrent();
    }
    
    // Show what EA is doing while waiting
    static datetime lastWaitingLog = 0;
    if (g_openOrderCount == 0 && TimeCurrent() - lastWaitingLog >= 600) // 10 minutes
    {
        Print("=== EA Status: Waiting for Signals ===");
        Print("Monitoring GBPUSD and EURUSD for MACD signals");
        Print("Checking market conditions every tick");
        Print("Ready to place trades when conditions are met");
        Print("=====================================");
        lastWaitingLog = TimeCurrent();
    }
    
    // Check for trading signals on current chart
    CheckForTradingSignals();
    
    // NEW: Scan all pairs for trading opportunities
    ScanAllPairsForSignals();
    
    // NEW: Check Martingale recovery system
    CheckMartingaleRecovery();
    
    // NEW: Manage open orders (TP/SL, trailing stop)
    ManageOpenOrders();
    
    // PHASE 3: Advanced exit logic
    CheckAdvancedExitLogic();
    
    // Update trade counts and statistics
    UpdateTradeCounts();
    UpdateProfitStatistics();
    CheckForExitSignals();
    UpdateCurrencyExposure();
    
    // PHASE 3: Display performance report every hour
    static datetime lastPerformanceLog = 0;
    if (TimeCurrent() - lastPerformanceLog >= 3600) // 1 hour
    {
        DisplayPerformanceReport();
        lastPerformanceLog = TimeCurrent();
    }
}

// === MACD SIGNAL DETECTION FUNCTIONS ===
void CheckForTradingSignals()
{
    // Check for signals on current chart
    string currentSymbol = Symbol();
    
    if (!IsSymbolAllowed(currentSymbol)) return;
    
    // PHASE 3: Check volatility filter
    if (!IsVolatilityAcceptable(currentSymbol))
    {
        // Volatility filter active - signals skipped
        return;
    }
    
    // Get MACD values using iCustom
    double macd = iCustom(currentSymbol, PERIOD_H4, "MACD", MACD_FastEMA, MACD_SlowEMA, MACD_SignalSMA, 0, 0);
    double signal = iCustom(currentSymbol, PERIOD_H4, "MACD", MACD_FastEMA, MACD_SlowEMA, MACD_SignalSMA, 1, 0);
    double macd_prev = iCustom(currentSymbol, PERIOD_H4, "MACD", MACD_FastEMA, MACD_SlowEMA, MACD_SignalSMA, 0, 1);
    double signal_prev = iCustom(currentSymbol, PERIOD_H4, "MACD", MACD_FastEMA, MACD_SlowEMA, MACD_SignalSMA, 1, 1);
    
    // Check if we can open new trades
    if (CanOpenNewTrade(currentSymbol, ORDER_TYPE_BUY))
    {
        if (IsBuySignal(macd, signal, macd_prev, signal_prev, currentSymbol))
        {
            Print("BUY signal detected for ", currentSymbol, " - placing trade");
            OpenBuyTrade(currentSymbol, 0.01, 0, 0); // Will use Martingale logic
        }
    }
    else if (CanOpenNewTrade(currentSymbol, ORDER_TYPE_SELL))
    {
        if (IsSellSignal(macd, signal, macd_prev, signal_prev, currentSymbol))
        {
            Print("SELL signal detected for ", currentSymbol, " - placing trade");
            OpenSellTrade(currentSymbol, 0.01, 0, 0); // Will use Martingale logic
        }
    }
}

bool IsBuySignal(double macd, double signal, double macd_prev, double signal_prev, string symbol)
{
    // MACD crossover: MACD line crosses above Signal line
    if (macd_prev <= signal_prev && macd > signal)
    {
        // Additional confirmation: MACD is above zero
        if (macd > 0)
        {
            Print("BUY Signal detected for ", symbol, " - MACD crossover above zero");
            return true;
        }
    }
    return false;
}

bool IsSellSignal(double macd, double signal, double macd_prev, double signal_prev, string symbol)
{
    // MACD crossover: MACD line crosses below Signal line
    if (macd_prev >= signal_prev && macd < signal)
    {
        // Additional confirmation: MACD is below zero
        if (macd < 0)
        {
            Print("SELL Signal detected for ", symbol, " - MACD crossover below zero");
            return true;
        }
    }
    return false;
}

// === MULTI-PAIR TRADING FUNCTIONS ===
void ScanAllPairsForSignals()
{
    if (!g_multiPairEnabled) return;
    
    for (int i = 0; i < g_maxSymbols; i++)
    {
        string symbol = g_allowedSymbols[i];
        if (symbol == "") continue;
        
        // Check if we can trade this symbol
        if (!IsSymbolAllowed(symbol)) continue;
        
        // Check if we already have max orders for this symbol
        if (GetSymbolTradeCount(symbol) >= 2) continue; // Max 2 orders per symbol
        
        // Get MACD values for this symbol using iCustom
        double macd = iCustom(symbol, Period(), "MACD", MACD_FastEMA, MACD_SlowEMA, MACD_SignalSMA, PRICE_CLOSE, 0, 1);
        double signal = iCustom(symbol, Period(), "MACD", MACD_FastEMA, MACD_SlowEMA, MACD_SignalSMA, PRICE_CLOSE, 1, 1);
        double macd_prev = iCustom(symbol, Period(), "MACD", MACD_FastEMA, MACD_SlowEMA, MACD_SignalSMA, PRICE_CLOSE, 0, 2);
        double signal_prev = iCustom(symbol, Period(), "MACD", MACD_FastEMA, MACD_SlowEMA, MACD_SignalSMA, PRICE_CLOSE, 1, 2);
        
        if (macd != 0 && signal != 0 && macd_prev != 0 && signal_prev != 0)
        {
            // Check for trading signals
            if (IsBuySignal(macd, signal, macd_prev, signal_prev, symbol))
            {
                if (CanOpenNewTrade(symbol, ORDER_TYPE_BUY))
                {
                    OpenBuyTrade(symbol, 0.01, 0, 0); // Will use Martingale logic
                }
            }
            else if (IsSellSignal(macd, signal, macd_prev, signal_prev, symbol))
            {
                if (CanOpenNewTrade(symbol, ORDER_TYPE_SELL))
                {
                    OpenSellTrade(symbol, 0.01, 0, 0); // Will use Martingale logic
                }
            }
        }
    }
}

// === MARTINGALE RECOVERY SYSTEM ===
void CheckMartingaleRecovery()
{
    for (int i = 0; i < g_martingaleGroupCount; i++)
    {
        // Check if this group needs recovery
        if (g_martingaleGroups[i].isRecoveryMode && g_martingaleGroups[i].orderCount < 4) // Max 4 orders per group
        {
            // Calculate step distance based on current step
            double stepDistance = CalculateStepDistance(g_martingaleGroups[i].orderCount);
            
            // Check if price has moved enough for next step
            if (ShouldPlaceRecoveryOrder(i, stepDistance))
            {
                double lotSize = CalculateLotSize(g_martingaleGroups[i].symbol, g_martingaleGroups[i].orderCount);
                double tp = CalculateTakeProfit(g_martingaleGroups[i].symbol, g_martingaleGroups[i].averagePrice, g_martingaleGroups[i].orderCount);
                double sl = CalculateStopLoss(g_martingaleGroups[i].symbol, g_martingaleGroups[i].averagePrice, g_martingaleGroups[i].orderCount);
                
                // Place recovery order
                if (g_martingaleGroups[i].magicNumber % 2 == 0) // Even magic = BUY group
                {
                    int ticket = OrderSend(g_martingaleGroups[i].symbol, ORDER_TYPE_BUY, lotSize, Ask, 3, sl, tp, 
                                        "Martingale Step " + IntegerToString(g_martingaleGroups[i].orderCount + 1), 
                                        g_martingaleGroups[i].magicNumber, 0, clrRed);
                    if (ticket > 0)
                    {
                        g_martingaleGroups[i].orderCount++;
                        g_martingaleGroups[i].totalVolume += lotSize;
                        g_martingaleGroups[i].averagePrice = (g_martingaleGroups[i].averagePrice * (g_martingaleGroups[i].orderCount - 1) + Ask) / g_martingaleGroups[i].orderCount;
                        
                        // Add to open orders array
                        AddOpenOrder(ticket);
                        
                        Print("Martingale recovery order placed: ", g_martingaleGroups[i].symbol, " Step ", g_martingaleGroups[i].orderCount, 
                              " Lot: ", lotSize, " TP: ", tp, " SL: ", sl);
                    }
                }
                else // Odd magic = SELL group
                {
                    int ticket = OrderSend(g_martingaleGroups[i].symbol, ORDER_TYPE_SELL, lotSize, Bid, 3, sl, tp, 
                                        "Martingale Step " + IntegerToString(g_martingaleGroups[i].orderCount + 1), 
                                        g_martingaleGroups[i].magicNumber, 0, clrRed);
                    if (ticket > 0)
                    {
                        g_martingaleGroups[i].orderCount++;
                        g_martingaleGroups[i].totalVolume += lotSize;
                        g_martingaleGroups[i].averagePrice = (g_martingaleGroups[i].averagePrice * (g_martingaleGroups[i].orderCount - 1) + Bid) / g_martingaleGroups[i].orderCount;
                        
                        // Add to open orders array
                        AddOpenOrder(ticket);
                        
                        Print("Martingale recovery order placed: ", g_martingaleGroups[i].symbol, " Step ", g_martingaleGroups[i].orderCount, 
                              " Lot: ", lotSize, " TP: ", tp, " SL: ", sl);
                    }
                }
            }
        }
    }
}

bool ShouldPlaceRecoveryOrder(int groupIndex, double stepDistance)
{
    if (g_martingaleGroups[groupIndex].orderCount >= 4) return false; // Max 4 orders
    
    double currentPrice = (g_martingaleGroups[groupIndex].magicNumber % 2 == 0) ? Ask : Bid;
    double priceDiff = MathAbs(currentPrice - g_martingaleGroups[groupIndex].averagePrice);
    
    // Convert step distance to price difference
    double stepPrice = stepDistance * MarketInfo(g_martingaleGroups[groupIndex].symbol, MODE_POINT) * 10; // Convert pips to price
    
    return priceDiff >= stepPrice;
}

double CalculateStepDistance(int currentStep)
{
    switch(currentStep)
    {
        case 1: return 20.0; // 20 pips for step 2
        case 2: return 30.0; // 30 pips for step 3
        case 3: return 40.0; // 40 pips for step 4
        default: return 50.0; // Default 50 pips
    }
}

// === AUTOMATIC ORDER CLOSING ===
void ManageOpenOrders()
{
    for (int i = 0; i < g_openOrderCount; i++)
    {
        int ticket = g_openOrders[i];
        if (!OrderSelect(ticket, SELECT_BY_TICKET)) continue;
        
        string symbol = OrderSymbol();
        double openPrice = OrderOpenPrice();
        double currentPrice = (OrderType() == ORDER_TYPE_BUY) ? MarketInfo(symbol, MODE_BID) : MarketInfo(symbol, MODE_ASK);
        double currentSL = OrderStopLoss();
        double currentTP = OrderTakeProfit();
        
        // Log trade management every 2 minutes per trade
        static datetime lastTradeLog[]; // Array to track last log time for each trade
        if (ArraySize(lastTradeLog) <= i) ArrayResize(lastTradeLog, i + 1);
        
        if (TimeCurrent() - lastTradeLog[i] >= 120) // 2 minutes
        {
            Print("Managing trade ", ticket, " (", symbol, "): Price=", DoubleToString(currentPrice, 5), 
                  " SL=", DoubleToString(currentSL, 5), " TP=", DoubleToString(currentTP, 5));
            lastTradeLog[i] = TimeCurrent();
        }
        
        // Check if order should be closed
        bool shouldClose = false;
        
        // Check take profit
        if (OrderType() == ORDER_TYPE_BUY && currentPrice >= currentTP && currentTP > 0)
        {
            shouldClose = true;
            Print("Closing BUY trade ", ticket, " at TP: ", DoubleToString(currentPrice, 5));
        }
        else if (OrderType() == ORDER_TYPE_SELL && currentPrice <= currentTP && currentTP > 0)
        {
            shouldClose = true;
            Print("Closing SELL trade ", ticket, " at TP: ", DoubleToString(currentPrice, 5));
        }
        
        // Check stop loss
        if (OrderType() == ORDER_TYPE_BUY && currentPrice <= currentSL && currentSL > 0)
        {
            shouldClose = true;
            Print("Closing BUY trade ", ticket, " at SL: ", DoubleToString(currentPrice, 5));
        }
        else if (OrderType() == ORDER_TYPE_SELL && currentPrice >= currentSL && currentSL > 0)
        {
            shouldClose = true;
            Print("Closing SELL trade ", ticket, " at SL: ", DoubleToString(currentPrice, 5));
        }
        
        // Close order if needed
        if (shouldClose)
        {
            bool result = OrderClose(ticket, OrderLots(), currentPrice, 3, clrRed);
            if (result)
            {
                Print("Trade ", ticket, " closed successfully");
                RemoveOpenOrder(i);
                UpdateMartingaleGroupOnClose(ticket);
                i--; // Adjust index after removal
            }
            else
            {
                Print("Failed to close trade ", ticket, " Error: ", GetLastError());
            }
            continue;
        }
        
        // Apply trailing stop if enabled
        if (g_useTrailingStop && !shouldClose)
        {
            if (IsTrailingStopAllowed(symbol))
            {
                ApplyTrailingStop(ticket, symbol, openPrice, currentPrice);
            }
        }
    }
}

void ApplyTrailingStop(int ticket, string symbol, double openPrice, double currentPrice)
{
    if (!OrderSelect(ticket, SELECT_BY_TICKET)) return;
    
    double currentSL = OrderStopLoss();
    double newSL = 0;
    double point = MarketInfo(symbol, MODE_POINT);
    double minStopLevel = MarketInfo(symbol, MODE_STOPLEVEL) * point; // Minimum stop level in points
    double trailingDistance = g_trailingStop * point * 10; // Convert pips to price
    
    // Ensure trailing distance is at least minimum stop level
    if (trailingDistance < minStopLevel)
    {
        trailingDistance = minStopLevel * 1.5; // Add 50% buffer
    }
    
    if (OrderType() == ORDER_TYPE_BUY)
    {
        if (currentPrice > openPrice + trailingDistance)
        {
            newSL = currentPrice - trailingDistance;
            
            // Validate new stop loss
            if (newSL > currentSL && (currentSL == 0 || newSL > currentSL + minStopLevel))
            {
                // Ensure new SL is not too close to current price
                if (currentPrice - newSL >= minStopLevel)
                {
                    bool result = OrderModify(ticket, openPrice, newSL, OrderTakeProfit(), 0, clrBlue);
                    if (!result)
                    {
                        int error = GetLastError();
                        if (error != 130) // Don't log error 130 (invalid stops)
                        {
                            Print("Failed to modify trailing stop for ticket ", ticket, " Error: ", error);
                        }
                    }
                }
            }
        }
    }
    else if (OrderType() == ORDER_TYPE_SELL)
    {
        if (currentPrice < openPrice - trailingDistance)
        {
            newSL = currentPrice + trailingDistance;
            
            // Validate new stop loss
            if (newSL < currentSL && (currentSL == 0 || newSL < currentSL - minStopLevel))
            {
                // Ensure new SL is not too close to current price
                if (newSL - currentPrice >= minStopLevel)
                {
                    bool result = OrderModify(ticket, openPrice, newSL, OrderTakeProfit(), 0, clrBlue);
                    if (!result)
                    {
                        int error = GetLastError();
                        if (error != 130) // Don't log error 130 (invalid stops)
                        {
                            Print("Failed to modify trailing stop for ticket ", ticket, " Error: ", error);
                        }
                    }
                }
            }
        }
    }
}

// === ORDER TRACKING FUNCTIONS ===
void AddOpenOrder(int ticket)
{
    if (g_openOrderCount < g_maxOpenOrders)
    {
        g_openOrders[g_openOrderCount] = ticket;
        g_openOrderCount++;
    }
}

void RemoveOpenOrder(int ticket)
{
    for (int i = 0; i < g_openOrderCount; i++)
    {
        if (g_openOrders[i] == ticket)
        {
            // Shift remaining orders
            for (int j = i; j < g_openOrderCount - 1; j++)
            {
                g_openOrders[j] = g_openOrders[j + 1];
            }
            g_openOrderCount--;
            break;
        }
    }
}

void UpdateMartingaleGroupOnClose(int ticket)
{
    if (!OrderSelect(ticket, SELECT_BY_TICKET)) return;
    
    int magic = OrderMagicNumber();
    
    for (int i = 0; i < g_martingaleGroupCount; i++)
    {
        if (g_martingaleGroups[i].magicNumber == magic)
        {
            // Check if all orders in this group are closed
            bool allClosed = true;
            for (int j = 0; j < g_openOrderCount; j++)
            {
                if (OrderSelect(g_openOrders[j], SELECT_BY_TICKET))
                {
                    if (OrderMagicNumber() == magic)
                    {
                        allClosed = false;
                        break;
                    }
                }
            }
            
            if (allClosed)
            {
                // Remove this group
                for (int j = i; j < g_martingaleGroupCount - 1; j++)
                {
                    g_martingaleGroups[j] = g_martingaleGroups[j + 1];
                }
                g_martingaleGroupCount--;
                Print("Martingale group completed and removed: ", magic);
            }
            break;
        }
    }
}

//+------------------------------------------------------------------+
//| TRADE MANAGEMENT FUNCTIONS
//+------------------------------------------------------------------+
// === SYMBOL VALIDATION & TRADE COUNTING ===
bool IsSymbolAllowed(string symbol)
{
    // Check if symbol is in allowed list
    for (int i = 0; i < g_maxSymbols; i++)
    {
        if (g_allowedSymbols[i] == symbol) return true;
    }
    return false;
}

int GetSymbolTradeCount(string symbol)
{
    int count = 0;
    for (int i = 0; i < g_openOrderCount; i++)
    {
        if (OrderSelect(g_openOrders[i], SELECT_BY_TICKET))
        {
            if (OrderSymbol() == symbol) count++;
        }
    }
    return count;
}

bool CanOpenNewTrade(string symbol, int orderType)
{
    // Check if we have max open orders
    if (g_openOrderCount >= g_maxOpenOrders) return false;
    
    // Check if we have max orders for this symbol
    if (GetSymbolTradeCount(symbol) >= 2) return false;
    
    // Check if trading is allowed
    if (!g_strategyEnabled) return false;
    
    // Check if enough time has passed
    if (TimeCurrent() - g_lastTradeTime < g_minTradeInterval) return false;
    
    return true;
}

// === MARTINGALE CALCULATION FUNCTIONS ===
double CalculateLotSize(string symbol, int step)
{
    double baseLot = 0.01;
    double multiplier = 2.0; // Double the lot size for each step
    
    switch(step)
    {
        case 0: return baseLot;      // Step 1: 0.01
        case 1: return baseLot * multiplier;      // Step 2: 0.02
        case 2: return baseLot * multiplier * multiplier;      // Step 3: 0.04
        case 3: return baseLot * multiplier * multiplier * multiplier;      // Step 4: 0.08
        default: return baseLot * multiplier * multiplier * multiplier;      // Max: 0.08
    }
}

double CalculateTakeProfit(string symbol, double averagePrice, int step)
{
    double baseTP = g_defaultTakeProfit;
    double scaling = 1.0 + (step * 0.2); // Increase TP by 20% for each step
    
    if (step == 0) return averagePrice + (baseTP * MarketInfo(symbol, MODE_POINT) * 10);
    
    // For recovery trades, use average price
    return averagePrice + (baseTP * scaling * MarketInfo(symbol, MODE_POINT) * 10);
}

double CalculateStopLoss(string symbol, double averagePrice, int step)
{
    double baseSL = g_defaultStopLoss;
    double scaling = 1.0 + (step * 0.1); // Increase SL by 10% for each step
    
    if (step == 0) return averagePrice - (baseSL * MarketInfo(symbol, MODE_POINT) * 10);
    
    // For recovery trades, use average price
    return averagePrice - (baseSL * scaling * MarketInfo(symbol, MODE_POINT) * 10);
}

void OpenBuyTrade(string symbol, double lots, double tp, double sl)
{
    if (!IsSymbolAllowed(symbol)) return;
    
    // Calculate proper TP/SL if not provided
    if (tp == 0) tp = Ask + (g_defaultTakeProfit * MarketInfo(symbol, MODE_POINT) * 10);
    if (sl == 0) sl = Ask - (g_defaultStopLoss * MarketInfo(symbol, MODE_POINT) * 10);
    
    // Generate unique magic number for this trade group
    int magicNumber = (int)(TimeCurrent() * 1000) % 1000000; // 6-digit unique number
    if (magicNumber % 2 != 0) magicNumber++; // Ensure even for BUY orders
    
    int ticket = OrderSend(symbol, ORDER_TYPE_BUY, lots, Ask, 3, sl, tp, 
                          "MACD Buy Signal", magicNumber, 0, clrBlue);
    
    if (ticket > 0)
    {
        // Add to open orders tracking
        AddOpenOrder(ticket);
        
        // Create new Martingale group
        if (g_martingaleGroupCount < 20)
        {
            g_martingaleGroups[g_martingaleGroupCount].magicNumber = magicNumber;
            g_martingaleGroups[g_martingaleGroupCount].symbol = symbol;
            g_martingaleGroups[g_martingaleGroupCount].orderCount = 1;
            g_martingaleGroups[g_martingaleGroupCount].totalVolume = lots;
            g_martingaleGroups[g_martingaleGroupCount].averagePrice = Ask;
            g_martingaleGroups[g_martingaleGroupCount].firstOrderTime = TimeCurrent();
            g_martingaleGroups[g_martingaleGroupCount].isRecoveryMode = false;
            g_martingaleGroupCount++;
        }
        
        g_lastTradeTime = TimeCurrent();
        Print("Buy order opened: ", symbol, " Lot: ", lots, " TP: ", tp, " SL: ", sl, " Magic: ", magicNumber);
    }
    else
    {
        Print("Failed to open buy order: ", symbol, " Error: ", GetLastError());
    }
}

void OpenSellTrade(string symbol, double lots, double tp, double sl)
{
    if (!IsSymbolAllowed(symbol)) return;
    
    // Calculate proper TP/SL if not provided
    if (tp == 0) tp = Bid - (g_defaultTakeProfit * MarketInfo(symbol, MODE_POINT) * 10);
    if (sl == 0) sl = Bid + (g_defaultStopLoss * MarketInfo(symbol, MODE_POINT) * 10);
    
    // Generate unique magic number for this trade group
    int magicNumber = (int)(TimeCurrent() * 1000) % 1000000; // 6-digit unique number
    if (magicNumber % 2 == 0) magicNumber++; // Ensure odd for SELL orders
    
    int ticket = OrderSend(symbol, ORDER_TYPE_SELL, lots, Bid, 3, sl, tp, 
                          "MACD Sell Signal", magicNumber, 0, clrRed);
    
    if (ticket > 0)
    {
        // Add to open orders tracking
        AddOpenOrder(ticket);
        
        // Create new Martingale group
        if (g_martingaleGroupCount < 20)
        {
            g_martingaleGroups[g_martingaleGroupCount].magicNumber = magicNumber;
            g_martingaleGroups[g_martingaleGroupCount].symbol = symbol;
            g_martingaleGroups[g_martingaleGroupCount].orderCount = 1;
            g_martingaleGroups[g_martingaleGroupCount].totalVolume = lots;
            g_martingaleGroups[g_martingaleGroupCount].averagePrice = Bid;
            g_martingaleGroups[g_martingaleGroupCount].firstOrderTime = TimeCurrent();
            g_martingaleGroups[g_martingaleGroupCount].isRecoveryMode = false;
            g_martingaleGroupCount++;
        }
        
        g_lastTradeTime = TimeCurrent();
        Print("Sell order opened: ", symbol, " Lot: ", lots, " TP: ", tp, " SL: ", sl, " Magic: ", magicNumber);
    }
    else
    {
        Print("Failed to open sell order: ", symbol, " Error: ", GetLastError());
    }
}

// === TRADE TRACKING & STATISTICS FUNCTIONS ===
void UpdateTradeCounts()
{
    g_totalOpenTrades = g_openOrderCount;
    g_totalPendingOrders = 0; // Count pending orders if needed
}

void UpdateProfitStatistics()
{
    double totalProfit = 0.0;
    
    // Calculate profit from open orders
    for (int i = 0; i < g_openOrderCount; i++)
    {
        if (OrderSelect(g_openOrders[i], SELECT_BY_TICKET))
        {
            totalProfit += OrderProfit() + OrderSwap() + OrderCommission();
        }
    }
    
    g_totalProfit = totalProfit;
    
    // Update daily profit (simplified - you can enhance this)
    static datetime lastDailyReset = 0;
    if (lastDailyReset == 0 || TimeDay(lastDailyReset) != TimeDay(TimeCurrent()))
    {
        g_dailyProfit = 0.0;
        lastDailyReset = TimeCurrent();
    }
    g_dailyProfit = totalProfit;
}

void CheckForExitSignals()
{
    // This function checks for manual exit signals
    // Currently handled by ManageOpenOrders() for automatic TP/SL
}

void UpdateCurrencyExposure()
{
    // Simplified currency exposure tracking
    // You can enhance this based on your requirements
}

// === SYMBOL TRACKING FUNCTIONS ===
void UpdateSymbolTracking(string symbol, double lots, double price, double profit)
{
    // Simplified symbol tracking
    // You can enhance this based on your requirements
}

// === TRADE INFORMATION DISPLAY ===
void DisplayManagedTrades()
{
    if (g_openOrderCount == 0)
    {
        Print("No trades being managed by EA");
        return;
    }
    
    Print("=== EA Managed Trades ===");
    for (int i = 0; i < g_openOrderCount; i++)
    {
        int ticket = g_openOrders[i];
        if (OrderSelect(ticket, SELECT_BY_TICKET))
        {
            string symbol = OrderSymbol();
            double openPrice = OrderOpenPrice();
            double currentPrice = (OrderType() == ORDER_TYPE_BUY) ? MarketInfo(symbol, MODE_BID) : MarketInfo(symbol, MODE_ASK);
            double sl = OrderStopLoss();
            double tp = OrderTakeProfit();
            double profit = OrderProfit();
            double lots = OrderLots();
            int type = OrderType();
            
            string orderType = (type == ORDER_TYPE_BUY) ? "BUY" : "SELL";
            
            Print("Trade ", i+1, ": ", symbol, " ", orderType, " Lot:", DoubleToString(lots, 2), 
                  " Open:", DoubleToString(openPrice, 5), " Current:", DoubleToString(currentPrice, 5),
                  " SL:", DoubleToString(sl, 5), " TP:", DoubleToString(tp, 5), " Profit:", DoubleToString(profit, 2));
        }
    }
    Print("========================");
}

//+------------------------------------------------------------------+
//| INITIALIZATION HELPER FUNCTIONS
//+------------------------------------------------------------------+
void InitializeSymbolTracking()
{
    // Initialize symbol tracking arrays
    // This is a placeholder - you can enhance based on your requirements
    Print("Symbol tracking initialized");
}

void InitializeCurrencyExposure()
{
    // Initialize currency exposure tracking
    // This is a placeholder - you can enhance based on your requirements
    Print("Currency exposure tracking initialized");
}

void LoadExistingTrades()
{
    // Load existing open trades into tracking system
    g_openOrderCount = 0;
    int totalOrdersFound = OrdersTotal();
    
    Print("=== Trade Loading Analysis ===");
    Print("Total orders found in terminal: ", totalOrdersFound);
    
    // Make sure array is initialized
    if (ArraySize(g_openOrders) < g_maxOpenOrders)
    {
        ArrayResize(g_openOrders, g_maxOpenOrders);
    }
    
    if (totalOrdersFound == 0)
    {
        Print("No orders found - terminal is clean");
        Print("EA will wait for new trading signals");
    }
    else
    {
        Print("Analyzing found orders...");
        
        for(int i = 0; i < totalOrdersFound; i++)
        {
            if(OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
            {
                string symbol = OrderSymbol();
                int ticket = OrderTicket();
                double lots = OrderLots();
                int type = OrderType();
                string orderType = (type == ORDER_TYPE_BUY) ? "BUY" : "SELL";
                
                Print("Order ", i+1, ": ", symbol, " ", orderType, " Lot:", DoubleToString(lots, 2), " Ticket:", ticket);
                
                // Only load trades that match our allowed symbols
                if (IsSymbolAllowed(symbol) && g_openOrderCount < g_maxOpenOrders)
                {
                    g_openOrders[g_openOrderCount] = ticket;
                    g_openOrderCount++;
                    Print("  -> LOADED: Matches allowed symbols");
                }
                else
                {
                    if (!IsSymbolAllowed(symbol))
                    {
                        Print("  -> SKIPPED: Symbol not allowed (EA trades GBPUSD, EURUSD only)");
                    }
                    else
                    {
                        Print("  -> SKIPPED: Maximum orders reached (", g_maxOpenOrders, ")");
                    }
                }
            }
        }
    }
    
    Print("Final result: ", g_openOrderCount, " allowed trades loaded out of ", totalOrdersFound, " total orders");
    Print("================================");
}

// === MULTI-PAIR TRADING INITIALIZATION ===
void InitializeMultiPairTrading()
{
    // Arrays are already initialized in InitializeGlobalVariables
    
    // Load allowed symbols from configuration
    LoadAllowedSymbols();
    
    Print("Multi-pair trading initialized. Allowed symbols: ", g_maxSymbols, " (GBPUSD, EURUSD)");
}

void LoadAllowedSymbols()
{
    // This can be loaded from external configuration or API
    // For now, using 2 major pairs for focused trading
    g_allowedSymbols[0] = "GBPUSD";
    g_allowedSymbols[1] = "EURUSD";
}

//+------------------------------------------------------------------+
//| API COMMUNICATION FUNCTIONS
//+------------------------------------------------------------------+
bool TestAPIConnection()
{
    // Placeholder for API connection test
    // You can implement actual API testing here
    return true;
}

bool LoadConfiguration()
{
    // Placeholder for configuration loading
    // You can implement actual configuration loading here
    return true;
}

void SendHeartbeat(bool isShutdown)
{
    // Placeholder for heartbeat sending
    // You can implement actual heartbeat sending here
}

//+------------------------------------------------------------------+
//| UTILITY FUNCTIONS
//+------------------------------------------------------------------+
void HandlePeriodicTasks()
{
    // Handle original EA file/HTTP updates
    if(TimeCurrent() - lastFileUpdateTime >= fileUpdateInterval)
    {
        WriteFileData();
        lastFileUpdateTime = TimeCurrent();
    }
    
    if(TimeCurrent() - lastHttpUpdateTime >= httpUpdateInterval)
    {
        WriteHttpData();
        lastHttpUpdateTime = TimeCurrent();
    }
    
    // New advanced logic - Update configuration if needed (only if API token provided)
    if(g_authToken != "" && TimeCurrent() - g_lastConfigUpdate >= ConfigUpdateInterval)
    {
        LoadConfiguration();
        g_lastConfigUpdate = TimeCurrent();
    }
    
    // PHASE 3: Reload external configuration periodically
    if(g_useExternalConfig && TimeCurrent() - g_lastConfigFileCheck >= g_configCheckInterval)
    {
        LoadExternalConfiguration();
        g_lastConfigFileCheck = TimeCurrent();
    }
    
    // New advanced logic - Send heartbeat (only if API token provided)
    if(g_authToken != "" && TimeCurrent() - g_lastHeartbeat >= HeartbeatInterval)
    {
        SendHeartbeat(false);
        g_lastHeartbeat = TimeCurrent();
    }
    
    // New advanced logic - Check news filter
    if(EnableNewsFilter && TimeCurrent() - g_lastNewsCheck >= 60)
    {
        CheckNewsFilter();
        g_lastNewsCheck = TimeCurrent();
    }
}

void CheckNewsFilter()
{
    // Placeholder for news filter logic
    // You can implement actual news filtering here
}

void CleanupResources()
{
    // Clean up any resources
    // if (g_macdHandle != INVALID_HANDLE) // Removed MACD handle cleanup
    // {
    //     IndicatorRelease(g_macdHandle);
    // }
}

string GetDeinitReasonText(int reason)
{
    switch(reason)
    {
        case REASON_PROGRAM: return "Program terminated";
        case REASON_REMOVE: return "EA removed from chart";
        case REASON_RECOMPILE: return "EA recompiled";
        case REASON_CHARTCHANGE: return "Chart symbol or timeframe changed";
        case REASON_CHARTCLOSE: return "Chart closed";
        case REASON_PARAMETERS: return "Input parameters changed";
        case REASON_ACCOUNT: return "Account changed";
        default: return "Unknown reason";
    }
}

//+------------------------------------------------------------------+
//| ORIGINAL EA FUNCTIONS (PRESERVED)
//+------------------------------------------------------------------+
void WriteAccountData()
{
    // Original EA function for writing account data
    string json = CreateAccountDataJSON();
    SaveToFile(json);
    SendToDatabase(json);
}

void WriteFileData()
{
    // Original EA function for writing file data
    string jsonData = CreateAccountDataJSON();
    SaveToFile(jsonData);
}

void WriteHttpData()
{
    // Original EA function for writing HTTP data
    string jsonData = CreateAccountDataJSON();
    SendHttpRequest(jsonData);
}

void SaveToFile(string data)
{
    // Original EA function for saving to file
    string filename = "account_data.json";
    int fileHandle = FileOpen(filename, FILE_WRITE | FILE_TXT);
    if (fileHandle != INVALID_HANDLE)
    {
        FileWriteString(fileHandle, data);
        FileClose(fileHandle);
    }
}

void SendToDatabase(string data)
{
    // Original EA function for sending to database
    Print("Sending to database: ", data);
}

void SendHttpRequest(string data)
{
    // Original EA function for sending HTTP request
    Print("Sending HTTP request: ", data);
}

string CreateAccountDataJSON()
{
    // Original EA function for creating account data JSON
    string json = "{";
    json += "\"account_id\":\"" + IntegerToString(AccountNumber()) + "\",";
    json += "\"login\":\"" + IntegerToString(AccountNumber()) + "\",";
    json += "\"balance\":\"" + DoubleToString(AccountBalance(), 2) + "\",";
    json += "\"equity\":\"" + DoubleToString(AccountEquity(), 2) + "\",";
    json += "\"margin\":\"" + DoubleToString(AccountMargin(), 2) + "\",";
    json += "\"free_margin\":\"" + DoubleToString(AccountFreeMargin(), 2) + "\",";
    json += "\"profit\":\"" + DoubleToString(AccountProfit(), 2) + "\",";
    json += "\"server\":\"" + AccountInfoString(ACCOUNT_SERVER) + "\",";
    json += "\"currency\":\"" + AccountInfoString(ACCOUNT_CURRENCY) + "\",";
    json += "\"timestamp\":\"" + TimeToString(TimeCurrent()) + "\"";
    json += "}";
    return json;
}

void PrintAccountInfo()
{
    // Original EA function for printing account info
    Print("Account: ", AccountNumber());
    Print("Balance: ", AccountBalance());
    Print("Equity: ", AccountEquity());
    Print("Profit: ", AccountProfit());
}

//+------------------------------------------------------------------+
//| END OF EXPERT ADVISOR
//+------------------------------------------------------------------+

// === TRAILING STOP VALIDATION ===
bool IsTrailingStopAllowed(string symbol)
{
    double minStopLevel = MarketInfo(symbol, MODE_STOPLEVEL);
    double point = MarketInfo(symbol, MODE_POINT);
    double minDistance = minStopLevel * point;
    
    // Check if our trailing stop distance meets broker requirements
    if (g_trailingStop * point * 10 < minDistance)
    {
        Print("Warning: Trailing stop distance (", g_trailingStop, " pips) is below broker minimum (", 
              DoubleToString(minDistance / point / 10, 1), " pips) for ", symbol);
        return false;
    }
    
    return true;
}

// === TEMPLATE MANAGEMENT FUNCTIONS ===
bool ApplyChartTemplate()
{
    if (!g_autoApplyTemplate) return false;
    
    string templatePath = g_chartTemplate;
    
    // Check if template file exists
    if (!FileIsExist(templatePath, FILE_COMMON))
    {
        Print("Template not found: ", templatePath, " - Creating default template...");
        CreateDefaultTemplate();
        return false;
    }
    
    // Apply template
    bool result = ChartApplyTemplate(0, templatePath);
    if (result)
    {
        g_templateApplied = true;
        Print("Chart template applied successfully: ", templatePath);
        return true;
    }
    else
    {
        Print("Failed to apply template: ", templatePath, " Error: ", GetLastError());
        return false;
    }
}

void CreateDefaultTemplate()
{
    Print("Creating default James Trading template...");
    
    // Set default chart properties
    ChartSetInteger(0, CHART_SHOW_GRID, true);
    ChartSetInteger(0, CHART_SHOW_VOLUMES, CHART_VOLUME_TICK);
    ChartSetInteger(0, CHART_COLOR_BACKGROUND, clrWhite);
    ChartSetInteger(0, CHART_COLOR_FOREGROUND, clrBlack);
    ChartSetInteger(0, CHART_COLOR_GRID, clrLightGray);
    ChartSetInteger(0, CHART_COLOR_CHART_UP, clrGreen);
    ChartSetInteger(0, CHART_COLOR_CHART_DOWN, clrRed);
    
    Print("Default template created and applied");
}

// === EXTERNAL CONFIGURATION FUNCTIONS ===
bool LoadExternalConfiguration()
{
    if (!g_useExternalConfig) return false;
    
    string configPath = g_configFileName;
    
    // Check if config file exists in the same directory as account_data.json
    if (!FileIsExist(configPath, FILE_TXT))
    {
        Print("Config file not found: ", configPath, " - Using default settings");
        return false;
    }
    
    // Load and parse JSON config
    int fileHandle = FileOpen(configPath, FILE_READ | FILE_TXT);
    if (fileHandle == INVALID_HANDLE)
    {
        Print("Failed to open config file: ", configPath);
        return false;
    }
    
    string configData = "";
    while (!FileIsEnding(fileHandle))
    {
        configData += FileReadString(fileHandle);
    }
    FileClose(fileHandle);
    
    // Check if configuration has changed (simple hash check)
    int newHash = StringGetHash(configData);
    if (newHash == g_configHash && g_configCache.isLoaded)
    {
        return true; // No changes, skip reload
    }
    
    // Parse configuration (simplified JSON parsing)
    if (ParseConfiguration(configData))
    {
        g_configHash = newHash;
        g_configCache.isLoaded = true;
        g_configCache.lastUpdate = TimeCurrent();
        g_configCache.data = configData;
        Print("External configuration reloaded successfully");
        return true;
    }
    else
    {
        Print("Failed to parse configuration file");
        return false;
    }
}

bool ParseConfiguration(string configData)
{
    // Simple JSON parsing for key settings
    // In a real implementation, you might use a proper JSON library
    
    // Example: Update news filter settings
    if (StringFind(configData, "\"newsFilterEnabled\":true") >= 0)
    {
        g_enableNewsFilter = true;
        Print("News filter enabled from config");
    }
    
    // Example: Update volatility settings
    if (StringFind(configData, "\"volatilityFilterEnabled\":true") >= 0)
    {
        g_enableVolatilityFilter = true;
        Print("Volatility filter enabled from config");
    }
    
    return true;
}

void CreateDefaultConfigFile()
{
    string configPath = g_configFileName;
    
    // Check if config file already exists
    if (FileIsExist(configPath, FILE_TXT))
    {
        return; // File already exists, no need to create
    }
    
    // Create default configuration JSON
    string configData = "{";
    configData += "\"version\":\"1.0\",";
    configData += "\"newsFilterEnabled\":false,";
    configData += "\"volatilityFilterEnabled\":true,";
    configData += "\"minVolatility\":0.5,";
    configData += "\"maxVolatility\":5.0,";
    configData += "\"enableBreakEven\":true,";
    configData += "\"breakEvenPips\":10.0,";
    configData += "\"enablePartialClose\":false,";
    configData += "\"partialClosePercent\":50.0,";
    configData += "\"partialCloseTarget\":20.0,";
    configData += "\"allowedSymbols\":[\"GBPUSD\",\"EURUSD\"],";
    configData += "\"maxOpenOrders\":10,";
    configData += "\"defaultTakeProfit\":50.0,";
    configData += "\"defaultStopLoss\":30.0,";
    configData += "\"useTrailingStop\":true,";
    configData += "\"trailingStop\":20.0,";
    configData += "\"created\":\"" + TimeToString(TimeCurrent()) + "\"";
    configData += "}";
    
    // Write config file to same directory as account_data.json
    int fileHandle = FileOpen(configPath, FILE_WRITE | FILE_TXT);
    if (fileHandle != INVALID_HANDLE)
    {
        FileWriteString(fileHandle, configData);
        FileClose(fileHandle);
        Print("Default EA_Config.json created successfully");
    }
    else
    {
        Print("Failed to create EA_Config.json file");
    }
}

// === ADVANCED TRADING FILTERS ===
bool IsNewsFilterActive()
{
    if (!g_enableNewsFilter) return false;
    
    // Placeholder for news filter logic
    // In real implementation, you would check economic calendar
    // For now, we'll use a simple time-based filter
    
    int currentHour = TimeHour(TimeCurrent());
    int currentMinute = TimeMinute(TimeCurrent());
    
    // Avoid trading during major news times (example: 8:30 AM, 2:00 PM)
    if ((currentHour == 8 && currentMinute >= 25 && currentMinute <= 35) ||
        (currentHour == 14 && currentMinute >= 55 && currentMinute <= 5))
    {
        return true; // News filter active
    }
    
    return false; // Safe to trade
}

bool IsVolatilityAcceptable(string symbol)
{
    if (!g_enableVolatilityFilter) return true;
    
    // Calculate current volatility (ATR-based)
    double atr = iATR(symbol, PERIOD_H4, 14, 0);
    double atrPips = atr / (MarketInfo(symbol, MODE_POINT) * 10);
    
    if (atrPips >= g_minVolatility && atrPips <= g_maxVolatility)
    {
        return true; // Volatility is acceptable
    }
    
    return false; // Volatility outside acceptable range
}

// === PERFORMANCE ANALYTICS ===
void UpdatePerformanceStats(double tradeProfit, bool isWin)
{
    g_totalProfit += tradeProfit;
    g_totalTrades++;
    
    if (isWin)
    {
        g_winningTrades++;
        if (tradeProfit > g_largestWin)
        {
            g_largestWin = tradeProfit;
        }
    }
    else
    {
        g_losingTrades++;
        if (MathAbs(tradeProfit) > g_largestLoss)
        {
            g_largestLoss = MathAbs(tradeProfit);
        }
    }
}

void DisplayPerformanceReport()
{
    if (g_totalTrades == 0) return;
    
    double winRate = (double)g_winningTrades / g_totalTrades * 100;
    double avgWin = (g_winningTrades > 0) ? g_totalProfit / g_winningTrades : 0;
    double avgLoss = (g_losingTrades > 0) ? (g_totalProfit - g_totalProfit) / g_losingTrades : 0;
    
    Print("=== PERFORMANCE REPORT ===");
    Print("Total Trades: ", g_totalTrades);
    Print("Winning Trades: ", g_winningTrades);
    Print("Losing Trades: ", g_losingTrades);
    Print("Win Rate: ", DoubleToString(winRate, 2), "%");
    Print("Total Profit: ", DoubleToString(g_totalProfit, 2));
    Print("Largest Win: ", DoubleToString(g_largestWin, 2));
    Print("Largest Loss: ", DoubleToString(g_largestLoss, 2));
    Print("Average Win: ", DoubleToString(avgWin, 2));
    Print("Average Loss: ", DoubleToString(avgLoss, 2));
    Print("========================");
}

// === ADVANCED EXIT LOGIC ===
void CheckAdvancedExitLogic()
{
    for (int i = 0; i < g_openOrderCount; i++)
    {
        int ticket = g_openOrders[i];
        if (!OrderSelect(ticket, SELECT_BY_TICKET)) continue;
        
        string symbol = OrderSymbol();
        double openPrice = OrderOpenPrice();
        double currentPrice = (OrderType() == ORDER_TYPE_BUY) ? MarketInfo(symbol, MODE_BID) : MarketInfo(symbol, MODE_ASK);
        double currentSL = OrderStopLoss();
        double currentTP = OrderTakeProfit();
        
        // Break-even logic
        if (g_enableBreakEven && currentSL != openPrice)
        {
            double priceDiff = MathAbs(currentPrice - openPrice);
            double pipsDiff = priceDiff / (MarketInfo(symbol, MODE_POINT) * 10);
            
            if (pipsDiff >= g_breakEvenPips)
            {
                // Move stop loss to break-even
                bool result = OrderModify(ticket, openPrice, openPrice, currentTP, 0, clrBlue);
                if (result)
                {
                    Print("Moved stop loss to break-even for trade ", ticket);
                }
            }
        }
        
        // Partial close logic
        if (g_enablePartialClose && OrderLots() > 0.01)
        {
            double priceDiff = MathAbs(currentPrice - openPrice);
            double pipsDiff = priceDiff / (MarketInfo(symbol, MODE_POINT) * 10);
            
            if (pipsDiff >= g_partialCloseTarget)
            {
                // Close partial position
                double partialLots = OrderLots() * (g_partialClosePercent / 100.0);
                if (partialLots >= 0.01)
                {
                    bool result = OrderClose(ticket, partialLots, currentPrice, 3, clrOrange);
                    if (result)
                    {
                        Print("Partial close executed for trade ", ticket, " Lots: ", DoubleToString(partialLots, 2));
                    }
                }
            }
        }
    }
}
