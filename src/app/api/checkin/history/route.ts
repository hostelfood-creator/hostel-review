import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

/** Get IST date using Intl API */
function getISTDate(): string {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((p) => [p.type, p.value])
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

/** GET — Student check-in history for the past N days */
export async function GET(request: Request) {
  const ip = getClientIp(request)
  const rl = await checkRateLimit(`checkin-history:${ip}`, 20, 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const days = Math.min(30, Math.max(1, parseInt(searchParams.get('days') || '7')))

    const today = getISTDate()

    // Calculate start date using IST-safe arithmetic (avoid toISOString UTC shift)
    const [y, m, d] = today.split('-').map(Number)
    const startJs = new Date(y, m - 1, d) // local Date for arithmetic only
    startJs.setDate(startJs.getDate() - (days - 1))
    const startStr = `${startJs.getFullYear()}-${String(startJs.getMonth() + 1).padStart(2, '0')}-${String(startJs.getDate()).padStart(2, '0')}`

    const { data: checkins, error } = await supabase
      .from('meal_checkins')
      .select('meal_type, date, checked_in_at')
      .eq('user_id', user.id)
      .gte('date', startStr)
      .lte('date', today)
      .order('date', { ascending: false })

    if (error) {
      console.error('Checkin history error:', error)
      return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
    }

    // Group by date
    const byDate: Record<string, string[]> = {}
    for (const c of (checkins || [])) {
      const dt = c.date as string
      if (!byDate[dt]) byDate[dt] = []
      byDate[dt].push(c.meal_type as string)
    }

    // Build day-by-day array using IST-safe date arithmetic
    const history: { date: string; meals: string[] }[] = []
    const cursor = new Date(y, m - 1, d) // start from today IST
    for (let i = 0; i < days; i++) {
      const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
      history.push({ date: dateStr, meals: byDate[dateStr] || [] })
      cursor.setDate(cursor.getDate() - 1)
    }

    // Summary stats
    const totalMeals = (checkins || []).length
    const totalPossible = days * 4

    return NextResponse.json({
      history,
      summary: {
        totalMeals,
        totalPossible,
        percentage: totalPossible > 0 ? Math.round((totalMeals / totalPossible) * 100) : 0,
        days,
      },
    })
  } catch (error) {
    console.error('Checkin history error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
