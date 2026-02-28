'use client'

import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react'

/**
 * Cloudflare Turnstile invisible widget component.
 * Loads the Turnstile script and renders an invisible challenge.
 * Calls `onVerify` with the token when verification succeeds.
 *
 * Exposes a `reset()` method via ref so the parent can request a fresh
 * token after each form submission (Turnstile tokens are single-use).
 *
 * @see https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
 */

// Extend the global Window interface for Turnstile
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

export interface TurnstileRef {
  reset: () => void
}

interface TurnstileProps {
  onVerify: (token: string) => void
  onExpire?: () => void
  onError?: () => void
}

// Track script loading globally to avoid duplicate script tags
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
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad'
    script.async = true
    script.defer = true
    document.head.appendChild(script)
  })
}

export const Turnstile = forwardRef<TurnstileRef, TurnstileProps>(
  function Turnstile({ onVerify, onExpire, onError }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const widgetIdRef = useRef<string | null>(null)
    const onVerifyRef = useRef(onVerify)
    const onExpireRef = useRef(onExpire)
    const onErrorRef = useRef(onError)

    // Keep refs in sync without re-rendering the widget
    onVerifyRef.current = onVerify
    onExpireRef.current = onExpire
    onErrorRef.current = onError

    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

    // Expose reset() to parent so single-use tokens can be refreshed
    useImperativeHandle(ref, () => ({
      reset: () => {
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.reset(widgetIdRef.current)
          } catch { /* widget may have been removed */ }
        }
      },
    }), [])

    const renderWidget = useCallback(async () => {
      if (!siteKey || !containerRef.current) return

      await loadTurnstileScript()

      if (!window.turnstile || !containerRef.current) return

      // Clean up previous widget if exists
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch { /* already removed */ }
        widgetIdRef.current = null
      }

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => onVerifyRef.current(token),
        'expired-callback': () => onExpireRef.current?.(),
        'error-callback': () => onErrorRef.current?.(),
        size: 'invisible',
        retry: 'auto',
        'retry-interval': 3000,
      })
    }, [siteKey])

    useEffect(() => {
      renderWidget()

      return () => {
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current)
          } catch { /* already removed */ }
          widgetIdRef.current = null
        }
      }
    }, [renderWidget])

    // Don't render anything visible — the widget is invisible
    if (!siteKey) return null

    // IMPORTANT: Do NOT use display:none (className="hidden").
    // Cloudflare Turnstile needs the container in the DOM layout
    // to render its iframe. The widget itself is already invisible.
    return <div ref={containerRef} style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} />
  }
)
