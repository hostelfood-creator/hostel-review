'use client'

import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react'

/**
 * hCaptcha widget component — used as a fallback when Cloudflare
 * Turnstile fails to load (ad-blocker, network, wrong key type, etc.).
 *
 * Renders a visible compact checkbox challenge. The user clicks the
 * checkbox to prove they're human — much simpler than image challenges.
 *
 * @see https://docs.hcaptcha.com/
 */

// ── Global hCaptcha type ─────────────────────────────────────────────
declare global {
  interface Window {
    hcaptcha?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string
      reset: (widgetId?: string) => void
      remove: (widgetId: string) => void
      getResponse: (widgetId?: string) => string
    }
    onHcaptchaLoad?: () => void
  }
}

// ── Public types ─────────────────────────────────────────────────────
export interface HCaptchaRef {
  reset: () => void
}

interface HCaptchaProps {
  onVerify: (token: string) => void
  onExpire?: () => void
  onError?: (errorCode?: string) => void
}

// ── Script loader (singleton) ────────────────────────────────────────
let hcaptchaScriptLoaded = false
let hcaptchaScriptLoading = false
const hcaptchaLoadCallbacks: (() => void)[] = []

function loadHCaptchaScript(): Promise<void> {
  return new Promise((resolve) => {
    if (hcaptchaScriptLoaded && window.hcaptcha) {
      resolve()
      return
    }

    hcaptchaLoadCallbacks.push(resolve)

    if (hcaptchaScriptLoading) return
    hcaptchaScriptLoading = true

    window.onHcaptchaLoad = () => {
      hcaptchaScriptLoaded = true
      hcaptchaScriptLoading = false
      hcaptchaLoadCallbacks.forEach((cb) => cb())
      hcaptchaLoadCallbacks.length = 0
    }

    const script = document.createElement('script')
    script.src = 'https://js.hcaptcha.com/1/api.js?onload=onHcaptchaLoad&render=explicit'
    script.async = true
    script.defer = true

    script.onerror = () => {
      hcaptchaScriptLoading = false
      console.error('[hCaptcha] Failed to load script')
      hcaptchaLoadCallbacks.forEach((cb) => cb())
      hcaptchaLoadCallbacks.length = 0
    }

    document.head.appendChild(script)
  })
}

// ── Component ────────────────────────────────────────────────────────
export const HCaptcha = forwardRef<HCaptchaRef, HCaptchaProps>(
  function HCaptcha({ onVerify, onExpire, onError }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const widgetIdRef = useRef<string | null>(null)
    const mountedRef = useRef(true)

    const onVerifyRef = useRef(onVerify)
    const onExpireRef = useRef(onExpire)
    const onErrorRef = useRef(onError)
    onVerifyRef.current = onVerify
    onExpireRef.current = onExpire
    onErrorRef.current = onError

    const siteKey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY

    useImperativeHandle(
      ref,
      () => ({
        reset: () => {
          if (widgetIdRef.current && window.hcaptcha) {
            try {
              window.hcaptcha.reset(widgetIdRef.current)
            } catch { /* widget may have been removed */ }
          }
        },
      }),
      []
    )

    const renderWidget = useCallback(async () => {
      if (!siteKey || !containerRef.current || !mountedRef.current) return

      await loadHCaptchaScript()

      if (!window.hcaptcha || !containerRef.current || !mountedRef.current) {
        console.error('[hCaptcha] Script not available after loading attempt')
        return
      }

      // Clean up previous widget
      if (widgetIdRef.current) {
        try {
          window.hcaptcha.remove(widgetIdRef.current)
        } catch { /* already removed */ }
        widgetIdRef.current = null
      }

      try {
        widgetIdRef.current = window.hcaptcha.render(containerRef.current, {
          sitekey: siteKey,
          size: 'compact',
          callback: (token: string) => {
            console.log('[hCaptcha] Token received successfully')
            onVerifyRef.current(token)
          },
          'expired-callback': () => {
            console.warn('[hCaptcha] Token expired')
            onExpireRef.current?.()
          },
          'error-callback': (errorCode: string) => {
            console.error('[hCaptcha] Widget error:', errorCode)
            onErrorRef.current?.(errorCode)
          },
        })
      } catch (err) {
        console.error('[hCaptcha] render() threw:', err)
      }
    }, [siteKey])

    useEffect(() => {
      mountedRef.current = true
      renderWidget()

      return () => {
        mountedRef.current = false
        if (widgetIdRef.current && window.hcaptcha) {
          try {
            window.hcaptcha.remove(widgetIdRef.current)
          } catch { /* already removed */ }
          widgetIdRef.current = null
        }
      }
    }, [renderWidget])

    if (!siteKey) return null

    return (
      <div
        ref={containerRef}
        style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}
      />
    )
  }
)
