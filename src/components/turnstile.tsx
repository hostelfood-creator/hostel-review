'use client'

import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react'

/**
 * Cloudflare Turnstile bot-protection widget component.
 *
 * Renders a managed/compact widget in a visually hidden (off-screen)
 * container and automatically retries on errors (up to MAX_RETRIES).
 * Exposes retry count via `onFatalError` so the parent can show a
 * bypass fallback if Turnstile is persistently broken (ad-blocker,
 * network, wrong key type, etc.).
 *
 * Uses `size: 'compact'` which works with Managed, Non-interactive,
 * AND Invisible key types. `size: 'invisible'` ONLY works when the
 * key was explicitly created as Invisible type in the CF dashboard.
 *
 * @see https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
 */

// ── Global Turnstile type ────────────────────────────────────────────
declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
    onTurnstileLoad?: () => void
  }
}

// ── Public types ─────────────────────────────────────────────────────
export interface TurnstileRef {
  reset: () => void
}

interface TurnstileProps {
  onVerify: (token: string) => void
  onExpire?: () => void
  onError?: (errorCode?: string) => void
  /** Called when the widget has exhausted all retry attempts */
  onFatalError?: () => void
}

// ── Script loader (singleton) ────────────────────────────────────────
let scriptLoaded = false
let scriptLoading = false
const loadCallbacks: (() => void)[] = []

function loadTurnstileScript(): Promise<void> {
  return new Promise((resolve) => {
    if (scriptLoaded && window.turnstile) {
      resolve()
      return
    }

    loadCallbacks.push(resolve)

    if (scriptLoading) return
    scriptLoading = true

    window.onTurnstileLoad = () => {
      scriptLoaded = true
      scriptLoading = false
      loadCallbacks.forEach((cb) => cb())
      loadCallbacks.length = 0
    }

    const script = document.createElement('script')
    script.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad'
    script.async = true
    script.defer = true

    // Handle script load failure (network / ad-blocker)
    script.onerror = () => {
      scriptLoading = false
      console.error('[Turnstile] Failed to load script — network or ad blocker?')
      loadCallbacks.forEach((cb) => cb())
      loadCallbacks.length = 0
    }

    document.head.appendChild(script)
  })
}

// ── Constants ────────────────────────────────────────────────────────
const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 2000
/**
 * If Turnstile hasn't produced a token within this many ms after
 * render/reset, fire onFatalError so the parent can switch to hCaptcha.
 * Covers the case where the widget silently waits for user interaction
 * (e.g. managed-mode checkbox) but is hidden off-screen.
 */
const VERIFICATION_TIMEOUT_MS = 8000

