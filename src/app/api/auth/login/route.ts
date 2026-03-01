import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase/service'
import { createAuthClient, attachCookies } from '@/lib/supabase/auth-cookies'
import { verifyTurnstileToken } from '@/lib/turnstile'

export async function POST(request: Request) {
  // Rate limit: 10 attempts per 15 minutes per IP (Redis-backed in production)
  const ip = getClientIp(request)
  const rl = await checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  try {
    const body = await request.json()
    const { registerId, password, rememberMe, turnstileToken } = body
    const extendSession = rememberMe === true

    if (!registerId || !password) {
      return NextResponse.json(
        { error: 'Register ID and password are required' },
        { status: 400 }
      )
    }

    // Input sanitization: strip whitespace, limit length
    const cleanId = String(registerId).trim().toUpperCase().slice(0, 30)
    const cleanPass = String(password).slice(0, 128)

    // ── Phase 1: Independent checks in parallel ──────────────────────
    // Turnstile verification and profile lookup are independent —
    // run them concurrently to reduce login latency.
    const adminClient = createServiceClient()
    // If the client didn't send a Turnstile token (widget failed to load),
    // apply a much stricter rate limit instead of blocking entirely.
    // This prevents permanent lockout from ad-blockers / network issues.
    if (!turnstileToken) {
      const strictRl = await checkRateLimit(`login-no-captcha:${ip}`, 3, 15 * 60 * 1000)
      if (!strictRl.allowed) return rateLimitResponse(strictRl.resetAt)
    }

    const [turnstileValid, profileResult] = await Promise.all([
      turnstileToken ? verifyTurnstileToken(turnstileToken, ip) : Promise.resolve(true),
      adminClient
        .from('profiles')
        .select('id, email')
        .ilike('register_id', cleanId)
        .maybeSingle(),
    ])

    if (!turnstileValid) {
      return NextResponse.json(
        { error: 'Bot verification failed. Please refresh and try again.' },
        { status: 403 }
      )
    }

    // ── Phase 2: Resolve email for authentication (read-only) ────────
    // Determine the email to use for signInWithPassword. No writes
    // are performed until after the user's password is verified.
    const profileLookup = profileResult.data
    let authEmail: string

    if (profileLookup?.id) {
      const { data: authUserData } = await adminClient.auth.admin.getUserById(profileLookup.id)
      const currentAuthEmail = authUserData?.user?.email
      // Use whatever email auth.users currently has — migration happens post-auth
      authEmail = currentAuthEmail || profileLookup.email || `${cleanId.toLowerCase()}@hostel.local`
    } else {
      // No profile found — try legacy synthetic email
      authEmail = `${cleanId.toLowerCase()}@hostel.local`
    }

    // ── Phase 3: Authenticate ────────────────────────────────────────
    const { supabase, pendingCookies } = await createAuthClient()

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: cleanPass,
    })

    if (authError || !authData.user) {
      console.error('[Login] signInWithPassword failed:', authError?.message, authError?.status)
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // ── Phase 4: Post-auth housekeeping (only after password verified) ──
    // These admin operations are safe now because the user has proven
    // they know the password. Awaited to avoid serverless context abortion.
    if (profileLookup?.id) {
      const userId = profileLookup.id
      const currentEmail = authEmail

      const postAuthTasks: Promise<unknown>[] = []

      // Migrate legacy @hostel.local email → real university email
      if (currentEmail.endsWith('@hostel.local') && profileLookup.email && !profileLookup.email.endsWith('@hostel.local')) {
        postAuthTasks.push(
          adminClient.auth.admin.updateUserById(userId, {
            email: profileLookup.email,
            email_confirm: true,
          }).then(() => {
            console.log('[Login] Migrated auth email from @hostel.local for user', userId)
          }).catch((err) => {
            console.error('[Login] Post-login email migration failed (non-fatal) for user', userId, err)
          })
        )
      }

      // Auto-confirm unconfirmed accounts (identity validated via university records)
      const { data: freshUser } = await adminClient.auth.admin.getUserById(userId)
      if (freshUser?.user && !freshUser.user.email_confirmed_at) {
        postAuthTasks.push(
          adminClient.auth.admin.updateUserById(userId, { email_confirm: true }).catch(() => {
            // Non-fatal — user is already authenticated
          })
        )
      }

      // Await all housekeeping tasks to prevent serverless context abortion
      if (postAuthTasks.length > 0) {
        await Promise.allSettled(postAuthTasks)
      }
    }

    // ── Phase 5: Build response ──────────────────────────────────────
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
    attachCookies(response, pendingCookies, !extendSession)

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
