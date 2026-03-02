import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { logAdminAction } from '@/lib/audit'

/**
 * GET /api/admin/announcements — Fetch active announcements
 * Returns announcements targeted to the user's block or all blocks.
 *
 * POST /api/admin/announcements — Create a new announcement (admin/super_admin only)
 *
 * DELETE /api/admin/announcements — Delete an announcement by ID
 */

export async function GET(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = await checkRateLimit(`announcements-get:${ip}`, 30, 60 * 1000)
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

    const serviceDb = createServiceClient()
    const now = new Date().toISOString()

    // Build query based on role
    let query = serviceDb
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })

    // For students — only show active (not expired) announcements for their block or "all"
    if (profile.role === 'student') {
      query = query
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .or(`target_block.is.null,target_block.eq.all,target_block.eq.${profile.hostel_block || 'none'}`)
    } else if (profile.role === 'admin') {
      // Admin sees their block announcements + all-block ones
      query = query.or(`target_block.is.null,target_block.eq.all,target_block.eq.${profile.hostel_block || 'none'}`)
    }
    // super_admin sees everything (no filter)

    query = query.limit(20)

    const { data: announcements, error } = await query

    if (error) {
      console.error('[Announcements] Query error:', error)
      return NextResponse.json({ error: 'Failed to fetch announcements' }, { status: 500 })
    }

    return NextResponse.json({
      announcements: (announcements || []).map((a: Record<string, unknown>) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        priority: a.priority || 'normal',
        targetBlock: a.target_block,
        expiresAt: a.expires_at,
        createdAt: a.created_at,
        createdBy: a.created_by,
      })),
      userRole: profile.role,
    })
  } catch (error) {
    console.error('[Announcements] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = await checkRateLimit(`announcements-post:${ip}`, 10, 60 * 1000)
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
      return NextResponse.json({ error: 'Only admins can create announcements' }, { status: 403 })
    }

    const body = await request.json()
    const title = (body.title || '').trim()
    const announcementBody = (body.body || '').trim()
    const priority = ['low', 'normal', 'high', 'urgent'].includes(body.priority) ? body.priority : 'normal'
    const targetBlock = body.targetBlock || (profile.role === 'admin' ? profile.hostel_block : 'all')
    const expiresAt = body.expiresAt || null

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }
    if (title.length > 200) {
      return NextResponse.json({ error: 'Title must be under 200 characters' }, { status: 400 })
    }
    if (announcementBody.length > 1000) {
      return NextResponse.json({ error: 'Body must be under 1000 characters' }, { status: 400 })
    }

    // Admin can only target their own block
    if (profile.role === 'admin' && targetBlock !== profile.hostel_block && targetBlock !== 'all') {
      return NextResponse.json({ error: 'Admins can only target their assigned block' }, { status: 403 })
    }

    const serviceDb = createServiceClient()
    const { data: inserted, error } = await serviceDb
      .from('announcements')
      .insert({
        title,
        body: announcementBody || null,
        priority,
        target_block: targetBlock,
        expires_at: expiresAt,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('[Announcements] Insert error:', error)
      return NextResponse.json({ error: 'Failed to create announcement' }, { status: 500 })
    }

    logAdminAction(user.id, profile.role, 'announcement_create', 'announcement', inserted.id, { title, targetBlock, priority }, ip)

    return NextResponse.json({ announcement: { id: inserted.id }, message: 'Announcement created' })
  } catch (error) {
    console.error('[Announcements] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = await checkRateLimit(`announcements-delete:${ip}`, 10, 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'Announcement ID is required' }, { status: 400 })
    }

    const serviceDb = createServiceClient()

    // IDOR protection: regular admins can only delete their own announcements
    if (profile.role === 'admin') {
      const { data: announcement } = await serviceDb
        .from('announcements')
        .select('created_by')
        .eq('id', id)
        .single()

      if (!announcement) {
        return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })
      }
      if (announcement.created_by !== user.id) {
        return NextResponse.json({ error: 'You can only delete your own announcements' }, { status: 403 })
      }
    }

    const { error } = await serviceDb
      .from('announcements')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[Announcements] Delete error:', error)
      return NextResponse.json({ error: 'Failed to delete announcement' }, { status: 500 })
    }

    logAdminAction(user.id, profile.role, 'announcement_delete', 'announcement', id, {}, ip)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Announcements] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
