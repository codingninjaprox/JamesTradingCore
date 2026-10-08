"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/utils/translation";
import { toast } from "react-hot-toast";
import { FaTrophy, FaUserCircle } from "react-icons/fa";

interface User {
  name: string;
  pnl: number;
  user_name?: string;
}

export default function TopRanksPage() {
  const { token, user } = useAuth();
  const { translations } = useLanguage();
  const t = (key: string) => getTranslation(translations, key);

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Cache management functions
  const getCacheKey = () => `leaderboard_data_${user?.id}`
  const getCacheExpiry = () => 15 * 24 * 60 * 60 * 1000 // 15 days

  const saveToCache = (data: User[]) => {
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

  const loadFromCache = (): User[] | null => {
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

  const clearCache = () => {
    if (!user?.id) return
    try {
      localStorage.removeItem(getCacheKey())
    } catch (error) {
      console.error('Error clearing cache:', error)
    }
  }

  useEffect(() => {
    if (token && user?.id) {
      // Load cached data immediately
      const cachedData = loadFromCache();
      if (cachedData) {
        setUsers(cachedData);
        setLoading(false);
        setIsInitialLoad(false);
      }
      
      // Always fetch fresh data in background
      fetchLeaderboard(true);
    }
  }, [token, user?.id]);

  // Background refresh every 1 minute (leaderboard changes frequently)
  useEffect(() => {
    if (!token || !user?.id) return

    const interval = setInterval(() => {
      fetchLeaderboard(true);
    }, 1 * 60 * 1000) // 1 minute

    return () => clearInterval(interval)
  }, [token, user?.id])

  const fetchLeaderboard = async (isBackgroundUpdate = false) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/leaderboard`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          toast.error(t("Session expired. Please log in again."));
          return;
        }
        throw new Error(t("Failed to fetch leaderboard data"));
      }

      const data = await response.json();
      let userArray: any[] = [];
      if (data.success && data.data) {
        // If data.data is an object, convert to array
        if (Array.isArray(data.data)) {
          userArray = data.data;
        } else if (typeof data.data === "object") {
          userArray = Object.values(data.data);
        }
        // Ensure we only set valid user data
        const validUsers = userArray.filter(
          (user: any) =>
            user &&
            typeof user === "object" &&
            typeof user.name === "string" &&
            typeof user.pnl === "number"
        );

        // Check if data has actually changed (for background updates)
        if (isBackgroundUpdate) {
          const currentData = users;
          
          // Only update if data has changed
          if (JSON.stringify(currentData) !== JSON.stringify(validUsers)) {
            setUsers(validUsers);
          }
        } else {
          // Initial load - always update
          setUsers(validUsers);
        }

        // Save to cache
        saveToCache(validUsers);
      } else {
        console.error("Invalid data format received:", data);
        if (!isBackgroundUpdate) {
          setUsers([]);
          toast.error(t("Invalid data format received"));
        }
      }
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      if (!isBackgroundUpdate) {
        toast.error(t("Failed to fetch leaderboard data"));
        setUsers([]);
      }
    } finally {
      if (!isBackgroundUpdate) {
        setLoading(false);
        setIsInitialLoad(false);
      }
    }
  };

  const formatCurrency = (amount: number) => {
    return `${Math.floor(amount)}€`;
  };

  const getReadableName = (name: string) => {
    if (!name) return "Unknown User";
    
    const nameParts = name.split(" ");
    if (nameParts.length < 2) return name;
    
    const firstName = nameParts[0];
    return `${firstName} ****`;
  };

  return (
    <div className="flex justify-center items-center">
      <div className="w-full max-w-2xl mx-auto px-4 pb-4 md:py-8">
        <div className="rounded-2xl shadow-xl bg-[#232b3e] border border-[#2d3748] overflow-hidden min-h-[400px] md:min-h-[800px] pb-1">
          <div className="flex items-center gap-2 px-6 py-4 bg-gradient-to-r from-yellow-400/80 to-yellow-600/80">
            <FaTrophy className="text-white text-2xl drop-shadow" />
            <span className="text-white text-lg md:text-xl font-bold tracking-wide">
              {t("dashboard.top-ranks-title")}
            </span>
          </div>
          <p className="text-gray-300 text-xs md:text-sm text-center mb-6 italic mt-4 px-4 md:px-8">
            {t("The values presented reflect past results and do not guarantee future performance.")}
          </p>
          <div className="grid grid-cols-12 gap-2 px-4 md:px-8">
            <div className="col-span-2 font-semibold text-gray-400 hidden md:block">
              #
            </div>
            <div className="col-span-6 font-semibold text-gray-400 hidden md:block">
              {t("User")}
            </div>
            <div className="col-span-4 font-semibold text-gray-400 hidden md:block text-center">
              {t("Profit")}
            </div>
            {users.length > 0 && users.map((user: User, index: number) => {
              if (user.pnl < 0) return null;
              const rank = index + 1;
              // Badge color for top 3
              let badgeColor = "";
              if (rank === 1)
                badgeColor =
                  "bg-gradient-to-r from-yellow-400 to-yellow-600 text-white shadow-md";
              else if (rank === 2)
                badgeColor =
                  "bg-gradient-to-r from-gray-300 to-gray-500 text-gray-900 shadow-md";
              else if (rank === 3)
                badgeColor =
                  "bg-gradient-to-r from-orange-400 to-orange-600 text-white shadow-md";
              else badgeColor = "bg-gray-700 text-gray-200";
              return (
                <div
                  key={user.name}
                  className={`col-span-12 grid grid-cols-12 items-center h-[64px] gap-4 ${index % 2 === 0 ? "bg-[#232b3e]" : "bg-[#1a2234]"} p-2 rounded-md transition duration-300 ease-in-out hover:bg-[rgba(255,255,255,0.08)] cursor-pointer`}
                >
                  {/* Rank Badge */}
                  <div className="col-span-3 md:col-span-2 flex justify-center">
                    <div
                      className={`flex items-center justify-center w-10 h-10 rounded-full font-bold text-lg ${badgeColor}`}
                    >
                      {rank}
                    </div>
                  </div>
                  {/* User Info */}
                  <div className="col-span-5 md:col-span-6 flex items-center gap-2">
                    <div className="hidden md:block w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white text-base p-[2px]">
                      <FaUserCircle className="w-7 h-7 text-gray-300" />
                    </div>
                    <span className="block text-white font-medium truncate max-w-[120px] md:max-w-[200px]">
                      {getReadableName(user.user_name || "Unknown User")}
                    </span>
                  </div>
                  {/* Profit - Mobile */}
                  <div className="col-span-4 text-green-400 font-bold md:hidden block text-center">
                    {rank === 1
                      ? formatCurrency(user.pnl * 100)
                      : rank === 2
                        ? formatCurrency(user.pnl * 50)
                        : rank === 3
                          ? formatCurrency(user.pnl * 30)
                          : formatCurrency(user.pnl * 20)}
                  </div>
                  {/* Profit - Desktop */}
                  <div className="col-span-4 text-green-400 font-bold hidden md:block text-center">
                    {rank === 1
                      ? formatCurrency(user.pnl * 100)
                      : rank === 2
                        ? formatCurrency(user.pnl * 50)
                        : rank === 3
                          ? formatCurrency(user.pnl * 30)
                          : formatCurrency(user.pnl * 20)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}