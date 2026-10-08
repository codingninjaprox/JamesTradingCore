//+------------------------------------------------------------------+
//| JamesTradingEA.mq5                                               |
//| Expert Advisor for James Trading Platform                        |
//| Collects account data and saves to JSON file                     |
//+------------------------------------------------------------------+
#property copyright "JamesPlatform"
#property link ""
#property version "1.00"

// Global variables
datetime lastUpdateTime = 0;
int updateInterval = 10; // Update every 10 seconds

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
    Print("=== JamesTradingEA Started ===");
    Print("Account: ", AccountInfoInteger(ACCOUNT_LOGIN));
    Print("Server: ", AccountInfoString(ACCOUNT_SERVER));
    Print("Balance: ", AccountInfoDouble(ACCOUNT_BALANCE));
    Print("Equity: ", AccountInfoDouble(ACCOUNT_EQUITY));
   
    // Check if account is connected
    if(TerminalInfoInteger(TERMINAL_CONNECTED))
    {
        // Write initial data only if connected
        WriteAccountData();
        Print("JamesTradingEA initialization completed successfully");
        return(INIT_SUCCEEDED);
    }
    else
    {
        Print("ERROR: Account not connected. Check login credentials or server connection.");
        return(INIT_FAILED); // Fail initialization if not connected
    }
}
//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
    Print("=== JamesTradingEA Stopped ===");
    Print("Reason: ", reason);
   
    // Write final data only if connected
    if(TerminalInfoInteger(TERMINAL_CONNECTED))
    {
        WriteAccountData();
    }
}
//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
    // Update data every 10 seconds
    if(TimeCurrent() - lastUpdateTime >= updateInterval)
    {
        WriteAccountData();
        lastUpdateTime = TimeCurrent();
    }
}
//+------------------------------------------------------------------+
//| Write account data to database via HTTP API                      |
//+------------------------------------------------------------------+
void WriteAccountData()
{
    // Only proceed if account is connected
    if(TerminalInfoInteger(TERMINAL_CONNECTED))
    {
        // Create JSON data
        string jsonData = CreateAccountDataJSON();
       
        // Save to file as backup
        SaveToFile(jsonData);
    }
    else
    {
        Print("Skipped writing account data: Account not connected.");
    }
}
//+------------------------------------------------------------------+
//| Save data to file as backup                                      |
//+------------------------------------------------------------------+
void SaveToFile(string jsonData)
{
    // Save to default MQL5 Files directory
    string filename = "account_data.json";
    int fileHandle = FileOpen(filename, FILE_WRITE|FILE_ANSI);
   
    if(fileHandle != INVALID_HANDLE)
    {
        FileWriteString(fileHandle, jsonData);
        FileClose(fileHandle);
        Print("Account data written to file: ", filename);
    }
    else
    {
        Print("ERROR: Failed to write account data to file. Error code: ", GetLastError());
    }
}
//+------------------------------------------------------------------+
//| Send data to database via HTTP API                               |
//+------------------------------------------------------------------+
void SendToDatabase(string jsonData)
{
    // API endpoint URL
    string apiUrl = "http://localhost:8080/ea-data";
   
    // Create JSON request data
    string requestData = "{\"data\":" + jsonData + "}";
   
    // Send HTTP POST request
    string response = SendHttpRequest(apiUrl, requestData, "POST");
   
    if(response != "")
    {
        Print("✅ Data sent to database successfully. Response: ", response);
    }
    else
    {
        Print("❌ Failed to send data to database. Check API server and WebRequest configuration.");
        Print(" Make sure to add 'http://localhost:8080' to MT5 WebRequest allowed URLs");
    }
}
//+------------------------------------------------------------------+
//| Send HTTP request (MQL5 WebRequest function)                     |
//+------------------------------------------------------------------+
string SendHttpRequest(string url, string data, string method)
{
    // Note: WebRequest requires URL to be added to "Allow WebRequest" list in MT5
    // Tools -> Options -> Expert Advisors -> Allow WebRequest for listed URL
    // Add: http://localhost:8080
   
    char post[], result[];
    string result_headers;
    string headers = "Content-Type: application/json\r\n";
   
    // Convert string to char array without null terminator
    StringToCharArray(data, post, 0, StringLen(data));
   
    // Send request
    int res = WebRequest(method, url, NULL, NULL, 5000, post, ArraySize(post), result, result_headers);
   
    if(res == 200)
    {
        return CharArrayToString(result);
    }
    else
    {
        Print("HTTP request failed. Error code: ", res);
        return "";
    }
}
//+------------------------------------------------------------------+
//| Create JSON string with account data                             |
//+------------------------------------------------------------------+
string CreateAccountDataJSON()
{
    string json = "{";
   
    // Account information
    json += "\"account_id\":\"2857\",";
    json += "\"login\":\"" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "\",";
    json += "\"server\":\"" + AccountInfoString(ACCOUNT_SERVER) + "\",";
    json += "\"currency\":\"" + AccountInfoString(ACCOUNT_CURRENCY) + "\",";
    json += "\"leverage\":" + IntegerToString(AccountInfoInteger(ACCOUNT_LEVERAGE)) + ",";
   
    // Financial data
    json += "\"balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",";
    json += "\"equity\":" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + ",";
    json += "\"margin\":" + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN), 2) + ",";
    json += "\"free_margin\":" + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2) + ",";
    json += "\"profit\":" + DoubleToString(AccountInfoDouble(ACCOUNT_PROFIT), 2) + ",";
   
    // Calculate margin level manually
    double marginLevel = 0;
    if(AccountInfoDouble(ACCOUNT_MARGIN) > 0)
    {
        marginLevel = (AccountInfoDouble(ACCOUNT_EQUITY) / AccountInfoDouble(ACCOUNT_MARGIN)) * 100;
    }
    json += "\"margin_level\":" + DoubleToString(marginLevel, 2) + ",";
   
    // Trading data
    json += "\"open_positions\":" + IntegerToString(PositionsTotal()) + ",";
    json += "\"pending_orders\":" + IntegerToString(OrdersTotal()) + ",";
   
    // Connection status
    json += "\"connected\":" + (TerminalInfoInteger(TERMINAL_CONNECTED) ? "true" : "false") + ",";
    json += "\"trade_allowed\":" + (AccountInfoInteger(ACCOUNT_TRADE_ALLOWED) ? "true" : "false") + ",";
   
    // Timestamp
    json += "\"timestamp\":\"" + TimeToString(TimeCurrent()) + "\",";
    json += "\"source\":\"james_trading_ea\"";
   
    json += "}";
   
    return json;
}
//+------------------------------------------------------------------+
//| Custom function to get detailed account info                     |
//+------------------------------------------------------------------+
void PrintAccountInfo()
{
    Print("=== Account Information ===");
    Print("Account Number: ", AccountInfoInteger(ACCOUNT_LOGIN));
    Print("Server: ", AccountInfoString(ACCOUNT_SERVER));
    Print("Currency: ", AccountInfoString(ACCOUNT_CURRENCY));
    Print("Leverage: ", AccountInfoInteger(ACCOUNT_LEVERAGE));
    Print("Balance: ", AccountInfoDouble(ACCOUNT_BALANCE));
    Print("Equity: ", AccountInfoDouble(ACCOUNT_EQUITY));
    Print("Margin: ", AccountInfoDouble(ACCOUNT_MARGIN));
    Print("Free Margin: ", AccountInfoDouble(ACCOUNT_MARGIN_FREE));
    Print("Profit: ", AccountInfoDouble(ACCOUNT_PROFIT));
   
    // Calculate margin level manually
    double marginLevel = 0;
    if(AccountInfoDouble(ACCOUNT_MARGIN) > 0)
    {
        marginLevel = (AccountInfoDouble(ACCOUNT_EQUITY) / AccountInfoDouble(ACCOUNT_MARGIN)) * 100;
    }
    Print("Margin Level: ", marginLevel, "%");
   
    Print("Connected: ", TerminalInfoInteger(TERMINAL_CONNECTED));
    Print("Trade Allowed: ", AccountInfoInteger(ACCOUNT_TRADE_ALLOWED));
    Print("Open Positions: ", PositionsTotal());
    Print("========================");
}