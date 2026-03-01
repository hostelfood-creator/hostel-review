import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

// ── Aggregation helpers ──────────────────────────────────────────────────────

interface ReviewRecord {
    rating: number
    sentiment: string | null
    meal_type: string
    date: string
}

interface WeekBucket {
    weekLabel: string
    totalReviews: number
    avgRating: number
    positive: number
    neutral: number
    negative: number
    mealBreakdown: Record<string, { count: number; avgRating: number }>
}

function aggregateWeekBucket(
    reviews: ReviewRecord[],
    startStr: string,
    endStr: string,
): WeekBucket {
    if (reviews.length === 0) {
        return { weekLabel: `${startStr} to ${endStr}`, totalReviews: 0, avgRating: 0, positive: 0, neutral: 0, negative: 0, mealBreakdown: {} }
    }

    let ratingSum = 0
    let positive = 0, neutral = 0, negative = 0
    const mealGroups = new Map<string, { sum: number; count: number }>()

    for (const r of reviews) {
        ratingSum += r.rating
        if (r.sentiment === 'positive') positive++
        else if (r.sentiment === 'negative') negative++
        else neutral++

        const mg = mealGroups.get(r.meal_type)
        if (mg) { mg.sum += r.rating; mg.count++ }
        else mealGroups.set(r.meal_type, { sum: r.rating, count: 1 })
    }

    const mealBreakdown: Record<string, { count: number; avgRating: number }> = {}
    mealGroups.forEach(({ sum, count }, meal) => {
        mealBreakdown[meal] = {
            count,
            avgRating: Math.round((sum / count) * 100) / 100,
        }
    })

    return {
        weekLabel: `${startStr} to ${endStr}`,
        totalReviews: reviews.length,
        avgRating: Math.round((ratingSum / reviews.length) * 100) / 100,
        positive, neutral, negative,
        mealBreakdown,
    }
}

interface ComplaintRecord {
    status: string
    category: string
    created_at: string
}

function buildComplaintStats(complaints: ComplaintRecord[]) {
    const stats = {
        total: complaints.length,
        pending: 0,
        inProgress: 0,
        resolved: 0,
        byCategory: {} as Record<string, number>,
    }
    for (const c of complaints) {
        if (c.status === 'pending') stats.pending++
        else if (c.status === 'in_progress') stats.inProgress++
        else if (c.status === 'resolved') stats.resolved++
        stats.byCategory[c.category] = (stats.byCategory[c.category] || 0) + 1
    }
    return stats
}

export async function GET(request: Request) {
    try {
        // Rate limit: 10 report requests per minute per IP
        const ip = getClientIp(request)
        const rl = await checkRateLimit(`reports-weekly:${ip}`, 10, 60 * 1000)
        if (!rl.allowed) return rateLimitResponse(rl.resetAt)

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role, hostel_block')
            .eq('id', user.id)
            .single()

        if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        const { searchParams } = new URL(request.url)
        const rawWeeks = parseInt(searchParams.get('weeks') || '4')
        const weeks = Number.isFinite(rawWeeks) && rawWeeks > 0 ? Math.min(rawWeeks, 52) : 4

        // Enforce block scope — admins without an assigned block are rejected
        let hostelBlock: string | undefined
        if (profile.role === 'admin') {
            if (!profile.hostel_block) {
                return NextResponse.json({ error: 'Your admin account has no hostel block assigned' }, { status: 403 })
            }
            hostelBlock = profile.hostel_block
        } else {
            hostelBlock = searchParams.get('hostelBlock') || undefined
        }

        // Calculate date ranges for each week
        const now = new Date()
        const weeklyData = []

        // Pre-fetch block users ONCE outside the loop (performance optimization)
        // NOTE: Filtering reviews by current block membership is the standard pattern
        // throughout the app (analytics, review listing) because the reviews table
        // stores user_id, not hostel_block. A student who transfers blocks would have
        // their historical reviews attributed to the new block. This is acceptable
        // because hostel transfers are extremely rare in Indian university hostels.
        let blockUserIds: string[] | null = null
        if (hostelBlock) {
            const { data: blockUsers } = await supabase
                .from('profiles')
                .select('id')
                .eq('hostel_block', hostelBlock)
            blockUserIds = (blockUsers || []).map((u: { id: string }) => u.id)
        }

        // Calculate the overall date range and compute week boundaries
        const weekBoundaries: { startStr: string; endStr: string }[] = []
        for (let i = 0; i < weeks; i++) {
            const weekEnd = new Date(now)
            weekEnd.setDate(weekEnd.getDate() - (i * 7))
            const weekStart = new Date(weekEnd)
            weekStart.setDate(weekStart.getDate() - 7)
            weekBoundaries.push({
                startStr: weekStart.toISOString().split('T')[0],
                endStr: weekEnd.toISOString().split('T')[0],
            })
        }

        // Single bulk query for all reviews across the entire date range (eliminates N+1)
        const globalStart = weekBoundaries[weekBoundaries.length - 1].startStr
        const globalEnd = weekBoundaries[0].endStr

        if (blockUserIds !== null && blockUserIds.length === 0) {
            // No students in this block — all weeks are empty
            for (const { startStr, endStr } of weekBoundaries) {
                weeklyData.push({
                    weekLabel: `${startStr} to ${endStr}`,
                    totalReviews: 0, avgRating: 0, positive: 0, neutral: 0, negative: 0,
                    mealBreakdown: {},
                })
            }
        } else {
            let bulkQuery = supabase
                .from('reviews')
                .select('rating, sentiment, meal_type, date')
                .gte('date', globalStart)
                .lte('date', globalEnd)

            if (blockUserIds !== null && blockUserIds.length > 0) {
                bulkQuery = bulkQuery.in('user_id', blockUserIds)
            }

            const { data: allReviews } = await bulkQuery

            // Group reviews into week buckets using extracted helper
            for (const { startStr, endStr } of weekBoundaries) {
                const reviews = (allReviews || []).filter(
                    (r) => r.date >= startStr && r.date <= endStr
                )
                weeklyData.push(aggregateWeekBucket(reviews, startStr, endStr))
            }
        }

        // Complaint stats for the period
        const totalDays = weeks * 7
        const reportStart = new Date(now)
        reportStart.setDate(reportStart.getDate() - totalDays)

        let complaintQuery = supabase
            .from('complaints')
            .select('status, category, created_at')
            .gte('created_at', reportStart.toISOString())

        if (hostelBlock) {
            complaintQuery = complaintQuery.eq('hostel_block', hostelBlock)
        }

        const { data: complaints } = await complaintQuery

        const complaintStats = buildComplaintStats((complaints || []) as ComplaintRecord[])

        return NextResponse.json({
            weeklyData: weeklyData.reverse(),
            complaintStats,
            hostelBlock: hostelBlock || 'all',
            generatedAt: new Date().toISOString(),
        })
    } catch (error) {
        console.error('Weekly report error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
