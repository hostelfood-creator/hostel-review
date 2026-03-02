import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { logAdminAction } from '@/lib/audit'

/**
 * GET /api/surveys — List surveys (students see active ones, admins see all)
 * POST /api/surveys — Create a new survey (admin/super_admin only)
 * PATCH /api/surveys — Submit a survey response (students only)
 */

export async function GET(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = await checkRateLimit(`surveys-get:${ip}`, 20, 60 * 1000)
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

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const serviceDb = createServiceClient()
    const now = new Date().toISOString()

    if (profile.role === 'student') {
      // Students: only active, non-expired surveys
      let query = serviceDb
        .from('surveys')
        .select('*')
        .eq('active', true)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order('created_at', { ascending: false })
        .limit(5)

      if (profile.hostel_block) {
        query = query.or(`target_block.is.null,target_block.eq.all,target_block.eq.${profile.hostel_block}`)
      }

      const { data: surveys, error } = await query

      if (error) {
        console.error('[Surveys] Query error:', error)
        return NextResponse.json({ error: 'Failed to fetch surveys' }, { status: 500 })
      }

      // Check which surveys this student has already responded to
      const surveyIds = (surveys || []).map((s: { id: string }) => s.id)
      let respondedIds: string[] = []

      if (surveyIds.length > 0) {
        const { data: responses } = await serviceDb
          .from('survey_responses')
          .select('survey_id')
          .eq('user_id', user.id)
          .in('survey_id', surveyIds)

        respondedIds = (responses || []).map((r: { survey_id: string }) => r.survey_id)
      }

      return NextResponse.json({
        surveys: (surveys || []).map((s: Record<string, unknown>) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          questions: s.questions,
          expiresAt: s.expires_at,
          createdAt: s.created_at,
          responded: respondedIds.includes(s.id as string),
        })),
        userRole: profile.role,
      })
    }

    // Admin / super_admin: all surveys
    let adminQuery = serviceDb
      .from('surveys')
      .select('*, survey_responses(count)')
      .order('created_at', { ascending: false })
      .limit(50)

    if (profile.role === 'admin' && profile.hostel_block) {
      adminQuery = adminQuery.or(`target_block.is.null,target_block.eq.all,target_block.eq.${profile.hostel_block}`)
    }

    const { data: surveys, error } = await adminQuery

    if (error) {
      console.error('[Surveys] Admin query error:', error)
      return NextResponse.json({ error: 'Failed to fetch surveys' }, { status: 500 })
    }

    return NextResponse.json({
      surveys: (surveys || []).map((s: Record<string, unknown>) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        questions: s.questions,
        active: s.active,
        targetBlock: s.target_block,
        expiresAt: s.expires_at,
        createdAt: s.created_at,
        responseCount: Array.isArray(s.survey_responses) ? s.survey_responses.length : ((s.survey_responses as { count?: number })?.count || 0),
      })),
      userRole: profile.role,
    })
  } catch (error) {
    console.error('[Surveys] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = await checkRateLimit(`surveys-post:${ip}`, 5, 60 * 1000)
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

    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Only admins can create surveys' }, { status: 403 })
    }

    const body = await request.json()
    const title = (body.title || '').trim()
    const description = (body.description || '').trim()
    const questions = body.questions // Array of { question: string, type: 'rating' | 'text' | 'choice', options?: string[] }
    const targetBlock = body.targetBlock || (profile.role === 'admin' ? profile.hostel_block : 'all')
    const expiresAt = body.expiresAt || null

    if (!title || title.length > 200) {
      return NextResponse.json({ error: 'Title is required (max 200 chars)' }, { status: 400 })
    }
    if (!Array.isArray(questions) || questions.length === 0 || questions.length > 20) {
      return NextResponse.json({ error: 'Provide 1-20 questions' }, { status: 400 })
    }

    // Validate question structure
    for (const q of questions) {
      if (!q.question || typeof q.question !== 'string') {
        return NextResponse.json({ error: 'Each question must have a text' }, { status: 400 })
      }
      if (!['rating', 'text', 'choice'].includes(q.type)) {
        return NextResponse.json({ error: `Invalid question type: ${q.type}` }, { status: 400 })
      }
    }

    const serviceDb = createServiceClient()
    const { data: inserted, error } = await serviceDb
      .from('surveys')
      .insert({
        title,
        description: description || null,
        questions,
        target_block: targetBlock,
        expires_at: expiresAt,
        active: true,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('[Surveys] Create error:', error)
      return NextResponse.json({ error: 'Failed to create survey' }, { status: 500 })
    }

    logAdminAction(user.id, profile.role, 'survey_create', 'survey', inserted.id, { title, questionCount: questions.length }, ip)

    return NextResponse.json({ survey: { id: inserted.id }, message: 'Survey created' })
  } catch (error) {
    console.error('[Surveys] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = await checkRateLimit(`surveys-respond:${ip}`, 10, 60 * 1000)
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

    if (!profile || profile.role !== 'student') {
      return NextResponse.json({ error: 'Only students can respond to surveys' }, { status: 403 })
    }

    const body = await request.json()
    const surveyId = body.surveyId
    const answers = body.answers // Array of { questionIndex: number, value: string | number }

    if (!surveyId) {
      return NextResponse.json({ error: 'surveyId is required' }, { status: 400 })
    }
    if (!Array.isArray(answers) || answers.length === 0) {
      return NextResponse.json({ error: 'Answers are required' }, { status: 400 })
    }

    const serviceDb = createServiceClient()

    // Check survey exists and is active
    const { data: survey, error: surveyError } = await serviceDb
      .from('surveys')
      .select('id, active, expires_at')
      .eq('id', surveyId)
      .single()

    if (surveyError || !survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
    }
    if (!survey.active) {
      return NextResponse.json({ error: 'Survey is no longer active' }, { status: 400 })
    }
    if (survey.expires_at && new Date(survey.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Survey has expired' }, { status: 400 })
    }

    // Check for duplicate response
    const { data: existing } = await serviceDb
      .from('survey_responses')
      .select('id')
      .eq('survey_id', surveyId)
      .eq('user_id', user.id)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'You have already responded to this survey' }, { status: 409 })
    }

    const { error: insertError } = await serviceDb
      .from('survey_responses')
      .insert({
        survey_id: surveyId,
        user_id: user.id,
        hostel_block: profile.hostel_block,
        answers,
      })

    if (insertError) {
      console.error('[Surveys] Response insert error:', insertError)
      return NextResponse.json({ error: 'Failed to submit response' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Survey response submitted' })
  } catch (error) {
    console.error('[Surveys] PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
