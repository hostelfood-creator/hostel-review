'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSun, faMoon } from '@fortawesome/free-solid-svg-icons'

type Theme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => { },
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem('theme') as Theme | null
    if (stored) {
      setTheme(stored)
    } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      setTheme('light')
    }
  }, [])

  useEffect(() => {
    if (!mounted) return
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme, mounted])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      className={`relative inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors hover:bg-zinc-200 dark:hover:bg-white/5 ${className}`}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {/* Sun icon - shown in dark mode */}
      <FontAwesomeIcon
        icon={faSun}
        className={`w-5 h-5 transition-all duration-200 absolute ${theme === 'dark'
            ? 'opacity-100 rotate-0 scale-100'
            : 'opacity-0 rotate-90 scale-0'
          }`}
        style={{ color: '#A1A1AA' }}
      />
      {/* Moon icon - shown in light mode */}
      <FontAwesomeIcon
        icon={faMoon}
        className={`w-5 h-5 transition-all duration-200 absolute ${theme === 'light'
            ? 'opacity-100 rotate-0 scale-100'
            : 'opacity-0 -rotate-90 scale-0'
          }`}
        style={{ color: '#71717a' }}
      />
    </button>
  )
}
