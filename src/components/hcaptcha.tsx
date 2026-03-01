'use client'

import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react'

/**
 * hCaptcha widget component — used as a fallback when Cloudflare
 * Turnstile fails to load (ad-blocker, network, wrong key type, etc.).
 *
 * Shows a visible compact checkbox challenge with loading/error states
 * so the user always knows what's happening.
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
let hcaptchaScriptFailed = false
const hcaptchaLoadCallbacks: ((success: boolean) => void)[] = []

function loadHCaptchaScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (hcaptchaScriptLoaded && window.hcaptcha) {
      resolve(true)
      return
    }
    if (hcaptchaScriptFailed) {
      resolve(false)
      return
    }

    hcaptchaLoadCallbacks.push(resolve)

    if (hcaptchaScriptLoading) return
    hcaptchaScriptLoading = true

    window.onHcaptchaLoad = () => {
      hcaptchaScriptLoaded = true
      hcaptchaScriptLoading = false
      hcaptchaLoadCallbacks.forEach((cb) => cb(true))
      hcaptchaLoadCallbacks.length = 0
    }

    const script = document.createElement('script')
    script.src = 'https://js.hcaptcha.com/1/api.js?onload=onHcaptchaLoad&render=explicit'
    script.async = true
    script.defer = true

    script.onerror = () => {
      hcaptchaScriptLoading = false
      hcaptchaScriptFailed = true
      console.error('[hCaptcha] Failed to load script')
      hcaptchaLoadCallbacks.forEach((cb) => cb(false))
      hcaptchaLoadCallbacks.length = 0
    }

    document.head.appendChild(script)
  })
}

/** Allow re-trying script load after failure */
function resetScriptState() {
  hcaptchaScriptFailed = false
  hcaptchaScriptLoading = false
  // Remove old failed script tags so we can try again
  document.querySelectorAll('script[src*="hcaptcha.com"]').forEach((el) => el.remove())
}

// ── Component ────────────────────────────────────────────────────────
export const HCaptcha = forwardRef<HCaptchaRef, HCaptchaProps>(
  function HCaptcha({ onVerify, onExpire, onError }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const widgetIdRef = useRef<string | null>(null)
    const mountedRef = useRef(true)
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

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

      setStatus('loading')
      const scriptOk = await loadHCaptchaScript()

      if (!scriptOk || !window.hcaptcha || !containerRef.current || !mountedRef.current) {
        console.error('[hCaptcha] Script not available after loading attempt')
        if (mountedRef.current) setStatus('error')
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
        if (mountedRef.current) setStatus('ready')
      } catch (err) {
        console.error('[hCaptcha] render() threw:', err)
        if (mountedRef.current) setStatus('error')
      }
    }, [siteKey])

    const handleRetry = useCallback(() => {
      resetScriptState()
      renderWidget()
    }, [renderWidget])

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

    if (!siteKey) {
      return (
        <p style={{ color: '#ef4444', fontSize: 12, textAlign: 'center' }}>
          Captcha not configured — please contact support.
        </p>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginTop: 8, minHeight: 80 }}>
        {/* Loading indicator */}
        {status === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity={0.25} />
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity={0.75} />
            </svg>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            <span style={{ fontSize: 13, color: '#6b7280' }}>Loading captcha…</span>
          </div>
        )}

        {/* The actual hCaptcha widget container — use visibility instead of display
            so hCaptcha can measure dimensions during render */}
        <div
          ref={containerRef}
          style={{
            visibility: status === 'ready' ? 'visible' : 'hidden',
            position: status === 'ready' ? 'relative' : 'absolute',
            justifyContent: 'center',
            minWidth: 164,
            minHeight: status === 'ready' ? 144 : 0,
          }}
        />

        {/* Error state with retry button */}
        {status === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 0' }}>
            <p style={{ fontSize: 13, color: '#ef4444', margin: 0 }}>Captcha failed to load</p>
            <button
              type="button"
              onClick={handleRetry}
              style={{
                fontSize: 13,
                color: '#3b82f6',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '4px 8px',
              }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    )
  }
)
