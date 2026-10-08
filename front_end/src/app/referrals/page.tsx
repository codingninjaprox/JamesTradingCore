'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/utils/translation';
import { toast } from 'react-hot-toast';
import { Dialog } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface Referral {
  id: number;
  referred_email: string;
  amount: number;
  status: 'pending' | 'paid';
  created_at: string;
}

interface ReferralData {
  referrals: Referral[];
  pendingAmount: number;
  totalPaid: number;
  userReferralPrice: number;
  defaultReferralPrice: number;
}

export default function ReferralsPage() {
  const router = useRouter();
  const { user, token } = useAuth();
  const { translations } = useLanguage();
  const t = (key: string) => getTranslation(translations, key);

  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [referralData, setReferralData] = useState<ReferralData>({
    referrals: [],
    pendingAmount: 0,
    totalPaid: 0,
    userReferralPrice: 0,
    defaultReferralPrice: 0
  });
  const [email, setEmail] = useState('');
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Cache management functions
  const getCacheKey = () => `referrals_data_${user?.id}`
  const getCacheExpiry = () => 15 * 24 * 60 * 60 * 1000 // 15 days

  const saveToCache = (data: ReferralData) => {
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

  const loadFromCache = (): ReferralData | null => {
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
    if (user?.restricted_user == 1) {
      router.push('/courses');
    } else if (token && user?.id) {
      // Load cached data immediately
      const cachedData = loadFromCache();
      if (cachedData) {
        setReferralData(cachedData);
        setIsInitialLoad(false);
      }
      
      // Always fetch fresh data in background
      fetchReferralData(true);
    }
  }, [user, token, router]);

  // Background refresh every 2 minutes
  useEffect(() => {
    if (!token || !user?.id || user?.restricted_user == 1) return

    const interval = setInterval(() => {
      fetchReferralData(true);
    }, 2 * 60 * 1000) // 2 minutes

    return () => clearInterval(interval)
  }, [token, user?.id, user?.restricted_user])

  const fetchReferralData = async (isBackgroundUpdate = false) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/referrals`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          toast.error(t('Session expired. Please log in again.'));
          return;
        }
        throw new Error(t('Failed to fetch referral data'));
      }

      const data = await response.json();
      if (data.success) {
        const newData: ReferralData = {
          referrals: data.data.referrals || [],
          pendingAmount: Number(data.data.pendingAmount) || 0,
          totalPaid: Number(data.data.totalPaid) || 0,
          userReferralPrice: Number(data.data.userReferralPrice) || 0,
          defaultReferralPrice: Number(data.data.defaultReferralPrice) || 0
        };

        // Check if data has actually changed (for background updates)
        if (isBackgroundUpdate) {
          const currentData = referralData;
          
          // Only update if data has changed
          if (JSON.stringify(currentData) !== JSON.stringify(newData)) {
            setReferralData(newData);
          }
        } else {
          // Initial load - always update
          setReferralData(newData);
        }

        // Save to cache
        saveToCache(newData);
      }
    } catch (error) {
      console.error('Error fetching referral data:', error);
      if (!isBackgroundUpdate) {
        toast.error(t('Failed to load referral data'));
      }
    } finally {
      if (!isBackgroundUpdate) {
        setIsInitialLoad(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/referrals`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      const data = await response.json();
      setLoading(false);

      if (data.success) {
        setModalTitle(t('Success'));
        setModalMessage(data.message);
        setIsModalOpen(true);
        setEmail('');
        
        // Clear cache and fetch fresh data after successful submission
        clearCache();
        fetchReferralData();
      } else {
        setModalTitle(t('Error'));
        setModalMessage(data.message);
        setIsModalOpen(true);
      }
    } catch (error) {
      setLoading(false);
      console.error('Error:', error);
      setModalTitle(t('Error'));
      setModalMessage(t('An error occurred. Please try again later.'));
      setIsModalOpen(true);
    }
  };

  if (!user) {
    return null;
  }

  const formatAmount = (amount: number) => {
    return Number(amount).toFixed(2);
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-4 md:py-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-xl md:text-2xl font-bold text-white mb-8">{t('Referral Program')}</h1>

        {/* Hero Section */}
        <div className="bg-[#232b3e] rounded-xl px-4 md:px-8 py-6 mb-8 shadow-lg border border-[#2d3748]">
          <div className="relative z-10">
            <div className="flex flex-col md:flex-row items-center justify-between">
              <div className="text-center md:text-left mb-6 md:mb-0">
                <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-4">
                  {t('Earn Big with Our Referral Program!')}
                </h1>
                <p className="text-base md:text-lg text-gray-300 mb-4">
                  {t('Invite friends and earn')}
                  <span className="text-xl md:text-2xl font-bold text-green-400 mx-2">€{formatAmount(referralData.userReferralPrice)}</span>
                  {t('for each friend!')}
                </p>
                <p className="text-base md:text-lg text-gray-300">
                  {t('No limits - the more friends you invite, the more you earn!')}
                </p>
              </div>
              <div className="bg-[#1a2234] border border-[#2d3748] rounded-lg p-4 md:p-6 text-center">
                <div className="text-2xl md:text-3xl lg:text-4xl font-bold text-green-400 mb-2">€{formatAmount(referralData.defaultReferralPrice)}</div>
                <div className="text-sm md:text-base text-gray-300">{t('Default Price Per Referral')}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Balance Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-[#232b3e] rounded-xl px-4 md:px-8 py-6 border border-[#2d3748]">
            <h3 className="text-base md:text-lg font-semibold mb-2 text-white">{t('Amount pending payment')}</h3>
            <p className="text-xl md:text-2xl font-bold text-yellow-500">€{formatAmount(referralData.pendingAmount)}</p>
          </div>
          <div className="bg-[#232b3e] rounded-xl px-4 md:px-8 py-6 border border-[#2d3748]">
            <h3 className="text-base md:text-lg font-semibold mb-2 text-white">{t('Total amount already paid')}</h3>
            <p className="text-xl md:text-2xl font-bold text-purple-500">€{formatAmount(referralData.totalPaid)}</p>
          </div>
        </div>

        {/* Referral Form */}
        <div className="bg-[#232b3e] rounded-xl px-4 md:px-8 py-6 mb-8 border border-[#2d3748]">
          <h2 className="text-lg md:text-xl font-semibold mb-4 text-white">{t('Submit Referral')}</h2>
          <p className="text-sm md:text-base text-gray-300 mb-4">
            {t('To receive your referral bonus, your friend must send me a message to register with the broker and join the platform.')}
          </p>
          <p className="text-sm md:text-base text-gray-300 mb-4">
            {t('Once they join, enter their email below to automatically receive the :amount€ bonus.').replace(':amount', formatAmount(referralData.userReferralPrice))}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                {t('Friend\'s Email')}
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border-[#2d3748] bg-[#1a2234] text-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm md:text-base"
              />
            </div>
            <button 
              type="submit" 
              className="inline-flex justify-center rounded-lg border border-[#2d3748] px-4 md:px-6 py-2 bg-[#1a2234] text-sm md:text-base font-medium text-white hover:bg-[#2d3748] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-200"
              disabled={loading}
            >
              {loading ? t('Submitting...') : t('Submit Referral')}
            </button>
          </form>
        </div>

        {/* Payment Request */}
        <div className="bg-[#232b3e] rounded-xl px-4 md:px-8 py-6 border border-[#2d3748]">
          <h2 className="text-lg md:text-xl font-semibold mb-4 text-white">{t('Request Payment')}</h2>
          <p className="text-sm md:text-base text-gray-300 mb-4">
            {t('To request a payout of your Payable Balance, send a message through Telegram.')}
          </p>
          <a 
            href="https://t.me/JamesPereira99" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="inline-flex justify-center w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 md:py-3 px-4 rounded-lg transition duration-200 text-sm md:text-base"
          >
            {t('Request Payment')}
          </a>
        </div>

        {/* Referrals List */}
        <div className="bg-[#232b3e] rounded-xl px-4 md:px-8 py-6 mt-8 border border-[#2d3748]">
          <h2 className="text-lg md:text-xl font-semibold mb-4 text-white">{t('Your Referrals')}</h2>
          <div className="referrals-list space-y-2">
            {referralData.referrals.map((referral) => (
              <div key={referral.id} className="bg-[#1a2234] p-3 md:p-4 rounded-lg border border-[#2d3748]">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs md:text-sm text-gray-400">{referral.referred_email}</p>
                    <p className={`text-base md:text-lg font-semibold ${referral.status === 'pending' ? 'text-yellow-500' : 'text-green-500'}`}>
                      €{formatAmount(referral.amount)}
                    </p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    referral.status === 'pending' ? 'bg-yellow-500' : 'bg-green-500'
                  } text-white`}>
                    {referral.status === 'pending' ? t('Pending') : t('Paid')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal */}
      <Dialog
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/75" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-lg rounded-xl bg-[#232b3e] p-4 md:p-6 border border-[#2d3748]">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-lg md:text-xl font-bold text-white">
                {modalTitle}
              </Dialog.Title>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-300"
              >
                <XMarkIcon className="h-5 w-5 md:h-6 md:w-6" />
              </button>
            </div>
            <p className="text-base md:text-lg text-gray-300">{modalMessage}</p>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setIsModalOpen(false)}
                className="inline-flex justify-center rounded-lg border border-[#2d3748] px-4 md:px-6 py-2 bg-[#1a2234] text-sm md:text-base font-medium text-white hover:bg-[#2d3748] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-200"
              >
                {t('Close')}
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
          <div className="rounded-full h-12 w-12 md:h-16 md:w-16 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      )}
    </div>
  );
} 