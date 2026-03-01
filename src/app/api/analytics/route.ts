import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getReviewsForAnalytics, getStudentHostelBlocks } from '@/lib/db'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

// ── Types ────────────────────────────────────────────────────────────────────

interface ReviewRecord {
  rating: number
  sentiment: string | null
  userId: string
  date: string
  mealType: string
  hostelBlock: string | null
}

interface SpecialMenu {
  date: string
  special_label: string
}

interface AggregationResult {
  totalReviews: number
  ratingSum: number
  lowRatings: number
  positiveSentiment: number
  neutralSentiment: number
  negativeSentiment: number
  specialRatingSum: number
  specialReviewCount: number
  normalRatingSum: number
  normalReviewCount: number
  uniqueStudents: Set<string>
  dailyMap: Map<string, { total: number; count: number }>
  mealMap: Map<string, { total: number; count: number }>
  blockMap: Map<string, { total: number; count: number; positive: number; negative: number }>
}

// ── Aggregation helpers ──────────────────────────────────────────────────────

function aggregateReviews(
  reviews: ReviewRecord[],
  specialDates: Set<string>,
  isSuperAdmin: boolean,
): AggregationResult {
  const result: AggregationResult = {
    totalReviews: reviews.length,
    ratingSum: 0,
    lowRatings: 0,
    positiveSentiment: 0,
    neutralSentiment: 0,
    negativeSentiment: 0,
    specialRatingSum: 0,
    specialReviewCount: 0,
    normalRatingSum: 0,
    normalReviewCount: 0,
    uniqueStudents: new Set(),
    dailyMap: new Map(),
    mealMap: new Map(),
    blockMap: new Map(),
  }

  for (const r of reviews) {
    const rating = r.rating
    result.ratingSum += rating
    if (rating <= 2) result.lowRatings++

    if (r.sentiment === 'positive') result.positiveSentiment++
    else if (r.sentiment === 'neutral') result.neutralSentiment++
    else if (r.sentiment === 'negative') result.negativeSentiment++

    result.uniqueStudents.add(r.userId)

    const daily = result.dailyMap.get(r.date)
    if (daily) { daily.total += rating; daily.count++ }
    else result.dailyMap.set(r.date, { total: rating, count: 1 })

    const meal = result.mealMap.get(r.mealType)
    if (meal) { meal.total += rating; meal.count++ }
    else result.mealMap.set(r.mealType, { total: rating, count: 1 })

    if (specialDates.has(r.date)) { result.specialRatingSum += rating; result.specialReviewCount++ }
    else { result.normalRatingSum += rating; result.normalReviewCount++ }

    if (isSuperAdmin) {
      const block = r.hostelBlock || 'Unknown'
      const existing = result.blockMap.get(block)
      if (existing) {
        existing.total += rating; existing.count++
        if (r.sentiment === 'positive') existing.positive++
        if (r.sentiment === 'negative') existing.negative++
      } else {
        result.blockMap.set(block, {
          total: rating, count: 1,
          positive: r.sentiment === 'positive' ? 1 : 0,
          negative: r.sentiment === 'negative' ? 1 : 0,
        })
      }
    }
  }

  return result
}

export async function GET(request: Request) {
  try {
    // Rate limit: 30 analytics requests per minute per IP
    const ip = getClientIp(request)
    const rl = await checkRateLimit(`analytics:${ip}`, 30, 60 * 1000)
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

    // Fetch reviews and special menus in parallel
    const serviceDb = createServiceClient()
    const [reviews, specialMenusResult] = await Promise.all([
      getReviewsForAnalytics(startDateStr, mealType, hostelBlock, profile.role as 'admin' | 'super_admin'),
      serviceDb
        .from('menus')
        .select('date, special_label')
        .gte('date', startDateStr)
        .not('special_label', 'is', null),
    ])

    const specialMenus: SpecialMenu[] = (specialMenusResult.data || []) as SpecialMenu[]
    const specialDates = new Set<string>(specialMenus.map((m) => m.date))
    const specialLabelsMap = new Map<string, string>()
    specialMenus.forEach((m) => {
      if (!specialLabelsMap.has(m.date)) specialLabelsMap.set(m.date, m.special_label)
    })

    // Single-pass aggregation via extracted helper
    const isSuperAdmin = profile.role === 'super_admin'
    const agg = aggregateReviews(reviews as ReviewRecord[], specialDates, isSuperAdmin)

    const {
      totalReviews, ratingSum, lowRatings,
      positiveSentiment, neutralSentiment, negativeSentiment,
      specialRatingSum, specialReviewCount, normalRatingSum, normalReviewCount,
      uniqueStudents, dailyMap, mealMap, blockMap,
    } = agg

    const avgRating = totalReviews > 0 ? ratingSum / totalReviews : 0
    const alertCount = avgRating < 2.5 || lowRatings / Math.max(totalReviews, 1) > 0.3 ? 1 : 0

    const dailyRatings = Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        avgRating: Math.round((data.total / data.count) * 100) / 100,
        count: data.count,
        isSpecial: specialDates.has(date),
        specialLabel: specialLabelsMap.get(date) || null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const mealRatings = Array.from(mealMap.entries()).map(([meal, data]) => ({
      mealType: meal,
      avgRating: Math.round((data.total / data.count) * 100) / 100,
      count: data.count,
    }))

    const sentimentBreakdown = { positive: positiveSentiment, neutral: neutralSentiment, negative: negativeSentiment }

    // Cap recent reviews to avoid unbounded payload
    const recentReviews = reviews.slice(0, 20)

    const hostelBlocks = await getStudentHostelBlocks()

    const specialDayStats = {
      specialDayCount: specialDates.size,
      specialDayReviews: specialReviewCount,
      specialDayAvgRating: specialReviewCount > 0
        ? Math.round((specialRatingSum / specialReviewCount) * 100) / 100
        : 0,
      normalDayReviews: normalReviewCount,
      normalDayAvgRating: normalReviewCount > 0
        ? Math.round((normalRatingSum / normalReviewCount) * 100) / 100
        : 0,
      specialDays: Array.from(specialDates).map((date: string) => ({
        date,
        label: specialLabelsMap.get(date) || 'Special',
      })),
    }

    let blockStats: { block: string; totalReviews: number; avgRating: number; positive: number; negative: number }[] = []
    if (isSuperAdmin) {
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

    return NextResponse.json({
      overview: {
        totalReviews,
        avgRating: Math.round(avgRating * 100) / 100,
        totalStudents: uniqueStudents.size,
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
      specialDayStats,
      userRole: profile.role,
      userBlock: profile.hostel_block,
    })
  } catch (error) {
    console.error('Analytics error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
