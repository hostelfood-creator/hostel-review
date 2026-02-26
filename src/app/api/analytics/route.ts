import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getReviewsForAnalytics, getStudentHostelBlocks } from '@/lib/db'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: Request) {
  try {
    // Rate limit: 30 analytics requests per minute per IP
    const ip = getClientIp(request)
    const rl = checkRateLimit(`analytics:${ip}`, 30, 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: profile } = await supabase.from('profiles').select('role, hostel_block').eq('id', user.id).single()
    // Fail-closed: only admin and super_admin roles may access analytics
    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const rawDays = parseInt(searchParams.get('days') || '7')
    const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(rawDays, 365) : 7
    // Treat 'all' and empty string as "no filter"
    const rawMeal = searchParams.get('mealType')
    const mealType = rawMeal && rawMeal !== 'all' ? rawMeal : undefined

    // Enforce admin's assigned block; treat 'all' as "no filter" for super admins
    const rawBlock = searchParams.get('hostelBlock')
    let hostelBlock = rawBlock && rawBlock !== 'all' ? rawBlock : undefined
    if (profile.role === 'admin') {
      if (!profile.hostel_block) {
        return NextResponse.json({ error: 'Your admin account has no hostel block assigned' }, { status: 403 })
      }
      hostelBlock = profile.hostel_block
    }

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    const startDateStr = startDate.toISOString().split('T')[0]

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const reviews: any[] = await getReviewsForAnalytics(startDateStr, mealType, hostelBlock)

    const totalReviews = reviews.length
    const avgRating =
      totalReviews > 0
        ? reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / totalReviews
        : 0

    const uniqueStudents = new Set(reviews.map((r: any) => r.userId)).size

    const lowRatings = reviews.filter((r: any) => r.rating <= 2).length
    const alertCount =
      avgRating < 2.5 || lowRatings / Math.max(totalReviews, 1) > 0.3 ? 1 : 0

    const dailyMap = new Map<string, { total: number; count: number }>()
    reviews.forEach((r: any) => {
      const existing = dailyMap.get(r.date) || { total: 0, count: 0 }
      existing.total += r.rating
      existing.count += 1
      dailyMap.set(r.date, existing)
    })
    const dailyRatings = Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        avgRating: Math.round((data.total / data.count) * 100) / 100,
        count: data.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const mealMap = new Map<string, { total: number; count: number }>()
    reviews.forEach((r: any) => {
      const existing = mealMap.get(r.mealType) || { total: 0, count: 0 }
      existing.total += r.rating
      existing.count += 1
      mealMap.set(r.mealType, existing)
    })
    const mealRatings = Array.from(mealMap.entries()).map(([meal, data]) => ({
      mealType: meal,
      avgRating: Math.round((data.total / data.count) * 100) / 100,
      count: data.count,
    }))

    const sentimentBreakdown = {
      positive: reviews.filter((r: any) => r.sentiment === 'positive').length,
      neutral: reviews.filter((r: any) => r.sentiment === 'neutral').length,
      negative: reviews.filter((r: any) => r.sentiment === 'negative').length,
    }

    const recentReviews = reviews.slice(0, 20)

    const hostelBlocks = await getStudentHostelBlocks()

    // Per-block stats for Super Admin
    let blockStats: { block: string; totalReviews: number; avgRating: number; positive: number; negative: number }[] = []
    if (profile.role === 'super_admin') {
      const blockMap = new Map<string, { total: number; count: number; positive: number; negative: number }>()
      reviews.forEach((r: any) => {
        const block = r.hostelBlock || 'Unknown'
        const existing = blockMap.get(block) || { total: 0, count: 0, positive: 0, negative: 0 }
        existing.total += r.rating
        existing.count += 1
        if (r.sentiment === 'positive') existing.positive += 1
        if (r.sentiment === 'negative') existing.negative += 1
        blockMap.set(block, existing)
      })
      blockStats = Array.from(blockMap.entries())
        .map(([block, d]) => ({
          block,
          totalReviews: d.count,
          avgRating: Math.round((d.total / d.count) * 100) / 100,
          positive: d.positive,
          negative: d.negative,
        }))
        .sort((a, b) => b.totalReviews - a.totalReviews)
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return NextResponse.json({
      overview: {
        totalReviews,
        avgRating: Math.round(avgRating * 100) / 100,
        totalStudents: uniqueStudents,
        alertCount,
        lowRatingPercentage: Math.round(
          (lowRatings / Math.max(totalReviews, 1)) * 100
        ),
      },
      dailyRatings,
      mealRatings,
      sentimentBreakdown,
      recentReviews,
      hostelBlocks,
      blockStats,
      userRole: profile.role,
      userBlock: profile.hostel_block,
    })
  } catch (error) {
    console.error('Analytics error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
