import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { logAdminAction } from '@/lib/audit'
import { getISTDate } from '@/lib/time'

/**
 * Super Admin API — manage check-in count overrides per block/meal/date.
 * Allows the super admin to edit (override) check-in counts that are
 * stored in the database. The actual counts remain unchanged but the
 * display/reporting layer uses the override when present.
 */

/** GET — Fetch check-in counts with overrides for all blocks */
export async function GET(request: Request) {
  const ip = getClientIp(request)
  const rl = await checkRateLimit(`checkin-overrides-get:${ip}`, 30, 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden — super admin only' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const rawDate = searchParams.get('date') || getISTDate()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return NextResponse.json({ error: 'Invalid date format (expected YYYY-MM-DD)' }, { status: 400 })
    }

    const serviceDb = createServiceClient()

    // 1. Get all hostel blocks
    const { data: blocks } = await serviceDb
      .from('hostel_blocks')
      .select('id, name')
      .order('name', { ascending: true })

    if (!blocks || blocks.length === 0) {
      return NextResponse.json({ blocks: [], date: rawDate })
    }

    // 2. Get actual check-in counts grouped by block and meal
    const { data: checkins } = await serviceDb
      .from('meal_checkins')
      .select('meal_type, hostel_block')
      .eq('date', rawDate)

    const actualCounts: Record<string, Record<string, number>> = {}
    for (const block of blocks) {
      actualCounts[block.name] = { breakfast: 0, lunch: 0, snacks: 0, dinner: 0 }
    }
    for (const row of (checkins || [])) {
      const block = row.hostel_block as string
      const meal = row.meal_type as string
      if (actualCounts[block] && actualCounts[block][meal] !== undefined) {
        actualCounts[block][meal]++
      }
    }

    // 3. Get any existing overrides for this date
    const { data: overrides } = await serviceDb
      .from('checkin_count_overrides')
      .select('*')
      .eq('date', rawDate)

    const overrideMap: Record<string, Record<string, { override_count: number; reason: string | null; id: string }>> = {}
    for (const o of (overrides || [])) {
      const block = o.hostel_block as string
      const meal = o.meal_type as string
      if (!overrideMap[block]) overrideMap[block] = {}
      overrideMap[block][meal] = {
        override_count: o.override_count as number,
        reason: o.reason as string | null,
        id: o.id as string,
      }
    }

    // 4. Build response per block
    const blockData = blocks.map((block) => {
      const meals = ['breakfast', 'lunch', 'snacks', 'dinner'].map((meal) => {
        const actual = actualCounts[block.name]?.[meal] || 0
        const override = overrideMap[block.name]?.[meal]
        return {
          meal,
          actualCount: actual,
          displayCount: override ? override.override_count : actual,
          hasOverride: !!override,
          overrideId: override?.id || null,
          reason: override?.reason || null,
        }
      })

      const totalActual = meals.reduce((s, m) => s + m.actualCount, 0)
      const totalDisplay = meals.reduce((s, m) => s + m.displayCount, 0)

      return {
        blockId: block.id,
        blockName: block.name,
        meals,
        totalActual,
        totalDisplay,
      }
    })

    return NextResponse.json({ blocks: blockData, date: rawDate })
  } catch (error) {
    console.error('Checkin overrides GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST — Create or update a check-in count override */
export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rl = await checkRateLimit(`checkin-overrides-post:${ip}`, 20, 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden — super admin only' }, { status: 403 })
    }

    const body = await request.json()
    const { date, mealType, hostelBlock, overrideCount, originalCount, reason } = body

    // Validate inputs
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Valid date (YYYY-MM-DD) is required' }, { status: 400 })
    }
    if (!mealType || !['breakfast', 'lunch', 'snacks', 'dinner'].includes(mealType)) {
      return NextResponse.json({ error: 'Valid meal type is required' }, { status: 400 })
    }
    if (!hostelBlock || typeof hostelBlock !== 'string') {
      return NextResponse.json({ error: 'Hostel block is required' }, { status: 400 })
    }
    if (typeof overrideCount !== 'number' || overrideCount < 0 || !Number.isInteger(overrideCount)) {
      return NextResponse.json({ error: 'Override count must be a non-negative integer' }, { status: 400 })
    }
    if (overrideCount > 100000) {
      return NextResponse.json({ error: 'Override count exceeds maximum allowed value' }, { status: 400 })
    }

    const serviceDb = createServiceClient()

    // Verify the block exists
    const { data: blockExists } = await serviceDb
      .from('hostel_blocks')
      .select('id')
      .eq('name', hostelBlock)
      .single()

    if (!blockExists) {
      return NextResponse.json({ error: 'Hostel block not found' }, { status: 404 })
    }

    // Upsert the override
    const { error: upsertError } = await serviceDb
      .from('checkin_count_overrides')
      .upsert(
        {
          date,
          meal_type: mealType,
          hostel_block: hostelBlock,
          original_count: typeof originalCount === 'number' ? originalCount : 0,
          override_count: overrideCount,
          overridden_by: user.id,
          reason: reason?.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'date,meal_type,hostel_block' }
      )

    if (upsertError) {
      console.error('Checkin override upsert error:', upsertError)
      return NextResponse.json({ error: 'Failed to save override' }, { status: 500 })
    }

    // Audit log
    logAdminAction(
      user.id,
      'super_admin',
      'checkin_count_override',
      'meal_checkins',
      `${hostelBlock}/${mealType}/${date}`,
      {
        hostelBlock,
        mealType,
        date,
        originalCount: typeof originalCount === 'number' ? originalCount : 0,
        overrideCount,
        reason: reason?.trim() || null,
      },
      ip
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Checkin overrides POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** DELETE — Remove an override (revert to actual count) */
export async function DELETE(request: Request) {
  const ip = getClientIp(request)
  const rl = await checkRateLimit(`checkin-overrides-del:${ip}`, 20, 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden — super admin only' }, { status: 403 })
    }

    const body = await request.json()
    const { id, date, mealType, hostelBlock } = body

    if (!id) {
      return NextResponse.json({ error: 'Override ID is required' }, { status: 400 })
    }

    const serviceDb = createServiceClient()
    const { error: deleteError } = await serviceDb
      .from('checkin_count_overrides')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Checkin override delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to remove override' }, { status: 500 })
    }

    // Audit log
    logAdminAction(
      user.id,
      'super_admin',
      'checkin_count_override_removed',
      'meal_checkins',
      `${hostelBlock || 'unknown'}/${mealType || 'unknown'}/${date || 'unknown'}`,
      { id, hostelBlock, mealType, date },
      ip
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Checkin overrides DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
