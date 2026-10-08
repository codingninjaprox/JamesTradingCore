'use client';

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { getTranslation } from '@/utils/translation'
import { toast } from 'react-hot-toast'
import { Dialog } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface TelegramGroup {
  name: string
  key: string
  minBalance: number
  isEnabled: boolean
  isForcedAccess: boolean
}

interface Video {
  url: string
  language: string
}

export default function GroupsPage() {
  const router = useRouter()
  const { user, token } = useAuth()
  const { translations, currentLanguage } = useLanguage()
  const t = (key: string) => getTranslation(translations, key)

  const [groups, setGroups] = useState<TelegramGroup[]>([])
  const [balance, setBalance] = useState(0)
  const [hasConnectedAccount, setHasConnectedAccount] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  const [modalMessage, setModalMessage] = useState('')
  const [videos, setVideos] = useState<Video[]>([])
  const [currentVideo, setCurrentVideo] = useState<Video | null>(null)
  const [currentLang, setCurrentLang] = useState(currentLanguage)
  const [loadingGroupKey, setLoadingGroupKey] = useState<string | null>(null)
  const [isInitialLoad, setIsInitialLoad] = useState(true)

  // Cache management functions
  const getCacheKey = () => `groups_data_${user?.id}`
  const getCacheExpiry = () => 15 * 24 * 60 * 60 * 1000 // 15 days

  const saveToCache = (data: any) => {
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

  const loadFromCache = () => {
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

  const fetchGroups = async (isBackgroundUpdate = false) => {
    if (!token) return

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/telegram-groups`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          toast.error(t('Session expired. Please log in again.'))
          return
        }
        throw new Error(t('Failed to fetch groups'))
      }

      const data = await response.json()

      if (data.success) {
        const newData = {
          groups: data.data.groups,
          balance: data.data.balance || 0,
          hasConnectedAccount: data.data.hasConnectedAccount || false,
          videos: data.data.videos
        }

        // Check if data has actually changed (for background updates)
        if (isBackgroundUpdate) {
          const currentData = {
            groups,
            balance,
            hasConnectedAccount,
            videos
          }
          
          // Only update if data has changed
          if (JSON.stringify(currentData) !== JSON.stringify(newData)) {
            setGroups(newData.groups)
            setBalance(newData.balance)
            setHasConnectedAccount(newData.hasConnectedAccount)
            setVideos(newData.videos)
            
            // Update current video if language changed
            const currentVideo = newData.videos.find((v: Video) => v.language === currentLanguage)
            if (currentVideo) {
              setCurrentVideo(currentVideo)
            }
          }
        } else {
          // Initial load - always update
          setGroups(newData.groups)
          setBalance(newData.balance)
          setHasConnectedAccount(newData.hasConnectedAccount)
          setVideos(newData.videos)
          
          // Set current video based on the current language
          const currentVideo = newData.videos.find((v: Video) => v.language === currentLanguage)
          if (currentVideo) {
            setCurrentVideo(currentVideo)
          }
        }

        // Save to cache
        saveToCache(newData)
      }
    } catch (error) {
      console.error('Error fetching groups:', error)
      if (!isBackgroundUpdate) {
        toast.error(t('Failed to load groups'))
      }
    } finally {
      if (!isBackgroundUpdate) {
        setIsLoading(false)
        setIsInitialLoad(false)
      }
    }
  }

  useEffect(() => {
    if (token && user?.id) {
      // Load cached data immediately
      const cachedData = loadFromCache()
      if (cachedData) {
        setGroups(cachedData.groups)
        setBalance(cachedData.balance)
        setHasConnectedAccount(cachedData.hasConnectedAccount)
        setVideos(cachedData.videos)
        
        // Set current video based on the current language
        const currentVideo = cachedData.videos.find((v: Video) => v.language === currentLanguage)
        if (currentVideo) {
          setCurrentVideo(currentVideo)
        }
        
        setIsLoading(false)
        setIsInitialLoad(false)
      }
      
      // Always fetch fresh data in background
      fetchGroups(true)
    }
  }, [token, user?.id])

  // Background refresh every 2 minutes
  useEffect(() => {
    if (!token || !user?.id) return

    const interval = setInterval(() => {
      fetchGroups(true)
    }, 2 * 60 * 1000) // 2 minutes

    return () => clearInterval(interval)
  }, [token, user?.id])

  const getInviteLink = async (groupKey: string) => {
    setLoadingGroupKey(groupKey)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/telegram-groups/invite-link`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ group_key: groupKey }),
      })

      const data = await response.json()

      if (data.success && data.invite_link) {
        openTelegramLink(data.invite_link)
      } else {
        setModalTitle(t('Error'))
        setModalMessage(data.message || t('An error occurred. Please try again later.'))
        setIsModalOpen(true)
      }
    } catch (error) {
      console.error('Error getting invite link:', error)
      setModalTitle(t('Error'))
      setModalMessage(t('An error occurred. Please try again later.'))
      setIsModalOpen(true)
    } finally {
      setLoadingGroupKey(null)
    }
  }

  const openTelegramLink = (url: string) => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)

    if (isIOS && isSafari) {
      window.location.href = url
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const updateVideoLanguage = async (language: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/telegram-groups/video-language`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ language }),
      })

      const data = await response.json()

      if (data.success) {
        const selectedVideo = videos.find(v => v.language === language)
        if (selectedVideo) {
          setCurrentVideo(selectedVideo)
          setCurrentLang(language)
          
          // Update cache with new language selection
          const cachedData = loadFromCache()
          if (cachedData) {
            cachedData.currentLanguage = language
            saveToCache(cachedData)
          }
        } else {
          toast.error(t('Video not found for selected language'))
        }
      } else {
        toast.error(data.message || t('Failed to update video language'))
      }
    } catch (error) {
      console.error('Error updating video language:', error)
      toast.error(t('Failed to update video language'))
    }
  }

  if (!user) {
    return null
  }

  // Skip loading screen for faster loading
  // if (isLoading) {
  //   return (
  //     <div className="px-4 sm:px-6 lg:px-8 pb-4 md:py-8">
  //       <div className="max-w-5xl mx-auto">
  //         <div className="">
  //           <div className="h-8 bg-gray-700 rounded w-1/4 mb-6"></div>
  //           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
  //             {[1, 2, 3].map((i) => (
  //               <div key={i} className="bg-gray-800 rounded-xl p-6 h-64">
  //                 <div className="space-y-4">
  //                   <div className="h-6 bg-gray-700 rounded w-3/4"></div>
  //                   <div className="h-4 bg-gray-700 rounded w-1/2"></div>
  //                   <div className="h-10 bg-gray-700 rounded"></div>
  //                 </div>
  //               </div>
  //             ))}
  //           </div>
  //         </div>
  //       </div>
  //     </div>
  //   )
  // }

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-4 md:py-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-xl md:text-2xl font-bold text-white mb-8">{t('Group Access')}</h1>
        <p className="mb-8 text-gray-300 text-lg">{t('telegram_description')}</p>

        {/* Balance Information */}
        <div className="bg-[#232b3e] rounded-xl px-4 md:px-8 py-6 mb-8 border border-gray-700">
          <h2 className="text-xl font-semibold mb-4 text-white">{t('Your Trading Account')}</h2>
          <div className={`flex items-center space-x-4`}>
            <span className="text-gray-300 text-sm md:text-lg">{t('Current Balance')}:</span>
            <span className={`text-3xl font-bold ${balance > 0 ? 'text-green-400' : 'text-red-400'}`}>
              €{balance.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Groups Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {groups.map((group, index) => (
            <div
              key={index}
              className={`bg-[#232b3e] rounded-xl px-4 md:px-8 py-6 relative border border-gray-700 flex flex-col h-full transform transition-all duration-300`}
            >
              {/* Group Info */}
              <div className="flex-grow">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg md:text-xl font-bold text-white">{group.name}</h3>
                  {/* Group Status Badge */}
                  {group.isEnabled ? (
                    <span className="bg-green-500 text-white px-3 py-1 rounded-full text-xs md:text-sm font-medium whitespace-nowrap">
                      {t('Available')}
                    </span>
                  ) : (
                    <span className="bg-gray-700 text-gray-300 px-3 py-1 rounded-full text-xs md:text-sm font-medium whitespace-nowrap">
                      {t('Locked')}
                    </span>
                  )}
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-[#1a2234] p-2.5 rounded-lg">
                    <span className="text-gray-300 whitespace-nowrap text-sm">{t('Required Balance')}</span>
                    <span className="font-semibold text-white ml-4 text-sm">€{group.minBalance.toFixed(2)}</span>
                  </div>

                  {!group.isEnabled && (
                    <div className="text-red-400 text-xs bg-red-500/10 p-2.5 rounded-lg">
                      €{(group.minBalance - balance).toFixed(2)} {t('left_amount')}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-6">
                {group.isEnabled ? (
                  <button
                    onClick={() => getInviteLink(group.key)}
                    disabled={loadingGroupKey === group.key}
                    className={`w-full text-white font-semibold py-2.5 px-4 rounded-lg transition duration-200 bg-blue-600 hover:bg-blue-700 text-sm ${
                      loadingGroupKey === group.key ? 'opacity-75 cursor-wait' : ''
                    }`}
                  >
                    {loadingGroupKey === group.key ? (
                      <div className="flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                      </div>
                    ) : (
                      t('Join Group')
                    )}
                  </button>
                ) : (
                  <button
                    className="w-full bg-gray-700 text-gray-400 py-3 px-4 rounded-lg cursor-not-allowed"
                    disabled
                    title={t('Insufficient balance to join this group')}
                  >
                    {t('Join Group')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Video Section */}
        <div className="mt-12">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 md:gap-8 mb-6">
            <p className="text-gray-300 text-lg">{t('telegram_video_description')}</p>

            {/* Language Selector */}
            <div className="relative">
              <select
                value={currentLang}
                onChange={(e) => updateVideoLanguage(e.target.value)}
                className="bg-[#1a2234] border border-gray-700 text-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200 min-w-[79px] text-[13px]"
              >
                {videos?.map((video: Video, index: number) => (
                  <option key={index} value={video.language}>
                    {video.language ? video.language.toUpperCase() : 'EN'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Video Container */}
          <div className="bg-[#232b3e] rounded-xl px-4 md:px-8 py-6 border border-gray-700">
            <div className="max-w-2xl mx-auto">
              <div className="relative min-h-[400px] md:min-h-[600px]" style={{ paddingBottom: '56.25%' }}>
                {currentVideo && (
                  <iframe
                    src={currentVideo.url}
                    frameBorder="0"
                    allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
                    className="absolute top-0 left-0 w-full h-full rounded-lg"
                    title="instructional video"
                  />
                )}
              </div>
            </div>
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
          <Dialog.Panel className="mx-auto max-w-lg rounded-xl bg-[#1a2234] p-6">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-xl font-bold text-white">
                {modalTitle}
              </Dialog.Title>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-300"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <p className="text-gray-300 text-lg">{modalMessage}</p>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setIsModalOpen(false)}
                className="inline-flex justify-center rounded-lg border border-gray-700 px-6 py-2 bg-[#1a2234] text-base font-medium text-white hover:bg-[#12181F] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-200"
              >
                {t('Close')}
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  )
}
