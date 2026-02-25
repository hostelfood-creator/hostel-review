import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

/** Default meal timing windows */
const DEFAULT_MEAL_TIMINGS = {
  breakfast: { start: '07:00', end: '10:00', label: 'Breakfast' },
  lunch:     { start: '12:00', end: '15:00', label: 'Lunch' },
  snacks:    { start: '16:00', end: '18:00', label: 'Snacks' },
  dinner:    { start: '19:00', end: '22:00', label: 'Dinner' },
}

/** GET — Public endpoint for current meal timings (used by student check-in pages) */
export async function GET(request: Request) {
  const ip = getClientIp(request)
  const rl = checkRateLimit(`meal-timings-public:${ip}`, 30, 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  try {
    const serviceClient = createServiceClient()
    const { data, error } = await serviceClient
      .from('site_settings')
      .select('meal_timings')
      .eq('id', 1)
      .single()

    const timings = (!error && data?.meal_timings) ? data.meal_timings : DEFAULT_MEAL_TIMINGS

    // Format for display: convert "07:00" to "7:00 AM" etc.
    const formatted: Record<string, { start: string; end: string; label: string; display: string }> = {}
    for (const [key, val] of Object.entries(timings as Record<string, { start: string; end: string; label: string }>)) {
      formatted[key] = {
        ...val,
        display: `${formatTime(val.start)} – ${formatTime(val.end)}`,
      }
    }

    return NextResponse.json({ timings: formatted }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    })
  } catch (error) {
    console.error('Public meal timings error:', error)
    return NextResponse.json({ timings: DEFAULT_MEAL_TIMINGS }, { status: 200 })
  }
}

/** Convert "07:00" / "19:30" to "7:00 AM" / "7:30 PM" */
function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m.toString().padStart(2, '0')} ${suffix}`
}
