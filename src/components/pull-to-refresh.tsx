'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useTransform } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowsRotate } from '@fortawesome/free-solid-svg-icons'

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: React.ReactNode
}

const THRESHOLD = 80
const MAX_PULL = 120

/**
 * Pull-to-refresh wrapper component for mobile touch gestures.
 * Activates only when the page is scrolled to the top.
 */
export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [refreshing, setRefreshing] = useState(false)
  const [pulling, setPulling] = useState(false)
  const pullDistance = useMotionValue(0)
  const startY = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const opacity = useTransform(pullDistance, [0, THRESHOLD], [0, 1])
  const rotate = useTransform(pullDistance, [0, THRESHOLD], [0, 180])
  const scale = useTransform(pullDistance, [0, THRESHOLD / 2, THRESHOLD], [0.5, 0.8, 1])

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (refreshing) return
    // Only activate if scrolled to top
    if (window.scrollY <= 0) {
      startY.current = e.touches[0].clientY
      setPulling(true)
    }
  }, [refreshing])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!pulling || refreshing) return
    const deltaY = e.touches[0].clientY - startY.current
    if (deltaY > 0) {
      const distance = Math.min(deltaY * 0.5, MAX_PULL)
      pullDistance.set(distance)
      // Prevent default scrolling while pulling
      if (distance > 10) {
        e.preventDefault()
      }
    }
  }, [pulling, refreshing, pullDistance])

  const handleTouchEnd = useCallback(async () => {
    if (!pulling) return
    const currentPull = pullDistance.get()
    if (currentPull >= THRESHOLD && !refreshing) {
      setRefreshing(true)
      pullDistance.set(THRESHOLD / 2)
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
      }
    }
    pullDistance.set(0)
    setPulling(false)
  }, [pulling, pullDistance, refreshing, onRefresh])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  return (
    <div ref={containerRef} className="relative">
      {/* Pull indicator */}
      <motion.div
        className="absolute top-0 left-0 right-0 flex items-center justify-center z-10 pointer-events-none"
        style={{ height: pullDistance, opacity }}
      >
        <motion.div
          style={{ scale, rotate: refreshing ? undefined : rotate }}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary"
          animate={refreshing ? { rotate: 360 } : undefined}
          transition={refreshing ? { repeat: Infinity, duration: 0.8, ease: 'linear' } : undefined}
        >
          <FontAwesomeIcon icon={faArrowsRotate} className="w-5 h-5" />
        </motion.div>
      </motion.div>

      {/* Content with translate */}
      <motion.div style={{ y: pullDistance }}>
        {children}
      </motion.div>
    </div>
  )
}
