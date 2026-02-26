import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getReviews, createReview, getStudentHostelBlocks } from '@/lib/db'
import { getTodayDate, analyzeSentiment } from '@/lib/utils'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

/** Get IST date/hour using Intl API */
function getISTDateTime() {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((p) => [p.type, p.value])
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hours: parseInt(parts.hour!, 10),
  }
}

export async function GET(request: Request) {
  try {
    // Rate limit: 30 reads per minute per IP
    const ip = getClientIp(request)
    const rl = checkRateLimit(`reviews-get:${ip}`, 30, 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: profile } = await supabase.from('profiles').select('role, hostel_block').eq('id', user.id).single()

    // If profile cannot be retrieved, default to most restrictive access (student)
    if (!profile) {
      const filters = { userId: user.id, limit: 50, offset: 0 }
      const { data: reviews, total } = await getReviews(filters)
      return NextResponse.json({ reviews, userRole: 'student', userBlock: null, hostelBlocks: [], pagination: { page: 1, pageSize: 50, total, totalPages: Math.ceil(total / 50) } })
    }

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') || undefined
    const rawMeal = searchParams.get('mealType') || undefined
    const mealType = rawMeal && rawMeal !== 'all' ? rawMeal : undefined

    // For admins, enforce their assigned block. Super admins can provide it via query, or see all.
    let hostelBlock = searchParams.get('hostelBlock') || undefined
    if (profile?.role === 'admin') {
      if (!profile.hostel_block) {
        return NextResponse.json({ error: 'Your admin account has no hostel block assigned' }, { status: 403 })
      }
      hostelBlock = profile.hostel_block
    }

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50')))

    const filters: { userId?: string; date?: string; mealType?: string; limit?: number; offset?: number; hostelBlock?: string } = {}
    if (date) filters.date = date
    if (mealType) filters.mealType = mealType
    if (hostelBlock) filters.hostelBlock = hostelBlock
    // Default to most restrictive access: filter by userId unless the role is explicitly admin/super_admin.
    // This ensures null/unexpected roles cannot see other users' reviews.
    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      filters.userId = user.id
    }
    filters.limit = pageSize
    filters.offset = (page - 1) * pageSize

    const { data: reviews, total } = await getReviews(filters)
    const hostelBlocks = profile?.role === 'super_admin' ? await getStudentHostelBlocks() : []

    return NextResponse.json({
      reviews,
      userRole: profile?.role,
      userBlock: profile?.hostel_block,
      hostelBlocks,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      }
    })
  } catch (error) {
    console.error('Reviews GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    // Rate limit: 10 review submissions per 15 minutes per IP
    const ip = getClientIp(request)
    const rl = checkRateLimit(`reviews-post:${ip}`, 10, 15 * 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'student') {
      return NextResponse.json({ error: 'Only students can submit reviews' }, { status: 403 })
    }

    const { mealType, rating, reviewText, anonymous } = await request.json()

    const VALID_MEAL_TYPES = ['breakfast', 'lunch', 'snacks', 'dinner']

    if (!mealType || !rating) {
      return NextResponse.json(
        { error: 'Meal type and rating are required' },
        { status: 400 }
      )
    }
    if (!VALID_MEAL_TYPES.includes(mealType)) {
      return NextResponse.json(
        { error: `Invalid meal type. Must be one of: ${VALID_MEAL_TYPES.join(', ')}` },
        { status: 400 }
      )
    }
    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'Rating must be an integer between 1 and 5' },
        { status: 400 }
      )
    }
    if (reviewText && (typeof reviewText !== 'string' || reviewText.length > 2000)) {
      return NextResponse.json(
        { error: 'Review text must be under 2000 characters' },
        { status: 400 }
      )
    }
    const today = getTodayDate()
    const sentiment = reviewText ? analyzeSentiment(reviewText) : 'neutral'

    try {
      const reviewId = await createReview({
        userId: user.id,
        date: today,
        mealType,
        rating,
        reviewText: reviewText || undefined,
        sentiment,
        anonymous: anonymous || false,
      })

      return NextResponse.json({ review: { id: reviewId } })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message.includes('unique constraint') || message.includes('already')) {
        return NextResponse.json(
          { error: 'You have already reviewed this meal today' },
          { status: 409 }
        )
      }
      throw error
    }
  } catch (error) {
    console.error('Reviews POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** PATCH — Edit a review (only within same day while meal window is still open) */
export async function PATCH(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = checkRateLimit(`reviews-patch:${ip}`, 10, 15 * 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'student') {
      return NextResponse.json({ error: 'Only students can edit reviews' }, { status: 403 })
    }

    const { reviewId, rating, reviewText } = await request.json()

    if (!reviewId) {
      return NextResponse.json({ error: 'Review ID is required' }, { status: 400 })
    }

    // Fetch the review
    const { data: review, error: fetchErr } = await supabase
      .from('reviews')
      .select('*')
      .eq('id', reviewId)
      .single()

    if (fetchErr || !review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    }

    if (review.user_id !== user.id) {
      return NextResponse.json({ error: 'You can only edit your own reviews' }, { status: 403 })
    }

    // Check: review must be from today and it must still be today (IST)
    const { date: todayIST } = getISTDateTime()
    if (review.date !== todayIST) {
      return NextResponse.json({ error: 'You can only edit reviews from today' }, { status: 403 })
    }

    const updates: Record<string, unknown> = {}
    if (rating !== undefined) {
      if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
        return NextResponse.json({ error: 'Rating must be an integer between 1 and 5' }, { status: 400 })
      }
      updates.rating = rating
    }
    if (reviewText !== undefined) {
      if (typeof reviewText !== 'string' || reviewText.length > 2000) {
        return NextResponse.json({ error: 'Review text must be under 2000 characters' }, { status: 400 })
      }
      updates.review_text = reviewText || null
      updates.sentiment = reviewText ? analyzeSentiment(reviewText) : 'neutral'
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { error: updateErr } = await supabase
      .from('reviews')
      .update(updates)
      .eq('id', reviewId)

    if (updateErr) {
      console.error('Review update error:', updateErr)
      return NextResponse.json({ error: 'Failed to update review' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reviews PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** DELETE — Delete a review (only within 24 hours of creation) */
export async function DELETE(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = checkRateLimit(`reviews-delete:${ip}`, 10, 15 * 60 * 1000)
    if (!rl.allowed) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'student') {
      return NextResponse.json({ error: 'Only students can delete reviews' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const reviewId = searchParams.get('id')

    if (!reviewId) {
      return NextResponse.json({ error: 'Review ID is required' }, { status: 400 })
    }

    // Fetch the review
    const { data: review, error: fetchErr } = await supabase
      .from('reviews')
      .select('*')
      .eq('id', reviewId)
      .single()

    if (fetchErr || !review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    }

    if (review.user_id !== user.id) {
      return NextResponse.json({ error: 'You can only delete your own reviews' }, { status: 403 })
    }

    // Check: review must be within 24 hours
    const createdAt = new Date(review.created_at).getTime()
    const now = Date.now()
    const hoursElapsed = (now - createdAt) / (1000 * 60 * 60)

    if (hoursElapsed > 24) {
      return NextResponse.json({ error: 'Reviews can only be deleted within 24 hours of submission' }, { status: 403 })
    }

    const { error: deleteErr } = await supabase
      .from('reviews')
      .delete()
      .eq('id', reviewId)

    if (deleteErr) {
      console.error('Review delete error:', deleteErr)
      return NextResponse.json({ error: 'Failed to delete review' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reviews DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
