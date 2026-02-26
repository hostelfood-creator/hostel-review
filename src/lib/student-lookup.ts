/**
 * SECURITY NOTE on xlsx (SheetJS):
 * npm audit reports a prototype pollution CVE (GHSA-4r6h-8v6p-xvw6) with no fix available.
 * This is MITIGATED here because:
 *   1. The XLSX file is a trusted, admin-controlled file on the server filesystem
 *   2. No user-uploaded spreadsheets are ever parsed
 *   3. The parsed data (register IDs, names, dept, year, hostel) is read-only and never executed
 * If user uploads are ever added, replace xlsx with a safer alternative (e.g., exceljs).
 */
import * as XLSX from 'xlsx'
import path from 'path'
import fs from 'fs'

/**
 * Student record parsed from the master XLSX.
 * One entry per register ID, enriched with hostel block from the sheet name.
 */
export interface StudentRecord {
  name: string
  department: string | null
  year: string | null
  hostelBlock: string
  roomNo: string | null
}

/**
 * In-memory cache of Register ID → StudentRecord from the master XLSX.
 * Parsed once on first request, then reused for the process lifetime.
 *
 * SOURCE FILE: "Students Details 2025-26.xlsx" — contains 5 sheets (VH, AH, MH, KH, SH),
 * one per hostel. Each sheet has columns: Sl.No, [Admission No], Reg.No, Students Name,
 * Dept, Yr, [Room No]. The sheet name maps to the hostel block stored in the database.
 *
 * PERFORMANCE NOTE: Uses synchronous readFileSync + XLSX.read on first access.
 * This is intentional — the file is small (~1200 rows, <100ms parse) and loaded
 * once per process lifetime. Converting to async would change all consumer APIs
 * for negligible benefit.
 */
let studentCache: Map<string, StudentRecord> | null = null

/** Default XLSX filename — overridable via STUDENT_XLSX_PATH env var */
const DEFAULT_XLSX_FILENAME = 'Students Details 2025-26.xlsx'

/**
 * Sheet name → database hostel block name mapping.
 * These must match the `hostel_blocks.name` values in Supabase exactly.
 */
const SHEET_TO_HOSTEL: Record<string, string> = {
  VH: 'Visalakshi Hostel',
  AH: 'Annapoorani Hostel',
  MH: 'Sri Meenakshi Hostel',
  KH: 'Sri Kamakshi Hostel',
  SH: 'Sri Saraswathi Hostel',
}

function loadStudentData(): Map<string, StudentRecord> {
  if (studentCache) return studentCache

  // Configurable path: env var takes precedence over default filename in cwd
  const envPath = process.env.STUDENT_XLSX_PATH
  const filePath = envPath
    ? path.resolve(envPath)
    : path.join(process.cwd(), DEFAULT_XLSX_FILENAME)

  if (!fs.existsSync(filePath)) {
    console.warn('[StudentLookup] XLSX file not found at:', filePath)
    studentCache = new Map()
    return studentCache
  }

  const buffer = fs.readFileSync(filePath)
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const map = new Map<string, StudentRecord>()

  // Parse every sheet — each sheet represents one hostel block
  for (const sheetName of workbook.SheetNames) {
    const hostelBlock = SHEET_TO_HOSTEL[sheetName.trim().toUpperCase()]
    if (!hostelBlock) {
      console.warn(`[StudentLookup] Unknown sheet name "${sheetName}" — skipping`)
      continue
    }

    const sheet = workbook.Sheets[sheetName]
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    if (rows.length === 0) continue

    // Dynamic header detection — find the header row (some sheets like AH have empty leading rows)
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
      console.warn(`[StudentLookup] No header row found in sheet "${sheetName}" — skipping`)
      continue
    }

    const headerRow = (rows[headerRowIdx] || []).map(h => String(h ?? '').trim().toLowerCase())

    // Find column indices by header name (handles varying column layouts per sheet)
    const regIdx = headerRow.findIndex(h => h.includes('reg'))
    const nameIdx = headerRow.findIndex(h => h.includes('students name') || h === 'name')
    const deptIdx = headerRow.findIndex(h => h.includes('dept'))
    const yearIdx = headerRow.findIndex(h => h === 'yr' || h === 'year')
    const roomIdx = headerRow.findIndex(h => h.includes('room'))

    if (regIdx === -1 || nameIdx === -1) {
      console.warn(`[StudentLookup] Missing Reg.No or Students Name column in sheet "${sheetName}"`)
      continue
    }

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || !row[regIdx]) continue

      const regNo = String(row[regIdx]).trim().toUpperCase()
      if (!regNo || regNo.length < 3) continue

      // Skip if already seen (first occurrence wins — shouldn't have duplicates across sheets)
      if (!map.has(regNo)) {
        map.set(regNo, {
          name: String(row[nameIdx] || '').trim(),
          department: deptIdx >= 0 ? (String(row[deptIdx] || '').trim() || null) : null,
          year: yearIdx >= 0 ? (String(row[yearIdx] || '').trim() || null) : null,
          hostelBlock,
          roomNo: roomIdx >= 0 ? (String(row[roomIdx] || '').trim() || null) : null,
        })
      }
    }
  }

  studentCache = map
  console.log(`[StudentLookup] Loaded ${map.size} students from ${workbook.SheetNames.length} hostel sheets`)
  return map
}

/**
 * Invalidate the in-memory student cache.
 * Called after an admin uploads a new XLSX file so the next lookup reloads fresh data.
 */
export function invalidateStudentCache(): void {
  studentCache = null
  console.log('[StudentLookup] Cache invalidated — will reload on next lookup')
}

/**
 * Look up full student details by Register ID from the master XLSX.
 * Returns the full StudentRecord if found, or null if not found.
 */
export function lookupStudent(registerId: string): StudentRecord | null {
  try {
    const students = loadStudentData()
    return students.get(registerId.trim().toUpperCase()) || null
  } catch (error) {
    console.error('[StudentLookup] Error:', error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Look up only the student name by Register ID.
 * Backward-compatible wrapper — used by profile edit guard and registration name verification.
 */
export function lookupStudentName(registerId: string): string | null {
  const record = lookupStudent(registerId)
  return record?.name || null
}
