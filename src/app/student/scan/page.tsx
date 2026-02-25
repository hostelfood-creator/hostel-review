'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faQrcode, faCamera, faArrowLeft, faUpRightFromSquare } from '@fortawesome/free-solid-svg-icons'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BlurFade } from '@/components/ui/blur-fade'
import QRScanner from '@/components/qr-scanner'

type ScanPageState = 'intro' | 'scanning' | 'processing' | 'invalid'

export default function ScanPage() {
  const router = useRouter()
  const [pageState, setPageState] = useState<ScanPageState>('intro')
  const [invalidUrl, setInvalidUrl] = useState('')

  /**
   * Handle a successfully decoded QR code.
   * Validates that the URL points to our check-in page and navigates there.
   */
  const handleScan = useCallback((data: string) => {
    setPageState('processing')

    try {
      // Normalize: support both full URLs and relative paths
      let targetPath = data.trim()

      // If it's a full URL, extract the pathname
      if (targetPath.startsWith('http://') || targetPath.startsWith('https://')) {
        const url = new URL(targetPath)

        // Security: only allow same-origin URLs or our known check-in path
        const currentOrigin = window.location.origin
        if (url.origin !== currentOrigin) {
          // External URL — block navigation for security
          setInvalidUrl(targetPath)
          setPageState('invalid')
          return
        }

        targetPath = url.pathname
      }

      // Validate the path is a legitimate check-in route
      if (targetPath === '/student/checkin' || targetPath.startsWith('/student/checkin?')) {
        // Valid check-in QR — navigate to the check-in page
        router.push(targetPath)
      } else {
        // Not a check-in QR code
        setInvalidUrl(data)
        setPageState('invalid')
      }
    } catch {
      // Malformed URL or data
      setInvalidUrl(data)
      setPageState('invalid')
    }
  }, [router])

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          {/* Intro — Prompt to start scanning */}
          {pageState === 'intro' && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center"
            >
              <BlurFade delay={0.1} inView>
                <motion.div
                  className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-primary/10 border-2 border-primary/20 flex items-center justify-center"
                  animate={{ scale: [1, 1.03, 1] }}
                  transition={{ repeat: Infinity, duration: 2.5 }}
                >
                  <FontAwesomeIcon icon={faQrcode} className="w-10 h-10 text-primary" />
                </motion.div>
              </BlurFade>

              <BlurFade delay={0.2} inView>
                <h2 className="text-2xl font-black text-foreground tracking-tight mb-2">
                  Meal Check-In
                </h2>
                <p className="text-sm text-muted-foreground mb-8 max-w-[280px] mx-auto">
                  Scan the QR code displayed at the dining hall to mark your attendance.
                </p>
              </BlurFade>

              <BlurFade delay={0.3} inView>
                <Button
                  size="lg"
                  onClick={() => setPageState('scanning')}
                  className="gap-2.5 px-8 py-6 text-base rounded-xl shadow-lg shadow-primary/20"
                >
                  <FontAwesomeIcon icon={faCamera} className="w-5 h-5" />
                  Open Scanner
                </Button>
              </BlurFade>

              <BlurFade delay={0.4} inView>
                <div className="mt-8">
                  <Card className="border-dashed">
                    <CardContent className="p-4">
                      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                        Alternative Methods
                      </p>
                      <div className="space-y-2 text-left">
                        <div className="flex items-start gap-2.5">
                          <FontAwesomeIcon icon={faUpRightFromSquare} className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          <p className="text-xs text-muted-foreground">
                            Use <strong>Google Lens</strong> or your phone&apos;s native camera to scan — it will open check-in automatically.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </BlurFade>

              <BlurFade delay={0.5} inView>
                <Button
                  variant="ghost"
                  className="mt-6 text-muted-foreground"
                  onClick={() => router.push('/student')}
                >
                  <FontAwesomeIcon icon={faArrowLeft} className="w-3.5 h-3.5 mr-2" />
                  Back to Dashboard
                </Button>
              </BlurFade>
            </motion.div>
          )}

          {/* Scanning — live camera */}
          {pageState === 'scanning' && (
            <motion.div
              key="scanning"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="text-center mb-4">
                <h3 className="text-lg font-bold text-foreground">Scan QR Code</h3>
                <p className="text-xs text-muted-foreground">
                  Point at the dining hall QR code
                </p>
              </div>

              <QRScanner onScan={handleScan} />

              <div className="text-center mt-4">
                <Button
                  variant="ghost"
                  onClick={() => setPageState('intro')}
                  className="text-muted-foreground"
                >
                  <FontAwesomeIcon icon={faArrowLeft} className="w-3.5 h-3.5 mr-2" />
                  Go Back
                </Button>
              </div>
            </motion.div>
          )}

          {/* Processing — brief transition */}
          {pageState === 'processing' && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-16"
            >
              <div className="w-8 h-8 mx-auto border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm text-muted-foreground">Processing QR code...</p>
            </motion.div>
          )}

          {/* Invalid QR code */}
          {pageState === 'invalid' && (
            <motion.div
              key="invalid"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <Card className="border-amber-200 dark:border-amber-500/30">
                <CardContent className="p-8">
                  <motion.div
                    className="w-20 h-20 mx-auto mb-6 rounded-full bg-amber-500/10 border-2 border-amber-500/20 flex items-center justify-center"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  >
                    <FontAwesomeIcon icon={faQrcode} className="w-9 h-9 text-amber-500" />
                  </motion.div>

                  <h3 className="text-lg font-bold text-foreground mb-2">
                    Invalid QR Code
                  </h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    This QR code is not a valid meal check-in code.
                  </p>
                  {invalidUrl && (
                    <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2 break-all font-mono">
                      {invalidUrl.length > 100 ? invalidUrl.slice(0, 100) + '...' : invalidUrl}
                    </p>
                  )}
                </CardContent>
              </Card>

              <div className="flex gap-2 justify-center mt-6">
                <Button onClick={() => setPageState('scanning')} className="gap-2">
                  <FontAwesomeIcon icon={faCamera} className="w-4 h-4" />
                  Scan Again
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => router.push('/student')}
                  className="text-muted-foreground"
                >
                  Dashboard
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
