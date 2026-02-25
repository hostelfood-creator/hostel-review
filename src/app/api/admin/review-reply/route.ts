import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

/** POST — Admin reply to a review */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = checkRateLimit(`review-reply:${ip}`, 20, 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, hostel_block')
      .eq('id', user.id)
      .single()

    if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { reviewId, reply } = body

    if (!reviewId) {
      return NextResponse.json({ error: 'Review ID is required' }, { status: 400 })
    }

    const replyText = (reply || '').trim()
    if (!replyText) {
      return NextResponse.json({ error: 'Reply text is required' }, { status: 400 })
    }
    if (replyText.length > 2000) {
      return NextResponse.json({ error: 'Reply must be under 2000 characters' }, { status: 400 })
    }

    // Use service client to bypass RLS for reading the review
    const serviceDb = createServiceClient()

    // Verify the review exists
    const { data: review, error: fetchErr } = await serviceDb
      .from('reviews')
      .select('id, user_id')
      .eq('id', reviewId)
      .single()

    if (fetchErr || !review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    }

    // For block-scoped admins, verify the review belongs to a student in their block
    if (profile.role === 'admin' && profile.hostel_block) {
      const { data: studentProfile } = await serviceDb
        .from('profiles')
        .select('hostel_block')
        .eq('id', review.user_id)
        .single()

      if (studentProfile?.hostel_block !== profile.hostel_block) {
        return NextResponse.json({ error: 'You can only reply to reviews from your hostel block' }, { status: 403 })
      }
    }

    // Update the review with the admin reply
    const { error: updateErr } = await serviceDb
      .from('reviews')
      .update({
        admin_reply: replyText,
        admin_reply_by: user.id,
        admin_replied_at: new Date().toISOString(),
      })
      .eq('id', reviewId)

    if (updateErr) {
      console.error('Review reply error:', updateErr)
      return NextResponse.json({ error: 'Failed to save reply' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Review reply error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
