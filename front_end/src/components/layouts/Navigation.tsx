'use client';

import { Fragment, useEffect, useState, useCallback, useRef } from 'react';
import { Disclosure, Menu, Transition } from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/utils/translation';
import { accountsApi, type Account } from '@/utils/accounts';

interface MenuVisibility {
  account: boolean;
  groups: boolean;
  referral: boolean;
  reports: boolean;
  courses: boolean;
  top_ranks: boolean;
  simulation: boolean;
}

interface User {
  id: number;
  name: string;
  email: string;
  broker: string;
  restricted_user: number;
  connected?: boolean;
  menu_visibility?: MenuVisibility;
}

interface NavigationProps {
  user: User | null;
}

export default function Navigation({ user }: NavigationProps) {
  const { logout, token } = useAuth();
  const { setLanguage, translations } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const t = (key: string) => getTranslation(translations, key);
  const [account, setAccount] = useState<Account | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const isFetchingRef = useRef(false); // Prevent concurrent fetches

  // Fetch account data to determine account link
  const fetchAccount = useCallback(async (skipCacheUpdate = false) => {
    if (!token || !user?.id) {
      setAccount(null);
      isFetchingRef.current = false;
      return;
    }

    // Prevent concurrent fetches
    if (isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;

    try {
      // Check cache first for faster loading
      const getAccountCacheKey = () => `account_${user.id}`;
      const cached = localStorage.getItem(getAccountCacheKey());
      
      if (cached) {
        try {
          const cacheData = JSON.parse(cached);
          const now = Date.now();
          // Use cache if it's less than 5 minutes old
          if (cacheData.data && (now - cacheData.timestamp < 5 * 60 * 1000)) {
            // Only update state if account data has changed
            setAccount(prevAccount => {
              if (JSON.stringify(prevAccount) === JSON.stringify(cacheData.data)) {
                return prevAccount; // No change, don't update
              }
              return cacheData.data;
            });
            isFetchingRef.current = false;
            return;
          }
        } catch (e) {
          // Invalid cache, fetch fresh
        }
      }

      // Fetch from API
      const accountData = await accountsApi.getAccount(token, user.id);
      
      // Only update state if account data has changed
      setAccount(prevAccount => {
        if (JSON.stringify(prevAccount) === JSON.stringify(accountData)) {
          return prevAccount; // No change, don't update
        }
        return accountData;
      });
      
      // Cache the result (but don't dispatch events from Navigation to avoid loops)
      // Events should only be dispatched from accounts page
      if (accountData) {
        try {
          localStorage.setItem(getAccountCacheKey(), JSON.stringify({
            data: accountData,
            timestamp: Date.now()
          }));
        } catch (e) {
          // Ignore cache errors
        }
      } else {
        // Account was deleted, clear cache
        try {
          localStorage.removeItem(getAccountCacheKey());
          localStorage.removeItem(`account_id_${user.id}`);
        } catch (e) {
          // Ignore cache errors
        }
      }
    } catch (error: any) {
      // Log "fire" if error is not 401 (Session expired) or 404 (null return)
      // CORS errors, network errors, and other server errors should trigger this
      const errorMessage = error?.message || String(error || '');
      const errorName = error?.name || '';
      const isSessionExpired = errorMessage === 'Session expired';
      // Log "fire" for all errors except 401 (Session expired)
      // This includes CORS errors (TypeError: Failed to fetch), 500, 502, etc.
      // CORS errors are TypeError, so always log for TypeError or if not session expired
      if (errorName === 'TypeError' || !isSessionExpired) {
        console.log("fire");
      }
      console.error('Error fetching account in navigation:', error);
      setAccount(null);
    } finally {
      isFetchingRef.current = false;
    }
  }, [token, user?.id]);

  // Initial fetch and refresh on token/user change
  useEffect(() => {
    fetchAccount();
  }, [token, user?.id]);

  // Listen for storage changes (when account cache is cleared/updated)
  useEffect(() => {
    if (!token || !user?.id) return;

    const handleStorageChange = (e: StorageEvent) => {
      const accountCacheKey = `account_${user.id}`;
      const accountIdCacheKey = `account_id_${user.id}`;
      
      // If account cache was removed or account_id cache was removed, refresh
      if (e.key === accountCacheKey || e.key === accountIdCacheKey) {
        if (!e.newValue) {
          // Cache was cleared, account was likely deleted
          setAccount(null);
        } else {
          // Cache was updated, refresh account data
          // fetchAccount doesn't dispatch events, so no loop risk
          fetchAccount(true);
        }
      }
    };

    // Listen for custom events (for same-tab updates from accounts page)
    const handleAccountUpdated = () => {
      // fetchAccount doesn't dispatch events, so no loop risk
      fetchAccount(true);
    };
    
    const handleAccountDeleted = () => {
      setAccount(null);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('accountCacheUpdated', handleAccountUpdated);
    window.addEventListener('accountDeleted', handleAccountDeleted);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('accountCacheUpdated', handleAccountUpdated);
      window.removeEventListener('accountDeleted', handleAccountDeleted);
    };
  }, [user?.id, token, fetchAccount]);

  // Refresh account when pathname changes to /accounts (after deletion redirect)
  useEffect(() => {
    if (pathname === '/accounts' && account && token && user?.id) {
      // User was redirected to accounts page, likely account was deleted
      // Skip cache update to avoid triggering events
      fetchAccount(true);
    }
  }, [pathname, account, token, user?.id, fetchAccount]);

  // Redirect to profile page if restricted user, or to accounts page if not restricted
  useEffect(() => {
    if (user) {
      if (user.restricted_user === 1 && window.location.pathname !== '/accounts') {
        router.push('/accounts');
      } else if (user.restricted_user == 0 && window.location.pathname === '/dashboard') {
        router.push('/accounts');
      }
    }
  }, [user, router]);



  const handleLanguageChange = async (newLang: string) => {
    // Update language in context immediately for UI responsiveness
    setLanguage(newLang);
    
    // Save language preference to backend if user is logged in
    if (token) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          credentials: 'include',
          body: JSON.stringify({
            lang: newLang,
          }),
        });
      } catch (error) {
        console.error('Failed to save language preference:', error);
      }
    }
  };

  // Get connected status from localStorage or user object
  const getConnectedStatus = useCallback(() => {
    if (!user?.id) return false;
    
    // First check user object (from AuthContext) - most up-to-date
    if (user.connected !== undefined) {
      return user.connected === true;
    }
    
    // Fallback to localStorage
    try {
      const cached = localStorage.getItem(`user_connected_${user.id}`);
      if (cached !== null) {
        return JSON.parse(cached) === true;
      }
    } catch (error) {
      console.warn('Failed to read connected status from cache:', error);
    }
    
    return false;
  }, [user]);

  // Update connected status from localStorage or user object
  useEffect(() => {
    if (user?.id) {
      const isConnected = getConnectedStatus();
      setConnected(isConnected);
    } else {
      setConnected(false);
    }
  }, [user, getConnectedStatus]);

  // Listen for connected status changes in localStorage
  useEffect(() => {
    if (!user?.id) return;

    const handleStorageChange = (e: StorageEvent) => {
      const connectedKey = `user_connected_${user.id}`;
      if (e.key === connectedKey) {
        try {
          const newValue = e.newValue ? JSON.parse(e.newValue) === true : false;
          setConnected(newValue);
        } catch (error) {
          console.warn('Failed to parse connected status:', error);
        }
      }
    };

    // Listen for custom events (for same-tab updates)
    const handleConnectedUpdated = () => {
      const isConnected = getConnectedStatus();
      setConnected(isConnected);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('connectedStatusUpdated', handleConnectedUpdated);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('connectedStatusUpdated', handleConnectedUpdated);
    };
  }, [user?.id, getConnectedStatus]);

  // Determine account link - use detail page if connected is true, otherwise create page
  const getAccountHref = () => {
    // If connected is true, use account_id from cache or account object
    if (connected === true) {
      // Check for cached account_id first
      try {
        const cachedAccountId = localStorage.getItem(`account_id_${user?.id}`);
        if (cachedAccountId) {
          return `/accounts/${cachedAccountId}`;
        }
      } catch (error) {
        console.warn('Failed to read cached account_id:', error);
      }
      
      // Fallback to account object if available
      if (account && account.account_id) {
        return `/accounts/${account.account_id}`;
      }
      
      // Last resort: use user.id (will be resolved by detail page)
      if (user?.id) {
        return `/accounts/${user.id}`;
      }
    }
    
    // connected is false or null - redirect to create page
    return '/accounts';
  };

  // Build navigation array based on menu_visibility and user restrictions
  const buildNavigation = () => {
    const menuVisibility = user?.menu_visibility;
    
    // Default visibility if menu_visibility is not provided (backward compatibility)
    const defaultVisibility = {
      account: true,
      groups: true,
      referral: true,
      reports: true,
      courses: true,
      top_ranks: true,
      simulation: true,
    };
    
    const visibility = menuVisibility || defaultVisibility;
    
    // Restricted users only see account if visible
    if (user?.restricted_user === 1) {
      const items = [];
      if (visibility.account) {
        items.push({ name: t('Account'), href: getAccountHref() });
      }
      return items;
    }
    
    // Non-restricted users - use menu_visibility for all broker types
    const items = [];
    
    // Account - always shown if visible
    if (visibility.account) {
      items.push({ name: t('Account'), href: getAccountHref() });
    }
    
    // Show all menus based on menu_visibility from API (works for all broker types including "Other")
    if (visibility.groups) {
      items.push({ name: t('Groups'), href: '/groups' });
    }
    if (visibility.referral) {
      items.push({ name: t('Referral Program'), href: '/referrals' });
    }
    if (visibility.reports) {
      items.push({ name: t('Reports'), href: '/reports' });
    }
    if (visibility.courses) {
      items.push({ name: t('Courses'), href: '/courses' });
    }
    if (visibility.top_ranks) {
      items.push({ name: t('Top 25 Ranks'), href: '/leaderboard' });
    }
    if (visibility.simulation) {
      items.push({ name: t('Calculate your potential profits'), href: '/calculator' });
    }
    
    return items;
  };

  const navigation = buildNavigation();

  // Check if current path is allowed in navigation
  useEffect(() => {
    if (user && pathname) {
      // Get allowed paths from navigation array
      const allowedPaths = ['/', '/not-found', '/profile', ...navigation.map(item => item.href)];
      
      // Check if current path is allowed
      const isAllowed = allowedPaths.some(allowedPath => {
        // Exact match
        if (pathname === allowedPath) return true;
        
        // Check for dynamic routes (e.g., /accounts/123 should match /accounts)
        if (allowedPath === '/accounts' && pathname.startsWith('/accounts/')) return true;
        
        return false;
      });
      if (!isAllowed) {
        router.push(navigation[0].href);
      }
    }
  }, [pathname, user, router, navigation]);

  return (
    <Disclosure as="nav" className="bg-gray-800 shadow">
      {({ open, close }) => {
        // Handle scroll lock when menu is open
        useEffect(() => {
          if (open) {
            document.body.style.overflow = 'hidden';
            document.body.style.position = 'fixed';
            document.body.style.width = '100%';
            document.body.style.top = `-${window.scrollY}px`;
          } else {
            const scrollY = document.body.style.top;
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.width = '';
            document.body.style.top = '';
            window.scrollTo(0, parseInt(scrollY || '0') * -1);
          }

          return () => {
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.width = '';
            document.body.style.top = '';
          };
        }, [open]);

        return (
          <>
            <div className="max-w-[1450px] mx-auto px-4 md:px-6 lg:px-8 py-3 lg:py-6">
              <div className="flex h-12 justify-between">
                <div className="flex">
                  <div className="flex flex-shrink-0 items-center">
                    <Link href={user?.restricted_user === 1 ? "/profile" : account && account.account_id ? `/accounts/${account.account_id}` : "/accounts"}>
                      <Image
                        src="/images/logo.svg"
                        alt="Logo"
                        width={200}
                        height={80}
                        className="w-[150px] lg:w-[200px] h-auto"
                      />
                    </Link>
                  </div>
                  <div className="hidden lg:ml-6 lg:flex lg:space-x-6">
                    {navigation.map((item) => {
                      // For account link, check if current path is accounts page or account detail page
                      const isActive = item.href === '/accounts' 
                        ? pathname === '/accounts' || pathname.startsWith('/accounts/')
                        : pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          className={`inline-flex items-center border-b-2 px-1 pt-1 text-[14px] font-medium ${
                            isActive
                              ? 'border-indigo-500 text-white'
                              : 'border-transparent text-gray-300 hover:border-gray-300 hover:text-white'
                          }`}
                        >
                          {item.name}
                        </Link>
                      );
                    })}
                  </div>
                </div>
                <div className="hidden lg:ml-6 lg:flex lg:items-center">
                  {/* Language Selector */}
                  <div className="flex items-center mr-4">
                    {/* Desktop Language Selector (>= 1450px) */}
                    <div className="hidden">
                      <a className="mr-2 items-center justify-center cursor-pointer" style={{ height: '35px' }} onClick={(e) => { e.preventDefault(); handleLanguageChange('pt'); }}>
                        <Image src="/images/pt.svg" alt="Português" width={30} height={35} className="w-[25px] h-[25px] md:w-[30px] md:h-[35px]" />
                      </a>
                      <a className="mr-2 items-center justify-center cursor-pointer" style={{ height: '35px' }} onClick={(e) => { e.preventDefault(); handleLanguageChange('en'); }}>
                        <Image src="/images/en.svg" alt="English" width={30} height={35} className="w-[25px] h-[25px] md:w-[30px] md:h-[35px]" />
                      </a>
                      <a className="mr-2 items-center justify-center cursor-pointer" style={{ height: '35px' }} onClick={(e) => { e.preventDefault(); handleLanguageChange('it'); }}>
                        <Image src="/images/it.svg" alt="Italiano" width={30} height={35} className="w-[25px] h-[25px] md:w-[30px] md:h-[35px]" />
                      </a>
                      <a className="mr-2 items-center justify-center cursor-pointer" style={{ height: '35px' }} onClick={(e) => { e.preventDefault(); handleLanguageChange('es'); }}>
                        <Image src="/images/es.svg" alt="Español" width={30} height={35} className="w-[25px] h-[25px] md:w-[30px] md:h-[35px]" />
                      </a>
                      <a className="mr-2 items-center justify-center cursor-pointer" style={{ height: '35px' }} onClick={(e) => { e.preventDefault(); handleLanguageChange('fr'); }}>
                        <Image src="/images/fr.svg" alt="Français" width={30} height={35} className="w-[25px] h-[25px] md:w-[30px] md:h-[35px]" />
                      </a>
                      <a className="mr-2 items-center justify-center cursor-pointer" style={{ height: '35px' }} onClick={(e) => { e.preventDefault(); handleLanguageChange('de'); }}>
                        <Image src="/images/de.svg" alt="Deutsch" width={30} height={35} className="w-[25px] h-[25px] md:w-[30px] md:h-[35px]" />
                      </a>
                      <a className="mr-2 items-center justify-center cursor-pointer" style={{ height: '35px' }} onClick={(e) => { e.preventDefault(); handleLanguageChange('nl'); }}>
                        <Image src="/images/nl.svg" alt="Nederlands" width={30} height={35} className="w-[25px] h-[25px] md:w-[30px] md:h-[35px]" />
                      </a>
                    </div>
                    {/* Language Dropdown (< 1450px) */}
                    <div className="block">
                      <Menu as="div" className="relative">
                        <div>
                          <Menu.Button className="flex items-center text-gray-300 hover:text-white focus:outline-none">
                            <span className="sr-only">Open language menu</span>
                            <div className="h-[35px] w-[35px] rounded-full bg-gray-700 flex items-center justify-center">
                              <Image src="/images/globe.svg" alt="Language" width={20} height={20} />
                            </div>
                          </Menu.Button>
                        </div>
                        <Transition
                          as={Fragment}
                          enter="transition ease-out duration-200"
                          enterFrom="transform opacity-0 scale-95"
                          enterTo="transform opacity-100 scale-100"
                          leave="transition ease-in duration-75"
                          leaveFrom="transform opacity-100 scale-100"
                          leaveTo="transform opacity-0 scale-95"
                        >
                          <Menu.Items className="absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-md bg-gray-800 py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  onClick={() => handleLanguageChange('pt')}
                                  className={`${
                                    active ? 'bg-gray-700' : ''
                                  } flex items-center w-full px-4 py-2 text-sm text-gray-300`}
                                >
                                  <Image src="/images/pt.svg" alt="Português" width={20} height={20} className="mr-2" />
                                  Português
                                </button>
                              )}
                            </Menu.Item>
                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  onClick={() => handleLanguageChange('en')}
                                  className={`${
                                    active ? 'bg-gray-700' : ''
                                  } flex items-center w-full px-4 py-2 text-sm text-gray-300`}
                                >
                                  <Image src="/images/en.svg" alt="English" width={20} height={20} className="mr-2" />
                                  English
                                </button>
                              )}
                            </Menu.Item>
                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  onClick={() => handleLanguageChange('it')}
                                  className={`${
                                    active ? 'bg-gray-700' : ''
                                  } flex items-center w-full px-4 py-2 text-sm text-gray-300`}
                                >
                                  <Image src="/images/it.svg" alt="Italiano" width={20} height={20} className="mr-2" />
                                  Italiano
                                </button>
                              )}
                            </Menu.Item>
                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  onClick={() => handleLanguageChange('es')}
                                  className={`${
                                    active ? 'bg-gray-700' : ''
                                  } flex items-center w-full px-4 py-2 text-sm text-gray-300`}
                                >
                                  <Image src="/images/es.svg" alt="Español" width={20} height={20} className="mr-2" />
                                  Español
                                </button>
                              )}
                            </Menu.Item>
                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  onClick={() => handleLanguageChange('fr')}
                                  className={`${
                                    active ? 'bg-gray-700' : ''
                                  } flex items-center w-full px-4 py-2 text-sm text-gray-300`}
                                >
                                  <Image src="/images/fr.svg" alt="Français" width={20} height={20} className="mr-2" />
                                  Français
                                </button>
                              )}
                            </Menu.Item>
                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  onClick={() => handleLanguageChange('de')}
                                  className={`${
                                    active ? 'bg-gray-700' : ''
                                  } flex items-center w-full px-4 py-2 text-sm text-gray-300`}
                                >
                                  <Image src="/images/de.svg" alt="Deutsch" width={20} height={20} className="mr-2" />
                                  Deutsch
                                </button>
                              )}
                            </Menu.Item>
                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  onClick={() => handleLanguageChange('nl')}
                                  className={`${
                                    active ? 'bg-gray-700' : ''
                                  } flex items-center w-full px-4 py-2 text-sm text-gray-300`}
                                >
                                  <Image src="/images/nl.svg" alt="Nederlands" width={20} height={20} className="mr-2" />
                                  Nederlands
                                </button>
                              )}
                            </Menu.Item>
                          </Menu.Items>
                        </Transition>
                      </Menu>
                    </div>
                  </div>
                  {/* Profile dropdown */}
                  <Menu as="div" className="relative ml-3">
                    <div>
                      <Menu.Button className="flex rounded-full bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800">
                        <span className="sr-only">Open user menu</span>
                        <div className="h-[40px] w-[40px] rounded-full bg-gray-600 flex items-center justify-center text-white">
                          {user?.name?.charAt(0) || 'U'}
                        </div>
                      </Menu.Button>
                    </div>
                    <Transition
                      as={Fragment}
                      enter="transition ease-out duration-200"
                      enterFrom="transform opacity-0 scale-95"
                      enterTo="transform opacity-100 scale-100"
                      leave="transition ease-in duration-75"
                      leaveFrom="transform opacity-100 scale-100"
                      leaveTo="transform opacity-0 scale-95"
                    >
                      <Menu.Items className="absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-md bg-gray-800 py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                        <Menu.Item>
                          {({ active }) => (
                            <Link
                              href="/profile"
                              className={`${
                                active ? 'bg-gray-700' : ''
                              } block px-4 py-2 text-sm text-gray-300`}
                            >
                              {t('My Profile')}
                            </Link>
                          )}
                        </Menu.Item>
                        <Menu.Item>
                          {({ active }) => (
                            <button
                              onClick={() => logout()}
                              className={`${
                                active ? 'bg-gray-700' : ''
                              } block w-full text-left px-4 py-2 text-sm text-gray-300`}
                            >
                              {t('Sign out')}
                            </button>
                          )}
                        </Menu.Item>
                      </Menu.Items>
                    </Transition>
                  </Menu>
                </div>
                <div className="-mr-2 flex items-center lg:hidden">
                  {/* Mobile menu button */}
                  <Disclosure.Button className="inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white">
                    <span className="sr-only">Open main menu</span>
                    {open ? (
                      <XMarkIcon className="block h-6 w-6" aria-hidden="true" />
                    ) : (
                      <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
                    )}
                  </Disclosure.Button>
                </div>
              </div>
            </div>

            <Transition
              show={open}
              as={Fragment}
              enter="transition ease-out duration-500"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="transition ease-in duration-400"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <Disclosure.Panel className="lg:hidden fixed inset-0 z-50">
                <div className="absolute inset-0 bg-gray-900 bg-opacity-75" onClick={() => close()} />
                <Transition
                  show={open}
                  as={Fragment}
                  enter="transition ease-out duration-500"
                  enterFrom="translate-x-full"
                  enterTo="translate-x-0"
                  leave="transition ease-in duration-400"
                  leaveFrom="translate-x-0"
                  leaveTo="translate-x-full"
                >
                  <div className="fixed inset-y-0 right-0 max-w-xs w-full bg-gray-800 shadow-xl overflow-y-auto">
                    <div className="pt-5 pb-4">
                      <div className="flex items-center justify-between px-4">
                        <div className="flex-shrink-0">
                          <Image
                            src="/images/logo.svg"
                            alt="Logo"
                            width={200}
                            height={80}
                            className="w-[150px] lg:w-[200px] h-auto"
                          />
                        </div>
                        <div className="-mr-2">
                          <Disclosure.Button className="inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white">
                            <span className="sr-only">Close menu</span>
                            <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                          </Disclosure.Button>
                        </div>
                      </div>
                      {/* Language Selector in Mobile Menu */}
                      <div className="mt-4 px-4 flex flex-wrap gap-2">
                        <a className="cursor-pointer" onClick={(e) => { e.preventDefault(); handleLanguageChange('pt'); }}>
                          <Image src="/images/pt.svg" alt="Português" width={30} height={35} className="w-[25px] h-[25px]" />
                        </a>
                        <a className="cursor-pointer" onClick={(e) => { e.preventDefault(); handleLanguageChange('en'); }}>
                          <Image src="/images/en.svg" alt="English" width={30} height={35} className="w-[25px] h-[25px]" />
                        </a>
                        <a className="cursor-pointer" onClick={(e) => { e.preventDefault(); handleLanguageChange('it'); }}>
                          <Image src="/images/it.svg" alt="Italiano" width={30} height={35} className="w-[25px] h-[25px]" />
                        </a>
                        <a className="cursor-pointer" onClick={(e) => { e.preventDefault(); handleLanguageChange('es'); }}>
                          <Image src="/images/es.svg" alt="Español" width={30} height={35} className="w-[25px] h-[25px]" />
                        </a>
                        <a className="cursor-pointer" onClick={(e) => { e.preventDefault(); handleLanguageChange('fr'); }}>
                          <Image src="/images/fr.svg" alt="Français" width={30} height={35} className="w-[25px] h-[25px]" />
                        </a>
                        <a className="cursor-pointer" onClick={(e) => { e.preventDefault(); handleLanguageChange('de'); }}>
                          <Image src="/images/de.svg" alt="Deutsch" width={30} height={35} className="w-[25px] h-[25px]" />
                        </a>
                        <a className="cursor-pointer" onClick={(e) => { e.preventDefault(); handleLanguageChange('nl'); }}>
                          <Image src="/images/nl.svg" alt="Nederlands" width={30} height={35} className="w-[25px] h-[25px]" />
                        </a>
                      </div>
                      <div className="mt-5 space-y-1">
                        {navigation.map((item) => {
                          // For account link, check if current path is accounts page or account detail page
                          const isActive = item.href === '/accounts' 
                            ? pathname === '/accounts' || pathname.startsWith('/accounts/')
                            : pathname.startsWith(item.href);
                          return (
                            <Disclosure.Button
                              key={item.name}
                              as={Link}
                              href={item.href}
                              className={`block px-4 py-2 text-lg font-medium ${
                                isActive
                                  ? 'bg-gray-700 text-white'
                                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                              }`}
                            >
                              {item.name}
                            </Disclosure.Button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="border-t border-gray-700 pt-4 pb-3">
                      <div className="flex items-center px-4">
                        <div className="flex-shrink-0">
                          <div className="h-8 w-8 rounded-full bg-gray-600 flex items-center justify-center text-white">
                            {user?.name?.charAt(0) || 'U'}
                          </div>
                        </div>
                        <div className="ml-3">
                          <div className="text-base font-medium text-white">{user?.name}</div>
                          <div className="text-sm font-medium text-gray-400">{user?.email}</div>
                        </div>
                      </div>
                      <div className="mt-3 space-y-1">
                        <Disclosure.Button
                          as={Link}
                          href="/profile"
                          className={`block px-4 py-2 text-base font-medium ${
                            pathname === '/profile'
                              ? 'bg-gray-700 text-white'
                              : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                          }`}
                        >
                          {t('My Profile')}
                        </Disclosure.Button>
                        <Disclosure.Button
                          as="button"
                          onClick={() => logout()}
                          className="block w-full text-left px-4 py-2 text-base font-medium text-gray-300 hover:bg-gray-700 hover:text-white"
                        >
                          {t('Sign out')}
                        </Disclosure.Button>
                      </div>
                    </div>
                  </div>
                </Transition>
              </Disclosure.Panel>
            </Transition>
          </>
        );
      }}
    </Disclosure>
  );
}
