"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface StarRatingProps {
  /** Current rating value (1-5) */
  value: number
  /** Called when user selects a rating */
  onChange?: (value: number) => void
  /** Number of stars */
  maxStars?: number
  /** Star size in pixels */
  size?: number
  /** Whether user can interact */
  interactive?: boolean
  /** Enable glow effect on filled stars */
  enableGlow?: boolean
  /** Glow blur radius */
  glowIntensity?: number
  /** Optional label displayed below stars */
  label?: string
  className?: string
}

const STAR_PATH =
  "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"

const springTransition = {
  type: "spring" as const,
  stiffness: 400,
  damping: 17,
}

export function StarRating({
  value,
  onChange,
  maxStars = 5,
  size = 36,
  interactive = true,
  enableGlow = true,
  glowIntensity = 6,
  label,
  className,
}: StarRatingProps) {
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null)

  const displayValue = hoverIndex !== null ? hoverIndex : value

  return (
    <div className={cn("flex flex-col items-start gap-1.5", className)}>
      <div
        className="flex items-center gap-1"
        onMouseLeave={() => interactive && setHoverIndex(null)}
        role="radiogroup"
        aria-label="Star rating"
      >
        {Array.from({ length: maxStars }, (_, i) => {
          const starValue = i + 1
          const isFilled = starValue <= displayValue
          const isHovering = hoverIndex !== null && starValue <= hoverIndex

          return (
            <motion.button
              key={i}
              type="button"
              disabled={!interactive}
              onClick={() => {
                if (!interactive) return
                onChange?.(starValue)
              }}
              onMouseEnter={() => interactive && setHoverIndex(starValue)}
              onTouchStart={() => {
                if (!interactive) return
                setHoverIndex(starValue)
              }}
              onTouchEnd={() => {
                if (!interactive) return
                onChange?.(starValue)
                setHoverIndex(null)
              }}
              whileHover={interactive ? { scale: 1.2 } : undefined}
              whileTap={interactive ? { scale: 0.9 } : undefined}
              animate={{
                scale: isHovering ? 1.15 : 1,
              }}
              transition={springTransition}
              className={cn(
                "relative p-0.5 bg-transparent border-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-sm",
                interactive ? "cursor-pointer" : "cursor-default",
              )}
              aria-label={`${starValue} star${starValue > 1 ? "s" : ""}`}
              aria-checked={value === starValue}
              role="radio"
            >
              <motion.svg
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                animate={{
                  scale: isFilled ? [1, 1.15, 1] : 1,
                }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                style={{
                  filter:
                    isFilled && enableGlow
                      ? `drop-shadow(0 0 ${glowIntensity}px hsl(var(--primary) / 0.5))`
                      : "none",
                }}
              >
                <path
                  d={STAR_PATH}
                  fill={isFilled ? "hsl(var(--primary))" : "hsl(var(--muted))"}
                  stroke={isFilled ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.3)"}
                  strokeWidth="0.5"
                  strokeLinejoin="round"
                />
              </motion.svg>
            </motion.button>
          )
        })}
      </div>

      {label && (
        <motion.span
          key={label}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs font-medium text-muted-foreground ml-0.5 select-none"
        >
          {label}
        </motion.span>
      )}
    </div>
  )
}
