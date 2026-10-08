'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language } from '@/types/language';

interface LanguageContextType {
  currentLanguage: string;
  setLanguage: (lang: string) => void;
  translations: Record<string, any>;
  isLoading: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = 'selected_language';
const TRANSLATIONS_CACHE_KEY = 'translations_cache';

// Get initial language from localStorage or default to 'en'
const getInitialLanguage = (): string => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(STORAGE_KEY) || 'en';
  }
  return 'en';
};

// Cache management functions
const getCacheExpiry = () => 15 * 24 * 60 * 60 * 1000; // 15 days

const saveTranslationsToCache = (language: string, translations: Record<string, any>) => {
  if (typeof window === 'undefined') return;
  try {
    const cacheData = {
      [language]: {
        data: translations,
        timestamp: Date.now(),
        expiry: getCacheExpiry()
      }
    };
    
    // Get existing cache
    const existingCache = localStorage.getItem(TRANSLATIONS_CACHE_KEY);
    let allCache = existingCache ? JSON.parse(existingCache) : {};
    
    // Update with new data
    allCache[language] = cacheData[language];
    
    localStorage.setItem(TRANSLATIONS_CACHE_KEY, JSON.stringify(allCache));
  } catch (error) {
    console.error('Error saving translations to cache:', error);
  }
};

const loadTranslationsFromCache = (language: string): Record<string, any> | null => {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(TRANSLATIONS_CACHE_KEY);
    if (!cached) return null;
    
    const allCache = JSON.parse(cached);
    const languageCache = allCache[language];
    
    if (!languageCache) return null;
    
    const now = Date.now();
    
    // Check if cache is expired
    if (now - languageCache.timestamp > languageCache.expiry) {
      // Remove expired cache
      delete allCache[language];
      localStorage.setItem(TRANSLATIONS_CACHE_KEY, JSON.stringify(allCache));
      return null;
    }
    
    return languageCache.data;
  } catch (error) {
    console.error('Error loading translations from cache:', error);
    return null;
  }
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [currentLanguage, setCurrentLanguage] = useState<string>(getInitialLanguage);
  const [translations, setTranslations] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Fetch translations when language changes
  useEffect(() => {
    const fetchTranslations = async (isBackgroundUpdate = false) => {
      if (!isBackgroundUpdate) {
        setIsLoading(true);
      }

      let cachedTranslations: Record<string, any> | null = null;

      try {
        // Try to load from cache first
        cachedTranslations = loadTranslationsFromCache(currentLanguage);
        
        if (cachedTranslations && !isBackgroundUpdate) {
          // Load cached data immediately
          setTranslations(cachedTranslations);
          setIsLoading(false);
        }

        // Always fetch fresh data from API
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/translations/${currentLanguage}`);
        if (!response.ok) {
          throw new Error('Failed to fetch translations');
        }
        const data = await response.json();

        // Check if data has changed (for background updates)
        if (isBackgroundUpdate) {
          if (JSON.stringify(translations) !== JSON.stringify(data)) {
            setTranslations(data);
          }
        } else {
          // Initial load - always update
          setTranslations(data);
        }

        // Save to cache
        saveTranslationsToCache(currentLanguage, data);
      } catch (error) {
        console.error('Error fetching translations:', error);
        // If API fails and we have cached data, keep using it
        if (!cachedTranslations) {
          setTranslations({});
        }
      } finally {
        if (!isBackgroundUpdate) {
          setIsLoading(false);
        }
      }
    };

    fetchTranslations();
  }, [currentLanguage]);

  const setLanguage = (lang: string) => {
    setCurrentLanguage(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  };

  return (
    <LanguageContext.Provider value={{ currentLanguage, setLanguage, translations, isLoading }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
} 