// ── Component ────────────────────────────────────────────────────────
export const Turnstile = forwardRef<TurnstileRef, TurnstileProps>(
  function Turnstile({ onVerify, onExpire, onError, onFatalError }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const widgetIdRef = useRef<string | null>(null)
    const retryCountRef = useRef(0)
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const verifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const tokenReceivedRef = useRef(false)
    const fatalFiredRef = useRef(false)
    const mountedRef = useRef(true)

    // Keep callback refs in sync without re-rendering the widget
    const onVerifyRef = useRef(onVerify)
    const onExpireRef = useRef(onExpire)
    const onErrorRef = useRef(onError)
    const onFatalErrorRef = useRef(onFatalError)
    onVerifyRef.current = onVerify
    onExpireRef.current = onExpire
    onErrorRef.current = onError
    onFatalErrorRef.current = onFatalError

    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

    /** Start (or restart) the verification timeout clock. */
    const startVerificationTimeout = useCallback(() => {
      if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)
      tokenReceivedRef.current = false
      verifyTimerRef.current = setTimeout(() => {
        if (!mountedRef.current || tokenReceivedRef.current || fatalFiredRef.current) return
        console.error('[Turnstile] Verification timeout — no token after', VERIFICATION_TIMEOUT_MS, 'ms')
        fatalFiredRef.current = true
        onFatalErrorRef.current?.()
      }, VERIFICATION_TIMEOUT_MS)
    }, [])

    // Expose reset() to parent (single-use tokens need a fresh challenge)
    useImperativeHandle(
      ref,
      () => ({
        reset: () => {
          if (widgetIdRef.current && window.turnstile) {
            try {
              window.turnstile.reset(widgetIdRef.current)
            } catch { /* widget may have been removed */ }
          }
          // Restart the timeout after reset — new token expected
          startVerificationTimeout()
        },
      }),
      [startVerificationTimeout]
    )

    // ── Render / re-render the widget ────────────────────────────────
    const renderWidget = useCallback(async () => {
      if (!siteKey || !containerRef.current || !mountedRef.current) return

      // Start the verification timeout clock
      startVerificationTimeout()

      await loadTurnstileScript()

      // Script failed to load (e.g. ad blocker)
      if (!window.turnstile) {
        console.error('[Turnstile] Script not available after loading attempt')
        retryCountRef.current += 1

        if (retryCountRef.current >= MAX_RETRIES) {
          if (!fatalFiredRef.current) {
            fatalFiredRef.current = true
            onFatalErrorRef.current?.()
          }
          return
        }

        // Retry after increasing delay
        const delay = RETRY_BASE_DELAY_MS * retryCountRef.current
        retryTimerRef.current = setTimeout(() => {
          if (mountedRef.current) renderWidget()
        }, delay)
        return
      }

      if (!containerRef.current || !mountedRef.current) return

      // Clean up previous widget
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch { /* already removed */ }
        widgetIdRef.current = null
      }

      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => {
            console.log('[Turnstile] Token received successfully')
            tokenReceivedRef.current = true
            if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)
            retryCountRef.current = 0
            onVerifyRef.current(token)
          },
          'expired-callback': () => {
            console.warn('[Turnstile] Token expired — auto-resetting')
            onExpireRef.current?.()
            // Auto-reset on expiry to get a new token
            if (widgetIdRef.current && window.turnstile) {
              try { window.turnstile.reset(widgetIdRef.current) } catch { /* ignore */ }
            }
          },
          'error-callback': (errorCode: string) => {
            console.error('[Turnstile] Widget error:', errorCode)
            onErrorRef.current?.(errorCode)

            retryCountRef.current += 1
            if (retryCountRef.current >= MAX_RETRIES) {
              console.error('[Turnstile] Max retries exhausted')
              if (!fatalFiredRef.current) {
                fatalFiredRef.current = true
                onFatalErrorRef.current?.()
              }
              return
            }

            // Auto-retry after increasing delay
            const delay = RETRY_BASE_DELAY_MS * retryCountRef.current
            console.log(`[Turnstile] Retrying in ${delay}ms (attempt ${retryCountRef.current}/${MAX_RETRIES})`)
            retryTimerRef.current = setTimeout(() => {
              if (mountedRef.current) renderWidget()
            }, delay)
          },
          // 'compact' (≥130×120px) works with ALL key types:
          // Managed, Non-interactive, and Invisible.
          size: 'compact',
          execution: 'render',
          retry: 'auto',
          'retry-interval': 3000,
        })
      } catch (err) {
        console.error('[Turnstile] render() threw:', err)
        retryCountRef.current += 1
        if (retryCountRef.current >= MAX_RETRIES && !fatalFiredRef.current) {
          fatalFiredRef.current = true
          onFatalErrorRef.current?.()
        }
      }
    }, [siteKey, startVerificationTimeout])

    useEffect(() => {
      mountedRef.current = true
      renderWidget()

      return () => {
        mountedRef.current = false
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
        if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current)
          } catch { /* already removed */ }
          widgetIdRef.current = null
        }
      }
    }, [renderWidget])

    if (!siteKey) return null

    // Container: 150×140px (exceeds compact minimum of 130×120px).
    // Positioned off-screen (bottom: -200, right: -200) so it renders
    // with real dimensions but is not visible to the user.
    return (
      <div
        ref={containerRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          bottom: -200,
          right: -200,
          zIndex: 1,
          width: 150,
          height: 140,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      />
    )
  }
)
