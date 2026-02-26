import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMealAttendanceCounts } from '@/lib/db'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

/** Get IST date using Intl API */
function getISTDate() {
  const now = new Date()
  const TZ = 'Asia/Kolkata'
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

/** GET — Admin: fetch meal attendance counts */
export async function GET(request: Request) {
  // Rate limit: 30 requests per minute per IP
  const ip = getClientIp(request)
  const rl = await checkRateLimit(`admin-checkin:${ip}`, 30, 60 * 1000)
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
      .select('role, hostel_block')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const rawDate = searchParams.get('date') || getISTDate()
    // Validate date format to prevent malformed input
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return NextResponse.json({ error: 'Invalid date format (expected YYYY-MM-DD)' }, { status: 400 })
    }
    const date = rawDate

    // Admins see their block only; super_admins see all or can filter
    let hostelBlock: string | undefined
    if (profile.role === 'admin') {
      if (!profile.hostel_block) {
        return NextResponse.json({ error: 'Your admin account has no hostel block assigned' }, { status: 403 })
      }
      hostelBlock = profile.hostel_block
    } else if (searchParams.get('hostelBlock') && searchParams.get('hostelBlock') !== 'all') {
      hostelBlock = searchParams.get('hostelBlock')!
    }

    const counts = await getMealAttendanceCounts(date, hostelBlock)

    return NextResponse.json({
      date,
      counts,
      userRole: profile.role,
      userBlock: profile.hostel_block,
    })
  } catch (error) {
    console.error('Admin checkin GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
