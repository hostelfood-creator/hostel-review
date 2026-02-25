'use client'

import { useEffect, useState, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMessage, faStar, faUsers, faBell, faTriangleExclamation, faScrewdriverWrench, faUtensils, faQrcode } from '@fortawesome/free-solid-svg-icons'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

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
  const [mealFilter, setMealFilter] = useState('all')
  const [blockFilter, setBlockFilter] = useState('all')
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [togglingMaintenance, setTogglingMaintenance] = useState(false)
  const [attendance, setAttendance] = useState<{
    breakfast: number; lunch: number; snacks: number; dinner: number; total: number;
    byBlock: Record<string, Record<string, number>>;
  } | null>(null)
  const [attendanceLoading, setAttendanceLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        days: days.toString(),
        mealType: mealFilter,
        hostelBlock: blockFilter,
      })
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
        setAttendance(aJson.counts || null)
      } catch {
        console.error('Failed to load attendance')
      } finally {
        setAttendanceLoading(false)
      }
    } catch (err) {
      console.error('Failed to load analytics:', err)
    } finally {
      setLoading(false)
    }
  }, [days, mealFilter, blockFilter])

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
          <Button
            variant={maintenanceMode ? "default" : "outline"}
            onClick={handleToggleMaintenance}
            disabled={togglingMaintenance}
            className={maintenanceMode ? "bg-red-500 hover:bg-red-600 text-white" : ""}
          >
            <FontAwesomeIcon icon={faScrewdriverWrench} className="w-4 h-4 mr-2" />
            {maintenanceMode ? 'Disable Maintenance' : 'Enable Maintenance'}
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Select value={days.toString()} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
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
                  { meal: 'Breakfast', key: 'breakfast', emoji: '🌅' },
                  { meal: 'Lunch', key: 'lunch', emoji: '☀️' },
                  { meal: 'Snacks', key: 'snacks', emoji: '🍪' },
                  { meal: 'Dinner', key: 'dinner', emoji: '🌙' },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="flex flex-col items-center justify-center p-4 rounded-xl bg-muted/50 border"
                  >
                    <span className="text-2xl mb-1">{item.emoji}</span>
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

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Rating Trend */}
        <Card className="rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Rating Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={dailyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(161,161,170,0.15)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#A1A1AA', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(161,161,170,0.15)' }}
                  />
                  <YAxis
                    domain={[0, 5]}
                    tick={{ fill: '#A1A1AA', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(161,161,170,0.15)' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--tooltip-bg, #fff)',
                      border: '1px solid var(--tooltip-border, #e4e4e7)',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: 'var(--tooltip-color, #18181b)',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgRating"
                    stroke="#D4920B"
                    strokeWidth={2}
                    dot={{ fill: '#D4920B', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Meal Comparison */}
        <Card className="rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Meal Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            {mealChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={mealChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(161,161,170,0.15)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#A1A1AA', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(161,161,170,0.15)' }}
                  />
                  <YAxis
                    domain={[0, 5]}
                    tick={{ fill: '#A1A1AA', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(161,161,170,0.15)' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--tooltip-bg, #fff)',
                      border: '1px solid var(--tooltip-border, #e4e4e7)',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: 'var(--tooltip-color, #18181b)',
                    }}
                  />
                  <Bar dataKey="avgRating" fill="#D4920B" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
                No data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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

      {/* Sentiment + Recent Reviews */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sentiment Pie Chart */}
        <Card className="rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Sentiment Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            {sentimentData.length > 0 ? (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={sentimentData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {sentimentData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--tooltip-bg, #fff)',
                        border: '1px solid var(--tooltip-border, #e4e4e7)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: 'var(--tooltip-color, #18181b)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-2">
                  {sentimentData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="text-xs text-muted-foreground">{d.name} ({d.value})</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                No sentiment data
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Reviews */}
        <Card className="lg:col-span-2 rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Recent Reviews</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentReviews.length > 0 ? (
              <div className="space-y-3 max-h-[340px] overflow-y-auto no-scrollbar">
                {data.recentReviews.map((review) => (
                  <div
                    key={review.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">{review.userName}</span>
                          {review.hostelBlock && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {review.hostelBlock}
                            </Badge>
                          )}
                        </div>
                        <Badge
                          variant={review.rating >= 4 ? 'success' : review.rating >= 3 ? 'secondary' : 'destructive'}
                          className="text-[10px]"
                        >
                          {review.rating}.0
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                          {MEAL_LABELS[review.mealType] || review.mealType}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60">{review.date}</span>
                      </div>
                      {review.reviewText && (
                        <p className="text-xs text-muted-foreground leading-relaxed">{review.reviewText}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                No reviews yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
