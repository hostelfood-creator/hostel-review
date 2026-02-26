import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: Request) {
  try {
    // Rate limit: 5 password changes per 15 minutes per IP
    const ip = getClientIp(request)
    const rl = await checkRateLimit(`change-password:${ip}`, 5, 15 * 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { currentPassword, newPassword } = body

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Current password and new password are required' },
        { status: 400 }
      )
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json(
        { error: 'New password must be at least 6 characters' },
        { status: 400 }
      )
    }

    if (newPassword.length > 128) {
      return NextResponse.json(
        { error: 'New password must be under 128 characters' },
        { status: 400 }
      )
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: 'New password must be different from current password' },
        { status: 400 }
      )
    }

    // Verify current password by attempting to sign in with a throwaway client
    // We use the service client to verify so the SSR session isn't corrupted
    const supabaseAdmin = createServiceClient()
    // user.email is the real university email (stored in auth.users after migration)
    const authEmail = user.email!

    const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: authEmail,
      password: currentPassword,
    })

    if (signInError) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 403 }
      )
    }

    // Update password using the admin client — bypasses session/cookie issues
    // that cause supabase.auth.updateUser() to silently fail in SSR Route Handlers.
    // Always pass email_confirm: true to ensure the user stays confirmed after update.
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password: newPassword, email_confirm: true }
    )

    if (updateError) {
      console.error('Password update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update password. Please try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Change password error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
