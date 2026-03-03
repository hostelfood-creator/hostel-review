'use client'

import { useEffect, useState, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMessage, faStar, faUsers, faBell, faTriangleExclamation, faScrewdriverWrench, faUtensils, faQrcode, faFileUpload, faPrint, faBullhorn, faTrash } from '@fortawesome/free-solid-svg-icons'
import dynamic from 'next/dynamic'
import type { ChartsRowProps, SentimentChartProps, HeatmapProps, WeekOverWeekProps } from '@/components/admin-charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

// Lazy-load chart components to reduce initial bundle size (~200KB)
const ChartsRow = dynamic<ChartsRowProps>(() => import('@/components/admin-charts').then(m => m.ChartsRow), {
  ssr: false,
  loading: () => (
    <div className="w-full h-60 flex items-center justify-center text-muted-foreground text-sm">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
      Loading charts...
    </div>
  ),
})

const SentimentChart = dynamic<SentimentChartProps>(() => import('@/components/admin-charts').then(m => m.SentimentChart), {
  ssr: false,
  loading: () => (
    <div className="w-full h-48 flex items-center justify-center text-muted-foreground text-sm">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
      Loading chart...
    </div>
  ),
})

const RatingHeatmap = dynamic<HeatmapProps>(() => import('@/components/admin-charts').then(m => m.RatingHeatmap), {
  ssr: false,
  loading: () => (
    <div className="w-full h-48 flex items-center justify-center text-muted-foreground text-sm">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
      Loading heatmap...
    </div>
  ),
})

const WeekOverWeekCards = dynamic<WeekOverWeekProps>(() => import('@/components/admin-charts').then(m => m.WeekOverWeekCards), {
  ssr: false,
  loading: () => (
    <div className="w-full h-20 flex items-center justify-center text-muted-foreground text-sm">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
      Loading...
    </div>
  ),
})

interface AnalyticsData {
  overview: {
    totalReviews: number
    avgRating: number
    totalStudents: number
    alertCount: number
    lowRatingPercentage: number
  }
  dailyRatings: { date: string; avgRating: number; count: number }[]
  mealRatings: { mealType: string; avgRating: number; count: number }[]
  sentimentBreakdown: { positive: number; neutral: number; negative: number }
  recentReviews: {
    id: string
    date: string
    mealType: string
    rating: number
    reviewText: string | null
    sentiment: string | null
    userName: string
    hostelBlock: string | null
    createdAt: string
  }[]
  hostelBlocks: string[]
  blockStats: { block: string; totalReviews: number; avgRating: number; positive: number; negative: number }[]
  dayOfWeekHeatmap: { day: string; breakfast: number; lunch: number; snacks: number; dinner: number }[]
  weekOverWeek: {
    thisWeek: { reviews: number; avgRating: number; positiveRate: number }
    lastWeek: { reviews: number; avgRating: number; positiveRate: number }
  }
  userRole: string
  userBlock: string | null
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snacks: 'Snacks',
  dinner: 'Dinner',
}

const SENTIMENT_COLORS = {
  positive: '#22c55e',
  neutral: '#eab308',
  negative: '#ef4444',
}

