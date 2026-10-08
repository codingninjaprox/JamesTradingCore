'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';

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
  is_vip: number;
  restricted_user: number;
  connected?: boolean;
  server_status: boolean;
  /** When set by API (not null), enables Pro access without balance check. Same level meaning as is_vip (1=PRO, 2=PRO+, etc.). */
  forced_pro_level?: number | null;
  menu_visibility?: MenuVisibility;
  /** User's preferred language (e.g. from api/auth/me). */
  lang?: string;
}

interface LoginResponse {
  user: User;
  token: string;
  token_type: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthChecked: boolean;
  login: (email: string, password: string, admin?: boolean) => Promise<LoginResponse>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  forceRefreshUser: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const justLoggedInRef = useRef(false); // Track if we just logged in to skip redundant /api/auth/me calls
  const isRefreshingUserRef = useRef(false); // Prevent concurrent refreshUser calls
  const isForceRefreshingRef = useRef(false); // Prevent concurrent forceRefreshUser calls

  // Initialize auth state from localStorage
  useEffect(() => {
    const initializeAuth = () => {
      try {
        const storedToken = localStorage.getItem(TOKEN_KEY);
        const storedUser = localStorage.getItem(USER_KEY);
        
        if (storedToken) {
          setToken(storedToken);
          if (storedUser) {
            try {
              const parsedUser = JSON.parse(storedUser);
              setUser(parsedUser);
            } catch (error) {
              console.error('Error parsing stored user data:', error);
              localStorage.removeItem(USER_KEY);
            } 
          }
        }
      } catch (error) {
        console.error('Error accessing localStorage:', error);
      } finally {
        setIsLoading(false);
        setIsAuthChecked(true);
      }
    };

    initializeAuth();
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    
    // Prevent concurrent calls
    if (isRefreshingUserRef.current) {
      return;
    }
    
    try {
      isRefreshingUserRef.current = true;
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          
          // Get current localStorage data for comparison
          const currentStoredUser = localStorage.getItem(USER_KEY);
          let currentUser = null;
          
          if (currentStoredUser) {
            try {
              currentUser = JSON.parse(currentStoredUser);
            } catch (error) {
              console.error('Error parsing current stored user data:', error);
            }
          }
          
          // Compare current data with fresh data
          const hasChanges = !currentUser || 
            currentUser.is_vip !== data.data.is_vip ||
            currentUser.restricted_user !== data.data.restricted_user ||
            currentUser.name !== data.data.name ||
            currentUser.email !== data.data.email ||
            currentUser.broker !== data.data.broker ||
            currentUser.connected !== data.data.connected ||
            currentUser.server_status !== data.data.server_status ||
            JSON.stringify(currentUser.menu_visibility) !== JSON.stringify(data.data.menu_visibility);
          
          if (hasChanges) {
            // Update localStorage with fresh data
            localStorage.setItem(USER_KEY, JSON.stringify(data.data));
            
            // Update connected status in localStorage for Navigation component
            if (data.data.id) {
              try {
                localStorage.setItem(`user_connected_${data.data.id}`, JSON.stringify(data.data.connected === true));
                // Dispatch event to update Navigation
                window.dispatchEvent(new Event('connectedStatusUpdated'));
              } catch (error) {
                console.warn('Failed to cache connected status:', error);
              }
            }
            
            // Update state
            setUser(data.data);
          } else {
            console.log('No changes detected in user data - keeping current state');
          }
        }
      } else {
        console.error('Failed to refresh user data:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error refreshing user data:', error);
    } finally {
      isRefreshingUserRef.current = false;
    }
  }, [token]);

  // Call refreshUser on page load to check for updates
  // Skip if we just logged in (login already provides fresh user data)
  useEffect(() => {
    if (!token || !user || isLoading) return;
    
    // Skip refresh if we just logged in (avoid redundant API call)
    if (justLoggedInRef.current) {
      justLoggedInRef.current = false; // Reset flag
      return;
    }

    // Small delay to ensure everything is initialized
    const timer = setTimeout(() => {
      refreshUser();
    }, 100);

    return () => clearTimeout(timer);
  }, [token, user, isLoading, refreshUser]);

  // Check token validity and handle routing
  // Only call /api/auth/me if we don't have user data (e.g., page refresh from localStorage)
  // Skip if we just logged in (login already provides fresh user data)
  useEffect(() => {
    if (!isLoading && token) {
      const checkAuth = async () => {
        // Skip /api/auth/me call if we just logged in (we already have fresh data)
        if (justLoggedInRef.current) {
          justLoggedInRef.current = false; // Reset flag
          return;
        }
        
        // Only call /api/auth/me if we don't have user data (e.g., loaded from localStorage)
        // If we have user data, we can assume token is valid
        if (user) {
          // User data exists, token is likely valid - no need to call /api/auth/me
          return;
        }
        
        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            if (response.status === 401) {
              // Token is invalid or expired
              logout();
              if (pathname !== '/login' && pathname !== '/forgot-password' && !pathname.startsWith('/set-password')) {
                router.push('/login');
              }
            }
          } else {
            if(user === null){
              const data = await response.json();
              // Update state
              setToken(data.data.token);
              setUser(data.data.user);
              
              // Update connected status in localStorage for Navigation component
              if (data.data.user && data.data.user.id) {
                try {
                  localStorage.setItem(`user_connected_${data.data.user.id}`, JSON.stringify(data.data.user.connected === true));
                  // Dispatch event to update Navigation
                  window.dispatchEvent(new Event('connectedStatusUpdated'));
                } catch (error) {
                  console.warn('Failed to cache connected status:', error);
                }
              }
            }
            if (pathname === '/login') {
              // User is authenticated and on login page, redirect to accounts
              // router.push('/accounts');
            }
          }
        } catch (error) {
          console.error('Auth check failed:', error);
          // Only redirect on network errors, not on 401
          if (pathname !== '/login' && pathname !== '/forgot-password' && !pathname.startsWith('/set-password')) {
            router.push('/login');
          }
        }
      };

      checkAuth();
    } else if (!isLoading && !token && pathname !== '/login' && pathname !== '/forgot-password' && !pathname.startsWith('/set-password')) {
      // No token and not on login, forgot-password, or set-password page
      router.push('/login');
    }
  }, [isLoading, token, pathname, user]);

  const login = async (email: string, password: string, admin: boolean = false) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, ...(admin && { admin: true }) }),
      });

      if (!response.ok) {
        throw new Error('Login failed');
      }

      const data = await response.json();
      
      // Save auth data to localStorage
      localStorage.setItem(TOKEN_KEY, data.data.token);
      if (data.data.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(data.data.user));
      }
      
      // Update state
      setToken(data.data.token);
      setUser(data.data.user);
      
      // Set flag to skip redundant /api/auth/me calls after login
      // Login endpoint already returns all user data, so no need to call /api/auth/me
      justLoggedInRef.current = true;
      
      // Return login data including connected status for routing
      return data.data;
    
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = () => {
    try {
      // Clear auth data from localStorage
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (error) {
      console.error('Error clearing localStorage:', error);
    }
    
    // Clear state
    setToken(null);
    setUser(null);
    
    // Redirect to login
    router.push('/login');
  };

  const forceRefreshUser = async () => {
    if (!token) return;
    
    // Prevent concurrent calls
    if (isForceRefreshingRef.current) {
      console.log('forceRefreshUser: Already refreshing, skipping duplicate call');
      return;
    }
    
    try {
      isForceRefreshingRef.current = true;
      console.log('forceRefreshUser: Starting refresh');
      // Store current user state before clearing
      const currentUser = user;
      
      // Wait a moment, then fetch fresh data
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          // Update connected status in localStorage for Navigation component
          if (data.data.id) {
            try {
              localStorage.setItem(`user_connected_${data.data.id}`, JSON.stringify(data.data.connected === true));
              // Dispatch event to update Navigation
              window.dispatchEvent(new Event('connectedStatusUpdated'));
            } catch (error) {
              console.warn('Failed to cache connected status:', error);
            }
          }
          
          if(data.data.restricted_user === 0 && currentUser?.restricted_user === 1){
              // Clear current user state first
              setUser(null);
              
              // Clear localStorage user data
              localStorage.removeItem(USER_KEY);
              
              // Update localStorage
              localStorage.setItem(USER_KEY, JSON.stringify(data.data));
              
              // Update state
              setUser(data.data);
              
              // Only force a page refresh if the restricted status actually changed
              if (currentUser && currentUser.restricted_user !== data.data.restricted_user) {
                window.location.reload();
              } else {
                console.log('Restricted status unchanged, no page refresh needed');
              }
            } else {
              // Update user data if it changed
              const hasChanges = !currentUser || 
                currentUser.is_vip !== data.data.is_vip ||
                currentUser.restricted_user !== data.data.restricted_user ||
                currentUser.name !== data.data.name ||
                currentUser.email !== data.data.email ||
                currentUser.broker !== data.data.broker ||
                currentUser.connected !== data.data.connected ||
                JSON.stringify(currentUser.menu_visibility) !== JSON.stringify(data.data.menu_visibility);
              
              if (hasChanges) {
                localStorage.setItem(USER_KEY, JSON.stringify(data.data));
                setUser(data.data);
              }
            }
        }
      } else {
        console.error('Failed to force refresh user data:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error force refreshing user data:', error);
    } finally {
      console.log('forceRefreshUser: Refresh completed');
      isForceRefreshingRef.current = false;
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isLoading,
      isAuthChecked,
      login,
      logout,
      refreshUser,
      forceRefreshUser,
      isAuthenticated: !!token
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 