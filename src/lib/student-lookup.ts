/**
 * SECURITY NOTE on xlsx (SheetJS):
 * npm audit reports a prototype pollution CVE (GHSA-4r6h-8v6p-xvw6) with no fix available.
 * This is MITIGATED here because:
 *   1. The XLSX file is a trusted, admin-controlled file on the server filesystem
 *   2. No user-uploaded spreadsheets are ever parsed
 *   3. The parsed data (register IDs + names) is read-only and never executed
 * If user uploads are ever added, replace xlsx with a safer alternative (e.g., exceljs).
 */
import * as XLSX from 'xlsx'
import path from 'path'
import fs from 'fs'

/**
 * In-memory cache of Register ID → student name from the master XLSX.
 * Parsed once on first request, then reused for the process lifetime.
 * Only stores names — no emails or other PII.
 *
 * PERFORMANCE NOTE: Uses synchronous readFileSync + XLSX.read on first access.
 * This is intentional — the file is small (~2000 rows, <100ms parse) and loaded
 * once per process lifetime. Converting to async would change all consumer APIs
 * for negligible benefit. For files >10k rows, consider async + worker thread.
 */
let studentCache: Map<string, string> | null = null

/** Default XLSX filename — overridable via STUDENT_XLSX_PATH env var */
const DEFAULT_XLSX_FILENAME = 'Fee Due Even semester 25032025.xlsx'

function loadStudentData(): Map<string, string> {
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
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })

  const map = new Map<string, string>()

  if (rows.length === 0) {
    console.warn('[StudentLookup] XLSX file is empty')
    studentCache = map
    return map
  }

  // Dynamic header detection — find columns by name instead of hardcoded indices
  const headerRow = (rows[0] || []).map(h => String(h ?? '').trim().toLowerCase())
  let nameIdx = headerRow.findIndex(h => h === 'name' || h === 'student name')
  let regIdx = headerRow.findIndex(h => h === 'regno' || h === 'register no' || h === 'registration number' || h === 'reg no')

  // Fallback to legacy hardcoded indices if headers don't match
  // Columns: 0=Sl.No, 1=Name, 2=Regno (known layout from "Fee Due Even semester" file)
  if (nameIdx === -1) nameIdx = 1
  if (regIdx === -1) regIdx = 2

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !row[regIdx]) continue

    const regNo = String(row[regIdx]).trim().toUpperCase()
    if (!map.has(regNo)) {
      map.set(regNo, String(row[nameIdx] || '').trim())
    }
  }

  studentCache = map
  console.log(`[StudentLookup] Loaded ${map.size} students from XLSX`)
  return map
}

/**
 * Look up a student name by Register ID from the master XLSX.
 * Returns the name if found, or null if not found.
 * This is the preferred API — avoids exposing the full cache to callers.
 */
export function lookupStudentName(registerId: string): string | null {
  try {
    const students = loadStudentData()
    return students.get(registerId.trim().toUpperCase()) || null
  } catch (error) {
    console.error('[StudentLookup] Error:', error instanceof Error ? error.message : error)
    return null
  }
}
