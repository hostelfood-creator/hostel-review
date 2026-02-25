import { NextResponse } from 'next/server'
import { getMenusByDate } from '@/lib/db'
import { getTodayDate } from '@/lib/utils'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: Request) {
  try {
    // Rate limit: 30 menu requests per minute per IP
    const ip = getClientIp(request)
    const rl = checkRateLimit(`menu-today:${ip}`, 30, 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const today = getTodayDate()
    const menus = await getMenusByDate(today)

    return NextResponse.json({ menus, date: today })
  } catch (error) {
    console.error('Menu today error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
