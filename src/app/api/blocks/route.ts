import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET — list hostel blocks for dropdowns (registration, admin panel)
 * Public endpoint — accessible without auth for registration flow
 */
export async function GET(request: Request) {
    // Rate limit: 20 requests per minute per IP
    const ip = getClientIp(request)
    const rl = await checkRateLimit(`blocks:${ip}`, 20, 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()

    const { data: blocks } = await supabase
        .from('hostel_blocks')
        .select('id, name')
        .order('name', { ascending: true })

    return NextResponse.json({ blocks: blocks || [] })
}
