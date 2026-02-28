import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { checkRateLimitAsync, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase/service'
import { verifyTurnstileToken } from '@/lib/turnstile'

export async function POST(request: Request) {
  // Rate limit: 10 attempts per 15 minutes per IP (Redis-backed in production)
  const ip = getClientIp(request)
  const rl = await checkRateLimitAsync(`login:${ip}`, 10, 15 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  try {
    const body = await request.json()
    const { registerId, password, rememberMe, turnstileToken } = body
    const extendSession = rememberMe === true

    // Verify Cloudflare Turnstile bot protection
    const turnstileValid = await verifyTurnstileToken(turnstileToken, ip)
    if (!turnstileValid) {
      return NextResponse.json(
        { error: 'Bot verification failed. Please refresh and try again.' },
        { status: 403 }
      )
    }

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

    // Resolve registerId → real email via profiles table (service client to bypass RLS)
    const adminClient = createServiceClient()
    const { data: profileLookup } = await adminClient
      .from('profiles')
      .select('id, email')
      .ilike('register_id', cleanId)
      .maybeSingle()

    // Resolve the definitive email from auth.users using the profile ID.
    // This avoids double signInWithPassword calls (each triggers expensive bcrypt)
    // by discovering the correct email up-front via a cheap admin lookup.
    let authEmail: string
    if (profileLookup?.id) {
      const { data: authUserData } = await adminClient.auth.admin.getUserById(profileLookup.id)
      const currentAuthEmail = authUserData?.user?.email

      // If auth still has legacy @hostel.local but profile has real email, migrate first
      if (currentAuthEmail?.endsWith('@hostel.local') && profileLookup.email && !profileLookup.email.endsWith('@hostel.local')) {
        try {
          await adminClient.auth.admin.updateUserById(profileLookup.id, {
            email: profileLookup.email,
            email_confirm: true,
          })
          authEmail = profileLookup.email
          console.log('[Login] Migrated auth email from @hostel.local for user', profileLookup.id)
        } catch (migrateErr) {
          // Migration failed — use current auth email to still let user log in
          console.error('[Login] Pre-login email migration failed (non-fatal) for user', profileLookup.id)
          authEmail = currentAuthEmail || profileLookup.email || `${cleanId.toLowerCase()}@hostel.local`
        }
      } else {
        authEmail = currentAuthEmail || profileLookup.email || `${cleanId.toLowerCase()}@hostel.local`
      }

      // Auto-confirm unconfirmed accounts (by design — identity validated via university XLSX records)
      if (authUserData?.user && !authUserData.user.email_confirmed_at) {
        try {
          await adminClient.auth.admin.updateUserById(profileLookup.id, { email_confirm: true })
        } catch {
          // Non-fatal — signIn will still be attempted
        }
      }
    } else {
      // No profile found — try legacy synthetic email
      authEmail = `${cleanId.toLowerCase()}@hostel.local`
    }

    // Single authentication attempt with the resolved email
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: cleanPass,
    })

    if (authError || !authData.user) {
      console.error('[Login] signInWithPassword failed:', authError?.message, authError?.status)
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

    // Attach every auth cookie Supabase generated to the response.
    // "Remember Me" unchecked → session cookie (expires when browser closes).
    // "Remember Me" checked   → keep Supabase's default maxAge (persistent).
    for (const { name, value, options } of pendingCookies) {
      const cookieOpts = { ...options } as Record<string, unknown>
      if (!extendSession) {
        // Remove maxAge so the cookie becomes session-scoped (dies on browser close)
        delete cookieOpts.maxAge
        delete cookieOpts.expires
      }
      response.cookies.set(name, value, cookieOpts as any)
    }

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
