'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faUsers, faUserCheck, faUserXmark, faFilePdf,
  faSearch, faCalendarDay, faArrowLeft, faUtensils,
  faChartColumn, faFilter, faDownload
} from '@fortawesome/free-solid-svg-icons'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

interface AttendanceRecord {
  userId: string
  name: string
  registerId: string | null
  hostelBlock: string | null
  department: string | null
  year: string | null
  meals: Record<string, { checkedIn: boolean; checkedInAt: string | null }>
}

interface AttendanceSummary {
  total: number
  ate: Record<string, number>
  missed: Record<string, number>
}

interface HistoryDay {
  date: string
  counts: Record<string, number>
  total: number
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snacks: 'Snacks',
  dinner: 'Dinner',
}

// Emojis removed per admin request — clean text labels only

/** Format "2025-02-26" to "Feb 26" */
function shortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

/** Format ISO timestamp to "10:32 AM" */
function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

/** Get IST today as YYYY-MM-DD */
function getISTToday(): string {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })
  return formatter.format(now) // en-CA = YYYY-MM-DD
}

/** Escape HTML entities to prevent XSS in PDF export */
function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export default function AttendanceListPage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [summary, setSummary] = useState<AttendanceSummary | null>(null)
  const [history, setHistory] = useState<HistoryDay[]>([])
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [date, setDate] = useState(getISTToday())
  const [mealFilter, setMealFilter] = useState('all')
  const [blockFilter, setBlockFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'ate' | 'missed'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [userRole, setUserRole] = useState('')
  const [hostelBlocks, setHostelBlocks] = useState<string[]>([])
  const [tab, setTab] = useState('list')
  const tableRef = useRef<HTMLDivElement>(null)

  // Load hostel blocks for super admin filter
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        setUserRole(d.user?.role || '')
        if (d.user?.role === 'super_admin') {
          fetch('/api/blocks').then(r => r.json()).then(b =>
            setHostelBlocks((b.blocks || []).map((bl: { name: string }) => bl.name))
          )
        }
      })
      .catch(() => {})
  }, [])

  // Load detailed attendance list
  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ date })
      if (mealFilter !== 'all') params.set('mealType', mealFilter)
      if (blockFilter !== 'all') params.set('hostelBlock', blockFilter)

      const res = await fetch(`/api/admin/attendance-list?${params}`)
      const data = await res.json()
      setRecords(data.records || [])
      setSummary(data.summary || null)
    } catch {
      toast.error('Failed to load attendance')
    } finally {
      setLoading(false)
    }
  }, [date, mealFilter, blockFilter])

  // Load day-by-day history
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const endDate = getISTToday()
      const startD = new Date()
      startD.setDate(startD.getDate() - 14)
      const startDate = startD.toISOString().split('T')[0]
      const params = new URLSearchParams({ mode: 'history', startDate, endDate })
      if (blockFilter !== 'all') params.set('hostelBlock', blockFilter)

      const res = await fetch(`/api/admin/attendance-list?${params}`)
      const data = await res.json()
      setHistory(data.history || [])
    } catch {
      console.error('Failed to load attendance history')
    } finally {
      setHistoryLoading(false)
    }
  }, [blockFilter])

  useEffect(() => {
    loadList()
    loadHistory()
  }, [loadList, loadHistory])

  // Real-time subscription for meal_checkins — debounced to avoid thundering herd
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const supabase = createClient()
    const channel = supabase.channel('admin_attendance_list_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_checkins' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          if (tab === 'list') loadList()
          if (tab === 'history') loadHistory()
        }, 15_000) // refresh at most once every 15 seconds
      })
      .subscribe()

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      supabase.removeChannel(channel)
    }
  }, [loadList, loadHistory, tab])

  // Filter records by search and status
  const meals = mealFilter !== 'all' ? [mealFilter] : ['breakfast', 'lunch', 'snacks', 'dinner']

  const filteredRecords = records.filter((r) => {
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matchName = r.name.toLowerCase().includes(q)
      const matchId = r.registerId?.toLowerCase().includes(q)
      const matchBlock = r.hostelBlock?.toLowerCase().includes(q)
      if (!matchName && !matchId && !matchBlock) return false
    }

    // Status filter
    if (statusFilter === 'ate') {
      return meals.some(m => r.meals[m]?.checkedIn)
    }
    if (statusFilter === 'missed') {
      return meals.every(m => !r.meals[m]?.checkedIn)
    }

    return true
  })

  // Counts for header
  const ateCount = records.filter(r => meals.some(m => r.meals[m]?.checkedIn)).length
  const missedCount = records.filter(r => meals.every(m => !r.meals[m]?.checkedIn)).length

  // ── PDF Export ─────────────────────────────────────────
  const exportPDF = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast.error('Please allow popups to export PDF')
      return
    }

    const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
    const mealLabel = mealFilter !== 'all' ? MEAL_LABELS[mealFilter] : 'All Meals'
    const blockLabel = blockFilter !== 'all' ? blockFilter : 'All Blocks'

    // Build table rows
    const headerCols = meals.map(m => `<th style="padding:8px 12px;border:1px solid #ddd;background:#f5f5f5;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">${MEAL_LABELS[m]}</th>`).join('')

    const rows = filteredRecords.map((r, idx) => {
      const mealCols = meals.map(m => {
        const mc = r.meals[m]
        return `<td style="padding:8px 12px;border:1px solid #ddd;text-align:center;font-size:12px">${mc?.checkedIn
          ? `<span style="color:#16a34a;font-weight:600">✓ ${formatTime(mc.checkedInAt)}</span>`
          : '<span style="color:#dc2626;font-weight:600">✗ Missed</span>'
        }</td>`
      }).join('')

      return `<tr style="background:${idx % 2 === 0 ? '#fff' : '#fafafa'}">
        <td style="padding:8px 12px;border:1px solid #ddd;font-size:12px;font-weight:500">${idx + 1}</td>
        <td style="padding:8px 12px;border:1px solid #ddd;font-size:12px;font-weight:600">${escHtml(r.name)}</td>
        <td style="padding:8px 12px;border:1px solid #ddd;font-size:12px;font-family:monospace">${escHtml(r.registerId || '—')}</td>
        <td style="padding:8px 12px;border:1px solid #ddd;font-size:12px">${escHtml(r.hostelBlock || '—')}</td>
        ${mealCols}
      </tr>`
    }).join('')

    // Summary stats
    const summaryRows = meals.map(m =>
      `<div style="display:inline-block;margin:0 16px 8px 0;padding:8px 16px;background:#f0f0f0;border-radius:8px">
        <strong>${MEAL_LABELS[m]}:</strong> ${summary?.ate[m] || 0} ate / ${summary?.missed[m] || 0} missed
      </div>`
    ).join('')

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Attendance Report — ${dateLabel}</title>
  <style>
    @media print { @page { size: landscape; margin: 12mm; } }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 24px; color: #111; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .subtitle { color: #666; font-size: 13px; margin-bottom: 16px; }
    .summary { margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; }
    .footer { margin-top: 24px; color: #999; font-size: 11px; text-align: center; border-top: 1px solid #eee; padding-top: 12px; }
  </style>
</head>
<body>
  <h1>Meal Attendance Report</h1>
  <p class="subtitle">${dateLabel} · ${mealLabel} · ${blockLabel} · ${filteredRecords.length} students</p>

  <div class="summary">
    <strong>Summary:</strong><br/>
    ${summaryRows}
    <div style="display:inline-block;padding:8px 16px;background:#e8f5e9;border-radius:8px;font-weight:600">
      Total: ${ateCount} ate / ${missedCount} missed
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="padding:8px 12px;border:1px solid #ddd;background:#f5f5f5;font-size:11px;width:30px">#</th>
        <th style="padding:8px 12px;border:1px solid #ddd;background:#f5f5f5;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Student Name</th>
        <th style="padding:8px 12px;border:1px solid #ddd;background:#f5f5f5;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Register No.</th>
        <th style="padding:8px 12px;border:1px solid #ddd;background:#f5f5f5;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Hostel</th>
        ${headerCols}
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="footer">
    <p>Generated on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} · Hostel Food Review System</p>
  </div>

  <script>
    window.onload = function() { setTimeout(function() { window.print(); }, 400); };
  </script>
