/**
 * Shared auth-cookie utility — eliminates duplicated Supabase cookie-forwarding
 * boilerplate across auth routes (login, register, me, logout).
 *
 * Replaces the repeated pattern of:
 *   const pendingCookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = []
 *   const supabase = createServerClient(..., { cookies: { setAll(c) { pendingCookies.push(c) } } })
 *   response.cookies.set(name, value, options as any)
 *
 * With properly typed interfaces that eliminate all `as any` casts.
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/** Cookie options compatible with both Supabase SSR and Next.js ResponseCookies */
export interface CookieEntry {
  name: string
  value: string
  options: {
    domain?: string
    path?: string
    maxAge?: number
    expires?: Date
    httpOnly?: boolean
    secure?: boolean
    sameSite?: 'lax' | 'strict' | 'none'
    [key: string]: unknown
  }
}

/**
 * Create a Supabase server client that collects auth cookies for later attachment.
 * Returns the client and the collected cookies array.
 */
export async function createAuthClient() {
  const cookieStore = await cookies()
  const pendingCookies: CookieEntry[] = []

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase configuration')
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach((c) => pendingCookies.push(c as CookieEntry))
      },
    },
  })

  return { supabase, pendingCookies }
}

/**
 * Attach collected Supabase auth cookies to a NextResponse.
 * @param response  The NextResponse to attach cookies to
 * @param pending   Cookies collected by createAuthClient
 * @param sessionOnly If true, removes maxAge/expires to create session-only cookies
 */
export function attachCookies(
  response: NextResponse,
  pending: CookieEntry[],
  sessionOnly = false,
): NextResponse {
  for (const { name, value, options } of pending) {
    const opts = { ...options }
    if (sessionOnly) {
      delete opts.maxAge
      delete opts.expires
    }
    response.cookies.set(name, value, opts)
  }
  return response
}
