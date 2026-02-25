import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Missing Supabase environment variables')
    }

    const supabase = createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set({ name, value, ...options }))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // IMPORTANT: Avoid writing any logic between createServerClient and
    // supabase.auth.getUser(). A simple mistake could make it very hard to debug
    // issues with users being randomly logged out.

    const {
        data: { user },
    } = await supabase.auth.getUser()

    const path = request.nextUrl.pathname
    const publicPaths = ['/login', '/api/auth/login', '/api/auth/register']

    if (publicPaths.some((p) => path.startsWith(p))) {
        if (user && path === '/login') {
            // Need to fetch role securely from profiles table
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single()

            const dest = profile?.role === 'student' ? '/student' : '/admin'
            return NextResponse.redirect(new URL(dest, request.url))
        }
        return supabaseResponse
    }

    if (path === '/') {
        if (user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single()

            const dest = profile?.role === 'student' ? '/student' : '/admin'
            return NextResponse.redirect(new URL(dest, request.url))
        }
        return NextResponse.redirect(new URL('/login', request.url))
    }

    if (!user) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    // Auth checking for protected routes
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (path.startsWith('/admin') && profile?.role === 'student') {
        return NextResponse.redirect(new URL('/student', request.url))
    }

    if (path.startsWith('/student') && profile?.role !== 'student') {
        return NextResponse.redirect(new URL('/admin', request.url))
    }

    return supabaseResponse
}
