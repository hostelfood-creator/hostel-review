import { NextResponse } from 'next/server'
import { getMenusByDate } from '@/lib/db'
import { getTodayDate } from '@/lib/utils'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: Request) {
  try {
    // Rate limit: 30 menu requests per minute per IP
    const ip = getClientIp(request)
    const rl = await checkRateLimit(`menu-today:${ip}`, 30, 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const { searchParams } = new URL(request.url)
    const hostelBlock = searchParams.get('hostelBlock')

    const today = getTodayDate()
    const menus = await getMenusByDate(today, hostelBlock || undefined)

    return NextResponse.json({ menus, date: today, hostelBlock: hostelBlock || null }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
    })
  } catch (error) {
    console.error('Menu today error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
