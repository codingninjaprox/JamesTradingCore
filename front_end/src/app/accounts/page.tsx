"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "react-hot-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/utils/translation";
import {
  accountsApi,
  accountUtils,
  type Account,
  WrongCredentialError,
} from "@/utils/accounts";
import { FaCrown, FaLock, FaChartLine, FaCoins } from "react-icons/fa";

interface Server {
  id: number;
  name: string;
  value: string;
}

interface RiskSetting {
  id: number;
  name: string;
  value: string;
}

interface ApiRiskSetting {
  id: number;
  name: string;
  group_id: string;
  type: "normal" | "pro" | "other" | "other_pro";
  display_order: number;
  multiplier: number;
  min_deposit: number;
  enabled: boolean;
  value: number;
  created_at: string | null;
  updated_at: string;
}

interface RiskSettingConfig {
  id: number;
  name: string;
  group_id: string;
  type: "normal" | "pro" | "other" | "other_pro";
  display_order: number;
  multiplier: number;
  min_deposit: number;
  enabled: boolean;
}

export default function AccountsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, token, forceRefreshUser } = useAuth();
  const { translations } = useLanguage();
  const t = (key: string) => getTranslation(translations, key);
  
  const [account, setAccount] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [servers, setServers] = useState<Server[]>([]);
  const [enabledRiskSettings, setEnabledRiskSettings] = useState<RiskSetting[]>(
    []
  );
  const [selectedServer, setSelectedServer] = useState("");
  const [selectedRiskSetting, setSelectedRiskSetting] = useState("");
  const [customServer, setCustomServer] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState("mt4");
  const [riskSettings, setRiskSettings] = useState<RiskSettingConfig[]>([]);
  const [isLoadingRiskSettings, setIsLoadingRiskSettings] = useState(false);
  const [showWrongCredentialWarning, setShowWrongCredentialWarning] =
    useState(false);
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [creationStatus, setCreationStatus] = useState<any>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const isPollingRef = useRef(false);
  const [hasRestoredStatus, setHasRestoredStatus] = useState(false);
  const [wrongCredentialsDetected, setWrongCredentialsDetected] = useState(false);
  const backgroundRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const settingsRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [serverStatus, setServerStatus] = useState<'online' | 'offline'>('online');
  const [cacheChecked, setCacheChecked] = useState(false);
  const isFetchingAccountRef = useRef(false);
  const [hasConnectedAccount, setHasConnectedAccount] = useState<boolean | null>(null);
  const [isCheckingAccountHistory, setIsCheckingAccountHistory] = useState(false);

  // Check if account was removed due to wrong credentials
  const showRemovedWarning = searchParams.get("remove") === "true";
  
  // Check if restricted user removed their account
  const showRestrictedRemoveWarning = searchParams.get("balance") === "true";

  // Cache management functions
  const getSettingsCacheKey = () => `settings_${user?.id}`
  const getAccountCacheKey = () => `account_${user?.id}`
  const getRiskSettingsCacheKey = () => `risk_settings_${user?.id}`
  const getAccountHistoryCacheKey = () => `account_history_${user?.id}`
  const getCacheExpiry = () => 15 * 24 * 60 * 60 * 1000 // 15 days

  const saveSettingsToCache = (data: any) => {
    if (!user?.id) return
    try {
      const cacheData = {
        data,
        timestamp: Date.now(),
        expiry: getCacheExpiry()
      }
      localStorage.setItem(getSettingsCacheKey(), JSON.stringify(cacheData))
    } catch (error) {
      console.error('Error saving settings to cache:', error)
    }
  }

  const loadSettingsFromCache = () => {
    if (!user?.id) return null
    try {
      const cached = localStorage.getItem(getSettingsCacheKey())
      if (!cached) return null
      
      const cacheData = JSON.parse(cached)
      const now = Date.now()
      
      // Check if cache is expired
      if (now - cacheData.timestamp > cacheData.expiry) {
        localStorage.removeItem(getSettingsCacheKey())
        return null
      }
      
      return cacheData.data
    } catch (error) {
      console.error('Error loading settings from cache:', error)
      return null
    }
  }

  const saveAccountToCache = (data: any) => {
    if (!user?.id) return
    try {
      const cacheData = {
        data,
        timestamp: Date.now(),
        expiry: getCacheExpiry()
      }
      localStorage.setItem(getAccountCacheKey(), JSON.stringify(cacheData))
      
      // Also cache account_id for faster login (optimization)
      if (data && data.account_id) {
        localStorage.setItem(`account_id_${user.id}`, data.account_id)
        // Dispatch event to notify navigation component
        window.dispatchEvent(new Event('accountCacheUpdated'));
      } else {
        // Clear cached account_id if account is deleted
        localStorage.removeItem(`account_id_${user.id}`)
        // Dispatch event to notify navigation component
        window.dispatchEvent(new Event('accountDeleted'));
      }
    } catch (error) {
      console.error('Error saving account to cache:', error)
    }
  }

  const loadAccountFromCache = () => {
    if (!user?.id) return null
    try {
      const cached = localStorage.getItem(getAccountCacheKey())
      if (!cached) return null
      
      const cacheData = JSON.parse(cached)
      const now = Date.now()
      
      // Check if cache is expired
      if (now - cacheData.timestamp > cacheData.expiry) {
        localStorage.removeItem(getAccountCacheKey())
        return null
      }
      
      return cacheData.data
    } catch (error) {
      console.error('Error loading account from cache:', error)
      return null
    }
  }

  const saveRiskSettingsToCache = (data: any) => {
    if (!user?.id) return
    try {
      const cacheData = {
        data,
        timestamp: Date.now(),
        expiry: getCacheExpiry()
      }
      localStorage.setItem(getRiskSettingsCacheKey(), JSON.stringify(cacheData))
    } catch (error) {
      console.error('Error saving risk settings to cache:', error)
    }
  }

  const loadRiskSettingsFromCache = () => {
    if (!user?.id) return null
    try {
      const cached = localStorage.getItem(getRiskSettingsCacheKey())
      if (!cached) return null
      
      const cacheData = JSON.parse(cached)
      const now = Date.now()
      
      // Check if cache is expired
      if (now - cacheData.timestamp > cacheData.expiry) {
        localStorage.removeItem(getRiskSettingsCacheKey())
        return null
      }
      
      return cacheData.data
    } catch (error) {
      console.error('Error loading risk settings from cache:', error)
      return null
    }
  }

  const saveAccountHistoryToCache = (hasHistory: boolean) => {
    if (!user?.id) return
    try {
      const cacheData = {
        data: hasHistory,
        timestamp: Date.now(),
        expiry: getCacheExpiry()
      }
      localStorage.setItem(getAccountHistoryCacheKey(), JSON.stringify(cacheData))
    } catch (error) {
      console.error('Error saving account history to cache:', error)
    }
  }

  const loadAccountHistoryFromCache = (): boolean | null => {
    if (!user?.id) return null
    try {
      const cached = localStorage.getItem(getAccountHistoryCacheKey())
      if (!cached) return null
      
      const cacheData = JSON.parse(cached)
      const now = Date.now()
      
      // Check if cache is expired
      if (now - cacheData.timestamp > cacheData.expiry) {
        localStorage.removeItem(getAccountHistoryCacheKey())
        return null
      }
      
      return cacheData.data
    } catch (error) {
      console.error('Error loading account history from cache:', error)
      return null
    }
  }

  const clearCache = () => {
    if (!user?.id) return
    try {
      localStorage.removeItem(getSettingsCacheKey())
      localStorage.removeItem(getAccountCacheKey())
      localStorage.removeItem(getRiskSettingsCacheKey())
      localStorage.removeItem(getAccountHistoryCacheKey())
      // Also clear cached account_id
      localStorage.removeItem(`account_id_${user.id}`)
      
      // Dispatch event to notify navigation component
      window.dispatchEvent(new Event('accountDeleted'));
    } catch (error) {
      console.error('Error clearing cache:', error)
    }
  }

  // Filter servers based on user's broker
  const filteredServers = servers.filter((server) => {
    // For "Other" broker, show all servers
    if (!user?.broker || user.broker === "Other") {
      return true;
    }
    
    const serverName = server.name.toLowerCase();
    const broker = user.broker.toLowerCase();
    
    if (broker === "ironfx") {
      return serverName.includes("ironfx") || serverName.includes("ironfxbm");
    } else if (broker === "t4trade") {
      return serverName.includes("t4trade") || serverName.includes("t4trade");
    }
    
    return false;
  });

  // Reset selectedServer when servers change or when no servers are available
  useEffect(() => {
    if (servers.length === 0 || filteredServers.length === 0) {
      setSelectedServer("");
    }
  }, [servers, filteredServers]);

  // Check if user has connected account before by checking account activities
  const checkAccountConnectionHistory = async (isBackgroundUpdate = false) => {
    if (!token || !user?.id || user?.restricted_user !== 1) return;

    try {
      // Check cache first and show cached data immediately
      const cachedHistory = loadAccountHistoryFromCache();
      if (cachedHistory !== null && !isBackgroundUpdate) {
        setHasConnectedAccount(cachedHistory);
        setIsCheckingAccountHistory(false);
        
        // Still fetch fresh data in background to update cache
        setTimeout(async () => {
          try {
            await fetchAccountHistoryFromAPI();
          } catch (error) {
            console.error('Error fetching account history in background:', error);
          }
        }, 100);
        return;
      }

      if (!isBackgroundUpdate) {
        setIsCheckingAccountHistory(true);
      }
      
      await fetchAccountHistoryFromAPI();
    } catch (error) {
      console.error('Error checking account connection history:', error);
      // On error, use cached data if available, otherwise assume first time
      const cachedHistory = loadAccountHistoryFromCache();
      if (cachedHistory !== null) {
        setHasConnectedAccount(cachedHistory);
      } else {
        setHasConnectedAccount(false);
      }
    } finally {
      if (!isBackgroundUpdate) {
        setIsCheckingAccountHistory(false);
      }
    }
  };

  // Fetch account history from API
  const fetchAccountHistoryFromAPI = async () => {
    if (!token || !user?.id) return;

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/account-activities`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    const data = await response.json();
    
    if (data.success && Array.isArray(data.data)) {
      // Check if there are any activities that indicate account connection
      // Any activity in history means user has connected before
      const hasHistory = data.data.length > 0;
      setHasConnectedAccount(hasHistory);
      // Save to cache
      saveAccountHistoryToCache(hasHistory);
    } else {
      // No activities found, means first time
      setHasConnectedAccount(false);
      // Save to cache
      saveAccountHistoryToCache(false);
    }
  };

  const fetchAccounts = async (isBackgroundUpdate = false) => {
    if (!token || !user?.id) return;

    // Prevent concurrent API calls
    if (isFetchingAccountRef.current) {
      return;
    }

    try {
      isFetchingAccountRef.current = true;
      if (!isBackgroundUpdate) {
        setIsLoadingAccounts(true);
      }
      
      // Check cache first
      const cachedAccount = loadAccountFromCache();
      
      if (cachedAccount && !isBackgroundUpdate) {
        setAccount(cachedAccount);
        setIsLoadingAccounts(false);
        setInitialLoadComplete(true);
        
        // Always validate cache with API in background
        // This ensures we catch cases where account was deleted/disconnected
        setTimeout(async () => {
          // Check again to prevent concurrent validation calls
          if (isFetchingAccountRef.current) {
            return;
          }
          isFetchingAccountRef.current = true;
          try {
            let freshData = null;
            
            // Optimization: Use faster endpoint if account_id is cached
            const cachedAccountId = localStorage.getItem(`account_id_${user.id}`);
            if (cachedAccountId && cachedAccount?.account_id === cachedAccountId) {
              try {
                freshData = await accountsApi.getAccountById(token, cachedAccountId);
                // If account not found, fallback to userId method
                if (!freshData) {
                  freshData = await accountsApi.getAccount(token, user.id);
                }
              } catch (error: any) {
                // Only set server status to offline for actual server errors (500, 502, 503, etc.) or CORS errors
                // 404 (account not found) and 401 (session expired) are expected responses, not server issues
                const errorMessage = error?.message || String(error || '');
                const errorName = error?.name || '';
                const errorStatus = error?.status;
                const isSessionExpired = errorMessage === 'Session expired';
                const isNotFound = errorStatus === 404 || errorMessage.includes('404');
                const isUnauthorized = errorStatus === 401 || isSessionExpired;
                
                // Only trigger server maintenance for actual server errors (not 404 or 401)
                if (!isNotFound && !isUnauthorized && (errorName === 'TypeError' || errorStatus)) {
                  setServerStatus('offline');
                }
                // Fallback to userId method if detail endpoint fails
                freshData = await accountsApi.getAccount(token, user.id);
              }
            } else {
              // No cached account_id, use userId method
              try {
                freshData = await accountsApi.getAccount(token, user.id);
              } catch (error: any) {
                // Only set server status to offline for actual server errors (500, 502, 503, etc.) or CORS errors
                // 404 (account not found) and 401 (session expired) are expected responses, not server issues
                const errorMessage = error?.message || String(error || '');
                const errorName = error?.name || '';
                const errorStatus = error?.status;
                const isSessionExpired = errorMessage === 'Session expired';
                const isNotFound = errorStatus === 404 || errorMessage.includes('404');
                const isUnauthorized = errorStatus === 401 || isSessionExpired;
                
                // Only trigger server maintenance for actual server errors (not 404 or 401)
                if (!isNotFound && !isUnauthorized && (errorName === 'TypeError' || errorStatus)) {
                  setServerStatus('offline');
                }
                // Don't re-throw here, just set to null
                freshData = null;
              }
            }
            
            // If API returns different data, update immediately
            if (JSON.stringify(cachedAccount) !== JSON.stringify(freshData)) {
              setAccount(freshData);
              saveAccountToCache(freshData);
              
              // If account was deleted, redirect back to accounts page
              if (!freshData && cachedAccount) {
                router.push('/accounts');
              }
            }
          } catch (error) {
            console.error("Error validating cache:", error);
          } finally {
            isFetchingAccountRef.current = false;
          }
        }, 100); // Small delay to let redirect happen first
        
        isFetchingAccountRef.current = false;
        return;
      }

      // Fetch fresh data - try optimized endpoint first if account_id is cached
      let accountsData = null;
      const cachedAccountId = localStorage.getItem(`account_id_${user.id}`);
      
      if (cachedAccountId) {
        try {
          accountsData = await accountsApi.getAccountById(token, cachedAccountId);
          // If account not found, fallback to userId method
          if (!accountsData) {
            accountsData = await accountsApi.getAccount(token, user.id);
          }
        } catch (error: any) {
          // Only set server status to offline for actual server errors (500, 502, 503, etc.) or CORS errors
          // 404 (account not found) and 401 (session expired) are expected responses, not server issues
          const errorMessage = error?.message || String(error || '');
          const errorName = error?.name || '';
          const errorStatus = error?.status;
          const isSessionExpired = errorMessage === 'Session expired';
          const isNotFound = errorStatus === 404 || errorMessage.includes('404');
          const isUnauthorized = errorStatus === 401 || isSessionExpired;
          
          // Only trigger server maintenance for actual server errors (not 404 or 401)
          if (!isNotFound && !isUnauthorized && (errorName === 'TypeError' || errorStatus)) {
            setServerStatus('offline');
          }
          // Fallback to userId method if detail endpoint fails
          accountsData = await accountsApi.getAccount(token, user.id);
        }
      } else {
        // No cached account_id, use userId method
        try {
          accountsData = await accountsApi.getAccount(token, user.id);
        } catch (error: any) {
          // Only set server status to offline for actual server errors (500, 502, 503, etc.) or CORS errors
          // 404 (account not found) and 401 (session expired) are expected responses, not server issues
          const errorMessage = error?.message || String(error || '');
          const errorName = error?.name || '';
          const errorStatus = error?.status;
          const isSessionExpired = errorMessage === 'Session expired';
          const isNotFound = errorStatus === 404 || errorMessage.includes('404');
          const isUnauthorized = errorStatus === 401 || isSessionExpired;
          
          // Only trigger server maintenance for actual server errors (not 404 or 401)
          if (!isNotFound && !isUnauthorized && (errorName === 'TypeError' || errorStatus)) {
            setServerStatus('offline');
          }
          throw error; // Re-throw to be caught by outer catch
        }
      }

      // Check if data has actually changed (for background updates)
      if (isBackgroundUpdate) {
        const currentData = account;
        
        // Only update if data has changed
        if (JSON.stringify(currentData) !== JSON.stringify(accountsData)) {
          setAccount(accountsData);
        }
      } else {
        // Initial load - always update
        setAccount(accountsData);
      }

      // Save to cache
      saveAccountToCache(accountsData);
      setIsLoadingAccounts(false);
      
      // If account exists, ensure we redirect (will be handled by useEffect)
      if (accountsData && accountsData.account_id) {
        setInitialLoadComplete(true);
      }
    } catch (error: any) {
      // Only set server status to offline for actual server errors (500, 502, 503, etc.) or CORS errors
      // 404 (account not found) and 401 (session expired) are expected responses, not server issues
      const errorMessage = error?.message || String(error || '');
      const errorName = error?.name || '';
      const errorStatus = error?.status;
      const isSessionExpired = errorMessage === 'Session expired';
      const isNotFound = errorStatus === 404 || errorMessage.includes('404');
      const isUnauthorized = errorStatus === 401 || isSessionExpired;
      
      // Only trigger server maintenance for actual server errors (not 404 or 401)
      if (!isNotFound && !isUnauthorized && (errorName === 'TypeError' || errorStatus)) {
        setServerStatus('offline');
      }
      console.error("Error fetching accounts:", error);
      
      // Check if it's a 500 error (wrong credentials) during background refresh
      // Only stop account creation if we're currently in the account creation process
      if (error instanceof Error && error.message.includes('Invalid credentials - account connection failed')) {
        // This is wrong credentials - clear account data
        setAccount(null);
        saveAccountToCache(null);
        setIsLoadingAccounts(false);
        
        // Only stop account creation polling if we're currently in the process
        if (isPolling || showProgressDialog) {
          setWrongCredentialsDetected(true);
          setIsPolling(false);
          isPollingRef.current = false;
          setShowProgressDialog(false);
          localStorage.removeItem("accountCreationStatus");
          toast.error(t('Invalid account credentials. Please check your login details and try again.'));
        }
        
        // Clear all background intervals
        if (backgroundRefreshIntervalRef.current) {
          clearInterval(backgroundRefreshIntervalRef.current);
          backgroundRefreshIntervalRef.current = null;
        }
        if (settingsRefreshIntervalRef.current) {
          clearInterval(settingsRefreshIntervalRef.current);
          settingsRefreshIntervalRef.current = null;
        }
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        
        return;
      }
      
      if (!isBackgroundUpdate) {
        setIsLoadingAccounts(false);
      }
    } finally {
      isFetchingAccountRef.current = false;
      if (!isBackgroundUpdate) {
        setInitialLoadComplete(true);
        setCacheChecked(true);
      }
    }
  };

  const startPolling = () => {
    if (!token || !user?.id) {
      return;
    }

    // If already polling, don't start another instance
    if (isPollingRef.current) {
      return;
    }

    setIsPolling(true);
    isPollingRef.current = true;
    let pollCount = 0;
    const maxPolls = 400; // 5 minutes max (400 * 4 seconds = 1600 seconds)

    const pollStatus = async () => {
      if (!isPollingRef.current || wrongCredentialsDetected) {
        return; // Stop if polling was cancelled or wrong credentials detected
      }

      pollCount++;
      const isCompleted = await checkCreationStatus();

      if (isCompleted || pollCount >= maxPolls) {
        setIsPolling(false);
        isPollingRef.current = false;
        if (pollCount >= maxPolls && !isCompleted) {
          setShowProgressDialog(false);
          localStorage.removeItem("accountCreationStatus");
        }
        return; // Stop polling
      }

      // Schedule next poll in 4 seconds
      setTimeout(() => {
        pollStatus();
      }, 4000);
    };

    // Start the first poll immediately, then every 4 seconds
    pollStatus();
  };

  const checkCreationStatus = async () => {
    if (!token || !user?.id || wrongCredentialsDetected) {
      return false;
    }

    try {
      setIsCheckingStatus(true);

      const status = await accountsApi.getAccountCreationStatus(
        token,
        user.id.toString()
      );

      // Check if the status response has the correct format for account creation progress
      // Only apply wrong credential detection when we're in the "validating credentials" step
      if (status && 
          status.step === "validating_credentials" && 
          (!status.hasOwnProperty('success') || 
           !status.hasOwnProperty('status') || 
           !status.hasOwnProperty('progress') || 
           !status.hasOwnProperty('step') ||
           status.status === "not_found" ||
           (status.success === false && status.status === "error"))) {
        
        // This indicates wrong credentials during credential validation - stop polling and show error
        setIsPolling(false);
        isPollingRef.current = false;
        setShowProgressDialog(false);
        localStorage.removeItem("accountCreationStatus");
        toast.error(t('Invalid account credentials. Please check your login details and try again.'));
        return true; // Signal that polling should stop
      }

      // If status is null or undefined, it might mean the process hasn't started yet
      if (!status || status.status === "not_found") {
        // Update progress dialog to show "waiting" status
        setCreationStatus({
          status: "waiting",
          progress: 0,
          step: "queued",
          step_description: t("Waiting for account creation to start..."),
        });
        return false;
      }

      setCreationStatus(status);

      // Save status to localStorage
      localStorage.setItem(
        "accountCreationStatus",
        JSON.stringify({
          status,
          timestamp: Date.now(),
          userId: user.id,
        })
      );

      // If progress is 100% or status is completed, stop polling and handle completion
      if (status.progress === 100 || status.status === "completed") {

        // Stop polling and clean up
        // setShowProgressDialog(false);
        setIsPolling(false);
        isPollingRef.current = false;
        localStorage.removeItem("accountCreationStatus");

        // Fetch accounts and redirect with better error handling
        // Use optimized endpoint if account_id is cached
        try {
          let accountsData = null;
          const cachedAccountId = localStorage.getItem(`account_id_${user.id}`);
          
          if (cachedAccountId) {
            try {
              accountsData = await accountsApi.getAccountById(token, cachedAccountId);
              if (!accountsData) {
                accountsData = await accountsApi.getAccount(token, user.id);
              }
            } catch (error: any) {
              // Only set server status to offline for actual server errors (500, 502, 503, etc.) or CORS errors
              // 404 (account not found) and 401 (session expired) are expected responses, not server issues
              const errorMessage = error?.message || String(error || '');
              const errorName = error?.name || '';
              const errorStatus = error?.status;
              const isSessionExpired = errorMessage === 'Session expired';
              const isNotFound = errorStatus === 404 || errorMessage.includes('404');
              const isUnauthorized = errorStatus === 401 || isSessionExpired;
              
              // Only trigger server maintenance for actual server errors (not 404 or 401)
              if (!isNotFound && !isUnauthorized && (errorName === 'TypeError' || errorStatus)) {
                setServerStatus('offline');
              }
              accountsData = await accountsApi.getAccount(token, user.id);
            }
          } else {
            try {
              accountsData = await accountsApi.getAccount(token, user.id);
            } catch (error: any) {
              // Only set server status to offline for actual server errors (500, 502, 503, etc.) or CORS errors
              // 404 (account not found) and 401 (session expired) are expected responses, not server issues
              const errorMessage = error?.message || String(error || '');
              const errorName = error?.name || '';
              const errorStatus = error?.status;
              const isSessionExpired = errorMessage === 'Session expired';
              const isNotFound = errorStatus === 404 || errorMessage.includes('404');
              const isUnauthorized = errorStatus === 401 || isSessionExpired;
              
              // Only trigger server maintenance for actual server errors (not 404 or 401)
              if (!isNotFound && !isUnauthorized && (errorName === 'TypeError' || errorStatus)) {
                setServerStatus('offline');
              }
              // Don't re-throw here, just set to null
              accountsData = null;
            }
          }

          if (accountsData && accountsData.account_id) {

            // Check balance for restricted users
            if (user?.restricted_user === 1) {

              // If balance is undefined, wait for it to be fetched
              if (
                accountsData.balance === undefined ||
                accountsData.balance === 0
              ) {

                // Wait for balance to be fetched (up to 30 seconds)
                let balanceCheckAttempts = 0;
                const maxBalanceChecks = 10; // 10 attempts * 3 seconds = 30 seconds

                const checkBalance = async (): Promise<boolean> => {
                  try {
                    const updatedAccountData = await accountsApi.getAccount(
                      token,
                      user.id
                    );

                    if (
                      updatedAccountData &&
                      updatedAccountData.balance !== undefined &&
                      updatedAccountData.balance > 0
                    ) {

                      if (updatedAccountData.balance < 350) {

                        try {
                          await accountsApi.deleteAccount(token, {
                            account_id: updatedAccountData.account_id,
                            login: updatedAccountData.login,
                            email: user.email,
                          });

                          // Update user connected status to false after account deletion
                          try {
                            await accountsApi.updateConnectedStatus(token, false);
                            
                            // Update connected status in localStorage
                            try {
                              localStorage.setItem(`user_connected_${user.id}`, JSON.stringify(false));
                              // Dispatch event to update Navigation
                              window.dispatchEvent(new Event('connectedStatusUpdated'));
                            } catch (cacheError) {
                              console.warn('Failed to cache connected status:', cacheError);
                            }
                          } catch (connectedError) {
                            console.warn('Failed to update connected status:', connectedError);
                            // Don't block the flow if this fails
                          }

                          toast.error(
                            "Account removed: Balance must be at least €350 for restricted users."
                          );
                          setShowProgressDialog(false);
                          router.push("/accounts?balance=true");
                          return true;
                        } catch (deleteError) {
                          console.error(
                            "Error deleting account with insufficient balance:",
                            deleteError
                          );
                          toast.error(
                            "Failed to remove account with insufficient balance"
                          );
                          return true; // Return true even if deletion fails
                        }
                      } else {
                        // Balance is sufficient, proceed with normal flow
                        await handleAccountCreationSuccess(updatedAccountData);
                        return true;
                      }
                    } else {
                      balanceCheckAttempts++;
                      if (balanceCheckAttempts < maxBalanceChecks) {
                        setTimeout(checkBalance, 3000); // Wait 3 seconds before next check
                        return false; // Continue checking
                      } else {
                        // Proceed with current data if balance couldn't be fetched
                        setAccount(accountsData);
                        setIsLoadingAccounts(true);
                        toast.success("Account created successfully!");
                        setTimeout(() => {
                          router.push(`/accounts/${accountsData.account_id}`);
                        }, 1000);
                        return true;
                      }
                    }
                  } catch (error) {
                    console.error("Error checking balance:", error);
                    // Proceed with current data on error
                    setAccount(accountsData);
                    setIsLoadingAccounts(true);
                    toast.success("Account created successfully!");
                    setTimeout(() => {
                      router.push(`/accounts/${accountsData.account_id}`);
                    }, 1000);
                    return true;
                  }
                };

                // Start balance checking
                await checkBalance();
                return true;
              } else if (accountsData.balance < 350) {

                try {
                  // Delete the account due to insufficient balance
                  await accountsApi.deleteAccount(token, {
                    account_id: accountsData.account_id,
                    login: accountsData.login,
                    email: user.email,
                  });

                  // Update user connected status to false after account deletion
                  try {
                    await accountsApi.updateConnectedStatus(token, false);
                    
                    // Update connected status in localStorage
                    try {
                      localStorage.setItem(`user_connected_${user.id}`, JSON.stringify(false));
                      // Dispatch event to update Navigation
                      window.dispatchEvent(new Event('connectedStatusUpdated'));
                    } catch (cacheError) {
                      console.warn('Failed to cache connected status:', cacheError);
                    }
                  } catch (connectedError) {
                    console.warn('Failed to update connected status:', connectedError);
                    // Don't block the flow if this fails
                  }

                  // Show warning and redirect to accounts page
                  toast.error(
                    "Account removed: Balance must be at least €350 for restricted users."
                  );
                  setShowProgressDialog(false);
                  router.push("/accounts?balance=true");
                  return true;
                } catch (deleteError) {
                  console.error(
                    "Error deleting account with insufficient balance:",
                    deleteError
                  );
                  toast.error(
                    "Failed to remove account with insufficient balance"
                  );
                  return true; // Return true to stop polling even if deletion fails
                }
              }
            }

            // If we reach here, balance check passed or user is not restricted

            // Update local state immediately
            setAccount(accountsData);
            setIsLoadingAccounts(true);

            // Show success message
            toast.success("Account created successfully!");

            // Small delay to ensure dialog closes properly and state updates
            setTimeout(() => {
              router.push(`/accounts/${accountsData.account_id}`);
            }, 1000); // Increased delay for better state synchronization
          } else {
            // Retry fetching account data after a short delay
            // Use optimized endpoint if account_id is cached
            setTimeout(async () => {
              try {
                let retryData = null;
                const cachedAccountId = localStorage.getItem(`account_id_${user.id}`);
                
                if (cachedAccountId) {
                  try {
                    retryData = await accountsApi.getAccountById(token, cachedAccountId);
                    if (!retryData) {
                      retryData = await accountsApi.getAccount(token, user.id);
                    }
                  } catch (error: any) {
                    // Only set server status to offline for actual server errors (500, 502, 503, etc.) or CORS errors
                    // 404 (account not found) and 401 (session expired) are expected responses, not server issues
                    const errorMessage = error?.message || String(error || '');
                    const errorName = error?.name || '';
                    const errorStatus = error?.status;
                    const isSessionExpired = errorMessage === 'Session expired';
                    const isNotFound = errorStatus === 404 || errorMessage.includes('404');
                    const isUnauthorized = errorStatus === 401 || isSessionExpired;
                    
                    // Only trigger server maintenance for actual server errors (not 404 or 401)
                    if (!isNotFound && !isUnauthorized && (errorName === 'TypeError' || errorStatus)) {
                      setServerStatus('offline');
                    }
                    retryData = await accountsApi.getAccount(token, user.id);
                  }
                } else {
                  try {
                    retryData = await accountsApi.getAccount(token, user.id);
                  } catch (error: any) {
                    // Only set server status to offline for actual server errors (500, 502, 503, etc.) or CORS errors
                    // 404 (account not found) and 401 (session expired) are expected responses, not server issues
                    const errorMessage = error?.message || String(error || '');
                    const errorName = error?.name || '';
                    const errorStatus = error?.status;
                    const isSessionExpired = errorMessage === 'Session expired';
                    const isNotFound = errorStatus === 404 || errorMessage.includes('404');
                    const isUnauthorized = errorStatus === 401 || isSessionExpired;
                    
                    // Only trigger server maintenance for actual server errors (not 404 or 401)
                    if (!isNotFound && !isUnauthorized && (errorName === 'TypeError' || errorStatus)) {
                      setServerStatus('offline');
                    }
                    // Don't re-throw here, just set to null
                    retryData = null;
                  }
                }
                if (retryData && retryData.account_id) {
                  // Check balance for restricted users in retry as well
                  if (
                    user?.restricted_user === 1 &&
                    retryData.balance !== undefined
                  ) {
                    if (retryData.balance < 350) {
                      try {
                        await accountsApi.deleteAccount(token, {
                          account_id: retryData.account_id,
                          login: retryData.login,
                          email: user.email,
                        });

                        // Update user connected status to false after account deletion
                        try {
                          await accountsApi.updateConnectedStatus(token, false);
                          
                          // Update connected status in localStorage
                          try {
                            localStorage.setItem(`user_connected_${user.id}`, JSON.stringify(false));
                            // Dispatch event to update Navigation
                            window.dispatchEvent(new Event('connectedStatusUpdated'));
                          } catch (cacheError) {
                            console.warn('Failed to cache connected status:', cacheError);
                          }
                        } catch (connectedError) {
                          console.warn('Failed to update connected status:', connectedError);
                          // Don't block the flow if this fails
                        }

                        toast.error(
                          "Account removed: Balance must be at least €350 for restricted users."
                        );
                        setShowProgressDialog(false);
                        router.push("/accounts?balance=true");
                        return;
                      } catch (deleteError) {
                        console.error(
                          "Error deleting account with insufficient balance:",
                          deleteError
                        );
                        toast.error(
                          "Failed to remove account with insufficient balance"
                        );
                      }
                    }
                  }

                  setAccount(retryData);
                  setIsLoadingAccounts(true);
                  toast.success("Account created successfully!");
                  router.push(`/accounts/${retryData.account_id}`);
                }
              } catch (retryError) {
                console.error("Retry failed:", retryError);
                toast.error(
                  "Account created but there was an issue fetching the details. Please refresh the page."
                );
              }
            }, 2000);
          }
        } catch (error) {
          console.error("Error fetching completed account:", error);
          toast.error(
            "Account created but there was an issue fetching the details. Please refresh the page."
          );
        }

        return true; // Signal that polling should stop
      }

      return false; // Continue polling
    } catch (error) {
      console.error("Error checking creation status:", error);
      
      // If we're in the validating credentials step, ANY error should be treated as wrong credentials
      if (creationStatus && creationStatus.step === "validating_credentials") {
        // This indicates wrong credentials during credential validation - stop polling and show error
        setIsPolling(false);
        isPollingRef.current = false;
        setShowProgressDialog(false);
        localStorage.removeItem("accountCreationStatus");
        toast.error(t('Invalid account credentials. Please check your login details and try again.'));
        return true; // Signal that polling should stop
      }
      
      // For other steps, continue polling on error
      return false;
    } finally {
      setIsCheckingStatus(false);
    }
  };

  // Handle body scroll when progress dialog is open
  useEffect(() => {
    if (showProgressDialog) {
      // Prevent background scrolling
      document.body.classList.add("modal-open");
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
      document.body.style.height = "100%";
    } else {
      // Restore background scrolling
      document.body.classList.remove("modal-open");
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.height = "";
    }

    return () => {
      // Cleanup: ensure scrolling is restored
      document.body.classList.remove("modal-open");
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.height = "";
    };
  }, [showProgressDialog]);

  // Cleanup polling on component unmount
  useEffect(() => {
    return () => {
      if (isPollingRef.current) {
        setIsPolling(false);
        isPollingRef.current = false;
        localStorage.removeItem("accountCreationStatus");
      }
    };
  }, []);

  // Check account connection history for restricted users
  useEffect(() => {
    if (user?.restricted_user === 1 && token && hasConnectedAccount === null && !isCheckingAccountHistory) {
      checkAccountConnectionHistory();
    }
  }, [user?.restricted_user, token]);

  useEffect(() => {
    const fetchSettings = async (isBackgroundUpdate = false) => {
      if (!token) return;

      try {
        // Check cache first
        const cachedSettings = loadSettingsFromCache();
        
        if (cachedSettings && !isBackgroundUpdate) {
          setServers(cachedSettings.servers || []);
          setEnabledRiskSettings(cachedSettings.enabledRiskSettings);
          
          // Set defaults from cache
          if (user?.broker && user.broker !== "Other") {
            const brokerServers = (cachedSettings.servers || []).filter((server: any) => {
              const serverName = server.name.toLowerCase();
              const broker = user.broker.toLowerCase();
              if (broker === "ironfx") {
                return serverName.includes("ironfx") || serverName.includes("ironfxbm");
              } else if (broker === "t4trade") {
                return serverName.includes("t4trade") || serverName.includes("t4trade");
              }
              return false;
            });
            if (brokerServers.length > 0) {
              // setSelectedServer(brokerServers[0].value);
            } else if (cachedSettings.servers.length > 0) {
              // setSelectedServer(cachedSettings.servers[0].value);
            }
          } else if (cachedSettings.servers.length > 0) {
            // setSelectedServer(cachedSettings.servers[0].value);
          }
          // Default will be set by useEffect when riskSettings are loaded
          setIsLoadingSettings(false);
          return;
        }

        // Fetch fresh data
        const data = await accountsApi.getSettings(token);

        // Check if data has actually changed (for background updates)
        if (isBackgroundUpdate) {
          const currentServers = servers;
          const currentRiskSettings = enabledRiskSettings;
          
          // Only update if data has changed
          if (JSON.stringify(currentServers) !== JSON.stringify(data.servers) ||
              JSON.stringify(currentRiskSettings) !== JSON.stringify(data.enabledRiskSettings)) {
        setServers(data.servers || []);
        setEnabledRiskSettings(data.enabledRiskSettings);
          }
        } else {
          // Initial load - always update
          setServers(data.servers || []);
          setEnabledRiskSettings(data.enabledRiskSettings);
        }

        // Save to cache
        saveSettingsToCache(data);

        // Set default server based on user's broker (only on initial load)
        if (!isBackgroundUpdate) {
          if (user?.broker && user.broker !== "Other") {
            const brokerServers = (data.servers || []).filter((server) => {
            const serverName = server.name.toLowerCase();
            const broker = user.broker.toLowerCase();
            
              if (broker === "ironfx") {
                return (
                  serverName.includes("ironfx") || serverName.includes("ironfxbm")
                );
              } else if (broker === "t4trade") {
                return (
                  serverName.includes("t4trade") || serverName.includes("t4trade")
                );
            }
            return false;
          });
          
          if (brokerServers.length > 0) {
            // setSelectedServer(brokerServers[0].value);
          } else if ((data.servers || []).length > 0) {
            // setSelectedServer(data.servers[0].value);
          }
        } else if ((data.servers || []).length > 0) {
          // setSelectedServer(data.servers[0].value);
        }
        // Set default risk setting based on broker
          setSelectedRiskSetting(
            user?.broker === "Other" ? "EVZiiLZp" : "aXciiLZp"
          );
        }
      } catch (error) {
        console.error("Error fetching settings:", error);
      } finally {
        if (!isBackgroundUpdate) {
        setIsLoadingSettings(false);
        }
      }
    };

    // Check for existing account creation status on page load
    const restoreCreationStatus = () => {
      try {
        const savedStatus = localStorage.getItem("accountCreationStatus");
        if (savedStatus && user?.id) {
          const parsedStatus = JSON.parse(savedStatus);
          // Check if the saved status is for the current user and not too old (within 10 minutes)
          const isRecent = Date.now() - parsedStatus.timestamp < 10 * 60 * 1000; // 10 minutes
          const isCurrentUser = parsedStatus.userId === user.id;


          if (
            isRecent &&
            isCurrentUser &&
            parsedStatus.status.status !== "completed"
          ) {
            setCreationStatus(parsedStatus.status);
            setShowProgressDialog(true);
            setHasRestoredStatus(true);

            // Start polling again (don't set isPollingRef here, let startPolling handle it)
            startPolling();

            // Return true to indicate we restored a status
            return true;
          } else {
            // Clean up old or completed status
            localStorage.removeItem("accountCreationStatus");
          }
        } else {
          console.log("No saved status found or no user ID");
        }
        return false;
      } catch (error) {
        console.error("Error restoring creation status:", error);
        localStorage.removeItem("accountCreationStatus");
        return false;
      }
    };

    // Load cached data immediately
    if (token && user?.id) {
      // Load cached settings
      const cachedSettings = loadSettingsFromCache();
      if (cachedSettings) {
        setServers(cachedSettings.servers || []);
        setEnabledRiskSettings(cachedSettings.enabledRiskSettings);
        setIsLoadingSettings(false);
      }

      // Load cached account data
      const cachedAccount = loadAccountFromCache();
      if (cachedAccount && cachedAccount.account_id) {
        setAccount(cachedAccount);
        setIsLoadingAccounts(false);
        setInitialLoadComplete(true); // Set immediately for instant redirect
        setCacheChecked(true);
        
        // Immediately redirect to account detail page if account exists
        // This ensures users with accounts never see the create page
        console.log(
          "Found cached account data, redirecting to account detail page:",
          cachedAccount.account_id
        );
        // Redirect immediately - don't wait for useEffect
        router.push(`/accounts/${cachedAccount.account_id}`);
      }

      // Load cached risk settings
      const cachedRiskSettings = loadRiskSettingsFromCache();
      if (cachedRiskSettings) {
        setRiskSettings(cachedRiskSettings);
        setIsLoadingRiskSettings(false);
      }

      // Always fetch fresh data in background
      fetchSettings(true);
      fetchRiskSettings(true);
    }

    // Restore creation status if available, and only fetch accounts if not restoring
    if (token && user?.id) {
      const restored = restoreCreationStatus();

      if (!restored) {
        // Only fetch accounts if we don't have cached data
        const cachedAccount = loadAccountFromCache();
        if (!cachedAccount) {
          // Don't set cacheChecked yet - let fetchAccounts set it after checking
          fetchAccounts(false); // Fetch immediately (not background) to check if account exists and redirect
        } else {
          setCacheChecked(true);
          // If cached account exists, redirect already happened above
        }
      } else {
        // If we restored a status, we don't need to wait for any loading
        setIsLoadingAccounts(false);
        setIsLoadingSettings(false);
        setIsLoadingRiskSettings(false);
        setInitialLoadComplete(true);
        setCacheChecked(true);
      }
    } else {
      fetchAccounts(true);
      // cacheChecked will be set in fetchAccounts finally block
    }

    // Set initial load complete after a minimum time to prevent glitching
    // (Only needed if no cache was loaded above)
    const timer = setTimeout(() => {
      setInitialLoadComplete(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, [token, user, router]);

  // Background refresh every 2 minutes for account data (frequent changes)
  useEffect(() => {
    if (!token || !user?.id) return

    const interval = setInterval(() => {
      fetchAccounts(true);
    }, 2 * 60 * 1000) // 2 minutes
    
    backgroundRefreshIntervalRef.current = interval;

    return () => {
      clearInterval(interval);
      backgroundRefreshIntervalRef.current = null;
    }
  }, [token, user?.id])

  // Background refresh every 5 minutes for settings (less frequent changes)
  useEffect(() => {
    if (!token || !user?.id) return

    const interval = setInterval(async () => {
      // Fetch settings in background
      try {
        const data = await accountsApi.getSettings(token);
        const currentServers = servers;
        const currentRiskSettings = enabledRiskSettings;
        
        // Only update if data has changed
        if (JSON.stringify(currentServers) !== JSON.stringify(data.servers) ||
            JSON.stringify(currentRiskSettings) !== JSON.stringify(data.enabledRiskSettings)) {
          setServers(data.servers || []);
          setEnabledRiskSettings(data.enabledRiskSettings);
        }
        saveSettingsToCache(data);
      } catch (error) {
        console.error("Error fetching settings in background:", error);
      }

      // Fetch PRO settings in background
      fetchRiskSettings(true);
    }, 5 * 60 * 1000) // 5 minutes
    
    settingsRefreshIntervalRef.current = interval;

    return () => {
      clearInterval(interval);
      settingsRefreshIntervalRef.current = null;
    }
  }, [token, user?.id])

  // Handle redirect immediately when account exists - always redirect to detail page if account exists
  useEffect(() => {
    // If account exists, always redirect to detail page (unless showing progress dialog for account creation)
    if (account && account.account_id && !showProgressDialog) {
      router.push(`/accounts/${account.account_id}`);
    }
  }, [account, showProgressDialog, router]);


  // Helper function to handle successful account creation
  const handleAccountCreationSuccess = async (accountData: any) => {
    setAccount(accountData);
    setIsLoadingAccounts(true);
    
    // Update user connected status to true after successful account creation
    try {
      await accountsApi.updateConnectedStatus(token!, true);
      
      // Update connected status in localStorage
      try {
        if (user?.id) {
          localStorage.setItem(`user_connected_${user.id}`, JSON.stringify(true));
          // Dispatch event to update Navigation
          window.dispatchEvent(new Event('connectedStatusUpdated'));
        }
      } catch (cacheError) {
        console.warn('Failed to cache connected status:', cacheError);
      }
    } catch (connectedError) {
      console.warn('Failed to update connected status:', connectedError);
      // Don't block the flow if this fails
    }
    
    // Call /api/auth/me to refresh user data after account creation
    try {
      await forceRefreshUser();
    } catch (refreshError) {
      console.warn('Failed to refresh user data:', refreshError);
      // Don't block the flow if this fails
    }
    
    // Close progress dialog
    setShowProgressDialog(false);
    setCreationStatus(null);
    
    toast.success("Account created successfully!");
    
    // Ensure account_id exists and is valid before redirecting
    if (!accountData || !accountData.account_id) {
      console.error('Account created but account_id is missing:', accountData);
      toast.error('Account created but account ID is missing. Please refresh the page.');
      return;
    }
    
    // Convert account_id to string to ensure proper routing
    const accountId = String(accountData.account_id).trim();
    
    // Validate accountId is not empty
    if (!accountId || accountId === 'undefined' || accountId === 'null') {
      console.error('Invalid account_id:', accountData.account_id, 'converted to:', accountId);
      toast.error('Invalid account ID. Please refresh the page.');
      return;
    }
    
    console.log('Redirecting to account detail page with account_id:', accountId);
    
    // Save account to cache before redirecting (this dispatches accountCacheUpdated event)
    saveAccountToCache(accountData);
    
    // Small delay to ensure cache is saved and Navigation component updates
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Wait a bit longer to ensure the account is available via API before redirecting
    // This prevents 404 errors if the account isn't immediately available
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Use router.replace instead of router.push to avoid back button issues
    const redirectUrl = `/accounts/${accountId}`;
    console.log('Redirecting to account detail page:', redirectUrl);
    router.replace(redirectUrl);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!token || !user?.id || !user?.email) {
      toast.error("Session expired. Please log in again.");
      return;
    }

    // Check server validation based on account type
    if (user?.broker === "Other") {
      // For "Other" account type, validate customServer input
      // Also check selectedServer in case it was set by the input field
      const serverValue = customServer || selectedServer;
      if (!serverValue || serverValue.trim() === "") {
        toast.error(t("Please enter a server name."));
        return;
      }
    } else {
      // For other account types, validate selectedServer dropdown
      if (selectedServer === undefined || selectedServer === "") {
        toast.error(t("Please select a server."));
        return;
      }
    }

    // Clear any existing warning when user tries to submit again
    setShowWrongCredentialWarning(false);
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      user_id: user.id,
      type: 1,
      login: formData.get("account_number") as string,
      password: formData.get("password") as string,
      server:
        user.broker === "Other"
          ? (customServer || selectedServer)
          : selectedServer === undefined
            ? "IronFX-Real1"
            : selectedServer,
      groupid: selectedRiskSetting,
      subscription: "auto",
      email: user.email,
      platform_type: user?.broker === "Other" ? selectedPlatform : "mt4",
      name: user.name
    };

    try {
      // Show progress dialog with initial status
      setShowProgressDialog(true);
      setCreationStatus({
        status: "initializing",
        progress: 0,
        step: "queued",
        step_description: t("Starting account creation process..."),
      });

      // Save progress dialog state to localStorage for page refresh recovery
      localStorage.setItem(
        "accountCreationStatus",
        JSON.stringify({
          status: {
            status: "initializing",
            progress: 0,
            step: "queued",
            step_description: t("Starting account creation process..."),
          },
          timestamp: Date.now(),
          userId: user.id,
        })
      );

      // Small delay to ensure progress dialog is visible first
      setTimeout(() => {
        startPolling();
      }, 500);

      const newAccount = await accountsApi.createAccount(token, data);
      
      // If account was created successfully with account_id, handle it immediately
      if (newAccount && newAccount.account_id) {
        // Stop polling since account is already created
        setIsPolling(false);
        isPollingRef.current = false;
        localStorage.removeItem("accountCreationStatus");
        
        // Cache account_id for faster future access
        try {
          localStorage.setItem(`account_id_${user.id}`, newAccount.account_id);
        } catch (error) {
          console.warn('Failed to cache account_id:', error);
        }
        
        // Invalidate cache after account creation
        clearCache();
        
        // Check balance for restricted users
        if (user?.restricted_user === 1) {
          // If balance is undefined or 0, wait for it to be fetched
          if (newAccount.balance === undefined || newAccount.balance === 0) {
            // Wait for balance to be fetched (up to 30 seconds)
            let balanceCheckAttempts = 0;
            const maxBalanceChecks = 10; // 10 attempts * 3 seconds = 30 seconds
            
            const checkBalance = async (): Promise<boolean> => {
              try {
                const updatedAccountData = await accountsApi.getAccountById(
                  token,
                  newAccount.account_id
                );

                if (
                  updatedAccountData &&
                  updatedAccountData.balance !== undefined &&
                  updatedAccountData.balance > 0
                ) {
                  if (updatedAccountData.balance < 350) {
                    // Insufficient balance - delete account
                    try {
                      await accountsApi.deleteAccount(token, {
                        account_id: updatedAccountData.account_id,
                        login: updatedAccountData.login,
                        email: user.email,
                      });

                      // Update user connected status to false
                      try {
                        await accountsApi.updateConnectedStatus(token, false);
                        localStorage.setItem(`user_connected_${user.id}`, JSON.stringify(false));
                        window.dispatchEvent(new Event('connectedStatusUpdated'));
                      } catch (connectedError) {
                        console.warn('Failed to update connected status:', connectedError);
                      }

                      setShowProgressDialog(false);
                      toast.error(
                        "Account removed: Balance must be at least €350 for restricted users."
                      );
                      router.push("/accounts?balance=true");
                      return true;
                    } catch (deleteError) {
                      console.error("Error deleting account with insufficient balance:", deleteError);
                      toast.error("Failed to remove account with insufficient balance");
                      return true;
                    }
                  } else {
                    // Balance is sufficient - proceed with success flow
                    await handleAccountCreationSuccess(updatedAccountData);
                    return true;
                  }
                } else {
                  balanceCheckAttempts++;
                  if (balanceCheckAttempts < maxBalanceChecks) {
                    // Wait 3 seconds before next check
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    return await checkBalance();
                  } else {
                    // Timeout - proceed anyway
                    await handleAccountCreationSuccess(newAccount);
                    return true;
                  }
                }
              } catch (error: any) {
                // Only set server status to offline for actual server errors (500, 502, 503, etc.) or CORS errors
                // 404 (account not found) and 401 (session expired) are expected responses, not server issues
                const errorMessage = error?.message || String(error || '');
                const errorName = error?.name || '';
                const errorStatus = error?.status;
                const isSessionExpired = errorMessage === 'Session expired';
                const isNotFound = errorStatus === 404 || errorMessage.includes('404');
                const isUnauthorized = errorStatus === 401 || isSessionExpired;
                
                // Only trigger server maintenance for actual server errors (not 404 or 401)
                if (!isNotFound && !isUnauthorized && (errorName === 'TypeError' || errorStatus)) {
                  setServerStatus('offline');
                }
                console.error("Error checking balance:", error);
                // On error, proceed anyway
                await handleAccountCreationSuccess(newAccount);
                return true;
              }
            };
            
            // Start balance checking
            await checkBalance();
          } else if (newAccount.balance < 350) {
            // Balance is insufficient - delete account
            try {
              await accountsApi.deleteAccount(token, {
                account_id: newAccount.account_id,
                login: newAccount.login,
                email: user.email,
              });

              // Update user connected status to false
              try {
                await accountsApi.updateConnectedStatus(token, false);
                localStorage.setItem(`user_connected_${user.id}`, JSON.stringify(false));
                window.dispatchEvent(new Event('connectedStatusUpdated'));
              } catch (connectedError) {
                console.warn('Failed to update connected status:', connectedError);
              }

              setShowProgressDialog(false);
              toast.error(
                "Account removed: Balance must be at least €350 for restricted users."
              );
              router.push("/accounts?balance=true");
            } catch (deleteError) {
              console.error("Error deleting account with insufficient balance:", deleteError);
              toast.error("Failed to remove account with insufficient balance");
              setShowProgressDialog(false);
            }
          } else {
            // Balance is sufficient - proceed with success flow
            await handleAccountCreationSuccess(newAccount);
          }
        } else {
          // Not a restricted user - proceed with success flow
          await handleAccountCreationSuccess(newAccount);
        }
      } else {
        // Account created but no account_id - continue polling
        clearCache();
        setIsLoadingAccounts(true);
      }
    } catch (error) {
      console.error("Error connecting account:", error);

      // During account creation, ANY error should be treated as wrong credentials
      // Stop polling immediately for any error
      setIsPolling(false);
      isPollingRef.current = false;
      localStorage.removeItem("accountCreationStatus");

      if (error instanceof WrongCredentialError) {
        // Show specific error message for wrong credentials
        toast.error(t(error.message));
        setShowWrongCredentialWarning(true);
      } else {
        // For any other error during account creation, treat as wrong credentials
        toast.error(t('Invalid account credentials. Please check your login details and try again.'));
        setShowWrongCredentialWarning(true);
      }
      
      setShowProgressDialog(false);
      setCreationStatus(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Mapping from risk setting names to groupid values
  const getGroupIdFromName = (name: string): string => {
    const groupIdMap: { [key: string]: string } = {
      low: "aXciiLZp",
      medium: "bXciiLZp",
      high: "tXciiLZp",
      pro: "wVZiiLZp",
      "pro+": "OJKiiLZp",
      "pro++": "LJKiiLZp",
      "pro+++": "ppKiiLZp",
    };
    return groupIdMap[name.toLowerCase()] || name;
  };

  const fetchRiskSettings = async (isBackgroundUpdate = false) => {
    if (!token) return;

    try {
      if (!isBackgroundUpdate) {
        setIsLoadingRiskSettings(true);
      }

      // Check cache first
      const cachedRiskSettings = loadRiskSettingsFromCache();
      
      if (cachedRiskSettings && !isBackgroundUpdate) {
        setRiskSettings(cachedRiskSettings);
        setIsLoadingRiskSettings(false);
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/simulation`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await response.json();

      if (data.success) {
        // Filter only enabled settings and map to RiskSettingConfig
        const enabledSettings: RiskSettingConfig[] = data.data
          .filter((setting: ApiRiskSetting) => setting.enabled)
          .map((setting: ApiRiskSetting) => ({
            id: setting.id,
            name: setting.name,
            group_id: setting.group_id,
            type: setting.type,
            display_order: setting.display_order,
            multiplier: setting.multiplier,
            min_deposit: setting.min_deposit,
            enabled: setting.enabled,
          }))
          .sort((a: RiskSettingConfig, b: RiskSettingConfig) => 
            a.display_order - b.display_order
          );

        // Check if data has actually changed (for background updates)
        if (isBackgroundUpdate) {
          const currentRiskSettings = riskSettings;
          
          // Only update if data has changed
          if (JSON.stringify(currentRiskSettings) !== JSON.stringify(enabledSettings)) {
            setRiskSettings(enabledSettings);
          }
        } else {
          // Initial load - always update
          setRiskSettings(enabledSettings);
        }

        // Save to cache
        saveRiskSettingsToCache(enabledSettings);
      } else {
        console.error("Failed to fetch risk settings:", data.message);
      }
    } catch (error) {
      console.error("Error fetching risk settings:", error);
    } finally {
      if (!isBackgroundUpdate) {
        setIsLoadingRiskSettings(false);
      }
    }
  };

  const canAccessProConfig = (setting: RiskSettingConfig) => {
    // For PRO types, check VIP level and balance
    // For Other users, use "other_pro" instead of "pro"
    const isProType = user?.broker === "Other" 
      ? setting.type === "other_pro" 
      : setting.type === "pro";
    
    if (isProType) {
      const userVipLevel = user?.is_vip || 0;
      const forcedProLevel = user?.forced_pro_level ?? null;

      // Map PRO configurations to VIP levels
      const vipLevelMap: { [key: string]: number } = {
        PRO: 1,
        "PRO+": 2,
        "PRO++": 3,
        "PRO+++": 4,
        "PRO++++": 5,
      };

      const requiredVipLevel = vipLevelMap[setting.name.toUpperCase()] || 0;
      const hasVipAccess = userVipLevel >= requiredVipLevel;

      // When forced_pro_level is set (not null), enable Pro without balance check (same level meaning as is_vip)
      const hasForcedProAccess = forcedProLevel != null && forcedProLevel >= requiredVipLevel;

      // Check if account has sufficient balance (using min_deposit from simulation API)
      const currentBalance = account?.balance || 0;
      const minDeposit = setting.min_deposit || 0;
      const hasBalanceAccess = currentBalance >= minDeposit;

      // Unlock if balance, VIP level, or forced Pro level is sufficient
      return hasBalanceAccess || hasVipAccess || hasForcedProAccess;
    }
    
    // For normal and other types, always accessible
    return true;
  };

  // Set default risk setting when settings are loaded
  useEffect(() => {
    if (riskSettings.length > 0 && (!selectedRiskSetting || selectedRiskSetting === "")) {
      // Filter settings based on user broker type
      const filteredSettings = riskSettings.filter((setting) => {
        if (user?.broker === "Other") {
          return setting.type === "other";
        } else {
          return setting.type === "normal";
        }
      });

      // Set the first available setting as default (sorted by display_order)
      if (filteredSettings.length > 0) {
        setSelectedRiskSetting(filteredSettings[0].group_id);
      }
    }
  }, [riskSettings, user?.broker, selectedRiskSetting]);

    // Show maintenance screen if server is offline or server_status is false
    if (user?.server_status === false) {
    return (
        <div className="min-h-screen bg-[#1a2234] flex items-center justify-center">
          <div className="text-center">
            <div className="mb-8">
              <img 
                src="/images/maintenance.png" 
                alt="Maintenance" 
                className="mx-auto w-64 h-64 object-contain"
              />
              </div>
            <h1 className="text-2xl font-bold text-white mb-4">
              {t('System Maintenance')}
            </h1>
            <p className="text-gray-400 text-lg">
              {t('Our servers are currently under maintenance. Please try again later.')}
            </p>
        </div>
      </div>
    );
  }

    // Show loading state while checking account status
    const isCheckingAccount = isLoadingAccounts && !cacheChecked;
    
    // Show form if:
    // 1. No account exists (should redirect)
    // 2. Progress dialog is showing (account creation in progress)
    // 3. Status was restored (account creation was in progress)
    // 4. Cache has been checked OR we're still checking (to show loading)
    // Only show form if no account exists (account is null or has no account_id)
    // Never show form if account exists - redirect will happen via useEffect
    const shouldShowForm = (!account || !account.account_id) && !showProgressDialog && !hasRestoredStatus && (cacheChecked || isCheckingAccount);

    return (
    <>
      {shouldShowForm && (
        <div className="px-4 sm:px-6 lg:px-8 pb-4 md:py-8">
        <div className="max-w-7xl mx-auto">
            <h1 className="text-xl md:text-2xl font-bold text-white mb-4 sm:mb-6">
              {t(
                user?.broker === "Other"
                  ? "Add MetaTrader Account"
                  : "Add MetaTrader 4 Account"
              )}
            </h1>

          {/* Platform Selection for Other Broker Users */}
          {user?.broker === "Other" && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-3">
                {t("Platform Type")}
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPlatform("mt4");
                    setShowWrongCredentialWarning(false);
                  }}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors relative ${
                    selectedPlatform === "mt4"
                      ? "bg-blue-600 text-white border border-blue-500"
                      : "bg-[#1a2234] text-gray-300 border border-[#2d3748] hover:bg-[#2d3748]"
                  }`}
                >
                  {t("MetaTrader 4")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPlatform("mt5");
                    setShowWrongCredentialWarning(false);
                  }}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors relative ${
                    selectedPlatform === "mt5"
                      ? "bg-blue-600 text-white border border-blue-500"
                      : "bg-[#1a2234] text-gray-300 border border-[#2d3748] hover:bg-[#2d3748]"
                  }`}
                >
                  {t("MetaTrader 5")}
                </button>
              </div>
              </div>
          )}
          
          {/* Warning message for restricted users - only show after checking account history */}
          {user?.restricted_user === 1 && hasConnectedAccount !== null && (
            <div className="bg-[#232b3e] border border-yellow-500/30 rounded-lg p-4 mb-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-yellow-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-gray-300">
                    <span className="font-medium text-yellow-400">
                      {t("Restricted Mode:")}
                    </span>{" "}
                    {hasConnectedAccount === false
                      ? t("Connect your MetaTrader to access the platform.")
                      : t("You must have at least €350 in your MetaTrader 4 account to access the platform.")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Warning message for removed account due to wrong credentials */}
          {(showRemovedWarning || showWrongCredentialWarning) && (
            <div className="bg-[#232b3e] border border-red-500/30 rounded-lg p-4 mb-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-yellow-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-gray-300">
                    {t(
                      "The account was removed because the account number, password, or server are incorrect. Please verify the information and try again."
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          <form
            onSubmit={handleSubmit}
            noValidate
            className="space-y-6 bg-[#232b3e] px-4 md:px-8 py-6 rounded-lg border border-[#2d3748]"
          >
            <div>
              <label
                htmlFor="account_number"
                className="block text-sm font-medium text-gray-300"
              >
                {t("Account Number")}
              </label>
              <input
                type="text"
                name="account_number"
                id="account_number"
                inputMode="numeric"
                pattern="[0-9]*"
                onChange={(e) => {
                  const onlyNums = e.target.value.replace(/[^0-9]/g, "");
                  e.target.value = onlyNums;
                  // Clear warning when user starts typing
                  setShowWrongCredentialWarning(false);
                }}
                autoComplete="off"
                required
                className="mt-1 block w-full rounded-md border-[#2d3748] bg-[#1a2234] text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-300"
              >
                {t("Password")}
              </label>
              <input
                type="password"
                name="password"
                id="password"
                autoComplete="new-password"
                onChange={() => setShowWrongCredentialWarning(false)}
                required
                className="mt-1 block w-full rounded-md border-[#2d3748] bg-[#1a2234] text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="server"
                className="block text-sm font-medium text-gray-300"
              >
                {t("Server")}
              </label>
              {servers.length > 0 ? (
                <select
                  name="server"
                  id="server"
                  value={selectedServer}
                  onChange={(e) => {
                    setSelectedServer(e.target.value);
                    setShowWrongCredentialWarning(false);
                  }}
                  className="mt-1 block w-full rounded-md border-[#2d3748] bg-[#1a2234] text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                >
                  <option value="">{t("Please select a server")}</option>
                  {filteredServers.map((server) => (
                    <option key={server.id} value={server.value}>
                      {server.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  name="server"
                  id="server"
                  value={customServer}
                  onChange={(e) => {
                    setCustomServer(e.target.value);
                    setSelectedServer(e.target.value);
                    setShowWrongCredentialWarning(false);
                  }}
                  placeholder={t("Enter server name")}
                  className="mt-1 block w-full rounded-md border-[#2d3748] bg-[#1a2234] text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                />
              )}
            </div>

            {/* Configuration Section */}
            <div>
              <label className="block text-lg font-semibold text-white text-gray-300 mb-4">
                {t("Setting")}
              </label>
              
              {(() => {
                // Filter settings based on user broker type
                // For "Other" broker users:
                //   - Normal buttons: only show "other" type (exclude "normal" type)
                //   - PRO buttons: only show "other_pro" type (exclude "pro" type)
                // For other brokers:
                //   - Normal buttons: only show "normal" type
                //   - PRO buttons: only show "pro" type
                const normalSettings = riskSettings
                  .filter((s) => {
                    if (user?.broker === "Other") {
                      // For Other users, show all buttons with type "other"
                      return s.type === "other";
                    } else {
                      return s.type === "normal";
                    }
                  })
                  .sort((a, b) => a.display_order - b.display_order);
                const proSettings = riskSettings
                  .filter((s) => user?.broker === "Other" 
                    ? s.type === "other_pro" 
                    : s.type === "pro")
                  .sort((a, b) => a.display_order - b.display_order);
                const otherSettings = riskSettings
                  .filter((s) => s.type === "other")
                  .sort((a, b) => a.display_order - b.display_order);

                // Render button for a setting
                const renderSettingButton = (setting: RiskSettingConfig, isPro: boolean = false) => {
                  const isAccessible = canAccessProConfig(setting);
                  const isSelected = selectedRiskSetting === setting.group_id;

                  return (
                    <div
                      key={setting.id}
                      className={`relative group ${isPro ? "flex-1" : "flex-1"}`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (isAccessible) {
                            setSelectedRiskSetting(setting.group_id);
                            setShowWrongCredentialWarning(false);
                          }
                        }}
                        disabled={!isAccessible}
                        className={`w-full px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 relative overflow-hidden ${
                          isSelected
                            ? isPro
                              ? "bg-[#9333EA] text-white border border-[#9333EA]"
                              : "bg-blue-600 text-white border border-blue-500"
                            : isAccessible
                              ? "bg-[#1a2234] text-gray-300 border border-[#2d3748] hover:bg-[#2d3748]"
                              : "bg-gradient-to-br from-[#1a2234] to-[#2d3748] text-gray-400 border-2 border-[#2d3748] hover:border-[#4a5568] hover:shadow-md cursor-pointer"
                        }`}
                      >
                        <div className="flex items-center justify-center gap-2">
                          {!isAccessible && (
                            <FaLock className="text-yellow-500 text-xs" />
                          )}
                          <span className={!isAccessible ? "text-gray-300" : ""}>
                            {t(setting.name)}
                          </span>
                        </div>
                        {/* Shimmer effect for locked buttons */}
                        {!isAccessible && (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-500/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                        )}
                      </button>

                      {/* Enhanced tooltip for locked configurations */}
                      {!isAccessible && (
                        <>
                          {/* Desktop tooltip */}
                          <div className="hidden lg:block absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 px-4 py-3 bg-[#1a2234] text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50 shadow-xl border border-[#2d3748] min-w-[240px] whitespace-normal">
                            <div className="flex items-center gap-2 mb-2">
                              <FaLock className="text-yellow-400 flex-shrink-0 w-3 h-3" />
                              <span className="font-semibold text-yellow-400">
                                {t(setting.name)} {t("Locked")}
                              </span>
                            </div>
                            <div className="text-gray-300 text-xs space-y-1">
                              <div className="mb-1 flex items-center gap-2">
                                <span className="text-yellow-400 flex-shrink-0 w-3 h-3 flex items-center justify-center">💰</span>
                                <span>{t("Minimum balance required")}: <span className="text-yellow-400 font-semibold">€{setting.min_deposit.toLocaleString()}</span></span>
                              </div>
                              <div className="mb-1 flex items-center gap-2">
                                <FaChartLine className="text-yellow-400 flex-shrink-0 w-3 h-3" />
                                <span>{t("More advanced strategy")}</span>
                              </div>
                              {/* Hide "Trades Gold and Crypto" for Other users' PRO buttons */}
                              {!(user?.broker === "Other" && isPro) && (
                                <div className="mb-1 flex items-center gap-2">
                                  <FaCoins className="text-yellow-400 flex-shrink-0 w-3 h-3" />
                                  <span>{t("Trades Gold and Crypto")}</span>
                                </div>
                              )}
                            </div>
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-[#1a2234]"></div>
                          </div>
                          {/* Mobile tooltip - centered on screen */}
                          <div className="lg:hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none">
                            <div className="mx-4 px-4 py-3 bg-[#1a2234] text-white text-sm rounded-lg shadow-xl border border-[#2d3748] max-w-[280px] w-full">
                              <div className="flex items-center gap-2 mb-2">
                                <FaLock className="text-yellow-400 flex-shrink-0 w-3 h-3" />
                                <span className="font-semibold text-yellow-400">
                                  {t(setting.name)} {t("Locked")}
                                </span>
                              </div>
                              <div className="text-gray-300 text-xs space-y-1">
                                <div className="mb-1 flex items-center gap-2">
                                  <span className="text-yellow-400 flex-shrink-0 w-3 h-3 flex items-center justify-center">💰</span>
                                  <span>{t("Minimum balance required")}: <span className="text-yellow-400 font-semibold">€{setting.min_deposit.toLocaleString()}</span></span>
                                </div>
                                <div className="mb-1 flex items-center gap-2">
                                  <FaChartLine className="text-yellow-400 flex-shrink-0 w-3 h-3" />
                                  <span>{t("More advanced strategy")}</span>
                                </div>
                                {/* Hide "Trades Gold and Crypto" for Other users' PRO buttons */}
                                {!(user?.broker === "Other" && isPro) && (
                                  <div className="mb-1 flex items-center gap-2">
                                    <FaCoins className="text-yellow-400 flex-shrink-0 w-3 h-3" />
                                    <span>{t("Trades Gold and Crypto")}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                };

                return (
                  <>
                    {/* For Other users, show other type settings and PRO settings */}
                    {user?.broker === "Other" && (
                      <>
                        {normalSettings.length > 0 && (
                          <div>
                            <h4 className="text-md font-medium text-gray-300 mb-4">
                              {t("Normal User")}
                            </h4>
                            <div className="grid grid-cols-2 gap-2 lg:flex lg:gap-2">
                              {normalSettings.map((setting) => renderSettingButton(setting))}
                            </div>
                          </div>
                        )}

                        {/* PRO User Settings for Other broker */}
                        {proSettings.length > 0 && (
                          <div className="mt-6">
                            <h4 className="text-md font-medium text-gray-300 mb-4 flex items-center">
                              <FaCrown className="mr-2 text-yellow-500" />
                              {t("PRO Users")}
                            </h4>
                            <div className="grid grid-cols-2 gap-2">
                              {proSettings.map((setting) => renderSettingButton(setting, true))}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* For normal users, show normal and pro settings */}
                    {user?.broker !== "Other" && (
                      <>
                        {/* Normal User Settings */}
                        {normalSettings.length > 0 && (
                          <div>
                            <h4 className="text-md font-medium text-gray-300 mb-4">
                              {t("Normal User")}
                            </h4>
                            <div className="grid grid-cols-2 gap-2 lg:flex lg:gap-2">
                              {normalSettings.map((setting) => renderSettingButton(setting))}
                            </div>
                          </div>
                        )}

                        {/* PRO User Settings */}
                        {proSettings.length > 0 && (
                          <div className="mt-6">
                            <h4 className="text-md font-medium text-gray-300 mb-4 flex items-center">
                              <FaCrown className="mr-2 text-yellow-500" />
                              {t("PRO Users")}
                            </h4>
                            <div className="grid grid-cols-2 gap-2">
                              {proSettings.map((setting) => renderSettingButton(setting, true))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
            <input
              type="hidden"
              name="risk_setting"
              value={selectedRiskSetting}
              required
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isLoading || isCheckingAccount}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading || isCheckingAccount ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {isLoading ? t("Adding...") : t("Checking account status...")}
                  </>
                ) : (
                  t("Add Account")
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
      )}

      {/* Account Creation Progress Dialog */}
      {(showProgressDialog || hasRestoredStatus) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto modal-overlay">
          <div className="bg-[#232b3e] rounded-2xl p-6 md:p-8 max-w-md mx-4 my-4 border border-[#2d3748] shadow-xl min-h-fit max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-white mb-2">
                {t("Connecting Your Account")}
              </h3>
              <p className="text-gray-400 text-sm">
                {t("Please wait while we connect your trading account...")}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-300">
                  {t("Progress")}
                </span>
                <span className="text-sm font-medium text-blue-400">
                  {creationStatus?.progress || 0}%
                </span>
              </div>
              <div className="w-full bg-[#1a2234] rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${creationStatus?.progress || 0}%` }}
                ></div>
              </div>
            </div>

            {/* Steps */}
            <div className="space-y-4 mb-6">
              {[
                {
                  key: "queued",
                  label: t("Queued"),
                  description: t(
                    "Your account is queued for connection. Please wait..."
                  ),
                },
                {
                  key: "initializing",
                  label: t("Initializing"),
                  description: t("Connecting to your trading account"),
                },
                {
                  key: "automating_login",
                  label: t("Connecting to Server"),
                  description: t("Establishing connection to MetaTrader"),
                },
                {
                  key: "validating_credentials",
                  label: t("Validating Credentials"),
                  description: t("Validating account credentials"),
                },
                {
                  key: "completed",
                  label: t("Completed"),
                  description: t("Account successfully connected"),
                },
              ].map((step) => {
                const getStepStatus = (stepKey: string) => {
                  if (!creationStatus) return "pending";

                  // Define the step order
                  const stepOrder = [
                    "queued",
                    "initializing",
                    "copying_resources",
                    "executing_terminal",
                    "testing_automation",
                    "launching_terminal",
                    "waiting_terminal_ready",
                    "automating_login",
                    "validating_credentials",
                    "reading_account_data",
                    "completed",
                  ];

                  // Get indices
                  const stepKeyIndex = stepOrder.indexOf(stepKey);
                  const currentStepIndex = stepOrder.indexOf(
                    creationStatus.step
                  );

                  // If current step index is greater than or equal to step key index, it's completed
                  if (currentStepIndex > stepKeyIndex) {
                    return "completed";
                  }

                  // If current step index equals step key index, it's current
                  if (currentStepIndex === stepKeyIndex) {
                    return "current";
                  }

                  // Otherwise it's pending
                  return "pending";
                };

                const stepStatus = getStepStatus(step.key);

                return (
                  <div key={step.key} className="flex items-start space-x-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        stepStatus === "completed"
                          ? "bg-green-500"
                          : stepStatus === "current"
                            ? "bg-blue-500"
                            : "bg-gray-600"
                      }`}
                    >
                      {stepStatus === "completed" ? (
                        <svg
                          className="w-5 h-5 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : stepStatus === "current" ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <div className="w-4 h-4 bg-gray-400 rounded-full"></div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4
                          className={`text-sm font-medium ${
                            stepStatus === "completed"
                              ? "text-green-400"
                              : stepStatus === "current"
                                ? "text-blue-400"
                                : "text-gray-400"
                          }`}
                        >
                          {step.label}
                        </h4>
                        {stepStatus === "current" && (
                          <div className="flex items-center space-x-1">
                            <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse"></div>
                            <div
                              className="w-1 h-1 bg-blue-400 rounded-full animate-pulse"
                              style={{ animationDelay: "0.2s" }}
                            ></div>
                            <div
                              className="w-1 h-1 bg-blue-400 rounded-full animate-pulse"
                              style={{ animationDelay: "0.4s" }}
                            ></div>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {step.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
