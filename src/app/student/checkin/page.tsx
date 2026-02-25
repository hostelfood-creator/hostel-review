'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faUtensils, faClock, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BlurFade } from '@/components/ui/blur-fade'

type CheckinState = 'loading' | 'checking-in' | 'success' | 'already' | 'no-meal' | 'error'

interface CheckinResult {
  success: boolean
  alreadyCheckedIn: boolean
  mealType: string
  mealLabel: string
  date: string
  message: string
  userName?: string
}

// Floating particle component for the celebration effect
function Particle({ delay, x, y }: { delay: number; x: number; y: number }) {
  return (
    <motion.div
      className="absolute w-2 h-2 rounded-full"
      style={{
        background: `hsl(${Math.random() * 60 + 120}, 80%, 60%)`,
        left: '50%',
        top: '50%',
      }}
      initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
      animate={{
        opacity: [0, 1, 1, 0],
        scale: [0, 1.5, 1, 0],
        x: x,
        y: y,
      }}
      transition={{
        duration: 1.4,
        delay,
        ease: 'easeOut',
      }}
    />
  )
}

export default function CheckinPage() {
  const router = useRouter()
  const [state, setState] = useState<CheckinState>('loading')
  const [result, setResult] = useState<CheckinResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [currentTime, setCurrentTime] = useState('')
  const [mealWindows, setMealWindows] = useState<Record<string, string> | null>(null)

  // Generate particles for celebration effect
  const particles = Array.from({ length: 16 }, (_, i) => ({
    id: i,
    delay: Math.random() * 0.5,
    x: (Math.random() - 0.5) * 200,
    y: (Math.random() - 0.5) * 200,
  }))

  const performCheckin = useCallback(async () => {
    setState('checking-in')
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await res.json()

      if (res.status === 401) {
        // Not logged in — redirect to login with return URL
        router.push('/login?redirect=/student/checkin')
        return
      }

      if (res.status === 400 && data.mealWindows) {
        setState('no-meal')
        setMealWindows(data.mealWindows)
        setErrorMsg(data.message || 'No meal is currently being served.')
        return
      }

      if (!res.ok) {
        setState('error')
        setErrorMsg(data.error || 'Something went wrong.')
        return
      }

      setResult(data)
      setState(data.alreadyCheckedIn ? 'already' : 'success')
    } catch {
      setState('error')
      setErrorMsg('Network error. Please check your connection.')
    }
  }, [router])

  useEffect(() => {
    performCheckin()
  }, [performCheckin])

  // Update time display
  useEffect(() => {
    const update = () => {
      const now = new Date()
      setCurrentTime(
        now.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      )
    }
    update()
    const timer = setInterval(update, 30000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          {/* Loading / Checking in state */}
          {(state === 'loading' || state === 'checking-in') && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center"
            >
              <div className="mb-6">
                <motion.div
                  className="w-20 h-20 mx-auto rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                >
                  <FontAwesomeIcon
                    icon={faUtensils}
                    className="w-8 h-8 text-primary"
                  />
                </motion.div>
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">
                Checking you in...
              </h2>
              <p className="text-sm text-muted-foreground">
                Verifying your meal attendance
              </p>
              <div className="mt-4">
                <div className="w-8 h-8 mx-auto border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            </motion.div>
          )}

          {/* Success state — Premium green checkmark */}
          {state === 'success' && result && (
            <motion.div
              key="success"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <Card className="border-green-200 dark:border-green-500/30 shadow-xl shadow-green-500/10 overflow-visible">
                <CardContent className="p-8 relative">
                  {/* Celebration particles */}
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {particles.map((p) => (
                      <Particle key={p.id} delay={p.delay} x={p.x} y={p.y} />
                    ))}
                  </div>

                  {/* Green checkmark circle */}
                  <motion.div
                    className="relative mx-auto mb-6"
                    style={{ width: 96, height: 96 }}
                  >
                    {/* Outer ring animation */}
                    <motion.div
                      className="absolute inset-0 rounded-full border-4 border-green-400 dark:border-green-500"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{
                        type: 'spring',
                        stiffness: 200,
                        damping: 15,
                        delay: 0.1,
                      }}
                    />

                    {/* Inner filled circle */}
                    <motion.div
                      className="absolute inset-1.5 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 dark:from-green-500 dark:to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/30"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{
                        type: 'spring',
                        stiffness: 200,
                        damping: 12,
                        delay: 0.2,
                      }}
                    >
                      {/* Checkmark icon */}
                      <motion.div
                        initial={{ scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{
                          type: 'spring',
                          stiffness: 300,
                          damping: 15,
                          delay: 0.4,
                        }}
                      >
                        <FontAwesomeIcon
                          icon={faCheck}
                          className="w-10 h-10 text-white"
                        />
                      </motion.div>
                    </motion.div>

                    {/* Pulse ring */}
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-green-400/50"
                      initial={{ scale: 0.8, opacity: 1 }}
                      animate={{ scale: 1.6, opacity: 0 }}
                      transition={{
                        duration: 1,
                        delay: 0.5,
                        ease: 'easeOut',
                      }}
                    />
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-green-400/30"
                      initial={{ scale: 0.8, opacity: 1 }}
                      animate={{ scale: 2, opacity: 0 }}
                      transition={{
                        duration: 1.2,
                        delay: 0.6,
                        ease: 'easeOut',
                      }}
                    />
                  </motion.div>

                  {/* Success text */}
                  <BlurFade delay={0.5} inView>
                    <h2 className="text-2xl font-black text-foreground tracking-tight mb-1">
                      Checked In!
                    </h2>
                  </BlurFade>

                  <BlurFade delay={0.6} inView>
                    <p className="text-green-600 dark:text-green-400 font-semibold text-lg">
                      {result.mealLabel}
                    </p>
                  </BlurFade>

                  <BlurFade delay={0.7} inView>
                    <div className="mt-4 space-y-2">
                      {result.userName && (
                        <p className="text-sm text-muted-foreground">
                          Welcome,{' '}
                          <span className="text-foreground font-medium">
                            {result.userName}
                          </span>
                        </p>
                      )}
                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <FontAwesomeIcon icon={faClock} className="w-3 h-3" />
                        <span>{currentTime}</span>
                        <span className="text-border">•</span>
                        <span>{result.date}</span>
                      </div>
                    </div>
                  </BlurFade>

                  <BlurFade delay={0.8} inView>
                    <div className="mt-6 p-3 rounded-xl bg-green-50 dark:bg-green-500/5 border border-green-200 dark:border-green-500/20">
                      <p className="text-xs text-green-700 dark:text-green-400 font-medium">
                        Your attendance has been recorded. Enjoy your meal!
                      </p>
                    </div>
                  </BlurFade>
                </CardContent>
              </Card>

              <BlurFade delay={1} inView>
                <Button
                  variant="ghost"
                  className="mt-6 text-muted-foreground"
                  onClick={() => router.push('/student')}
                >
                  Go to Dashboard
                </Button>
              </BlurFade>
            </motion.div>
          )}

          {/* Already checked in state */}
          {state === 'already' && result && (
            <motion.div
              key="already"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <Card className="border-blue-200 dark:border-blue-500/30 shadow-lg">
                <CardContent className="p-8">
                  <motion.div
                    className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/20"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  >
                    <FontAwesomeIcon
                      icon={faCheck}
                      className="w-9 h-9 text-white"
                    />
                  </motion.div>

                  <BlurFade delay={0.3} inView>
                    <h2 className="text-2xl font-black text-foreground tracking-tight mb-1">
                      Already Checked In
                    </h2>
                  </BlurFade>

                  <BlurFade delay={0.4} inView>
                    <p className="text-blue-600 dark:text-blue-400 font-semibold text-lg">
                      {result.mealLabel}
                    </p>
                  </BlurFade>

                  <BlurFade delay={0.5} inView>
                    <div className="mt-4">
                      <p className="text-sm text-muted-foreground">
                        You&apos;ve already checked in for this meal today.
                      </p>
                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-2">
                        <FontAwesomeIcon icon={faClock} className="w-3 h-3" />
                        <span>{currentTime}</span>
                        <span className="text-border">•</span>
                        <span>{result.date}</span>
                      </div>
                    </div>
                  </BlurFade>
                </CardContent>
              </Card>

              <Button
                variant="ghost"
                className="mt-6 text-muted-foreground"
                onClick={() => router.push('/student')}
              >
                Go to Dashboard
              </Button>
            </motion.div>
          )}

          {/* No meal currently active */}
          {state === 'no-meal' && (
            <motion.div
              key="no-meal"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <Card className="border-amber-200 dark:border-amber-500/30 shadow-lg">
                <CardContent className="p-8">
                  <motion.div
                    className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center shadow-lg shadow-amber-500/20"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  >
                    <FontAwesomeIcon
                      icon={faClock}
                      className="w-9 h-9 text-white"
                    />
                  </motion.div>

                  <BlurFade delay={0.3} inView>
                    <h2 className="text-xl font-bold text-foreground mb-2">
                      No Meal in Progress
                    </h2>
                  </BlurFade>

                  <BlurFade delay={0.4} inView>
                    <p className="text-sm text-muted-foreground mb-4">
                      {errorMsg}
                    </p>
                  </BlurFade>

                  <BlurFade delay={0.5} inView>
                    <div className="space-y-2 text-left max-w-xs mx-auto">
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">
                        Meal Schedule
                      </p>
                      {(mealWindows
                        ? Object.entries(mealWindows).map(([key, time]) => ({
                            meal: key.charAt(0).toUpperCase() + key.slice(1),
                            time: time as string,
                          }))
                        : [
                            { meal: 'Breakfast', time: '7:00 – 10:00 AM' },
                            { meal: 'Lunch', time: '12:00 – 3:00 PM' },
                            { meal: 'Snacks', time: '4:00 – 6:00 PM' },
                            { meal: 'Dinner', time: '7:00 – 10:00 PM' },
                          ]
                      ).map((item) => (
                        <div
                          key={item.meal}
                          className="flex justify-between items-center py-1.5 px-3 rounded-lg bg-muted/50"
                        >
                          <span className="text-sm font-medium text-foreground">
                            {item.meal}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {item.time}
                          </span>
                        </div>
                      ))}
                    </div>
                  </BlurFade>
                </CardContent>
              </Card>

              <Button
                variant="ghost"
                className="mt-6 text-muted-foreground"
                onClick={() => router.push('/student')}
              >
                Go to Dashboard
              </Button>
            </motion.div>
          )}

          {/* Error state */}
          {state === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <Card className="border-red-200 dark:border-red-500/30 shadow-lg">
                <CardContent className="p-8">
                  <motion.div
                    className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-red-400 to-red-500 flex items-center justify-center shadow-lg shadow-red-500/20"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  >
                    <FontAwesomeIcon
                      icon={faTriangleExclamation}
                      className="w-9 h-9 text-white"
                    />
                  </motion.div>

                  <h2 className="text-xl font-bold text-foreground mb-2">
                    Check-in Failed
                  </h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    {errorMsg}
                  </p>

                  <Button onClick={performCheckin} className="mt-2">
                    Try Again
                  </Button>
                </CardContent>
              </Card>

              <Button
                variant="ghost"
                className="mt-4 text-muted-foreground"
                onClick={() => router.push('/student')}
              >
                Go to Dashboard
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