</body>
</html>`)
    printWindow.document.close()
  }

  // ── CSV Export ─────────────────────────────────────────
  const exportCSV = () => {
    const headers = ['#', 'Name', 'Register No.', 'Hostel Block', ...meals.map(m => MEAL_LABELS[m]), ...meals.map(m => `${MEAL_LABELS[m]} Time`)]
    const rows = filteredRecords.map((r, idx) => [
      (idx + 1).toString(),
      r.name,
      r.registerId || '',
      r.hostelBlock || '',
      ...meals.map(m => r.meals[m]?.checkedIn ? 'Present' : 'Absent'),
      ...meals.map(m => formatTime(r.meals[m]?.checkedInAt)),
    ])
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance_${date}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV downloaded!')
  }

  // History chart data
  const historyChartData = history.map(h => ({
    date: shortDate(h.date),
    Breakfast: h.counts.breakfast || 0,
    Lunch: h.counts.lunch || 0,
    Snacks: h.counts.snacks || 0,
    Dinner: h.counts.dinner || 0,
    Total: h.total,
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/attendance">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <FontAwesomeIcon icon={faArrowLeft} className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <FontAwesomeIcon icon={faUsers} className="w-5 h-5 text-primary" />
              Attendance Records
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Detailed view — who ate, who missed, day by day
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportCSV} className="rounded-full">
            <FontAwesomeIcon icon={faDownload} className="w-3.5 h-3.5 mr-1.5" />
            CSV
          </Button>
          <Button size="sm" onClick={exportPDF} className="rounded-full bg-red-600 hover:bg-red-700 text-white">
            <FontAwesomeIcon icon={faFilePdf} className="w-3.5 h-3.5 mr-1.5" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && !loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="rounded-xl">
            <CardContent className="p-4 text-center">
              <FontAwesomeIcon icon={faUsers} className="w-5 h-5 text-blue-500 mb-1" />
              <p className="text-3xl font-bold text-foreground">{summary.total}</p>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-1">Total Students</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-green-200 dark:border-green-500/20">
            <CardContent className="p-4 text-center">
              <FontAwesomeIcon icon={faUserCheck} className="w-5 h-5 text-green-500 mb-1" />
              <p className="text-3xl font-bold text-green-500">{ateCount}</p>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-1">Ate</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-red-200 dark:border-red-500/20">
            <CardContent className="p-4 text-center">
              <FontAwesomeIcon icon={faUserXmark} className="w-5 h-5 text-red-500 mb-1" />
              <p className="text-3xl font-bold text-red-500">{missedCount}</p>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-1">Missed All</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardContent className="p-4 text-center">
              <FontAwesomeIcon icon={faUtensils} className="w-5 h-5 text-primary mb-1" />
              <p className="text-3xl font-bold text-foreground">
                {summary.total > 0 ? Math.round((ateCount / summary.total) * 100) : 0}%
              </p>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-1">Attendance Rate</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Meal-wise stats */}
      {summary && !loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {meals.map(m => (
            <Card key={m} className="rounded-xl">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{MEAL_LABELS[m]}</span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <span className="text-xl font-bold text-green-500">{summary.ate[m] || 0}</span>
                    <span className="text-xs text-muted-foreground ml-1">ate</span>
                  </div>
                  <div>
                    <span className="text-xl font-bold text-red-500">{summary.missed[m] || 0}</span>
                    <span className="text-xs text-muted-foreground ml-1">missed</span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all"
                    style={{ width: `${summary.total > 0 ? ((summary.ate[m] || 0) / summary.total) * 100 : 0}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="list" className="gap-1.5">
            <FontAwesomeIcon icon={faUsers} className="w-3.5 h-3.5" />
            Student List
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <FontAwesomeIcon icon={faChartColumn} className="w-3.5 h-3.5" />
            Day-by-Day
          </TabsTrigger>
        </TabsList>

        {/* ── Student List Tab ── */}
        <TabsContent value="list" className="mt-4 space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-[320px]">
              <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search name, register no., block..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <FontAwesomeIcon icon={faCalendarDay} className="w-3.5 h-3.5 text-muted-foreground" />
              <Input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-auto"
              />
            </div>
            <Select value={mealFilter} onValueChange={setMealFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="All Meals" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Meals</SelectItem>
                <SelectItem value="breakfast">Breakfast</SelectItem>
                <SelectItem value="lunch">Lunch</SelectItem>
                <SelectItem value="snacks">Snacks</SelectItem>
                <SelectItem value="dinner">Dinner</SelectItem>
              </SelectContent>
            </Select>
            {userRole === 'super_admin' && hostelBlocks.length > 0 && (
              <Select value={blockFilter} onValueChange={setBlockFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="All Blocks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Blocks</SelectItem>
                  {hostelBlocks.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'ate' | 'missed')}>
              <SelectTrigger className="w-[120px]">
                <FontAwesomeIcon icon={faFilter} className="w-3 h-3 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="ate">Ate Only</SelectItem>
                <SelectItem value="missed">Missed Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Live badge */}
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {filteredRecords.length} of {records.length} students
            </Badge>
            <Badge variant="secondary" className="text-[10px] gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </Badge>
          </div>

          {/* Table */}
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : filteredRecords.length === 0 ? (
            <Card className="rounded-xl">
              <CardContent className="py-16 text-center">
                <FontAwesomeIcon icon={faUsers} className="w-12 h-12 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground text-sm">No students found</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-xl overflow-hidden">
              <div className="overflow-x-auto" ref={tableRef}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider w-[30px]">#</th>
                      <th className="text-left px-4 py-3 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Student</th>
                      <th className="text-left px-4 py-3 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Register No.</th>
                      <th className="text-left px-4 py-3 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Hostel</th>
                      {meals.map(m => (
                        <th key={m} className="text-center px-3 py-3 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                          {MEAL_LABELS[m]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredRecords.map((r, idx) => {
                      const anyAte = meals.some(m => r.meals[m]?.checkedIn)
                      return (
                        <tr
                          key={r.userId}
                          className={`hover:bg-muted/30 transition-colors ${!anyAte ? 'bg-red-50/50 dark:bg-red-500/[0.03]' : ''}`}
                        >
                          <td className="px-4 py-3 text-xs text-muted-foreground">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-semibold text-foreground">{r.name}</p>
                            {r.department && (
                              <p className="text-[10px] text-muted-foreground">{r.department}{r.year ? ` · ${r.year}` : ''}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.registerId || '—'}</td>
                          <td className="px-4 py-3">
                            {r.hostelBlock ? (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{r.hostelBlock}</Badge>
                            ) : '—'}
                          </td>
                          {meals.map(m => {
                            const mc = r.meals[m]
                            return (
                              <td key={m} className="px-3 py-3 text-center">
                                {mc?.checkedIn ? (
                                  <div>
                                    <Badge variant="success" className="text-[10px] px-1.5">✓</Badge>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{formatTime(mc.checkedInAt)}</p>
                                  </div>
                                ) : (
                                  <Badge variant="destructive" className="text-[10px] px-1.5">✗</Badge>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ── Day-by-Day History Tab ── */}
        <TabsContent value="history" className="mt-4 space-y-4">
          <Card className="rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Daily Attendance (Last 14 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <Skeleton className="h-64 rounded-lg" />
              ) : historyChartData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">No attendance data for this period</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={historyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(161,161,170,0.15)" />
                    <XAxis dataKey="date" tick={{ fill: '#A1A1AA', fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fill: '#A1A1AA', fontSize: 11 }} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--tooltip-bg, #fff)',
                        border: '1px solid var(--tooltip-border, #e4e4e7)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: 'var(--tooltip-color, #18181b)',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="Breakfast" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Lunch" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Snacks" fill="#a855f7" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Dinner" fill="#22c55e" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Day-by-day table */}
          {!historyLoading && history.length > 0 && (
            <Card className="rounded-xl overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Day-by-Day Breakdown</CardTitle>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Date</th>
                      <th className="text-center px-3 py-3 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">🌅 BF</th>
                      <th className="text-center px-3 py-3 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">☀️ LN</th>
                      <th className="text-center px-3 py-3 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">🍪 SN</th>
                      <th className="text-center px-3 py-3 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">🌙 DN</th>
                      <th className="text-center px-3 py-3 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[...history].reverse().map(h => (
                      <tr key={h.date} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-foreground">
                          <button
                            onClick={() => { setDate(h.date); setTab('list') }}
                            className="hover:underline text-primary"
                          >
                            {shortDate(h.date)}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-center text-sm font-semibold">{h.counts.breakfast || 0}</td>
                        <td className="px-3 py-3 text-center text-sm font-semibold">{h.counts.lunch || 0}</td>
                        <td className="px-3 py-3 text-center text-sm font-semibold">{h.counts.snacks || 0}</td>
                        <td className="px-3 py-3 text-center text-sm font-semibold">{h.counts.dinner || 0}</td>
                        <td className="px-3 py-3 text-center text-sm font-bold text-primary">{h.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
