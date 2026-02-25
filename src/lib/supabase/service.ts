import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Creates a Supabase client using the SERVICE ROLE key.
 * This bypasses Row-Level Security (RLS) — use ONLY on the server side
 * for operations that need to read/write across all rows (e.g. enriching
 * reviews with profile names from other users).
 *
 * NEVER expose this client or its key to the browser.
 */
export function createServiceClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    return createSupabaseClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    })
}
