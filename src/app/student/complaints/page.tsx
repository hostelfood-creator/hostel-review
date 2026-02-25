'use client'

import { useEffect, useState, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPaperPlane, faCommentDots, faClock, faCheckCircle, faSpinner, faHourglassHalf, faReply, faBroom, faUtensils, faScaleBalanced, faStopwatch, faPenToSquare } from '@fortawesome/free-solid-svg-icons'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

interface Complaint {
    id: string
    complaintText: string
    category: string
    status: string
    hostelBlock: string
    adminReply: string | null
    repliedAt: string | null
    repliedByName: string | null
    createdAt: string
}

const CATEGORIES = [
    { value: 'hygiene', label: 'Hygiene', icon: faBroom },
    { value: 'taste', label: 'Taste', icon: faUtensils },
    { value: 'quantity', label: 'Quantity', icon: faScaleBalanced },
    { value: 'timing', label: 'Timing', icon: faStopwatch },
    { value: 'other', label: 'Other', icon: faPenToSquare },
]

const STATUS_CONFIG: Record<string, { label: string; variant: 'secondary' | 'warning' | 'success'; icon: typeof faHourglassHalf }> = {
    pending: { label: 'Pending', variant: 'secondary', icon: faHourglassHalf },
    in_progress: { label: 'In Progress', variant: 'warning', icon: faSpinner },
    resolved: { label: 'Resolved', variant: 'success', icon: faCheckCircle },
}

