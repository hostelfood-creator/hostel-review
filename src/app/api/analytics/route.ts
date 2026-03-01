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
  /** day-of-week × meal heatmap: key = "dayIndex:mealType" */
  dowMealMap: Map<string, { total: number; count: number }>
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
    dowMealMap: new Map(),
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

    // Day-of-week × meal heatmap
    const dow = new Date(r.date + 'T00:00:00').getDay() // 0=Sun..6=Sat
    const dowKey = `${dow}:${r.mealType}`
    const dowEntry = result.dowMealMap.get(dowKey)
    if (dowEntry) { dowEntry.total += rating; dowEntry.count++ }
    else result.dowMealMap.set(dowKey, { total: rating, count: 1 })

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

    // Support custom date range (from/to) or preset days
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')
    let startDateStr: string
    let endDateStr: string | undefined

    if (fromParam && toParam) {
      // Validate ISO date format
      const fromDate = new Date(fromParam + 'T00:00:00')
      const toDate = new Date(toParam + 'T00:00:00')
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD.' }, { status: 400 })
      }
      // Ensure range doesn't exceed 365 days
      const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDays < 0 || diffDays > 365) {
        return NextResponse.json({ error: 'Date range must be 0-365 days.' }, { status: 400 })
      }
      startDateStr = fromParam
      endDateStr = toParam
    } else {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)
      startDateStr = startDate.toISOString().split('T')[0]
    }

    // Fetch reviews and special menus in parallel
    const serviceDb = createServiceClient()
    const specialMenuQuery = serviceDb
      .from('menus')
      .select('date, special_label')
      .gte('date', startDateStr)
      .not('special_label', 'is', null)
    if (endDateStr) specialMenuQuery.lte('date', endDateStr)

    const [reviews, specialMenusResult] = await Promise.all([
      getReviewsForAnalytics(startDateStr, mealType, hostelBlock, profile.role as 'admin' | 'super_admin'),
      specialMenuQuery,
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
      uniqueStudents, dailyMap, mealMap, blockMap, dowMealMap,
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

    // ── Day-of-week × meal heatmap ──────────────────────────────────────────
    const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const MEAL_TYPES = ['breakfast', 'lunch', 'snacks', 'dinner']

    const dayOfWeekHeatmap = DOW_NAMES.map((day, dayIdx) => {
      const row: Record<string, number | string> = { day }
      for (const meal of MEAL_TYPES) {
        const entry = dowMealMap.get(`${dayIdx}:${meal}`)
        row[meal] = entry ? Math.round((entry.total / entry.count) * 100) / 100 : 0
      }
      return row
    })

    // ── Week-over-week comparison ───────────────────────────────────────────
    const now = new Date()
    const thisWeekStart = new Date(now)
    thisWeekStart.setDate(now.getDate() - now.getDay()) // Sunday
    thisWeekStart.setHours(0, 0, 0, 0)
    const lastWeekStart = new Date(thisWeekStart)
    lastWeekStart.setDate(lastWeekStart.getDate() - 7)

    const thisWeekStr = thisWeekStart.toISOString().split('T')[0]
    const lastWeekStr = lastWeekStart.toISOString().split('T')[0]

    let thisWeekReviews = 0, thisWeekRatingSum = 0, thisWeekPositive = 0
    let lastWeekReviews = 0, lastWeekRatingSum = 0, lastWeekPositive = 0

    for (const [dateStr, data] of dailyMap.entries()) {
      if (dateStr >= thisWeekStr) {
        thisWeekReviews += data.count
        thisWeekRatingSum += data.total
      } else if (dateStr >= lastWeekStr && dateStr < thisWeekStr) {
        lastWeekReviews += data.count
        lastWeekRatingSum += data.total
      }
    }

    // Count sentiment per week from raw reviews
    for (const r of reviews as ReviewRecord[]) {
      if (r.date >= thisWeekStr && r.sentiment === 'positive') thisWeekPositive++
      else if (r.date >= lastWeekStr && r.date < thisWeekStr && r.sentiment === 'positive') lastWeekPositive++
    }

    const weekOverWeek = {
      thisWeek: {
        reviews: thisWeekReviews,
        avgRating: thisWeekReviews > 0 ? Math.round((thisWeekRatingSum / thisWeekReviews) * 100) / 100 : 0,
        positiveRate: thisWeekReviews > 0 ? Math.round((thisWeekPositive / thisWeekReviews) * 100) : 0,
      },
      lastWeek: {
        reviews: lastWeekReviews,
        avgRating: lastWeekReviews > 0 ? Math.round((lastWeekRatingSum / lastWeekReviews) * 100) / 100 : 0,
        positiveRate: lastWeekReviews > 0 ? Math.round((lastWeekPositive / lastWeekReviews) * 100) : 0,
      },
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
      dayOfWeekHeatmap,
      weekOverWeek,
      userRole: profile.role,
      userBlock: profile.hostel_block,
    })
  } catch (error) {
    console.error('Analytics error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
