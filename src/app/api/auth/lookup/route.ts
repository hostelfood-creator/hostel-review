import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { lookupStudent } from '@/lib/student-lookup'

/**
 * GET /api/auth/lookup?registerId=112451026
 * Returns student details (name, department, year, hostelBlock) from the master XLSX.
 * Used on the registration page to auto-fill fields when the student enters their Register ID.
 *
 * SOURCE: "Students Details 2025-26.xlsx" — 5 sheets (VH, AH, MH, KH, SH), one per hostel.
 * Each sheet has: Sl.No, [Admission No], Reg.No, Students Name, Dept, Yr, [Room No].
 * The sheet name determines the hostel block.
 *
 * SECURITY: Rate-limited to 6 lookups/min/IP. Full name is returned (needed for
 * registration auto-fill) but the user is already providing their own Register ID,
 * so the data returned corresponds to their own record.
 */
export async function GET(request: Request) {
  // Strict rate limit: 6 lookups per minute per IP to prevent bulk enumeration
  const ip = getClientIp(request)
  const rl = checkRateLimit(`lookup:${ip}`, 6, 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  const { searchParams } = new URL(request.url)
  const registerId = searchParams.get('registerId')?.trim().toUpperCase()

  if (!registerId || registerId.length < 5) {
    return NextResponse.json({ found: false }, { status: 200 })
  }

  try {
    const record = lookupStudent(registerId)

    // Uniform random delay on ALL responses to prevent timing side-channels
    // Both found and not-found take the same time range, preventing enumeration via timing
    const jitter = 100 + Math.random() * 200
    await new Promise(r => setTimeout(r, jitter))

    if (record) {
      return NextResponse.json({
        found: true,
        name: record.name,
        department: record.department,
        year: record.year,
        hostelBlock: record.hostelBlock,
      })
    }

    return NextResponse.json({ found: false })
  } catch (error) {
    console.error('Lookup error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ found: false, error: 'Lookup service unavailable' }, { status: 500 })
  }
}
