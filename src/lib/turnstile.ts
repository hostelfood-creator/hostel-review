/**
 * Server-side CAPTCHA token verification.
 *
 * Supports TWO providers:
 * 1. Cloudflare Turnstile (primary) — invisible/managed bot protection
 * 2. hCaptcha (fallback) — visible checkbox challenge
 *
 * The client sends `captchaType: 'turnstile' | 'hcaptcha'` alongside
 * the token so the server knows which provider to verify against.
 *
 * @see https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 * @see https://docs.hcaptcha.com/#verify-the-user-response-server-side
 */

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const HCAPTCHA_VERIFY_URL = 'https://api.hcaptcha.com/siteverify'

interface CaptchaVerifyResult {
  success: boolean
  'error-codes'?: string[]
  challenge_ts?: string
  hostname?: string
}

export type CaptchaType = 'turnstile' | 'hcaptcha'

/**
 * Verify a Turnstile token server-side.
 * Returns true if the token is valid, false otherwise.
 *
 * In development (no secret key configured), verification is skipped
 * to avoid blocking local testing.
 */
export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp?: string
): Promise<boolean> {
  return verifyCaptchaToken(token, 'turnstile', remoteIp)
}

/**
 * Unified captcha verification — verifies tokens from either provider.
 *
 * @param token   The challenge response token from the client widget
 * @param type    Which captcha provider issued the token
 * @param remoteIp  Optional client IP for additional verification
 */
export async function verifyCaptchaToken(
  token: string | undefined | null,
  type: CaptchaType = 'turnstile',
  remoteIp?: string
): Promise<boolean> {
  const isHcaptcha = type === 'hcaptcha'
  const secret = isHcaptcha
    ? process.env.HCAPTCHA_SECRET_KEY
    : process.env.TURNSTILE_SECRET_KEY
  const verifyUrl = isHcaptcha ? HCAPTCHA_VERIFY_URL : TURNSTILE_VERIFY_URL
  const label = isHcaptcha ? 'hCaptcha' : 'Turnstile'

  // Skip verification in development if no secret key is configured
  if (!secret) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[${label}] No secret key — skipping verification in dev mode`)
      return true
    }
    // In production, missing secret key = deny all (fail closed)
    console.error(`[${label}] Secret key is not set — denying request`)
    return false
  }

  // Missing token = bot (no widget was rendered or token was stripped)
  if (!token || typeof token !== 'string' || token.length < 10) {
    return false
  }

  try {
    const formData = new URLSearchParams()
    formData.append('secret', secret)
    formData.append('response', token)
    if (remoteIp) {
      formData.append('remoteip', remoteIp)
    }
    // hCaptcha requires sitekey in the verification request
    if (isHcaptcha && process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY) {
      formData.append('sitekey', process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY)
    }

    const res = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    })

    if (!res.ok) {
      console.error(`[${label}] Verification API returned`, res.status)
      return false
    }

    const result: CaptchaVerifyResult = await res.json()

    if (!result.success) {
      console.warn(`[${label}] Verification failed:`, result['error-codes'])
    }

    return result.success
  } catch (err) {
    console.error(`[${label}] Verification error:`, err)
    // Fail open only in development — fail closed in production
    return process.env.NODE_ENV === 'development'
  }
}
