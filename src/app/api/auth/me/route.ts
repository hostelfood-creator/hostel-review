import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { createAuthClient, attachCookies } from '@/lib/supabase/auth-cookies'

export async function GET(request: Request) {
  let pendingCookies: import('@/lib/supabase/auth-cookies').CookieEntry[] = []
  try {
    // Rate limit: 30 requests per minute per IP
    const ip = getClientIp(request)
    const rl = await checkRateLimit(`auth-me:${ip}`, 30, 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const { supabase, pendingCookies: cookies } = await createAuthClient()
    pendingCookies = cookies

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      // Even on 401 we must forward any token-refresh cookies Supabase emitted
      return attachCookies(
        NextResponse.json({ error: 'Not authenticated' }, { status: 401 }),
        pendingCookies,
      )
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, register_id, name, email, role, hostel_block, department, year')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return attachCookies(
        NextResponse.json({ error: 'User not found' }, { status: 404 }),
        pendingCookies,
      )
    }

    return attachCookies(
      NextResponse.json({
        user: {
          id: profile.id,
          registerId: profile.register_id,
          name: profile.name,
          email: profile.email || null,
          role: profile.role,
          hostelBlock: profile.hostel_block || null,
          department: profile.department || null,
          year: profile.year || null,
        },
      }),
      pendingCookies,
    )
  } catch (error) {
    console.error('Auth check error:', error)
    return attachCookies(
      NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
      pendingCookies,
    )
  }
}
