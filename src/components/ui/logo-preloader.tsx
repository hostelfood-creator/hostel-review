'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

interface LogoPreloaderProps {
    /** Duration in seconds before the logo starts exiting */
    duration?: number
    /** Logo size in pixels */
    logoSize?: number
    /** Callback when preloader animation completes */
    onComplete?: () => void
}

/**
 * LogoPreloader — Framer-style preloader with SCSVMV university logo.
 * 
 * Phases:
 * 1. init    — logo is below and invisible
 * 2. loading — logo slides up to center, fully visible
 * 3. logoOut — logo slides up and fades, background starts fading
 * 4. done    — component unmounts
 */
export function LogoPreloader({
    duration = 2,
    logoSize = 120,
    onComplete,
}: LogoPreloaderProps) {
    const [phase, setPhase] = useState<'init' | 'loading' | 'logoOut' | 'done'>('init')

    useEffect(() => {
        // Phase 1: Start loading animation after a tick
        const t0 = setTimeout(() => setPhase('loading'), 50)

        // Phase 2: Start logo exit after duration
        const t1 = setTimeout(() => setPhase('logoOut'), duration * 1000 + 50)

        // Phase 3: Mark as done
        const t2 = setTimeout(() => {
            setPhase('done')
            onComplete?.()
        }, duration * 1000 + 800)

        return () => {
            clearTimeout(t0)
            clearTimeout(t1)
            clearTimeout(t2)
        }
    }, [duration, onComplete])

    if (phase === 'done') return null

    // Animation values based on phase
    let logoTranslateY = 0
    let logoOpacity = 1
    let logoScale = 1

    if (phase === 'init') {
        logoTranslateY = 60
        logoOpacity = 0
        logoScale = 0.8
    } else if (phase === 'loading') {
        logoTranslateY = 0
        logoOpacity = 1
        logoScale = 1
    } else if (phase === 'logoOut') {
        logoTranslateY = -60
        logoOpacity = 0
        logoScale = 0.9
    }

    const bgOpacity = phase === 'logoOut' ? 0 : 1

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 99999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'opacity 0.7s cubic-bezier(.7,.2,.2,1)',
                opacity: bgOpacity,
                pointerEvents: phase === 'logoOut' ? 'none' : 'all',
            }}
            className="bg-background"
            aria-label="Loading"
            role="status"
        >
            {/* Subtle radial glow behind logo */}
            <div
                className="absolute w-64 h-64 rounded-full opacity-20"
                style={{
                    background: 'radial-gradient(circle, hsl(45 93% 47% / 0.3) 0%, transparent 70%)',
                    transition: 'opacity 0.7s cubic-bezier(.7,.2,.2,1)',
                    opacity: phase === 'loading' ? 0.3 : 0,
                }}
            />

            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '20px',
                    transition: 'all 0.7s cubic-bezier(.7,.2,.2,1)',
                    transform: `translateY(${logoTranslateY}px) scale(${logoScale})`,
                    opacity: logoOpacity,
                    willChange: 'transform, opacity',
                }}
            >
                <Image
                    src="/scsvmv-logo.png"
                    alt="SCSVMV University"
                    width={logoSize}
                    height={logoSize}
                    priority
                    style={{
                        objectFit: 'contain',
                        userSelect: 'none',
                    }}
                    draggable={false}
                />
                <div
                    style={{
                        transition: 'opacity 0.5s ease',
                        opacity: phase === 'loading' ? 1 : 0,
                        transitionDelay: phase === 'loading' ? '0.3s' : '0s',
                    }}
                    className="flex flex-col items-center gap-2"
                >
                    <span className="text-sm font-semibold text-foreground tracking-wider uppercase">
                        Hostel Food Review
                    </span>
                    {/* Loading dots animation */}
                    <div className="flex gap-1.5">
                        {[0, 1, 2].map((i) => (
                            <span
                                key={i}
                                className="w-1.5 h-1.5 rounded-full bg-primary"
                                style={{
                                    animation: 'preloaderDot 1.2s infinite ease-in-out',
                                    animationDelay: `${i * 0.2}s`,
                                }}
                            />
                        ))}
                    </div>
                </div>
            </div>

            <style jsx>{`
        @keyframes preloaderDot {
          0%, 80%, 100% {
            transform: scale(0.4);
            opacity: 0.3;
          }
          40% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
        </div>
    )
}
