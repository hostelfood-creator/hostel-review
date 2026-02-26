import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

/** Default meal timing windows (used when DB has no data) */
export const DEFAULT_MEAL_TIMINGS: Record<string, { start: string; end: string; label: string }> = {
  breakfast: { start: '07:00', end: '10:00', label: 'Breakfast' },
  lunch:     { start: '12:00', end: '15:00', label: 'Lunch' },
  snacks:    { start: '16:00', end: '18:00', label: 'Snacks' },
  dinner:    { start: '19:00', end: '22:00', label: 'Dinner' },
}

const VALID_MEALS = ['breakfast', 'lunch', 'snacks', 'dinner']

/** Validate a HH:MM time string */
function isValidTime(t: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t)
}

/** GET — Fetch current meal timings (admin/super_admin only) */
export async function GET(request: Request) {
  // Rate limit: 30 meal-timing reads per minute per IP
  const ip = getClientIp(request)
  const rl = checkRateLimit(`meal-timings-admin-get:${ip}`, 30, 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const serviceClient = createServiceClient()
    const { data, error } = await serviceClient
      .from('site_settings')
      .select('meal_timings')
      .eq('id', 1)
      .single()

    if (error || !data?.meal_timings) {
      return NextResponse.json({ timings: DEFAULT_MEAL_TIMINGS })
    }

    return NextResponse.json({ timings: data.meal_timings })
  } catch (error) {
    console.error('Meal timings GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST — Update meal timings (admin/super_admin only) */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = checkRateLimit(`meal-timings:${ip}`, 10, 15 * 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { timings } = await request.json()

    if (!timings || typeof timings !== 'object') {
      return NextResponse.json({ error: 'Invalid timings data' }, { status: 400 })
    }

    // Validate each meal entry
    for (const meal of VALID_MEALS) {
      const entry = timings[meal]
      if (!entry || typeof entry !== 'object') {
        return NextResponse.json({ error: `Missing timing for ${meal}` }, { status: 400 })
      }
      if (!isValidTime(entry.start)) {
        return NextResponse.json({ error: `Invalid start time for ${meal}. Use HH:MM format (e.g. 07:00)` }, { status: 400 })
      }
      if (!isValidTime(entry.end)) {
        return NextResponse.json({ error: `Invalid end time for ${meal}. Use HH:MM format (e.g. 10:00)` }, { status: 400 })
      }
      // Ensure start < end
      if (entry.start >= entry.end) {
        return NextResponse.json({ error: `Start time must be before end time for ${meal}` }, { status: 400 })
      }
      if (!entry.label || typeof entry.label !== 'string' || entry.label.length > 50) {
        return NextResponse.json({ error: `Invalid label for ${meal}` }, { status: 400 })
      }
    }

    // Only allow exactly the 4 known meals
    const sanitized: Record<string, { start: string; end: string; label: string }> = {}
    for (const meal of VALID_MEALS) {
      sanitized[meal] = {
        start: timings[meal].start,
        end: timings[meal].end,
        label: timings[meal].label.trim().slice(0, 50),
      }
    }

    const serviceClient = createServiceClient()
    const { error } = await serviceClient
      .from('site_settings')
      .upsert({ id: 1, meal_timings: sanitized })

    if (error) {
      console.error('Meal timings update error:', error)
      return NextResponse.json({ error: 'Failed to save timings' }, { status: 500 })
    }

    return NextResponse.json({ success: true, timings: sanitized })
  } catch (error) {
    console.error('Meal timings POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
