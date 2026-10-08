"use client";

import { useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/utils/translation";
import {
  FaCalculator,
  FaChartLine,
  FaInfoCircle,
  FaCrown,
  FaExclamationTriangle,
} from "react-icons/fa";
import { useAuth } from '@/contexts/AuthContext';

interface RiskSetting {
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

interface CalculationResult {
  deposit: number;
  riskSetting: string;
  period: number;
  totalProfit: number;
  monthlyProfits: number[];
}

export default function CalculatorPage() {
  const { translations } = useLanguage();
  const { token, user } = useAuth();
  const t = (key: string) => getTranslation(translations, key);
  const [deposit, setDeposit] = useState("");
  const [selectedRisk, setSelectedRisk] = useState("low");
  const [period, setPeriod] = useState(1);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [minValueMessage, setMinValueMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [riskSettings, setRiskSettings] = useState<RiskSetting[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Cache management functions
  const getCacheKey = () => `calculator_data_${user?.id}`
  const getUserInputsCacheKey = () => `calculator_inputs_${user?.id}`
  const getCacheExpiry = () => 15 * 24 * 60 * 60 * 1000 // 15 days

  const saveToCache = (data: RiskSetting[]) => {
    if (!user?.id) return
    try {
      const cacheData = {
        data,
        timestamp: Date.now(),
        expiry: getCacheExpiry()
      }
      localStorage.setItem(getCacheKey(), JSON.stringify(cacheData))
    } catch (error) {
      console.error('Error saving to cache:', error)
    }
  }

  const loadFromCache = (): RiskSetting[] | null => {
    if (!user?.id) return null
    try {
      const cached = localStorage.getItem(getCacheKey())
      if (!cached) return null
      
      const cacheData = JSON.parse(cached)
      const now = Date.now()
      
      // Check if cache is expired
      if (now - cacheData.timestamp > cacheData.expiry) {
        localStorage.removeItem(getCacheKey())
        return null
      }
      
      return cacheData.data
    } catch (error) {
      console.error('Error loading from cache:', error)
      return null
    }
  }

  const saveUserInputsToCache = (inputs: { deposit: string; selectedRisk: string; period: number }) => {
    if (!user?.id) return
    try {
      const cacheData = {
        data: inputs,
        timestamp: Date.now(),
        expiry: getCacheExpiry()
      }
      localStorage.setItem(getUserInputsCacheKey(), JSON.stringify(cacheData))
    } catch (error) {
      console.error('Error saving user inputs to cache:', error)
    }
  }

  const loadUserInputsFromCache = () => {
    if (!user?.id) return null
    try {
      const cached = localStorage.getItem(getUserInputsCacheKey())
      if (!cached) return null
      
      const cacheData = JSON.parse(cached)
      const now = Date.now()
      
      // Check if cache is expired
      if (now - cacheData.timestamp > cacheData.expiry) {
        localStorage.removeItem(getUserInputsCacheKey())
        return null
      }
      
      return cacheData.data
    } catch (error) {
      console.error('Error loading user inputs from cache:', error)
      return null
    }
  }

  const clearCache = () => {
    if (!user?.id) return
    try {
      localStorage.removeItem(getCacheKey())
      localStorage.removeItem(getUserInputsCacheKey())
    } catch (error) {
      console.error('Error clearing cache:', error)
    }
  }

  useEffect(() => {
    if (token && user?.id) {
      // Load cached data immediately
      const cachedData = loadFromCache();
      if (cachedData) {
        setRiskSettings(cachedData);
        setIsLoading(false);
        setIsInitialLoad(false);
      }
      
      // Load cached user inputs
      const cachedInputs = loadUserInputsFromCache();
      if (cachedInputs) {
        setDeposit(cachedInputs.deposit);
        setSelectedRisk(cachedInputs.selectedRisk);
        setPeriod(cachedInputs.period);
      }
      
      // Always fetch fresh data in background
      fetchRiskSettings(true);
    }
  }, [token, user?.id]);

  // Background refresh every 5 minutes (risk settings change less frequently)
  useEffect(() => {
    if (!token || !user?.id) return

    const interval = setInterval(() => {
      fetchRiskSettings(true);
    }, 5 * 60 * 1000) // 5 minutes

    return () => clearInterval(interval)
  }, [token, user?.id])

  const fetchRiskSettings = async (isBackgroundUpdate = false) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/simulation`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();

      if (data.success) {
        const allSettings = data.data as RiskSetting[];
        
        // Filter settings based on user broker type
        // For "Other" broker, use "other" and "other_pro" types
        // For other brokers, use "normal" and "pro" types
        const filteredSettings = allSettings.filter((setting: RiskSetting) => {
          if (user?.broker === "Other") {
            return (setting.type === "other" || setting.type === "other_pro") && setting.enabled;
          } else {
            return (setting.type === "normal" || setting.type === "pro") && setting.enabled;
          }
        });

        // Sort by display_order
        const sortedSettings = filteredSettings.sort((a, b) => a.display_order - b.display_order);

        // Check if data has actually changed (for background updates)
        if (isBackgroundUpdate) {
          const currentData = riskSettings;
          
          // Only update if data has changed
          if (JSON.stringify(currentData) !== JSON.stringify(sortedSettings)) {
            setRiskSettings(sortedSettings);
          }
        } else {
          // Initial load - always update
          setRiskSettings(sortedSettings);
          
          // Set default risk to the first enabled setting
          const firstEnabledSetting = sortedSettings.find((setting: RiskSetting) => setting.enabled);
          if (firstEnabledSetting) {
            setSelectedRisk(firstEnabledSetting.name);
          }
        }

        // Save to cache
        saveToCache(sortedSettings);
      } else {
        console.error('Failed to fetch risk settings:', data.message);
        if (!isBackgroundUpdate) {
          setIsLoading(false);
        }
      }
    } catch (error) {
      console.error('Error fetching risk settings:', error);
      if (!isBackgroundUpdate) {
        setIsLoading(false);
      }
    } finally {
      if (!isBackgroundUpdate) {
        setIsLoading(false);
        setIsInitialLoad(false);
      }
    }
  };

  useEffect(() => {
    calculateProfits();
  }, [deposit, selectedRisk, period]);

  // Save user inputs to cache when they change
  useEffect(() => {
    if (user?.id && !isInitialLoad) {
      saveUserInputsToCache({
        deposit,
        selectedRisk,
        period
      });
    }
  }, [deposit, selectedRisk, period, user?.id, isInitialLoad]);

  // Add new effect to update minimum deposit message when risk setting changes
  useEffect(() => {
    const selectedSetting = riskSettings.find(
      (setting) => setting.name === selectedRisk
    );
    if (selectedSetting) {
      setMinValueMessage(
        `${t("Minimum value is :")} ${selectedSetting.min_deposit}€`
      );
    }
  }, [selectedRisk]);

  const calculateProfits = () => {
    const selectedSetting = riskSettings.find(
      (setting) => setting.name === selectedRisk
    );
    if (!selectedSetting) return;

    const depositNumber = Number(deposit) || 0;

    // Show minimum value message but still calculate profits
    if (depositNumber < selectedSetting.min_deposit) {
      setMinValueMessage(
        `${t("Minimum value is :")} ${selectedSetting.min_deposit}€`
      );
      // Set all values to 0 when deposit is below minimum
      setResult({
        deposit: 0,
        riskSetting: selectedRisk,
        period,
        totalProfit: 0,
        monthlyProfits: [0],
      });
      return;
    }

    setMinValueMessage("");

    // Calculate total profit using the same logic as Laravel: timePeriod * deposit * multiplier
    const totalProfit = period * depositNumber * selectedSetting.multiplier;

    setResult({
      deposit: depositNumber,
      riskSetting: selectedRisk,
      period,
      totalProfit,
      monthlyProfits: [totalProfit], // Simplified to match Laravel's single total calculation
    });
  };

  const formatCurrency = (amount: number) => {
    return `${amount.toFixed(2)}€`;
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-4 md:py-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-[#232b3e] rounded-2xl border border-[#2d3748] shadow-xl overflow-hidden">
          {/* Card Header */}
          <div className="flex items-center gap-2 px-6 py-4 bg-gradient-to-r from-blue-400 to-blue-600">
            <FaCalculator className="text-white text-2xl drop-shadow" />
            <span className="text-white text-lg md:text-xl font-bold tracking-wide">
              {t("Calculate your potential profits")}
            </span>
          </div>

          {/* Card Content */}
          <div className="px-4 md:px-8 py-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left Column - Information */}
              <div className="space-y-6">
                <div className="space-y-4">
                  <p className="text-gray-300 text-base">
                    {t(
                      "The James Trading Group comes with different settings to choose from, Low, Medium, and High for accounts with a deposit of less than 2000€."
                    )}
                  </p>
                  <p className="text-gray-300 text-base">
                    {t(
                      "Accounts with more than 2000€ deposit can have the PRO setting, which has the following levels of settings for PRO accounts:"
                    )}
                  </p>
                  <div className="space-y-2 bg-[#1a2234] rounded-xl p-4 border border-[#2d3748]">
                    {riskSettings
                      .filter((setting) => {
                        // For Other users, show "other_pro" type
                        // For other users, show "pro" type
                        return user?.broker === "Other" 
                          ? setting.type === "other_pro"
                          : setting.type === "pro";
                      })
                      .map((setting) => (
                        <p
                          key={setting.id}
                          className="text-gray-300 text-base flex items-center gap-2"
                        >
                          <FaCrown className="text-yellow-400 min-w-[16px]"/>
                          {setting.name.toUpperCase()}: {t("PRO-Calc")}{" "}
                          {setting.min_deposit}€
                        </p>
                      ))}
                  </div>
                  <p className="text-gray-300 text-base">
                    {t(
                      "Here you can calculate your potential profits with it, depending on your initial deposit size, risk setting, and time period"
                    )}
                    :
                  </p>
                </div>
              </div>

              {/* Right Column - Calculator */}
              <div className="space-y-6">
                {/* Deposit Input */}
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-gray-300 text-sm font-medium">
                      {t("Deposit")}
                    </span>
                    <div className="relative mt-1">
                      <input
                        type="number"
                        value={deposit}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9]/g, '');
                          setDeposit(value);
                        }}
                        className="w-full px-4 py-2 bg-[#1a2234] border border-[#2d3748] rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        min="0"
                        step="100"
                        inputMode="numeric"
                        pattern="[0-9]*"
                      />
                      <span className="absolute right-3 top-2 text-gray-400">
                        €
                      </span>
                    </div>
                    {minValueMessage && (
                      <div className="flex items-center gap-2 text-yellow-400 text-sm mt-1">
                        <FaExclamationTriangle />
                        <p>{minValueMessage}</p>
                      </div>
                    )}
                  </label>

                  {/* Risk Settings */}
                  <div className="space-y-4">
                    <span className="text-gray-300 text-sm font-medium block">
                      {t("Setting")}
                    </span>

                    {/* Normal Users */}
                    <div className="space-y-2">
                      <p className="text-gray-400 text-sm font-semibold">
                        {t("Normal User")}
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {riskSettings
                          .filter((setting) => {
                            // For Other users, show "other" type
                            // For other users, show "normal" type
                            return user?.broker === "Other" 
                              ? setting.type === "other"
                              : setting.type === "normal";
                          })
                          .map((setting) => (
                            <button
                              key={setting.id}
                              onClick={() => setSelectedRisk(setting.name)}
                              className={`p-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                selectedRisk === setting.name
                                  ? "text-white bg-blue-600"
                                  : "bg-[#1a2234] text-gray-200 hover:bg-[#2d3748]"
                              }`}
                            >
                              {t(ucfirst(setting.name))}
                            </button>
                          ))}
                      </div>
                    </div>

                    {/* PRO Users */}
                    <div className="space-y-2">
                      <p className="text-gray-400 text-sm font-semibold flex items-center gap-2">
                        <FaCrown className="text-yellow-400" />
                        {t("PRO Users")}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {riskSettings
                          .filter((setting) => {
                            // For Other users, show "other_pro" type
                            // For other users, show "pro" type
                            return user?.broker === "Other" 
                              ? setting.type === "other_pro"
                              : setting.type === "pro";
                          })
                          .map((setting) => (
                            <button
                              key={setting.id}
                              onClick={() => setSelectedRisk(setting.name)}
                              className={`p-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                selectedRisk === setting.name
                                  ? "text-white border border-[#9333EA] bg-[#9333EA]"
                                  : "bg-[#1a2234] text-gray-200 border border-[#2d3748] hover:bg-[#2d3748]"
                              }`}
                            >
                              {setting.name.toUpperCase()}
                            </button>
                          ))}
                      </div>
                    </div>
                  </div>

                  {/* Time Period Slider */}
                  <div className="space-y-2">
                    <span className="text-gray-300 text-sm font-medium block">
                      {t("Time Period")}
                    </span>
                    <input
                      type="range"
                      min="1"
                      max="36"
                      value={period}
                      onChange={(e) => setPeriod(Number(e.target.value))}
                      className="w-full h-2 bg-[#1a2234] rounded-lg appearance-none cursor-pointer slider"
                      style={{
                        background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(period - 1) / 35 * 100}%, #1a2234 ${(period - 1) / 35 * 100}%, #1a2234 100%)`
                      }}
                    />
                    <div className="flex justify-between text-gray-400 text-xs">
                      <span>1 {t("month")}</span>
                      <span>
                        {period} {period === 1 ? t("month") : t("months")}
                      </span>
                      <span>36 {t("months")}</span>
                    </div>
                  </div>
                </div>

                {/* Results Section */}
                <div className="mt-8 p-6 bg-[#1a2234] rounded-xl border border-[#2d3748]">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <FaChartLine className="text-blue-600" />
                    {t("Total Potential Profits")}
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300">{t("Initial Deposit")}</span>
                      <span className="text-white font-semibold">
                        {formatCurrency(result?.deposit || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300">{t("Total Profit")}</span>
                      <span className="text-green-400 font-semibold">
                        {formatCurrency(result?.totalProfit || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300">{t("Final Amount")}</span>
                      <span className="text-white font-semibold">
                        {formatCurrency((result?.deposit || 0) + (result?.totalProfit || 0))}
                      </span>
                    </div>
                    <div className="pt-4 mt-4 border-t border-[#2d3748]">
                      <p className="text-gray-400 italic text-[12px]">
                        {t("This simulation is for illustrative purposes only and does not guarantee future performance.")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ucfirst(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
