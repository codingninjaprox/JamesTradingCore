'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/utils/translation';
import { useAuth } from '@/contexts/AuthContext';
import { accountsApi } from '@/utils/accounts';

export default function LoginPage() {
  const { translations, setLanguage } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});
  const { login, logout, user, token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const t = (key: string) => getTranslation(translations, key);

  // Cache account_id for faster login
  const getCachedAccountId = (userId: number): string | null => {
    try {
      const cached = localStorage.getItem(`account_id_${userId}`);
      return cached;
    } catch (error) {
      return null;
    }
  };

  const setCachedAccountId = (userId: number, accountId: string) => {
    try {
      localStorage.setItem(`account_id_${userId}`, accountId);
    } catch (error) {
      console.warn('Failed to cache account_id:', error);
    }
  };

  const clearCachedAccountId = (userId: number) => {
    try {
      localStorage.removeItem(`account_id_${userId}`);
    } catch (error) {
      console.warn('Failed to clear cached account_id:', error);
    }
  };

  // Auto-login from GET parameters (username only, admin: true will be included)
  useEffect(() => {
    // Use window.location.search directly for better iframe compatibility
    const getUsernameParam = () => {
      // Always try window.location.search first (most reliable in iframe)
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const username = urlParams.get('username');
        
        if (username) {
          const logMsg = '[Auto-login] Found username from window.location.search: ' + username;
          console.log(logMsg);
          // Also try to send to parent window for iframe debugging
          try {
            if (window.parent && window.parent !== window.self) {
              window.parent.postMessage({ type: 'AUTO_LOGIN_LOG', message: logMsg }, '*');
            }
          } catch (e) {}
          return username;
        }
      } catch (e) {
        const errorMsg = '[Auto-login] Failed to parse window.location.search: ' + e;
        console.error(errorMsg);
        try {
          if (window.parent && window.parent !== window.self) {
            window.parent.postMessage({ type: 'AUTO_LOGIN_ERROR', message: errorMsg }, '*');
          }
        } catch (e2) {}
      }

      // Fallback to useSearchParams (works in normal context)
      try {
        const usernameFromSearchParams = searchParams.get('username');
        
        if (usernameFromSearchParams) {
          const logMsg = '[Auto-login] Found username from searchParams: ' + usernameFromSearchParams;
          console.log(logMsg);
          try {
            if (window.parent && window.parent !== window.self) {
              window.parent.postMessage({ type: 'AUTO_LOGIN_LOG', message: logMsg }, '*');
            }
          } catch (e) {}
          return usernameFromSearchParams;
        }
      } catch (e) {
        console.log('[Auto-login] useSearchParams not available');
      }

      const logMsg = '[Auto-login] No username parameter found. URL: ' + window.location.href;
      console.log(logMsg);
      try {
        if (window.parent && window.parent !== window.self) {
          window.parent.postMessage({ type: 'AUTO_LOGIN_LOG', message: logMsg }, '*');
        }
      } catch (e) {}
      return null;
    };

    // Helper function to perform the actual auto-login
    const performAutoLogin = (usernameParam: string) => {
      // Set email, then auto-login with empty password and admin: true
      setEmail(usernameParam);
      setPassword('');
      setIsLoading(true);
      setError(null);
      setValidationErrors({});

      // Perform auto-login with admin: true (password not needed when admin is true)
      login(usernameParam, '', true)
          .then((loginData) => {
            // Save connected status to localStorage for Navigation component
            try {
              localStorage.setItem(`user_connected_${loginData.user.id}`, JSON.stringify(loginData.user.connected === true));
            } catch (error) {
              console.warn('Failed to save connected status:', error);
            }

            // Check if we're in an iframe
            const isInIframe = window.self !== window.top;

            // MUST check data.user.connected before redirecting
            if (loginData.user.connected === true) {
              // User has a connected account - redirect to account detail page
              // Check for cached account_id first for faster redirect
              const cachedAccountId = getCachedAccountId(loginData.user.id);
              const redirectUrl = cachedAccountId 
                ? `/accounts/${cachedAccountId}`
                : `/accounts/${loginData.user.id}`;

              if (isInIframe) {
                // In iframe, try to redirect parent window or use window.location
                try {
                  if (window.parent && window.parent !== window.self) {
                    window.parent.location.href = redirectUrl;
                  } else {
                    window.location.href = redirectUrl;
                  }
                } catch (e) {
                  // Cross-origin iframe, use window.location
                  window.location.href = redirectUrl;
                }
              } else {
                router.push(redirectUrl);
              }
            } else {
              // connected is false or undefined - redirect to account create page
              clearCachedAccountId(loginData.user.id);
              // Clear connected status
              try {
                localStorage.removeItem(`user_connected_${loginData.user.id}`);
              } catch (error) {
                console.warn('Failed to clear connected status:', error);
              }
              
              if (isInIframe) {
                try {
                  if (window.parent && window.parent !== window.self) {
                    window.parent.location.href = '/accounts';
                  } else {
                    window.location.href = '/accounts';
                  }
                } catch (e) {
                  window.location.href = '/accounts';
                }
              } else {
                router.push('/accounts');
              }
            }
          })
          .catch((err) => {
            const errorMsg = '[Auto-login] Login failed: ' + (err?.message || String(err));
            console.error(errorMsg, err);
            try {
              if (window.parent && window.parent !== window.self) {
                window.parent.postMessage({ type: 'AUTO_LOGIN_ERROR', message: errorMsg, error: String(err) }, '*');
              }
            } catch (e) {}
            setError(t('Invalid email or password'));
            setIsLoading(false);
          });
    };

    // Check immediately and also after a delay (for iframe compatibility)
    const checkAndLogin = () => {
      const usernameParam = getUsernameParam();
      
      if (!usernameParam) {
        return; // No username parameter found
      }

      const logMsg = '[Auto-login] Attempting auto-login with username: ' + usernameParam + ', isLoading: ' + isLoading + ', user: ' + (user ? user.email : 'null');
      console.log(logMsg);
      try {
        if (window.parent && window.parent !== window.self) {
          window.parent.postMessage({ type: 'AUTO_LOGIN_LOG', message: logMsg }, '*');
        }
      } catch (e) {}

      // Check if user is already logged in with the same username
      if (user && user.email === usernameParam) {
        const skipMsg = '[Auto-login] User already logged in with same username. Redirecting...';
        console.log(skipMsg);
        try {
          if (window.parent && window.parent !== window.self) {
            window.parent.postMessage({ type: 'AUTO_LOGIN_LOG', message: skipMsg }, '*');
          }
        } catch (e) {}
        
        // Even if already logged in, redirect to appropriate page
        const isInIframe = window.self !== window.top;
        const cachedAccountId = getCachedAccountId(user.id);
        const redirectUrl = cachedAccountId 
          ? `/accounts/${cachedAccountId}`
          : `/accounts/${user.id}`;
        
        if (isInIframe) {
          try {
            if (window.parent && window.parent !== window.self) {
              window.parent.location.href = redirectUrl;
            } else {
              window.location.href = redirectUrl;
            }
          } catch (e) {
            window.location.href = redirectUrl;
          }
        } else {
          router.push(redirectUrl);
        }
        return; // Already logged in as this user, redirecting
      }

      // Proceed with login if username is provided and not currently loading
      if (usernameParam && !isLoading) {
        // If user exists but with different email, logout first to ensure clean state
        if (user && user.email !== usernameParam) {
          const switchMsg = '[Auto-login] Logging out current user (' + user.email + ') and switching to ' + usernameParam;
          console.log(switchMsg);
          try {
            if (window.parent && window.parent !== window.self) {
              window.parent.postMessage({ type: 'AUTO_LOGIN_LOG', message: switchMsg }, '*');
            }
          } catch (e) {}
          
          // Logout current user first
          logout();
          
          // Wait a bit for logout to complete, then proceed with login
          setTimeout(() => {
            performAutoLogin(usernameParam);
          }, 100);
          return;
        }
        
        // No existing user or same user - proceed directly with login
        performAutoLogin(usernameParam);
      } else {
        // This should rarely happen now, but log for debugging
        const skipMsg = '[Auto-login] Skipped - isLoading is true. usernameParam: ' + usernameParam + ', isLoading: ' + isLoading;
        console.log(skipMsg);
        try {
          if (window.parent && window.parent !== window.self) {
            window.parent.postMessage({ type: 'AUTO_LOGIN_LOG', message: skipMsg }, '*');
          }
        } catch (e) {}
      }
    };

    // Check immediately
    checkAndLogin();

    // Also check after a delay (for iframe compatibility)
    const timer = setTimeout(() => {
      checkAndLogin();
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isLoading, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    setValidationErrors({});

    try {
      // Perform login - response includes connected status
      const loginData = await login(email, password);
      
      // Save connected status to localStorage for Navigation component
      try {
        localStorage.setItem(`user_connected_${loginData.user.id}`, JSON.stringify(loginData.user.connected === true));
      } catch (error) {
        console.warn('Failed to save connected status:', error);
      }
      
      // MUST check data.user.connected before redirecting
      if (loginData.user.connected === true) {
        // User has a connected account - redirect to account detail page
        // Check for cached account_id first for faster redirect
        const cachedAccountId = getCachedAccountId(loginData.user.id);
        
        if (cachedAccountId) {
          // Use cached account_id for immediate redirect
          router.push(`/accounts/${cachedAccountId}`);
        } else {
          // No cached account_id - redirect immediately using user.id
          // The detail page will fetch the account data using getAccountById
          router.push(`/accounts/${loginData.user.id}`);
        }
      } else {
        // connected is false or undefined - redirect to account create page
        clearCachedAccountId(loginData.user.id);
        // Clear connected status
        try {
          localStorage.removeItem(`user_connected_${loginData.user.id}`);
        } catch (error) {
          console.warn('Failed to clear connected status:', error);
        }
        router.push('/accounts');
      }
    } catch (err) {
      setError(t('Invalid email or password'));
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col  justify-center items-center px-4 md:px-2 pt-6 sm:pt-0">
      <div className="login-form-wrapper w-full md:w-[410px] flex justify-center">
        <div className="max-w-[370px] w-full sm:max-w-md md:mx-6 px-2 py-2 md:px-6 md:py-4 md:ml-0 shadow-md overflow-hidden sm:rounded-lg" style={{ background: '#232b3e', borderRadius: '37px' }}>
        <div className="flex flex-col justify-center items-center px-2 pt-2 md:pt-6 sm:pt-0">
          <Link href="/">
            <Image
              src="/images/logo.svg"
              alt="Logo"
              width={250}
              height={100}
              className="w-[200px] md:w-[250px]"
            />
          </Link>
        </div>
        <div style={{ borderRadius: '37px' }} className="bg-[#12181F] px-6 py-4">
          <div className="flex mb-2 items-center justify-end">
            <a className="mr-2 items-center justify-center cursor-pointer" style={{ height: '35px' }} onClick={(e) => { e.preventDefault(); setLanguage('pt'); }}>
              <Image src="/images/pt.svg" alt="Português" width={30} height={35} className="w-[25px] h-[25px] md:w-[30px] md:h-[35px]" />
            </a>
            <a className="mr-2 items-center justify-center cursor-pointer" style={{ height: '35px' }} onClick={(e) => { e.preventDefault(); setLanguage('en'); }}>
              <Image src="/images/en.svg" alt="English" width={30} height={35} className="w-[25px] h-[25px] md:w-[30px] md:h-[35px]" />
            </a>
            <a className="mr-2 items-center justify-center cursor-pointer" style={{ height: '35px' }} onClick={(e) => { e.preventDefault(); setLanguage('it'); }}>
              <Image src="/images/it.svg" alt="Italiano" width={30} height={35} className="w-[25px] h-[25px] md:w-[30px] md:h-[35px]" />
            </a>
            <a className="mr-2 items-center justify-center cursor-pointer" style={{ height: '35px' }} onClick={(e) => { e.preventDefault(); setLanguage('es'); }}>
              <Image src="/images/es.svg" alt="Español" width={30} height={35} className="w-[25px] h-[25px] md:w-[30px] md:h-[35px]" />
            </a>
            <a className="mr-2 items-center justify-center cursor-pointer" style={{ height: '35px' }} onClick={(e) => { e.preventDefault(); setLanguage('fr'); }}>
              <Image src="/images/fr.svg" alt="Français" width={30} height={35} className="w-[25px] h-[25px] md:w-[30px] md:h-[35px]" />
            </a>
            <a className="mr-2 items-center justify-center cursor-pointer" style={{ height: '35px' }} onClick={(e) => { e.preventDefault(); setLanguage('de'); }}>
              <Image src="/images/de.svg" alt="Deutsch" width={30} height={35} className="w-[25px] h-[25px] md:w-[30px] md:h-[35px]" />
            </a>
            <a className="mr-2 items-center justify-center cursor-pointer" style={{ height: '35px' }} onClick={(e) => { e.preventDefault(); setLanguage('nl'); }}>
              <Image src="/images/nl.svg" alt="Nederlands" width={30} height={35} className="w-[25px] h-[25px] md:w-[30px] md:h-[35px]" />
            </a>
          </div>
          {error && (
            <div className="mb-4 bg-red-900/50 border border-red-800 text-red-200 px-4 py-3 rounded relative" role="alert">
              <span className="block sm:inline">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                {t('Email')}
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`block mt-1 w-full rounded-md shadow-sm bg-gray-700 border-gray-600 text-gray-300 focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 ${
                    validationErrors.email ? 'border-red-500' : ''
                  }`}
                />
                {validationErrors.email && (
                  <p className="mt-2 text-sm text-red-400">{t(validationErrors.email[0])}</p>
                )}
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                {t('Password')}
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`block mt-1 w-full rounded-md shadow-sm bg-gray-700 border-gray-600 text-gray-300 focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 ${
                    validationErrors.password ? 'border-red-500' : ''
                  }`}
                />
                {validationErrors.password && (
                  <p className="mt-2 text-sm text-red-400">{t(validationErrors.password[0])}</p>
                )}
              </div>
            </div>

            <div className="block mt-4">
              <label htmlFor="remember_me" className="inline-flex items-center">
                <input
                  id="remember_me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-gray-600 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 bg-gray-700"
                />
                <span className="ml-2 text-sm text-gray-300">{t('Remember me')}</span>
              </label>
            </div>

            <div className="flex items-center justify-end mt-4">
              <Link
                href="/forgot-password"
                className="underline text-sm text-gray-400 hover:text-gray-100"
              >
                {t('Forgot your password?')}
              </Link>

              <button
                type="submit"
                disabled={isLoading}
                className="ml-3 inline-flex items-center px-4 py-2 bg-gray-700 border border-transparent rounded-md font-semibold text-xs text-white uppercase tracking-widest hover:bg-gray-600 active:bg-gray-900 focus:outline-none focus:border-gray-900 focus:ring ring-gray-300 disabled:opacity-25 transition ease-in-out duration-150"
              >
                {isLoading ? t('Logging in') : t('Log in')}
              </button>
            </div>
          </form>
        </div>
      </div>
      </div>

      <footer className="login-footer absolute w-full bottom-0">
        <div className="footer-container flex justify-center space-x-4 text-[11px] md:text-[13px] text-gray-500">
          <a href="https://login.jamestradinggroup.com/terms-and-conditions" className="hover:text-gray-400 no-margin" target="_blank" rel="noopener noreferrer">
            {t('Terms and Conditions')}
          </a>
          <a href="https://login.jamestradinggroup.com/privacy-policy" className="hover:text-gray-400 no-margin" target="_blank" rel="noopener noreferrer">
            {t('Privacy Policy')}
          </a>
          <a href="https://login.jamestradinggroup.com/earnings-disclaimer" className="hover:text-gray-400 no-margin" target="_blank" rel="noopener noreferrer">
            {t('Earnings Disclaimer')}
          </a>
        </div>
      </footer>
    </div>
  );
} 