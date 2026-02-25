import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials missing in environment variables.')
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function seed() {
    console.log('Seeding demo credentials...')

    const adminEmail = process.env.ADMIN_EMAIL
    const adminPassword = process.env.ADMIN_PASSWORD
    const studentEmail = process.env.STUDENT_EMAIL
    const studentPassword = process.env.STUDENT_PASSWORD

    if (!adminEmail || !adminPassword || !studentEmail || !studentPassword) {
        throw new Error('Demo credentials must be provided via environment variables (ADMIN_EMAIL, ADMIN_PASSWORD, STUDENT_EMAIL, STUDENT_PASSWORD)')
    }

    // Admin
    const adminRes = await supabase.auth.signUp({
        email: adminEmail,
        password: adminPassword
    })

    if (adminRes.error) {
        console.error('Admin user creation failed:', adminRes.error.message)
    } else if (adminRes.data.user) {
        const { error } = await supabase.from('profiles').insert({
            id: adminRes.data.user.id,
            register_id: 'ADMIN01',
            name: 'Admin User',
            role: 'admin'
        })
        if (!error) console.log(`Created admin: ADMIN01 / ${adminPassword}`)
        else console.error('Error creating admin profile:', error.message)
    }

    // Student
    const studentRes = await supabase.auth.signUp({
        email: studentEmail,
        password: studentPassword
    })

    if (studentRes.error) {
        console.error('Student user creation failed:', studentRes.error.message)
    } else if (studentRes.data.user) {
        const { error } = await supabase.from('profiles').insert({
            id: studentRes.data.user.id,
            register_id: 'STUDENT01',
            name: 'Student User',
            role: 'student',
            hostel_block: 'A',
            department: 'CS',
            year: '3'
        })
        if (!error) console.log(`Created student: STUDENT01 / ${studentPassword}`)
        else console.error('Error creating student profile:', error.message)
    }
}

seed()
