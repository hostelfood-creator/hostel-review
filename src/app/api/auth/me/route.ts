import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: Request) {
  const pendingCookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = []
  try {
    // Rate limit: 30 requests per minute per IP
    const ip = getClientIp(request)
    const rl = await checkRateLimit(`auth-me:${ip}`, 30, 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const cookieStore = await cookies()

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach((c) => pendingCookies.push(c))
          },
        },
      }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      // Even on 401 we must forward any token-refresh cookies Supabase emitted
      const errResp = NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      for (const { name, value, options } of pendingCookies) {
        errResp.cookies.set(name, value, options as any)
      }
      return errResp
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, register_id, name, email, role, hostel_block, department, year')
      .eq('id', user.id)
      .single()

    if (!profile) {
      const notFoundResp = NextResponse.json({ error: 'User not found' }, { status: 404 })
      for (const { name, value, options } of pendingCookies) {
        notFoundResp.cookies.set(name, value, options as any)
      }
      return notFoundResp
    }

    const response = NextResponse.json({
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
    })

    // Attach any refreshed-token cookies
    for (const { name, value, options } of pendingCookies) {
      response.cookies.set(name, value, options as any)
    }

    return response
  } catch (error) {
    console.error('Auth check error:', error)
    const errResp = NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    for (const { name, value, options } of pendingCookies) {
      errResp.cookies.set(name, value, options as any)
    }
    return errResp
  }
}
