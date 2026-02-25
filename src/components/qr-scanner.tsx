<<<<<<< HEAD
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCamera, faTriangleExclamation, faRotate, faVideoSlash } from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import jsQR from 'jsqr'

type PermissionState = 'prompt' | 'granted' | 'denied' | 'checking' | 'unsupported'
type ScannerState = 'idle' | 'requesting' | 'scanning' | 'error'

interface QRScannerProps {
  /** Called when a QR code is successfully decoded */
  onScan: (data: string) => void
  /** Optional CSS classes for the outer wrapper */
  className?: string
}

/**
 * QR Scanner component with full camera permission lifecycle management.
 *
 * Handles:
 * - Checking permission state before requesting
 * - Prompting users to grant camera access
 * - Detecting when permission is denied/reset and showing recovery instructions
 * - Scanning QR codes via the native BarcodeDetector API (Chrome, Edge, Android)
 * - Graceful fallback message for unsupported browsers (Firefox, older Safari)
 * - Cleaning up camera streams on unmount
 */
export default function QRScanner({ onScan, className = '' }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animFrameRef = useRef<number>(0)
  const hasScannedRef = useRef(false)
  const mountedRef = useRef(true)
  // Ref to always hold the latest onScan callback, avoiding stale closures
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  const [permission, setPermission] = useState<PermissionState>('checking')
  const [scannerState, setScannerState] = useState<ScannerState>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  // ── Permission Detection ───────────────────────────────────
  const checkPermission = useCallback(async () => {
    setPermission('checking')

    // Check if getUserMedia is available (HTTPS required)
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermission('unsupported')
      setErrorMessage(
        window.location.protocol === 'http:'
          ? 'Camera requires HTTPS. Please access this site via a secure connection.'
          : 'Camera is not supported on this device or browser.'
      )
      return
    }

    // Use Permissions API to check state *without* triggering a prompt
    try {
      const result = await navigator.permissions.query({ name: 'camera' as PermissionName })
      const initialState = result.state as PermissionState
      setPermission(initialState)

      // If permission is already granted, start the camera immediately
      if (initialState === 'granted') {
        startCamera()
      }

      // Listen for permission changes (e.g., user resets in browser settings)
      result.addEventListener('change', () => {
        const newState = result.state as PermissionState
        setPermission(newState)

        // If permission was revoked while scanner is active, stop camera
        if (newState === 'denied') {
          stopCamera()
          setScannerState('error')
          setErrorMessage('Camera permission was revoked. Please re-enable it in your browser settings.')
        }

        // If permission was re-granted, auto-restart
        if (newState === 'granted' && scannerState !== 'scanning') {
          startCamera()
        }
      })
    } catch {
      // Permissions API not supported — assume prompt
      setPermission('prompt')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Camera Start / Stop ────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = 0
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const startCamera = useCallback(async () => {
    setScannerState('requesting')
    setErrorMessage('')
    hasScannedRef.current = false

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' }, // Prefer rear camera
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      })

      streamRef.current = stream

      // Guard: if component unmounted while getUserMedia was pending, stop immediately
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      setPermission('granted')
      setScannerState('scanning')
    } catch (err: unknown) {
      const error = err as DOMException
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setPermission('denied')
        setScannerState('error')
        setErrorMessage('Camera access was denied. Please allow camera access to scan QR codes.')
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setPermission('unsupported')
        setScannerState('error')
        setErrorMessage('No camera found on this device.')
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        setScannerState('error')
        setErrorMessage('Camera is in use by another app. Please close it and try again.')
      } else {
        setScannerState('error')
        setErrorMessage('Failed to access camera. Please try again.')
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── QR Code Detection Loop ─────────────────────────────────
  const startQRDetection = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    // Try native BarcodeDetector first (Chrome 83+, Edge, Samsung, Android WebView)
    let detector: BarcodeDetector | null = null
    if ('BarcodeDetector' in window) {
      try {
        detector = new BarcodeDetector({ formats: ['qr_code'] })
      } catch {
        detector = null
      }
    }

    const scan = async () => {
      // Stop the loop if already scanned or component unmounted
      if (hasScannedRef.current || !mountedRef.current) {
        return
      }

      // Wait for video to be ready (must have valid dimensions)
      if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        try {
          if (detector) {
            // Native BarcodeDetector — fast, hardware-accelerated
            const barcodes = await detector.detect(canvas)
            if (barcodes.length > 0 && barcodes[0].rawValue) {
              hasScannedRef.current = true
              onScanRef.current(barcodes[0].rawValue)
              return
            }
          } else {
            // Fallback: jsQR for iOS Safari/Firefox
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "dontInvert",
            })
            if (code && code.data) {
              hasScannedRef.current = true
              onScanRef.current(code.data)
              return
            }
          }
        } catch (err) {
          // Detection failed this frame — continue scanning
          console.warn("QR detection error:", err)
        }
      }

      animFrameRef.current = requestAnimationFrame(scan)
    }

    animFrameRef.current = requestAnimationFrame(scan)
  }, [])

  // ── Automatic Stream Attachment ────────────────────────────
  useEffect(() => {
    if (scannerState === 'scanning' && permission === 'granted' && videoRef.current && streamRef.current) {
      const video = videoRef.current
      if (video.srcObject !== streamRef.current) {
        video.srcObject = streamRef.current
        video.play().catch(console.error)

        let started = false
        const onPlaying = () => {
          if (!started) {
            started = true
            startQRDetection()
          }
        }

        video.addEventListener('playing', onPlaying)

        // Fallback in case 'playing' already fired
        setTimeout(() => {
          if (!started && video.readyState === video.HAVE_ENOUGH_DATA) {
            started = true
            startQRDetection()
          }
        }, 500)

        return () => {
          video.removeEventListener('playing', onPlaying)
        }
      }
    }
  }, [scannerState, permission, startQRDetection])

  // ── Lifecycle ──────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    checkPermission()
    return () => {
      mountedRef.current = false
      stopCamera()
    }
  }, [checkPermission, stopCamera])

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className={`relative ${className}`}>
      {/* Hidden canvas for QR detection */}
      <canvas ref={canvasRef} className="hidden" />

      <AnimatePresence mode="wait">
        {/* State: Checking permission */}
        {permission === 'checking' && (
          <motion.div
            key="checking"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-16 text-center"
          >
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-muted-foreground">Checking camera access...</p>
          </motion.div>
        )}

        {/* State: Permission prompt — ask user to grant camera */}
        {(permission === 'prompt' && scannerState !== 'scanning' && scannerState !== 'requesting') && (
          <motion.div
            key="prompt"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center py-10 text-center"
          >
            <motion.div
              className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center mb-6"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <FontAwesomeIcon icon={faCamera} className="w-8 h-8 text-primary" />
            </motion.div>

            <h3 className="text-lg font-bold text-foreground mb-2">
              Camera Permission Required
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-[280px]">
              To scan the QR code for meal check-in, we need access to your camera.
              Your camera is only used for scanning — no images are stored.
            </p>

            <Button
              onClick={startCamera}
              className="gap-2"
            >
              <FontAwesomeIcon icon={faCamera} className="w-4 h-4" />
              Allow Camera Access
            </Button>

            <p className="text-xs text-muted-foreground mt-4 max-w-[260px]">
              A browser permission popup will appear. Tap <strong>&quot;Allow&quot;</strong> to continue.
            </p>
          </motion.div>
        )}

        {/* State: Requesting camera access (waiting for browser prompt) */}
        {scannerState === 'requesting' && (
          <motion.div
            key="requesting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center py-16 text-center"
          >
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-muted-foreground">Waiting for camera permission...</p>
            <p className="text-xs text-muted-foreground mt-2">
              Check for the browser popup asking to allow camera access.
            </p>
          </motion.div>
        )}

        {/* State: Camera denied */}
        {permission === 'denied' && (
          <motion.div
            key="denied"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center py-8 text-center"
          >
            <div className="w-20 h-20 rounded-full bg-red-500/10 border-2 border-red-500/20 flex items-center justify-center mb-5">
              <FontAwesomeIcon icon={faVideoSlash} className="w-8 h-8 text-red-500" />
            </div>

            <h3 className="text-lg font-bold text-foreground mb-2">
              Camera Access Blocked
            </h3>
            <p className="text-sm text-muted-foreground mb-5 max-w-[300px]">
              {errorMessage || 'Camera permission was denied. Please enable it to scan QR codes.'}
            </p>

            {/* Platform-specific instructions */}
            <Card className="w-full max-w-[320px] mb-5">
              <CardContent className="p-4">
                <p className="text-xs font-semibold text-foreground mb-3 uppercase tracking-wider">
                  How to Enable Camera
                </p>
                <div className="space-y-2.5 text-left">
                  <div className="flex gap-2">
                    <span className="text-xs text-muted-foreground shrink-0 font-bold w-14">Chrome</span>
                    <span className="text-xs text-muted-foreground">Tap the lock icon (🔒) in the address bar → Site settings → Camera → Allow</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-xs text-muted-foreground shrink-0 font-bold w-14">Safari</span>
                    <span className="text-xs text-muted-foreground">Settings → Safari → Camera → Allow</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-xs text-muted-foreground shrink-0 font-bold w-14">Android</span>
                    <span className="text-xs text-muted-foreground">Settings → Apps → Browser → Permissions → Camera → Allow</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button onClick={() => { setPermission('prompt'); setScannerState('idle'); setErrorMessage('') }} variant="outline" className="gap-2">
              <FontAwesomeIcon icon={faRotate} className="w-4 h-4" />
              Try Again
            </Button>
          </motion.div>
        )}

        {/* State: Camera unsupported */}
        {permission === 'unsupported' && (
          <motion.div
            key="unsupported"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center py-8 text-center"
          >
            <div className="w-20 h-20 rounded-full bg-amber-500/10 border-2 border-amber-500/20 flex items-center justify-center mb-5">
              <FontAwesomeIcon icon={faTriangleExclamation} className="w-8 h-8 text-amber-500" />
            </div>

            <h3 className="text-lg font-bold text-foreground mb-2">Camera Unavailable</h3>
            <p className="text-sm text-muted-foreground mb-2 max-w-[300px]">
              {errorMessage || 'Camera is not available on this device or browser.'}
            </p>
            <p className="text-xs text-muted-foreground max-w-[280px]">
              You can use <strong>Google Lens</strong> or your phone&apos;s native camera to scan the QR code.
              It will automatically open the check-in page.
            </p>
          </motion.div>
        )}

        {/* State: Scanning — live camera feed */}
        {scannerState === 'scanning' && permission === 'granted' && (
          <motion.div
            key="scanning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative"
          >
            <div className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-black aspect-square max-w-[320px] mx-auto">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Scan overlay with animated corners */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Semi-transparent overlay outside scan area */}
                <div className="absolute inset-0 bg-black/30" />

                {/* Clear scan area in center */}
                <div className="absolute inset-[15%]">
                  <div className="relative w-full h-full">
                    {/* Animated corners */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-primary rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-primary rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-primary rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-primary rounded-br-lg" />

                    {/* Scanning line animation */}
                    <motion.div
                      className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent"
                      animate={{ y: ['0%', '800%', '0%'] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <p className="text-center text-sm text-muted-foreground mt-4">
              Point your camera at the meal check-in QR code
            </p>

            <div className="text-center mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={stopCamera}
                className="text-xs text-muted-foreground"
              >
                Stop Camera
              </Button>
            </div>
          </motion.div>
        )}

        {/* State: General error */}
        {scannerState === 'error' && permission !== 'denied' && permission !== 'unsupported' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center py-8 text-center"
          >
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <FontAwesomeIcon icon={faTriangleExclamation} className="w-7 h-7 text-red-500" />
            </div>

            <h3 className="text-lg font-bold text-foreground mb-2">Scanner Error</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-[300px]">
              {errorMessage || 'An error occurred with the camera.'}
            </p>

            <Button onClick={startCamera} className="gap-2">
              <FontAwesomeIcon icon={faRotate} className="w-4 h-4" />
              Retry
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Type declaration for BarcodeDetector (not yet in TypeScript's lib.dom).
 */
declare global {
  interface BarcodeDetector {
    detect(image: ImageBitmapSource): Promise<Array<{ rawValue: string }>>
  }
  // eslint-disable-next-line no-var
  var BarcodeDetector: {
    new(options?: { formats: string[] }): BarcodeDetector
    getSupportedFormats(): Promise<string[]>
  }
}
=======
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCamera, faTriangleExclamation, faRotate, faVideoSlash } from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type PermissionState = 'prompt' | 'granted' | 'denied' | 'checking' | 'unsupported'
type ScannerState = 'idle' | 'requesting' | 'scanning' | 'error'

interface QRScannerProps {
  /** Called when a QR code is successfully decoded */
  onScan: (data: string) => void
  /** Optional CSS classes for the outer wrapper */
  className?: string
}

/**
 * QR Scanner component with full camera permission lifecycle management.
 *
 * Handles:
 * - Checking permission state before requesting
 * - Prompting users to grant camera access
 * - Detecting when permission is denied/reset and showing recovery instructions
 * - Scanning QR codes via the native BarcodeDetector API (Chrome, Edge, Android)
 * - Graceful fallback message for unsupported browsers (Firefox, older Safari)
 * - Cleaning up camera streams on unmount
 */
export default function QRScanner({ onScan, className = '' }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animFrameRef = useRef<number>(0)
  const hasScannedRef = useRef(false)
  const mountedRef = useRef(true)
  // Ref to always hold the latest onScan callback, avoiding stale closures
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  const [permission, setPermission] = useState<PermissionState>('checking')
  const [scannerState, setScannerState] = useState<ScannerState>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  // ── Permission Detection ───────────────────────────────────
  const checkPermission = useCallback(async () => {
    setPermission('checking')

    // Check if getUserMedia is available (HTTPS required)
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermission('unsupported')
      setErrorMessage(
        window.location.protocol === 'http:'
          ? 'Camera requires HTTPS. Please access this site via a secure connection.'
          : 'Camera is not supported on this device or browser.'
      )
      return
    }

    // Use Permissions API to check state *without* triggering a prompt
    try {
      const result = await navigator.permissions.query({ name: 'camera' as PermissionName })
      const initialState = result.state as PermissionState
      setPermission(initialState)

      // If permission is already granted, start the camera immediately
      if (initialState === 'granted') {
        startCamera()
      }

      // Listen for permission changes (e.g., user resets in browser settings)
      result.addEventListener('change', () => {
        const newState = result.state as PermissionState
        setPermission(newState)

        // If permission was revoked while scanner is active, stop camera
        if (newState === 'denied') {
          stopCamera()
          setScannerState('error')
          setErrorMessage('Camera permission was revoked. Please re-enable it in your browser settings.')
        }

        // If permission was re-granted, auto-restart
        if (newState === 'granted' && scannerState !== 'scanning') {
          startCamera()
        }
      })
    } catch {
      // Permissions API not supported — assume prompt
      setPermission('prompt')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Camera Start / Stop ────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = 0
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const startCamera = useCallback(async () => {
    setScannerState('requesting')
    setErrorMessage('')
    hasScannedRef.current = false

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' }, // Prefer rear camera
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      })

      streamRef.current = stream

      // Guard: if component unmounted while getUserMedia was pending, stop immediately
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      setPermission('granted')

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()

        // Guard: if component unmounted while play() was pending, stop immediately
        if (!mountedRef.current) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        setScannerState('scanning')
        startQRDetection()
      }
    } catch (err: unknown) {
      const error = err as DOMException
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setPermission('denied')
        setScannerState('error')
        setErrorMessage('Camera access was denied. Please allow camera access to scan QR codes.')
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setPermission('unsupported')
        setScannerState('error')
        setErrorMessage('No camera found on this device.')
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        setScannerState('error')
        setErrorMessage('Camera is in use by another app. Please close it and try again.')
      } else {
        setScannerState('error')
        setErrorMessage('Failed to access camera. Please try again.')
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── QR Code Detection Loop ─────────────────────────────────
  const startQRDetection = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    // Try native BarcodeDetector first (Chrome 83+, Edge, Samsung, Android WebView)
    let detector: BarcodeDetector | null = null
    if ('BarcodeDetector' in window) {
      try {
        detector = new BarcodeDetector({ formats: ['qr_code'] })
      } catch {
        detector = null
      }
    }

    const scan = async () => {
      // Stop the loop if already scanned or component unmounted
      if (hasScannedRef.current || !mountedRef.current) {
        return
      }

      // Wait for video to be ready
      if (!video.videoWidth) {
        animFrameRef.current = requestAnimationFrame(scan)
        return
      }

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0)

      try {
        if (detector) {
          // Native BarcodeDetector — fast, hardware-accelerated
          const barcodes = await detector.detect(canvas)
          if (barcodes.length > 0 && barcodes[0].rawValue) {
            hasScannedRef.current = true
            onScanRef.current(barcodes[0].rawValue)
            return
          }
        } else {
          // BarcodeDetector not available (Firefox, older Safari).
          // Stop the scan loop and show a fallback message to the user.
          hasScannedRef.current = true
          stopCamera()
          setScannerState('error')
          setErrorMessage(
            'QR scanning is not supported in this browser. Please use Google Lens or your phone\'s native camera app to scan the QR code instead.'
          )
          return
        }
      } catch {
        // Detection failed this frame — continue scanning
      }

      animFrameRef.current = requestAnimationFrame(scan)
    }

    animFrameRef.current = requestAnimationFrame(scan)
  }, [stopCamera])

  // ── Lifecycle ──────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    checkPermission()
    return () => {
      mountedRef.current = false
      stopCamera()
    }
  }, [checkPermission, stopCamera])

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className={`relative ${className}`}>
      {/* Hidden canvas for QR detection */}
      <canvas ref={canvasRef} className="hidden" />

      <AnimatePresence mode="wait">
        {/* State: Checking permission */}
        {permission === 'checking' && (
          <motion.div
            key="checking"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-16 text-center"
          >
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-muted-foreground">Checking camera access...</p>
          </motion.div>
        )}

        {/* State: Permission prompt — ask user to grant camera */}
        {(permission === 'prompt' && scannerState !== 'scanning' && scannerState !== 'requesting') && (
          <motion.div
            key="prompt"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center py-10 text-center"
          >
            <motion.div
              className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center mb-6"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <FontAwesomeIcon icon={faCamera} className="w-8 h-8 text-primary" />
            </motion.div>

            <h3 className="text-lg font-bold text-foreground mb-2">
              Camera Permission Required
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-[280px]">
              To scan the QR code for meal check-in, we need access to your camera.
              Your camera is only used for scanning — no images are stored.
            </p>

            <Button
              onClick={startCamera}
              className="gap-2"
            >
              <FontAwesomeIcon icon={faCamera} className="w-4 h-4" />
              Allow Camera Access
            </Button>

            <p className="text-xs text-muted-foreground mt-4 max-w-[260px]">
              A browser permission popup will appear. Tap <strong>&quot;Allow&quot;</strong> to continue.
            </p>
          </motion.div>
        )}

        {/* State: Requesting camera access (waiting for browser prompt) */}
        {scannerState === 'requesting' && (
          <motion.div
            key="requesting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center py-16 text-center"
          >
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-muted-foreground">Waiting for camera permission...</p>
            <p className="text-xs text-muted-foreground mt-2">
              Check for the browser popup asking to allow camera access.
            </p>
          </motion.div>
        )}

        {/* State: Camera denied */}
        {permission === 'denied' && (
          <motion.div
            key="denied"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center py-8 text-center"
          >
            <div className="w-20 h-20 rounded-full bg-red-500/10 border-2 border-red-500/20 flex items-center justify-center mb-5">
              <FontAwesomeIcon icon={faVideoSlash} className="w-8 h-8 text-red-500" />
            </div>

            <h3 className="text-lg font-bold text-foreground mb-2">
              Camera Access Blocked
            </h3>
            <p className="text-sm text-muted-foreground mb-5 max-w-[300px]">
              {errorMessage || 'Camera permission was denied. Please enable it to scan QR codes.'}
            </p>

            {/* Platform-specific instructions */}
            <Card className="w-full max-w-[320px] mb-5">
              <CardContent className="p-4">
                <p className="text-xs font-semibold text-foreground mb-3 uppercase tracking-wider">
                  How to Enable Camera
                </p>
                <div className="space-y-2.5 text-left">
                  <div className="flex gap-2">
                    <span className="text-xs text-muted-foreground shrink-0 font-bold w-14">Chrome</span>
                    <span className="text-xs text-muted-foreground">Tap the lock icon (🔒) in the address bar → Site settings → Camera → Allow</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-xs text-muted-foreground shrink-0 font-bold w-14">Safari</span>
                    <span className="text-xs text-muted-foreground">Settings → Safari → Camera → Allow</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-xs text-muted-foreground shrink-0 font-bold w-14">Android</span>
                    <span className="text-xs text-muted-foreground">Settings → Apps → Browser → Permissions → Camera → Allow</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button onClick={() => { setPermission('prompt'); setScannerState('idle'); setErrorMessage('') }} variant="outline" className="gap-2">
              <FontAwesomeIcon icon={faRotate} className="w-4 h-4" />
              Try Again
            </Button>
          </motion.div>
        )}

        {/* State: Camera unsupported */}
        {permission === 'unsupported' && (
          <motion.div
            key="unsupported"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center py-8 text-center"
          >
            <div className="w-20 h-20 rounded-full bg-amber-500/10 border-2 border-amber-500/20 flex items-center justify-center mb-5">
              <FontAwesomeIcon icon={faTriangleExclamation} className="w-8 h-8 text-amber-500" />
            </div>

            <h3 className="text-lg font-bold text-foreground mb-2">Camera Unavailable</h3>
            <p className="text-sm text-muted-foreground mb-2 max-w-[300px]">
              {errorMessage || 'Camera is not available on this device or browser.'}
            </p>
            <p className="text-xs text-muted-foreground max-w-[280px]">
              You can use <strong>Google Lens</strong> or your phone&apos;s native camera to scan the QR code. 
              It will automatically open the check-in page.
            </p>
          </motion.div>
        )}

        {/* State: Scanning — live camera feed */}
        {scannerState === 'scanning' && permission === 'granted' && (
          <motion.div
            key="scanning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative"
          >
            <div className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-black aspect-square max-w-[320px] mx-auto">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Scan overlay with animated corners */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Semi-transparent overlay outside scan area */}
                <div className="absolute inset-0 bg-black/30" />

                {/* Clear scan area in center */}
                <div className="absolute inset-[15%]">
                  <div className="relative w-full h-full">
                    {/* Animated corners */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-primary rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-primary rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-primary rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-primary rounded-br-lg" />

                    {/* Scanning line animation */}
                    <motion.div
                      className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent"
                      animate={{ y: ['0%', '800%', '0%'] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <p className="text-center text-sm text-muted-foreground mt-4">
              Point your camera at the meal check-in QR code
            </p>

            <div className="text-center mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={stopCamera}
                className="text-xs text-muted-foreground"
              >
                Stop Camera
              </Button>
            </div>
          </motion.div>
        )}

        {/* State: General error */}
        {scannerState === 'error' && permission !== 'denied' && permission !== 'unsupported' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center py-8 text-center"
          >
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <FontAwesomeIcon icon={faTriangleExclamation} className="w-7 h-7 text-red-500" />
            </div>

            <h3 className="text-lg font-bold text-foreground mb-2">Scanner Error</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-[300px]">
              {errorMessage || 'An error occurred with the camera.'}
            </p>

            <Button onClick={startCamera} className="gap-2">
              <FontAwesomeIcon icon={faRotate} className="w-4 h-4" />
              Retry
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Type declaration for BarcodeDetector (not yet in TypeScript's lib.dom).
 */
declare global {
  interface BarcodeDetector {
    detect(image: ImageBitmapSource): Promise<Array<{ rawValue: string }>>
  }
  // eslint-disable-next-line no-var
  var BarcodeDetector: {
    new(options?: { formats: string[] }): BarcodeDetector
    getSupportedFormats(): Promise<string[]>
  }
}
>>>>>>> 0200fb90bb8a9c38a8b428bf606ec91468124b07
