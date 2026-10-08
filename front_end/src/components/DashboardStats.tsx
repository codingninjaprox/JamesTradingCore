'use client'

import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/utils'

export function DashboardStats() {
  const [stats, setStats] = useState({
    totalBalance: 0,
    todayProfit: 0,
    activeTrades: 0,
  })

  useEffect(() => {
    // Simulate API call
    setStats({
      totalBalance: 12500.75,
      todayProfit: 250.50,
      activeTrades: 3,
    })
  }, [])

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg className="h-[20px] w-[20px] md:h-[24px] md:w-[24px] text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="ml-4">
            <p className="text-[12px] md:text-[14px] font-medium text-gray-500 dark:text-gray-400">Total Balance</p>
            <p className="text-[16px] md:text-[20px] font-semibold text-gray-900 dark:text-white">{formatCurrency(stats.totalBalance)}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg className="h-[20px] w-[20px] md:h-[24px] md:w-[24px] text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div className="ml-4">
            <p className="text-[12px] md:text-[14px] font-medium text-gray-500 dark:text-gray-400">Today's Profit</p>
            <p className={`text-[16px] md:text-[20px] font-semibold ${stats.todayProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatCurrency(stats.todayProfit)}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg className="h-[20px] w-[20px] md:h-[24px] md:w-[24px] text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div className="ml-4">
            <p className="text-[12px] md:text-[14px] font-medium text-gray-500 dark:text-gray-400">Active Trades</p>
            <p className="text-[16px] md:text-[20px] font-semibold text-gray-900 dark:text-white">{stats.activeTrades}</p>
          </div>
        </div>
      </div>
    </div>
  )
} 