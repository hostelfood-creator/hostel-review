'use client'

import { useRef, KeyboardEvent, ClipboardEvent } from 'react'

interface OtpInputProps {
    value: string
    onChange: (val: string) => void
    length?: number
    disabled?: boolean
    error?: boolean
}

export function OtpInput({ value, onChange, length = 6, disabled = false, error = false }: OtpInputProps) {
    const inputs = useRef<(HTMLInputElement | null)[]>([])

    const digits = value.split('').concat(Array(length).fill('')).slice(0, length)

    const focusNext = (idx: number) => {
        if (idx < length - 1) inputs.current[idx + 1]?.focus()
    }

    const focusPrev = (idx: number) => {
        if (idx > 0) inputs.current[idx - 1]?.focus()
    }

    const handleChange = (idx: number, char: string) => {
        const digit = char.replace(/\D/g, '').slice(-1)
        const next = digits.slice()
        next[idx] = digit
        onChange(next.join(''))
        if (digit) focusNext(idx)
    }

    const handleKeyDown = (idx: number, e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace') {
            e.preventDefault()
            const next = digits.slice()
            if (next[idx]) {
                next[idx] = ''
                onChange(next.join(''))
            } else {
                focusPrev(idx)
                const prev = digits.slice()
                if (idx > 0) prev[idx - 1] = ''
                onChange(prev.join(''))
            }
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault()
            focusPrev(idx)
        } else if (e.key === 'ArrowRight') {
            e.preventDefault()
            focusNext(idx)
        }
    }

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault()
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
        onChange(pasted.padEnd(length, '').slice(0, length))
        const lastFilled = Math.min(pasted.length, length - 1)
        inputs.current[lastFilled]?.focus()
    }

    return (
        <div className="flex gap-2.5 justify-center py-1">
            {digits.map((digit, idx) => (
                <input
                    key={idx}
                    ref={(el) => { inputs.current[idx] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    disabled={disabled}
                    onChange={(e) => handleChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    onPaste={handlePaste}
                    onFocus={(e) => e.target.select()}
                    className={[
                        // Size & shape — compact, professional
                        'w-11 h-13 text-center text-lg font-bold rounded-lg border-2',
                        // Typography
                        'font-mono outline-none',
                        // Smooth transitions
                        'transition-all duration-150',
                        // Background: transparent, adapts to card surface
                        'bg-background',
                        // Focus ring
                        'focus:ring-2 focus:scale-105',
                        // State: error
                        error
                            ? 'border-destructive text-destructive focus:border-destructive focus:ring-destructive/25'
                            // State: filled digit
                            : digit
                                ? 'border-primary text-primary focus:border-primary focus:ring-primary/25 shadow-sm shadow-primary/20'
                                // State: empty
                                : 'border-border text-foreground focus:border-primary focus:ring-primary/25',
                        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text',
                    ].join(' ')}
                />
            ))}
        </div>
    )
}
