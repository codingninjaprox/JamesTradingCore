'use client';

import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/utils/translation';
import { FaUser, FaLanguage, FaLock, FaCrown, FaInstagram, FaIdCard, FaMoneyBill, FaCheck, FaHistory } from 'react-icons/fa';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

interface UserProfile {
    name: string;
    email: string;
    lang: string;
    is_vip: number;
    ig_user: string;
    id_broker: string;
    ftd: string;
    paid: string;
}

interface AccountActivity {
    id: number;
    activity_type: string;
    details: {
        account_number: string;
        current_balance: number;
        configuration?: {
            server: string;
            groupid: string;
            subscription: string;
            environment: string;
        };
        previous_configuration?: {
            groupid: string;
            server: string;
            status: string;
        };
        new_configuration?: {
            groupid: string;
            server: string;
            status: string;
        };
        active_configuration?: {
            groupid: string;
            server: string;
            status: string;
            name: string;
        };
        action?: string;
        timestamp: string;
    };
    created_at: string;
}

export default function ProfilePage() {
    const { translations, setLanguage, currentLanguage } = useLanguage();
    const { token, user: authUser } = useAuth();
    const t = (key: string) => getTranslation(translations, key);

    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [message, setMessage] = useState({ type: '', text: '' });
    const [activities, setActivities] = useState<AccountActivity[]>([]);
    const [allActivities, setAllActivities] = useState<AccountActivity[]>([]);
    const [activityLoading, setActivityLoading] = useState(false);
    const [filters, setFilters] = useState({
        account_id: '',
        activity_type: '',
        page: 1
    });
    const [pagination, setPagination] = useState({
        current_page: 1,
        last_page: 1,
        total: 0,
        per_page: 10
    });
    const [isInitialLoad, setIsInitialLoad] = useState(true);

    // Cache management functions
    const getProfileCacheKey = () => `profile_data_${authUser?.id}`
    const getActivitiesCacheKey = () => `profile_activities_${authUser?.id}`
    const getCacheExpiry = () => 15 * 24 * 60 * 60 * 1000 // 15 days

    const saveProfileToCache = (data: UserProfile) => {
        if (!authUser?.id) return
        try {
            const cacheData = {
                data,
                timestamp: Date.now(),
                expiry: getCacheExpiry()
            }
            localStorage.setItem(getProfileCacheKey(), JSON.stringify(cacheData))
        } catch (error) {
            console.error('Error saving profile to cache:', error)
        }
    }

    const loadProfileFromCache = (): UserProfile | null => {
        if (!authUser?.id) return null
        try {
            const cached = localStorage.getItem(getProfileCacheKey())
            if (!cached) return null
            
            const cacheData = JSON.parse(cached)
            const now = Date.now()
            
            // Check if cache is expired
            if (now - cacheData.timestamp > cacheData.expiry) {
                localStorage.removeItem(getProfileCacheKey())
                return null
            }
            
            return cacheData.data
        } catch (error) {
            console.error('Error loading profile from cache:', error)
            return null
        }
    }

    const saveActivitiesToCache = (data: AccountActivity[]) => {
        if (!authUser?.id) return
        try {
            const cacheData = {
                data,
                timestamp: Date.now(),
                expiry: getCacheExpiry()
            }
            localStorage.setItem(getActivitiesCacheKey(), JSON.stringify(cacheData))
        } catch (error) {
            console.error('Error saving activities to cache:', error)
        }
    }

    const loadActivitiesFromCache = (): AccountActivity[] | null => {
        if (!authUser?.id) return null
        try {
            const cached = localStorage.getItem(getActivitiesCacheKey())
            if (!cached) return null
            
            const cacheData = JSON.parse(cached)
            const now = Date.now()
            
            // Check if cache is expired
            if (now - cacheData.timestamp > cacheData.expiry) {
                localStorage.removeItem(getActivitiesCacheKey())
                return null
            }
            
            return cacheData.data
        } catch (error) {
            console.error('Error loading activities from cache:', error)
            return null
        }
    }

    const clearCache = () => {
        if (!authUser?.id) return
        try {
            localStorage.removeItem(getProfileCacheKey())
            localStorage.removeItem(getActivitiesCacheKey())
        } catch (error) {
            console.error('Error clearing cache:', error)
        }
    }

    useEffect(() => {
        if (token && authUser?.id) {
            // Load cached data immediately
            const cachedProfile = loadProfileFromCache();
            if (cachedProfile) {
                setUser(cachedProfile);
                setLoading(false);
                setIsInitialLoad(false);
            }
            
            const cachedActivities = loadActivitiesFromCache();
            if (cachedActivities) {
                setAllActivities(cachedActivities);
                setActivityLoading(false);
            }
            
            // Always fetch fresh data in background
            fetchUserData(true);
            fetchActivities(true);
        }
    }, [token, authUser?.id]);

    // Refetch user data when language changes
    useEffect(() => {
        if (token && !loading && !isInitialLoad) {
            fetchUserData(true);
        }
    }, [currentLanguage]);

    // Background refresh every 3 minutes
    useEffect(() => {
        if (!token || !authUser?.id) return

        const interval = setInterval(() => {
            fetchUserData(true);
            fetchActivities(true);
        }, 3 * 60 * 1000) // 3 minutes

        return () => clearInterval(interval)
    }, [token, authUser?.id])

    useEffect(() => {
        // Handle client-side filtering and pagination
        if (allActivities.length > 0) {
            let filteredActivities = [...allActivities];

            // Filter by account
            if (filters.account_id) {
                filteredActivities = filteredActivities.filter(activity =>
                    activity.details.account_number === filters.account_id
                );
            }

            // Filter by activity type
            if (filters.activity_type) {
                filteredActivities = filteredActivities.filter(activity =>
                    activity.activity_type === filters.activity_type
                );
            }

            // Calculate pagination
            const total = filteredActivities.length;
            const lastPage = Math.ceil(total / pagination.per_page);
            const startIndex = (filters.page - 1) * pagination.per_page;
            const endIndex = startIndex + pagination.per_page;
            const paginatedActivities = filteredActivities.slice(startIndex, endIndex);

            setActivities(paginatedActivities);
            setPagination(prev => ({
                ...prev,
                current_page: filters.page,
                last_page: lastPage,
                total: total
            }));
        }
    }, [allActivities, filters.account_id, filters.activity_type, filters.page]);

    const fetchUserData = async (isBackgroundUpdate = false) => {
        if (!token) return;

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                credentials: 'include',
            });
            const data = await response.json();

            if (data.success) {
                const newData = data.data;

                // Check if data has actually changed (for background updates)
                if (isBackgroundUpdate) {
                    const currentData = user;
                    
                    // Only update if data has changed
                    if (JSON.stringify(currentData) !== JSON.stringify(newData)) {
                        setUser(newData);
                    }
                } else {
                    // Initial load - always update
                    setUser(newData);
                }

                // Save to cache
                saveProfileToCache(newData);
            } else {
                if (!isBackgroundUpdate) {
                    setMessage({ type: 'error', text: data.message || t('Failed to load user data') });
                }
            }
        } catch (error) {
            if (!isBackgroundUpdate) {
                setMessage({ type: 'error', text: t('Failed to load user data') });
            }
        } finally {
            if (!isBackgroundUpdate) {
                setLoading(false);
                setIsInitialLoad(false);
            }
        }
    };

    const fetchActivities = async (isBackgroundUpdate = false) => {
        if (!token) return;

        try {
            if (!isBackgroundUpdate) {
                setActivityLoading(true);
            }
            
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/account-activities`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });
            const data = await response.json();

            if (data.success && Array.isArray(data.data)) {
                const newData = data.data;

                // Check if data has actually changed (for background updates)
                if (isBackgroundUpdate) {
                    const currentData = allActivities;
                    
                    // Only update if data has changed
                    if (JSON.stringify(currentData) !== JSON.stringify(newData)) {
                        setAllActivities(newData);
                    }
                } else {
                    // Initial load - always update
                    setAllActivities(newData);
                }

                // Save to cache
                saveActivitiesToCache(newData);
            } else {
                if (!isBackgroundUpdate) {
                    setAllActivities([]);
                }
            }
        } catch (error) {
            if (!isBackgroundUpdate) {
                setMessage({ type: 'error', text: t('Failed to fetch activities') });
                setAllActivities([]);
            }
        } finally {
            if (!isBackgroundUpdate) {
                setActivityLoading(false);
            }
        }
    };

    const handleFilterChange = (key: string, value: string) => {
        setFilters(prev => ({
            ...prev,
            [key]: value,
            page: 1
        }));
    };

    const handlePageChange = (page: number) => {
        setFilters(prev => ({
            ...prev,
            page
        }));
    };

    const getActivityTypeColor = (type: string) => {
        const colors = {
            connected: 'bg-green-500',
            paused: 'bg-yellow-500',
            resumed: 'bg-blue-500',
            deleted: 'bg-red-500',
            config_changed: 'bg-purple-500'
        };
        return colors[type as keyof typeof colors] || 'bg-gray-500';
    };

    const formatActivityType = (type: string) => {
        return t(`${type}`);
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;

        // Validate password match
        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: t('Passwords do not match') });
            return;
        }

        // Validate password requirements - only 6 characters minimum
        if (newPassword.length < 6) {
            setMessage({
                type: 'error',
                text: t('Password must be at least 6 characters long')
            });
            return;
        }

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user/password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                credentials: 'include',
                body: JSON.stringify({
                    current_password: currentPassword,
                    password: newPassword,
                    password_confirmation: confirmPassword,
                }),
            });

            const data = await response.json();

            if (data.success) {
                setMessage({ type: 'success', text: t('Password updated successfully') });
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
            } else {
                // Handle validation errors
                if (data.errors) {
                    const errorMessages = Object.values(data.errors).flat();
                    setMessage({ type: 'error', text: errorMessages.join(', ') });
                } else {
                    setMessage({ type: 'error', text: data.message || t('Failed to update password') });
                }
            }
        } catch (error) {
            setMessage({ type: 'error', text: t('Failed to update password') });
        }
    };

    const handleLanguageChange = async (newLang: string) => {
        if (!token) return;

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user`, {
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

            const data = await response.json();

            if (data.success) {
                setUser(prev => prev ? { ...prev, lang: newLang } : null);
                setMessage({ type: 'success', text: t('Language updated successfully') });
                // Update language in context
                setLanguage(newLang);
                
                // Clear cache to ensure fresh data with new language
                clearCache();
            } else {
                setMessage({ type: 'error', text: data.message || t('Failed to update language') });
            }
        } catch (error) {
            setMessage({ type: 'error', text: t('Failed to update language') });
        }
    };

    const getProStatus = (isVip: number) => {
        switch (isVip) {
            case 1: return 'PRO';
            case 2: return 'PRO+';
            case 3: return 'PRO++';
            case 4: return 'PRO+++';
            default: return t('No');
        }
    };

    const toBigCamel = (str: string) => {
        return str.charAt(0).toUpperCase() + str.slice(1);
    };

    const getServerName = (serverCode: string) => {
        const serverMap: { [key: string]: string } = {
            'T4Trade-Demo': 'T4Trade Demo',
            'T4Trade-Live': 'T4Trade Live',
            'IronFX-Demo': 'IronFX Demo',
            'IronFX-Live': 'IronFX Live',
            // Add more server mappings as needed
        };
        return serverMap[serverCode] || serverCode;
    };

    const getRiskSettingName = (groupid: string) => {
        const riskMap: { [key: string]: string } = {
            'aXciiLZp': t('Low'),
            'bXciiLZp': t('Medium'),
            'tXciiLZp': t('High'),
            'wVZiiLZp': t('PRO'),
            'OJKiiLZp': t('PRO+'),
            'LJKiiLZp': t('PRO++'),
            'ppKiiLZp': t('PRO+++'),
            'EVZiiLZp': t('Low'),
            'LZZiiLZp': t('High'),
        };
        return riskMap[groupid] || groupid;
    };

    const getUniqueAccountNumbers = () => {
        const accountNumbers = new Set<string>();
        allActivities.forEach(activity => {
            if (activity.details.account_number) {
                accountNumbers.add(activity.details.account_number);
            }
        });
        return Array.from(accountNumbers).sort();
    };

    const getLanguageName = (langCode: string) => {
        const languageMap: { [key: string]: string } = {
            'en': 'English',
            'pt': 'Português',
            'it': 'Italiano',
            'es': 'Español',
            'fr': 'Français',
            'de': 'Deutsch',
            'nl': 'Nederlands',
        };
        return languageMap[langCode] || langCode;
    };

    // Skip loading screen for faster loading
    // if (loading) {
    //     return (
    //         <div className="px-4 md:px-8 pb-4 md:py-8">
    //             <div className="rounded-2xl shadow-xl bg-[#232b3e] border border-[#2d3748] overflow-hidden">
    //                 <div className="flex items-center gap-2 px-6 py-4 bg-gradient-to-r from-blue-400/80 to-blue-600/80">
    //                 <FaUser className="text-white text-2xl drop-shadow" />
    //                 <span className="text-white text-xl font-bold tracking-wide">{t('My Profile')}</span>
    //             </div>
    //                 <div className="px-4 md:px-8 py-6 space-y-6">
    //                 <div className="space-y-4">
    //                     <div className="h-4 bg-gray-700 rounded w-3/4"></div>
    //                     <div className="h-4 bg-gray-700 rounded w-1/2"></div>
    //                     <div className="h-4 bg-gray-700 rounded w-2/3"></div>
    //                     </div>
    //                 </div>
    //             </div>
    //         </div>
    //     );
    // }

    if (!user) {
        return (
            <div className="px-4 md:px-8 pb-4 md:py-8">
                <div className="rounded-2xl shadow-xl bg-[#232b3e] border border-[#2d3748] overflow-hidden">
                    <div className="flex items-center gap-2 px-6 py-4 bg-gradient-to-r from-blue-400/80 to-blue-600/80">
                    <FaUser className="text-white text-2xl drop-shadow" />
                    <span className="text-white text-xl font-bold tracking-wide">{t('My Profile')}</span>
                </div>
                    <div className="px-4 md:px-8 py-6">
                    <div className="text-red-400">{t('Failed to load user data')}</div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="px-4 md:px-8 pb-4 md:py-8 space-y-6">
            {/* Profile Section */}
            <div className="rounded-2xl shadow-xl bg-[#232b3e] border border-[#2d3748] overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-2 px-6 py-4 bg-gradient-to-r from-blue-400/80 to-blue-600/80">
                    <FaUser className="text-white text-2xl drop-shadow" />
                    <span className="text-white text-xl font-bold tracking-wide">{t('My Profile')}</span>
                </div>

                <div className="px-4 md:px-8 py-6 space-y-6">
                    {/* Message Display */}
                    {message.text && (
                        <div className={`p-4 rounded-lg ${
                            message.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                            {message.text}
                        </div>
                    )}

                    {/* User Information */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Left Column - Basic Info */}
                        <div className="space-y-6">
                            <div className="bg-[#1a2234] p-6 rounded-lg border border-[#2d3748]">
                                <h3 className="text-white text-lg font-semibold mb-4 flex items-center gap-2">
                                    <FaUser className="text-blue-400" />
                                    {t('Basic Information')}
                                </h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-gray-400 text-sm">{t('Name')}</label>
                                        <p className="text-white mt-1">{user.name}</p>
                                    </div>
                                    <div>
                                        <label className="text-gray-400 text-sm">{t('Email')}</label>
                                        <p className="text-white mt-1">{user.email}</p>
                                    </div>
                                    <div>
                                        <label className="text-gray-400 text-sm">{t('Language')}</label>
                                        <p className="text-white mt-1">{getLanguageName(user.lang)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* PRO Status */}
                            <div className="bg-[#1a2234] p-6 rounded-lg border border-[#2d3748]">
                                <h3 className="text-white text-lg font-semibold mb-4 flex items-center gap-2">
                                    <FaCrown className="text-yellow-400" />
                                    {t('PRO Status')}
                                </h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-gray-400 text-sm">{t('Available Settings')}</label>
                                        <p className="text-white mt-1">{getProStatus(user.is_vip)}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Column - Password Change */}
                        <div className="space-y-6">
                            <div className="bg-[#1a2234] p-6 rounded-lg border border-[#2d3748]">
                                <h3 className="text-white text-lg font-semibold mb-4 flex items-center gap-2">
                                    <FaLock className="text-blue-400" />
                                    {t('Change Password')}
                                </h3>
                                <form onSubmit={handlePasswordChange} className="space-y-4">
                                    <div>
                                        <label className="text-gray-400 text-sm">{t('Current Password')}</label>
                                        <input
                                            type="password"
                                            value={currentPassword}
                                            onChange={(e) => setCurrentPassword(e.target.value)}
                                            className="mt-1 w-full px-4 py-2 bg-[#232b3e] border border-[#2d3748] rounded-lg text-white focus:outline-none focus:border-blue-500"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="text-gray-400 text-sm">{t('New Password')}</label>
                                        <input
                                            type="password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            className="mt-1 w-full px-4 py-2 bg-[#232b3e] border border-[#2d3748] rounded-lg text-white focus:outline-none focus:border-blue-500"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="text-gray-400 text-sm">{t('Confirm New Password')}</label>
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="mt-1 w-full px-4 py-2 bg-[#232b3e] border border-[#2d3748] rounded-lg text-white focus:outline-none focus:border-blue-500"
                                            required
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
                                    >
                                        {t('Update Password')}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Activity History Section */}
            <div className="rounded-2xl shadow-xl bg-[#232b3e] border border-[#2d3748] overflow-hidden">
                <div className="flex items-center gap-2 px-6 py-4 bg-gradient-to-r from-blue-400/80 to-blue-600/80">
                    <FaHistory className="text-white text-2xl drop-shadow" />
                    <span className="text-white text-xl font-bold tracking-wide">{t('Account Activity History')}</span>
                </div>

                <div className="px-4 md:px-8 py-6 space-y-6">
                    {/* Filters */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-gray-400 text-sm">{t('Account')}</label>
                            <select
                                value={filters.account_id}
                                onChange={(e) => handleFilterChange('account_id', e.target.value)}
                                className="mt-1 w-full px-4 py-2 bg-[#232b3e] border border-[#2d3748] rounded-lg text-white focus:outline-none focus:border-blue-500"
                            >
                                <option value="">{t('All Accounts')}</option>
                                {getUniqueAccountNumbers().map((account) => (
                                    <option key={account} value={account}>
                                        {account}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-gray-400 text-sm">{t('Activity Type')}</label>
                            <select
                                value={filters.activity_type}
                                onChange={(e) => handleFilterChange('activity_type', e.target.value)}
                                className="mt-1 w-full px-4 py-2 bg-[#232b3e] border border-[#2d3748] rounded-lg text-white focus:outline-none focus:border-blue-500"
                            >
                                <option value="">{t('All Activities')}</option>
                                <option value="connected">{t('Connected')}</option>
                                <option value="paused">{t('Paused')}</option>
                                <option value="resumed">{t('Resumed')}</option>
                                <option value="deleted">{t('Deleted')}</option>
                                <option value="config_changed">{t('Config changed')}</option>
                            </select>
                        </div>
                    </div>

                    {/* Activity Table */}
                    {activityLoading ? (
                        <div className="space-y-4">
                            <div className="h-4 bg-gray-700 rounded w-3/4"></div>
                            <div className="h-4 bg-gray-700 rounded w-1/2"></div>
                            <div className="h-4 bg-gray-700 rounded w-2/3"></div>
                        </div>
                    ) : (
                        <>
                            {/* Desktop Table View */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-[#2d3748]">
                                            <th className="text-left py-3 px-4 text-gray-400">{t('Date')}</th>
                                            <th className="text-left py-3 px-4 text-gray-400">{t('Type')}</th>
                                            <th className="text-left py-3 px-4 text-gray-400">{t('Account')}</th>
                                            <th className="text-left py-3 px-4 text-gray-400">{t('Balance')}</th>
                                            <th className="text-left py-3 px-4 text-gray-400">{t('Details')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(activities || []).map((activity) => (
                                            <tr key={activity.id} className="border-b border-[#2d3748]">
                                                <td className="py-3 px-4 text-white">
                                                    {format(new Date(activity.details.timestamp || activity.created_at), 'dd/MM/yyyy, HH:mm')}
                                                </td>
                                                <td className="py-3 px-4">
                                                    <span className={`inline-block px-2 py-1 rounded text-sm ${getActivityTypeColor(activity.activity_type)}`}>
                                                        {formatActivityType(activity.activity_type === 'config_changed' ? 'Config Change' : toBigCamel(activity.activity_type))}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-white">{activity.details.account_number}</td>
                                                <td className="py-3 px-4 text-white">
                                                    €{activity.details.current_balance?.toFixed(2) || '0.00'}
                                                </td>
                                                <td className="py-3 px-4 text-white">
                                                    {activity.activity_type === 'connected' && (
                                                        <div className="text-sm space-y-1">
                                                            <div>
                                                                <span className="text-gray-400">{t('Server')}:</span> {getServerName(activity.details.configuration?.server || '')}
                                                            </div>
                                                            <div>
                                                                <span className="text-gray-400">{t('Setting')}:</span> {getRiskSettingName(activity.details.configuration?.groupid || '')}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {activity.activity_type === 'config_changed' && (
                                                        <div className="text-sm space-y-1">
                                                            <div>
                                                                <span className="text-gray-400">{t('Server')}:</span> {getServerName(activity.details.new_configuration?.server || '')}
                                                            </div>
                                                            <div>
                                                                <span className="text-gray-400">{t('Setting')}:</span> {getRiskSettingName(activity.details.new_configuration?.groupid || '')}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {(activity.activity_type === 'deleted' || activity.activity_type === 'paused' || activity.activity_type === 'resumed') && (
                                                        <div className="text-sm space-y-1">
                                                            <div>
                                                                <span className="text-gray-400">{t('Server')}:</span> {getServerName(activity.details.active_configuration?.server || '')}
                                                            </div>
                                                            <div>
                                                                <span className="text-gray-400">{t('Setting')}:</span> {getRiskSettingName(activity.details.active_configuration?.groupid || '')}
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Card View */}
                            <div className="md:hidden space-y-4">
                                {(activities || []).map((activity) => (
                                    <div key={activity.id} className="bg-[#1a2234] rounded-lg p-4 border border-[#2d3748]">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex-1">
                                                <div className="text-white font-medium mb-1">
                                                    {activity.details.account_number}
                                                </div>
                                                <div className="text-gray-400 text-sm">
                                                    {format(new Date(activity.details.timestamp || activity.created_at), 'dd/MM/yyyy, HH:mm')}
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end space-y-2">
                                                <span className={`inline-block px-2 py-1 rounded text-xs ${getActivityTypeColor(activity.activity_type)}`}>
                                                    {formatActivityType(activity.activity_type === 'config_changed' ? 'Config Change' : toBigCamel(activity.activity_type))}
                                                </span>
                                                <div className="text-white font-medium">
                                                    €{activity.details.current_balance?.toFixed(2) || '0.00'}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="text-sm space-y-1">
                                            {activity.activity_type === 'connected' && (
                                                <>
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-400">{t('Server')}:</span>
                                                        <span className="text-white">{getServerName(activity.details.configuration?.server || '')}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-400">{t('Setting')}:</span>
                                                        <span className="text-white">{getRiskSettingName(activity.details.configuration?.groupid || '')}</span>
                                                    </div>
                                                </>
                                            )}
                                            {activity.activity_type === 'config_changed' && (
                                                <>
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-400">{t('Server')}:</span>
                                                        <span className="text-white">{getServerName(activity.details.new_configuration?.server || '')}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-400">{t('Setting')}:</span>
                                                        <span className="text-white">{getRiskSettingName(activity.details.new_configuration?.groupid || '')}</span>
                                                    </div>
                                                </>
                                            )}
                                            {(activity.activity_type === 'deleted' || activity.activity_type === 'paused' || activity.activity_type === 'resumed') && (
                                                <>
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-400">{t('Server')}:</span>
                                                        <span className="text-white">{getServerName(activity.details.active_configuration?.server || '')}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-400">{t('Setting')}:</span>
                                                        <span className="text-white">{getRiskSettingName(activity.details.active_configuration?.groupid || '')}</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Pagination */}
                    {pagination.last_page > 1 && (
                        <div className="flex justify-center items-center gap-2 mt-6">
                            {/* Previous Button */}
                            <button
                                onClick={() => handlePageChange(pagination.current_page - 1)}
                                disabled={pagination.current_page === 1}
                                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                    pagination.current_page === 1
                                        ? 'bg-[#1a2234] text-gray-500 cursor-not-allowed'
                                        : 'bg-[#1a2234] text-gray-300 hover:bg-[#2d3748] hover:text-white'
                                }`}
                            >
                                &lt;
                            </button>

                            {/* Page Numbers */}
                            {(() => {
                                const pages = [];
                                const totalPages = pagination.last_page;
                                const currentPage = pagination.current_page;
                                
                                // Always show first page
                                pages.push(1);
                                
                                if (currentPage > 4) {
                                    pages.push('...');
                                }
                                
                                // Show pages around current page
                                for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
                                    if (i > 1 && i < totalPages) {
                                        pages.push(i);
                                    }
                                }
                                
                                if (currentPage < totalPages - 3) {
                                    pages.push('...');
                                }
                                
                                // Always show last page if there's more than one page
                                if (totalPages > 1) {
                                    pages.push(totalPages);
                                }
                                
                                return pages.map((page, index) => (
                                    <button
                                        key={index}
                                        onClick={() => typeof page === 'number' ? handlePageChange(page) : null}
                                        disabled={typeof page !== 'number'}
                                        className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                            typeof page === 'number'
                                                ? page === currentPage
                                                    ? 'bg-blue-600 text-white border border-blue-500'
                                                    : 'bg-[#1a2234] text-gray-300 border border-[#2d3748] hover:bg-[#2d3748] hover:text-white'
                                                : 'bg-transparent text-gray-400 cursor-default'
                                        }`}
                                    >
                                        {page}
                                    </button>
                                ));
                            })()}

                            {/* Next Button */}
                            <button
                                onClick={() => handlePageChange(pagination.current_page + 1)}
                                disabled={pagination.current_page === pagination.last_page}
                                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                    pagination.current_page === pagination.last_page
                                        ? 'bg-[#1a2234] text-gray-500 cursor-not-allowed'
                                        : 'bg-[#2d3748] text-gray-300 hover:bg-[#2d3748] hover:text-white'
                                }`}
                            >
                                &gt;
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
