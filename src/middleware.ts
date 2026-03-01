import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Edge-compatible nonce generation.
 * Uses crypto.randomUUID() + btoa() instead of Node.js Buffer (not available in Edge).
 */
function generateNonce(): string {
  return btoa(crypto.randomUUID())
}

export async function middleware(request: NextRequest) {
  const nonce = generateNonce()
  const path = request.nextUrl.pathname

  // ── Validate env vars ───────────────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  // ── Build nonce-based CSP ──────────────────────────────────────────────
  // In production: nonce + 'unsafe-inline' fallback.
  // Browsers that support nonces automatically ignore 'unsafe-inline' when a nonce is present,
  // while older browsers fall back to 'unsafe-inline'. This is the recommended Next.js approach.
  // We do NOT use 'strict-dynamic' because Next.js injects framework scripts without nonces.
  const isProd = process.env.NODE_ENV === 'production'
  const scriptSrc = isProd
    ? `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' https://challenges.cloudflare.com https://js.hcaptcha.com`
    : `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://js.hcaptcha.com`

  const cspDirectives = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://newassets.hcaptcha.com",
    "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com https://newassets.hcaptcha.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' blob: data: https://freeimage.host https://iili.io https://api.qrserver.com https://imgs.hcaptcha.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com https://*.hcaptcha.com",
    "frame-src https://challenges.cloudflare.com https://*.hcaptcha.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(isProd ? ['upgrade-insecure-requests'] : []),
  ].join('; ')

  // ── CSRF Protection: Origin validation for state-changing requests ──
  // Validates Origin (or Referer fallback) against the Host header.
  // Blocks requests missing BOTH headers — while some older browsers may
  // omit both on same-origin, modern browsers always send at least Origin
  // for state-changing requests, and SameSite cookies provide defense-in-depth.
  const method = request.method
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    const origin = request.headers.get('origin')
    const referer = request.headers.get('referer')
    const host = request.headers.get('host')
    const sourceUrl = origin || referer
    if (!sourceUrl) {
      // Block requests missing both Origin and Referer to prevent CSRF
      return NextResponse.json({ error: 'Forbidden — missing origin' }, { status: 403 })
    }
    if (host) {
      try {
        const sourceHost = new URL(sourceUrl).host
        if (sourceHost !== host) {
          return NextResponse.json({ error: 'Forbidden — origin mismatch' }, { status: 403 })
        }
      } catch {
        return NextResponse.json({ error: 'Forbidden — invalid origin' }, { status: 403 })
      }
    }
  }

  // ── Public paths — skip auth entirely for performance ──────────────────
  // At 3000-4000 concurrent users, avoiding unnecessary auth + DB queries
  // on public paths significantly reduces latency and DB load.
  const publicPaths = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/forgot-password',
    '/api/auth/lookup',
    '/api/blocks',
    '/api/meal-timings',
    '/api/health',
  ]

  const isPublicApi = publicPaths.some((p) => path.startsWith(p))
  const isLoginPage = path === '/login'

  // ── Nonce header injection ─────────────────────────────────────────────
  // Pass nonce to server components via x-nonce request header.
  // Must be set on ALL NextResponse.next() calls including the setAll callback.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  })

  // Helper: apply CSP + all security headers to any response
  function withSecurityHeaders(response: NextResponse): NextResponse {
    response.headers.set('Content-Security-Policy', cspDirectives)
    response.headers.set('x-nonce', nonce)
    // Defense-in-depth headers
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    // camera=(self) — required for QR scanner; matches next.config.js
    response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), interest-cohort=()')
    response.headers.set('X-DNS-Prefetch-Control', 'on')
    if (isProd) {
      response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
    }
    return response
  }

  // For truly public API paths (not login page), return immediately with CSP headers
  // No auth needed — saves a network round-trip per request.
  if (isPublicApi) {
    return withSecurityHeaders(supabaseResponse)
  }

  // ── Supabase client setup ─────────────────────────────────────────────
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        // NOTE: request.cookies.set() in Next.js middleware is WRITABLE — it mutates the
        // forwarded request headers so downstream route handlers see refreshed auth tokens.
        // This is the official Supabase SSR middleware pattern, not a bug.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        // IMPORTANT: Re-create with requestHeaders to preserve x-nonce after cookie refresh
        const updatedHeaders = new Headers(request.headers)
        updatedHeaders.set('x-nonce', nonce)
        supabaseResponse = NextResponse.next({
          request: { headers: updatedHeaders },
        })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()

  // Helper: copy refreshed session cookies from supabaseResponse to a custom response
  function withCookies(response: NextResponse): NextResponse {
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie)
    })
    return withSecurityHeaders(response)
  }

  // Cache profile lookup to avoid redundant DB queries within the same request
  let cachedProfile: { role: string } | null | undefined = undefined
  async function getProfile(): Promise<{ role: string } | null> {
    if (cachedProfile !== undefined) return cachedProfile
    if (!user) { cachedProfile = null; return null }
    const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    cachedProfile = data
    return data
  }

  // ── Login page: redirect authenticated users to their dashboard ────────
  if (isLoginPage) {
    if (user) {
      const profile = await getProfile()
      if (profile) {
        const dest = profile.role === 'student' ? '/student' : '/admin'
        return withCookies(NextResponse.redirect(new URL(dest, request.url)))
      }
    }
    return withSecurityHeaders(supabaseResponse)
  }

  // ── Checkin/scan paths: redirect to login with return URL if not authed ─
  const checkinPath = '/student/checkin'
  const scanPath = '/student/scan'
  if ((path === checkinPath || path === scanPath) && !user) {
    return withCookies(NextResponse.redirect(new URL(`/login?redirect=${encodeURIComponent(path)}`, request.url)))
  }

  // ── Root path: redirect to dashboard or login ─────────────────────────
  if (path === '/') {
    if (user) {
      const profile = await getProfile()
      if (profile) {
        const dest = profile.role === 'student' ? '/student' : '/admin'
        return withCookies(NextResponse.redirect(new URL(dest, request.url)))
      }
    }
    return withCookies(NextResponse.redirect(new URL('/login', request.url)))
  }

  // ── Unauthenticated users ─────────────────────────────────────────────
  if (!user) {
    if (path.startsWith('/api/')) {
      return withCookies(NextResponse.json({ error: 'Not authenticated' }, { status: 401 }))
    }
    return withCookies(NextResponse.redirect(new URL('/login', request.url)))
  }

  // ── Profile + role-based access ───────────────────────────────────────
  const profile = await getProfile()
  if (!profile) {
    if (path.startsWith('/api/')) {
      return withCookies(NextResponse.json({ error: 'User profile not found' }, { status: 401 }))
    }
    await supabase.auth.signOut()
    return withCookies(NextResponse.redirect(new URL('/login', request.url)))
  }

  // Role-based access control — allow-list approach (fail-closed)
  const adminRoles = ['admin', 'super_admin']
  if ((path.startsWith('/admin') || path.startsWith('/api/admin')) && !adminRoles.includes(profile.role)) {
    if (path.startsWith('/api/')) {
      return withCookies(NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 }))
    }
    return withCookies(NextResponse.redirect(new URL('/student', request.url)))
  }
  if (path.startsWith('/student') && profile.role !== 'student') {
    return withCookies(NextResponse.redirect(new URL('/admin', request.url)))
  }

  return withSecurityHeaders(supabaseResponse)
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/student/:path*',
    '/admin/:path*',
    '/api/auth/:path*',
    '/api/reviews/:path*',
    '/api/menu/:path*',
    '/api/blocks/:path*',
    '/api/analytics/:path*',
    '/api/admin/:path*',
    '/api/complaints/:path*',
    '/api/profile/:path*',
    '/api/time/:path*',
    '/api/notifications/:path*',
    '/api/reports/:path*',
    '/api/checkin/:path*',
    '/api/admin/checkin/:path*',
    '/api/meal-timings/:path*',
    '/api/health/:path*',
  ],
}
