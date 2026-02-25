<<<<<<< HEAD
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

/**
 * Super Admin API — manage hostel blocks and admin users
 * Only accessible by users with role 'super_admin'
 */

// GET — list hostel blocks and admins
export async function GET(request: Request) {
    // Rate limit: 30 admin reads per minute per IP
    const ip = getClientIp(request)
    const rl = checkRateLimit(`admin-super-get:${ip}`, 30, 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'super_admin') {
        return NextResponse.json({ error: 'Forbidden — super admin only' }, { status: 403 })
    }

    const url = new URL(request.url)
    const action = url.searchParams.get('action')

    if (action === 'admins') {
        const { data: admins } = await supabase
            .from('profiles')
            .select('id, register_id, name, email, role, hostel_block, created_at')
            .in('role', ['admin', 'super_admin'])
            .order('created_at', { ascending: true })

        return NextResponse.json({ admins: admins || [] })
    }

    if (action === 'blocks') {
        const { data: blocks } = await supabase
            .from('hostel_blocks')
            .select('*')
            .order('name', { ascending: true })

        return NextResponse.json({ blocks: blocks || [] })
    }

    // Default: return both
    const [adminsRes, blocksRes] = await Promise.all([
        supabase
            .from('profiles')
            .select('id, register_id, name, email, role, hostel_block, created_at')
            .in('role', ['admin', 'super_admin'])
            .order('created_at', { ascending: true }),
        supabase
            .from('hostel_blocks')
            .select('*')
            .order('name', { ascending: true }),
    ])

    return NextResponse.json({
        admins: adminsRes.data || [],
        blocks: blocksRes.data || [],
    })
}

