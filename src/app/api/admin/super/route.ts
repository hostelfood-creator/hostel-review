import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Super Admin API — manage hostel blocks and admin users
 * Only accessible by users with role 'super_admin'
 */

// ── Action handlers ──────────────────────────────────────────────────────────

type ActionResult = { json: Record<string, unknown>; status?: number }

async function handleAddBlock(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<ActionResult> {
  const { name } = body
  if (!name || !(name as string).trim()) {
    return { json: { error: 'Block name is required' }, status: 400 }
  }
  const { error } = await supabase
    .from('hostel_blocks')
    .insert({ name: (name as string).trim().toUpperCase() })
  if (error) {
    if (error.code === '23505') return { json: { error: 'Block already exists' }, status: 409 }
    console.error('Block creation error:', error.message)
    return { json: { error: 'Failed to create block' }, status: 500 }
  }
  return { json: { success: true } }
}

async function handleRemoveBlock(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<ActionResult> {
  const { id } = body
  if (!id) return { json: { error: 'Block ID is required' }, status: 400 }
  const { error } = await supabase.from('hostel_blocks').delete().eq('id', id)
  if (error) {
    console.error('Block deletion error:', error.message)
    return { json: { error: 'Failed to remove block' }, status: 500 }
  }
  return { json: { success: true } }
}

async function handleAddAdmin(
  body: Record<string, unknown>,
): Promise<ActionResult> {
  const { registerId, name, password, hostelBlock, role: newRole } = body as Record<string, string | undefined>
  if (!registerId || !name || !password) {
    return { json: { error: 'Register ID, name, and password are required' }, status: 400 }
  }
  if (password.length < 8) return { json: { error: 'Password must be at least 8 characters long' }, status: 400 }
  if (password.length > 128) return { json: { error: 'Password must be at most 128 characters long' }, status: 400 }

  const trimmedName = name.trim()
  if (trimmedName.length < 2 || trimmedName.length > 60) {
    return { json: { error: 'Name must be between 2 and 60 characters' }, status: 400 }
  }

  const trimmedRegisterId = registerId.trim()
  if (trimmedRegisterId.length < 2 || trimmedRegisterId.length > 30) {
    return { json: { error: 'Register ID must be between 2 and 30 characters' }, status: 400 }
  }
  if (!/^[A-Za-z0-9]+$/.test(trimmedRegisterId)) {
    return { json: { error: 'Register ID must be alphanumeric' }, status: 400 }
  }

  const allowedRoles = ['admin', 'super_admin']
  if (!newRole || !allowedRoles.includes(newRole)) {
    return { json: { error: 'Role must be "admin" or "super_admin"' }, status: 400 }
  }
  const targetRole = newRole

  const authEmail = `${trimmedRegisterId.toLowerCase()}@kanchiuniv.ac.in`
  const serviceDb = createServiceClient()
  const { data: authData, error: authError } = await serviceDb.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
  })

  if (authError) {
    console.error('Admin auth creation error:', authError.message)
    const safeMessage = authError.message.toLowerCase().includes('already registered')
      ? 'This Register ID is already registered'
      : 'Failed to create admin user'
    return { json: { error: safeMessage }, status: 400 }
  }

  if (!authData.user) return { json: { error: 'Failed to create user' }, status: 500 }

  const { error: profileError } = await serviceDb.from('profiles').insert({
    id: authData.user.id,
    register_id: trimmedRegisterId.toUpperCase(),
    name: trimmedName,
    email: authEmail,
    role: targetRole,
    hostel_block: (targetRole === 'admin' && hostelBlock) ? String(hostelBlock).trim() : null,
  })

  if (profileError) {
    await serviceDb.auth.admin.deleteUser(authData.user.id)
    console.error('Admin profile creation error:', profileError.message)
    return { json: { error: 'Failed to create admin profile' }, status: 500 }
  }

  return { json: { success: true, role: targetRole } }
}

async function handleRemoveAdmin(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
  currentUserId: string,
): Promise<ActionResult> {
  const { id } = body
  if (!id) return { json: { error: 'Admin ID is required' }, status: 400 }
  if (id === currentUserId) return { json: { error: 'Cannot remove yourself' }, status: 400 }

  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', id)
    .single()

  if (!targetProfile || !['admin', 'super_admin'].includes(targetProfile.role)) {
    return { json: { error: 'Target user is not an admin' }, status: 400 }
  }

  const serviceDb = createServiceClient()
  const { error: authDeleteError } = await serviceDb.auth.admin.deleteUser(id as string)
  if (authDeleteError) {
    console.error('Admin deletion error:', authDeleteError.message)
    return { json: { error: 'Failed to remove admin' }, status: 500 }
  }

  // Defensive cleanup: ensure profile is gone (guards against misconfigured CASCADE)
  await serviceDb.from('profiles').delete().eq('id', id)
  return { json: { success: true } }
}

// ── Action dispatch map ──────────────────────────────────────────────────────

const ACTION_HANDLERS: Record<
  string,
  (supabase: SupabaseClient, body: Record<string, unknown>, userId: string) => Promise<ActionResult>
> = {
  add_block: (supabase, body) => handleAddBlock(supabase, body),
  remove_block: (supabase, body) => handleRemoveBlock(supabase, body),
  add_admin: (_supabase, body) => handleAddAdmin(body),
  remove_admin: (supabase, body, userId) => handleRemoveAdmin(supabase, body, userId),
}

// GET — list hostel blocks and admins
export async function GET(request: Request) {
    // Rate limit: 30 admin reads per minute per IP
    const ip = getClientIp(request)
    const rl = await checkRateLimit(`admin-super-get:${ip}`, 30, 60 * 1000)
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
    const rl = await checkRateLimit(`admin-super:${ip}`, 15, 15 * 60 * 1000)
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

    const handler = ACTION_HANDLERS[action]
    if (!handler) {
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const result = await handler(supabase, body, user.id)
    return NextResponse.json(result.json, { status: result.status || 200 })
}
