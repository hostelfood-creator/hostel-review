import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: Request) {
    try {
        // Rate limit: 30 maintenance reads per minute per IP
        const ip = getClientIp(request)
        const rl = checkRateLimit(`maintenance-get:${ip}`, 30, 60 * 1000)
        if (!rl.allowed) return rateLimitResponse(rl.resetAt)

        const supabase = await createClient()

        // Use Supabase session auth — not a custom cookie
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        const role = profile?.role
        if (role !== 'super_admin' && role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Use service client to bypass RLS for site_settings reads
        const serviceClient = createServiceClient()
        const { data, error } = await serviceClient
            .from('site_settings')
            .select('maintenance_mode')
            .eq('id', 1)
            .single()

        if (error) {
            // PGRST116 = row not found — treat as default (maintenance off)
            if (error.code === 'PGRST116') {
                return NextResponse.json({ maintenance_mode: false })
            }
            console.error('Failed to read maintenance status:', error)
            return NextResponse.json({ error: 'Failed to read maintenance status' }, { status: 500 })
        }

        return NextResponse.json({ maintenance_mode: data?.maintenance_mode ?? false })
    } catch (err) {
        console.error('Maintenance GET Error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        // Rate limit: 5 maintenance toggles per 15 minutes per IP
        const ip = getClientIp(request)
        const rl = checkRateLimit(`maintenance:${ip}`, 5, 15 * 60 * 1000)
        if (!rl.allowed) return rateLimitResponse(rl.resetAt)

        const supabase = await createClient()

        // Use Supabase session auth
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if (profile?.role !== 'super_admin') {
            return NextResponse.json({ error: 'Only Super Admins can toggle maintenance mode' }, { status: 403 })
        }

        const { maintenance_mode } = await request.json()

        if (typeof maintenance_mode !== 'boolean') {
            return NextResponse.json({ error: 'Invalid value' }, { status: 400 })
        }

        // Use service client to bypass RLS for site_settings writes
        const serviceClient = createServiceClient()
        const { error } = await serviceClient
            .from('site_settings')
            .upsert({ id: 1, maintenance_mode })

        if (error) {
            console.error('Maintenance Update Error:', error)
            return NextResponse.json({ error: 'Failed to update maintenance mode' }, { status: 500 })
        }

        return NextResponse.json({ success: true, maintenance_mode })
    } catch (err) {
        console.error('Maintenance POST Error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
