'use client'

import { useState } from 'react'
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
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/outline'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

type TimeRange = 'week' | 'month' | '6months' | 'year'

const mockData = {
  week: {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    data: [10000, 10200, 10150, 10300, 10450, 10300, 10500],
  },
  month: {
    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    data: [10000, 10200, 10150, 10300],
  },
  '6months': {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    data: [10000, 10200, 10150, 10300, 10450, 10500],
  },
  year: {
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    data: [10000, 10200, 10150, 10300],
  },
}

export function PerformanceChart() {
  const [timeRange, setTimeRange] = useState<TimeRange>('week')
  const { labels, data } = mockData[timeRange]

  const getGradient = (ctx: any) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, 400)
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.2)')
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0)')
    return gradient
  }

  const getNegativeGradient = (ctx: any) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, 400)
    gradient.addColorStop(0, 'rgba(239, 68, 68, 0.2)')
    gradient.addColorStop(1, 'rgba(239, 68, 68, 0)')
    return gradient
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        titleColor: '#111827',
        bodyColor: '#374151',
        borderColor: '#E5E7EB',
        borderWidth: 1,
        padding: 12,
        displayColors: false,
        boxPadding: 4,
        callbacks: {
          label: (context: any) => {
            const value = context.parsed.y
            return `$${value.toLocaleString()}`
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: '#6B7280',
          font: {
            size: 12,
          },
        },
      },
      y: {
        grid: {
          color: 'rgba(229, 231, 235, 0.5)',
          drawBorder: false,
        },
        ticks: {
          color: '#6B7280',
          font: {
            size: 12,
          },
          callback: (value: any) => `$${value.toLocaleString()}`,
        },
      },
    },
    elements: {
      point: {
        radius: 4,
        hoverRadius: 6,
        backgroundColor: '#fff',
        borderWidth: 2,
      },
      line: {
        tension: 0.4,
        borderWidth: 2,
      },
    },
  }

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Balance',
        data,
        borderColor: data[data.length - 1] >= data[0] ? '#10B981' : '#EF4444',
        backgroundColor: (context: any) => {
          const chart = context.chart
          const { ctx, chartArea } = chart
          if (!chartArea) return null
          return data[data.length - 1] >= data[0] ? getGradient(ctx) : getNegativeGradient(ctx)
        },
        fill: true,
      },
    ],
  }

  const percentageChange = ((data[data.length - 1] - data[0]) / data[0] * 100).toFixed(2)
  const isPositive = data[data.length - 1] >= data[0]

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      <div className="flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Performance Overview</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Track your trading performance</p>
          </div>
          <div className="flex space-x-2">
            {(['week', 'month', '6months', 'year'] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  timeRange === range
                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                    : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700/50'
                }`}
              >
                {range === '6months' ? '6M' : range.charAt(0).toUpperCase() + range.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Start Balance</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              ${data[0].toLocaleString()}
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Current Balance</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              ${data[data.length - 1].toLocaleString()}
            </p>
          </div>
          <div className={`rounded-lg p-4 ${
            isPositive 
              ? 'bg-green-50 dark:bg-green-900/20' 
              : 'bg-red-50 dark:bg-red-900/20'
          }`}>
            <p className="text-sm text-gray-500 dark:text-gray-400">Performance</p>
            <div className="flex items-center space-x-1">
              {isPositive ? (
                <ArrowUpIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
              ) : (
                <ArrowDownIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
              )}
              <p className={`text-lg font-semibold ${
                isPositive 
                  ? 'text-green-600 dark:text-green-400' 
                  : 'text-red-600 dark:text-red-400'
              }`}>
                {percentageChange}%
              </p>
            </div>
          </div>
        </div>

        <div className="h-[300px]">
          <Line options={options} data={chartData} />
        </div>
      </div>
    </div>
  )
} 