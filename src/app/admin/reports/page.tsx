'use client'

import { useEffect, useState, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChartLine, faArrowTrendUp, faArrowTrendDown, faDownload, faCircleExclamation, faPrint } from '@fortawesome/free-solid-svg-icons'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

interface WeekData {
    weekLabel: string
    totalReviews: number
    avgRating: number
    positive: number
    neutral: number
    negative: number
    mealBreakdown: Record<string, { count: number; avgRating: number }>
}

interface ComplaintStats {
    total: number
    pending: number
    inProgress: number
    resolved: number
    byCategory: Record<string, number>
}

interface ReportData {
    weeklyData: WeekData[]
    complaintStats: ComplaintStats
    hostelBlock: string
    generatedAt: string
}

const CATEGORY_LABELS: Record<string, string> = {
    hygiene: '🧹 Hygiene',
    taste: '😋 Taste',
    quantity: '📏 Quantity',
    timing: '⏰ Timing',
    other: '📝 Other',
}

const MEAL_LABELS: Record<string, string> = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    snacks: 'Snacks',
    dinner: 'Dinner',
}

export default function AdminReportsPage() {
    const [report, setReport] = useState<ReportData | null>(null)
    const [loading, setLoading] = useState(true)
    const [weeks, setWeeks] = useState('4')
    const [blockFilter, setBlockFilter] = useState('all')
    const [hostelBlocks, setHostelBlocks] = useState<string[]>([])
    const [userRole, setUserRole] = useState('')

    const loadReport = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({ weeks })
            if (blockFilter !== 'all') params.set('hostelBlock', blockFilter)
            const res = await fetch(`/api/reports/weekly?${params}`)
            const data = await res.json()
            setReport(data)
        } catch (err) {
            console.error('Failed to load report:', err)
        } finally {
            setLoading(false)
        }
    }, [weeks, blockFilter])

    useEffect(() => {
        loadReport()
        // Load hostel blocks for super admin
        fetch('/api/auth/me')
            .then(r => r.json())
            .then(d => {
                setUserRole(d.user?.role || '')
                if (d.user?.role === 'super_admin') {
                    fetch('/api/blocks').then(r => r.json()).then(b => setHostelBlocks((b.blocks || []).map((bl: { name: string }) => bl.name)))
                }
            })
            .catch(() => { })
    }, [loadReport])

    const handleExportCSV = () => {
        if (!report || report.weeklyData.length === 0) return
        const headers = ['Week', 'Total Reviews', 'Avg Rating', 'Positive', 'Neutral', 'Negative']
        const rows = report.weeklyData.map((w) => [
            w.weekLabel, w.totalReviews.toString(), w.avgRating.toString(),
            w.positive.toString(), w.neutral.toString(), w.negative.toString(),
        ])
        const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `weekly_report_${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    const overallAvg = report?.weeklyData.length
        ? Math.round((report.weeklyData.reduce((s, w) => s + w.avgRating, 0) / report.weeklyData.length) * 100) / 100
        : 0

    const totalReviews = report?.weeklyData.reduce((s, w) => s + w.totalReviews, 0) || 0

    const trend = report && report.weeklyData.length >= 2
        ? report.weeklyData[report.weeklyData.length - 1].avgRating - report.weeklyData[report.weeklyData.length - 2].avgRating
        : 0

    return (
        <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
                        <FontAwesomeIcon icon={faChartLine} className="w-5 h-5 text-primary" />
                        Weekly Reports
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Food quality trends and complaint analytics</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Select value={weeks} onValueChange={setWeeks}>
                        <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="2">2 Weeks</SelectItem>
                            <SelectItem value="4">4 Weeks</SelectItem>
                            <SelectItem value="8">8 Weeks</SelectItem>
                            <SelectItem value="12">12 Weeks</SelectItem>
                        </SelectContent>
                    </Select>
                    {userRole === 'super_admin' && hostelBlocks.length > 0 && (
                        <Select value={blockFilter} onValueChange={setBlockFilter}>
                            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Blocks</SelectItem>
                                {hostelBlocks.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    )}
                    <Button variant="outline" size="sm" onClick={handleExportCSV} className="rounded-full print-hide">
                        <FontAwesomeIcon icon={faDownload} className="w-3.5 h-3.5 mr-1.5" />
                        Export
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => window.print()} className="rounded-full print-hide">
                        <FontAwesomeIcon icon={faPrint} className="w-3.5 h-3.5 mr-1.5" />
                        Print
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
                </div>
            ) : report ? (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                        <Card className="rounded-xl">
                            <CardContent className="p-5 text-center">
                                <p className="text-3xl font-bold text-foreground">{totalReviews}</p>
                                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-1">Total Reviews</p>
                            </CardContent>
                        </Card>
                        <Card className="rounded-xl">
                            <CardContent className="p-5 text-center">
                                <div className="flex items-center justify-center gap-2">
                                    <p className="text-3xl font-bold text-foreground">{overallAvg}</p>
                                    {trend !== 0 && (
                                        <Badge
                                            variant={trend > 0 ? 'success' : 'destructive'}
                                            className="text-[10px]"
                                        >
                                            <FontAwesomeIcon icon={trend > 0 ? faArrowTrendUp : faArrowTrendDown} className="w-3 h-3 mr-1" />
                                            {trend > 0 ? '+' : ''}{trend.toFixed(2)}
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-1">Avg Rating</p>
                            </CardContent>
                        </Card>
                        <Card className="rounded-xl">
                            <CardContent className="p-5 text-center">
                                <p className="text-3xl font-bold text-foreground">{report.complaintStats.total}</p>
                                <div className="flex items-center justify-center gap-2 mt-1">
                                    <Badge variant="secondary" className="text-[10px]">{report.complaintStats.pending} pending</Badge>
                                    <Badge variant="success" className="text-[10px]">{report.complaintStats.resolved} resolved</Badge>
                                </div>
                                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-1">Complaints</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Weekly Breakdown */}
                    <Card className="rounded-xl mb-6">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold">Weekly Trend</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {report.weeklyData.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-8">No data for selected period</p>
                            ) : (
                                <div className="space-y-3">
                                    {report.weeklyData.map((week, idx) => (
                                        <div key={idx} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 border">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium text-foreground">{week.weekLabel}</p>
                                                <p className="text-[10px] text-muted-foreground">{week.totalReviews} reviews</p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="text-right">
                                                    <p className={`text-lg font-bold ${week.avgRating >= 4 ? 'text-green-500' :
                                                            week.avgRating >= 3 ? 'text-yellow-500' : 'text-red-500'
                                                        }`}>{week.avgRating || '-'}</p>
                                                </div>
                                                <div className="flex gap-1">
                                                    <Badge variant="success" className="text-[9px] px-1.5">{week.positive}</Badge>
                                                    <Badge variant="secondary" className="text-[9px] px-1.5">{week.neutral}</Badge>
                                                    <Badge variant="destructive" className="text-[9px] px-1.5">{week.negative}</Badge>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Complaint Categories */}
                    {Object.keys(report.complaintStats.byCategory).length > 0 && (
                        <Card className="rounded-xl">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                    <FontAwesomeIcon icon={faCircleExclamation} className="w-4 h-4 text-amber-500" />
                                    Complaint Categories
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {Object.entries(report.complaintStats.byCategory).map(([cat, count]) => (
                                        <div key={cat} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
                                            <span className="text-sm">{CATEGORY_LABELS[cat] || cat}</span>
                                            <Badge variant="secondary" className="text-xs font-bold">{count}</Badge>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </>
            ) : (
                <Card className="rounded-xl">
                    <CardContent className="py-12 text-center">
                        <p className="text-muted-foreground">Failed to load report</p>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
