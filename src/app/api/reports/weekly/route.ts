<<<<<<< HEAD
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: Request) {
    try {
        // Rate limit: 10 report requests per minute per IP
        const ip = getClientIp(request)
        const rl = checkRateLimit(`reports-weekly:${ip}`, 10, 60 * 1000)
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
        const hostelBlock = searchParams.get('hostelBlock') || (profile.role === 'admin' ? profile.hostel_block : undefined)

        // Calculate date ranges for each week
        const now = new Date()
        const weeklyData = []

        for (let i = 0; i < weeks; i++) {
            const weekEnd = new Date(now)
            weekEnd.setDate(weekEnd.getDate() - (i * 7))
            const weekStart = new Date(weekEnd)
            weekStart.setDate(weekStart.getDate() - 7)

            const startStr = weekStart.toISOString().split('T')[0]
            const endStr = weekEnd.toISOString().split('T')[0]

            let query = supabase
                .from('reviews')
                .select('rating, sentiment, meal_type, date')
                .gte('date', startStr)
                .lte('date', endStr)

            if (hostelBlock) {
                // Get user IDs in this hostel block
                const { data: blockUsers } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('hostel_block', hostelBlock)
                const userIds = (blockUsers || []).map((u: { id: string }) => u.id)
                if (userIds.length > 0) {
                    query = query.in('user_id', userIds)
                } else {
                    weeklyData.push({
                        weekLabel: `${startStr} to ${endStr}`,
                        totalReviews: 0,
                        avgRating: 0,
                        positive: 0,
                        neutral: 0,
                        negative: 0,
                        mealBreakdown: {},
                    })
                    continue
                }
            }

            const { data: reviews } = await query

            if (!reviews || reviews.length === 0) {
                weeklyData.push({
                    weekLabel: `${startStr} to ${endStr}`,
                    totalReviews: 0,
                    avgRating: 0,
                    positive: 0,
                    neutral: 0,
                    negative: 0,
                    mealBreakdown: {},
                })
                continue
            }

            const totalReviews = reviews.length
            const avgRating = Math.round((reviews.reduce((s, r) => s + r.rating, 0) / totalReviews) * 100) / 100
            const positive = reviews.filter((r) => r.sentiment === 'positive').length
            const neutral = reviews.filter((r) => r.sentiment === 'neutral').length
            const negative = reviews.filter((r) => r.sentiment === 'negative').length

            // Meal breakdown
            const mealBreakdown: Record<string, { count: number; avgRating: number }> = {}
            const mealGroups = new Map<string, number[]>()
            reviews.forEach((r) => {
                const list = mealGroups.get(r.meal_type) || []
                list.push(r.rating)
                mealGroups.set(r.meal_type, list)
            })
            mealGroups.forEach((ratings, meal) => {
                mealBreakdown[meal] = {
                    count: ratings.length,
                    avgRating: Math.round((ratings.reduce((s, v) => s + v, 0) / ratings.length) * 100) / 100,
                }
            })

            weeklyData.push({
                weekLabel: `${startStr} to ${endStr}`,
                totalReviews,
                avgRating,
                positive,
                neutral,
                negative,
                mealBreakdown,
            })
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

        const complaintStats = {
            total: (complaints || []).length,
            pending: (complaints || []).filter((c) => c.status === 'pending').length,
            inProgress: (complaints || []).filter((c) => c.status === 'in_progress').length,
            resolved: (complaints || []).filter((c) => c.status === 'resolved').length,
            byCategory: {} as Record<string, number>,
        }

            ; (complaints || []).forEach((c) => {
                complaintStats.byCategory[c.category] = (complaintStats.byCategory[c.category] || 0) + 1
            })

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
=======
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: Request) {
    try {
        // Rate limit: 10 report requests per minute per IP
        const ip = getClientIp(request)
        const rl = checkRateLimit(`reports-weekly:${ip}`, 10, 60 * 1000)
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
        const hostelBlock = searchParams.get('hostelBlock') || (profile.role === 'admin' ? profile.hostel_block : undefined)

        // Calculate date ranges for each week
        const now = new Date()
        const weeklyData = []

        for (let i = 0; i < weeks; i++) {
            const weekEnd = new Date(now)
            weekEnd.setDate(weekEnd.getDate() - (i * 7))
            const weekStart = new Date(weekEnd)
            weekStart.setDate(weekStart.getDate() - 7)

            const startStr = weekStart.toISOString().split('T')[0]
            const endStr = weekEnd.toISOString().split('T')[0]

            let query = supabase
                .from('reviews')
                .select('rating, sentiment, meal_type, date')
                .gte('date', startStr)
                .lte('date', endStr)

            if (hostelBlock) {
                // Get user IDs in this hostel block
                const { data: blockUsers } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('hostel_block', hostelBlock)
                const userIds = (blockUsers || []).map((u: { id: string }) => u.id)
                if (userIds.length > 0) {
                    query = query.in('user_id', userIds)
                } else {
                    weeklyData.push({
                        weekLabel: `${startStr} to ${endStr}`,
                        totalReviews: 0,
                        avgRating: 0,
                        positive: 0,
                        neutral: 0,
                        negative: 0,
                        mealBreakdown: {},
                    })
                    continue
                }
            }

            const { data: reviews } = await query

            if (!reviews || reviews.length === 0) {
                weeklyData.push({
                    weekLabel: `${startStr} to ${endStr}`,
                    totalReviews: 0,
                    avgRating: 0,
                    positive: 0,
                    neutral: 0,
                    negative: 0,
                    mealBreakdown: {},
                })
                continue
            }

            const totalReviews = reviews.length
            const avgRating = Math.round((reviews.reduce((s, r) => s + r.rating, 0) / totalReviews) * 100) / 100
            const positive = reviews.filter((r) => r.sentiment === 'positive').length
            const neutral = reviews.filter((r) => r.sentiment === 'neutral').length
            const negative = reviews.filter((r) => r.sentiment === 'negative').length

            // Meal breakdown
            const mealBreakdown: Record<string, { count: number; avgRating: number }> = {}
            const mealGroups = new Map<string, number[]>()
            reviews.forEach((r) => {
                const list = mealGroups.get(r.meal_type) || []
                list.push(r.rating)
                mealGroups.set(r.meal_type, list)
            })
            mealGroups.forEach((ratings, meal) => {
                mealBreakdown[meal] = {
                    count: ratings.length,
                    avgRating: Math.round((ratings.reduce((s, v) => s + v, 0) / ratings.length) * 100) / 100,
                }
            })

            weeklyData.push({
                weekLabel: `${startStr} to ${endStr}`,
                totalReviews,
                avgRating,
                positive,
                neutral,
                negative,
                mealBreakdown,
            })
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

        const complaintStats = {
            total: (complaints || []).length,
            pending: (complaints || []).filter((c) => c.status === 'pending').length,
            inProgress: (complaints || []).filter((c) => c.status === 'in_progress').length,
            resolved: (complaints || []).filter((c) => c.status === 'resolved').length,
            byCategory: {} as Record<string, number>,
        }

            ; (complaints || []).forEach((c) => {
                complaintStats.byCategory[c.category] = (complaintStats.byCategory[c.category] || 0) + 1
            })

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
>>>>>>> 0200fb90bb8a9c38a8b428bf606ec91468124b07
