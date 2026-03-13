import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { lookupStudent } from '@/lib/student-lookup'
import { getTransporter, getSender } from '@/lib/email'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { verifyTurnstileToken, verifyCaptchaToken, type CaptchaType } from '@/lib/turnstile'
import { z } from 'zod'

// ── Input validation schema ──────────────────────────────
const registerSchema = z.object({
  registerId: z.string({ required_error: 'Register ID is required' })
    .min(1, 'Register ID is required')
    .regex(/^[A-Za-z0-9]+$/, 'Register ID must be alphanumeric')
    .max(30, 'Register ID is too long')
    .transform(val => val.trim().toUpperCase()),
  name: z.string({ required_error: 'Name is required' })
    .min(2, 'Full name must be at least 2 characters')
    .max(60, 'Name is too long')
    .transform(val => val.trim()),
  email: z.string({ required_error: 'Email is required' })
    .email('Invalid email address')
    .refine(val => val.trim().toLowerCase().endsWith('@kanchiuniv.ac.in'), { 
      message: 'Only @kanchiuniv.ac.in email addresses are accepted' 
    })
    .transform(val => val.trim().toLowerCase()),
  password: z.string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long'),
  hostelBlock: z.string().trim().nullable().optional(),
  department: z.string().trim().max(60).nullable().optional(),
  year: z.string().trim().max(10).nullable().optional(),
  turnstileToken: z.string().optional(),
  captchaType: z.enum(['turnstile', 'hcaptcha']).optional()
})

export async function POST(request: Request) {
  // Rate limit: 5 account creations per hour per IP (Redis-backed in production)
  const ip = getClientIp(request)
  const rl = await checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  try {
    const body = await request.json()

    // Validate and sanitize all inputs using Zod
    const parseResult = registerSchema.safeParse(body)
    if (!parseResult.success) {
      const error = parseResult.error.errors[0]?.message || 'Invalid input'
      return NextResponse.json({ error }, { status: 400 })
    }

    const { 
      registerId: cleanId, 
      name: cleanName, 
      email: cleanEmail, 
      password: cleanPass,
      hostelBlock,
      department,
      year,
      turnstileToken,
      captchaType 
    } = parseResult.data

    const resolvedCaptchaType: CaptchaType = captchaType === 'hcaptcha' ? 'hcaptcha' : 'turnstile'

    // Verify CAPTCHA bot protection (Turnstile primary, hCaptcha fallback).
    // If widget failed to load (ad-blocker / network), apply stricter rate limit
    // instead of blocking entirely — prevents permanent lockout.
    if (!turnstileToken) {
      const strictRl = await checkRateLimit(`register-no-captcha:${ip}`, 2, 60 * 60 * 1000)
      if (!strictRl.allowed) return rateLimitResponse(strictRl.resetAt)
    } else {
      const captchaValid = await verifyCaptchaToken(turnstileToken, resolvedCaptchaType, ip)
      if (!captchaValid) {
        return NextResponse.json(
          { error: 'Bot verification failed. Please refresh and try again.' },
          { status: 403 }
        )
      }
    }

    // Server-side verification — if the register ID is in university records,
    // enforce the official name and auto-assign hostel/dept/year to prevent spoofing
    const xlsxRecord = await lookupStudent(cleanId)
    const verifiedName = xlsxRecord?.name || cleanName
    // Prefer XLSX hostel/dept/year over client-provided values (authoritative source)
    const verifiedHostel = xlsxRecord?.hostelBlock || hostelBlock || null
    const verifiedDept = xlsxRecord?.department || department || null
    const verifiedYear = xlsxRecord?.year || year || null

    // Duplicate email check — only one account per email address
    // Use shared service client (consistent with rest of codebase)
    const adminClient = createServiceClient()
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

    // 2. Validate hostel block exists BEFORE proceeding
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

    // 3. Generate and store OTP (We use password_resets table as a generic OTP store)
    const otp = crypto.randomInt(100000, 1000000).toString()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex')

    // Upsert into password_resets to prevent duplicate register_id errors
    const { error: otpError } = await adminClient.from('password_resets').upsert({
      register_id: cleanId,
      email: cleanEmail,
      otp: otpHash,
      expires_at: expiresAt
    }, { onConflict: 'register_id' })

    if (otpError) {
      console.error('Failed to generate OTP:', otpError)
      return NextResponse.json({ error: 'Failed to initiate registration' }, { status: 500 })
    }

    // 4. Send Email
    const emailHtml = buildRegistrationOtpEmail(verifiedName, cleanId, otp)
    const sender = getSender()
    const transporter = getTransporter()
    
    await transporter.sendMail({
      from: `"${sender.name}" <${sender.email}>`,
      to: cleanEmail,
      subject: 'Verify your Registration - SCSVMV Hostel Review',
      html: emailHtml,
    })

    return NextResponse.json({ requiresOtp: true, message: 'OTP sent to email.' })
  } catch (error) {
    console.error('Register error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Fully responsive Registration OTP Email
function buildRegistrationOtpEmail(name: string, registerId: string, otp: string): string {
  const digits = otp.split('')
  const digitCells = digits.map(d => `
      <td style="padding:0 4px;">
        <table cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td class="otp-cell" style="
            width:44px;height:56px;border:2px solid #1e293b;border-radius:10px;
            background:#ffffff;text-align:center;vertical-align:middle;
            font-size:28px;font-weight:900;color:#0f172a;
            font-family:'Courier New',Courier,monospace;line-height:56px;
          ">${d}</td>
        </tr></table>
      </td>`).join('')

    return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;width:100%;background:#f1f5f9;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#0a1628;padding:40px;text-align:center;">
          <h2 style="color:#ffffff;margin:0;">SCSVMV Hostel Review</h2>
        </td></tr>
        <tr><td style="padding:40px;">
          <h3 style="margin-top:0;">Verify your Registration</h3>
          <p>Hi ${name} (${registerId}),</p>
          <p>Your registration verification code is below. It expires in 10 minutes.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:30px auto;">
            <tr>${digitCells}</tr>
          </table>
          <p style="color:#64748b;font-size:14px;">If you didn't request this, please ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
