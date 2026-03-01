/**
 * Shared IST date/time utilities.
 * All date operations use `Asia/Kolkata` timezone via Intl API
 * to ensure consistent server-side behaviour regardless of host TZ.
 */

const TZ = 'Asia/Kolkata'

/** Get today's date in IST as YYYY-MM-DD */
export function getISTDate(): string {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((p) => [p.type, p.value])
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

/** Alias kept for backward compat with existing imports */
export const getTodayDate = getISTDate

/** Get IST date, hour, and minute */
export function getISTDateTime(): { date: string; hours: number; minutes: number } {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((p) => [p.type, p.value])
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hours: parseInt(parts.hour!, 10),
    minutes: parseInt(parts.minute!, 10),
  }
}

/** Convert "07:00" → "7:00 AM", "19:30" → "7:30 PM" */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m.toString().padStart(2, '0')} ${suffix}`
}

/** Default meal timing windows (fallback when DB has no data) */
export const DEFAULT_MEAL_TIMINGS: Record<string, { start: string; end: string; label: string }> = {
  breakfast: { start: '07:00', end: '10:00', label: 'Breakfast' },
  lunch:     { start: '12:00', end: '15:00', label: 'Lunch' },
  snacks:    { start: '16:00', end: '18:00', label: 'Snacks' },
  dinner:    { start: '19:00', end: '22:00', label: 'Dinner' },
}
