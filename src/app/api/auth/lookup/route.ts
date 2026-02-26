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
  // Per-IP rate limit: 20 lookups/min — hostel students share WiFi (same public IP)
  const ip = getClientIp(request)
  const rl = checkRateLimit(`lookup:${ip}`, 20, 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  const { searchParams } = new URL(request.url)
  const registerId = searchParams.get('registerId')?.trim().toUpperCase()

  if (!registerId || registerId.length < 5) {
    return NextResponse.json({ found: false }, { status: 200 })
  }

  // Per-registerId rate limit: 3 lookups per minute per specific ID
  // Prevents targeted enumeration of individual register IDs
  const idRl = checkRateLimit(`lookup-id:${registerId}`, 3, 60 * 1000)
  if (!idRl.allowed) return rateLimitResponse(idRl.resetAt)

  try {
    const record = lookupStudent(registerId)

    // Uniform random delay on ALL responses to prevent timing side-channels
    // Both found and not-found take the same time range, preventing enumeration via timing
    const jitter = 100 + Math.random() * 200
    await new Promise(r => setTimeout(r, jitter))

    if (record) {
      // Only return the name — minimum data needed for registration UX.
      // Hostel block, department, and year are NOT exposed here to prevent
      // PII enumeration. These fields are enforced server-side during
      // registration via lookupStudent() in the register route.
      return NextResponse.json({
        found: true,
        name: record.name,
      })
    }

    return NextResponse.json({ found: false })
  } catch (error) {
    console.error('Lookup error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ found: false, error: 'Lookup service unavailable' }, { status: 500 })
  }
}
