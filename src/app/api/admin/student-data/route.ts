import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { invalidateStudentCache } from '@/lib/student-lookup'
import path from 'path'
import fs from 'fs'

/**
 * POST /api/admin/student-data — Upload a new student XLSX file
 * Only accessible by super_admin users.
 *
 * Accepts multipart/form-data with a single file field named "file".
 * The uploaded file replaces the existing "Students Details 2025-26.xlsx"
 * (or the path specified by STUDENT_XLSX_PATH env var) and invalidates
 * the in-memory lookup cache so subsequent lookups use the new data.
 *
 * SECURITY: Only XLSX files under 10 MB are accepted. The file is
 * written atomically (write to temp, then rename) to prevent corruption.
 */

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls']
const DEFAULT_XLSX_FILENAME = 'Students Details 2025-26.xlsx'

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
    const ext = path.extname(file.name).toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
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

    // 4. Read file buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // 5. Determine target path
    const envPath = process.env.STUDENT_XLSX_PATH
    const targetPath = envPath
      ? path.resolve(envPath)
      : path.join(process.cwd(), DEFAULT_XLSX_FILENAME)

    // 6. Atomic write — write to temp file, then rename to prevent corruption
    const tempPath = targetPath + '.tmp.' + Date.now()
    try {
      fs.writeFileSync(tempPath, buffer)
      fs.renameSync(tempPath, targetPath)
    } catch (writeError) {
      // Clean up temp file on failure
      try { fs.unlinkSync(tempPath) } catch { /* ignore */ }
      console.error('[StudentData] File write error:', writeError)
      return NextResponse.json({ error: 'Failed to save file on server.' }, { status: 500 })
    }

    // 7. Invalidate the student lookup cache so new data is used immediately
    invalidateStudentCache()

    return NextResponse.json({
      message: 'Student data uploaded successfully. The lookup cache has been refreshed.',
      filename: file.name,
      size: file.size,
    })
  } catch (error) {
    console.error('[StudentData] Upload error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/admin/student-data — Get info about current student data file
 * Returns file name, size, and last modified date.
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

    const envPath = process.env.STUDENT_XLSX_PATH
    const targetPath = envPath
      ? path.resolve(envPath)
      : path.join(process.cwd(), DEFAULT_XLSX_FILENAME)

    if (!fs.existsSync(targetPath)) {
      return NextResponse.json({ exists: false, message: 'No student data file found.' })
    }

    const stats = fs.statSync(targetPath)
    return NextResponse.json({
      exists: true,
      filename: path.basename(targetPath),
      sizeBytes: stats.size,
      sizeFormatted: `${(stats.size / 1024).toFixed(1)} KB`,
      lastModified: stats.mtime.toISOString(),
    })
  } catch (error) {
    console.error('[StudentData] Info error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
