import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { getISTDate } from '@/lib/time'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Strip HTML tags and limit length — defense-in-depth layer for stored content.
 *  NOTE: This is NOT a full XSS sanitizer. React auto-escapes on render;
 *  this only strips obvious tags to keep notification text clean. */
function sanitize(text: string | null | undefined, maxLen = 200): string {
    if (!text) return ''
    return text.replace(/<[^>]*>/g, '').trim().slice(0, maxLen)
}

interface Notification {
    id: string
    type: string
    title: string
    message: string
    timestamp: string
    read: boolean
}

// ── Notification builders ────────────────────────────────────────────────────

async function buildStudentNotifications(
    supabase: SupabaseClient,
    userId: string,
): Promise<Notification[]> {
    const notifications: Notification[] = []

    // Replied complaints
    const { data: repliedComplaints } = await supabase
        .from('complaints')
        .select('id, admin_reply, replied_at, status')
        .eq('user_id', userId)
        .not('admin_reply', 'is', null)
        .order('replied_at', { ascending: false })
        .limit(10)

    for (const c of repliedComplaints || []) {
        notifications.push({
            id: `complaint-reply-${c.id}`,
            type: 'complaint_reply',
            title: c.status === 'resolved' ? 'Complaint Resolved' : 'Admin Replied',
            message: sanitize(c.admin_reply, 100) || 'Your complaint has been reviewed.',
            timestamp: c.replied_at,
            read: false,
        })
    }

    // Today's menu updates (IST-safe)
    const today = getISTDate()
    const { data: todayMenus } = await supabase
        .from('menus')
        .select('meal_type, items')
        .eq('date', today)

    if ((todayMenus || []).length > 0) {
        notifications.push({
            id: `menu-update-${today}-${(todayMenus || []).length}`,
            type: 'menu_update',
            title: "Today's Menu Updated",
            message: `${(todayMenus || []).length} meal(s) have been updated for today.`,
            timestamp: new Date().toISOString(),
            read: false,
        })
    }

    return notifications
}

async function buildAdminNotifications(
    supabase: SupabaseClient,
    profile: { role: string; hostel_block: string | null },
): Promise<Notification[]> {
    const notifications: Notification[] = []

    // Pending complaints
    let complaintQuery = supabase
        .from('complaints')
        .select('id, complaint_text, created_at, hostel_block', { count: 'exact' })
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5)

    if (profile.role === 'admin' && profile.hostel_block) {
        complaintQuery = complaintQuery.eq('hostel_block', profile.hostel_block)
    }

    const { data: pendingComplaints, count: pendingCount } = await complaintQuery

    if ((pendingCount || 0) > 0) {
        const previewText = sanitize((pendingComplaints || [])[0]?.complaint_text, 80)
        notifications.push({
            id: 'pending-complaints',
            type: 'pending_complaints',
            title: `${pendingCount} Pending Complaint${(pendingCount || 0) > 1 ? 's' : ''}`,
            message: previewText ? previewText + '...' : 'New complaints need your attention.',
            timestamp: (pendingComplaints || [])[0]?.created_at || new Date().toISOString(),
            read: false,
        })
    }

    // Low-rated reviews today (IST-safe)
    const today = getISTDate()
    const { count: lowCount } = await supabase
        .from('reviews')
        .select('id', { count: 'exact', head: true })
        .eq('date', today)
        .lte('rating', 2)

    if ((lowCount || 0) >= 3) {
        notifications.push({
            id: `low-ratings-${today}`,
            type: 'low_ratings',
            title: 'Low Rating Alert',
            message: `${lowCount} reviews with ratings ≤ 2 stars today. Please check the reviews section.`,
            timestamp: new Date().toISOString(),
            read: false,
        })
    }

    // Meal attendance summary for today (IST-safe)
    let checkinQuery = supabase
        .from('meal_checkins')
        .select('meal_type')
        .eq('date', today)

    if (profile.role === 'admin' && profile.hostel_block) {
        checkinQuery = checkinQuery.eq('hostel_block', profile.hostel_block)
    }

    const { data: checkins } = await checkinQuery
    if (checkins && checkins.length > 0) {
        const mealCounts: Record<string, number> = {}
        for (const c of checkins) {
            mealCounts[c.meal_type] = (mealCounts[c.meal_type] || 0) + 1
        }
        const parts = Object.entries(mealCounts)
            .map(([meal, count]) => `${meal.charAt(0).toUpperCase() + meal.slice(1)}: ${count}`)
            .join(', ')

        notifications.push({
            id: `meal-attendance-${today}`,
            type: 'meal_attendance',
            title: 'Meal Attendance Today',
            message: `${checkins.length} total check-ins — ${parts}`,
            timestamp: new Date().toISOString(),
            read: false,
        })
    }

    return notifications
}

