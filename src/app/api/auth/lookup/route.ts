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
    const record = lookupStudent(registerId)

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
