import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'

const resetVerifySchema = z.object({
  email: z.string().trim().toLowerCase().optional(),
  registerId: z.string().trim().toUpperCase().optional(),
  otp: z.string({ required_error: 'OTP is required' })
    .regex(/^\d{4,6}$/, 'Invalid verification code format'),
  newPassword: z.string({ required_error: 'New password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
}).refine(data => data.email || data.registerId, {
  message: 'Email or Register ID is required',
  path: ['email']
})

export async function POST(request: Request) {
    // Rate limit: 5 OTP verify attempts per 15 minutes per IP (Redis-backed in production)
    const ip = getClientIp(request)
    const rl = await checkRateLimit(`otp-verify:${ip}`, 5, 15 * 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    // Per-account rate limit — 5 attempts per 15 min per account identifier (checked before OTP query)

    try {
        const body = await request.json()
        const parseResult = resetVerifySchema.safeParse(body)
        if (!parseResult.success) {
            const error = parseResult.error.errors[0]?.message || 'Invalid input'
            return NextResponse.json({ error }, { status: 400 })
        }

        const { registerId: lookupRegId, email: lookupEmail, otp, newPassword } = parseResult.data
        const isEmailLookup = !!lookupEmail

        // Per-account rate limit BEFORE OTP lookup — prevents brute-force even with wrong OTPs
        // Key must match the same identifier used in the DB query (email if present, else registerId)
        const acctIdentifier = isEmailLookup ? lookupEmail : lookupRegId
        const acctRl = await checkRateLimit(`otp-verify-acct:${acctIdentifier}`, 5, 15 * 60 * 1000)
        if (!acctRl.allowed) return rateLimitResponse(acctRl.resetAt)

        // 1. Create service-role client — bypasses RLS to update password directly
        //    The service role key is REQUIRED — anon key CANNOT call auth.admin methods
        const supabaseAdmin = createServiceClient()

        // 2. Look up the password_resets record by email or register_id
        //    OTPs are stored as SHA-256 hashes — hash the user input before querying.
        const otpHash = crypto.createHash('sha256').update(otp).digest('hex')

        let resetQuery = supabaseAdmin.from('password_resets').select('*').eq('otp', otpHash)
        if (isEmailLookup) {
            resetQuery = resetQuery.eq('email', lookupEmail!)
        } else {
            resetQuery = resetQuery.eq('register_id', lookupRegId!)
        }
        const { data: resetRecords, error: fetchError } = await resetQuery.limit(1)

        if (fetchError) {
            console.error('OTP lookup error:', fetchError.message, fetchError.code)
            return NextResponse.json({ error: 'Unable to verify code. Please try again.' }, { status: 500 })
        }

        const resetRecord = resetRecords?.[0]
        if (!resetRecord) {
            return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 })
        }

        // 3. Check expiration
        if (new Date() > new Date(resetRecord.expires_at)) {
            return NextResponse.json({ error: 'Verification code has expired. Please request a new one.' }, { status: 400 })
        }

        // 4. Fetch the user's UUID from the profiles table
        //    Try register_id first; fall back to email if register_id is missing
        let profileRows, profileError
        if (resetRecord.register_id) {
            const res = await supabaseAdmin
                .from('profiles')
                .select('id, register_id')
                .eq('register_id', resetRecord.register_id)
                .limit(1)
            profileRows = res.data
            profileError = res.error
        } else if (resetRecord.email) {
            const res = await supabaseAdmin
                .from('profiles')
                .select('id, register_id')
                .eq('email', resetRecord.email)
                .limit(1)
            profileRows = res.data
            profileError = res.error
        }

        if (profileError) {
            console.error('Profile lookup error:', profileError.message, profileError.code)
            return NextResponse.json({ error: 'Unable to verify account. Please try again.' }, { status: 500 })
        }

        const profile = profileRows?.[0]
        if (!profile) {
            console.error('Profile not found for reset record:', resetRecord.register_id || resetRecord.email)
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
        }

        // 5. Force update the user's password in Supabase Auth
        //    This updates the auth.users table which is used by signInWithPassword()
        //    email_confirm: true is always set because all users in this system are
        //    pre-verified via university XLSX records — there is no separate email
        //    verification step. Without this flag, Supabase may unconfirm the email
        //    during the password update, locking the user out.
        const { data: updateData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            profile.id,
            { password: newPassword, email_confirm: true }
        )

        if (updateError) {
            console.error('Password update error for user', profile.id, ':', updateError.message, updateError)
            return NextResponse.json({ error: 'Failed to update password. Please try again.' }, { status: 500 })
        }

        if (!updateData?.user) {
            console.error('Password update returned no user data')
            return NextResponse.json({ error: 'Password update failed unexpectedly. Please try again.' }, { status: 500 })
        }

        // 6. Delete the OTP record so it can't be reused (Replay Attack Prevention)
        await supabaseAdmin
            .from('password_resets')
            .delete()
            .eq('id', resetRecord.id)

        return NextResponse.json({ message: 'Password updated successfully' })
    } catch (error) {
        console.error('Verify OTP error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