// POST — create hostel block or admin user
export async function POST(request: Request) {
    // Rate limit: 15 admin operations per 15 minutes per IP
    const ip = getClientIp(request)
    const rl = checkRateLimit(`admin-super:${ip}`, 15, 15 * 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'super_admin') {
        return NextResponse.json({ error: 'Forbidden — super admin only' }, { status: 403 })
    }

    const body = await request.json()
    const { action } = body

    // Add hostel block
    if (action === 'add_block') {
        const { name } = body
        if (!name || !name.trim()) {
            return NextResponse.json({ error: 'Block name is required' }, { status: 400 })
        }

        const { error } = await supabase
            .from('hostel_blocks')
            .insert({ name: name.trim().toUpperCase() })

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json({ error: 'Block already exists' }, { status: 409 })
            }
            console.error('Block creation error:', error.message)
            return NextResponse.json({ error: 'Failed to create block' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    }

    // Remove hostel block
    if (action === 'remove_block') {
        const { id } = body
        if (!id) {
            return NextResponse.json({ error: 'Block ID is required' }, { status: 400 })
        }

        const { error } = await supabase
            .from('hostel_blocks')
            .delete()
            .eq('id', id)

        if (error) {
            console.error('Block deletion error:', error.message)
            return NextResponse.json({ error: 'Failed to remove block' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    }

    // Add admin
    if (action === 'add_admin') {
        const { registerId, name, password, hostelBlock, role: newRole } = body
        if (!registerId || !name || !password) {
            return NextResponse.json({ error: 'Register ID, name, and password are required' }, { status: 400 })
        }

        // Password validation
        if (password.length < 8) {
            return NextResponse.json({ error: 'Password must be at least 8 characters long' }, { status: 400 })
        }
        if (password.length > 128) {
            return NextResponse.json({ error: 'Password must be at most 128 characters long' }, { status: 400 })
        }

        // Name length validation
        const trimmedName = name.trim()
        if (trimmedName.length < 2 || trimmedName.length > 60) {
            return NextResponse.json({ error: 'Name must be between 2 and 60 characters' }, { status: 400 })
        }

        // Register ID format validation
        const trimmedRegisterId = registerId.trim()
        if (trimmedRegisterId.length < 2 || trimmedRegisterId.length > 30) {
            return NextResponse.json({ error: 'Register ID must be between 2 and 30 characters' }, { status: 400 })
        }
        if (!/^[A-Za-z0-9]+$/.test(trimmedRegisterId)) {
            return NextResponse.json({ error: 'Register ID must be alphanumeric' }, { status: 400 })
        }

        // Validate role — only allow admin or super_admin
        const allowedRoles = ['admin', 'super_admin']
        const targetRole = allowedRoles.includes(newRole) ? newRole : 'admin'

        const syntheticEmail = `${trimmedRegisterId.toLowerCase()}@hostel.local`

        // Use service role client to create auth user.
        // email_confirm: true auto-verifies the email (skips confirmation step)
        // since admin-created users use synthetic emails, not real ones.
        const serviceDb = createServiceClient()
        const { data: authData, error: authError } = await serviceDb.auth.admin.createUser({
            email: syntheticEmail,
            password,
            email_confirm: true,
        })

        if (authError) {
            console.error('Admin auth creation error:', authError.message)
            const safeMessage = authError.message.toLowerCase().includes('already registered')
                ? 'This Register ID is already registered'
                : 'Failed to create admin user'
            return NextResponse.json({ error: safeMessage }, { status: 400 })
        }

        if (!authData.user) {
            return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
        }

        const { error: profileError } = await serviceDb.from('profiles').insert({
            id: authData.user.id,
            register_id: trimmedRegisterId.toUpperCase(),
            name: trimmedName,
            role: targetRole,
            hostel_block: (targetRole === 'admin' && hostelBlock) ? String(hostelBlock).trim() : null,
        })

        if (profileError) {
            // Rollback: delete the auth user if profile creation fails
            await serviceDb.auth.admin.deleteUser(authData.user.id)
            console.error('Admin profile creation error:', profileError.message)
            return NextResponse.json({ error: 'Failed to create admin profile' }, { status: 500 })
        }

        return NextResponse.json({ success: true, role: targetRole })
    }

    // Remove admin
    if (action === 'remove_admin') {
        const { id } = body
        if (!id) {
            return NextResponse.json({ error: 'Admin ID is required' }, { status: 400 })
        }

        // Don't allow removing yourself
        if (id === user.id) {
            return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 })
        }

        // Verify target is actually an admin/super_admin — prevent deleting student accounts
        const { data: targetProfile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', id)
            .single()

        if (!targetProfile || !['admin', 'super_admin'].includes(targetProfile.role)) {
            return NextResponse.json({ error: 'Target user is not an admin' }, { status: 400 })
        }

        // Delete profile row
        const { error } = await supabase
            .from('profiles')
            .delete()
            .eq('id', id)

        if (error) {
            console.error('Admin deletion error:', error.message)
            return NextResponse.json({ error: 'Failed to remove admin' }, { status: 500 })
        }

        // Also delete the auth user so they can't log in anymore
        const serviceDb = createServiceClient()
        const { error: authDeleteError } = await serviceDb.auth.admin.deleteUser(id)
        if (authDeleteError) {
            console.error('Failed to delete auth user during admin removal:', authDeleteError.message)
            // Profile is already deleted — log but don't fail the request
        }

        return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
=======
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

/**
 * Super Admin API — manage hostel blocks and admin users
 * Only accessible by users with role 'super_admin'
 */

// GET — list hostel blocks and admins
export async function GET(request: Request) {
    // Rate limit: 30 admin reads per minute per IP
    const ip = getClientIp(request)
    const rl = checkRateLimit(`admin-super-get:${ip}`, 30, 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'super_admin') {
        return NextResponse.json({ error: 'Forbidden — super admin only' }, { status: 403 })
    }

    const url = new URL(request.url)
    const action = url.searchParams.get('action')

    if (action === 'admins') {
        const { data: admins } = await supabase
            .from('profiles')
            .select('id, register_id, name, email, role, hostel_block, created_at')
            .in('role', ['admin', 'super_admin'])
            .order('created_at', { ascending: true })

        return NextResponse.json({ admins: admins || [] })
    }

    if (action === 'blocks') {
        const { data: blocks } = await supabase
            .from('hostel_blocks')
            .select('*')
            .order('name', { ascending: true })

        return NextResponse.json({ blocks: blocks || [] })
    }

    // Default: return both
    const [adminsRes, blocksRes] = await Promise.all([
        supabase
            .from('profiles')
            .select('id, register_id, name, email, role, hostel_block, created_at')
            .in('role', ['admin', 'super_admin'])
            .order('created_at', { ascending: true }),
        supabase
            .from('hostel_blocks')
            .select('*')
            .order('name', { ascending: true }),
    ])

    return NextResponse.json({
        admins: adminsRes.data || [],
        blocks: blocksRes.data || [],
    })
}

// POST — create hostel block or admin user
export async function POST(request: Request) {
    // Rate limit: 15 admin operations per 15 minutes per IP
    const ip = getClientIp(request)
    const rl = checkRateLimit(`admin-super:${ip}`, 15, 15 * 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role !== 'super_admin') {
        return NextResponse.json({ error: 'Forbidden — super admin only' }, { status: 403 })
    }

    const body = await request.json()
    const { action } = body

    // Add hostel block
    if (action === 'add_block') {
        const { name } = body
        if (!name || !name.trim()) {
            return NextResponse.json({ error: 'Block name is required' }, { status: 400 })
        }

        const { error } = await supabase
            .from('hostel_blocks')
            .insert({ name: name.trim().toUpperCase() })

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json({ error: 'Block already exists' }, { status: 409 })
            }
            console.error('Block creation error:', error.message)
            return NextResponse.json({ error: 'Failed to create block' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    }

    // Remove hostel block
    if (action === 'remove_block') {
        const { id } = body
        if (!id) {
            return NextResponse.json({ error: 'Block ID is required' }, { status: 400 })
        }

        const { error } = await supabase
            .from('hostel_blocks')
            .delete()
            .eq('id', id)

        if (error) {
            console.error('Block deletion error:', error.message)
            return NextResponse.json({ error: 'Failed to remove block' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    }

    // Add admin
    if (action === 'add_admin') {
        const { registerId, name, password, hostelBlock, role: newRole } = body
        if (!registerId || !name || !password) {
            return NextResponse.json({ error: 'Register ID, name, and password are required' }, { status: 400 })
        }

        // Password validation
        if (password.length < 8) {
            return NextResponse.json({ error: 'Password must be at least 8 characters long' }, { status: 400 })
        }
        if (password.length > 128) {
            return NextResponse.json({ error: 'Password must be at most 128 characters long' }, { status: 400 })
        }

        // Name length validation
        const trimmedName = name.trim()
        if (trimmedName.length < 2 || trimmedName.length > 60) {
            return NextResponse.json({ error: 'Name must be between 2 and 60 characters' }, { status: 400 })
        }

        // Register ID format validation
        const trimmedRegisterId = registerId.trim()
        if (trimmedRegisterId.length < 2 || trimmedRegisterId.length > 30) {
            return NextResponse.json({ error: 'Register ID must be between 2 and 30 characters' }, { status: 400 })
        }
        if (!/^[A-Za-z0-9]+$/.test(trimmedRegisterId)) {
            return NextResponse.json({ error: 'Register ID must be alphanumeric' }, { status: 400 })
        }

        // Validate role — only allow admin or super_admin
        const allowedRoles = ['admin', 'super_admin']
        const targetRole = allowedRoles.includes(newRole) ? newRole : 'admin'

        const syntheticEmail = `${trimmedRegisterId.toLowerCase()}@hostel.local`

        // Use service role client to create auth user.
        // email_confirm: true auto-verifies the email (skips confirmation step)
        // since admin-created users use synthetic emails, not real ones.
        const serviceDb = createServiceClient()
        const { data: authData, error: authError } = await serviceDb.auth.admin.createUser({
            email: syntheticEmail,
            password,
            email_confirm: true,
        })

        if (authError) {
            console.error('Admin auth creation error:', authError.message)
            const safeMessage = authError.message.toLowerCase().includes('already registered')
                ? 'This Register ID is already registered'
                : 'Failed to create admin user'
            return NextResponse.json({ error: safeMessage }, { status: 400 })
        }

        if (!authData.user) {
            return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
        }

        const { error: profileError } = await serviceDb.from('profiles').insert({
            id: authData.user.id,
            register_id: trimmedRegisterId.toUpperCase(),
            name: trimmedName,
            role: targetRole,
            hostel_block: (targetRole === 'admin' && hostelBlock) ? String(hostelBlock).trim() : null,
        })

        if (profileError) {
            // Rollback: delete the auth user if profile creation fails
            await serviceDb.auth.admin.deleteUser(authData.user.id)
            console.error('Admin profile creation error:', profileError.message)
            return NextResponse.json({ error: 'Failed to create admin profile' }, { status: 500 })
        }

        return NextResponse.json({ success: true, role: targetRole })
    }

    // Remove admin
    if (action === 'remove_admin') {
        const { id } = body
        if (!id) {
            return NextResponse.json({ error: 'Admin ID is required' }, { status: 400 })
        }

        // Don't allow removing yourself
        if (id === user.id) {
            return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 })
        }

        // Verify target is actually an admin/super_admin — prevent deleting student accounts
        const { data: targetProfile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', id)
            .single()

        if (!targetProfile || !['admin', 'super_admin'].includes(targetProfile.role)) {
            return NextResponse.json({ error: 'Target user is not an admin' }, { status: 400 })
        }

        // Delete profile row
        const { error } = await supabase
            .from('profiles')
            .delete()
            .eq('id', id)

        if (error) {
            console.error('Admin deletion error:', error.message)
            return NextResponse.json({ error: 'Failed to remove admin' }, { status: 500 })
        }

        // Also delete the auth user so they can't log in anymore
        const serviceDb = createServiceClient()
        const { error: authDeleteError } = await serviceDb.auth.admin.deleteUser(id)
        if (authDeleteError) {
            console.error('Failed to delete auth user during admin removal:', authDeleteError.message)
            // Profile is already deleted — log but don't fail the request
        }

        return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
>>>>>>> 0200fb90bb8a9c38a8b428bf606ec91468124b07
