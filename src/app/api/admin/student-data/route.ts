import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { invalidateStudentCache } from '@/lib/student-lookup'
import { createServiceClient } from '@/lib/supabase/service'
import * as XLSX from 'xlsx'

/**
 * POST /api/admin/student-data — Upload a new student XLSX file
 * Only accessible by super_admin users.
 *
 * Accepts multipart/form-data with a single file field named "file".
 * Parses the XLSX in memory and upserts all student records into the
 * `student_records` Supabase table. No filesystem writes — works on
 * serverless platforms (Vercel).
 *
 * SECURITY: Only XLSX files under 10 MB are accepted.
 */

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls']

/** Sheet name → database hostel block name mapping */
const SHEET_TO_HOSTEL: Record<string, string> = {
  VH: 'Visalakshi Hostel',
  AH: 'Annapoorani Hostel',
  MH: 'Sri Meenakshi Hostel',
  KH: 'Sri Kamakshi Hostel',
  SH: 'Sri Saraswathi Hostel',
}

interface StudentRow {
  register_id: string
  name: string
  department: string | null
  year: string | null
  hostel_block: string
  room_no: string | null
}

/** Parse XLSX buffer into deduplicated student rows */
function parseXlsx(buffer: Buffer): StudentRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const recordMap = new Map<string, StudentRow>()

  for (const sheetName of workbook.SheetNames) {
    const hostelBlock = SHEET_TO_HOSTEL[sheetName.trim().toUpperCase()]
    if (!hostelBlock) continue

    const sheet = workbook.Sheets[sheetName]
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    if (rows.length === 0) continue

    // Dynamic header detection
    let headerRowIdx = -1
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const row = rows[i]
      if (!row || row.length < 3) continue
      const cells = row.map(h => String(h ?? '').trim().toLowerCase())
      if (cells.some(c => c.includes('reg') || c.includes('students name'))) {
        headerRowIdx = i
        break
      }
    }
    if (headerRowIdx === -1) continue

    const headerRow = (rows[headerRowIdx] || []).map(h => String(h ?? '').trim().toLowerCase())
    const regIdx = headerRow.findIndex(h => h.includes('reg'))
    const nameIdx = headerRow.findIndex(h => h.includes('students name') || h === 'name')
    const deptIdx = headerRow.findIndex(h => h.includes('dept'))
    const yearIdx = headerRow.findIndex(h => h === 'yr' || h === 'year')
    const roomIdx = headerRow.findIndex(h => h.includes('room'))
    if (regIdx === -1 || nameIdx === -1) continue

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || !row[regIdx]) continue
      const regNo = String(row[regIdx]).trim().toUpperCase()
      if (!regNo || regNo.length < 3) continue
      if (!recordMap.has(regNo)) {
        recordMap.set(regNo, {
          register_id: regNo,
          name: String(row[nameIdx] || '').trim(),
          department: deptIdx >= 0 ? (String(row[deptIdx] || '').trim() || null) : null,
          year: yearIdx >= 0 ? (String(row[yearIdx] || '').trim() || null) : null,
          hostel_block: hostelBlock,
          room_no: roomIdx >= 0 ? (String(row[roomIdx] || '').trim() || null) : null,
        })
      }
    }
  }

  return Array.from(recordMap.values())
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rl = checkRateLimit(`student-data-upload:${ip}`, 5, 15 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  try {
    // 1. Authenticate — must be super_admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden — super admin only' }, { status: 403 })
    }

    // 2. Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded. Please select an XLSX file.' }, { status: 400 })
    }

    // 3. Validate file type and size
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: `Invalid file type "${ext}". Only .xlsx and .xls files are accepted.` },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.` },
        { status: 400 }
      )
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'Uploaded file is empty.' }, { status: 400 })
    }

    // 4. Parse XLSX in memory
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const records = parseXlsx(buffer)

    if (records.length === 0) {
      return NextResponse.json(
        { error: 'No valid student records found in the uploaded file. Check the sheet format.' },
        { status: 400 }
      )
    }

    // 5. Upsert into Supabase student_records table (batches of 500)
    const adminClient = createServiceClient()
    const BATCH_SIZE = 500
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE)
      const { error: upsertError } = await adminClient
        .from('student_records')
        .upsert(batch, { onConflict: 'register_id' })

      if (upsertError) {
        console.error('[StudentData] Upsert error:', upsertError.message)
        return NextResponse.json({ error: 'Failed to save student records.' }, { status: 500 })
      }
    }

    // 6. Invalidate in-memory cache so subsequent lookups see new data
    invalidateStudentCache()

    return NextResponse.json({
      message: `Student data uploaded successfully. ${records.length} records imported.`,
      filename: file.name,
      size: file.size,
      recordCount: records.length,
    })
  } catch (error) {
    console.error('[StudentData] Upload error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/admin/student-data — Get info about current student data
 * Returns record counts grouped by hostel block.
 */
export async function GET(request: Request) {
  const ip = getClientIp(request)
  const rl = checkRateLimit(`student-data-info:${ip}`, 30, 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const adminClient = createServiceClient()
    const { count, error } = await adminClient
      .from('student_records')
      .select('id', { count: 'exact', head: true })

    if (error) {
      return NextResponse.json({ error: 'Failed to query student records' }, { status: 500 })
    }

    return NextResponse.json({
      exists: (count || 0) > 0,
      totalRecords: count || 0,
      message: count ? `${count} student records in database` : 'No student records found.',
    })
  } catch (error) {
    console.error('[StudentData] Info error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
