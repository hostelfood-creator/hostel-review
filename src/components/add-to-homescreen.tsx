'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faMobileScreenButton,
  faArrowUpFromBracket,
  faPlus,
  faDownload,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/* ─── Storage keys ─── */
const INSTALLED_KEY = 'a2hs_installed'
const DISMISSED_KEY = 'a2hs_dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** True when the app is already running as an installed PWA. */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/** True on iOS Safari, which doesn't support beforeinstallprompt. */
function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isSafari =
    /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS|Chrome/.test(ua)
  return isIOS && isSafari
}

/**
 * Profile-only "Install App" card.
 *
 * Behaviour:
 * - If the app is already installed (standalone mode or previously accepted) → renders nothing.
 * - Shows a clean inline card with an Install button (Chrome/Edge) or iOS share instructions.
 * - "Install" clicked → triggers native prompt; on accept → permanently hidden.
 * - "Dismiss" (✕) clicked → card collapses into a tiny floating pill "Install App"
 *   that stays visible on the profile page so the user can tap it any time.
 * - The pill uses the same deferred prompt — clicking it triggers native install.
 */
export function ProfileInstallCard() {
  const [ready, setReady] = useState(false)
  const [hidden, setHidden] = useState(true) // hidden until we confirm eligibility
  const [dismissed, setDismissed] = useState(false)
  const [iosMode, setIosMode] = useState(false)
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null)

  /* ── Initialise ── */
  useEffect(() => {
    // Already installed or running standalone — never show anything
    if (isStandalone()) {
      try { localStorage.setItem(INSTALLED_KEY, '1') } catch { /* noop */ }
      return
    }
    // Previously installed via prompt
    try { if (localStorage.getItem(INSTALLED_KEY) === '1') return } catch { /* noop */ }

    // Restore dismissed state from previous visit
    try {
      if (localStorage.getItem(DISMISSED_KEY) === '1') setDismissed(true)
    } catch { /* noop */ }

    if (isIOSSafari()) {
      setIosMode(true)
      setHidden(false)
      setReady(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      deferredRef.current = e as BeforeInstallPromptEvent
      setHidden(false)
      setReady(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  /* ── Install handler ── */
  const handleInstall = useCallback(async () => {
    if (iosMode) return // iOS has no programmatic install

    const prompt = deferredRef.current
    if (!prompt) return

    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') {
      try { localStorage.setItem(INSTALLED_KEY, '1') } catch { /* noop */ }
      setHidden(true)
    }
    deferredRef.current = null
  }, [iosMode])

  /* ── Dismiss handler — collapse to pill ── */
  const handleDismiss = useCallback(() => {
    setDismissed(true)
    try { localStorage.setItem(DISMISSED_KEY, '1') } catch { /* noop */ }
  }, [])

  // Nothing to show
  if (hidden || !ready) return null

  /* ─── Collapsed pill (after dismiss) ─── */
  if (dismissed) {
    return (
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        onClick={iosMode ? () => setDismissed(false) : handleInstall}
        className="flex items-center gap-2 px-3.5 py-2 rounded-full border bg-card shadow-sm hover:shadow-md hover:border-primary/30 transition-all group"
        aria-label="Install app"
      >
        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
          <FontAwesomeIcon
            icon={faDownload}
            className="w-3 h-3 text-primary"
          />
        </div>
        <span className="text-xs font-medium text-foreground">Install App</span>
      </motion.button>
    )
  }

  /* ─── Full inline card ─── */
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="install-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ type: 'spring', damping: 22, stiffness: 280 }}
      >
        <Card className="rounded-xl overflow-hidden relative">
          {/* Accent stripe */}
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary via-primary/60 to-transparent" />

          <CardContent className="p-4">
            {/* Dismiss */}
            <button
              onClick={handleDismiss}
              aria-label="Dismiss install prompt"
              className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-accent text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              <FontAwesomeIcon icon={faXmark} className="w-3 h-3" />
            </button>

            {iosMode ? (
              /* iOS instructions */
              <div className="pr-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FontAwesomeIcon
                      icon={faMobileScreenButton}
                      className="w-4 h-4 text-primary"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground leading-tight">
                      Install App
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Add to home screen for quick access
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5 ml-0.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                      1
                    </span>
                    <span>
                      Tap{' '}
                      <FontAwesomeIcon
                        icon={faArrowUpFromBracket}
                        className="w-3 h-3 text-primary mx-0.5 inline"
                      />{' '}
                      Share
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                      2
                    </span>
                    <span>
                      Tap{' '}
                      <strong className="text-foreground">
                        Add to Home Screen
                      </strong>{' '}
                      <FontAwesomeIcon
                        icon={faPlus}
                        className="w-2.5 h-2.5 text-primary mx-0.5 inline"
                      />
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* Chrome / Edge */
              <div className="pr-6">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FontAwesomeIcon
                      icon={faDownload}
                      className="w-4 h-4 text-primary"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-tight">
                      Install App
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Get a native app experience — works offline
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleInstall}
                    className="rounded-full text-xs px-4 h-8 font-semibold shrink-0"
                  >
                    Install
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  )
}
