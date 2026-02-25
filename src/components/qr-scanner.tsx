'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCamera, faTriangleExclamation, faRotate, faVideoSlash, faCameraRotate } from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import jsQR from 'jsqr'

type PermissionState = 'prompt' | 'granted' | 'denied' | 'checking' | 'unsupported'
type ScannerState = 'idle' | 'requesting' | 'scanning' | 'error'
type FacingMode = 'environment' | 'user'

interface QRScannerProps {
  onScan: (data: string) => void
  className?: string
}

/**
 * QR Scanner with robust camera lifecycle, back-camera default, and flip toggle.
 *
 * Key fixes over previous version:
 * - Stream is attached to <video> directly inside startCamera (no useEffect race)
 * - Uses exact `facingMode` constraint with fallback for devices that don't support it
 * - Adds a round camera-flip button for switching front/back
 * - Waits for video `loadedmetadata` + `play()` before starting QR detection
 */
export default function QRScanner({ onScan, className = '' }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animFrameRef = useRef<number>(0)
  const hasScannedRef = useRef(false)
  const mountedRef = useRef(true)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  const [permission, setPermission] = useState<PermissionState>('checking')
  const [scannerState, setScannerState] = useState<ScannerState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [facing, setFacing] = useState<FacingMode>('environment')
  const [flipping, setFlipping] = useState(false)

  // ── Stop camera helper ─────────────────────────────────────
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

  // ── QR detection loop ──────────────────────────────────────
  const startQRDetection = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    let detector: BarcodeDetector | null = null
    if ('BarcodeDetector' in window) {
      try {
        detector = new BarcodeDetector({ formats: ['qr_code'] })
      } catch {
        detector = null
      }
    }

    const scan = async () => {
      if (hasScannedRef.current || !mountedRef.current) return

      if (video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        try {
          if (detector) {
            const barcodes = await detector.detect(canvas)
            if (barcodes.length > 0 && barcodes[0].rawValue) {
              hasScannedRef.current = true
              onScanRef.current(barcodes[0].rawValue)
              return
            }
          } else {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert',
            })
            if (code?.data) {
              hasScannedRef.current = true
              onScanRef.current(code.data)
              return
            }
          }
        } catch (err) {
          console.warn('QR detection error:', err)
        }
      }

      animFrameRef.current = requestAnimationFrame(scan)
    }

    animFrameRef.current = requestAnimationFrame(scan)
  }, [])

  // ── Start camera — attaches stream directly to video element ──
  const startCamera = useCallback(async (mode: FacingMode = 'environment') => {
    // Stop any existing stream first
    stopCamera()

    setScannerState('requesting')
    setErrorMessage('')
    hasScannedRef.current = false

    try {
      // Try exact facingMode first, then fall back to ideal
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { exact: mode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
      } catch {
        // Exact constraint failed (e.g. desktop with one camera) — try ideal
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
      }

      // Guard: unmounted while awaiting
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      streamRef.current = stream
      setPermission('granted')
      setScannerState('scanning')

      // ── Directly attach stream to the video element ──
      // We wait a microtask to ensure React has rendered the <video> element
      // after setScannerState('scanning') above.
      await new Promise((r) => setTimeout(r, 0))

      const video = videoRef.current
      if (!video || !mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      // Ensure playsinline works on iOS
      video.setAttribute('playsinline', 'true')
      video.setAttribute('autoplay', 'true')
      video.setAttribute('muted', 'true')
      video.srcObject = stream

      // Wait for metadata so videoWidth/Height are available
      await new Promise<void>((resolve) => {
        if (video.readyState >= video.HAVE_METADATA) {
          resolve()
        } else {
          video.addEventListener('loadedmetadata', () => resolve(), { once: true })
        }
      })

      // Play the video — critical on mobile
      await video.play()

      // Start scanning frames
      const canvas = canvasRef.current
      if (canvas && mountedRef.current) {
        startQRDetection(video, canvas)
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return
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
      } else if (error.name === 'OverconstrainedError') {
        setScannerState('error')
        setErrorMessage('Requested camera is not available. Try flipping the camera.')
      } else {
        setScannerState('error')
        setErrorMessage('Failed to access camera. Please try again.')
      }
    }
  }, [stopCamera, startQRDetection])

  // ── Flip camera ────────────────────────────────────────────
  const flipCamera = useCallback(async () => {
    if (flipping) return
    setFlipping(true)
    const newMode: FacingMode = facing === 'environment' ? 'user' : 'environment'
    setFacing(newMode)
    await startCamera(newMode)
    // Small delay so the flip animation completes
    setTimeout(() => setFlipping(false), 300)
  }, [facing, flipping, startCamera])

  // ── Permission check ───────────────────────────────────────
  const checkPermission = useCallback(async () => {
    setPermission('checking')

    if (!navigator.mediaDevices?.getUserMedia) {
      setPermission('unsupported')
      setErrorMessage(
        window.location.protocol === 'http:'
          ? 'Camera requires HTTPS. Please access this site via a secure connection.'
          : 'Camera is not supported on this device or browser.'
      )
      return
    }

    try {
      const result = await navigator.permissions.query({ name: 'camera' as PermissionName })
      const initialState = result.state as PermissionState
      setPermission(initialState)

      if (initialState === 'granted') {
        startCamera('environment')
      }

      result.addEventListener('change', () => {
        if (!mountedRef.current) return
        const newState = result.state as PermissionState
        setPermission(newState)

        if (newState === 'denied') {
          stopCamera()
          setScannerState('error')
          setErrorMessage('Camera permission was revoked. Please re-enable it in your browser settings.')
        }
      })
    } catch {
      setPermission('prompt')
    }
  }, [startCamera, stopCamera])

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
        {/* Checking */}
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

        {/* Prompt */}
        {permission === 'prompt' && scannerState !== 'scanning' && scannerState !== 'requesting' && (
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

            <h3 className="text-lg font-bold text-foreground mb-2">Camera Permission Required</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-[280px]">
              To scan the QR code for meal check-in, we need access to your camera.
              Your camera is only used for scanning — no images are stored.
            </p>

            <Button onClick={() => startCamera('environment')} className="gap-2">
              <FontAwesomeIcon icon={faCamera} className="w-4 h-4" />
              Allow Camera Access
            </Button>

            <p className="text-xs text-muted-foreground mt-4 max-w-[260px]">
              A browser permission popup will appear. Tap <strong>&quot;Allow&quot;</strong> to continue.
            </p>
          </motion.div>
        )}

        {/* Requesting */}
        {scannerState === 'requesting' && (
          <motion.div
            key="requesting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center py-16 text-center"
          >
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-muted-foreground">Starting camera...</p>
          </motion.div>
        )}

        {/* Denied */}
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

            <h3 className="text-lg font-bold text-foreground mb-2">Camera Access Blocked</h3>
            <p className="text-sm text-muted-foreground mb-5 max-w-[300px]">
              {errorMessage || 'Camera permission was denied. Please enable it to scan QR codes.'}
            </p>

            <Card className="w-full max-w-[320px] mb-5">
              <CardContent className="p-4">
                <p className="text-xs font-semibold text-foreground mb-3 uppercase tracking-wider">
                  How to Enable Camera
                </p>
                <div className="space-y-2.5 text-left">
                  <div className="flex gap-2">
                    <span className="text-xs text-muted-foreground shrink-0 font-bold w-14">Chrome</span>
                    <span className="text-xs text-muted-foreground">Tap the lock icon in the address bar &rarr; Site settings &rarr; Camera &rarr; Allow</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-xs text-muted-foreground shrink-0 font-bold w-14">Safari</span>
                    <span className="text-xs text-muted-foreground">Settings &rarr; Safari &rarr; Camera &rarr; Allow</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-xs text-muted-foreground shrink-0 font-bold w-14">Android</span>
                    <span className="text-xs text-muted-foreground">Settings &rarr; Apps &rarr; Browser &rarr; Permissions &rarr; Camera &rarr; Allow</span>
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

        {/* Unsupported */}
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

        {/* Scanning — live camera feed */}
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

              {/* Scan overlay */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-black/30" />
                <div className="absolute inset-[15%]">
                  <div className="relative w-full h-full">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-primary rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-primary rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-primary rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-primary rounded-br-lg" />
                    <motion.div
                      className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent"
                      animate={{ y: ['0%', '800%', '0%'] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </div>
                </div>
              </div>

              {/* ── Camera flip button (bottom-right of viewfinder) ── */}
              <motion.button
                type="button"
                onClick={flipCamera}
                disabled={flipping}
                className="absolute bottom-3 right-3 z-10 w-11 h-11 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white shadow-lg active:scale-90 transition-transform disabled:opacity-50"
                whileTap={{ scale: 0.85 }}
                aria-label="Switch camera"
              >
                <motion.div
                  animate={flipping ? { rotate: 180 } : { rotate: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                >
                  <FontAwesomeIcon icon={faCameraRotate} className="w-5 h-5" />
                </motion.div>
              </motion.button>
            </div>

            <p className="text-center text-sm text-muted-foreground mt-4">
              Point your camera at the meal check-in QR code
            </p>

            <div className="text-center mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { stopCamera(); setScannerState('idle'); setPermission('granted') }}
                className="text-xs text-muted-foreground"
              >
                Stop Camera
              </Button>
            </div>
          </motion.div>
        )}

        {/* Error */}
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

            <Button onClick={() => startCamera(facing)} className="gap-2">
              <FontAwesomeIcon icon={faRotate} className="w-4 h-4" />
              Retry
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

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