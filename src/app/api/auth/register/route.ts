import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { checkRateLimitAsync, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { lookupStudent } from '@/lib/student-lookup'
import { sendWelcomeEmail } from '@/lib/email'

// ── Input validation helpers ──────────────────────────────
function validateRegistrationInput(body: Record<string, unknown>) {
    const { registerId, name, email, password } = body

    if (!registerId || !name || !password) {
        return { error: 'Register ID, name, and password are required', status: 400 }
    }

    const cleanId = String(registerId).trim().toUpperCase().slice(0, 30)
    const cleanName = String(name).trim().slice(0, 60)
    const cleanEmail = String(email || '').trim().toLowerCase()
    const cleanPass = String(password).slice(0, 128)

    if (cleanPass.length < 8) {
        return { error: 'Password must be at least 8 characters', status: 400 }
    }
    if (!cleanEmail) {
        return { error: 'Email is required for registration', status: 400 }
    }
    if (!cleanEmail.endsWith('@kanchiuniv.ac.in')) {
        return { error: 'Only @kanchiuniv.ac.in email addresses are accepted', status: 400 }
    }
    if (cleanName.length < 2) {
        return { error: 'Full name must be at least 2 characters', status: 400 }
    }
    if (!/^[A-Za-z0-9]+$/.test(cleanId)) {
        return { error: 'Register ID must be alphanumeric', status: 400 }
    }

    return { cleanId, cleanName, cleanEmail, cleanPass }
}

export async function POST(request: Request) {
  // Rate limit: 5 account creations per hour per IP (Redis-backed in production)
  const ip = getClientIp(request)
  const rl = await checkRateLimitAsync(`register:${ip}`, 5, 60 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  try {
    const body = await request.json()

    // Validate and sanitize all inputs
    const validation = validateRegistrationInput(body)
    if ('error' in validation) {
        return NextResponse.json({ error: validation.error }, { status: validation.status })
    }
    const { cleanId, cleanName, cleanEmail, cleanPass } = validation
    const { hostelBlock, department, year } = body

    // Server-side XLSX verification — if the register ID is in university records,
    // enforce the official name and auto-assign hostel/dept/year to prevent spoofing
    const xlsxRecord = lookupStudent(cleanId)
    const verifiedName = xlsxRecord?.name || cleanName
    // Prefer XLSX hostel/dept/year over client-provided values (authoritative source)
    const verifiedHostel = xlsxRecord?.hostelBlock || (hostelBlock ? String(hostelBlock).trim() : null)
    const verifiedDept = xlsxRecord?.department || (department ? String(department).trim().slice(0, 60) : null)
    const verifiedYear = xlsxRecord?.year || (year ? String(year).trim().slice(0, 10) : null)

    // Duplicate email check — only one account per email address
    const { createClient: createSupabaseAdmin } = await import('@supabase/supabase-js')
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrlForAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceRoleKey || !supabaseUrlForAdmin) {
      console.error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is not set')
      return NextResponse.json({ error: 'Server configuration error. Please contact admin.' }, { status: 500 })
    }
    const adminClient = createSupabaseAdmin(
      supabaseUrlForAdmin,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: existingEmail } = await adminClient
      .from('profiles')
      .select('id')
      .eq('email', cleanEmail)
      .maybeSingle()
    if (existingEmail) {
      return NextResponse.json(
        { error: 'Registration failed. Please try again or sign in.' },
        { status: 409 }
      )
    }

    // 2. Validate hostel block exists BEFORE creating auth user (prevents orphaned entries)
    let cleanBlock: string | null = null
    if (verifiedHostel) {
      const { data: blockExists } = await adminClient
        .from('hostel_blocks')
        .select('id')
        .eq('name', verifiedHostel)
        .maybeSingle()
      if (!blockExists) {
        return NextResponse.json({ error: 'Invalid hostel block' }, { status: 400 })
      }
      cleanBlock = verifiedHostel
    }

    const cookieStore = await cookies()
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

    // Use the real university email for Supabase Auth so auth.users.email is always
    // a deliverable, human-readable address. The login route resolves registerId → email
    // via the profiles table.
    const authEmail = cleanEmail

    // 1. Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: authEmail,
      password: cleanPass,
    })

    if (authError) {
      if (authError.message.toLowerCase().includes('already registered')) {
        return NextResponse.json({ error: 'Registration failed. Please try again or sign in.' }, { status: 409 })
      }
      console.error('Auth signup error:', authError.message)
      return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 400 })
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
    }

    // Auto-confirm the user's email so signInWithPassword works immediately.
    // signUp() with the anon key may leave email_confirmed_at=NULL if Supabase
    // email confirmation is enabled in the dashboard.
    try {
      await adminClient.auth.admin.updateUserById(authData.user.id, { email_confirm: true })
    } catch (confirmErr) {
      console.error('[Register] Auto-confirm failed (non-fatal):', confirmErr)
    }

    // 3. Create user profile
    const { error: profileError } = await supabase.from('profiles').insert({
      id: authData.user.id,
      register_id: cleanId,
      name: verifiedName,
      email: cleanEmail,
      role: 'student',
      hostel_block: cleanBlock,
      department: verifiedDept,
      year: verifiedYear,
    })

    if (profileError) {
      console.error('Profile creation error:', profileError)
      // Rollback: delete the auth user to prevent orphaned auth entries
      try {
        await adminClient.auth.admin.deleteUser(authData.user.id)
      } catch (rollbackErr) {
        console.error('Rollback failed — orphaned auth user:', authData.user.id, rollbackErr)
      }
      return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 })
    }

    // Send welcome email (fire-and-forget — never block registration)
    sendWelcomeEmail({
      email: cleanEmail,
      name: verifiedName,
      registerId: cleanId,
      hostelBlock: cleanBlock,
      department: verifiedDept,
      year: verifiedYear,
    }).catch(() => { /* already logged inside sendWelcomeEmail */ })

    const response = NextResponse.json({
      user: {
        id: authData.user.id,
        name: verifiedName,
        registerId: cleanId,
        role: 'student',
      },
    })

    // Attach auth cookies to the response
    for (const { name, value, options } of pendingCookies) {
      response.cookies.set(name, value, options as any)
    }

    return response
  } catch (error) {
    console.error('Register error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
