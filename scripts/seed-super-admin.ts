import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

// Load .env file
const envPath = resolve(process.cwd(), '.env')
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex)
    const value = trimmed.slice(eqIndex + 1)
    process.env[key] = value
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials missing.')
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function seedSuperAdmin() {
    console.log('Creating super admin account...')

    const registerId = 'SUPERADMIN'
    const password = process.env.SUPER_ADMIN_PASSWORD
    if (!password) {
        throw new Error('SUPER_ADMIN_PASSWORD environment variable is required. Set it before running this script.')
    }
    if (password.length < 10) {
        throw new Error('SUPER_ADMIN_PASSWORD must be at least 10 characters for security.')
    }
    const syntheticEmail = `${registerId.toLowerCase()}@hostel.local`

    // Check if already exists
    const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('register_id', registerId)
        .single()

    if (existing) {
        console.log('Super admin already exists. Updating role...')
        await supabase
            .from('profiles')
            .update({ role: 'super_admin' })
            .eq('register_id', registerId)
        console.log('✅ Super admin role updated.')
        console.log(`\nLogin with Register ID: ${registerId}`)
        return
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
        email: syntheticEmail,
        password,
    })

    if (authError) {
        console.error('Auth error:', authError.message)

        // If user exists in auth but not profiles, try to sign in and create profile
        if (authError.message.includes('already registered')) {
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
                email: syntheticEmail,
                password,
            })
            if (signInError) {
                console.error('Sign in error:', signInError.message)
                return
            }
            if (signInData.user) {
                const { error: profileError } = await supabase.from('profiles').upsert({
                    id: signInData.user.id,
                    register_id: registerId,
                    name: 'Super Admin',
                    role: 'super_admin',
                })
                if (profileError) {
                    console.error('Profile error:', profileError.message)
                } else {
                    console.log('✅ Super admin created (existing auth user).')
                    console.log(`\nLogin: ${registerId} / ${password}`)
                }
            }
        }
        return
    }

    if (!authData.user) {
        console.error('Failed to create auth user')
        return
    }

    const { error: profileError } = await supabase.from('profiles').insert({
        id: authData.user.id,
        register_id: registerId,
        name: 'Super Admin',
        role: 'super_admin',
    })

    if (profileError) {
        console.error('Profile error:', profileError.message)
        return
    }

    console.log('✅ Super admin created successfully!')
    console.log(`\n  Register ID: ${registerId}`)
    console.log(`  Password:    ${password}`)
    console.log(`  Role:        super_admin`)
}

seedSuperAdmin()
