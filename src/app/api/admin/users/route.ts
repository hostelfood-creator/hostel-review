import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { logAdminAction } from '@/lib/audit'

/** GET — List and search users (admin/super_admin only) */
export async function GET(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = await checkRateLimit(`user-mgmt-get:${ip}`, 30, 60 * 1000)
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
    const search = searchParams.get('search') || ''
    const roleFilter = searchParams.get('role') || ''
    const blockFilter = searchParams.get('block') || ''
    const yearFilter = searchParams.get('year') || ''
    const statusFilter = searchParams.get('status') || '' // active, deactivated
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(10, parseInt(searchParams.get('pageSize') || '25')))
    const offset = (page - 1) * pageSize

    const serviceDb = createServiceClient()

    // Helper to build and execute the profiles query.
    // The `deactivated` column is added by migration and may not exist yet;
    // if the query fails we retry without it so the page still loads.
    async function fetchProfiles(includeDeactivated: boolean) {
      const cols = includeDeactivated
        ? 'id, register_id, name, email, role, hostel_block, department, year, created_at, deactivated'
        : 'id, register_id, name, email, role, hostel_block, department, year, created_at'
      let q = serviceDb
        .from('profiles')
        .select(cols, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1)

      // Admin can only see users in their block
      if (profile.role === 'admin' && profile.hostel_block) {
        q = q.eq('hostel_block', profile.hostel_block)
      }

      if (search) {
        const safeSearch = search.replace(/[,.()'"\\\/_%]/g, '')
        if (safeSearch.length > 0) {
          q = q.or(`name.ilike.%${safeSearch}%,register_id.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`)
        }
      }
      if (roleFilter) q = q.eq('role', roleFilter)
      if (blockFilter) q = q.eq('hostel_block', blockFilter)
      // NOTE: yearFilter is applied post-query after student_records enrichment
      if (includeDeactivated) {
        if (statusFilter === 'deactivated') q = q.eq('deactivated', true)
        if (statusFilter === 'active') q = q.or('deactivated.is.null,deactivated.eq.false')
      }

      return q
    }

    let { data, count, error } = await fetchProfiles(true)

    // Retry without `deactivated` column if it doesn't exist yet (migration not run)
    if (error) {
      console.warn('User management: retrying without deactivated column —', error.message)
      const retry = await fetchProfiles(false)
      data = retry.data
      count = retry.count
      error = retry.error
    }

    if (error) {
      console.error('User management fetch error:', error)
      return NextResponse.json({ error: `Failed to fetch users: ${error.message}` }, { status: 500 })
    }

    // Enrich profiles with data from student_records for missing department/year
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let enrichedUsers: any[] = data || []
    if (enrichedUsers.length > 0) {
      const registerIds = enrichedUsers
        .filter((u) => u.register_id)
        .map((u) => (u.register_id as string).trim().toUpperCase())

      if (registerIds.length > 0) {
        const { data: studentRecords } = await serviceDb
          .from('student_records')
          .select('register_id, department, year, room_no')
          .in('register_id', registerIds)

        if (studentRecords && studentRecords.length > 0) {
          const recordMap = new Map(studentRecords.map((sr: Record<string, unknown>) => [
            (sr.register_id as string).toUpperCase(),
            sr,
          ]))

          enrichedUsers = enrichedUsers.map((u) => {
            const sr = recordMap.get(((u.register_id as string) || '').toUpperCase()) as Record<string, unknown> | undefined
            if (sr) {
              return {
                ...u,
                department: u.department || sr.department,
                year: u.year || sr.year,
                room_no: sr.room_no || null,
              }
            }
            return u
          })
        }
      }
    }

    // Apply year filter post-enrichment (year often lives in student_records, not profiles)
    if (yearFilter) {
      enrichedUsers = enrichedUsers.filter(
        (u) => u.year && u.year.toUpperCase() === yearFilter.toUpperCase()
      )
    }

    return NextResponse.json({
      users: enrichedUsers,
      total: yearFilter ? enrichedUsers.length : (count || 0),
      page,
      pageSize,
    })
  } catch (error) {
    console.error('User management error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** PATCH — Update user (deactivate/reactivate, change role) */
export async function PATCH(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = await checkRateLimit(`user-mgmt-patch:${ip}`, 20, 60 * 1000)
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

    const body = await request.json()
    const { userId, action } = body

    if (!userId || !action) {
      return NextResponse.json({ error: 'userId and action are required' }, { status: 400 })
    }

    if (userId === user.id) {
      return NextResponse.json({ error: 'Cannot modify your own account' }, { status: 400 })
    }

    const serviceDb = createServiceClient()

    // Get target user
    const { data: targetUser } = await serviceDb
      .from('profiles')
      .select('id, role, hostel_block, name')
      .eq('id', userId)
      .single()

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Admin can only manage students in their block
    if (profile.role === 'admin') {
      if (targetUser.role !== 'student') {
        return NextResponse.json({ error: 'Admins can only manage students' }, { status: 403 })
      }
      if (targetUser.hostel_block !== profile.hostel_block) {
        return NextResponse.json({ error: 'You can only manage students in your hostel block' }, { status: 403 })
      }
    }

    const updates: Record<string, unknown> = {}

    switch (action) {
      case 'deactivate':
        updates.deactivated = true
        // Also ban the auth user to prevent login
        await serviceDb.auth.admin.updateUserById(userId, { ban_duration: '876000h' }) // ~100 years
        break

      case 'reactivate':
        updates.deactivated = false
        await serviceDb.auth.admin.updateUserById(userId, { ban_duration: 'none' })
        break

      case 'promote_admin':
        if (profile.role !== 'super_admin') {
          return NextResponse.json({ error: 'Only super_admin can promote users' }, { status: 403 })
        }
        if (targetUser.role !== 'student') {
          return NextResponse.json({ error: 'Can only promote students to admin' }, { status: 400 })
        }
        updates.role = 'admin'
        break

      case 'demote_student':
        if (profile.role !== 'super_admin') {
          return NextResponse.json({ error: 'Only super_admin can demote users' }, { status: 403 })
        }
        if (targetUser.role !== 'admin') {
          return NextResponse.json({ error: 'Can only demote admins to student' }, { status: 400 })
        }
        updates.role = 'student'
        break

      default:
        return NextResponse.json({ error: 'Invalid action. Use: deactivate, reactivate, promote_admin, demote_student' }, { status: 400 })
    }

    const { error } = await serviceDb
      .from('profiles')
      .update(updates)
      .eq('id', userId)

    if (error) {
      console.error('User update error:', error)
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
    }

    logAdminAction(user.id, profile.role, `user_${action}`, 'user', userId, { targetName: targetUser.name, targetRole: targetUser.role }, ip)

    return NextResponse.json({ success: true, action })
  } catch (error) {
    console.error('User management PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
