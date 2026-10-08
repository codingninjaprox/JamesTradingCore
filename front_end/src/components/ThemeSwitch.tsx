'use client'

import { useTheme } from 'next-themes'
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'

export function ThemeSwitch() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // After mounting, we have access to the theme
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <button
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label="Toggle theme"
      >
        <div className="h-[14px] w-[14px] md:h-[18px] md:w-[18px] bg-gray-200 dark:bg-gray-700 rounded-full" />
      </button>
    )
  }

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? (
        <SunIcon className="h-[14px] w-[14px] md:h-[18px] md:w-[18px] text-gray-200" />
      ) : (
        <MoonIcon className="h-[14px] w-[14px] md:h-[18px] md:w-[18px] text-gray-800" />
      )}
    </button>
  )
} 