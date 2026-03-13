import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAuthClient, attachCookies } from '@/lib/supabase/auth-cookies'
import { createServiceClient } from '@/lib/supabase/service'
import crypto from 'crypto'

const verifyRegisterSchema = z.object({
  registerId: z.string().trim()
    .toUpperCase()
    .min(7, { message: 'Register ID must be at least 7 characters' })
    .regex(/^[A-Z0-9]+$/, { message: 'Register ID must contain only letters and numbers' }),
  otp: z.string().trim()
    .length(6, { message: 'OTP must be exactly 6 digits' })
    .regex(/^\d+$/, { message: 'OTP must contain only numbers' }),
  password: z.string().trim().min(6, { message: 'Password must be at least 6 characters' }),
  name: z.string().optional(),
  department: z.string().optional(),
  year: z.string().trim().max(10).optional(),
  hostelBlock: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const json = await request.json()
    const result = verifyRegisterSchema.safeParse(json)

    if (!result.success) {
      const errorMsg = result.error.errors.map(e => e.message).join('; ')
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }

    const { registerId, otp, password, name, department, year, hostelBlock } = result.data

    const adminClient = createServiceClient()

    // 1. Verify OTP
    const { data: record, error: fetchError } = await adminClient
      .from('password_resets') // Re-using table for registration OTP
      .select('*')
      .eq('register_id', registerId)
      .maybeSingle()

    if (fetchError || !record) {
      return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 })
    }

    if (new Date(record.expires_at) < new Date()) {
      return NextResponse.json({ error: 'OTP has expired' }, { status: 400 })
    }

    const inputHash = crypto.createHash('sha256').update(otp).digest('hex')
    if (record.otp !== inputHash) {
      return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 })
    }

    // 2. Clear OTP
    await adminClient.from('password_resets').delete().eq('register_id', registerId)

    // 3. User Creation (similar to old register/route.ts)
    const { supabase, pendingCookies } = await createAuthClient()
    const authEmail = record.email

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: authEmail,
      password: password,
    })

    if (authError) {
      if (authError.message.toLowerCase().includes('already registered')) {
        return NextResponse.json({ error: 'User is already registered. Please sign in.' }, { status: 409 })
      }
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
    }

    // Auto confirm
    try {
      await adminClient.auth.admin.updateUserById(authData.user.id, { email_confirm: true })
    } catch { } // Non-fatal

    // Profile creation
    const { error: profileError } = await supabase.from('profiles').insert({
      id: authData.user.id,
      register_id: registerId,
      name: name || registerId,
      email: authEmail,
      role: 'student',
      hostel_block: hostelBlock || null,
      department: department || null,
      year: year || null,
    })

    if (profileError) {
      console.error('Profile creation error:', profileError)
      await adminClient.auth.admin.deleteUser(authData.user.id).catch(() => {})
      return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 })
    }

    const response = NextResponse.json({
      user: {
        id: authData.user.id,
        name: name || registerId,
        registerId: registerId,
        role: 'student',
      },
    })

    attachCookies(response, pendingCookies)
    return response
  } catch (error) {
    console.error('Register Verify error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
