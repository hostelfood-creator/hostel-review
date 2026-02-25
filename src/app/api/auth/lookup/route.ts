import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { lookupStudentName } from '@/lib/student-lookup'

/**
 * GET /api/auth/lookup?registerId=112451026
 * Returns only the student name from the master XLSX.
 * No email or other PII is exposed. Used on the registration page to auto-fill the name field.
 */
export async function GET(request: Request) {
  // Rate limit: 10 lookups per minute per IP to prevent enumeration
  const ip = getClientIp(request)
  const rl = checkRateLimit(`lookup:${ip}`, 10, 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  const { searchParams } = new URL(request.url)
  const registerId = searchParams.get('registerId')?.trim().toUpperCase()

  if (!registerId || registerId.length < 2) {
    return NextResponse.json({ found: false }, { status: 200 })
  }

  try {
    const name = lookupStudentName(registerId)

    if (name) {
      return NextResponse.json({ found: true, name })
    }

    return NextResponse.json({ found: false })
  } catch (error) {
    console.error('Lookup error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ found: false, error: 'Lookup service unavailable' }, { status: 500 })
  }
}
