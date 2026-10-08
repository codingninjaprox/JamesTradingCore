'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/utils/translation';
import { accountsApi, accountUtils, type Account } from '@/utils/accounts';
import { FaCrown, FaPause, FaTrash, FaPlay, FaLock, FaChartLine, FaSync, FaCoins } from 'react-icons/fa';

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

interface ProConfig {
  id: string;
  name: string;
  value: string;
  requiredBalance: number;
  icon?: string;
}

export default function AccountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, token, forceRefreshUser } = useAuth();
  const { translations } = useLanguage();
  const t = (key: string) => getTranslation(translations, key);

  const [account, setAccount] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [servers, setServers] = useState<Server[]>([]);
  const [enabledRiskSettings, setEnabledRiskSettings] = useState<RiskSetting[]>([]);
  const [selectedServer, setSelectedServer] = useState('');
  const [selectedRiskSetting, setSelectedRiskSetting] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingBalance, setIsUpdatingBalance] = useState(false);
  const [balanceUpdateAttempts, setBalanceUpdateAttempts] = useState(0);
  const [credentialsFailed, setCredentialsFailed] = useState(false);
  const [apiRiskSettings, setApiRiskSettings] = useState<ApiRiskSetting[]>([]);
  const [showCredentialWarning, setShowCredentialWarning] = useState(false);
  const [isAutoDeleting, setIsAutoDeleting] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [serverStatus, setServerStatus] = useState<'online' | 'offline'>('online');

  // Edit Settings state
  const [showEditSettings, setShowEditSettings] = useState(false);
  const [showActivePairs, setShowActivePairs] = useState(false);
  const [riskPer1000, setRiskPer1000] = useState('');
  const [riskPer1000XAUUSD, setRiskPer1000XAUUSD] = useState('');
  const [riskPer1000BTCUSD, setRiskPer1000BTCUSD] = useState('');
  const [activePairs, setActivePairs] = useState<string[]>([]);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isResettingSettings, setIsResettingSettings] = useState(false);
  const [eaSettingsContent, setEaSettingsContent] = useState<string>('');
  const [isLoadingEaSettings, setIsLoadingEaSettings] = useState(false);

  // PRO configurations will be dynamically generated from API data
  const [proConfigs, setProConfigs] = useState<ProConfig[]>([]);

  // Refs to prevent concurrent API calls
  const isFetchingDataRef = useRef(false);
  const isRefreshingUserRef = useRef(false);
  const isCheckingServerStatusRef = useRef(false);

  // Cache management functions
  const getSettingsCacheKey = () => `settings_${user?.id}`
  const getAccountCacheKey = () => `account_${user?.id}`
  const getProSettingsCacheKey = () => `pro_settings_${user?.id}`
  const getTradingSettingsCacheKey = () => `trading_settings_${user?.id}_${account?.account_id}`
  const getEaSettingsCacheKey = () => `ea_settings_${user?.id}_${account?.account_id}`
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

  const saveProSettingsToCache = (data: any) => {
    if (!user?.id) return
    try {
      const cacheData = {
        data,
        timestamp: Date.now(),
        expiry: getCacheExpiry()
      }
      localStorage.setItem(getProSettingsCacheKey(), JSON.stringify(cacheData))
    } catch (error) {
      console.error('Error saving PRO settings to cache:', error)
    }
  }

  const loadProSettingsFromCache = () => {
    if (!user?.id) return null
    try {
      const cached = localStorage.getItem(getProSettingsCacheKey())
      if (!cached) return null

      const cacheData = JSON.parse(cached)
      const now = Date.now()

      // Check if cache is expired
      if (now - cacheData.timestamp > cacheData.expiry) {
        localStorage.removeItem(getProSettingsCacheKey())
        return null
      }

      return cacheData.data
    } catch (error) {
      console.error('Error loading PRO settings from cache:', error)
      return null
    }
  }

  const saveTradingSettingsToCache = (data: any) => {
    if (!user?.id || !account?.account_id) return
    try {
      const cacheData = {
        data,
        timestamp: Date.now(),
        expiry: getCacheExpiry()
      }
      localStorage.setItem(getTradingSettingsCacheKey(), JSON.stringify(cacheData))
    } catch (error) {
      console.error('Error saving trading settings to cache:', error)
    }
  }

  const loadTradingSettingsFromCache = () => {
    if (!user?.id || !account?.account_id) return null
    try {
      const cached = localStorage.getItem(getTradingSettingsCacheKey())
      if (!cached) return null

      const cacheData = JSON.parse(cached)
      const now = Date.now()

      // Check if cache is expired
      if (now - cacheData.timestamp > cacheData.expiry) {
        localStorage.removeItem(getTradingSettingsCacheKey())
        return null
      }

      return cacheData.data
    } catch (error) {
      console.error('Error loading trading settings from cache:', error)
      return null
    }
  }

  const saveEaSettingsToCache = (data: any) => {
    if (!user?.id || !account?.account_id) return
    try {
      const cacheData = {
        data,
        timestamp: Date.now(),
        expiry: getCacheExpiry()
      }
      localStorage.setItem(getEaSettingsCacheKey(), JSON.stringify(cacheData))
      console.log('[EA Settings] Saved to cache');
    } catch (error) {
      console.error('Error saving EA settings to cache:', error)
    }
  }

  const loadEaSettingsFromCache = () => {
    if (!user?.id || !account?.account_id) return null
    try {
      const cached = localStorage.getItem(getEaSettingsCacheKey())
      if (!cached) return null

      const cacheData = JSON.parse(cached)
      const now = Date.now()

      // Check if cache is expired
      if (now - cacheData.timestamp > cacheData.expiry) {
        localStorage.removeItem(getEaSettingsCacheKey())
        return null
      }

      console.log('[EA Settings] Loaded from cache');
      return cacheData.data
    } catch (error) {
      console.error('Error loading EA settings from cache:', error)
      return null
    }
  }

  const clearCache = () => {
    if (!user?.id) return
    try {
      localStorage.removeItem(getSettingsCacheKey())
      localStorage.removeItem(getAccountCacheKey())
      localStorage.removeItem(getProSettingsCacheKey())
      if (account?.account_id) {
        localStorage.removeItem(getTradingSettingsCacheKey())
        localStorage.removeItem(getEaSettingsCacheKey())
      }

      // Dispatch event to notify navigation component
      window.dispatchEvent(new Event('accountDeleted'));
    } catch (error) {
      console.error('Error clearing cache:', error)
    }
  }

  // Check server status with retry mechanism
  const checkServerStatus = async () => {
    // Prevent concurrent calls
    if (isCheckingServerStatusRef.current) {
      return;
    }

    const maxRetries = 5;
    let retryCount = 0;

    try {
      isCheckingServerStatusRef.current = true;
      while (retryCount < maxRetries) {
        try {
          const response = await fetch('https://api.jamestradinggroup.com/api/status', {
            method: 'GET',
          });

          if (response.ok) {
            const data = await response.json();
            if (data.status === 'ready') {
              setServerStatus('online');
              return; // Success, exit the retry loop
            } else {
              setServerStatus('offline');
              return; // Server responded but not ready, exit the retry loop
            }
          } else {
            retryCount++;
            if (retryCount < maxRetries) {
              console.log(`Server status check failed (attempt ${retryCount}/${maxRetries}), retrying...`);
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
              continue;
            } else {
              setServerStatus('offline');
              return;
            }
          }
        } catch (error) {
          retryCount++;
          console.error(`Server status check failed (attempt ${retryCount}/${maxRetries}):`, error);

          if (retryCount < maxRetries) {
            console.log('Retrying server status check...');
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
          } else {
            console.error('Server status check failed after 3 attempts, assuming maintenance');
            setServerStatus('offline');
            return;
          }
        }
      }
    } finally {
      isCheckingServerStatusRef.current = false;
    }
  }

  useEffect(() => {
    if (token && params.id && user?.id) {
      let isMounted = true;
      let refreshUserTimeout: NodeJS.Timeout | null = null;

      // Load cached data immediately
      const cachedSettings = loadSettingsFromCache();
      if (cachedSettings) {
        setServers(cachedSettings.servers);
        setEnabledRiskSettings(cachedSettings.enabledRiskSettings);
        setIsLoadingSettings(false);
      }

      const cachedAccount = loadAccountFromCache();
      if (cachedAccount) {
        setAccount(cachedAccount);
        setSelectedServer(cachedAccount.server);
        setSelectedRiskSetting(cachedAccount.groupid);
        setIsLoading(false);
        setIsInitialLoad(false);
      }

      const cachedProSettings = loadProSettingsFromCache();
      if (cachedProSettings) {
        setApiRiskSettings(cachedProSettings.apiRiskSettings);
        setProConfigs(cachedProSettings.proConfigs);
      }

      // Refresh user data from /api/auth/me when page loads (only once)
      if (!isRefreshingUserRef.current) {
        isRefreshingUserRef.current = true;
        forceRefreshUser()
          .catch((error) => {
            if (isMounted) {
              console.warn('Failed to refresh user data:', error);
            }
            // Don't block the flow if this fails
          })
          .finally(() => {
            // Reset after a delay to allow for future refreshes if needed
            refreshUserTimeout = setTimeout(() => {
              if (isMounted) {
                isRefreshingUserRef.current = false;
              }
            }, 2000);
          });
      }

      // Always fetch fresh data in background
      if (isMounted) {
        loadData(true);
      }

      // Set up polling to call loadData every 2 minutes
      const pollInterval = setInterval(async () => {
        if (!token || !user?.id || !isMounted) return;

        try {
          await loadData(true);
        } catch (error: any) {
          if (!isMounted) return;

          console.error("Error fetching accounts:", error);

          // Check if it's a CORS error (TypeError: Failed to fetch)
          const isCorsError = error instanceof TypeError && error.message === 'Failed to fetch';
          // Check if it's a 401 error (Session expired)
          const is401Error = error?.message === 'Session expired';

          // If user.connected is true, never redirect to account create page
          // User has an account, just API might be having issues
          if (user?.connected === true) {
            // If CORS error, 401, or other errors and connected is true, it means server maintenance
            if (isCorsError || is401Error) {
              console.log(`${isCorsError ? 'CORS' : '401'} error detected with connected=true in polling, treating as server maintenance`);
              setServerStatus('offline');
            }
            // Just log the error and continue polling
          } else {
            // User doesn't have connected account, redirect (unless 401 - let AuthContext handle it)
            if (!is401Error) {
              router.push(`/accounts`);
            }
          }
        }
      }, 120 * 1000); // 2 minutes in milliseconds

      // Cleanup on unmount
      return () => {
        isMounted = false;
        clearInterval(pollInterval);
        if (refreshUserTimeout) {
          clearTimeout(refreshUserTimeout);
        }
      };
    }
  }, [token, params.id, user?.id]);

  useEffect(() => {
    if (user?.restricted_user === 1 && account?.balance && account.balance >= 350) {
      // Only refresh if not already refreshing
      if (!isRefreshingUserRef.current) {
        isRefreshingUserRef.current = true;
        forceRefreshUser()
          .finally(() => {
            setTimeout(() => {
              isRefreshingUserRef.current = false;
            }, 2000);
          });
      }
    }
  }, [account, user?.restricted_user]);

  // Effect to automatically fetch balance when account has zero balance
  useEffect(() => {
    if (account && isConnected(account.state, account.balance) && isUpdatingBalance && !credentialsFailed && account.balance < 350 && user?.restricted_user === 1) {
      handleAutoDeleteAccount();
    }

    if (account && account.balance === 0 && balanceUpdateAttempts < 6 && !isUpdatingBalance && !credentialsFailed) {
      // For newly created accounts, wait longer before first attempt
      const initialDelay = balanceUpdateAttempts === 0 ? 15000 : 5 + (balanceUpdateAttempts * 3000); // 15s, 5s, 8s delays

      const timer = setTimeout(() => {
        fetchRealBalance();
      }, initialDelay);

      return () => clearTimeout(timer);
    }

    // Set credentials failed when 6 attempts are reached and balance is still 0
    if (account && account.balance === 0 && balanceUpdateAttempts >= 6 && !credentialsFailed) {
      setCredentialsFailed(true);

      // Wait 3 seconds, then automatically remove the account and redirect
      setTimeout(async () => {
        await handleAutoDeleteAccount();
      }, 3000);
    }
  }, [account, balanceUpdateAttempts, isUpdatingBalance, credentialsFailed]);

  const handleAutoDeleteAccount = async () => {
    if (!token || !user?.id || !user?.email || !account || isAutoDeleting) return;

    setIsAutoDeleting(true);

    try {
      if (!(account && isConnected(account.state, account.balance) && isUpdatingBalance && !credentialsFailed && account.balance < 350 && user?.restricted_user === 1)) {
        // Show error message first
        toast.error(t('Invalid account credentials. The account will be removed automatically.'));
      }

      // Delete the failed account
      await accountsApi.deleteAccount(token, {
        account_id: account.account_id,
        login: account.login,
        email: user.email,
      });

      // Update user connected status to false after account deletion
      try {
        await accountsApi.updateConnectedStatus(token, false);

        // Update connected status in localStorage
        try {
          if (user?.id) {
            localStorage.setItem(`user_connected_${user.id}`, JSON.stringify(false));
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

      // Clear all cache after account deletion
      clearCache();

      // Force refresh user to get updated connected status
      await forceRefreshUser();

      // Only redirect if connected is false (after deletion, connected should be false)
      // Check connected status from localStorage (updated synchronously) or user state
      const connectedStatus = user?.id
        ? (() => {
          try {
            const cached = localStorage.getItem(`user_connected_${user.id}`);
            return cached ? JSON.parse(cached) === false : user?.connected === false;
          } catch {
            return user?.connected === false;
          }
        })()
        : user?.connected === false;

      if (connectedStatus) {
        if (account && isConnected(account.state, account.balance) && isUpdatingBalance && !credentialsFailed && account.balance < 350 && user?.restricted_user === 1) {
          router.push('/accounts?balance=true');
        } else {
          // Redirect to accounts page to show the warning message
          router.push('/accounts?remove=true');
        }
      }
      // If connected is still true, don't redirect (server issue or API not updated yet)
    } catch (deleteError) {
      console.error('Error auto-deleting failed account:', deleteError);
      toast.error(t('Failed to remove account automatically'));
      // Clear cache even if deletion fails
      clearCache();

      // Only redirect if connected is false
      await forceRefreshUser();

      // Check connected status from localStorage (updated synchronously) or user state
      const connectedStatus = user?.id
        ? (() => {
          try {
            const cached = localStorage.getItem(`user_connected_${user.id}`);
            return cached ? JSON.parse(cached) === false : user?.connected === false;
          } catch {
            return user?.connected === false;
          }
        })()
        : user?.connected === false;

      if (connectedStatus) {
        router.push('/accounts');
      }
      // If connected is still true, don't redirect (server issue)
    } finally {
      setIsAutoDeleting(false);
    }
  };

  const fetchRealBalance = async () => {
    if (!token || !user?.id || !account || isUpdatingBalance) return;

    setIsUpdatingBalance(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/new-accounts/update-activity-balance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          account_id: account.account_id,
          user_id: user.id,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Update account balance, state, and status from the API response
          setAccount(prev => prev ? {
            ...prev,
            balance: result.balance,
            state: result.state,
            status: result.status
          } : null);

          // Force refresh user data to check if restricted status has changed
          await forceRefreshUser();

          // Show success message if restricted status was removed
          if (result.restricted_status_removed) {
            toast.success(t('Congratulations! Your account has been unlocked. You now have full access to all features.'));
          }
        }
      } else if (response.status === 202) {
        // Account not ready yet (202 Accepted)
        const result = await response.json();

        // Don't show error toast for the first few attempts to avoid spam
        if (balanceUpdateAttempts >= 2) {
          // toast.error(result.message || 'Account is being processed. Please try again in a few moments.');
        }
      } else if (response.status === 404) {
        // Account or activity not found
        const result = await response.json();
        // toast.error(result.message || 'Account not found');
      } else {
        const result = await response.json();
        // toast.error(result.message || 'Failed to update balance');
      }
    } catch (error) {
      console.error('Error fetching real balance:', error);
    } finally {
      setIsUpdatingBalance(false);
    }

    setBalanceUpdateAttempts(prev => prev + 1);
  };

  // Mapping from risk setting names to groupid values
  const getGroupIdFromName = (name: string): string => {
    const groupIdMap: { [key: string]: string } = {
      'low': 'aXciiLZp',
      'medium': 'bXciiLZp',
      'high': 'tXciiLZp',
      'pro': 'wVZiiLZp',
      'pro+': 'OJKiiLZp',
      'pro++': 'LJKiiLZp',
      'pro+++': 'ppKiiLZp',
    };
    return groupIdMap[name.toLowerCase()] || name;
  };

  const fetchRiskSettings = async (isBackgroundUpdate = false) => {
    try {
      // Check cache first
      const cachedProSettings = loadProSettingsFromCache();

      if (cachedProSettings && !isBackgroundUpdate) {
        setApiRiskSettings(cachedProSettings.apiRiskSettings);
        setProConfigs(cachedProSettings.proConfigs);
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/simulation`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();

      console.log('[PRO Settings] API Response:', data);
      console.log('[PRO Settings] User broker:', user?.broker);
      console.log('[PRO Settings] All settings:', data.data);

      if (data.success) {
        // Generate PRO configurations from API data
        // For "Other" broker users, use type "other_pro" instead of "pro"
        // For other brokers, use type "pro"
        const proType = user?.broker === 'Other' ? 'other_pro' : 'pro';
        const proSettings = data.data
          .filter((setting: ApiRiskSetting) =>
            setting.type === proType && setting.enabled
          )
          .sort((a: ApiRiskSetting, b: ApiRiskSetting) =>
            a.display_order - b.display_order
          );

        console.log('[PRO Settings] Filtered PRO settings:', proSettings);

        const generatedProConfigs = proSettings.map((setting: ApiRiskSetting) => ({
          id: setting.name,
          name: setting.name.toUpperCase(),
          value: setting.group_id || getGroupIdFromName(setting.name), // Use group_id from API if available
          requiredBalance: setting.min_deposit,
        }));

        console.log('[PRO Settings] Generated PRO configs:', generatedProConfigs);

        // Check if data has actually changed (for background updates)
        if (isBackgroundUpdate) {
          const currentApiRiskSettings = apiRiskSettings;
          const currentProConfigs = proConfigs;

          // Only update if data has changed
          if (JSON.stringify(currentApiRiskSettings) !== JSON.stringify(data.data) ||
            JSON.stringify(currentProConfigs) !== JSON.stringify(generatedProConfigs)) {
            setApiRiskSettings(data.data);
            setProConfigs(generatedProConfigs);
          }
        } else {
          // Initial load - always update
          setApiRiskSettings(data.data);
          setProConfigs(generatedProConfigs);
        }

        // Save to cache
        saveProSettingsToCache({
          apiRiskSettings: data.data,
          proConfigs: generatedProConfigs
        });
      } else {
        console.error('Failed to fetch risk settings:', data.message);
      }
    } catch (error) {
      console.error('Error fetching risk settings:', error);
    }
  };

  const loadData = async (isBackgroundUpdate = false) => {
    if (!token || !user?.id || !params.id) return;

    // Prevent concurrent calls
    if (isFetchingDataRef.current) {
      return;
    }

    try {
      isFetchingDataRef.current = true;
      if (!isBackgroundUpdate) {
        setIsLoading(true);
        setIsLoadingSettings(true);
      }

      // Check cache first for both settings and account data
      const cachedSettings = loadSettingsFromCache();
      const cachedAccount = loadAccountFromCache();

      let settingsData, accountData;
      let useCachedSettings = false;
      let useCachedAccount = false;

      // Check settings cache
      if (cachedSettings && !isBackgroundUpdate) {
        settingsData = cachedSettings;
        useCachedSettings = true;
      }

      // Check account cache
      if (cachedAccount && !isBackgroundUpdate) {
        accountData = cachedAccount;
        useCachedAccount = true;
      }

      // Fetch missing data in parallel
      const fetchPromises = [];
      if (!useCachedSettings) {
        fetchPromises.push(accountsApi.getSettings(token));
      }
      if (!useCachedAccount) {
        // Use getAccountById with account_id from URL params for faster and more accurate fetching
        fetchPromises.push(accountsApi.getAccountById(token, params.id as string));
      }

      if (fetchPromises.length > 0) {
        const results = await Promise.all(fetchPromises);
        let resultIndex = 0;

        if (!useCachedSettings) {
          settingsData = results[resultIndex++];
          // Save to cache
          saveSettingsToCache(settingsData);
        }

        if (!useCachedAccount) {
          accountData = results[resultIndex++];
          // Save to cache
          saveAccountToCache(accountData);
        }
      }

      // Check if data has actually changed (for background updates)
      if (isBackgroundUpdate) {
        const currentServers = servers;
        const currentRiskSettings = enabledRiskSettings;
        const currentAccount = account;

        // Only update if data has changed
        if (settingsData && (JSON.stringify(currentServers) !== JSON.stringify(settingsData.servers) ||
          JSON.stringify(currentRiskSettings) !== JSON.stringify(settingsData.enabledRiskSettings))) {
          setServers(settingsData.servers);
          setEnabledRiskSettings(settingsData.enabledRiskSettings);
        }

        if (accountData && JSON.stringify(currentAccount) !== JSON.stringify(accountData)) {
          setAccount(accountData);
          setSelectedServer(accountData.server);
          setSelectedRiskSetting(accountData.groupid);
        } else if (!accountData && user?.connected === true) {
          // 404 in background update with connected=true means server maintenance
          console.log('404 error detected in background update with connected=true, treating as server maintenance');
          setServerStatus('offline');
          // Don't update account state, keep current account data
        }
      } else {
        // Initial load - always update
        setServers(settingsData.servers);
        setEnabledRiskSettings(settingsData.enabledRiskSettings);

        // Find the specific account
        const foundAccount = accountData;
        if (foundAccount) {
          setAccount(foundAccount);
          setSelectedServer(foundAccount.server);
          setSelectedRiskSetting(foundAccount.groupid);
        } else {
          // Account not found - check if it's a newly created account by checking cache
          const cachedAccount = loadAccountFromCache();
          if (cachedAccount && cachedAccount.account_id === params.id) {
            // Use cached account if it matches the URL param
            setAccount(cachedAccount);
            setSelectedServer(cachedAccount.server);
            setSelectedRiskSetting(cachedAccount.groupid);
          } else {
            // Account not found (404) - but if user.connected is true, it means server maintenance
            if (user?.connected === true) {
              // User has connected account, 404 means server maintenance
              console.log('404 error detected with connected=true, treating as server maintenance');
              setServerStatus('offline');

              // Use cached account if available, or show error but stay on page
              if (cachedAccount) {
                setAccount(cachedAccount);
                setSelectedServer(cachedAccount.server);
                setSelectedRiskSetting(cachedAccount.groupid);
              } else if(user?.server_status === true) {
                toast.error('Unable to load account details. Please try again later.');
              }
            } else {
              // User doesn't have connected account, redirect to create page
              toast.error('Account not found');
              router.push('/accounts');
            }
          }
        }
      }

      // Fetch risk settings separately (this is less critical, can be async)
      fetchRiskSettings(isBackgroundUpdate);

    } catch (error: any) {
      console.error('Error loading data:', error);

      // Check if it's a CORS error (TypeError: Failed to fetch)
      const isCorsError = error instanceof TypeError && error.message === 'Failed to fetch';
      // Check if it's a 401 error (Session expired)
      const is401Error = error?.message === 'Session expired';

      // If user.connected is true, never redirect to account create page
      // User has an account, just API might be having issues (server maintenance, etc.)
      if (user?.connected === true) {
        // If CORS error, 401, or other errors and connected is true, it means server maintenance
        if (isCorsError || is401Error) {
          console.log(`${isCorsError ? 'CORS' : '401'} error detected with connected=true, treating as server maintenance`);
          setServerStatus('offline');
        }

        // Try to use cached account if available
        const cachedAccount = loadAccountFromCache();
        if (cachedAccount && cachedAccount.account_id === params.id) {
          setAccount(cachedAccount);
          setSelectedServer(cachedAccount.server);
          setSelectedRiskSetting(cachedAccount.groupid);
        } else {
          // Show error but stay on page - user has connected account
          toast.error('Unable to load account details. Please try again later.');
        }
        // Don't clear cache if user is connected - might need it
      } else {
        // User doesn't have connected account, clear cache and redirect
        // But don't redirect on 401 (session expired) - let AuthContext handle it
        if (!is401Error) {
          clearCache();
          console.log('isBackgroundUpdate', isBackgroundUpdate)
          router.push(`/accounts`);
        }
      }
    } finally {
      console.log('loadData: Fetch completed for account', params.id);
      isFetchingDataRef.current = false;
      if (!isBackgroundUpdate) {
        setIsLoading(false);
        setIsLoadingSettings(false);
        setIsInitialLoad(false);
      }
    }
  };

  const handleUpdateAccount = async () => {
    if (!token || !user?.id || !user?.email || !account) return;

    setIsUpdating(true);

    try {
      await accountsApi.updateAccount(token, {
        account_id: account.account_id,
        status: account.status.toString(),
        groupid: selectedRiskSetting,
        email: user.email,
      });

      // Invalidate cache after update
      clearCache();

      // Refetch account data to get all fields (balance, state, etc.)
      console.log('[Account Update] Refetching account data after update...');
      await loadData(true);
      console.log('[Account Update] Account data refreshed successfully');

      toast.success('Account configuration updated successfully');
    } catch (error) {
      console.error('Error updating account:', error);
      toast.error('Failed to update account configuration');
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePauseAccount = async () => {
    if (!token || !user?.id || !user?.email || !account) return;

    setIsPausing(true);

    try {
      await accountsApi.pauseAccount(token, {
        account_id: account.account_id,
        login: account.login,
        email: user.email,
      });

      setAccount(prev => prev ? { ...prev, status: 0 } : null);
      setShowPauseConfirm(false);
      toast.success('Account paused successfully');
    } catch (error) {
      console.error('Error pausing account:', error);
      toast.error('Failed to pause account');
    } finally {
      setIsPausing(false);
    }
  };

  const handleResumeAccount = async () => {
    if (!token || !user?.id || !user?.email || !account) return;

    setIsResuming(true);

    try {
      await accountsApi.resumeAccount(token, {
        account_id: account.account_id,
        login: account.login,
        email: user.email,
      });

      setAccount(prev => prev ? { ...prev, status: 1 } : null);
      setShowPauseConfirm(false);
      toast.success(t('Account resumed successfully'));
    } catch (error) {
      console.error('Error resuming account:', error);
      toast.error('Failed to resume account');
    } finally {
      setIsResuming(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!token || !user?.id || !user?.email || !account) return;

    setIsDeleting(true);

    try {
      await accountsApi.deleteAccount(token, {
        account_id: account.account_id,
        login: account.login,
        email: user.email,
      });

      // Update user connected status to false after account deletion
      try {
        await accountsApi.updateConnectedStatus(token, false);

        // Update connected status in localStorage
        try {
          if (user?.id) {
            localStorage.setItem(`user_connected_${user.id}`, JSON.stringify(false));
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

      setShowDeleteConfirm(false);
      toast.success(t('Account deleted successfully'));

      // Invalidate cache after deletion
      clearCache();

      // Force refresh user data to check if restricted status has changed
      await forceRefreshUser();

      // Only redirect if connected is false (after deletion, connected should be false)
      // Check connected status from localStorage (updated synchronously) or user state
      const connectedStatus = user?.id
        ? (() => {
          try {
            const cached = localStorage.getItem(`user_connected_${user.id}`);
            return cached ? JSON.parse(cached) === false : user?.connected === false;
          } catch {
            return user?.connected === false;
          }
        })()
        : user?.connected === false;

      if (connectedStatus) {
        router.push('/accounts');
      }
      // If connected is still true, don't redirect (server issue or API not updated yet)
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error('Failed to delete account');
    } finally {
      setIsDeleting(false);
    }
  };

  // Helper function to determine if account is connected (works for all languages)
  const isConnected = (state: string, balance: number) => {
    if (balance > 0) {
      return true;
    }
    const connectedKeywords = [
      'connected', 'conectado', 'connecté', 'verbunden', 'connesso', 'conectado', 'verbonden', 'połączony'
    ];

    const disconnectedKeywords = [
      'disconnected', 'desconectado', 'déconnecté', 'getrennt', 'disconnesso', 'desconectado', 'verbroken', 'rozłączony'
    ];

    const normalizedState = state?.toLowerCase().trim();

    // First check if it's explicitly disconnected
    if (disconnectedKeywords.some(keyword => normalizedState?.includes(keyword))) {
      return false;
    }

    // Then check if it's explicitly connected
    const isConnected = connectedKeywords.some(keyword => normalizedState?.includes(keyword));
    return isConnected;
  };

  // Helper function to determine if account is trading active (based on status field)
  const isTradingActive = (status: any) => {
    return status === 1 || status === "1";
  };

  // Available pairs for selection
  const availablePairs = [
    'AUDCAD', 'AUDCHF', 'AUDJPY', 'AUDNZD', 'AUDUSD',
    'CADCHF', 'CADJPY', 'CHFJPY', 'EURAUD', 'EURCAD',
    'EURCHF', 'EURGBP', 'EURJPY', 'EURNZD', 'EURUSD',
    'GBPAUD', 'GBPCAD', 'GBPCHF', 'GBPJPY', 'GBPNZD',
    'GBPUSD', 'NZDCAD', 'NZDCHF', 'NZDJPY', 'NZDUSD',
    'USDCAD', 'USDCHF', 'USDJPY'
  ];

  // PRO-only pairs
  const proPairs = ['BTCUSD', 'XAUUSD'];

  // Function to check if user can access a PRO config
  const canAccessProConfig = (config: ProConfig) => {
    // VIP system: 0=no access, 1=PRO, 2=PRO+, 3=PRO++, 4=PRO+++, 5=PRO++++
    const vipLevel = user?.is_vip || 0;
    const forcedProLevel = user?.forced_pro_level ?? null;

    // Map config names to VIP levels
    const configVipLevels: { [key: string]: number } = {
      'PRO': 1,
      'PRO+': 2,
      'PRO++': 3,
      'PRO+++': 4,
      'PRO++++': 5
    };

    // Check if user has sufficient VIP level for this config
    const requiredVipLevel = configVipLevels[config.name] || 0;
    const hasVipAccess = vipLevel >= requiredVipLevel;

    // When forced_pro_level is set (not null), enable Pro without balance check (same level meaning as is_vip)
    const hasForcedProAccess = forcedProLevel != null && forcedProLevel >= requiredVipLevel;

    // Check if account has sufficient balance (using config.requiredBalance which comes from min_deposit)
    const currentBalance = account?.balance || 0;
    const minDeposit = config.requiredBalance || 0;
    const hasBalanceAccess = currentBalance >= minDeposit;

    // Unlock if balance, VIP level, or forced Pro level is sufficient
    return hasBalanceAccess || hasVipAccess || hasForcedProAccess;
  };

  // Get "other" type settings for Other broker users
  // Show all buttons with type "other"
  const otherSettings = useMemo(() => {
    if (user?.broker !== 'Other') return [];
    return apiRiskSettings
      .filter((setting: ApiRiskSetting) => 
        setting.type === 'other' && 
        setting.enabled
      )
      .sort((a: ApiRiskSetting, b: ApiRiskSetting) => a.display_order - b.display_order);
  }, [apiRiskSettings, user?.broker]);

  // Get "normal" type settings for non-Other broker users
  const normalSettings = useMemo(() => {
    if (user?.broker === 'Other') return [];
    return apiRiskSettings
      .filter((setting: ApiRiskSetting) => 
        setting.type === 'normal' && 
        setting.enabled
      )
      .sort((a: ApiRiskSetting, b: ApiRiskSetting) => a.display_order - b.display_order);
  }, [apiRiskSettings, user?.broker]);

  // Get risk setting name from group_id using API data
  const getRiskSettingNameFromGroupId = (groupid: string): string => {
    if (!groupid) return '';
    // First try to find in API data
    const setting = apiRiskSettings.find((s: ApiRiskSetting) => s.group_id === groupid);
    if (setting) {
      return setting.name;
    }
    // Fallback to utility function for legacy group_ids
    return accountUtils.getRiskSettingName(groupid);
  };

  // Check if user is PRO - user is PRO if at least one PRO button is accessible
  const isProUser = useMemo(() => {
    // If no PRO configs exist, user is not PRO
    if (!proConfigs || proConfigs.length === 0) {
      console.log('[PRO User Check] No PRO configs available');
      return false;
    }

    // If API set forced_pro_level (not null), user is considered Pro without balance check
    const forcedProLevel = user?.forced_pro_level ?? null;
    if (forcedProLevel != null && forcedProLevel >= 1) {
      return true;
    }

    // Check if at least one PRO config is accessible
    const hasAccessibleProConfig = proConfigs.some(config => {
      // VIP system: 0=no access, 1=PRO, 2=PRO+, 3=PRO++, 4=PRO+++
      const vipLevel = user?.is_vip || 0;

      // Map config names to VIP levels
      const configVipLevels: { [key: string]: number } = {
        'PRO': 1,
        'PRO+': 2,
        'PRO++': 3,
        'PRO+++': 4,
        'PRO++++': 5
      };

      // Check if user has sufficient VIP level for this config
      const requiredVipLevel = configVipLevels[config.name] || 0;
      const hasVipAccess = vipLevel >= requiredVipLevel;

      // Check if account has sufficient balance (using config.requiredBalance)
      const hasBalanceAccess = account && account.balance >= config.requiredBalance;

      // Either VIP level OR balance requirement unlocks the configuration
      return hasVipAccess || hasBalanceAccess;
    });

    console.log('[PRO User Check] PRO configs:', proConfigs);
    console.log('[PRO User Check] Has accessible PRO config:', hasAccessibleProConfig);
    console.log('[PRO User Check] Is PRO user:', hasAccessibleProConfig);

    return hasAccessibleProConfig;
  }, [proConfigs, user, account]);

  const fetchEaSettings = useCallback(async () => {
    if (!token || !account?.account_id) {
      console.log('Cannot fetch EA settings: missing token or account_id');
      return;
    }

    // Check cache first and show cached data immediately
    const cachedEaSettings = loadEaSettingsFromCache();
    if (cachedEaSettings && cachedEaSettings.content) {
      console.log('[EA Settings] Loading cached EA settings...');
      setEaSettingsContent(cachedEaSettings.content);
      parseEaSettingsContent(cachedEaSettings.content);
    }

    setIsLoadingEaSettings(true);
    try {
      const accountId = account.account_id;
      console.log(`[EA Settings] Fetching EA settings from API for account ID: ${accountId}`);

      // Using account-based API endpoint (not groupid-based /api/configs/{groupId})
      // GET /api/accounts/{accountId}/setting - fetches EA .set file for the connected account
      const apiUrl = `https://api.jamestradinggroup.com/api/accounts/${accountId}/setting`;
      console.log(`[EA Settings] API URL: ${apiUrl}`);

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      console.log(`[EA Settings] Response status: ${response.status}`);

      if (response.ok) {
        const result = await response.json();
        console.log('[EA Settings] Response data received from API');

        if (result.content) {
          console.log('[EA Settings] EA .set content received from API:');
          console.log('--- EA Settings Content Start ---');
          console.log(result.content);
          console.log('--- EA Settings Content End ---');
          console.log(`[EA Settings] Content length: ${result.content.length} characters`);

          // Update state with fresh API data
          setEaSettingsContent(result.content);

          // Parse EA settings content to extract values
          parseEaSettingsContent(result.content);

          // Save to cache for next time
          saveEaSettingsToCache({
            content: result.content,
            account_id: result.account_id,
            login: result.login,
            platform_type: result.platform_type,
            setting_file: result.setting_file
          });
          console.log('[EA Settings] Updated cache with fresh API data');
        } else {
          console.log('[EA Settings] No content found in API response');
          setEaSettingsContent('');
        }
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('[EA Settings] Failed to fetch EA settings from API:', response.status, errorData);
        // Keep cached data if API fails
        if (!cachedEaSettings) {
          setEaSettingsContent('');
        }
      }
    } catch (error) {
      console.error('[EA Settings] Error fetching EA settings from API:', error);
      // Keep cached data if API fails
      if (!cachedEaSettings) {
        setEaSettingsContent('');
      }
    } finally {
      setIsLoadingEaSettings(false);
    }
  }, [token, account?.account_id]);

  // Parse EA settings content to extract values
  const parseEaSettingsContent = (content: string) => {
    console.log('[EA Settings] Parsing EA settings content...');

    // Parse Lots_Per_1000
    const lotsPer1000Match = content.match(/Lots_Per_1000=([\d.]+)/);
    if (lotsPer1000Match) {
      const value = lotsPer1000Match[1];
      console.log(`[EA Settings] Found Lots_Per_1000: ${value}`);
      setRiskPer1000(value);
    } else {
      console.log('[EA Settings] Lots_Per_1000 not found');
      setRiskPer1000('');
    }

    // Parse Gold_Lots_Per_1000 (only for PRO users)
    const goldLotsPer1000Match = content.match(/Gold_Lots_Per_1000=([\d.]+)/);
    if (goldLotsPer1000Match) {
      const value = goldLotsPer1000Match[1];
      console.log(`[EA Settings] Found Gold_Lots_Per_1000: ${value}`);
      setRiskPer1000XAUUSD(value);
    } else {
      console.log('[EA Settings] Gold_Lots_Per_1000 not found');
      setRiskPer1000XAUUSD('');
    }

    // Parse BTC_Lots_Per_1000 (only for PRO users)
    const btcLotsPer1000Match = content.match(/BTC_Lots_Per_1000=([\d.]+)/);
    if (btcLotsPer1000Match) {
      const value = btcLotsPer1000Match[1];
      console.log(`[EA Settings] Found BTC_Lots_Per_1000: ${value}`);
      setRiskPer1000BTCUSD(value);
    } else {
      console.log('[EA Settings] BTC_Lots_Per_1000 not found');
      setRiskPer1000BTCUSD('');
    }

    // Parse Trade On Symbol Settings to get active pairs
    console.log('[EA Settings] Parsing Trade On Symbol Settings...');
    const activePairsList: string[] = [];

    // Get pairs to parse: regular pairs always, PRO pairs only if user is PRO
    const pairsToParse = isProUser
      ? [...availablePairs, ...proPairs]  // All pairs for PRO users
      : availablePairs;  // Only regular pairs for non-PRO users

    // Parse each Trade_PAIR setting (only for pairs we should parse)
    pairsToParse.forEach((pair) => {
      // Match pattern: Trade_PAIRNAME=true or Trade_PAIRNAME=false
      const tradePattern = new RegExp(`Trade_${pair}=(true|false)`, 'i');
      const match = content.match(tradePattern);

      if (match) {
        const isActive = match[1].toLowerCase() === 'true';
        console.log(`[EA Settings] Trade_${pair}=${match[1]} -> ${isActive ? 'ACTIVE' : 'INACTIVE'}`);

        if (isActive) {
          activePairsList.push(pair);
        }
      } else {
        console.log(`[EA Settings] Trade_${pair} not found in content`);
      }
    });

    // For non-PRO users, don't parse PRO pairs (BTCUSD, XAUUSD) - leave them out of activePairsList
    if (!isProUser) {
      console.log('[EA Settings] Non-PRO user: Skipping Trade_BTCUSD and Trade_XAUUSD parsing');
    }

    console.log(`[EA Settings] Active pairs found: ${activePairsList.length}`);
    console.log('[EA Settings] Active pairs:', activePairsList);
    setActivePairs(activePairsList);
  };

  // Fetch EA settings when Edit Settings dialog opens
  useEffect(() => {
    if (showEditSettings && account?.account_id && token) {
      console.log('[EA Settings] ========================================');
      console.log('[EA Settings] Edit Settings dialog opened');
      console.log('[EA Settings] Calling GET /api/accounts/{accountId}/setting');
      console.log('[EA Settings] ========================================');
      fetchEaSettings();
    }
  }, [showEditSettings, account?.account_id, token, fetchEaSettings]);

  useEffect(() => {
    if (user?.server_status === false) {
      setServerStatus('offline');
    }
  }, [user]);

  const handleEditSettings = () => {
    setShowEditSettings(true);
    // Only fetch EA settings - fetchEaSettings() will be called automatically by useEffect when showEditSettings becomes true
    // Trading settings API (/api/new-accounts/trading-settings) is not needed when opening the dialog
  };

  const handleEditActivePairs = () => {
    setShowActivePairs(true);
  };

  const fetchTradingSettings = async (isBackgroundUpdate = false) => {
    if (!token || !user?.id || !account) return;

    try {
      // Check cache first
      const cachedTradingSettings = loadTradingSettingsFromCache();

      if (cachedTradingSettings && !isBackgroundUpdate) {
        setRiskPer1000(cachedTradingSettings.riskPer1000 || '');
        setRiskPer1000XAUUSD(cachedTradingSettings.riskPer1000XAUUSD || '');
        setRiskPer1000BTCUSD(cachedTradingSettings.riskPer1000BTCUSD || '');
        setActivePairs(cachedTradingSettings.activePairs);
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/new-accounts/trading-settings?login=${account.login}&user_id=${user.id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Debug the active_pairs data structure

          // Ensure active_pairs is always an array
          let activePairsData = result.data.active_pairs || [];
          if (!Array.isArray(activePairsData)) {
            console.warn('active_pairs is not an array, converting...');
            // If it's a string, try to parse it
            if (typeof activePairsData === 'string') {
              try {
                activePairsData = JSON.parse(activePairsData);
              } catch (e) {
                console.error('Failed to parse active_pairs string:', e);
                activePairsData = [];
              }
            } else {
              activePairsData = [];
            }
          }

          // Filter out any invalid entries (should be 6-character currency pairs)
          activePairsData = activePairsData.filter((pair: any) =>
            typeof pair === 'string' && pair.length === 6 && /^[A-Z]{6}$/.test(pair)
          );


          const tradingSettingsData = {
            riskPer1000: result.data.risk_per_1000?.toString() || '',
            riskPer1000XAUUSD: result.data.risk_per_1000_xauusd?.toString() || '',
            riskPer1000BTCUSD: result.data.risk_per_1000_btcusd?.toString() || '',
            activePairs: activePairsData
          };

          // Check if data has actually changed (for background updates)
          if (isBackgroundUpdate) {
            const currentRiskPer1000 = riskPer1000;
            const currentRiskPer1000XAUUSD = riskPer1000XAUUSD;
            const currentRiskPer1000BTCUSD = riskPer1000BTCUSD;
            const currentActivePairs = activePairs;

            // Only update if data has changed
            if (currentRiskPer1000 !== tradingSettingsData.riskPer1000 ||
              currentRiskPer1000XAUUSD !== tradingSettingsData.riskPer1000XAUUSD ||
              currentRiskPer1000BTCUSD !== tradingSettingsData.riskPer1000BTCUSD ||
              JSON.stringify(currentActivePairs) !== JSON.stringify(tradingSettingsData.activePairs)) {
              setRiskPer1000(tradingSettingsData.riskPer1000);
              setRiskPer1000XAUUSD(tradingSettingsData.riskPer1000XAUUSD);
              setRiskPer1000BTCUSD(tradingSettingsData.riskPer1000BTCUSD);
              setActivePairs(tradingSettingsData.activePairs);
            }
          } else {
            // Initial load - always update
            setRiskPer1000(tradingSettingsData.riskPer1000);
            setRiskPer1000XAUUSD(tradingSettingsData.riskPer1000XAUUSD);
            setRiskPer1000BTCUSD(tradingSettingsData.riskPer1000BTCUSD);
            setActivePairs(tradingSettingsData.activePairs);
          }

          // Save to cache
          saveTradingSettingsToCache(tradingSettingsData);

        } else {
          console.error('Failed to fetch trading settings:', result.message);
        }
      } else {
        console.error('Failed to fetch trading settings:', response.status);
      }
    } catch (error) {
      console.error('Error fetching trading settings:', error);
    }
  };

  const handleSaveSettings = async () => {
    if (!token || !user?.id || !account || !account.account_id) return;

    setIsSavingSettings(true);
    try {
      // Check if EA content is loaded
      if (!eaSettingsContent) {
        toast.error(t('EA settings content not loaded. Please wait and try again.'));
        setIsSavingSettings(false);
        return;
      }

      console.log('[EA Settings] Updating EA content with all settings before saving...');

      // Step 1: Update content with risk settings
      let updatedContent = updateEaContentWithRiskSettings(
        eaSettingsContent,
        riskPer1000,
        riskPer1000XAUUSD,
        riskPer1000BTCUSD,
        isProUser
      );

      // Step 2: Update content with active pairs
      updatedContent = updateEaContentWithActivePairs(updatedContent, activePairs, isProUser);

      console.log('[EA Settings] Content updated with risk settings and active pairs');

      // Step 3: POST updated content to API
      const accountId = account.account_id;
      const apiUrl = `https://api.jamestradinggroup.com/api/accounts/${accountId}/setting`;
      console.log(`[EA Settings] POSTing updated content to: ${apiUrl}`);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: updatedContent
        }),
      });

      console.log(`[EA Settings] Response status: ${response.status}`);

      if (response.ok) {
        const result = await response.json();
        console.log('[EA Settings] Settings saved successfully');

        // Update local state with new content
        setEaSettingsContent(updatedContent);

        // Update cache with new content
        saveEaSettingsToCache({
          content: updatedContent,
          account_id: result.account_id || account.account_id,
          login: result.login || account.login,
          platform_type: result.platform_type,
          setting_file: result.setting_file
        });

        toast.success(t('Settings saved successfully'));
        setShowEditSettings(false);

        // Clear trading settings cache
        if (account?.account_id) {
          localStorage.removeItem(getTradingSettingsCacheKey());
        }
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('[EA Settings] Failed to save settings:', response.status, errorData);
        toast.error(errorData.message || t('Failed to save settings'));
      }
    } catch (error) {
      console.error('[EA Settings] Error saving settings:', error);
      toast.error(t('Failed to save settings'));
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Update raw EA content with risk settings (Lots_Per_1000, Gold_Lots_Per_1000, BTC_Lots_Per_1000)
  const updateEaContentWithRiskSettings = (content: string, riskPer1000: string, riskPer1000XAUUSD: string, riskPer1000BTCUSD: string, isProUser: boolean): string => {
    console.log('[EA Settings] Updating EA content with risk settings...');
    console.log('[EA Settings] Lots_Per_1000:', riskPer1000);
    console.log('[EA Settings] Gold_Lots_Per_1000:', riskPer1000XAUUSD);
    console.log('[EA Settings] BTC_Lots_Per_1000:', riskPer1000BTCUSD);

    let updatedContent = content;

    // Update Lots_Per_1000
    if (riskPer1000) {
      const lotsPer1000Pattern = /Lots_Per_1000=([\d.]+)/;
      if (lotsPer1000Pattern.test(updatedContent)) {
        updatedContent = updatedContent.replace(lotsPer1000Pattern, `Lots_Per_1000=${riskPer1000}`);
        console.log(`[EA Settings] Updated Lots_Per_1000=${riskPer1000}`);
      } else {
        console.warn('[EA Settings] Lots_Per_1000 not found in content');
      }
    }

    // Update Gold_Lots_Per_1000 (only for PRO users)
    if (isProUser && riskPer1000XAUUSD) {
      const goldLotsPer1000Pattern = /Gold_Lots_Per_1000=([\d.]+)/;
      if (goldLotsPer1000Pattern.test(updatedContent)) {
        updatedContent = updatedContent.replace(goldLotsPer1000Pattern, `Gold_Lots_Per_1000=${riskPer1000XAUUSD}`);
        console.log(`[EA Settings] Updated Gold_Lots_Per_1000=${riskPer1000XAUUSD}`);
      } else {
        console.warn('[EA Settings] Gold_Lots_Per_1000 not found in content');
      }
    }

    // Update BTC_Lots_Per_1000 (only for PRO users)
    if (isProUser && riskPer1000BTCUSD) {
      const btcLotsPer1000Pattern = /BTC_Lots_Per_1000=([\d.]+)/;
      if (btcLotsPer1000Pattern.test(updatedContent)) {
        updatedContent = updatedContent.replace(btcLotsPer1000Pattern, `BTC_Lots_Per_1000=${riskPer1000BTCUSD}`);
        console.log(`[EA Settings] Updated BTC_Lots_Per_1000=${riskPer1000BTCUSD}`);
      } else {
        console.warn('[EA Settings] BTC_Lots_Per_1000 not found in content');
      }
    }

    return updatedContent;
  };

  // Update raw EA content with Trade_* settings based on active pairs
  const updateEaContentWithActivePairs = (content: string, activePairsList: string[], isProUser: boolean): string => {
    console.log('[EA Settings] Updating EA content with active pairs...');
    console.log('[EA Settings] Active pairs to set:', activePairsList);
    console.log('[EA Settings] Is PRO user:', isProUser);

    // Get pairs to update: regular pairs always, PRO pairs only if user is PRO
    const pairsToUpdate = isProUser
      ? [...availablePairs, ...proPairs]  // All pairs for PRO users
      : availablePairs;  // Only regular pairs for non-PRO users

    // Find the start of Trade On Symbol Settings section
    const tradeSectionStart = '================= Trade On Symbol Settings =================';
    const tradeSectionIndex = content.indexOf(tradeSectionStart);

    if (tradeSectionIndex === -1) {
      console.error('[EA Settings] Trade On Symbol Settings section not found in content');
      return content;
    }

    // Find the end of Trade On Symbol Settings section (next section starts with =================)
    const afterTradeSection = content.substring(tradeSectionIndex + tradeSectionStart.length);
    const nextSectionMatch = afterTradeSection.match(/\n================= /);
    const tradeSectionEndIndex = nextSectionMatch && nextSectionMatch.index !== undefined
      ? tradeSectionIndex + tradeSectionStart.length + nextSectionMatch.index
      : content.length;

    // Extract the Trade On Symbol Settings section
    const tradeSection = content.substring(tradeSectionIndex, tradeSectionEndIndex);
    console.log('[EA Settings] Original Trade section:', tradeSection);

    // Update each Trade_PAIR setting (only for pairs we should update)
    let updatedTradeSection = tradeSection;
    pairsToUpdate.forEach((pair) => {
      const isActive = activePairsList.includes(pair);
      const newValue = isActive ? 'true' : 'false';

      // Replace Trade_PAIR=true or Trade_PAIR=false
      const tradePattern = new RegExp(`Trade_${pair}=(true|false)`, 'g');
      const replacement = `Trade_${pair}=${newValue}`;

      if (tradePattern.test(updatedTradeSection)) {
        updatedTradeSection = updatedTradeSection.replace(tradePattern, replacement);
        console.log(`[EA Settings] Updated Trade_${pair}=${newValue}`);
      } else {
        // If Trade_PAIR doesn't exist, add it (shouldn't happen, but just in case)
        console.warn(`[EA Settings] Trade_${pair} not found in content, adding it`);
        updatedTradeSection += `\nTrade_${pair}=${newValue}`;
      }
    });

    // For non-PRO users, don't touch PRO pairs (BTCUSD, XAUUSD) - leave them as they are
    if (!isProUser) {
      console.log('[EA Settings] Non-PRO user: Skipping Trade_BTCUSD and Trade_XAUUSD updates');
    }

    console.log('[EA Settings] Updated Trade section:', updatedTradeSection);

    // Reconstruct the content with updated Trade section
    const beforeTradeSection = content.substring(0, tradeSectionIndex);
    const afterTradeSectionContent = content.substring(tradeSectionEndIndex);
    const updatedContent = beforeTradeSection + updatedTradeSection + afterTradeSectionContent;

    return updatedContent;
  };

  const handleSaveActivePairs = async () => {
    if (!account || !account.account_id) return;

    try {
      // Update raw EA content with new active pairs (local only, no API call)
      if (!eaSettingsContent) {
        toast.error(t('EA settings content not loaded. Please wait and try again.'));
        return;
      }

      console.log('[EA Settings] Updating local EA content with active pairs (no API call)...');
      const updatedContent = updateEaContentWithActivePairs(eaSettingsContent, activePairs, isProUser);

      // Update local state with new content (will be saved when user clicks Save in Edit Settings)
      setEaSettingsContent(updatedContent);

      console.log('[EA Settings] Active pairs updated locally. Click Save in Edit Settings to save to server.');
      toast.success(t('Active pairs updated. Click Save to apply changes.'));
      setShowActivePairs(false);
    } catch (error) {
      console.error('[EA Settings] Error updating active pairs:', error);
      toast.error(t('Failed to update active pairs'));
    }
  };

  // Load template for a given groupid and update EA settings
  const loadTemplateForGroupid = useCallback(async (groupid: string, updateEaInBackground = false) => {
    if (!account || !account.account_id || !token || !groupid) {
      console.log('[Template Load] Cannot load template: missing required data');
      return;
    }

    try {
      console.log(`[Template Load] Loading template for groupid: ${groupid}`);

      // Call GET /api/templates/{groupid} to get default EA data
      const apiUrl = `https://api.jamestradinggroup.com/api/templates/${groupid}`;
      console.log(`[Template Load] API URL: ${apiUrl}`);

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      console.log(`[Template Load] Template API response status: ${response.status}`);

      if (response.ok) {
        const result = await response.json();
        console.log('[Template Load] Template response data received');

        if (result.content) {
          console.log('[Template Load] Default EA .set content received from template:');
          console.log('--- Template EA Settings Content Start ---');
          console.log(result.content);
          console.log('--- Template EA Settings Content End ---');
          console.log(`[Template Load] Content length: ${result.content.length} characters`);

          // Update EA content with default template content
          setEaSettingsContent(result.content);

          // Parse EA settings content to extract values and populate form fields
          parseEaSettingsContent(result.content);

          // If updateEaInBackground is true, update EA settings in the background
          if (updateEaInBackground) {
            console.log('[Template Load] Updating EA settings in background...');
            const updateApiUrl = `https://api.jamestradinggroup.com/api/accounts/${account.account_id}/setting`;

            try {
              const updateResponse = await fetch(updateApiUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                  content: result.content,
                }),
              });

              if (updateResponse.ok) {
                console.log('[Template Load] EA settings updated successfully in background');
                // Clear EA settings cache after update
                const eaSettingsCacheKey = `ea_settings_${user?.id}_${account.account_id}`;
                localStorage.removeItem(eaSettingsCacheKey);
              } else {
                const errorData = await updateResponse.json().catch(() => ({ message: 'Unknown error' }));
                console.error('[Template Load] Failed to update EA settings in background:', updateResponse.status, errorData);
              }
            } catch (updateError) {
              console.error('[Template Load] Error updating EA settings in background:', updateError);
            }
          }

          console.log('[Template Load] Template loaded successfully');
        } else {
          console.error('[Template Load] No content found in template response');
        }
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('[Template Load] Failed to fetch template:', response.status, errorData);
      }
    } catch (error) {
      console.error('[Template Load] Error loading template:', error);
    }
  }, [account, token, user?.id]);

  // Automatically load template when configuration is selected (different from current account groupid)
  useEffect(() => {
    if (!selectedRiskSetting || !account || !token) return;

    // Only load template if the selected configuration is different from the current account's groupid
    if (selectedRiskSetting !== account.groupid) {
      console.log('[Configuration Change] Selected configuration changed:');
      console.log(`[Configuration Change] Current account groupid: ${account.groupid}`);
      console.log(`[Configuration Change] Selected groupid: ${selectedRiskSetting}`);
      console.log('[Configuration Change] Loading template and updating EA settings in background...');

      // Load template and update EA settings in background
      loadTemplateForGroupid(selectedRiskSetting, true);
    }
  }, [selectedRiskSetting, account?.groupid, account?.account_id, token, loadTemplateForGroupid]);

  const handleResetSettings = async () => {
    if (!account || !account.account_id || !token) return;

    setIsResettingSettings(true);

    try {
      console.log('[EA Settings] Resetting settings to defaults from template...');

      // Get groupid from account
      const groupid = account.groupid;
      if (!groupid) {
        console.error('[EA Settings] No groupid found in account');
        toast.error(t('Account group ID not found. Cannot reset to defaults.'));
        return;
      }

      await loadTemplateForGroupid(groupid, false);

      console.log('[EA Settings] Settings reset to defaults from template. Click Save to apply changes.');
      toast.success(t('Settings reset to defaults. Click Save to apply changes.'));
    } catch (error) {
      console.error('[EA Settings] Error resetting settings:', error);
      toast.error(t('Failed to reset settings'));
    } finally {
      setIsResettingSettings(false);
    }
  };

  const togglePair = (pair: string) => {

    setActivePairs(prev => {
      const newPairs = prev.includes(pair)
        ? prev.filter(p => p !== pair)
        : [...prev, pair];

      return newPairs;
    });
  };

  // Skip loading screen for faster loading
  // if (isLoading || isLoadingSettings) {
  //   return (
  //     <div className="px-4 sm:px-6 lg:px-8 pb-4 md:py-8">
  //       <div className="max-w-7xl mx-auto">
  //         <div className="">
  //           <div className="h-8 bg-gray-700 rounded w-1/4 mb-6"></div>
  //           <div className="space-y-6 bg-[#232b3e] p-6 rounded-lg border border-[#2d3748]">
  //             <div className="space-y-4">
  //               <div className="h-4 bg-gray-700 rounded w-1/4"></div>
  //               <div className="h-10 bg-gray-700 rounded"></div>
  //             </div>
  //             <div className="space-y-4">
  //               <div className="h-4 bg-gray-700 rounded w-1/4"></div>
  //               <div className="h-10 bg-gray-700 rounded"></div>
  //             </div>
  //             <div className="space-y-4">
  //               <div className="h-4 bg-gray-700 rounded w-1/4"></div>
  //               <div className="h-10 bg-gray-700 rounded"></div>
  //             </div>
  //           </div>
  //         </div>
  //       </div>
  //     </div>
  //   );
  // }


  // Show maintenance screen if server is offline or server_status is false
  if (serverStatus === 'offline' || user?.server_status === false) {
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


  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-4 md:py-8">
      <div className="max-w-7xl mx-auto">

        {/* Warning message for restricted users */}
        {user?.restricted_user === 1 && (
          <div className="bg-[#232b3e] border border-yellow-500/30 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-gray-300">
                  <span className="font-medium text-yellow-400">{t('Restricted Mode:')}</span> {t('Your total balance is below €350. Once you reach €350 or more across all your MetaTrader 4 accounts, full access of this website will be automatically unlocked.')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Account Information */}
        <div className="bg-[#232b3e] rounded-lg px-4 md:px-8 py-6 mb-8 border border-[#2d3748]">
          <h2 className="text-lg font-semibold text-white mb-4">{t('Account Information')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">{t('Status')}</label>
              <div className="flex items-center gap-2">
                {account && <span className={`px-3 py-1 text-sm font-medium rounded-full ${credentialsFailed
                    ? 'bg-red-100 text-red-800'
                    : !isTradingActive(account?.status)
                      ? 'bg-yellow-100 text-yellow-800'
                      : isConnected(account.state, account.balance)
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                  }`}>
                  {credentialsFailed
                    ? t('Failed Wrong Credential')
                    : !isTradingActive(account?.status)
                      ? t('Paused')
                      : isConnected(account.state, account.balance)
                        ? t('Connected')
                        : t('Connecting')
                  }
                </span>}
                {account && <span className={`w-2 h-2 rounded-full ${credentialsFailed
                    ? 'bg-red-500'
                    : !isTradingActive(account?.status)
                      ? 'bg-yellow-500'
                      : isConnected(account.state, account.balance)
                        ? 'bg-green-500'
                        : 'bg-yellow-500'
                  }`}></span>}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">{t('Account ID')}</label>
              <p className="text-white">{account?.login}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">{t('Email')}</label>
              <p className="text-white">{user?.email || t('Not available')}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">{t('Server')}</label>
              <p className="text-white">{accountUtils.getServerName(account?.server || '')}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">{t('Current Balance')}</label>
              <div className="flex items-center gap-2">
                {credentialsFailed ? (
                  <div className="flex items-center gap-2">
                    <p className="text-red-400 text-sm font-medium">{t('Balance unavailable')}</p>
                    <span className="text-red-500 text-xs">⚠️</span>
                  </div>
                ) : (
                  <>
                    <p className="text-white text-lg font-semibold">€{account?.balance?.toFixed(2)}</p>
                    {account?.balance === 0 && balanceUpdateAttempts < 3 && (
                      <div className="flex items-center gap-2">
                        {isUpdatingBalance && (
                          <div className="rounded-full h-3 w-3 border-b-2 border-yellow-400 animate-spin"></div>
                        )}
                      </div>
                    )}
                    {account?.balance === 0 && balanceUpdateAttempts >= 6 && balanceUpdateAttempts < 6 && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={fetchRealBalance}
                          disabled={isUpdatingBalance}
                          className="p-1 text-gray-400 hover:text-blue-400 disabled:text-gray-600 transition-colors"
                          title="Refresh balance"
                        >
                          <FaSync className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">{t('Current Configuration')}</label>
              <p className="text-white">{t(getRiskSettingNameFromGroupId(account?.groupid || ''))}</p>
            </div>
          </div>
        </div>

        {/* Configuration Section */}
        <div className="bg-[#232b3e] rounded-lg px-4 md:px-8 py-6 mb-8 border border-[#2d3748]">
          <h2 className="text-lg font-semibold text-white mb-6">{t('Setting')}</h2>

          {/* Desktop Layout - Side by side */}
          <div className="hidden lg:grid lg:grid-cols-2 lg:gap-8">
            {user?.broker === 'Other' ? (
              /* Other Broker Configurations - Show "other" type settings and PRO configs */
              <>
                {otherSettings.length > 0 && (
                  <div>
                    <h3 className="text-md font-medium text-gray-300 mb-4">{t('Normal User')}</h3>
                    <div className="flex gap-2">
                      {otherSettings.map((setting: ApiRiskSetting) => {
                        const isSelected = selectedRiskSetting === setting.group_id;
                        return (
                          <button
                            key={setting.id}
                            type="button"
                            onClick={() => setSelectedRiskSetting(setting.group_id)}
                            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors relative ${isSelected
                                ? 'bg-blue-600 text-white border border-blue-500'
                                : 'bg-[#1a2234] text-gray-300 border border-[#2d3748] hover:bg-[#2d3748]'
                              }`}
                          >
                            {t(setting.name)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* PRO Configurations for Other broker users */}
                {proConfigs.length > 0 && (
                  <div>
                    <h3 className="text-md font-medium text-gray-300 mb-4 flex items-center">
                      <FaCrown className="mr-2 text-yellow-500" />
                      {t('PRO Users')}
                    </h3>
                    <div className="flex gap-2">
                      {proConfigs.map((config) => {
                        const isAccessible = canAccessProConfig(config);
                        const isSelected = selectedRiskSetting === config.value;

                        return (
                          <div key={config.id} className="relative group flex-1">
                            <button
                              type="button"
                              onClick={() => isAccessible && setSelectedRiskSetting(config.value)}
                              disabled={!isAccessible}
                              className={`w-full px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 relative overflow-hidden ${isSelected
                                  ? 'bg-[#9333EA] border border-[#9333EA] text-white'
                                  : isAccessible
                                    ? 'bg-[#1a2234] text-gray-300 border border-[#2d3748] hover:bg-[#2d3748]'
                                    : 'bg-gradient-to-br from-[#1a2234] to-[#2d3748] text-gray-400 border-2 border-[#2d3748] hover:border-[#4a5568] hover:shadow-md cursor-pointer'
                                }`}
                            >
                              <div className="flex items-center justify-center gap-2">
                                {!isAccessible && <FaLock className="text-yellow-500 text-xs" />}
                                <span className={!isAccessible ? 'text-gray-300' : ''}>{config.name}</span>
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
                                    <span className="font-semibold text-yellow-400">{t(config.name)} {t("Locked")}</span>
                                  </div>
                                  <div className="text-gray-300 text-xs space-y-1">
                                    <div className="mb-1 flex items-center gap-2">
                                      <span className="text-yellow-400 flex-shrink-0 w-3 h-3 flex items-center justify-center">💰</span>
                                      <span>{t('Minimum balance required')}: <span className="text-yellow-400 font-semibold">€{config.requiredBalance.toLocaleString()}</span></span>
                                    </div>
                                    <div className="mb-1 flex items-center gap-2">
                                      <FaChartLine className="text-yellow-400 flex-shrink-0 w-3 h-3" />
                                      <span>{t('More advanced strategy')}</span>
                                    </div>
                                    {/* Hide "Trades Gold and Crypto" for Other users' PRO buttons */}
                                    {user?.broker !== 'Other' && (
                                      <div className="mb-1 flex items-center gap-2">
                                        <FaCoins className="text-yellow-400 flex-shrink-0 w-3 h-3" />
                                        <span>{t('Trades Gold and Crypto')}</span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-[#1a2234]"></div>
                                </div>

                                {/* Mobile tooltip - centered on screen */}
                                <div className="lg:hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none">
                                  <div className="mx-4 px-4 py-3 bg-[#1a2234] text-white text-sm rounded-lg shadow-xl border border-[#2d3748] max-w-[280px] w-full">
                                    <div className="flex items-center gap-2 mb-2">
                                      <FaLock className="text-yellow-400 flex-shrink-0" />
                                      <span className="font-semibold text-yellow-400">{t(config.name)} {t("Locked")}</span>
                                    </div>
                                    <div className="text-gray-300 text-xs space-y-1">
                                      <div className="mb-1">💰 {t('Minimum balance required')}: <span className="text-yellow-400 font-semibold">€{config.requiredBalance.toLocaleString()}</span></div>
                                      <div className="mb-1 flex items-center gap-2">
                                        <FaChartLine className="text-yellow-400 flex-shrink-0 w-3 h-3" />
                                        <span>{t('More advanced strategy')}</span>
                                      </div>
                                      {/* Hide "Trades Gold and Crypto" for Other users' PRO buttons */}
                                      {user?.broker !== 'Other' && (
                                        <div className="mb-1 flex items-center gap-2">
                                          <FaCoins className="text-yellow-400 flex-shrink-0 w-3 h-3" />
                                          <span>{t('Trades Gold and Crypto')}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Standard Configurations - Filter from API: type "normal" */}
                {normalSettings.length > 0 && (
                  <div>
                    <h3 className="text-md font-medium text-gray-300 mb-4">{t('Normal User')}</h3>
                    <div className="flex gap-2">
                      {normalSettings.map((setting: ApiRiskSetting) => {
                        const isSelected = selectedRiskSetting === setting.group_id;
                        return (
                          <button
                            key={setting.id}
                            type="button"
                            onClick={() => setSelectedRiskSetting(setting.group_id)}
                            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors relative ${isSelected
                                ? 'bg-blue-600 text-white border border-blue-500'
                                : 'bg-[#1a2234] text-gray-300 border border-[#2d3748] hover:bg-[#2d3748]'
                              }`}
                          >
                            {t(setting.name)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* PRO Configurations - Only show if there are PRO configs */}
                {proConfigs.length > 0 && (
                  <div>
                    <h3 className="text-md font-medium text-gray-300 mb-4 flex items-center">
                      <FaCrown className="mr-2 text-yellow-500" />
                      {t('PRO Users')}
                    </h3>
                    <div className="flex gap-2">
                      {proConfigs.map((config) => {
                        const isAccessible = canAccessProConfig(config);
                        const isSelected = selectedRiskSetting === config.value;

                        return (
                          <div key={config.id} className="relative group flex-1">
                            <button
                              type="button"
                              onClick={() => isAccessible && setSelectedRiskSetting(config.value)}
                              disabled={!isAccessible}
                              className={`w-full px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 relative overflow-hidden ${isSelected
                                  ? 'bg-[#9333EA] border border-[#9333EA] text-white'
                                  : isAccessible
                                    ? 'bg-[#1a2234] text-gray-300 border border-[#2d3748] hover:bg-[#2d3748]'
                                    : 'bg-gradient-to-br from-[#1a2234] to-[#2d3748] text-gray-400 border-2 border-[#2d3748] hover:border-[#4a5568] hover:shadow-md cursor-pointer'
                                }`}
                            >
                              <div className="flex items-center justify-center gap-2">
                                {!isAccessible && <FaLock className="text-yellow-500 text-xs" />}
                                <span className={!isAccessible ? 'text-gray-300' : ''}>{config.name}</span>
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
                                    <span className="font-semibold text-yellow-400">{t(config.name)} {t("Locked")}</span>
                                  </div>
                                  <div className="text-gray-300 text-xs space-y-1">
                                    <div className="mb-1 flex items-center gap-2">
                                      <span className="text-yellow-400 flex-shrink-0 w-3 h-3 flex items-center justify-center">💰</span>
                                      <span>{t('Minimum balance required')}: <span className="text-yellow-400 font-semibold">€{config.requiredBalance.toLocaleString()}</span></span>
                                    </div>
                                    <div className="mb-1 flex items-center gap-2">
                                      <FaChartLine className="text-yellow-400 flex-shrink-0 w-3 h-3" />
                                      <span>{t('More advanced strategy')}</span>
                                    </div>
                                    <div className="mb-1 flex items-center gap-2">
                                      <FaCoins className="text-yellow-400 flex-shrink-0 w-3 h-3" />
                                      <span>{t('Trades Gold and Crypto')}</span>
                                    </div>
                                  </div>
                                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-[#1a2234]"></div>
                                </div>

                                {/* Mobile tooltip - centered on screen */}
                                <div className="lg:hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none">
                                  <div className="mx-4 px-4 py-3 bg-[#1a2234] text-white text-sm rounded-lg shadow-xl border border-[#2d3748] max-w-[280px] w-full">
                                    <div className="flex items-center gap-2 mb-2">
                                      <FaLock className="text-yellow-400 flex-shrink-0" />
                                      <span className="font-semibold text-yellow-400">{t(config.name)} {t("Locked")}</span>
                                    </div>
                                    <div className="text-gray-300 text-xs space-y-1">
                                      <div className="mb-1">💰 {t('Minimum balance required')}: <span className="text-yellow-400 font-semibold">€{config.requiredBalance.toLocaleString()}</span></div>
                                      <div className="mb-1 flex items-center gap-2">
                                        <FaChartLine className="text-yellow-400 flex-shrink-0 w-3 h-3" />
                                        <span>{t('More advanced strategy')}</span>
                                      </div>
                                      <div className="mb-1 flex items-center gap-2">
                                        <FaCoins className="text-yellow-400 flex-shrink-0 w-3 h-3" />
                                        <span>{t('Trades Gold and Crypto')}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Mobile Layout - Stacked */}
          <div className="lg:hidden space-y-6">
            {user?.broker === 'Other' ? (
              /* Other Broker Configurations - Show "other" type settings and PRO configs */
              <>
                {otherSettings.length > 0 && (
                  <div>
                    <h3 className="text-md font-medium text-gray-300 mb-4">{t('Normal User')}</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {otherSettings.map((setting: ApiRiskSetting) => {
                        const isSelected = selectedRiskSetting === setting.group_id;
                        return (
                          <button
                            key={setting.id}
                            type="button"
                            onClick={() => setSelectedRiskSetting(setting.group_id)}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors relative ${isSelected
                                ? 'bg-blue-600 text-white border border-blue-500'
                                : 'bg-[#1a2234] text-gray-300 border border-[#2d3748] hover:bg-[#2d3748]'
                              }`}
                          >
                            {t(setting.name)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* PRO Configurations for Other broker users */}
                {proConfigs.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-md font-medium text-gray-300 mb-4 flex items-center">
                      <FaCrown className="mr-2 text-yellow-500" />
                      {t('PRO Users')}
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {proConfigs.map((config) => {
                        const isAccessible = canAccessProConfig(config);
                        const isSelected = selectedRiskSetting === config.value;

                        return (
                          <div key={config.id} className="relative group">
                            <button
                              type="button"
                              onClick={() => isAccessible && setSelectedRiskSetting(config.value)}
                              disabled={!isAccessible}
                              className={`w-full px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 relative overflow-hidden ${isSelected
                                  ? 'bg-[#9333EA] border border-[#9333EA] text-white'
                                  : isAccessible
                                    ? 'bg-[#1a2234] text-gray-300 border border-[#2d3748] hover:bg-[#2d3748]'
                                    : 'bg-gradient-to-br from-[#1a2234] to-[#2d3748] text-gray-400 border-2 border-[#2d3748] hover:border-[#4a5568] hover:shadow-md cursor-pointer'
                                }`}
                            >
                              <div className="flex items-center justify-center gap-2">
                                {!isAccessible && <FaLock className="text-yellow-500 text-xs" />}
                                <span className={!isAccessible ? 'text-gray-300' : ''}>{config.name}</span>
                              </div>

                              {/* Shimmer effect for locked buttons */}
                              {!isAccessible && (
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-500/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                              )}
                            </button>

                            {/* Enhanced tooltip for locked configurations */}
                            {!isAccessible && (
                              <>
                                {/* Mobile tooltip - centered on screen */}
                                <div className="lg:hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none">
                                  <div className="mx-4 px-4 py-3 bg-[#1a2234] text-white text-sm rounded-lg shadow-xl border border-[#2d3748] max-w-[280px] w-full">
                                    <div className="flex items-center gap-2 mb-2">
                                      <FaLock className="text-yellow-400 flex-shrink-0" />
                                      <span className="font-semibold text-yellow-400">{t(config.name)} {t("Locked")}</span>
                                    </div>
                                    <div className="text-gray-300 text-xs space-y-1">
                                      <div className="mb-1">💰 {t('Minimum balance required')}: <span className="text-yellow-400 font-semibold">€{config.requiredBalance.toLocaleString()}</span></div>
                                      <div className="mb-1 flex items-center gap-2">
                                        <FaChartLine className="text-yellow-400 flex-shrink-0 w-3 h-3" />
                                        <span>{t('More advanced strategy')}</span>
                                      </div>
                                      <div className="mb-1 flex items-center gap-2">
                                        <FaCoins className="text-yellow-400 flex-shrink-0 w-3 h-3" />
                                        <span>{t('Trades Gold and Crypto')}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Standard Configurations - Filter from API: type "normal" */}
                {normalSettings.length > 0 && (
                  <div>
                    <h3 className="text-md font-medium text-gray-300 mb-4">{t('Normal User')}</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {normalSettings.map((setting: ApiRiskSetting) => {
                        const isSelected = selectedRiskSetting === setting.group_id;
                        return (
                          <button
                            key={setting.id}
                            type="button"
                            onClick={() => setSelectedRiskSetting(setting.group_id)}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors relative ${isSelected
                                ? 'bg-blue-600 text-white border border-blue-500'
                                : 'bg-[#1a2234] text-gray-300 border border-[#2d3748] hover:bg-[#2d3748]'
                              }`}
                          >
                            {t(setting.name)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* PRO Configurations - Only show if there are PRO configs */}
                {proConfigs.length > 0 && (
                  <div>
                    <h3 className="text-md font-medium text-gray-300 mb-4 flex items-center">
                      <FaCrown className="mr-2 text-yellow-500" />
                      {t('PRO Users')}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {proConfigs.map((config) => {
                        const isAccessible = canAccessProConfig(config);
                        const isSelected = selectedRiskSetting === config.value;

                        return (
                          <div key={config.id} className="relative group flex-1">
                            <button
                              type="button"
                              onClick={() => isAccessible && setSelectedRiskSetting(config.value)}
                              disabled={!isAccessible}
                              className={`w-full px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 relative overflow-hidden ${isSelected
                                  ? 'bg-[#9333EA] text-white border border-[#9333EA]'
                                  : isAccessible
                                    ? 'bg-[#1a2234] text-gray-300 border border-[#2d3748] hover:bg-[#2d3748]'
                                    : 'bg-gradient-to-br from-[#1a2234] to-[#2d3748] text-gray-400 border-2 border-[#2d3748] hover:border-[#4a5568] hover:shadow-md cursor-pointer'
                                }`}
                            >
                              <div className="flex items-center justify-center gap-2">
                                {!isAccessible && <FaLock className="text-yellow-500 text-xs" />}
                                <span className={!isAccessible ? 'text-gray-300' : ''}>{config.name}</span>
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
                                    <span className="font-semibold text-yellow-400">{t(config.name)} {t("Locked")}</span>
                                  </div>
                                  <div className="text-gray-300 text-xs space-y-1">
                                    <div className="mb-1 flex items-center gap-2">
                                      <span className="text-yellow-400 flex-shrink-0 w-3 h-3 flex items-center justify-center">💰</span>
                                      <span>{t('Minimum balance required')}: <span className="text-yellow-400 font-semibold">€{config.requiredBalance.toLocaleString()}</span></span>
                                    </div>
                                    <div className="mb-1 flex items-center gap-2">
                                      <FaChartLine className="text-yellow-400 flex-shrink-0 w-3 h-3" />
                                      <span>{t('More advanced strategy')}</span>
                                    </div>
                                    {/* Hide "Trades Gold and Crypto" for Other users' PRO buttons */}
                                    {user?.broker !== 'Other' && (
                                      <div className="mb-1 flex items-center gap-2">
                                        <FaCoins className="text-yellow-400 flex-shrink-0 w-3 h-3" />
                                        <span>{t('Trades Gold and Crypto')}</span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-[#1a2234]"></div>
                                </div>

                                {/* Mobile tooltip - centered on screen */}
                                <div className="lg:hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none">
                                  <div className="mx-4 px-4 py-3 bg-[#1a2234] text-white text-sm rounded-lg shadow-xl border border-[#2d3748] max-w-[280px] w-full">
                                    <div className="flex items-center gap-2 mb-2">
                                      <FaLock className="text-yellow-400 flex-shrink-0" />
                                      <span className="font-semibold text-yellow-400">{t(config.name)} {t("Locked")}</span>
                                    </div>
                                    <div className="text-gray-300 text-xs space-y-1">
                                      <div className="mb-1">💰 {t('Minimum balance required')}: <span className="text-yellow-400 font-semibold">€{config.requiredBalance.toLocaleString()}</span></div>
                                      <div className="mb-1 flex items-center gap-2">
                                        <FaChartLine className="text-yellow-400 flex-shrink-0 w-3 h-3" />
                                        <span>{t('More advanced strategy')}</span>
                                      </div>
                                      {/* Hide "Trades Gold and Crypto" for Other users' PRO buttons */}
                                      {user?.broker !== 'Other' && (
                                        <div className="mb-1 flex items-center gap-2">
                                          <FaCoins className="text-yellow-400 flex-shrink-0 w-3 h-3" />
                                          <span>{t('Trades Gold and Crypto')}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Update Button */}
          <div className={`flex ${selectedRiskSetting === account?.groupid ? 'justify-end' : 'justify-start'} md:justify-end mt-6`}>
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
              {/* Show current vs selected configuration */}
              {selectedRiskSetting !== account?.groupid && (
                <div className="text-sm text-gray-400">
                  <span className="text-yellow-400">{t('Current')}:</span> {t(getRiskSettingNameFromGroupId(account?.groupid || ''))}
                  <span className="mx-2">→</span>
                  <span className="text-green-400">{t('Selected')}:</span> {t(getRiskSettingNameFromGroupId(selectedRiskSetting))}
                </div>
              )}

              {selectedRiskSetting !== account?.groupid && (<button
                onClick={handleUpdateAccount}
                disabled={isUpdating || selectedRiskSetting === account?.groupid}
                className="inline-flex items-center px-4 py-2 border border-blue-500 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-all duration-200"
              >
                {isUpdating ? (
                  <>
                    <div className="rounded-full h-4 w-4 border-b-2 border-white mr-2 animate-spin"></div>
                    {t('Updating...')}
                  </>
                ) : selectedRiskSetting === account?.groupid ? (
                  t('No Changes')
                ) : (
                  t('Update Configuration')
                )}
              </button>)}

              {selectedRiskSetting === account?.groupid && (<button
                onClick={handleEditSettings}
                className="inline-flex items-center px-4 py-2 border border-blue-500 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-all duration-200"
              >
                {t('Edit Settings')}
              </button>)}
            </div>
          </div>
        </div>

        {/* Management Actions */}
        <div className="bg-[#232b3e] rounded-lg p-6 border border-[#2d3748]">
          <h2 className="text-lg font-semibold text-white mb-6">{t('Account Management')}</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            {isTradingActive(account?.status) ? (
              <button
                onClick={() => setShowPauseConfirm(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
              >
                <FaPause className="mr-2" />
                {t('Pause Account')}
              </button>
            ) : (
              <button
                onClick={() => setShowPauseConfirm(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                <FaPlay className="mr-2" />
                {t('Resume Account')}
              </button>
            )}

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              <FaTrash className="mr-2" />
              {t('Delete Account')}
            </button>
          </div>
        </div>

        {/* Confirmation Modals */}
        {showPauseConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#232b3e] rounded-lg p-6 max-w-md mx-4 border border-[#2d3748]">
              <h3 className="text-lg font-semibold text-white mb-4">
                {isTradingActive(account?.status) ? t('Pause Account') : t('Resume Account')}
              </h3>
              <p className="text-gray-300 mb-6">
                {isTradingActive(account?.status)
                  ? t('The account will be temporarily paused. Your data will remain saved, but trade copying will be suspended.')
                  : t('The account will be resumed and trade copying will be activated again.')
                }
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowPauseConfirm(false)}
                  disabled={isPausing || isResuming}
                  className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white disabled:opacity-50"
                >
                  {t('Cancel')}
                </button>
                <button
                  onClick={isTradingActive(account?.status) ? handlePauseAccount : handleResumeAccount}
                  disabled={isPausing || isResuming}
                  className={`px-4 py-2 text-sm font-medium rounded-md text-white disabled:opacity-50 flex items-center gap-2 ${isTradingActive(account?.status)
                      ? 'bg-yellow-600 hover:bg-yellow-700'
                      : 'bg-green-600 hover:bg-green-700'
                    }`}
                >
                  {(isPausing || isResuming) ? (
                    <>
                      <div className="rounded-full h-4 w-4 border-b-2 border-white animate-spin"></div>
                      {isTradingActive(account?.status) ? t('Pausing...') : t('Resuming...')}
                    </>
                  ) : (
                    isTradingActive(account?.status) ? t('Pause') : t('Resume')
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#232b3e] rounded-lg p-6 max-w-md mx-4 border border-[#2d3748]">
              <h3 className="text-lg font-semibold text-white mb-4">{t('Delete Account')}</h3>
              <p className="text-gray-300 mb-6">
                {t('Are you sure you want to delete this account? This action cannot be undone.')}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white disabled:opacity-50"
                >
                  {t('Cancel')}
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={isDeleting}
                  className="px-4 py-2 text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <div className="rounded-full h-4 w-4 border-b-2 border-white animate-spin"></div>
                      {t('Deleting...')}
                    </>
                  ) : (
                    t('Delete')
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Settings Modal */}
        {showEditSettings && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#232b3e] rounded-lg p-6 max-w-md mx-4 border border-[#2d3748] w-full">
              <h3 className="text-lg font-semibold text-white mb-6">{t('Edit Settings')}</h3>

              <div className="space-y-6">
                {/* Risk Per $1000 */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {t('Risk Per $1000')}
                  </label>
                  <input
                    type="number"
                    value={riskPer1000}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '' || (parseFloat(value) >= 0 && parseFloat(value) <= 1)) {
                        setRiskPer1000(value);
                      }
                    }}
                    className="w-full px-3 py-2 bg-[#1a2234] border border-[#2d3748] rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0.01"
                    step="0.01"
                    min="0"
                    max="1"
                  />
                </div>

                {/* Risk per $1000 for XAUUSD - PRO users only */}
                {isProUser && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      <span className="flex items-center gap-2">
                        {t('Risk per $1000 for XAUUSD')}
                        <FaCrown className="text-yellow-500 text-base pb-[3px]" />
                      </span>
                    </label>
                    <input
                      type="number"
                      value={riskPer1000XAUUSD}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || (parseFloat(value) >= 0 && parseFloat(value) <= 1)) {
                          setRiskPer1000XAUUSD(value);
                        }
                      }}
                      className="w-full px-3 py-2 bg-[#1a2234] border border-yellow-500/30 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500/50 transition-colors"
                      placeholder="0.01"
                      step="0.01"
                      min="0"
                      max="1"
                    />
                  </div>
                )}

                {/* Risk per $1000 for BTCUSD - PRO users only */}
                {isProUser && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      <span className="flex items-center gap-2">
                        {t('Risk per $1000 for BTCUSD')}
                        <FaCrown className="text-yellow-500 text-base pb-[3px]" />
                      </span>
                    </label>
                    <input
                      type="number"
                      value={riskPer1000BTCUSD}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || (parseFloat(value) >= 0 && parseFloat(value) <= 1)) {
                          setRiskPer1000BTCUSD(value);
                        }
                      }}
                      className="w-full px-3 py-2 bg-[#1a2234] border border-yellow-500/30 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500/50 transition-colors"
                      placeholder="0.01"
                      step="0.01"
                      min="0"
                      max="1"
                    />
                  </div>
                )}

                {/* Active Pairs */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {t('Active pairs')}
                  </label>
                  <button
                    onClick={handleEditActivePairs}
                    className="w-full px-3 py-2 bg-[#1a2234] border border-[#2d3748] rounded-md text-white hover:bg-[#2d3748] transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {activePairs.length > 0
                      ? `${t('Edit')} (${activePairs.length} ${t('selected')})`
                      : t('Edit')
                    }
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowEditSettings(false)}
                  disabled={isSavingSettings || isResettingSettings}
                  className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white disabled:opacity-50"
                >
                  {t('Cancel')}
                </button>
                <button
                  onClick={handleResetSettings}
                  disabled={isSavingSettings || isResettingSettings}
                  className="px-4 py-2 text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {isResettingSettings ? (
                    <>
                      <div className="rounded-full h-4 w-4 border-b-2 border-white animate-spin"></div>
                      {t('Resetting...')}
                    </>
                  ) : (
                    t('Reset')
                  )}
                </button>
                <button
                  onClick={handleSaveSettings}
                  disabled={isSavingSettings || isResettingSettings}
                  className="px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {isSavingSettings ? (
                    <>
                      <div className="rounded-full h-4 w-4 border-b-2 border-white animate-spin"></div>
                      {t('Saving...')}
                    </>
                  ) : (
                    t('Save')
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Active Pairs Modal */}
        {showActivePairs && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#232b3e] rounded-lg max-w-2xl mx-4 border border-[#2d3748] w-full max-h-[80vh] flex flex-col">
              {/* Header - Fixed */}
              <div className="p-6 pb-4 border-b border-[#2d3748]">
                <h3 className="text-lg font-semibold text-white">{t('Active pairs')}</h3>
              </div>

              {/* Scrollable Content Area - Only pairs list */}
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                {/* Regular Pairs */}
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-400 mb-3">{t('Standard Pairs')}</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {availablePairs.map((pair) => (
                      <label key={pair} className="flex items-center space-x-3 p-3 bg-[#1a2234] rounded-md border border-[#2d3748] hover:bg-[#2d3748] transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activePairs.includes(pair)}
                          onChange={() => togglePair(pair)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="text-white text-sm font-medium">{pair}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* PRO Pairs */}
                {isProUser && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                      <FaCrown className="text-yellow-500" />
                      {t('PRO Pairs')}
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {proPairs.map((pair) => (
                        <label key={pair} className="flex items-center space-x-3 p-3 bg-[#1a2234] rounded-md border border-yellow-500/30 hover:bg-[#2d3748] transition-colors cursor-pointer">
                          <input
                            type="checkbox"
                            checked={activePairs.includes(pair)}
                            onChange={() => togglePair(pair)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="text-white text-sm font-medium flex items-center gap-2">
                            {pair}
                            <FaCrown className="text-yellow-500 text-xs" />
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer - Fixed */}
              <div className="p-6 pt-4 border-t border-[#2d3748] flex justify-end gap-3">
                <button
                  onClick={() => setShowActivePairs(false)}
                  disabled={isSavingSettings}
                  className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white disabled:opacity-50"
                >
                  {t('Cancel')}
                </button>
                <button
                  onClick={handleSaveActivePairs}
                  disabled={isSavingSettings}
                  className="px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {isSavingSettings ? (
                    <>
                      <div className="rounded-full h-4 w-4 border-b-2 border-white animate-spin"></div>
                      {t('Saving...')}
                    </>
                  ) : (
                    t('Confirm')
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 