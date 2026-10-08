'use client'

import { ThemeProvider } from 'next-themes'
import { ReactNode, useEffect } from 'react'

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Check if theme preference exists in localStorage
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme) {
      document.documentElement.classList.toggle('dark', savedTheme === 'dark')
    }
  }, [])

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="theme"
    >
      {children}
    </ThemeProvider>
  )
} 