export default function AdminDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(7)
  const [dateMode, setDateMode] = useState<'preset' | 'custom'>('preset')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [mealFilter, setMealFilter] = useState('all')
  const [blockFilter, setBlockFilter] = useState('all')
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [togglingMaintenance, setTogglingMaintenance] = useState(false)
  const [attendance, setAttendance] = useState<{
    breakfast: number; lunch: number; snacks: number; dinner: number; total: number;
    byBlock: Record<string, Record<string, number>>;
  } | null>(null)
  const [attendanceLoading, setAttendanceLoading] = useState(true)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [studentFileInfo, setStudentFileInfo] = useState<{ exists: boolean; filename?: string; sizeFormatted?: string; lastModified?: string } | null>(null)
  // Announcements state
  const [announcementsList, setAnnouncementsList] = useState<{ id: string; title: string; body: string; priority: string; targetBlock: string | null; expiresAt: string | null; createdAt: string }[]>([])
  const [announcementTitle, setAnnouncementTitle] = useState('')
  const [announcementBody, setAnnouncementBody] = useState('')
  const [announcementPriority, setAnnouncementPriority] = useState('normal')
  const [announcementTarget, setAnnouncementTarget] = useState('all')
  const [announcementSending, setAnnouncementSending] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        mealType: mealFilter,
        hostelBlock: blockFilter,
      })
      if (dateMode === 'custom' && dateFrom && dateTo) {
        params.set('from', dateFrom)
        params.set('to', dateTo)
      } else {
        params.set('days', days.toString())
      }
      const res = await fetch(`/api/analytics?${params}`)
      const json = await res.json()
      setData(json)

      if (json.userRole === 'super_admin') {
        const mRes = await fetch('/api/admin/maintenance')
        const mJson = await mRes.json()
        setMaintenanceMode(mJson.maintenance_mode || false)
      }

      // Fetch meal attendance counts
      try {
        const aParams = new URLSearchParams({ hostelBlock: blockFilter })
        const aRes = await fetch(`/api/admin/checkin?${aParams}`)
        const aJson = await aRes.json()
        setAttendance(aJson.counts || { breakfast: 0, lunch: 0, snacks: 0, dinner: 0, total: 0, byBlock: {} })
      } catch {
        console.error('Failed to load attendance')
        // Fallback to zeros instead of leaving permanent skeletons
        setAttendance({ breakfast: 0, lunch: 0, snacks: 0, dinner: 0, total: 0, byBlock: {} })
      } finally {
        setAttendanceLoading(false)
      }

      // Fetch announcements
      try {
        const annRes = await fetch('/api/admin/announcements')
        const annJson = await annRes.json()
        setAnnouncementsList(annJson.announcements || [])
      } catch {
        console.error('Failed to load announcements')
      }
    } catch (err) {
      console.error('Failed to load analytics:', err)
    } finally {
      setLoading(false)
    }
  }, [days, dateMode, dateFrom, dateTo, mealFilter, blockFilter])

  // Lightweight attendance-only refresh (avoids full analytics reload on every check-in)
  const refreshAttendanceOnly = useCallback(async () => {
    try {
      const aParams = new URLSearchParams({ hostelBlock: blockFilter })
      const aRes = await fetch(`/api/admin/checkin?${aParams}`)
      const aJson = await aRes.json()
      setAttendance(aJson.counts || null)
    } catch {
      /* silent — attendance will sync on next full reload */
    }
  }, [blockFilter])

  useEffect(() => {
    loadData()

    const supabase = createClient()

    // Throttle meal_checkins updates: during peak hours hundreds of check-ins happen per minute.
    // We use a throttle (leading + trailing edge) to ensure the dashboard updates at most once
    // every 30 seconds, even during sustained high-activity periods.
    let checkinThrottleTimer: ReturnType<typeof setTimeout> | null = null
    let checkinPending = false // tracks if a trailing-edge call is needed

    const throttledAttendanceRefresh = () => {
      if (checkinThrottleTimer) {
        // Throttle active — mark pending so trailing edge fires
        checkinPending = true
        return
      }
      // Leading edge: fire immediately
      refreshAttendanceOnly()
      checkinThrottleTimer = setTimeout(() => {
        checkinThrottleTimer = null
        // Trailing edge: if events arrived during cooldown, fire once more
        if (checkinPending) {
          checkinPending = false
          refreshAttendanceOnly()
        }
      }, 30000)
    }

    const reviewChannel = supabase.channel('admin_dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, () => {
        loadData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_checkins' }, () => {
        // Throttled: only refresh attendance counts (not full analytics)
        throttledAttendanceRefresh()
      })
      .subscribe()

    const maintenanceChannel = supabase.channel('site_settings_realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'site_settings', filter: 'id=eq.1' }, (payload) => {
        setMaintenanceMode(payload.new.maintenance_mode === true)
      })
      .subscribe()

    return () => {
      if (checkinThrottleTimer) clearTimeout(checkinThrottleTimer)
      supabase.removeChannel(reviewChannel)
      supabase.removeChannel(maintenanceChannel)
    }
  }, [loadData, refreshAttendanceOnly])

  const handleToggleMaintenance = async () => {
    setTogglingMaintenance(true)
    try {
      const res = await fetch('/api/admin/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maintenance_mode: !maintenanceMode })
      })
      if (res.ok) {
        setMaintenanceMode(!maintenanceMode)
        toast.success(`Maintenance mode ${!maintenanceMode ? 'enabled' : 'disabled'}`)
      } else {
        toast.error('Failed to toggle maintenance mode')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setTogglingMaintenance(false)
    }
  }

  // Fetch student data file info for super admins
  const handleCreateAnnouncement = async () => {
    if (!announcementTitle.trim() || !announcementBody.trim()) {
      toast.error('Title and body are required')
      return
    }
    setAnnouncementSending(true)
    try {
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: announcementTitle.trim(),
          body: announcementBody.trim(),
          priority: announcementPriority,
          targetBlock: announcementTarget === 'all' ? null : announcementTarget,
        }),
      })
      if (res.ok) {
        toast.success('Announcement published')
        setAnnouncementTitle('')
        setAnnouncementBody('')
        setAnnouncementPriority('normal')
        setAnnouncementTarget('all')
        // Refresh list
        const annRes = await fetch('/api/admin/announcements')
        const annJson = await annRes.json()
        setAnnouncementsList(annJson.announcements || [])
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to create announcement')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setAnnouncementSending(false)
    }
  }

  const handleDeleteAnnouncement = async (id: string) => {
    try {
      const res = await fetch('/api/admin/announcements', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        toast.success('Announcement deleted')
        setAnnouncementsList(prev => prev.filter(a => a.id !== id))
      } else {
        toast.error('Failed to delete announcement')
      }
    } catch {
      toast.error('Network error')
    }
  }

  // Fetch student data file info for super admins
  const fetchStudentFileInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/student-data')
      if (res.ok) {
        const info = await res.json()
        setStudentFileInfo(info)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (data?.userRole === 'super_admin') {
      fetchStudentFileInfo()
    }
  }, [data?.userRole, fetchStudentFileInfo])

  const handleUploadStudentData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // Reset input so same file can be re-uploaded

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls'].includes(ext || '')) {
      toast.error('Only .xlsx and .xls files are accepted')
      return
    }

    setUploadingFile(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/admin/student-data', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Upload failed')
        return
      }

      toast.success(data.message || 'Student data uploaded successfully')
      fetchStudentFileInfo()
    } catch {
      toast.error('Network error — please try again')
    } finally {
      setUploadingFile(false)
    }
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    )
  }

  const sentimentData = [
    { name: 'Positive', value: data.sentimentBreakdown.positive, color: SENTIMENT_COLORS.positive },
    { name: 'Neutral', value: data.sentimentBreakdown.neutral, color: SENTIMENT_COLORS.neutral },
    { name: 'Negative', value: data.sentimentBreakdown.negative, color: SENTIMENT_COLORS.negative },
  ].filter((d) => d.value > 0)

  const dailyChartData = data.dailyRatings.map((d) => ({
    ...d,
    date: d.date.slice(5),
  }))

  const mealChartData = data.mealRatings.map((d) => ({
    ...d,
    name: MEAL_LABELS[d.mealType] || d.mealType,
  }))

  return (
    <div>
      {/* Print-only header */}
      <div className="print-header hidden print-only">
        <h1>Analytics Dashboard Report</h1>
        <p>Generated on {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} &bull; Last {days} days{data.userBlock ? ` &bull; ${data.userBlock}` : ''}</p>
      </div>

      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
            Analytics Dashboard
            {maintenanceMode && (
              <Badge variant="destructive" className="ml-2 uppercase tracking-wide text-[10px]">Maintenance On</Badge>
            )}
          </h1>
          <div className="text-sm text-muted-foreground mt-0.5 flex flex-wrap gap-2 items-center">
            Overview of food quality ratings and feedback
            {data.userRole === 'admin' && data.userBlock && (
              <Badge variant="secondary" className="font-mono text-[10px] ml-2">{data.userBlock}</Badge>
            )}
          </div>
        </div>
        {data.userRole === 'super_admin' && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="print-hide"
            >
              <FontAwesomeIcon icon={faPrint} className="w-4 h-4 mr-2" />
              Print
            </Button>
            <Button
              variant={maintenanceMode ? "default" : "outline"}
              onClick={handleToggleMaintenance}
              disabled={togglingMaintenance}
              className={`print-hide ${maintenanceMode ? "bg-red-500 hover:bg-red-600 text-white" : ""}`}
            >
              <FontAwesomeIcon icon={faScrewdriverWrench} className="w-4 h-4 mr-2" />
              {maintenanceMode ? 'Disable Maintenance' : 'Enable Maintenance'}
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6 print-hide">
        <Select
          value={dateMode === 'custom' ? 'custom' : days.toString()}
          onValueChange={(v) => {
            if (v === 'custom') {
              setDateMode('custom')
              // Default to last 30 days for initial range
              if (!dateFrom || !dateTo) {
                const to = new Date()
                const from = new Date()
                from.setDate(from.getDate() - 30)
                setDateFrom(from.toISOString().split('T')[0])
                setDateTo(to.toISOString().split('T')[0])
              }
            } else {
              setDateMode('preset')
              setDays(Number(v))
            }
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="custom">Custom range</SelectItem>
          </SelectContent>
        </Select>
        {dateMode === 'custom' && (
          <>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              max={dateTo || undefined}
            />
            <span className="self-center text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              min={dateFrom || undefined}
            />
          </>
        )}
        <Select value={mealFilter} onValueChange={setMealFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Meals</SelectItem>
            <SelectItem value="breakfast">Breakfast</SelectItem>
            <SelectItem value="lunch">Lunch</SelectItem>
            <SelectItem value="snacks">Snacks</SelectItem>
            <SelectItem value="dinner">Dinner</SelectItem>
          </SelectContent>
        </Select>
        {data.userRole === 'super_admin' && data.hostelBlocks.length > 0 && (
          <Select value={blockFilter} onValueChange={setBlockFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Blocks</SelectItem>
              {data.hostelBlocks.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Alert Banner */}
      {data.overview.alertCount > 0 && (
        <Alert variant="destructive" className="mb-6">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4" />
          <AlertTitle>Low Rating Alert</AlertTitle>
          <AlertDescription>
            Average rating is below 2.5 or more than 30% of reviews are negative ({data.overview.lowRatingPercentage}% low ratings). Immediate attention required.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          {
            label: 'Total Reviews',
            value: data.overview.totalReviews,
            icon: <FontAwesomeIcon icon={faMessage} className="w-5 h-5" />,
            color: 'text-blue-500 dark:text-blue-400',
          },
          {
            label: 'Avg Rating',
            value: data.overview.avgRating.toFixed(1),
            icon: <FontAwesomeIcon icon={faStar} className="w-5 h-5" />,
            color: data.overview.avgRating >= 3 ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400',
          },
          {
            label: 'Students',
            value: data.overview.totalStudents,
            icon: <FontAwesomeIcon icon={faUsers} className="w-5 h-5" />,
            color: 'text-amber-600 dark:text-amber-400',
          },
          {
            label: 'Alerts',
            value: data.overview.alertCount,
            icon: <FontAwesomeIcon icon={faBell} className="w-5 h-5" />,
            color: data.overview.alertCount > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-500 dark:text-green-400',
          },
        ].map((stat) => (
          <Card key={stat.label} className="rounded-xl">
            <CardContent className="p-4 flex flex-col justify-center min-h-[110px]">
              <div className="flex items-center justify-between mb-3">
                <span className={stat.color}>
                  {stat.icon}
                </span>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  {stat.label}
                </p>
              </div>
              <div className="flex items-end gap-3 mt-auto">
                <p className="text-3xl font-bold text-foreground leading-none">{stat.value}</p>
                {stat.label === 'Avg Rating' && (
                  <div className="flex gap-0.5 mb-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <FontAwesomeIcon icon={faStar}
                        key={star}
                        className={`w-3.5 h-3.5 ${star <= data.overview.avgRating
                          ? 'text-primary'
                          : 'text-zinc-200 dark:text-zinc-800'
                          }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Week-over-Week Comparison */}
      {data.weekOverWeek && (
        <Card className="rounded-xl mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Week-over-Week Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <WeekOverWeekCards
              thisWeek={data.weekOverWeek.thisWeek}
              lastWeek={data.weekOverWeek.lastWeek}
            />
          </CardContent>
        </Card>
      )}

      {/* Meal Attendance Card */}
      <Card className="rounded-xl mb-6">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FontAwesomeIcon icon={faQrcode} className="w-4 h-4 text-primary" />
              Today&apos;s Meal Attendance
            </CardTitle>
            <Badge variant="secondary" className="text-[10px] font-mono">
              QR Check-in
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {attendanceLoading || !attendance ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                {[
                  { meal: 'Breakfast', key: 'breakfast' },
                  { meal: 'Lunch', key: 'lunch' },
                  { meal: 'Snacks', key: 'snacks' },
                  { meal: 'Dinner', key: 'dinner' },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="flex flex-col items-center justify-center p-4 rounded-xl bg-muted/50 border"
                  >
                    <p className="text-2xl font-bold text-foreground">
                      {attendance[item.key as keyof typeof attendance] as number}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">
                      {item.meal}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/10">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faUtensils} className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Total Today</span>
                </div>
                <span className="text-xl font-bold text-primary">{attendance.total}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Charts Row — lazy-loaded */}
      <ChartsRow
        dailyChartData={dailyChartData}
        mealChartData={mealChartData}
      />

      {/* Rating Heatmap (Day-of-Week × Meal) */}
      {data.dayOfWeekHeatmap && data.dayOfWeekHeatmap.length > 0 && (
        <Card className="rounded-xl mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Rating Heatmap (Day of Week)</CardTitle>
          </CardHeader>
          <CardContent>
            <RatingHeatmap data={data.dayOfWeekHeatmap} />
          </CardContent>
        </Card>
      )}

      {/* Per-Block Breakdown — Super Admin only */}
      {data.userRole === 'super_admin' && data.blockStats && data.blockStats.length > 0 && (
        <Card className="rounded-xl mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Hostel Block Comparison</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Block</th>
                    <th className="text-right px-4 py-2.5 text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Reviews</th>
                    <th className="text-right px-4 py-2.5 text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Avg Rating</th>
                    <th className="text-right px-4 py-2.5 text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Positive</th>
                    <th className="text-right px-4 py-2.5 text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Negative</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.blockStats.map((bs) => (
                    <tr key={bs.block} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{bs.block}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{bs.totalReviews}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold ${bs.avgRating >= 4 ? 'text-green-500' : bs.avgRating >= 3 ? 'text-primary' : 'text-red-500'}`}>
                          {bs.avgRating.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-green-500 font-medium">
                        {bs.totalReviews > 0 ? Math.round((bs.positive / bs.totalReviews) * 100) : 0}%
                      </td>
                      <td className="px-4 py-3 text-right text-red-500 font-medium">
                        {bs.totalReviews > 0 ? Math.round((bs.negative / bs.totalReviews) * 100) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Student Data Upload — Super Admin only */}
      {data.userRole === 'super_admin' && (
        <Card className="rounded-xl mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FontAwesomeIcon icon={faFileUpload} className="w-3.5 h-3.5 text-primary" />
              Student Lookup Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex-1">
                {studentFileInfo?.exists ? (
                  <p className="text-xs text-muted-foreground">
                    Current file: <span className="font-medium text-foreground">{studentFileInfo.filename}</span>
                    {' '}({studentFileInfo.sizeFormatted})
                    {studentFileInfo.lastModified && (
                      <> &mdash; updated {new Date(studentFileInfo.lastModified).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</>
                    )}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">No student data file found. Upload an XLSX to enable auto-fill during registration.</p>
                )}
              </div>
              <label className="shrink-0">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleUploadStudentData}
                  disabled={uploadingFile}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploadingFile}
                  className="cursor-pointer"
                  asChild
                >
                  <span>
                    <FontAwesomeIcon icon={faFileUpload} className="w-3 h-3 mr-1.5" />
                    {uploadingFile ? 'Uploading...' : 'Upload New XLSX'}
                  </span>
                </Button>
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Broadcast Announcements */}
      <Card className="rounded-xl mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FontAwesomeIcon icon={faBullhorn} className="w-3.5 h-3.5 text-primary" />
            Broadcast Announcements
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              placeholder="Announcement title..."
              value={announcementTitle}
              onChange={(e) => setAnnouncementTitle(e.target.value)}
              className="h-10 text-sm"
            />
            <div className="flex gap-2">
              <Select value={announcementPriority} onValueChange={setAnnouncementPriority}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
              {data.userRole === 'super_admin' && data.hostelBlocks.length > 0 && (
                <Select value={announcementTarget} onValueChange={setAnnouncementTarget}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Blocks</SelectItem>
                    {data.hostelBlocks.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <textarea
            value={announcementBody}
            onChange={(e) => setAnnouncementBody(e.target.value)}
            placeholder="Announcement message..."
            className="w-full min-h-[80px] p-3 rounded-xl border bg-background text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            maxLength={1000}
          />
          <Button
            onClick={handleCreateAnnouncement}
            disabled={announcementSending || !announcementTitle.trim() || !announcementBody.trim()}
            className="w-full sm:w-auto"
          >
            <FontAwesomeIcon icon={faBullhorn} className="w-3.5 h-3.5 mr-2" />
            {announcementSending ? 'Publishing...' : 'Publish Announcement'}
          </Button>

          {/* Existing announcements */}
          {announcementsList.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                Active Announcements ({announcementsList.length})
              </p>
              {announcementsList.map((a) => (
                <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-foreground truncate">{a.title}</p>
                      {a.priority === 'urgent' && (
                        <Badge variant="destructive" className="text-[9px]">Urgent</Badge>
                      )}
                      {a.targetBlock && (
                        <Badge variant="secondary" className="text-[9px]">{a.targetBlock}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{a.body}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteAnnouncement(a.id)}
                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-100 dark:hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                    title="Delete announcement"
                  >
                    <FontAwesomeIcon icon={faTrash} className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sentiment Analysis */}
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Sentiment Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <SentimentChart sentimentData={sentimentData} />
        </CardContent>
      </Card>
    </div>
  )
}
