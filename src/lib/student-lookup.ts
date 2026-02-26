/**
 * Student lookup — queries the `student_records` table in Supabase.
 *
 * This replaces the previous filesystem-based XLSX approach, which didn't work
 * on serverless platforms (Vercel) because the XLSX file was gitignored and
 * ephemeral filesystem writes don't persist between invocations.
 *
 * The student data lives in a Supabase table (seeded via scripts/seed-student-records.ts)
 * and can be updated by super_admin via the /api/admin/student-data upload endpoint.
 *
 * CACHING: Individual records are cached in-memory for 5 minutes to reduce DB queries.
 * The cache is invalidated when a super_admin uploads a new XLSX file.
 */
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Student record from the `student_records` table.
 */
export interface StudentRecord {
  name: string
  department: string | null
  year: string | null
  hostelBlock: string
  roomNo: string | null
}

/**
 * In-memory cache: register_id → { record, expiresAt }
 * TTL = 5 minutes. Cleared entirely on invalidation (admin upload).
 */
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { record: StudentRecord | null; expiresAt: number }>()

/**
 * Invalidate the in-memory student cache.
 * Called after an admin uploads a new XLSX file so subsequent lookups re-query.
 */
export function invalidateStudentCache(): void {
  cache.clear()
}

/**
 * Look up full student details by Register ID from the Supabase `student_records` table.
 * Returns the full StudentRecord if found, or null if not found.
 *
 * Uses a per-record 5-minute cache to reduce DB roundtrips.
 */
export async function lookupStudent(registerId: string): Promise<StudentRecord | null> {
  const key = registerId.trim().toUpperCase()
  if (!key) return null

  // Check cache first
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.record
  }

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('student_records')
      .select('name, department, year, hostel_block, room_no')
      .eq('register_id', key)
      .maybeSingle()

    if (error) {
      console.error('[StudentLookup] DB error:', error.message)
      return null
    }

    const record: StudentRecord | null = data
      ? {
          name: data.name,
          department: data.department,
          year: data.year,
          hostelBlock: data.hostel_block,
          roomNo: data.room_no,
        }
      : null

    // Cache the result (including null = not-found, to avoid repeated queries)
    cache.set(key, { record, expiresAt: Date.now() + CACHE_TTL_MS })
    return record
  } catch (error) {
    console.error('[StudentLookup] Error:', error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Look up only the student name by Register ID.
 * Convenience wrapper — used by profile edit guard and registration name verification.
 */
export async function lookupStudentName(registerId: string): Promise<string | null> {
  const record = await lookupStudent(registerId)
  return record?.name || null
}
