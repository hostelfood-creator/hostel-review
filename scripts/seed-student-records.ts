/**
 * Seed script: Import student records from the master XLSX into Supabase.
 *
 * Usage:
 *   npx tsx scripts/seed-student-records.ts
 *
 * Reads "Students Details 2025-26.xlsx" from the project root (or STUDENT_XLSX_PATH env var),
 * parses all 5 hostel sheets (VH, AH, MH, KH, SH), and upserts into the `student_records` table.
 *
 * Safe to re-run — uses ON CONFLICT (register_id) DO UPDATE.
 */
import * as XLSX from 'xlsx'
import path from 'path'
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

// Load .env manually (no dotenv dependency)
import { readFileSync } from 'fs'
const envContent = readFileSync(path.join(process.cwd(), '.env'), 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx).trim()
  const val = trimmed.slice(eqIdx + 1).trim()
  if (!process.env[key]) process.env[key] = val
}

const SHEET_TO_HOSTEL: Record<string, string> = {
  VH: 'Visalakshi Hostel',
  AH: 'Annapoorani Hostel',
  MH: 'Sri Meenakshi Hostel',
  KH: 'Sri Kamakshi Hostel',
  SH: 'Sri Saraswathi Hostel',
}

const DEFAULT_XLSX_FILENAME = 'Students Details 2025-26.xlsx'

interface StudentRow {
  register_id: string
  name: string
  department: string | null
  year: string | null
  hostel_block: string
  room_no: string | null
}

async function main() {
  // 1. Validate env
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 2. Read XLSX
  const envPath = process.env.STUDENT_XLSX_PATH
  const filePath = envPath
    ? path.resolve(envPath)
    : path.join(process.cwd(), DEFAULT_XLSX_FILENAME)

  if (!fs.existsSync(filePath)) {
    console.error(`XLSX file not found at: ${filePath}`)
    process.exit(1)
  }

  console.log(`Reading XLSX from: ${filePath}`)
  const buffer = fs.readFileSync(filePath)
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  // Use Map to deduplicate by register_id (first occurrence wins — same as original student-lookup.ts)
  const recordMap = new Map<string, StudentRow>()

  // 3. Parse each sheet
  for (const sheetName of workbook.SheetNames) {
    const hostelBlock = SHEET_TO_HOSTEL[sheetName.trim().toUpperCase()]
    if (!hostelBlock) {
      console.warn(`Unknown sheet "${sheetName}" — skipping`)
      continue
    }

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

    if (headerRowIdx === -1) {
      console.warn(`No header row found in sheet "${sheetName}" — skipping`)
      continue
    }

    const headerRow = (rows[headerRowIdx] || []).map(h => String(h ?? '').trim().toLowerCase())
    const regIdx = headerRow.findIndex(h => h.includes('reg'))
    const nameIdx = headerRow.findIndex(h => h.includes('students name') || h === 'name')
    const deptIdx = headerRow.findIndex(h => h.includes('dept'))
    const yearIdx = headerRow.findIndex(h => h === 'yr' || h === 'year')
    const roomIdx = headerRow.findIndex(h => h.includes('room'))

    if (regIdx === -1 || nameIdx === -1) {
      console.warn(`Missing Reg.No or Students Name column in sheet "${sheetName}"`)
      continue
    }

    let count = 0
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || !row[regIdx]) continue

      const regNo = String(row[regIdx]).trim().toUpperCase()
      if (!regNo || regNo.length < 3) continue

      // First occurrence wins (same dedup logic as original student-lookup.ts)
      if (!recordMap.has(regNo)) {
        recordMap.set(regNo, {
          register_id: regNo,
          name: String(row[nameIdx] || '').trim(),
          department: deptIdx >= 0 ? (String(row[deptIdx] || '').trim() || null) : null,
          year: yearIdx >= 0 ? (String(row[yearIdx] || '').trim() || null) : null,
          hostel_block: hostelBlock,
          room_no: roomIdx >= 0 ? (String(row[roomIdx] || '').trim() || null) : null,
        })
        count++
      }
    }

    console.log(`  ${sheetName} (${hostelBlock}): ${count} unique students`)
  }

  const records = Array.from(recordMap.values())
  console.log(`\nTotal unique records to insert: ${records.length}`)

  if (records.length === 0) {
    console.error('No records parsed — check XLSX file format')
    process.exit(1)
  }

  // 4. Upsert in batches of 500
  const BATCH_SIZE = 500
  let inserted = 0
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('student_records')
      .upsert(batch, { onConflict: 'register_id' })

    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message)
      process.exit(1)
    }
    inserted += batch.length
    console.log(`  Upserted ${inserted}/${records.length}`)
  }

  console.log(`\nDone! ${inserted} student records imported into student_records table.`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
