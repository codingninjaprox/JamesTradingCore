import React, { useState } from 'react'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'

interface TradeDetailsProps {
  trades?: {
    pair: string
    count: number
    totalLots: number
    profit: number
  }[]
}

export function TradeDetails({ trades = [] }: TradeDetailsProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="mt-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center space-x-2">
          <span className="text-[14px] font-medium text-gray-700 dark:text-gray-300 tracking-wide">
            Active Trades
          </span>
          <span className="px-2 py-0.5 text-[12px] font-medium rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 tracking-wide">
            {trades.length}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUpIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
        ) : (
          <ChevronDownIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-2">
          {trades.length === 0 ? (
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <p className="text-[12px] text-gray-500 dark:text-gray-400 text-center tracking-wide">No active trades</p>
            </div>
          ) : (
            <div className="space-y-2">
              {trades.map((trade, index) => (
                <div 
                  key={index} 
                  className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="col-span-6">
                    <div className="font-medium text-gray-900 dark:text-white tracking-tight">{trade.pair}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 tracking-wide">
                      {trade.count} {trade.count === 1 ? 'trade' : 'trades'}
                    </div>
                  </div>
                  <div className="col-span-3">
                    <div className="text-gray-900 dark:text-white tracking-tight">{trade.totalLots}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 tracking-wide">lots</div>
                  </div>
                  <div className={`col-span-3 text-right ${
                    trade.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    <div className="font-medium tracking-tight">
                      ${Math.abs(trade.profit).toLocaleString()}
                    </div>
                    <div className="text-[11px] tracking-wide">
                      {trade.profit >= 0 ? 'Profit' : 'Loss'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
} 