'use client';

import { useLanguage } from '@/contexts/LanguageContext'
import { getTranslation } from '@/utils/translation'

export default function Footer() {
  const { translations } = useLanguage()
  const t = (key: string) => getTranslation(translations, key)

  return (
    <footer className="w-full py-2 md:py-3 px-4">
      <div className="max-w-7xl mx-auto">
        <p className="text-[8px] md:text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">
          {t("This website is for educational and illustrative purposes only. No information presented here constitutes an investment recommendation or guarantees future results. Trading in the financial markets involves risks, including the total loss of invested capital. The automated trading system executes predefined strategies set by the user, who maintains full control over their account and settings.")}
        </p>
      </div>
    </footer>
  )
} 