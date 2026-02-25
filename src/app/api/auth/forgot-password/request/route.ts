import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import crypto from 'crypto'
import { checkRateLimitAsync, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

// Reuse SMTP transporter across requests (connection pooling)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedTransporter: nodemailer.Transporter | null = null
function getTransporter() {
  if (!cachedTransporter) {
    const smtpSecure = process.env.SMTP_SECURE === 'true'
    cachedTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: smtpSecure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      pool: true,    // Enable connection pooling
      maxConnections: 3,
    })
  }
  return cachedTransporter
}

// Fully responsive institutional email — works on Gmail, Outlook, Apple Mail, and mobile
function buildOtpEmail(name: string, registerId: string, otp: string): string {
  const digits = otp.split('')

  // OTP digit cells — use inline-block via table for email client compatibility
  const digitCells = digits.map(d => `
      <td style="padding:0 4px;">
        <table cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td class="otp-cell" style="
            width:44px;height:56px;
            border:2px solid #1e293b;
            border-radius:10px;
            background:#ffffff;
            text-align:center;vertical-align:middle;
            font-size:28px;font-weight:900;
            color:#0f172a;
            font-family:'Courier New',Courier,monospace;
            line-height:56px;
          ">${d}</td>
        </tr></table>
      </td>`).join('')

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>Password Reset — SCSVMV Hostel</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style type="text/css">
    /* Reset */
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:0; text-decoration:none; }
    body { margin:0; padding:0; width:100% !important; }

    /* Responsive wrapper */
    .email-wrapper { width:100%; background:#f1f5f9; }
    .email-card { width:100%; max-width:600px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; }

    /* Mobile overrides */
    @media only screen and (max-width: 600px) {
      .email-wrapper { padding:24px 8px !important; }
      .email-card { border-radius:8px !important; }
      .header-td { padding:36px 24px 32px !important; }
      .header-logo { width:140px !important; max-width:140px !important; height:auto !important; }
      .body-td { padding:28px 24px 24px !important; }
      .body-title { font-size:20px !important; }
      .body-copy { font-size:13px !important; }
      .otp-panel { padding:14px 16px !important; }
      .otp-cell { width:36px !important; height:46px !important; font-size:22px !important; line-height:46px !important; border-radius:8px !important; }
      .expiry-td { padding:12px 14px !important; }
      .footer-td { padding:18px 24px !important; }
      .footer-links { display:block !important; }
      .footer-divider { display:none !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <!-- Outer wrapper -->
  <table role="presentation" class="email-wrapper" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">

        <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
        <table role="presentation" class="email-card" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.09);width:100%;max-width:600px;">

          <!-- ═══ HEADER ═══ -->
          <tr>
            <td class="header-td" align="center" style="background:#0a1628;padding:48px 48px 44px;text-align:center;">
              <img
                class="header-logo"
                src="https://iili.io/qKjxO3F.png"
                alt="SCSVMV University"
                width="220"
                style="display:block;margin:0 auto;border:0;outline:0;max-width:220px;height:auto;"
              />
            </td>
          </tr>

          <!-- Amber divider -->
          <tr>
            <td style="background:linear-gradient(90deg,#92400e,#d97706,#f59e0b,#fbbf24,#f59e0b,#d97706,#92400e);height:5px;font-size:0;line-height:0;" aria-hidden="true">&nbsp;</td>
          </tr>

          <!-- ═══ BODY ═══ -->
          <tr>
            <td class="body-td" style="padding:40px 48px 36px;">

              <p class="body-title" style="margin:0 0 6px;color:#0a1628;font-size:24px;font-weight:800;letter-spacing:-0.3px;">Password Reset</p>
              <p class="body-copy" style="margin:0 0 28px;color:#475569;font-size:14px;line-height:1.75;">
                Dear <strong style="color:#0a1628;">${name}</strong>,<br/><br/>
                We received a request to reset the password for your Hostel Food Review account
                (<strong style="color:#0a1628;font-family:'Courier New',monospace;">${registerId.toUpperCase()}</strong>).
                Enter the one-time verification code below. It expires in&nbsp;<strong>5&nbsp;minutes</strong>.
              </p>

              <!-- OTP label -->
              <p style="margin:0 0 14px;text-align:center;color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">One-Time Verification Code</p>

              <!-- OTP digit panel -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td align="center">
                    <table role="presentation" class="otp-panel" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px 24px;">
                      <tr>
                        ${digitCells}
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Expiry notice -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;margin-bottom:28px;">
                <tr>
                  <td class="expiry-td" style="padding:14px 18px;">
                    <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6;">
                      This code is valid for <strong>5 minutes</strong> from the time it was sent.
                      If you did not make this request, you may safely ignore this email.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.8;">
                For your security, never share this code with anyone.<br/>
                SCSVMV Hostel staff will never ask for your verification code.
              </p>

            </td>
          </tr>

          <!-- ═══ FOOTER ═══ -->
          <tr>
            <td class="footer-td" align="center" style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:22px 48px;text-align:center;">
              <p style="margin:0 0 6px;color:#64748b;font-size:12px;line-height:1.8;">
                Sri Chandrasekharendra Saraswathi Viswa Mahavidyalaya (SCSVMV)<br/>
                Enathur, Kanchipuram &mdash; 631&nbsp;561, Tamil Nadu, India
              </p>
              <p style="margin:0;">
                <a href="https://www.kanchiuniv.ac.in" style="color:#d97706;font-size:11px;text-decoration:none;font-weight:600;">www.kanchiuniv.ac.in</a>
                <span class="footer-divider" style="color:#cbd5e1;margin:0 8px;">&nbsp;|&nbsp;</span>
                <span style="color:#94a3b8;font-size:11px;">Automated message &mdash; please do not reply.</span>
              </p>
            </td>
          </tr>

        </table>
        <!--[if mso]></td></tr></table><![endif]-->

      </td>
    </tr>
  </table>

</body>
</html>`
}

export async function POST(request: Request) {
  // Rate limit: 3 OTP requests per 15 minutes per IP (Redis-backed in production)
  const ip = getClientIp(request)
  const rl = await checkRateLimitAsync(`otp-request:${ip}`, 3, 15 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  try {
    const body = await request.json()
    const rawId = body.email || body.registerId
    if (!rawId) {
      return NextResponse.json({ error: 'Email address is required' }, { status: 400 })
    }
    // Sanitize input — support both email lookup and legacy registerId lookup
    const isEmail = String(rawId).includes('@')
    const lookupValue = isEmail
      ? String(rawId).trim().toLowerCase().slice(0, 100)
      : String(rawId).trim().toUpperCase().slice(0, 30)

    // 1. Create service-role client FIRST — bypasses RLS so profile lookup works
    //    even when no user is logged in (which is always the case during forgot-password)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceRoleKey || !supabaseUrl) {
      console.error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is not set — forgot password cannot work')
      return NextResponse.json({ error: 'Server configuration error. Please contact admin.' }, { status: 500 })
    }

    const supabaseAdmin = createSupabaseAdmin(
      supabaseUrl,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 2. Look up the user — by email or register_id using admin client (bypasses RLS)
    //    Use .limit(1) instead of .single() to avoid failures when duplicate rows exist
    //    or when PostgREST returns unexpected errors that mask the real issue.
    const query = isEmail
      ? supabaseAdmin.from('profiles').select('email, name, register_id').eq('email', lookupValue).limit(1)
      : supabaseAdmin.from('profiles').select('email, name, register_id').eq('register_id', lookupValue).limit(1)

    const { data: profiles, error: profileError } = await query

    if (profileError) {
      // Log the real error so we can debug — don't silently treat DB errors as "not found"
      console.error('Profile lookup error during forgot-password:', profileError.message, profileError.code)
      return NextResponse.json(
        { error: 'Unable to verify your account. Please try again later.' },
        { status: 500 }
      )
    }

    const profile = profiles?.[0]
    const registerId = profile?.register_id

    if (!profile || !registerId) {
      // Return same success message to prevent user enumeration attacks
      return NextResponse.json(
        { message: 'If an account with that identifier exists, an OTP has been sent to the associated email.' }
      )
    }

    if (!profile.email) {
      // Return same success message to prevent user enumeration attacks
      return NextResponse.json({ message: 'If an account with that identifier exists, an OTP has been sent to the associated email.' })
    }

    // 3. Generate 6-digit OTP (higher entropy — 1M combinations vs 10K for 4-digit)
    const otp = crypto.randomInt(100000, 1000000).toString()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    // 4. Invalidate any existing OTPs for this user first
    await supabaseAdmin.from('password_resets').delete().eq('register_id', registerId)

    const { error: insertError } = await supabaseAdmin.from('password_resets').insert({
      register_id: registerId,
      email: profile.email,
      otp,
      expires_at: expiresAt,
    })

    if (insertError) {
      console.error('Failed to store OTP:', insertError)
      return NextResponse.json({ error: 'Failed to process request' }, { status: 500 })
    }

    // 5. Send professional HTML email via SMTP (reused transporter with connection pooling)
    const transporter = getTransporter()

    const fromName = process.env.SMTP_FROM_NAME || 'SCSVMV Hostel Review'
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'no-reply@hostel.local'

    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: profile.email,
      subject: 'Password Reset — SCSVMV Hostel Review',
      html: buildOtpEmail(profile.name, registerId, otp),
    })

    return NextResponse.json({ message: 'OTP sent successfully' })
  } catch (error) {
    console.error('Forgot password error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
