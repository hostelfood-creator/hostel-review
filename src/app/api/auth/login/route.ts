import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { checkRateLimitAsync, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: Request) {
  // Rate limit: 10 attempts per 15 minutes per IP (Redis-backed in production)
  const ip = getClientIp(request)
  const rl = await checkRateLimitAsync(`login:${ip}`, 10, 15 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  try {
    const body = await request.json()
    const { registerId, password } = body

    if (!registerId || !password) {
      return NextResponse.json(
        { error: 'Register ID and password are required' },
        { status: 400 }
      )
    }

    // Input sanitization: strip whitespace, limit length
    const cleanId = String(registerId).trim().toUpperCase().slice(0, 30)
    const cleanPass = String(password).slice(0, 128)

    const cookieStore = await cookies()
    // Collect cookies that Supabase wants to set so we can attach them
    // to the outgoing response explicitly — avoids the silent-swallow bug
    // in the shared createClient() helper.
    const pendingCookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = []

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

    const syntheticEmail = `${cleanId.toLowerCase()}@hostel.local`

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: syntheticEmail,
      password: cleanPass,
    })

    if (authError || !authData.user) {
      // Generic error — don't reveal whether ID exists or password is wrong
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name, register_id, email, role, hostel_block, department, year')
      .eq('id', authData.user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    const response = NextResponse.json({
      user: {
        id: profile.id,
        name: profile.name,
        registerId: profile.register_id,
        email: profile.email || null,
        role: profile.role,
        hostelBlock: profile.hostel_block || null,
        department: profile.department || null,
        year: profile.year || null,
      },
    })

    // Attach every auth cookie Supabase generated to the response
    for (const { name, value, options } of pendingCookies) {
      response.cookies.set(name, value, options as any)
    }

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
