import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { lookupStudent } from '@/lib/student-lookup'

/**
 * GET /api/auth/lookup?registerId=112451026
 * Public (unauthenticated) endpoint used during registration to auto-fill form fields.
 *
 * SOURCE: Seeded from "Students Details 2025-26.xlsx" — 5 hostel sheets (VH, AH, MH, KH, SH).
 * Data lives in the `student_records` table (works on serverless platforms).
 *
 * RETURNS: name, hostelBlock, department, year.
 * These are needed pre-auth to auto-fill and lock the registration form. The server-side
 * registration handler (POST /api/auth/register) independently re-verifies all values from
 * the DB, so clients cannot tamper with locked fields.
 *
 * SECURITY TRADEOFFS:
 * - Public endpoint → PII (hostel block, dept, year) is accessible without auth.
 *   This is an intentional tradeoff for UX: students should see their own data pre-filled
 *   during registration without first needing an account.
 * - Mitigated by: rate limiting per IP (20/min), per register ID (3/min),
 *   and timing-attack-resistant uniform random delay on all responses.
 * - Acceptable risk: the exposed data is low-sensitivity student enrollment info,
 *   not credentials or contact details. Mass enumeration is blocked by rate limits.
 */
export async function GET(request: Request) {
  // Per-IP rate limit: 20 lookups/min — hostel students share WiFi (same public IP)
  const ip = getClientIp(request)
  const rl = await checkRateLimit(`lookup:${ip}`, 20, 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  const { searchParams } = new URL(request.url)
  const registerId = searchParams.get('registerId')?.trim().toUpperCase()

  if (!registerId || registerId.length < 5) {
    return NextResponse.json({ found: false }, { status: 200 })
  }

  // Per-registerId rate limit: 3 lookups per minute per specific ID
  // Prevents targeted enumeration of individual register IDs
  const idRl = await checkRateLimit(`lookup-id:${registerId}`, 3, 60 * 1000)
  if (!idRl.allowed) return rateLimitResponse(idRl.resetAt)

  try {
    const record = await lookupStudent(registerId)

    // Uniform random delay on ALL responses to prevent timing side-channels
    // Both found and not-found take the same time range, preventing enumeration via timing
    const jitter = 100 + Math.random() * 200
    await new Promise(r => setTimeout(r, jitter))

    if (record) {
      // Return name + hostel/dept/year for registration auto-fill.
      // The student is entering their own register ID, so this is their own data.
      // Server-side registration still enforces these values from the DB.
      return NextResponse.json({
        found: true,
        name: record.name,
        hostelBlock: record.hostelBlock,
        department: record.department,
        year: record.year,
      })
    }

    return NextResponse.json({ found: false })
  } catch (error) {
    console.error('Lookup error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ found: false, error: 'Lookup service unavailable' }, { status: 500 })
  }
}
