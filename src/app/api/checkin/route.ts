import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createMealCheckin, getUserCheckins } from '@/lib/db'
import { MEAL_TYPES, MEAL_CONFIG } from '@/lib/utils'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { getISTDateTime, formatTime, DEFAULT_MEAL_TIMINGS } from '@/lib/time'

/**
 * Fetch configurable meal timings from site_settings.
 * Uses service client (bypasses RLS) and falls back to defaults.
 */
async function getMealTimings(): Promise<Record<string, { start: string; end: string; label: string }>> {
  try {
    const serviceClient = createServiceClient()
    const { data, error } = await serviceClient
      .from('site_settings')
      .select('meal_timings')
      .eq('id', 1)
      .single()

    if (!error && data?.meal_timings && typeof data.meal_timings === 'object') {
      return data.meal_timings as Record<string, { start: string; end: string; label: string }>
    }
  } catch {
    // Ignore — fall back to defaults
  }
  return DEFAULT_MEAL_TIMINGS
}

/** Parse HH:MM into total minutes since midnight */
function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Determine the current active meal based on server time (IST)
 * and admin-configured meal windows from the database.
 */
function getCurrentMeal(
  hours: number,
  minutes: number,
  timings: Record<string, { start: string; end: string; label: string }>
): string | null {
  const now = hours * 60 + minutes
  for (const [mealKey, window] of Object.entries(timings)) {
    const start = parseTimeToMinutes(window.start)
    const end = parseTimeToMinutes(window.end)
    if (now >= start && now < end) return mealKey
  }
  return null
}

/** POST — Student check-in for current meal */
export async function POST(request: Request) {
  // Rate limit: 10 check-ins per minute per IP
  const ip = getClientIp(request)
  const rl = await checkRateLimit(`checkin:${ip}`, 10, 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, hostel_block, name')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    if (profile.role !== 'student') {
      return NextResponse.json(
        { error: 'Only students can check in for meals' },
        { status: 403 }
      )
    }

    const { date, hours, minutes } = getISTDateTime()
    const timings = await getMealTimings()
    const currentMeal = getCurrentMeal(hours, minutes, timings)

    if (!currentMeal) {
      // Build display windows from configured timings
      const mealWindows: Record<string, string> = {}
      for (const [key, val] of Object.entries(timings)) {
        mealWindows[key] = `${formatTime(val.start)} – ${formatTime(val.end)}`
      }
      return NextResponse.json(
        {
          error: 'No meal is currently being served',
          message: 'Check-in is only available during meal hours.',
          mealWindows,
        },
        { status: 400 }
      )
    }

    const result = await createMealCheckin({
      userId: user.id,
      mealType: currentMeal,
      date,
      hostelBlock: profile.hostel_block,
    })

    if (result.alreadyCheckedIn) {
      return NextResponse.json({
        success: true,
        alreadyCheckedIn: true,
        mealType: currentMeal,
        mealLabel: MEAL_CONFIG[currentMeal as keyof typeof MEAL_CONFIG]?.label || currentMeal,
        date,
        message: `You've already checked in for ${MEAL_CONFIG[currentMeal as keyof typeof MEAL_CONFIG]?.label || currentMeal}.`,
        userName: profile.name,
      })
    }

    return NextResponse.json({
      success: true,
      alreadyCheckedIn: false,
      mealType: currentMeal,
      mealLabel: MEAL_CONFIG[currentMeal as keyof typeof MEAL_CONFIG]?.label || currentMeal,
      date,
      checkinId: result.id,
      message: `Checked in for ${MEAL_CONFIG[currentMeal as keyof typeof MEAL_CONFIG]?.label || currentMeal}!`,
      userName: profile.name,
    })
  } catch (error) {
    console.error('Checkin POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/** GET — Get student's check-in status for today */
export async function GET(request: Request) {
  // Rate limit: 30 requests per minute per IP
  const ip = getClientIp(request)
  const rl = await checkRateLimit(`checkin-get:${ip}`, 30, 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const { date, hours, minutes } = getISTDateTime()
    const queryDate = searchParams.get('date') || date

    const checkins = await getUserCheckins(user.id, queryDate)
    const timings = await getMealTimings()
    const currentMeal = getCurrentMeal(hours, minutes, timings)

    return NextResponse.json({
      checkins,
      date: queryDate,
      currentMeal,
      currentMealLabel: currentMeal
        ? MEAL_CONFIG[currentMeal as keyof typeof MEAL_CONFIG]?.label || currentMeal
        : null,
    })
  } catch (error) {
    console.error('Checkin GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
