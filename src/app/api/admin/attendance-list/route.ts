import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAttendanceList, getAttendanceHistory } from '@/lib/db'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { getISTDate } from '@/lib/time'

/**
 * GET — Admin: fetch detailed attendance list (who ate / who missed)
 * Query params:
 *  - date (YYYY-MM-DD, default: today IST)
 *  - mealType (breakfast | lunch | snacks | dinner)
 *  - hostelBlock
 *  - mode=history&startDate=...&endDate=... for day-by-day history
 */
export async function GET(request: Request) {
  const ip = getClientIp(request)
  const rl = await checkRateLimit(`admin-attendance-list:${ip}`, 20, 60 * 1000)
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
    const mode = searchParams.get('mode')

    // Enforce admin's block scope — admins without an assigned block are rejected
    let hostelBlock: string | undefined
    if (profile.role === 'admin') {
      if (!profile.hostel_block) {
        return NextResponse.json({ error: 'Your admin account has no hostel block assigned' }, { status: 403 })
      }
      hostelBlock = profile.hostel_block
    } else if (searchParams.get('hostelBlock') && searchParams.get('hostelBlock') !== 'all') {
      hostelBlock = searchParams.get('hostelBlock')!
    }

    // History mode: day-by-day counts
    if (mode === 'history') {
      const endDate = searchParams.get('endDate') || getISTDate()
      // Use IST-safe date arithmetic for default start (avoids UTC offset near midnight)
      const todayIST = getISTDate()
      const [y, m, d] = todayIST.split('-').map(Number)
      const startDefault = new Date(y, m - 1, d)
      startDefault.setDate(startDefault.getDate() - 7)
      const fallbackStart = `${startDefault.getFullYear()}-${String(startDefault.getMonth() + 1).padStart(2, '0')}-${String(startDefault.getDate()).padStart(2, '0')}`
      const startDate = searchParams.get('startDate') || fallbackStart

      const history = await getAttendanceHistory(startDate, endDate, hostelBlock)
      return NextResponse.json({
        history,
        userRole: profile.role,
        userBlock: profile.hostel_block,
      })
    }

    // Default: detailed list for a single date
    const rawDate = searchParams.get('date') || getISTDate()
    // Validate date format to prevent malformed input
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return NextResponse.json({ error: 'Invalid date format (expected YYYY-MM-DD)' }, { status: 400 })
    }
    const date = rawDate
    const mealType = searchParams.get('mealType') || undefined

    const result = await getAttendanceList(date, hostelBlock, mealType)

    return NextResponse.json({
      date,
      ...result,
      userRole: profile.role,
      userBlock: profile.hostel_block,
    })
  } catch (error) {
    console.error('Admin attendance-list GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