export default function StudentComplaintsPage() {
    const [complaints, setComplaints] = useState<Complaint[]>([])
    const [complaintText, setComplaintText] = useState('')
    const [category, setCategory] = useState('other')
    const [submitting, setSubmitting] = useState(false)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(true)
    const PAGE_SIZE = 15

    const loadComplaints = useCallback(async (pageNum = 1, append = false) => {
        try {
            if (append) setLoadingMore(true)
            const res = await fetch(`/api/complaints?page=${pageNum}&pageSize=${PAGE_SIZE}`)
            const data = await res.json()
            const newComplaints = data.complaints || []
            if (append) {
                setComplaints(prev => [...prev, ...newComplaints])
            } else {
                setComplaints(newComplaints)
            }
            if (data.pagination) {
                setHasMore(pageNum < data.pagination.totalPages)
            } else {
                setHasMore(newComplaints.length === PAGE_SIZE)
            }
        } catch (err) {
            console.error('Failed to load complaints:', err)
        } finally {
            setLoading(false)
            setLoadingMore(false)
        }
    }, [])

    useEffect(() => {
        loadComplaints(1)
        const supabase = createClient()
        const channel = supabase.channel('student_complaints_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'complaints' }, () => {
                setPage(1)
                loadComplaints(1)
            })
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [loadComplaints])

    const handleSubmit = async () => {
        const text = complaintText.trim()
        if (!text) { toast.error('Please enter your complaint'); return }
        if (text.length > 2000) { toast.error('Complaint must be under 2000 characters'); return }

        setSubmitting(true)
        try {
            const res = await fetch('/api/complaints', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ complaintText: text, category }),
            })
            const data = await res.json()
            if (!res.ok) { toast.error(data.error || 'Failed to submit'); return }
            toast.success('Complaint submitted successfully')
            setComplaintText('')
            setCategory('other')
            setPage(1)
            loadComplaints(1)
        } catch { toast.error('Network error') } finally { setSubmitting(false) }
    }

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffMins = Math.floor(diffMs / 60000)
        if (diffMins < 1) return 'Just now'
        if (diffMins < 60) return `${diffMins}m ago`
        const diffHours = Math.floor(diffMins / 60)
        if (diffHours < 24) return `${diffHours}h ago`
        return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    }

    return (
        <div className="px-5 py-6">
            <h1 className="text-2xl font-black text-foreground tracking-tight leading-none mb-6">COMPLAINT BOX</h1>

            {/* Submission Card */}
            <Card className="rounded-xl mb-6">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <FontAwesomeIcon icon={faCommentDots} className="w-4 h-4 text-primary" />
                        Submit a Food Complaint
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Category Selector */}
                    <div>
                        <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-2 block">Category</label>
                        <div className="flex flex-wrap gap-2">
                            {CATEGORIES.map((cat) => (
                                <button
                                    key={cat.value}
                                    onClick={() => setCategory(cat.value)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${category === cat.value
                                            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                            : 'bg-muted/50 text-muted-foreground border-transparent hover:border-border hover:bg-muted'
                                        }`}
                                    disabled={submitting}
                                >
                                    <FontAwesomeIcon icon={cat.icon} className="w-3 h-3" /> {cat.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Textarea */}
                    <div className="relative">
                        <textarea
                            value={complaintText}
                            onChange={(e) => setComplaintText(e.target.value)}
                            placeholder="Describe your food complaint here... (e.g., quality issues, hygiene concerns, taste problems, etc.)"
                            className="w-full min-h-[140px] p-4 rounded-xl border bg-background text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                            maxLength={2000}
                            disabled={submitting}
                        />
                        <span className="absolute bottom-3 right-3 text-[10px] text-muted-foreground font-medium">{complaintText.length}/2000</span>
                    </div>

                    <Button onClick={handleSubmit} disabled={submitting || !complaintText.trim()} className="w-full rounded-xl">
                        <FontAwesomeIcon icon={faPaperPlane} className="w-4 h-4 mr-2" />
                        {submitting ? 'Submitting...' : 'Submit Complaint'}
                    </Button>
                </CardContent>
            </Card>

            {/* Past Complaints */}
            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Your Complaints</h2>
                <Badge variant="secondary" className="text-[10px]">{complaints.length} total</Badge>
            </div>

            {loading ? (
                <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
            ) : complaints.length === 0 ? (
                <Card className="rounded-xl">
                    <CardContent className="py-12 text-center">
                        <FontAwesomeIcon icon={faCommentDots} className="w-8 h-8 text-muted-foreground/30 mb-3" />
                        <p className="text-sm text-muted-foreground">No complaints submitted yet</p>
                        <p className="text-[11px] text-muted-foreground/60 mt-1">Use the form above to report food-related issues</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {complaints.map((c) => {
                        const statusCfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.pending
                        const catInfo = CATEGORIES.find((cat) => cat.value === c.category)
                        return (
                            <Card key={c.id} className="rounded-xl">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="secondary" className="text-[10px] flex items-center gap-1">{catInfo && <FontAwesomeIcon icon={catInfo.icon} className="w-2.5 h-2.5" />} {catInfo?.label || c.category}</Badge>
                                            <Badge variant={statusCfg.variant} className="text-[10px]">
                                                <FontAwesomeIcon icon={statusCfg.icon} className="w-2.5 h-2.5 mr-1" />
                                                {statusCfg.label}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                            <FontAwesomeIcon icon={faClock} className="w-3 h-3" />
                                            {formatDate(c.createdAt)}
                                        </div>
                                    </div>
                                    <p className="text-sm text-foreground leading-relaxed mb-2">{c.complaintText}</p>

                                    {/* Admin Reply */}
                                    {c.adminReply && (
                                        <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                                            <div className="flex items-center gap-1.5 mb-1.5">
                                                <FontAwesomeIcon icon={faReply} className="w-3 h-3 text-primary" />
                                                <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Admin Reply</span>
                                                {c.repliedByName && <span className="text-[10px] text-muted-foreground">by {c.repliedByName}</span>}
                                            </div>
                                            <p className="text-sm text-foreground leading-relaxed">{c.adminReply}</p>
                                            {c.repliedAt && (
                                                <p className="text-[10px] text-muted-foreground mt-1">{formatDate(c.repliedAt)}</p>
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )
                    })}

                    {/* Load More */}
                    {hasMore && (
                        <div className="text-center pt-2 pb-4">
                            <Button variant="outline" size="sm" onClick={() => {
                                const nextPage = page + 1
                                setPage(nextPage)
                                loadComplaints(nextPage, true)
                            }} disabled={loadingMore} className="rounded-full">
                                {loadingMore ? 'Loading...' : 'Load More Complaints'}
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
