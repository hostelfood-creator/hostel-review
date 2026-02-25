"use client"

import { forwardRef, useRef } from "react"
import {
    motion,
    useInView,
    type UseInViewOptions,
    type Variants,
} from "framer-motion"

type MarginType = UseInViewOptions["margin"]

interface BlurFadeProps {
    children: React.ReactNode
    className?: string
    variant?: {
        hidden: { y: number }
        visible: { y: number }
    }
    duration?: number
    delay?: number
    yOffset?: number
    inView?: boolean
    inViewMargin?: MarginType
    blur?: string
}

export const BlurFade = forwardRef<HTMLDivElement, BlurFadeProps>(({
    children,
    className,
    variant,
    duration = 0.4,
    delay = 0,
    yOffset = 6,
    inView = false,
    inViewMargin = "-50px",
    blur = "6px",
}, externalRef) => {
    const internalRef = useRef<HTMLDivElement>(null)
    const ref = (externalRef as React.RefObject<HTMLDivElement>) || internalRef
    const inViewResult = useInView(ref, { once: true, margin: inViewMargin })
    const isInView = !inView || inViewResult
    const defaultVariants: Variants = {
        hidden: { y: yOffset, opacity: 0, filter: `blur(${blur})` },
        visible: { y: 0, opacity: 1, filter: `blur(0px)` },
    }
    const combinedVariants = variant || defaultVariants
    return (
        <motion.div
            ref={ref}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            exit="hidden"
            variants={combinedVariants}
            transition={{
                delay: 0.04 + delay,
                duration,
                ease: "easeOut",
            }}
            className={className}
        >
            {children}
        </motion.div>
    )
})
BlurFade.displayName = "BlurFade"
