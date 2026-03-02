'use client'

import { useCallback, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
}

/**
 * Mobile-friendly bottom sheet modal with drag-to-dismiss.
 * Slides up from the bottom with a backdrop overlay.
 */
export function BottomSheet({ open, onClose, children, title }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const startY = useRef(0)
  const currentY = useRef(0)

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY
    currentY.current = 0
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const delta = e.touches[0].clientY - startY.current
    if (delta > 0 && sheetRef.current) {
      currentY.current = delta
      sheetRef.current.style.transform = `translateY(${delta}px)`
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (currentY.current > 100) {
      onClose()
    } else if (sheetRef.current) {
      sheetRef.current.style.transform = 'translateY(0)'
    }
    currentY.current = 0
  }, [onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 cursor-grab">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
            </div>

            {/* Title */}
            {title && (
              <div className="px-5 pb-3 border-b">
                <h3 className="text-base font-bold text-foreground">{title}</h3>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
