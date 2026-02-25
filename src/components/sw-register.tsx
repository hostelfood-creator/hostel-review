'use client'

import { useEffect } from 'react'

/**
 * Register the service worker for PWA offline support and push notifications.
 * Must be rendered inside a client component tree.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        })

        // Check for updates periodically (every 60 minutes)
        setInterval(() => {
          registration.update()
        }, 60 * 60 * 1000)

        // Detect new service worker waiting
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available — auto-activate on next navigation
              console.log('[SW] New version available, will activate on next navigation')
            }
          })
        })
      } catch (err) {
        console.error('[SW] Registration failed:', err)
      }
    }

    // Register after page load to not block initial render
    if (document.readyState === 'complete') {
      registerSW()
    } else {
      window.addEventListener('load', registerSW)
      return () => window.removeEventListener('load', registerSW)
    }
  }, [])

  return null
}