export async function GET(request: Request) {
    try {
        // Rate limit: 30 notification requests per minute per IP
        const ip = getClientIp(request)
        const rl = await checkRateLimit(`notifications:${ip}`, 30, 60 * 1000)
        if (!rl.allowed) return rateLimitResponse(rl.resetAt)

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role, hostel_block, name, created_at')
            .eq('id', user.id)
            .single()

        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
        }

        // Build notifications based on role
        // Read tracking: server-side via notification_reads table (with localStorage fallback on client)
        const notifications: Notification[] = []

        // ── Welcome notification for newly registered users (within 7 days) ──
        if (profile.created_at) {
            const createdAt = new Date(profile.created_at)
            const daysSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
            if (daysSinceCreation <= 7) {
                const firstName = sanitize(profile.name, 30).split(' ')[0] || 'there'
                notifications.push({
                    id: `welcome-${user.id}`,
                    type: 'welcome',
                    title: `Welcome, ${firstName}!`,
                    message: 'You\'re all set! Rate your meals, scan QR for check-in, and file complaints — your voice shapes the hostel experience.',
                    timestamp: profile.created_at,
                    read: false,
                })
            }
        }

        if (profile.role === 'student') {
            notifications.push(...await buildStudentNotifications(supabase, user.id))
        }

        if (['admin', 'super_admin'].includes(profile.role)) {
            notifications.push(...await buildAdminNotifications(supabase, profile))
        }

        // Mark read notifications using server-side notification_reads table
        const serviceDb = createServiceClient()
        const notifIds = notifications.map(n => n.id)
        if (notifIds.length > 0) {
            const { data: readEntries } = await serviceDb
                .from('notification_reads')
                .select('notification_id')
                .eq('user_id', user.id)
                .in('notification_id', notifIds)

            const readSet = new Set((readEntries || []).map(r => r.notification_id))
            for (const n of notifications) {
                n.read = readSet.has(n.id)
            }
        }

        return NextResponse.json({ notifications })
    } catch (error) {
        console.error('Notifications error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

/**
 * POST — Mark notifications as read (server-side)
 * Body: { notificationIds: string[] }
 */
export async function POST(request: Request) {
    try {
        const ip = getClientIp(request)
        const rl = await checkRateLimit(`notifications-read:${ip}`, 30, 60 * 1000)
        if (!rl.allowed) return rateLimitResponse(rl.resetAt)

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
        }

        const body = await request.json()
        const notificationIds: string[] = body.notificationIds

        if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
            return NextResponse.json({ error: 'notificationIds array is required' }, { status: 400 })
        }

        // Limit to 50 per call to prevent abuse
        const ids = notificationIds.slice(0, 50)

        const serviceDb = createServiceClient()
        const rows = ids.map(id => ({
            user_id: user.id,
            notification_id: id,
        }))

        // Upsert to avoid duplicate key errors
        await serviceDb
            .from('notification_reads')
            .upsert(rows, { onConflict: 'user_id,notification_id', ignoreDuplicates: true })

        return NextResponse.json({ success: true, marked: ids.length })
    } catch (error) {
        console.error('Notification mark-read error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
