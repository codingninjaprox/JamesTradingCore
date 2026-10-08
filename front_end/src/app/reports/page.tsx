'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/utils/translation';
import { toast } from 'react-hot-toast';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

/** Matches GET /api/reports/{user_id}?period=... response. */
interface ReportData {
  period: string;
  labels: string[];
  pnl_series: number[];
  balance_series: number[];
  summary: {
    total_pnl: number;
    today: number;
    week: number;
    month: number;
    six_months: number;
    year: number;
  };
}

type TimePeriod = 'week' | 'month' | '6months' | 'year' | 'all';

export default function ReportsPage() {
  const router = useRouter();
  const { user, token } = useAuth();
  const { translations } = useLanguage();
  const t = (key: string) => getTranslation(translations, key);

  // Start with loading true so we show loading placeholder until first fetch completes (avoids flash of "No profit data")
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('month');
  const skipFirstFetchRef = useRef(true);
  const [isMobile, setIsMobile] = useState(false);
  const [chartRef, setChartRef] = useState<any>(null);
  const [showCrosshair, setShowCrosshair] = useState(false);
  const [crosshairX, setCrosshairX] = useState(0);
  const [crosshairY, setCrosshairY] = useState(0);
  // Initialize reportData from cache immediately to prevent flash
  const getInitialReportData = (): ReportData => {
    if (typeof window !== 'undefined' && user?.id) {
      try {
        const cached = localStorage.getItem(`reports_data_${user.id}_month`);
        if (cached) {
          const cacheData = JSON.parse(cached);
          const now = Date.now();
          if (now - cacheData.timestamp <= (cacheData.expiry || 15 * 24 * 60 * 60 * 1000) && cacheData.data) {
            return cacheData.data;
          }
        }
      } catch {
        // ignore
      }
    }
    return emptyReportData('month');
  };

  const emptyReportData = (period: TimePeriod): ReportData => ({
    period,
    labels: [],
    pnl_series: [],
    balance_series: [],
    summary: { total_pnl: 0, today: 0, week: 0, month: 0, six_months: 0, year: 0 }
  });
  
  const [reportData, setReportData] = useState<ReportData>(getInitialReportData());
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  // Initialize hasConnectedAccount from accounts cache to determine if account exists
  const getInitialAccountStatus = () => {
    if (typeof window !== 'undefined' && user?.id) {
      try {
        // First check accounts cache to see if there's a connected account
        const accountsCache = localStorage.getItem(`account_${user.id}`);
        if (accountsCache) {
          const accountsCacheData = JSON.parse(accountsCache);
          const now = Date.now();
          if (now - accountsCacheData.timestamp <= accountsCacheData.expiry) {
            // If accounts cache has data, there's a connected account
            return accountsCacheData.data != null;
          }
        }
        
        // Fallback: check reports cache (any period)
        const expiryMs = 15 * 24 * 60 * 60 * 1000;
        for (const p of ['month', 'week', '6months', 'year', 'all'] as TimePeriod[]) {
          const reportsCache = localStorage.getItem(`reports_data_${user.id}_${p}`);
          if (reportsCache) {
            const reportsCacheData = JSON.parse(reportsCache);
            const now = Date.now();
            if (now - (reportsCacheData.timestamp || 0) <= (reportsCacheData.expiry || expiryMs)) {
              return reportsCacheData.hasConnectedAccount || false;
            }
          }
        }
      } catch (error) {
        console.error('Error checking cache for initial account status:', error);
      }
    }
    return false;
  };
  
  const [hasConnectedAccount, setHasConnectedAccount] = useState(getInitialAccountStatus());

  // Cache management: cache per period
  const getReportCacheKey = (period: TimePeriod) => `reports_data_${user?.id}_${period}`
  const getPeriodCacheKey = () => `reports_period_${user?.id}`
  const getCacheExpiry = () => 15 * 24 * 60 * 60 * 1000 // 15 days

  const saveReportToCache = (data: ReportData, period: TimePeriod, hasAccount: boolean) => {
    if (!user?.id) return
    try {
      const cacheData = {
        data,
        hasConnectedAccount: hasAccount,
        timestamp: Date.now(),
        expiry: getCacheExpiry()
      }
      localStorage.setItem(getReportCacheKey(period), JSON.stringify(cacheData))
    } catch (error) {
      console.error('Error saving report to cache:', error)
    }
  }

  const loadReportFromCache = (period: TimePeriod): { data: ReportData; hasConnectedAccount: boolean } | null => {
    if (!user?.id) return null
    try {
      const cached = localStorage.getItem(getReportCacheKey(period))
      if (!cached) return null
      
      const cacheData = JSON.parse(cached)
      const now = Date.now()
      
      if (now - cacheData.timestamp > cacheData.expiry) {
        localStorage.removeItem(getReportCacheKey(period))
        return null
      }
      
      return {
        data: cacheData.data,
        hasConnectedAccount: cacheData.hasConnectedAccount || false
      }
    } catch (error) {
      console.error('Error loading report from cache:', error)
      return null
    }
  }

  const savePeriodToCache = (period: TimePeriod) => {
    if (!user?.id) return
    try {
      const cacheData = {
        data: period,
        timestamp: Date.now(),
        expiry: getCacheExpiry()
      }
      localStorage.setItem(getPeriodCacheKey(), JSON.stringify(cacheData))
    } catch (error) {
      console.error('Error saving period to cache:', error)
    }
  }

  const loadPeriodFromCache = (): TimePeriod | null => {
    if (!user?.id) return null
    try {
      const cached = localStorage.getItem(getPeriodCacheKey())
      if (!cached) return null
      
      const cacheData = JSON.parse(cached)
      const now = Date.now()
      
      // Check if cache is expired
      if (now - cacheData.timestamp > cacheData.expiry) {
        localStorage.removeItem(getPeriodCacheKey())
        return null
      }
      
      return cacheData.data
    } catch (error) {
      console.error('Error loading period from cache:', error)
      return null
    }
  }

  // Fallback: Update state when user becomes available (in case user wasn't available during initialization)
  useEffect(() => {
    if (user?.id && loading) {
      const cachedReportData = loadReportFromCache(selectedPeriod);
      if (cachedReportData) {
        setHasConnectedAccount(cachedReportData.hasConnectedAccount);
        setReportData(cachedReportData.data);
        setLoading(false);
        setIsInitialLoad(false);
      }
    }
  }, [user?.id, loading, selectedPeriod]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  useEffect(() => {
    if (user?.restricted_user == 1) {
      router.push('/courses');
    } else if (token && user?.id) {
      const cachedPeriod = loadPeriodFromCache();
      if (cachedPeriod) {
        setSelectedPeriod(cachedPeriod);
        // Load report cache for this period so chart shows immediately if we have cached data
        const cached = loadReportFromCache(cachedPeriod);
        if (cached?.data && (cached.data.pnl_series?.length ?? 0) > 0) {
          setReportData(cached.data);
        }
        // Fetch will run when selectedPeriod update triggers the fetch effect (skipFirstFetch avoids fetching 'month' first)
      } else {
        // No saved period: fetch for default so we don't rely on the skipped first run
        fetchReportData('month');
      }
    }
  }, [user, token, router]);

  // Fetch report data when user/token available and when selectedPeriod changes.
  // Skip the first run so we don't fetch for default 'month' before restore effect has set period from cache (e.g. 'week').
  // Then we fetch for the actual displayed period so the chart shows instead of "No profit data".
  useEffect(() => {
    if (!token || !user?.id || user?.restricted_user == 1) return;
    if (skipFirstFetchRef.current) {
      skipFirstFetchRef.current = false;
      return;
    }
    const cached = loadReportFromCache(selectedPeriod);
    if (cached?.data && (cached.data.pnl_series?.length ?? 0) > 0) {
      setReportData(cached.data);
    }
    fetchReportData(selectedPeriod);
  }, [token, user?.id, user?.restricted_user, selectedPeriod]);

  // Background refresh every 5 minutes for current period
  useEffect(() => {
    if (!token || !user?.id || user?.restricted_user == 1) return;
    const interval = setInterval(() => {
      fetchReportData(selectedPeriod, true);
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [token, user?.id, user?.restricted_user, selectedPeriod]);

  // Save period preference to cache when it changes
  useEffect(() => {
    if (user?.id && !isInitialLoad) {
      savePeriodToCache(selectedPeriod);
    }
  }, [selectedPeriod, user?.id, isInitialLoad])

  const fetchReportData = async (period: TimePeriod, isBackgroundUpdate = false) => {
    if (!user?.id || !token) return;
    if (!isBackgroundUpdate) setLoading(true);
    try {
      const url = `https://api.jamestradinggroup.com/api/reports/${user.id}?period=${period}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          toast.error(t('Session expired. Please log in again.'));
          return;
        }
        throw new Error(t('Failed to fetch report data'));
      }

      const json = await response.json();

      if (json.success && json.data != null) {
        const d = json.data;
        const summary = d.summary || {
          total_pnl: 0,
          today: 0,
          week: 0,
          month: 0,
          six_months: 0,
          year: 0,
        };
        const newData: ReportData = {
          period: d.period || period,
          labels: Array.isArray(d.labels) ? d.labels : [],
          pnl_series: Array.isArray(d.pnl_series) ? d.pnl_series : [],
          balance_series: Array.isArray(d.balance_series) ? d.balance_series : [],
          summary: {
            total_pnl: Number(summary.total_pnl) || 0,
            today: Number(summary.today) || 0,
            week: Number(summary.week) || 0,
            month: Number(summary.month) || 0,
            six_months: Number(summary.six_months) || 0,
            year: Number(summary.year) || 0,
          },
        };
        setHasConnectedAccount(true);
        setReportData(newData);
        saveReportToCache(newData, period, true);
      } else {
        // success but no data – use cache for this period if available, else don’t overwrite existing valid data
        const cached = loadReportFromCache(period);
        const empty = emptyReportData(period);
        if (cached?.data && (cached.data.pnl_series?.length ?? 0) > 0) {
          setReportData(cached.data);
        } else {
          setReportData((prev) => {
            if (prev?.period === period && (prev.pnl_series?.length ?? 0) > 0) return prev;
            return empty;
          });
        }
        let hasConnectedAccountStatus = false;
        try {
          const accountsCache = localStorage.getItem(`account_${user.id}`);
          if (accountsCache) {
            const parsed = JSON.parse(accountsCache);
            if (parsed.data != null && Date.now() - (parsed.timestamp || 0) <= (parsed.expiry || 15 * 24 * 60 * 60 * 1000)) {
              hasConnectedAccountStatus = true;
            }
          }
        } catch {
          // ignore
        }
        setHasConnectedAccount(hasConnectedAccountStatus);
        // Don’t save empty to cache so we don’t overwrite good cached data when API returns empty
      }
    } catch (error) {
      console.error('Error fetching report data:', error);
      if (!isBackgroundUpdate) {
        const cached = loadReportFromCache(period);
        if (cached?.data && (cached.data.pnl_series?.length ?? 0) > 0) {
          setReportData(cached.data);
        } else {
          setReportData((prev) => {
            if (prev?.period === period && (prev.pnl_series?.length ?? 0) > 0) return prev;
            return emptyReportData(period);
          });
        }
      }
    } finally {
      if (!isBackgroundUpdate) {
        setLoading(false);
        setIsInitialLoad(false);
      }
    }
  };

  // Use API data only when it matches the selected period (avoid showing empty chart when cache period ≠ selected period)
  const periodMatches = reportData?.period === selectedPeriod;
  const labels = periodMatches ? (reportData?.labels || []) : [];
  const tooltipLabels = labels;
  const periodData = periodMatches ? (reportData?.pnl_series || []) : [];
  const hasChartData = periodMatches && (reportData?.pnl_series?.length ?? 0) > 0;
  // Profit Overview should show the same value as the matching Advanced Statistics card for the selected period
  const currentProfit = (() => {
    if (!periodMatches || !reportData?.summary) return 0;
    const s = reportData.summary;
    switch (selectedPeriod) {
      case 'week': return Number(s.week) ?? 0;
      case 'month': return Number(s.month) ?? 0;
      case '6months': return Number(s.six_months) ?? 0;
      case 'year': return Number(s.year) ?? 0;
      case 'all': return Number(s.total_pnl) ?? 0;
      default: return Number(s.total_pnl) ?? 0;
    }
  })();
  const profitPercentage = (() => {
    if (periodData.length < 2) return 0;
    const startValue = periodData[0];
    const endValue = periodData[periodData.length - 1];
    if (startValue === 0) return 0;
    return ((endValue - startValue) / Math.abs(startValue)) * 100;
  })();

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false
    },
    onHover: (event: any, activeElements: any) => {
      if (event.native && chartRef && activeElements.length > 0) {
        const canvas = chartRef.canvas;
        const rect = canvas.getBoundingClientRect();
        const x = event.native.clientX - rect.left;
        const y = event.native.clientY - rect.top;
        
        // Get the data point position from the active element
        const dataPoint = activeElements[0];
        const dataPointX = dataPoint.element.x;
        const dataPointY = dataPoint.element.y;
        
        setCrosshairX(dataPointX);
        setCrosshairY(dataPointY);
        setShowCrosshair(true);
      } else {
        setShowCrosshair(false);
      }
    },
    onLeave: () => {
      setShowCrosshair(false);
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
          drawBorder: false
        },
        ticks: {
          font: {
            size: isMobile ? 10 : 14,
            family: "'Inter', sans-serif"
          },
          color: 'rgba(255, 255, 255, 0.7)',
          callback: (value: any) => `€${value.toLocaleString()}`
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            size: isMobile ? 10 : 14,
            family: "'Inter', sans-serif"
          },
          color: 'rgba(255, 255, 255, 0.7)',
          maxRotation: isMobile ? 45 : 0,
          minRotation: isMobile ? 45 : 0
        }
      }
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        enabled: true,
        mode: 'nearest' as const,
        intersect: false,
        backgroundColor: 'rgba(17, 24, 39, 0.9)',
        titleColor: 'rgba(255, 255, 255, 0.9)',
        bodyColor: 'rgba(255, 255, 255, 0.9)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context: any) => {
            const value = context.parsed.y;
            return `€${value.toFixed(2)}`;
          }
        }
      },
      customCrosshair: {
        id: 'customCrosshair',
        afterDraw: (chart: any) => {
          if (showCrosshair) {
            const ctx = chart.ctx;
            const chartArea = chart.chartArea;
            
            // Only draw if data point is within chart area
            if (crosshairX >= chartArea.left && crosshairX <= chartArea.right && 
                crosshairY >= chartArea.top && crosshairY <= chartArea.bottom) {
              
              ctx.save();
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
              ctx.lineWidth = 1;
              ctx.setLineDash([5, 5]);
              
              // Draw vertical line from data point to bottom (x-axis)
              ctx.beginPath();
              ctx.moveTo(crosshairX, crosshairY);
              ctx.lineTo(crosshairX, chartArea.bottom);
              ctx.stroke();
              
              // Draw horizontal line from left to data point (y-axis assist)
              ctx.beginPath();
              ctx.moveTo(chartArea.left, crosshairY);
              ctx.lineTo(crosshairX, crosshairY);
              ctx.stroke();
              
              ctx.restore();
            }
          }
        }
      },

    }
  };

  const pnlChartData = {
    labels,
    datasets: [
      {
        label: t('Profit'),
        data: periodData,
        borderColor: 'rgba(99, 102, 241, 1)',
        backgroundColor: function(context: any) {
          const chart = context.chart;
          const {ctx, chartArea} = chart;
          if (!chartArea) {
            return null;
          }
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
          gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');
          return gradient;
        },
        borderWidth: 3,
        fill: true,
        tension: 0.2,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHitRadius: 20,
        pointBackgroundColor: 'rgba(99, 102, 241, 1)',
        pointBorderColor: 'rgba(255, 255, 255, 1)',
        pointBorderWidth: 2
      }
    ]
  };

  if (!user) {
    return null;
  }

  // Skip loading screen for faster loading
  // if (loading) {
  //   return (
  //     <div className="px-4 sm:px-6 lg:px-8 pb-4 md:py-8">
  //       <div className="max-w-7xl mx-auto">
  //         <div className="">
  //           <div className="h-8 bg-gray-700 rounded w-1/4 mb-6"></div>
  //           <div className="grid grid-cols-1 md:grid-cols-1 gap-8">
  //             <div className="bg-[#232b3e] rounded-xl p-6 h-[400px] border border-[#2d3748]">
  //               <div className="h-full bg-[#1a2234] rounded"></div>
  //             </div>
  //           </div>
  //         </div>
  //       </div>
  //     </div>
  //   );
  // }

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-4 md:py-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-xl md:text-2xl font-bold text-white mb-8 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
          {t('Reports')}
        </h1>

        {hasConnectedAccount ? (
          <>
            {/* Summary Card */}
            <div className="bg-[#232b3e] rounded-2xl px-4 md:px-8 py-6 mb-8 shadow-xl border border-[#2d3748]">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h2 className="text-gray-400 text-sm font-medium mb-1">{t('Total PnL')}</h2>
                  <div className="text-3xl md:text-4xl font-bold text-white">
                    €{(reportData?.summary?.year ?? 0).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-8">
              {/* Profit Chart */}
              <div className="bg-[#232b3e] rounded-2xl px-4 md:px-8 py-6 border border-[#2d3748] shadow-xl">
                <div className="flex flex-col space-y-6">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <h2 className="text-gray-400 text-sm font-medium mb-1">{t('Profit Overview')}</h2>
                      <div className={`text-2xl font-bold ${currentProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        €{isNaN(currentProfit) ? '0.00' : Math.abs(currentProfit).toFixed(2)}
                      </div>
                      {selectedPeriod === 'week' && (
                        <p className="text-xs text-gray-500 mt-1">
                          {t('Note: Weekly view shows last 7 days (daily values estimated from monthly total)')}
                        </p>
                      )}
                      {selectedPeriod === 'month' && (
                        <p className="text-xs text-gray-500 mt-1">
                          {t('Note: Shows last 30 days from today')}
                        </p>
                      )}
                      {selectedPeriod === '6months' && (
                        <p className="text-xs text-gray-500 mt-1">
                          {t('Note: Shows last 6 months with monthly profit data')}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(['week', 'month', '6months', 'year', 'all'] as TimePeriod[]).map((period) => (
                        <button
                          key={period}
                          onClick={() => setSelectedPeriod(period)}
                          className={`px-4 py-2 text-sm rounded-lg transition-all duration-200 ${
                            selectedPeriod === period
                              ? 'bg-blue-600 text-white'
                              : 'bg-[#1a2234] text-gray-300 hover:bg-[#2d3748] border border-[#2d3748]'
                          }`}
                        >
                          {period === '6months' ? t('6M') : period === 'all' ? t('All') : t(period.charAt(0).toUpperCase() + period.slice(1))}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="h-[400px] mt-6">
                  {loading ? (
                    <div className="h-full flex items-center justify-center bg-[#1a2234] rounded-xl border border-[#2d3748] animate-pulse">
                      <p className="text-gray-500 text-center">{t('Loading report...')}</p>
                    </div>
                  ) : hasChartData ? (
                    <Line 
                      key={`pnl-chart-${selectedPeriod}-${periodData.length}`}
                      options={chartOptions} 
                      data={pnlChartData} 
                      ref={(ref) => setChartRef(ref)}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-gray-400 text-center">{t('No profit data available for this period.')}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Advanced Statistics Section */}
            <div className="bg-[#232b3e] rounded-2xl px-4 md:px-8 py-6 border border-[#2d3748] shadow-xl">
              <h2 className="text-xl font-bold text-white mb-6">{t('Advanced Statistics')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                
                {/* Today's Profit */}
                <div className="bg-[#1a2234] rounded-xl p-6 border border-[#2d3748] hover:border-[#4a5568] transition-colors duration-200">
                  <div className="text-gray-400 text-sm mb-2">{t('Profit Today')}</div>
                  <div className={`text-2xl font-bold ${Number(reportData?.summary?.today ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    €{Number(reportData?.summary?.today ?? 0).toFixed(2)}
                  </div>
                </div>

                {/* This Week's Profit */}
                <div className="bg-[#1a2234] rounded-xl p-6 border border-[#2d3748] hover:border-[#4a5568] transition-colors duration-200">
                  <div className="text-gray-400 text-sm mb-2">{t('Profit This Week')}</div>
                  <div className={`text-2xl font-bold ${Number(reportData?.summary?.week ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    €{Number(reportData?.summary?.week ?? 0).toFixed(2)}
                  </div>
                </div>
                
                {/* This Month's Profit */}
                <div className="bg-[#1a2234] rounded-xl p-6 border border-[#2d3748] hover:border-[#4a5568] transition-colors duration-200">
                  <div className="text-gray-400 text-sm mb-2">{t('Profit This Month')}</div>
                  <div className={`text-2xl font-bold ${Number(reportData?.summary?.month ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    €{Number(reportData?.summary?.month ?? 0).toFixed(2)}
                  </div>
                </div>

                {/* Last 6 Months Profit */}
                <div className="bg-[#1a2234] rounded-xl p-6 border border-[#2d3748] hover:border-[#4a5568] transition-colors duration-200">
                  <div className="text-gray-400 text-sm mb-2">{t('Profit Last 6 Months')}</div>
                  <div className={`text-2xl font-bold ${Number(reportData?.summary?.six_months ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    €{Number(reportData?.summary?.six_months ?? 0).toFixed(2)}
                  </div>
                </div>

                {/* This Year's Profit */}
                <div className="bg-[#1a2234] rounded-xl p-6 border border-[#2d3748] hover:border-[#4a5568] transition-colors duration-200">
                  <div className="text-gray-400 text-sm mb-2">{t('Profit This Year')}</div>
                  <div className={`text-2xl font-bold ${Number(reportData?.summary?.year ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    €{Number(reportData?.summary?.year ?? 0).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-[#232b3e] rounded-2xl px-4 md:px-8 py-6 border border-[#2d3748] shadow-xl">
            <div className="flex items-center justify-center h-32">
              <p className="text-red-400 text-center">{t('Without any MetaTrader 4 account connected to the platform')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}