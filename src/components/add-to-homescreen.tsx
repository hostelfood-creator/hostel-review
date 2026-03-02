'use client'

import { useEffect, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMobileScreenButton, faXmark, faArrowUpFromBracket, faEllipsisVertical, faPlus } from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/components/ui/button'

const DISMISS_KEY = 'a2hs_dismissed'
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // Re-show after 7 days

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Detects whether the user is on iOS Safari (which lacks beforeinstallprompt).
 */
function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS|Chrome/.test(ua)
  return isIOS && isSafari
}

/**
 * Checks whether the app is already running in standalone/installed mode.
 */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/**
 * Returns true if the user dismissed the prompt recently.
 */
function wasDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const ts = parseInt(raw, 10)
    return Date.now() - ts < DISMISS_DURATION_MS
  } catch {
    return false
  }
}

export function AddToHomeScreen() {
  const [visible, setVisible] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosMode, setIosMode] = useState(false)

  useEffect(() => {
    // Don't show if already installed or recently dismissed
    if (isStandalone() || wasDismissed()) return

    // iOS path
    if (isIOSSafari()) {
      const timer = setTimeout(() => {
        setIosMode(true)
        setVisible(true)
      }, 4000)
      return () => clearTimeout(timer)
    }

    // Android / desktop Chrome path — listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setTimeout(() => setVisible(true), 3000)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setVisible(false)
    }
    setDeferredPrompt(null)
  }, [deferredPrompt])

  const handleDismiss = useCallback(() => {
    setVisible(false)
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* noop */ }
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: 'spring', damping: 24, stiffness: 260 }}
          className="fixed bottom-24 left-4 right-4 z-50 sm:left-auto sm:right-6 sm:max-w-sm"
        >
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-4 overflow-hidden">
            {/* Accent top stripe */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />

            {/* Dismiss button */}
            <button
              onClick={handleDismiss}
              aria-label="Dismiss install prompt"
              className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full hover:bg-accent text-muted-foreground transition-colors"
            >
              <FontAwesomeIcon icon={faXmark} className="w-3.5 h-3.5" />
            </button>

            {iosMode ? (
              /* ─── iOS Safari Instructions ─── */
              <div className="pr-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <FontAwesomeIcon icon={faMobileScreenButton} className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Add to Home Screen</p>
                    <p className="text-[11px] text-muted-foreground">Get quick access like a native app</p>
                  </div>
                </div>
                <div className="space-y-2 ml-1">
                  <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                    <span>
                      Tap the <FontAwesomeIcon icon={faArrowUpFromBracket} className="w-3 h-3 text-primary mx-0.5 inline" /> Share button below
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
                    <span>
                      Scroll down and tap <strong className="text-foreground">Add to Home Screen</strong> <FontAwesomeIcon icon={faPlus} className="w-2.5 h-2.5 text-primary mx-0.5 inline" />
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* ─── Chrome / Edge Install ─── */
              <div className="pr-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <FontAwesomeIcon icon={faMobileScreenButton} className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Install App</p>
                    <p className="text-[11px] text-muted-foreground">Add to home screen for quick access</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-1">
                  <Button
                    size="sm"
                    onClick={handleInstall}
                    className="rounded-full text-xs px-4 h-8 font-semibold"
                  >
                    Install
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDismiss}
                    className="rounded-full text-xs px-4 h-8 text-muted-foreground"
                  >
                    Not now
                  </Button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
