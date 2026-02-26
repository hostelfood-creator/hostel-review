import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: Request) {
  // Rate limit: 10 logout attempts per minute per IP
  const ip = getClientIp(request)
  const rl = await checkRateLimit(`auth-logout:${ip}`, 10, 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

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

  await supabase.auth.signOut()

  const response = NextResponse.json({ success: true })

  // Attach cookie-clearing instructions to the response
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options as any)
  }

  return response
}
