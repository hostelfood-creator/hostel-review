import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMenusByDate, upsertMenu } from '@/lib/db'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: Request) {
  try {
    // Rate limit: 60 menu reads per 15 minutes per IP
    const ip = getClientIp(request)
    const rl = checkRateLimit(`admin-menu-read:${ip}`, 60, 15 * 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')

    if (!date) {
      return NextResponse.json({ menus: [] })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date format (expected YYYY-MM-DD)' }, { status: 400 })
    }

    const menus = await getMenusByDate(date)
    return NextResponse.json({ menus })
  } catch (error) {
    console.error('Admin menu GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    // Rate limit: 30 menu updates per 15 minutes per IP
    const ip = getClientIp(request)
    const rl = checkRateLimit(`admin-menu:${ip}`, 30, 15 * 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { date, mealType, items, timing } = await request.json()

    const VALID_MEAL_TYPES = ['breakfast', 'lunch', 'snacks', 'dinner']

    if (!date || !mealType || !items || !timing) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) {
      return NextResponse.json({ error: 'Invalid date format (expected YYYY-MM-DD)' }, { status: 400 })
    }
    if (!VALID_MEAL_TYPES.includes(mealType)) {
      return NextResponse.json({ error: `Invalid meal type. Must be one of: ${VALID_MEAL_TYPES.join(', ')}` }, { status: 400 })
    }
    if (typeof items !== 'string' || items.length > 1000) {
      return NextResponse.json({ error: 'Items must be text (max 1000 characters)' }, { status: 400 })
    }
    if (typeof timing !== 'string' || timing.length > 100) {
      return NextResponse.json({ error: 'Timing must be text (max 100 characters)' }, { status: 400 })
    }

    const menuId = await upsertMenu({ date, mealType, items, timing })
    return NextResponse.json({ menu: { id: menuId } })
  } catch (error) {
    console.error('Admin menu POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
