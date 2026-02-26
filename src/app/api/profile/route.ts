import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { lookupStudentName } from '@/lib/student-lookup'

export async function PATCH(request: Request) {
    try {
        // Rate limit: 10 profile updates per 15 minutes per IP
        const ip = getClientIp(request)
        const rl = checkRateLimit(`profile:${ip}`, 10, 15 * 60 * 1000)
        if (!rl.allowed) return rateLimitResponse(rl.resetAt)

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role, register_id')
            .eq('id', user.id)
            .single()

        if (!profile || profile.role !== 'student') {
            return NextResponse.json({ error: 'Only students can edit their profile' }, { status: 403 })
        }

        const body = await request.json()

        // Only allow updating name and year
        const updates: Record<string, string | null> = {}

        if (body.name !== undefined) {
            // Block name edits for verified students — prevents spoofing official records
            // Uses 5-minute in-memory cache to reduce DB queries
            if (profile.register_id) {
                const xlsxName = await lookupStudentName(profile.register_id)
                if (xlsxName) {
                    return NextResponse.json(
                        { error: 'Your name is verified from university records and cannot be changed' },
                        { status: 403 }
                    )
                }
            }

            const name = (body.name || '').trim()
            if (!name || name.length < 2 || name.length > 100) {
                return NextResponse.json({ error: 'Name must be between 2 and 100 characters' }, { status: 400 })
            }
            updates.name = name
        }

        if (body.year !== undefined) {
            const year = (body.year || '').trim()
            const validYears = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year']
            if (year && !validYears.includes(year)) {
                return NextResponse.json({ error: 'Invalid year value' }, { status: 400 })
            }
            updates.year = year || null
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
        }

        const { error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', user.id)

        if (error) {
            console.error('Profile update error:', error)
            return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Profile PATCH error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
