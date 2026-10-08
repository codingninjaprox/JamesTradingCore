"use client";

import React from "react";
import { formatCurrency } from "@/lib/utils";
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { TradeDetails } from "./TradeDetails";

interface AccountCardProps {
  account: {
    id: string;
    name: string;
    platform: "mt4" | "mt5";
    broker: string;
    server: string;
    login: string;
    status: "active" | "inactive";
    connectionStatus: "connected" | "disconnected" | "connecting" | "error";
    balance: number;
    equity: number;
    profit: number;
    trades: {
      pair: string;
      count: number;
      totalLots: number;
      profit: number;
    }[];
  };
}

export function AccountCard({ account }: AccountCardProps) {
  const router = useRouter();
  const totalTrades = (account.trades || []).reduce(
    (sum, trade) => sum + trade.count,
    0
  );
  const totalProfit = (account.trades || []).reduce(
    (sum, trade) => sum + trade.profit,
    0
  );

  const handleViewDetails = () => {
    router.push(`/accounts/${account.id}`);
  };

  const handleEdit = () => {
    router.push(`/accounts/${account.id}/edit`);
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      <div className="p-6">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-[16px] font-bold text-gray-900 dark:text-white tracking-tight">{account.name}</h3>
            <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-1 tracking-wide">
              {account.platform === 'mt4' ? 'MetaTrader 4' : 'MetaTrader 5'} - {account.broker}
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 tracking-wide">
              {account.server} • {account.login}
            </p>
          </div>
          <div className="flex flex-col items-end">
            <div className="flex space-x-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium tracking-wide ${
                account.status === 'active'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                  : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
              }`}>
                {account.status.charAt(0).toUpperCase() + account.status.slice(1)}
              </span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium tracking-wide ${
                account.connectionStatus === 'connected'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                  : account.connectionStatus === 'connecting'
                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                  : account.connectionStatus === 'error'
                  ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                  : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
              }`}>
                {account.connectionStatus.charAt(0).toUpperCase() + account.connectionStatus.slice(1)}
              </span>
            </div>
            <span className="mt-2 text-[12px] text-gray-500 dark:text-gray-400 tracking-wide">
              {totalTrades} Active Trades
            </span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
            <p className="text-[12px] text-gray-500 dark:text-gray-400 tracking-wide">Balance</p>
            <p className="text-[14px] font-medium text-gray-900 dark:text-white mt-1 tracking-tight">
              ${account.balance.toLocaleString()}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
            <p className="text-[12px] text-gray-500 dark:text-gray-400 tracking-wide">Equity</p>
            <p className="text-[14px] font-medium text-gray-900 dark:text-white mt-1 tracking-tight">
              ${account.equity.toLocaleString()}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
            <p className="text-[12px] text-gray-500 dark:text-gray-400 tracking-wide">Today's Profit</p>
            <p className={`text-[14px] font-medium mt-1 tracking-tight ${
              account.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              ${Math.abs(account.profit).toLocaleString()} {account.profit >= 0 ? '↑' : '↓'}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
            <p className="text-[12px] text-gray-500 dark:text-gray-400 tracking-wide">Total Profit</p>
            <p className={`text-[14px] font-medium mt-1 tracking-tight ${
              totalProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              ${Math.abs(totalProfit).toLocaleString()} {totalProfit >= 0 ? '↑' : '↓'}
            </p>
          </div>
        </div>

        <TradeDetails trades={account.trades} />
        
        <div className="mt-4 flex space-x-2">
          <button
            onClick={handleViewDetails}
            className="inline-flex items-center px-3 py-1.5 border border-transparent text-[12px] md:text-[14px] font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            View Details
          </button>
          <button
            onClick={handleEdit}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-[12px] md:text-[14px] font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}
