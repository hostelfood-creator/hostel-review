import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser Supabase client — cookie-only auth.
 *
 * By default, `createBrowserClient` also writes tokens to localStorage
 * (key: `sb-<ref>-auth-token`), making them trivially copyable from
 * DevTools > Application > Local Storage to impersonate any logged-in user.
 *
 * We disable localStorage/sessionStorage persistence entirely by providing
 * a no-op storage adapter. All auth state is managed via httpOnly cookies
 * set by the server, which JavaScript cannot read.
 */

const noopStorage: Storage = {
    length: 0,
    key: () => null,
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
}

// Actively clean up any lingering local storage tokens to prevent DevTools extraction
if (typeof window !== 'undefined') {
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key?.startsWith('sb-') && key?.endsWith('-auth-token')) {
                localStorage.removeItem(key)
            }
        }
    } catch {}
}

export function createClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Missing Supabase environment variables')
    }

    return createBrowserClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            persistSession: false,
            storage: noopStorage,
        },
    })
}
