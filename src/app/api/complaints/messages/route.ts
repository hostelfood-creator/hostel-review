import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/complaints/messages?complaintId=xxx — Fetch threaded messages for a complaint
 * POST /api/complaints/messages — Send a new message in a complaint thread
 *
 * Both students (complaint owner) and admins (assigned block or super) can participate.
 */

export async function GET(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = await checkRateLimit(`complaint-messages-get:${ip}`, 30, 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const complaintId = searchParams.get('complaintId')

    if (!complaintId) {
      return NextResponse.json({ error: 'complaintId is required' }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, hostel_block')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Verify access: students can only see their own complaints' messages
    const serviceDb = createServiceClient()
    const { data: complaint, error: complaintError } = await serviceDb
      .from('complaints')
      .select('id, user_id, hostel_block')
      .eq('id', complaintId)
      .single()

    if (complaintError || !complaint) {
      return NextResponse.json({ error: 'Complaint not found' }, { status: 404 })
    }

    // Access check
    if (profile.role === 'student' && complaint.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (profile.role === 'admin' && profile.hostel_block !== complaint.hostel_block) {
      return NextResponse.json({ error: 'Forbidden — different block' }, { status: 403 })
    }

    // Fetch messages
    const { data: messages, error: msgError } = await serviceDb
      .from('complaint_messages')
      .select('*')
      .eq('complaint_id', complaintId)
      .order('created_at', { ascending: true })

    if (msgError) {
      console.error('[ComplaintMessages] Query error:', msgError)
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    // Resolve sender names
    const senderIds = [...new Set((messages || []).map((m: { sender_id: string }) => m.sender_id))]
    const nameMap = new Map<string, { name: string; role: string }>()

    if (senderIds.length > 0) {
      const { data: profiles } = await serviceDb
        .from('profiles')
        .select('id, name, role')
        .in('id', senderIds)

      for (const p of profiles || []) {
        nameMap.set(p.id, { name: p.name, role: p.role })
      }
    }

    const enrichedMessages = (messages || []).map((m: { id: string; sender_id: string; message: string; created_at: string }) => ({
      id: m.id,
      senderId: m.sender_id,
      senderName: nameMap.get(m.sender_id)?.name || 'Unknown',
      senderRole: nameMap.get(m.sender_id)?.role || 'student',
      message: m.message,
      createdAt: m.created_at,
      isOwn: m.sender_id === user.id,
    }))

    return NextResponse.json({ messages: enrichedMessages })
  } catch (error) {
    console.error('[ComplaintMessages] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = await checkRateLimit(`complaint-messages-post:${ip}`, 15, 60 * 1000)
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

    const body = await request.json()
    const complaintId = body.complaintId
    const message = (body.message || '').trim()

    if (!complaintId) {
      return NextResponse.json({ error: 'complaintId is required' }, { status: 400 })
    }
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }
    if (message.length > 1000) {
      return NextResponse.json({ error: 'Message must be under 1000 characters' }, { status: 400 })
    }

    // Verify access
    const serviceDb = createServiceClient()
    const { data: complaint, error: complaintError } = await serviceDb
      .from('complaints')
      .select('id, user_id, hostel_block')
      .eq('id', complaintId)
      .single()

    if (complaintError || !complaint) {
      return NextResponse.json({ error: 'Complaint not found' }, { status: 404 })
    }

    if (profile.role === 'student' && complaint.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (profile.role === 'admin' && profile.hostel_block !== complaint.hostel_block) {
      return NextResponse.json({ error: 'Forbidden — different block' }, { status: 403 })
    }

    // Insert message
    const { data: inserted, error: insertError } = await serviceDb
      .from('complaint_messages')
      .insert({
        complaint_id: complaintId,
        sender_id: user.id,
        message,
      })
      .select()
      .single()

    if (insertError) {
      console.error('[ComplaintMessages] Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
    }

    return NextResponse.json({
      message: {
        id: inserted.id,
        senderId: user.id,
        senderName: profile.role === 'student' ? 'You' : 'Admin',
        senderRole: profile.role,
        message: inserted.message,
        createdAt: inserted.created_at,
        isOwn: true,
      },
    })
  } catch (error) {
    console.error('[ComplaintMessages] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
