/**
 * Server-side Cloudflare Turnstile token verification.
 * Called from auth API routes to validate the bot challenge token
 * sent by the client-side Turnstile widget.
 *
 * @see https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

interface TurnstileVerifyResult {
  success: boolean
  'error-codes'?: string[]
  challenge_ts?: string
  hostname?: string
}

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
  const secret = process.env.TURNSTILE_SECRET_KEY

  // Skip verification in development if no secret key is configured
  if (!secret) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Turnstile] No TURNSTILE_SECRET_KEY — skipping verification in dev mode')
      return true
    }
    // In production, missing secret key = deny all (fail closed)
    console.error('[Turnstile] TURNSTILE_SECRET_KEY is not set — denying request')
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

    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    })

    if (!res.ok) {
      console.error('[Turnstile] Verification API returned', res.status)
      return false
    }

    const result: TurnstileVerifyResult = await res.json()

    if (!result.success) {
      console.warn('[Turnstile] Verification failed:', result['error-codes'])
    }

    return result.success
  } catch (err) {
    console.error('[Turnstile] Verification error:', err)
    // Fail open only in development — fail closed in production
    return process.env.NODE_ENV === 'development'
  }
}
