import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET — Export data as CSV
 * Supports: reviews, complaints, attendance, users
 */
export async function GET(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = await checkRateLimit(`export:${ip}`, 10, 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, hostel_block')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') // reviews, complaints, attendance, users
    const format = searchParams.get('format') || 'csv'
    const dateFrom = searchParams.get('from') || ''
    const dateTo = searchParams.get('to') || ''
    const blockFilter = searchParams.get('block') || ''

    if (format !== 'csv') {
      return NextResponse.json({ error: 'Only CSV format is currently supported' }, { status: 400 })
    }

    const serviceDb = createServiceClient()
    const effectiveBlock = profile.role === 'admin' ? profile.hostel_block : (blockFilter || null)

    let csvContent = ''
    let filename = ''

    switch (type) {
      case 'reviews': {
        let query = serviceDb
          .from('reviews')
          .select('id, user_id, date, meal_type, rating, review_text, sentiment, anonymous, created_at, admin_reply')
          .order('created_at', { ascending: false })
          .limit(5000)

        if (dateFrom) query = query.gte('date', dateFrom)
        if (dateTo) query = query.lte('date', dateTo)

        const { data: reviews } = await query

        // Enrich with profile data
        const userIds = [...new Set((reviews || []).map(r => r.user_id).filter(Boolean))]
        let profileMap: Record<string, { name: string; register_id: string; hostel_block: string }> = {}
        if (userIds.length > 0) {
          const { data: profiles } = await serviceDb
            .from('profiles')
            .select('id, name, register_id, hostel_block')
            .in('id', userIds)

          for (const p of profiles || []) {
            profileMap[p.id] = p
          }
        }

        // Filter by block after enrichment
        let filteredReviews = reviews || []
        if (effectiveBlock) {
          const blockUserIds = new Set(Object.entries(profileMap).filter(([, p]) => p.hostel_block === effectiveBlock).map(([id]) => id))
          filteredReviews = filteredReviews.filter((r: Record<string, unknown>) => blockUserIds.has(r.user_id as string))
        }

        csvContent = 'Date,Meal Type,Rating,Review,Sentiment,Student Name,Register ID,Hostel Block,Admin Reply,Created At\n'
        for (const r of filteredReviews) {
          const p = profileMap[(r as Record<string, unknown>).user_id as string] || { name: 'Anonymous', register_id: '', hostel_block: '' }
          const row = [
            r.date,
            r.meal_type,
            r.rating,
            csvEscape(r.review_text || ''),
            r.sentiment || '',
            r.anonymous ? 'Anonymous' : csvEscape(p.name),
            r.anonymous ? '' : p.register_id,
            p.hostel_block || '',
            csvEscape(r.admin_reply || ''),
            r.created_at,
          ]
          csvContent += row.join(',') + '\n'
        }
        filename = `reviews-export-${new Date().toISOString().split('T')[0]}.csv`
        break
      }

      case 'complaints': {
        let query = serviceDb
          .from('complaints')
          .select('id, hostel_block, complaint_text, category, status, priority, admin_reply, replied_at, created_at, user_id, escalated')
          .order('created_at', { ascending: false })
          .limit(5000)

        if (effectiveBlock) query = query.eq('hostel_block', effectiveBlock)
        if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`)
        if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`)

        const { data: complaints } = await query

        const userIds = [...new Set((complaints || []).map(c => c.user_id).filter(Boolean))]
        let profileMap: Record<string, { name: string; register_id: string }> = {}
        if (userIds.length > 0) {
          const { data: profiles } = await serviceDb
            .from('profiles')
            .select('id, name, register_id')
            .in('id', userIds)

          for (const p of profiles || []) {
            profileMap[p.id] = p
          }
        }

        csvContent = 'Date,Student Name,Register ID,Hostel Block,Category,Priority,Complaint,Status,Escalated,Admin Reply,Replied At\n'
        for (const c of complaints || []) {
          const p = profileMap[c.user_id] || { name: 'Unknown', register_id: '' }
          csvContent += [
            new Date(c.created_at).toLocaleDateString('en-IN'),
            csvEscape(p.name),
            p.register_id,
            c.hostel_block || '',
            c.category,
            c.priority || 'normal',
            csvEscape(c.complaint_text),
            c.status,
            c.escalated ? 'Yes' : 'No',
            csvEscape(c.admin_reply || ''),
            c.replied_at ? new Date(c.replied_at).toLocaleDateString('en-IN') : '',
          ].join(',') + '\n'
        }
        filename = `complaints-export-${new Date().toISOString().split('T')[0]}.csv`
        break
      }

      case 'attendance': {
        let query = serviceDb
          .from('meal_checkins')
          .select('id, user_id, meal_type, date, checked_in_at, hostel_block')
          .order('checked_in_at', { ascending: false })
          .limit(10000)

        if (effectiveBlock) query = query.eq('hostel_block', effectiveBlock)
        if (dateFrom) query = query.gte('date', dateFrom)
        if (dateTo) query = query.lte('date', dateTo)

        const { data: checkins } = await query

        const userIds = [...new Set((checkins || []).map(c => c.user_id).filter(Boolean))]
        let profileMap: Record<string, { name: string; register_id: string }> = {}
        if (userIds.length > 0) {
          const { data: profiles } = await serviceDb
            .from('profiles')
            .select('id, name, register_id')
            .in('id', userIds)

          for (const p of profiles || []) {
            profileMap[p.id] = p
          }
        }

        csvContent = 'Date,Meal Type,Student Name,Register ID,Hostel Block,Checked In At\n'
        for (const c of checkins || []) {
          const p = profileMap[c.user_id] || { name: 'Unknown', register_id: '' }
          csvContent += [
            c.date,
            c.meal_type,
            csvEscape(p.name),
            p.register_id,
            c.hostel_block || '',
            new Date(c.checked_in_at).toLocaleString('en-IN'),
          ].join(',') + '\n'
        }
        filename = `attendance-export-${new Date().toISOString().split('T')[0]}.csv`
        break
      }

      case 'users': {
        if (profile.role !== 'super_admin') {
          return NextResponse.json({ error: 'Only super_admin can export user data' }, { status: 403 })
        }

        let query = serviceDb
          .from('profiles')
          .select('register_id, name, email, role, hostel_block, department, year, created_at, deactivated')
          .order('created_at', { ascending: false })
          .limit(10000)

        if (blockFilter) query = query.eq('hostel_block', blockFilter)

        const { data: users } = await query

        csvContent = 'Register ID,Name,Email,Role,Hostel Block,Department,Year,Status,Joined\n'
        for (const u of users || []) {
          csvContent += [
            u.register_id,
            csvEscape(u.name),
            u.email,
            u.role,
            u.hostel_block || '',
            u.department || '',
            u.year || '',
            u.deactivated ? 'Deactivated' : 'Active',
            new Date(u.created_at).toLocaleDateString('en-IN'),
          ].join(',') + '\n'
        }
        filename = `users-export-${new Date().toISOString().split('T')[0]}.csv`
        break
      }

      default:
        return NextResponse.json({ error: 'Invalid export type. Use: reviews, complaints, attendance, users' }, { status: 400 })
    }

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Escape CSV cell value — wraps in quotes if it contains commas, quotes, or newlines */
function csvEscape(value: string): string {
  if (!value) return ''
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
