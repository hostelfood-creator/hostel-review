import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

const VALID_CATEGORIES = ['hygiene', 'taste', 'quantity', 'timing', 'other']
const VALID_STATUSES = ['pending', 'in_progress', 'resolved']

export async function GET(request: Request) {
    try {
        // Rate limit: 30 reads per minute per IP
        const ip = getClientIp(request)
        const rl = await checkRateLimit(`complaints-get:${ip}`, 30, 60 * 1000)
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

        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
        }

        const { searchParams } = new URL(request.url)
        const hostelBlockFilter = searchParams.get('hostelBlock') || undefined
        const statusFilter = searchParams.get('status') || undefined
        const categoryFilter = searchParams.get('category') || undefined

        // Pagination
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
        const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get('pageSize') || '50')))
        const offset = (page - 1) * pageSize

        let query = supabase
            .from('complaints')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })

        if (profile.role === 'student') {
            query = query.eq('user_id', user.id)
        } else if (profile.role === 'admin') {
            if (!profile.hostel_block) {
                return NextResponse.json({ error: 'Your admin account has no hostel block assigned' }, { status: 403 })
            }
            query = query.eq('hostel_block', profile.hostel_block)
        } else if (profile.role === 'super_admin' && hostelBlockFilter) {
            query = query.eq('hostel_block', hostelBlockFilter)
        } else if (profile.role !== 'super_admin') {
            // Fail-closed: unknown/null roles default to own records only
            query = query.eq('user_id', user.id)
        }

        if (statusFilter && VALID_STATUSES.includes(statusFilter)) {
            query = query.eq('status', statusFilter)
        }
        if (categoryFilter && VALID_CATEGORIES.includes(categoryFilter)) {
            query = query.eq('category', categoryFilter)
        }

        const { data: complaints, error, count } = await query.range(offset, offset + pageSize - 1)

        if (error) {
            console.error('Complaints query error:', error)
            return NextResponse.json({ error: 'Failed to fetch complaints' }, { status: 500 })
        }

        const total = count ?? (complaints || []).length

        // Resolve student names and register IDs via service role client (bypasses RLS)
        const serviceDb = createServiceClient()
        const allUserIds = new Set<string>()
            ; (complaints || []).forEach((c: { user_id: string; replied_by: string | null }) => {
                allUserIds.add(c.user_id)
                if (c.replied_by) allUserIds.add(c.replied_by)
            })
        const uniqueUserIds = [...allUserIds]
        const profileMap = new Map<string, { name: string; register_id: string; hostel_block: string | null }>()

        if (uniqueUserIds.length > 0) {
            const { data: profiles } = await serviceDb
                .from('profiles')
                .select('id, name, register_id, hostel_block')
                .in('id', uniqueUserIds)

                ; (profiles || []).forEach((p: { id: string; name: string; register_id: string; hostel_block: string | null }) =>
                    profileMap.set(p.id, { name: p.name, register_id: p.register_id, hostel_block: p.hostel_block })
                )
        }

        const enrichedComplaints = (complaints || []).map((c: {
            id: string; user_id: string; hostel_block: string; complaint_text: string;
            category: string; status: string; admin_reply: string | null;
            replied_at: string | null; replied_by: string | null; created_at: string
        }) => {
            const studentProfile = profileMap.get(c.user_id)
            const replierProfile = c.replied_by ? profileMap.get(c.replied_by) : null
            return {
                id: c.id,
                userId: c.user_id,
                hostelBlock: c.hostel_block,
                complaintText: c.complaint_text,
                category: c.category,
                status: c.status,
                adminReply: c.admin_reply,
                repliedAt: c.replied_at,
                repliedByName: replierProfile?.name || null,
                studentName: studentProfile?.name || 'Unknown',
                registerNumber: studentProfile?.register_id || 'N/A',
                createdAt: c.created_at,
            }
        })

        let hostelBlocks: string[] = []
        if (profile.role === 'super_admin') {
            const { data: blocks } = await supabase
                .from('hostel_blocks')
                .select('name')
                .order('name', { ascending: true })
            hostelBlocks = (blocks || []).map((b: { name: string }) => b.name)
        }

        return NextResponse.json({
            complaints: enrichedComplaints,
            userRole: profile.role,
            userBlock: profile.hostel_block,
            hostelBlocks,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize),
            },
        })
    } catch (error) {
        console.error('Complaints GET error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        // Rate limit: 5 complaints per hour per IP
        const ip = getClientIp(request)
        const rl = await checkRateLimit(`complaints-post:${ip}`, 5, 60 * 60 * 1000)
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

        if (!profile || profile.role !== 'student') {
            return NextResponse.json({ error: 'Only students can submit complaints' }, { status: 403 })
        }

        if (!profile.hostel_block) {
            return NextResponse.json({ error: 'No hostel block assigned to your profile' }, { status: 400 })
        }

        const body = await request.json()
        const complaintText = (body.complaintText || '').trim()
        const category = body.category || 'other'

        if (!complaintText) {
            return NextResponse.json({ error: 'Complaint text is required' }, { status: 400 })
        }

        if (complaintText.length > 2000) {
            return NextResponse.json({ error: 'Complaint text must be under 2000 characters' }, { status: 400 })
        }

        if (!VALID_CATEGORIES.includes(category)) {
            return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
        }

        const { data: inserted, error } = await supabase
            .from('complaints')
            .insert({
                user_id: user.id,
                hostel_block: profile.hostel_block,
                complaint_text: complaintText,
                category,
                status: 'pending',
            })
            .select()
            .single()

        if (error) {
            console.error('Complaint insert error:', error)
            return NextResponse.json({ error: 'Failed to submit complaint' }, { status: 500 })
        }

        return NextResponse.json({ complaint: { id: inserted.id } })
    } catch (error) {
        console.error('Complaints POST error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function PATCH(request: Request) {
    try {
        // Rate limit: 20 updates per minute per IP
        const ip = getClientIp(request)
        const rl = await checkRateLimit(`complaints-patch:${ip}`, 20, 60 * 1000)
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
            return NextResponse.json({ error: 'Only admins can reply to complaints' }, { status: 403 })
        }

        const body = await request.json()
        const { complaintId, reply, status } = body

        if (!complaintId) {
            return NextResponse.json({ error: 'Complaint ID is required' }, { status: 400 })
        }

        // Block-scope enforcement: regular admins can only update complaints in their block
        if (profile.role === 'admin') {
            if (!profile.hostel_block) {
                return NextResponse.json({ error: 'Your admin account has no hostel block assigned' }, { status: 403 })
            }

            const { data: complaint } = await supabase
                .from('complaints')
                .select('hostel_block')
                .eq('id', complaintId)
                .single()

            if (!complaint || complaint.hostel_block !== profile.hostel_block) {
                return NextResponse.json({ error: 'You can only manage complaints in your assigned block' }, { status: 403 })
            }
        }

        const updates: Record<string, unknown> = {}

        if (reply !== undefined) {
            const replyText = (reply || '').trim()
            if (replyText.length > 1000) {
                return NextResponse.json({ error: 'Reply must be under 1000 characters' }, { status: 400 })
            }
            updates.admin_reply = replyText || null
            if (replyText) {
                updates.replied_at = new Date().toISOString()
                updates.replied_by = user.id
            }
        }

        if (status !== undefined) {
            if (!VALID_STATUSES.includes(status)) {
                return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
            }
            updates.status = status
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
        }

        const { error } = await supabase
            .from('complaints')
            .update(updates)
            .eq('id', complaintId)

        if (error) {
            console.error('Complaint update error:', error)
            return NextResponse.json({ error: 'Failed to update complaint' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Complaints PATCH error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
