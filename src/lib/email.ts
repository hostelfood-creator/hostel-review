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
  const dashboardUrl = 'https://hostel.kanchiuniv.ac.in/'
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
  <title>Welcome to SCSVMV Hostel Review Portal</title>
  <!--[if !mso]><!-->
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
  <!--<![endif]-->
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <style type="text/css">
    table { border-collapse: collapse; }
    .section-pad { padding: 32px 40px !important; }
  </style>
  <![endif]-->
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: 0; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; }
    @media only screen and (max-width: 620px) {
      .outer-wrap { padding: 12px 8px !important; }
      .main-card { border-radius: 8px !important; }
      .section-pad { padding: 24px 20px !important; }
      .header-pad { padding: 28px 20px 24px !important; }
      .hero-title { font-size: 22px !important; line-height: 28px !important; }
      .info-label { width: 100px !important; font-size: 11px !important; }
      .cta-link { padding: 13px 32px !important; font-size: 13px !important; }
      .footer-pad { padding: 20px 16px !important; }
      .feature-card { max-width: 100% !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#eef2f5;font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f5;">
    <tr>
      <td class="outer-wrap" align="center" style="padding:40px 16px;">

        <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" align="center"><tr><td><![endif]-->
        <table role="presentation" class="main-card" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.06);width:100%;max-width:600px;">

          <!-- HEADER -->
          <tr>
            <td class="header-pad" align="center" style="background:#0a1628;padding:40px 40px 32px;text-align:center;">
              <img
                src="https://iili.io/qKjxO3F.png"
                alt="SCSVMV University"
                width="180"
                style="display:block;margin:0 auto 14px;border:0;outline:0;max-width:180px;height:auto;"
              />
              <p style="margin:0;color:#94a3b8;font-size:11px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;">
                Hostel Food Review Portal
              </p>
            </td>
          </tr>

          <!-- Accent divider -->
          <tr>
            <td style="background:linear-gradient(90deg,#92400e,#d97706,#f59e0b,#fbbf24,#f59e0b,#d97706,#92400e);height:4px;font-size:0;line-height:0;" aria-hidden="true">&nbsp;</td>
          </tr>

          <!-- HERO -->
          <tr>
            <td class="section-pad" align="center" style="padding:40px 40px 12px;text-align:center;">
              <p style="margin:0 0 10px;color:#23857a;font-size:12px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;">
                Account Confirmed
              </p>
              <h1 class="hero-title" style="margin:0 0 14px;color:#0a1628;font-size:28px;font-weight:800;letter-spacing:-0.3px;line-height:34px;font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;">
                Welcome to the<br/>Hostel Review Portal
              </h1>
              <p style="margin:0;color:#64748b;font-size:14px;line-height:1.7;max-width:440px;">
                Your feedback helps improve hostel food quality for everyone. Rate meals, track attendance, and make your voice heard.
              </p>
            </td>
          </tr>

          <!-- GREETING + ACCOUNT DETAILS -->
          <tr>
            <td class="section-pad" style="padding:28px 40px 20px;">
              <p style="margin:0 0 4px;color:#0a1628;font-size:18px;font-weight:700;">
                Dear ${firstName},
              </p>
              <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.7;">
                Your account has been successfully created. Below are your registered details for reference.
              </p>

              <!-- Account details card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                <tr>
                  <td style="padding:18px 22px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td class="info-label" style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:7px 0;width:110px;vertical-align:top;">Full Name</td>
                        <td style="color:#0a1628;font-size:14px;font-weight:600;padding:7px 0;">${safeName}</td>
                      </tr>
                      <tr><td colspan="2" style="border-bottom:1px solid #f1f5f9;font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>
                      <tr>
                        <td class="info-label" style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:7px 0;width:110px;vertical-align:top;">Register ID</td>
                        <td style="color:#0a1628;font-size:14px;font-weight:600;padding:7px 0;font-family:'Courier New',Courier,monospace;letter-spacing:0.5px;">${safeId}</td>
                      </tr>
                      <tr><td colspan="2" style="border-bottom:1px solid #f1f5f9;font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>
                      <tr>
                        <td class="info-label" style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:7px 0;width:110px;vertical-align:top;">Hostel Block</td>
                        <td style="color:#0a1628;font-size:14px;font-weight:600;padding:7px 0;">${safeBlock}</td>
                      </tr>
                      <tr><td colspan="2" style="border-bottom:1px solid #f1f5f9;font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>
                      <tr>
                        <td class="info-label" style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:7px 0;width:110px;vertical-align:top;">Department</td>
                        <td style="color:#0a1628;font-size:14px;font-weight:600;padding:7px 0;">${safeDept}</td>
                      </tr>
                      <tr><td colspan="2" style="border-bottom:1px solid #f1f5f9;font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>
                      <tr>
                        <td class="info-label" style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:7px 0;width:110px;vertical-align:top;">Year</td>
                        <td style="color:#0a1628;font-size:14px;font-weight:600;padding:7px 0;">${safeYear}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FEATURES SECTION -->
          <tr>
            <td align="center" style="padding:12px 40px 4px;">
              <p style="margin:0 0 4px;color:#23857a;font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;">Portal Features</p>
              <h2 style="margin:0 0 20px;color:#0a1628;font-size:22px;font-weight:900;letter-spacing:-0.3px;text-transform:uppercase;font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;">
                Explore the Portal
              </h2>
            </td>
          </tr>

          <tr>
            <td class="section-pad" style="padding:0 40px 28px;">
              <!-- Feature cards — 2-column fluid hybrid (stacks on mobile without media queries) -->

              <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td width="248" valign="top"><![endif]-->
              <div class="feature-card" style="display:inline-block;width:100%;max-width:248px;vertical-align:top;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
                  <tr>
                    <td style="background:#fefce8;border:1px solid #fef08a;border-radius:14px;padding:24px 20px;">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width:44px;height:44px;background:#fbbf24;border-radius:50%;text-align:center;vertical-align:middle;">
                          <img src="https://wsrv.nl/?url=https://api.iconify.design/fa6-solid/star.svg%3Fcolor%3D%2523ffffff%26width%3D48%26height%3D48&output=png&w=22&h=22" alt="Rate" width="22" height="22" style="display:block;margin:auto;border:0;" />
                        </td>
                      </tr></table>
                      <p style="margin:14px 0 6px;color:#0a1628;font-size:15px;font-weight:800;text-transform:uppercase;line-height:1.2;font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;">Rate Daily<br/>Meals</p>
                      <p style="margin:0;color:#78716c;font-size:12px;line-height:1.5;font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;">Breakfast, Lunch, Snacks &amp; Dinner &mdash; rate 1&ndash;5 stars with tags.</p>
                    </td>
                  </tr>
                </table>
              </div>
              <!--[if mso]></td><td width="24"></td><td width="248" valign="top"><![endif]-->
              <div class="feature-card" style="display:inline-block;width:100%;max-width:248px;vertical-align:top;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
                  <tr>
                    <td style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px;padding:24px 20px;">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width:44px;height:44px;background:#34d399;border-radius:50%;text-align:center;vertical-align:middle;">
                          <img src="https://wsrv.nl/?url=https://api.iconify.design/fa6-solid/qrcode.svg%3Fcolor%3D%2523ffffff%26width%3D48%26height%3D48&output=png&w=22&h=22" alt="QR" width="22" height="22" style="display:block;margin:auto;border:0;" />
                        </td>
                      </tr></table>
                      <p style="margin:14px 0 6px;color:#0a1628;font-size:15px;font-weight:800;text-transform:uppercase;line-height:1.2;font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;">QR<br/>Check-in</p>
                      <p style="margin:0;color:#78716c;font-size:12px;line-height:1.5;font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;">Scan the mess QR code to record your meal attendance.</p>
                    </td>
                  </tr>
                </table>
              </div>
              <!--[if mso]></td></tr></table><![endif]-->

              <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td width="248" valign="top"><![endif]-->
              <div class="feature-card" style="display:inline-block;width:100%;max-width:248px;vertical-align:top;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
                  <tr>
                    <td style="background:#fdf2f8;border:1px solid #fbcfe8;border-radius:14px;padding:24px 20px;">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width:44px;height:44px;background:#f472b6;border-radius:50%;text-align:center;vertical-align:middle;">
                          <img src="https://wsrv.nl/?url=https://api.iconify.design/fa6-solid/comment-dots.svg%3Fcolor%3D%2523ffffff%26width%3D48%26height%3D48&output=png&w=22&h=22" alt="Complaints" width="22" height="22" style="display:block;margin:auto;border:0;" />
                        </td>
                      </tr></table>
                      <p style="margin:14px 0 6px;color:#0a1628;font-size:15px;font-weight:800;text-transform:uppercase;line-height:1.2;font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;">File<br/>Complaints</p>
                      <p style="margin:0;color:#78716c;font-size:12px;line-height:1.5;font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;">Report food quality or hygiene issues directly to admin.</p>
                    </td>
                  </tr>
                </table>
              </div>
              <!--[if mso]></td><td width="24"></td><td width="248" valign="top"><![endif]-->
              <div class="feature-card" style="display:inline-block;width:100%;max-width:248px;vertical-align:top;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
                  <tr>
                    <td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:24px 20px;">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td style="width:44px;height:44px;background:#60a5fa;border-radius:50%;text-align:center;vertical-align:middle;">
                          <img src="https://wsrv.nl/?url=https://api.iconify.design/fa6-solid/clock-rotate-left.svg%3Fcolor%3D%2523ffffff%26width%3D48%26height%3D48&output=png&w=22&h=22" alt="History" width="22" height="22" style="display:block;margin:auto;border:0;" />
                        </td>
                      </tr></table>
                      <p style="margin:14px 0 6px;color:#0a1628;font-size:15px;font-weight:800;text-transform:uppercase;line-height:1.2;font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;">Track<br/>History</p>
                      <p style="margin:0;color:#78716c;font-size:12px;line-height:1.5;font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;">View all your past reviews, check-ins and complaint status.</p>
                    </td>
                  </tr>
                </table>
              </div>
              <!--[if mso]></td></tr></table><![endif]-->

            </td>
          </tr>

          <!-- CTA BUTTON -->
          <tr>
            <td align="center" style="padding:8px 40px 36px;">
              <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;max-width:400px;">
                Log in to view today&rsquo;s menu and start reviewing your meals.
              </p>

              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${dashboardUrl}" style="height:46px;width:260px;v-text-anchor:middle;" arcsize="10%" fillcolor="#23857a">
                <w:anchorlock/><center style="color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">Open Dashboard</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-->
              <a class="cta-link" href="${dashboardUrl}" target="_blank" style="display:inline-block;background:#23857a;color:#ffffff;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px;text-decoration:none;padding:14px 44px;border-radius:6px;mso-hide:all;">
                Open Dashboard
              </a>
              <!--<![endif]-->
            </td>
          </tr>

          <!-- HOW IT WORKS -->
          <tr>
            <td class="section-pad" style="padding:0 40px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;">
                <tr>
                  <td style="padding:22px;">
                    <p style="margin:0 0 14px;color:#166534;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">How It Works</p>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:28px;vertical-align:top;padding:0 10px 10px 0;">
                          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                            <td style="width:26px;height:26px;background:#23857a;border-radius:50%;text-align:center;vertical-align:middle;color:#ffffff;font-size:12px;font-weight:700;line-height:26px;">1</td>
                          </tr></table>
                        </td>
                        <td style="color:#374151;font-size:13px;line-height:1.6;padding-bottom:10px;">Check today&rsquo;s menu on the dashboard.</td>
                      </tr>
                      <tr>
                        <td style="width:28px;vertical-align:top;padding:0 10px 10px 0;">
                          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                            <td style="width:26px;height:26px;background:#23857a;border-radius:50%;text-align:center;vertical-align:middle;color:#ffffff;font-size:12px;font-weight:700;line-height:26px;">2</td>
                          </tr></table>
                        </td>
                        <td style="color:#374151;font-size:13px;line-height:1.6;padding-bottom:10px;">After your meal, rate it on a 1&ndash;5 scale with tags.</td>
                      </tr>
                      <tr>
                        <td style="width:28px;vertical-align:top;padding:0 10px 0 0;">
                          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                            <td style="width:26px;height:26px;background:#23857a;border-radius:50%;text-align:center;vertical-align:middle;color:#ffffff;font-size:12px;font-weight:700;line-height:26px;">3</td>
                          </tr></table>
                        </td>
                        <td style="color:#374151;font-size:13px;line-height:1.6;">Your feedback is reviewed by the hostel administration daily.</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- IMPORTANT NOTES -->
          <tr>
            <td class="section-pad" style="padding:0 40px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
                <tr>
                  <td style="padding:18px 22px;">
                    <p style="margin:0 0 12px;color:#92400e;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;">Please Note</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:16px;vertical-align:top;color:#b45309;font-size:13px;line-height:1.7;padding:0 6px 6px 0;">&#8226;</td>
                        <td style="color:#92400e;font-size:13px;line-height:1.7;padding-bottom:6px;">Meal review windows close once the next meal period begins. Please submit your ratings on time.</td>
                      </tr>
                      <tr>
                        <td style="width:16px;vertical-align:top;color:#b45309;font-size:13px;line-height:1.7;padding:0 6px 6px 0;">&#8226;</td>
                        <td style="color:#92400e;font-size:13px;line-height:1.7;padding-bottom:6px;">Your reviews are anonymous to other students but visible to the hostel administration.</td>
                      </tr>
                      <tr>
                        <td style="width:16px;vertical-align:top;color:#b45309;font-size:13px;line-height:1.7;padding:0 6px 0 0;">&#8226;</td>
                        <td style="color:#92400e;font-size:13px;line-height:1.7;">Complaints are tracked and you will be notified when the administration responds.</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- STUDENT COUNT -->
          <tr>
            <td align="center" style="padding:0 40px 36px;text-align:center;">
              <p style="margin:0 0 2px;color:#64748b;font-size:13px;">Join a growing community of</p>
              <p style="margin:0 0 4px;color:#0a1628;font-size:44px;font-weight:900;letter-spacing:-1px;line-height:1;font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;">1,100+</p>
              <p style="margin:0;color:#64748b;font-size:13px;">students already using the portal</p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td class="footer-pad" align="center" style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 40px;text-align:center;">
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

      </td>
    </tr>
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
      subject: 'Welcome to SCSVMV Hostel Review Portal',
      html: buildWelcomeEmail(params),
    })

    console.log('[Email] Welcome email sent to user:', params.registerId)
  } catch (err) {
    // Non-fatal — log and continue. The user is already registered.
    console.error('[Email] Failed to send welcome email:', err)
  }
}
