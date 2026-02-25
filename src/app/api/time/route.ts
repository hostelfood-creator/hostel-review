import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

/**
 * Server-side time API — returns the current server date, day, time.
 * This ensures all students see the same date regardless of client timezone.
 */
export async function GET(request: Request) {
    // Rate limit: 60 time requests per minute per IP
    const ip = getClientIp(request)
    const rl = checkRateLimit(`time:${ip}`, 60, 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const now = new Date()

    // Use Intl API with explicit timezone for reliable IST regardless of server locale.
    // Previous approach using manual offset + getTimezoneOffset was fragile:
    // toISOString() always returns UTC, causing date/time inconsistencies.
    const TZ = 'Asia/Kolkata'
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
        weekday: 'long',
    })
    const parts = Object.fromEntries(
        formatter.formatToParts(now).map(p => [p.type, p.value])
    )
    const dateStr = `${parts.year}-${parts.month}-${parts.day}` // YYYY-MM-DD
    const weekday = parts.weekday!
    const day = parseInt(parts.day!, 10)
    const monthShort = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short' }).format(now)
    const year = parseInt(parts.year!, 10)
    const hours = parseInt(parts.hour!, 10)
    const minutes = parseInt(parts.minute!, 10)

    return NextResponse.json({
        date: dateStr,
        display: `${weekday}, ${day} ${monthShort} ${year}`,
        weekday,
        day,
        month: monthShort,
        year,
        hours,
        minutes,
        timestamp: now.getTime(),
    })
}
