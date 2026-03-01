import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { createAuthClient, attachCookies } from '@/lib/supabase/auth-cookies'

export async function POST(request: Request) {
  // Rate limit: 10 logout attempts per minute per IP
  const ip = getClientIp(request)
  const rl = await checkRateLimit(`auth-logout:${ip}`, 10, 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  const { supabase, pendingCookies } = await createAuthClient()

  await supabase.auth.signOut()

  // Attach cookie-clearing instructions to the response
  return attachCookies(NextResponse.json({ success: true }), pendingCookies)
}
