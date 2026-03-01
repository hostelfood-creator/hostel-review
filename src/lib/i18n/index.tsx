'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

import en from './translations/en.json'
import ta from './translations/ta.json'
import hi from './translations/hi.json'
import te from './translations/te.json'

// ── Types ─────────────────────────────────────────────────

export type Locale = 'en' | 'ta' | 'hi' | 'te'

export const LOCALES: { code: Locale; label: string; nativeLabel: string }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు' },
]

type TranslationData = typeof en

const translations: Record<Locale, TranslationData> = { en, ta, hi, te }

const STORAGE_KEY = 'app_locale'

// ── Context ───────────────────────────────────────────────

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: TranslationData
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: en,
})

// ── Provider ──────────────────────────────────────────────

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en')

  // Load saved locale on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Locale | null
      if (saved && translations[saved]) {
        setLocaleState(saved)
        document.documentElement.setAttribute('lang', saved)
      }
    } catch {
      // localStorage not available
    }
  }, [])

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    try {
      localStorage.setItem(STORAGE_KEY, newLocale)
    } catch {
      // localStorage not available
    }
    // Update html lang attribute
    document.documentElement.setAttribute('lang', newLocale)
  }, [])

  const t = translations[locale] || en

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────

export function useTranslation() {
  return useContext(I18nContext)
}

export function useLocale() {
  const { locale, setLocale } = useContext(I18nContext)
  return { locale, setLocale }
}
