import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { getISTDate } from '@/lib/time'

/**
 * GET /api/reviews/community — Public aggregated meal ratings for today
 *
 * Returns average rating + count per meal type for the current day,
 * scoped to the student's hostel block for relevance.
 * No individual review data is ever exposed — only aggregates.
 */
export async function GET(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = await checkRateLimit(`community-ratings:${ip}`, 30, 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('hostel_block')
      .eq('id', user.id)
      .single()

    const today = getISTDate()
    const serviceDb = createServiceClient()

    // Fetch today's reviews — scoped to hostel block if available
    let query = serviceDb
      .from('reviews')
      .select('meal_type, rating')
      .eq('date', today)

    if (profile?.hostel_block) {
      query = query.eq('hostel_block', profile.hostel_block)
    }

    const { data: reviews, error } = await query

    if (error) {
      console.error('[CommunityRatings] Query error:', error)
      return NextResponse.json({ error: 'Failed to fetch ratings' }, { status: 500 })
    }

    // Aggregate by meal type
    const mealStats: Record<string, { total: number; count: number }> = {}
    for (const r of reviews || []) {
      if (!mealStats[r.meal_type]) {
        mealStats[r.meal_type] = { total: 0, count: 0 }
      }
      mealStats[r.meal_type].total += r.rating
      mealStats[r.meal_type].count += 1
    }

    const ratings: Record<string, { avg: number; count: number }> = {}
    for (const [meal, stats] of Object.entries(mealStats)) {
      ratings[meal] = {
        avg: Math.round((stats.total / stats.count) * 10) / 10,
        count: stats.count,
      }
    }

    return NextResponse.json({
      date: today,
      hostelBlock: profile?.hostel_block || null,
      ratings,
    })
  } catch (error) {
    console.error('[CommunityRatings] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
