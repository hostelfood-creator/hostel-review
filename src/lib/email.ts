import nodemailer from 'nodemailer'

// ── Reusable SMTP transporter (connection-pooled) ─────────
let cachedTransporter: nodemailer.Transporter | null = null

export function getTransporter(): nodemailer.Transporter {
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
      pool: true,
      maxConnections: 3,
    })
  }
  return cachedTransporter
}

/** Safe default sender address */
export function getSender(): { name: string; email: string } {
  return {
    name: process.env.SMTP_FROM_NAME || 'SCSVMV Hostel Review',
    email: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'no-reply@kanchiuniv.ac.in',
  }
}

// ── Welcome email template ────────────────────────────────
// Fully responsive, email-safe HTML (inline CSS, table layout).
// Compatible with Gmail, Outlook, Apple Mail, Yahoo, and mobile clients.
// Design inspired by the CareBridge template — adapted for SCSVMV Hostel Review.

interface WelcomeEmailParams {
  name: string
  registerId: string
  hostelBlock: string | null
  department: string | null
  year: string | null
  portalUrl?: string
}

/** Escape HTML entities to prevent XSS in email content */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildWelcomeEmail(params: WelcomeEmailParams): string {
  const { name, registerId, hostelBlock, department, year } = params
  const portalUrl = params.portalUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://hostelreview.kanchiuniv.ac.in'
  const firstName = esc(name.split(' ')[0] || name)
  const safeName = esc(name)
  const safeId = esc(registerId.toUpperCase())
  const safeBlock = hostelBlock ? esc(hostelBlock) : '—'
  const safeDept = department ? esc(department) : '—'
  const safeYear = year ? esc(year) : '—'

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>Welcome to SCSVMV Hostel Review</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:0; text-decoration:none; }
    body { margin:0; padding:0; width:100% !important; }
    .email-wrapper { width:100%; background:#e8eef1; }
    .email-card { width:100%; max-width:600px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; }
    @media only screen and (max-width: 600px) {
      .email-wrapper { padding:16px 8px !important; }
      .email-card { border-radius:10px !important; }
      .header-td { padding:32px 20px 28px !important; }
      .header-logo { width:140px !important; max-width:140px !important; }
      .hero-td { padding:28px 20px !important; }
      .hero-title { font-size:24px !important; line-height:30px !important; }
      .body-td { padding:24px 20px !important; }
      .feature-table { width:100% !important; }
      .feature-cell { display:block !important; width:100% !important; padding:8px 0 !important; }
      .cta-btn { width:100% !important; }
      .footer-td { padding:18px 20px !important; }
      .info-label { width:90px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#e8eef1;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <!-- Outer wrapper -->
  <table role="presentation" class="email-wrapper" width="100%" cellpadding="0" cellspacing="0" style="background:#e8eef1;padding:40px 16px;">
    <tr><td align="center">

      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
      <table role="presentation" class="email-card" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 30px rgba(0,0,0,0.08);width:100%;max-width:600px;">

        <!-- ═══ HEADER — Logo ═══ -->
        <tr>
          <td class="header-td" align="center" style="background:#0a1628;padding:44px 48px 40px;text-align:center;">
            <img
              class="header-logo"
              src="https://iili.io/qKjxO3F.png"
              alt="SCSVMV University"
              width="200"
              style="display:block;margin:0 auto 12px;border:0;outline:0;max-width:200px;height:auto;"
            />
            <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">
              Hostel Food Review Portal
            </p>
          </td>
        </tr>

        <!-- Amber divider -->
        <tr>
          <td style="background:linear-gradient(90deg,#92400e,#d97706,#f59e0b,#fbbf24,#f59e0b,#d97706,#92400e);height:5px;font-size:0;line-height:0;" aria-hidden="true">&nbsp;</td>
        </tr>

        <!-- ═══ HERO SECTION ═══ -->
        <tr>
          <td class="hero-td" align="center" style="padding:44px 48px 8px;text-align:center;">
            <p style="margin:0 0 12px;color:#23857a;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">
              You&rsquo;re All Set!
            </p>
            <h1 class="hero-title" style="margin:0 0 16px;color:#0a1628;font-size:32px;font-weight:900;letter-spacing:-0.5px;line-height:38px;text-transform:uppercase;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
              Welcome to the<br/>Hostel Review Portal
            </h1>
            <p style="margin:0;color:#64748b;font-size:14px;line-height:1.7;max-width:420px;">
              Your feedback makes hostel food better for everyone. Rate meals, track attendance, and make your voice heard.
            </p>
          </td>
        </tr>

        <!-- ═══ GREETING + ACCOUNT INFO ═══ -->
        <tr>
          <td class="body-td" style="padding:32px 48px 16px;">
            <p style="margin:0 0 4px;color:#0a1628;font-size:20px;font-weight:800;">
              Hi ${firstName},
            </p>
            <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.75;">
              Your account has been successfully created. Here are your details:
            </p>

            <!-- Account details card -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:28px;">
              <tr>
                <td style="padding:20px 24px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td class="info-label" style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;padding:6px 0;width:110px;vertical-align:top;">Name</td>
                      <td style="color:#0a1628;font-size:14px;font-weight:700;padding:6px 0;">${safeName}</td>
                    </tr>
                    <tr>
                      <td class="info-label" style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;padding:6px 0;width:110px;vertical-align:top;">Register ID</td>
                      <td style="color:#0a1628;font-size:14px;font-weight:700;padding:6px 0;font-family:'Courier New',monospace;">${safeId}</td>
                    </tr>
                    <tr>
                      <td class="info-label" style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;padding:6px 0;width:110px;vertical-align:top;">Hostel Block</td>
                      <td style="color:#0a1628;font-size:14px;font-weight:700;padding:6px 0;">${safeBlock}</td>
                    </tr>
                    <tr>
                      <td class="info-label" style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;padding:6px 0;width:110px;vertical-align:top;">Department</td>
                      <td style="color:#0a1628;font-size:14px;font-weight:700;padding:6px 0;">${safeDept}</td>
                    </tr>
                    <tr>
                      <td class="info-label" style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;padding:6px 0;width:110px;vertical-align:top;">Year</td>
                      <td style="color:#0a1628;font-size:14px;font-weight:700;padding:6px 0;">${safeYear}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ═══ FEATURES SECTION ═══ -->
        <tr>
          <td align="center" style="padding:8px 48px 4px;">
            <p style="margin:0 0 4px;color:#23857a;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">What You Can Do</p>
            <h2 style="margin:0 0 20px;color:#0a1628;font-size:22px;font-weight:900;text-transform:uppercase;letter-spacing:-0.3px;">
              Explore the Portal
            </h2>
          </td>
        </tr>

        <tr>
          <td style="padding:0 48px 32px;">
            <!-- Feature cards — 2-column grid -->
            <table role="presentation" class="feature-table" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <!-- Card 1: Rate Meals -->
                <td class="feature-cell" width="48%" valign="top" style="padding:0 8px 12px 0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fef9c3;border-radius:14px;">
                    <tr>
                      <td style="padding:22px 18px;">
                        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                          <td style="width:36px;height:36px;background:#ffffff;border-radius:50%;text-align:center;vertical-align:middle;">
                            <span style="font-size:18px;line-height:36px;">&#11088;</span>
                          </td>
                        </tr></table>
                        <p style="margin:12px 0 6px;color:#0a1628;font-size:15px;font-weight:800;text-transform:uppercase;line-height:1.2;">Rate Daily<br/>Meals</p>
                        <p style="margin:0;color:#78716c;font-size:12px;line-height:1.5;">Breakfast, Lunch, Snacks &amp; Dinner — rate 1&ndash;5 stars with tags.</p>
                      </td>
                    </tr>
                  </table>
                </td>

                <!-- Card 2: QR Check-in -->
                <td class="feature-cell" width="48%" valign="top" style="padding:0 0 12px 8px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#d1fae5;border-radius:14px;">
                    <tr>
                      <td style="padding:22px 18px;">
                        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                          <td style="width:36px;height:36px;background:#ffffff;border-radius:50%;text-align:center;vertical-align:middle;">
                            <span style="font-size:18px;line-height:36px;">&#128247;</span>
                          </td>
                        </tr></table>
                        <p style="margin:12px 0 6px;color:#0a1628;font-size:15px;font-weight:800;text-transform:uppercase;line-height:1.2;">QR<br/>Check-in</p>
                        <p style="margin:0;color:#78716c;font-size:12px;line-height:1.5;">Scan the mess QR code to record your meal attendance.</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <!-- Card 3: File Complaints -->
                <td class="feature-cell" width="48%" valign="top" style="padding:0 8px 12px 0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fce7f3;border-radius:14px;">
                    <tr>
                      <td style="padding:22px 18px;">
                        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                          <td style="width:36px;height:36px;background:#ffffff;border-radius:50%;text-align:center;vertical-align:middle;">
                            <span style="font-size:18px;line-height:36px;">&#128221;</span>
                          </td>
                        </tr></table>
                        <p style="margin:12px 0 6px;color:#0a1628;font-size:15px;font-weight:800;text-transform:uppercase;line-height:1.2;">File<br/>Complaints</p>
                        <p style="margin:0;color:#78716c;font-size:12px;line-height:1.5;">Report food quality or hygiene issues directly to admin.</p>
                      </td>
                    </tr>
                  </table>
                </td>

                <!-- Card 4: Track History -->
                <td class="feature-cell" width="48%" valign="top" style="padding:0 0 12px 8px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#dbeafe;border-radius:14px;">
                    <tr>
                      <td style="padding:22px 18px;">
                        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                          <td style="width:36px;height:36px;background:#ffffff;border-radius:50%;text-align:center;vertical-align:middle;">
                            <span style="font-size:18px;line-height:36px;">&#128202;</span>
                          </td>
                        </tr></table>
                        <p style="margin:12px 0 6px;color:#0a1628;font-size:15px;font-weight:800;text-transform:uppercase;line-height:1.2;">Track<br/>History</p>
                        <p style="margin:0;color:#78716c;font-size:12px;line-height:1.5;">View all your past reviews, check-ins and complaint status.</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ═══ CTA SECTION ═══ -->
        <tr>
          <td align="center" style="padding:0 48px 40px;">
            <p style="margin:0 0 6px;color:#475569;font-size:14px;line-height:1.6;max-width:380px;">
              Jump straight into the portal and check today&rsquo;s menu!
            </p>

            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${portalUrl}/student" style="height:48px;width:280px;v-text-anchor:middle;" arcsize="50%" fillcolor="#23857a">
              <w:anchorlock/><center style="color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">Open Dashboard &rarr;</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a class="cta-btn" href="${portalUrl}/student" target="_blank" style="display:inline-block;background:#23857a;color:#ffffff;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px;text-decoration:none;padding:14px 48px;border-radius:50px;box-shadow:0 4px 14px rgba(35,133,122,0.35);mso-hide:all;">
              Open Dashboard &rarr;
            </a>
            <!--<![endif]-->
          </td>
        </tr>

        <!-- ═══ HOW IT WORKS ═══ -->
        <tr>
          <td style="padding:0 48px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;">
              <tr>
                <td style="padding:24px;">
                  <p style="margin:0 0 16px;color:#166534;font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">How It Works</p>

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="width:28px;vertical-align:top;padding:0 12px 10px 0;">
                        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                          <td style="width:28px;height:28px;background:#23857a;border-radius:50%;text-align:center;vertical-align:middle;color:#ffffff;font-size:13px;font-weight:800;line-height:28px;">1</td>
                        </tr></table>
                      </td>
                      <td style="color:#374151;font-size:13px;line-height:1.6;padding-bottom:10px;">Check today&rsquo;s menu on the dashboard</td>
                    </tr>
                    <tr>
                      <td style="width:28px;vertical-align:top;padding:0 12px 10px 0;">
                        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                          <td style="width:28px;height:28px;background:#23857a;border-radius:50%;text-align:center;vertical-align:middle;color:#ffffff;font-size:13px;font-weight:800;line-height:28px;">2</td>
                        </tr></table>
                      </td>
                      <td style="color:#374151;font-size:13px;line-height:1.6;padding-bottom:10px;">After your meal, rate it (1&ndash;5 stars + tags)</td>
                    </tr>
                    <tr>
                      <td style="width:28px;vertical-align:top;padding:0 12px 0 0;">
                        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                          <td style="width:28px;height:28px;background:#23857a;border-radius:50%;text-align:center;vertical-align:middle;color:#ffffff;font-size:13px;font-weight:800;line-height:28px;">3</td>
                        </tr></table>
                      </td>
                      <td style="color:#374151;font-size:13px;line-height:1.6;">Your feedback is reviewed by hostel admin daily</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ═══ IMPORTANT NOTES ═══ -->
        <tr>
          <td style="padding:0 48px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;">
              <tr>
                <td style="padding:18px 24px;">
                  <p style="margin:0 0 10px;color:#92400e;font-size:13px;line-height:1.7;">
                    &#128204; Meal review windows close after the next meal begins &mdash; rate on time!
                  </p>
                  <p style="margin:0 0 10px;color:#92400e;font-size:13px;line-height:1.7;">
                    &#128204; Your reviews are anonymous to other students but visible to admin.
                  </p>
                  <p style="margin:0;color:#92400e;font-size:13px;line-height:1.7;">
                    &#128204; Complaints are tracked and you&rsquo;ll be notified when admin responds.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ═══ STUDENT COUNT / SOCIAL PROOF ═══ -->
        <tr>
          <td align="center" style="padding:0 48px 40px;text-align:center;">
            <p style="margin:0 0 2px;color:#64748b;font-size:13px;">Join a growing community of</p>
            <p style="margin:0 0 4px;color:#0a1628;font-size:48px;font-weight:900;letter-spacing:-1px;line-height:1;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">1,100+</p>
            <p style="margin:0;color:#64748b;font-size:14px;">students already using the portal</p>
          </td>
        </tr>

        <!-- ═══ FOOTER ═══ -->
        <tr>
          <td class="footer-td" align="center" style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 48px;text-align:center;">
            <p style="margin:0 0 8px;color:#64748b;font-size:12px;line-height:1.8;">
              Sri Chandrasekharendra Saraswathi Viswa Mahavidyalaya (SCSVMV)<br/>
              Enathur, Kanchipuram &mdash; 631&nbsp;561, Tamil Nadu, India
            </p>
            <p style="margin:0 0 12px;">
              <a href="https://www.kanchiuniv.ac.in" style="color:#d97706;font-size:11px;text-decoration:none;font-weight:600;">www.kanchiuniv.ac.in</a>
            </p>
            <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.6;">
              You received this email because you registered on the<br/>SCSVMV Hostel Food Review Portal. This is an automated message.
            </p>
          </td>
        </tr>

      </table>
      <!--[if mso]></td></tr></table><![endif]-->

    </td></tr>
  </table>

</body>
</html>`
}

/**
 * Send the welcome email after registration.
 * Non-blocking — failures are logged but don't break the registration flow.
 */
export async function sendWelcomeEmail(params: WelcomeEmailParams & { email: string }): Promise<void> {
  try {
    const smtpUser = process.env.SMTP_USER
    if (!smtpUser) {
      console.warn('[Email] SMTP_USER not configured — skipping welcome email')
      return
    }

    const transporter = getTransporter()
    const sender = getSender()

    await transporter.sendMail({
      from: `"${sender.name}" <${sender.email}>`,
      to: params.email,
      subject: 'Welcome to SCSVMV Hostel Review Portal! 🎉',
      html: buildWelcomeEmail(params),
    })

    console.log('[Email] Welcome email sent to user:', params.registerId)
  } catch (err) {
    // Non-fatal — log and continue. The user is already registered.
    console.error('[Email] Failed to send welcome email:', err)
  }
}
