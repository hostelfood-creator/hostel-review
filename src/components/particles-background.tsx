'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'

/**
 * Floating animated particles background.
 * Uses a deterministic pseudo-random generator for SSR/client consistency.
 */
export default function ParticlesBackground() {
  const particles = useMemo(() => {
    const seed = 42
    const mulberry32 = (s: number) => () => {
      s |= 0
      s = (s + 0x6d2b79f5) | 0
      let t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const rand = mulberry32(seed)
    return Array.from({ length: 18 }, (_, i) => ({
      id: i,
      x: rand() * 100,
      y: rand() * 100,
      size: 4 + rand() * 10,
      duration: 12 + rand() * 20,
      delay: rand() * -20,
      dx: (rand() - 0.5) * 30,
      dy: (rand() - 0.5) * 30,
      opacity: 0.1 + rand() * 0.18,
    }))
  }, [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-primary/20 dark:bg-primary/15"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size }}
          animate={{
            x: [0, p.dx, -p.dx * 0.6, 0],
            y: [0, p.dy, -p.dy * 0.8, 0],
            scale: [1, 1.3, 0.85, 1],
            opacity: [p.opacity, p.opacity * 1.5, p.opacity * 0.6, p.opacity],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: p.delay,
          }}
        />
      ))}
    </div>
  )
}
