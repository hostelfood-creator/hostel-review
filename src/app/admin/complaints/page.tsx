'use client'

import { useEffect, useState, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
    faCommentDots, faClock, faIdCard, faUser, faBuilding,
    faHourglassHalf, faSpinner, faCheckCircle, faReply, faPaperPlane, faDownload,
    faBroom, faUtensils, faScaleBalanced, faStopwatch, faPenToSquare
} from '@fortawesome/free-solid-svg-icons'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

interface Complaint {
    id: string
    userId: string
    hostelBlock: string
    complaintText: string
    category: string
    status: string
    adminReply: string | null
    repliedAt: string | null
    repliedByName: string | null
    studentName: string
    registerNumber: string
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

export default function AdminComplaintsPage() {
    const [complaints, setComplaints] = useState<Complaint[]>([])
    const [loading, setLoading] = useState(true)
    const [blockFilter, setBlockFilter] = useState('all')
    const [statusFilter, setStatusFilter] = useState('all')
    const [categoryFilter, setCategoryFilter] = useState('all')
    const [hostelBlocks, setHostelBlocks] = useState<string[]>([])
    const [userRole, setUserRole] = useState('')

    // Reply state
    const [replyingTo, setReplyingTo] = useState<string | null>(null)
    const [replyText, setReplyText] = useState('')
    const [replyStatus, setReplyStatus] = useState('')
    const [replying, setReplying] = useState(false)

    const loadComplaints = useCallback(async () => {
        try {
            const params = new URLSearchParams()
            if (blockFilter !== 'all') params.set('hostelBlock', blockFilter)
            if (statusFilter !== 'all') params.set('status', statusFilter)
            if (categoryFilter !== 'all') params.set('category', categoryFilter)
            const res = await fetch(`/api/complaints?${params}`)
            const data = await res.json()
            if (data.complaints) setComplaints(data.complaints)
            if (data.hostelBlocks) setHostelBlocks(data.hostelBlocks)
            if (data.userRole) setUserRole(data.userRole)
        } catch (err) {
            console.error('Failed to load complaints:', err)
        } finally {
            setLoading(false)
        }
    }, [blockFilter, statusFilter, categoryFilter])

    useEffect(() => {
        loadComplaints()
        const supabase = createClient()
        const channel = supabase.channel('admin_complaints_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'complaints' }, () => loadComplaints())
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [loadComplaints])

    const handleReply = async (complaintId: string) => {
        setReplying(true)
        try {
            const body: Record<string, string> = { complaintId }
            if (replyText.trim()) body.reply = replyText.trim()
            if (replyStatus) body.status = replyStatus
            const res = await fetch('/api/complaints', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            if (!res.ok) {
                const data = await res.json()
                toast.error(data.error || 'Failed to reply')
                return
            }
            toast.success('Reply sent successfully')
            setReplyingTo(null)
            setReplyText('')
            setReplyStatus('')
            loadComplaints()
        } catch {
            toast.error('Network error')
        } finally {
            setReplying(false)
        }
    }

    const handleExportCSV = () => {
        if (complaints.length === 0) { toast.error('No data to export'); return }
        const headers = ['Student Name', 'Register Number', 'Hostel Block', 'Category', 'Complaint', 'Status', 'Admin Reply', 'Date']
        const rows = complaints.map((c) => [
            c.studentName,
            c.registerNumber,
            c.hostelBlock,
            c.category,
            `"${c.complaintText.replace(/"/g, '""')}"`,
            c.status,
            c.adminReply ? `"${c.adminReply.replace(/"/g, '""')}"` : '',
            new Date(c.createdAt).toLocaleDateString('en-IN'),
        ])
        const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `complaints_${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
        toast.success('CSV exported')
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
        const diffDays = Math.floor(diffHours / 24)
        if (diffDays < 7) return `${diffDays}d ago`
        return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    }

    const pendingCount = complaints.filter((c) => c.status === 'pending').length
    const resolvedCount = complaints.filter((c) => c.status === 'resolved').length

    return (
        <div>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
                        <FontAwesomeIcon icon={faCommentDots} className="w-5 h-5 text-primary" />
                        Food Complaints
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Manage student complaints regarding food quality</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]">{pendingCount} pending</Badge>
                    <Badge variant="success" className="text-[10px]">{resolvedCount} resolved</Badge>
                    <Button variant="outline" size="sm" onClick={handleExportCSV} className="rounded-full">
                        <FontAwesomeIcon icon={faDownload} className="w-3.5 h-3.5 mr-1.5" />
                        Export CSV
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-6">
                {userRole === 'super_admin' && hostelBlocks.length > 0 && (
                    <Select value={blockFilter} onValueChange={setBlockFilter}>
                        <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Blocks</SelectItem>
                            {hostelBlocks.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                        </SelectContent>
                    </Select>
                )}
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}><FontAwesomeIcon icon={c.icon} className="w-3 h-3 mr-1.5 inline" />{c.label}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>

            {/* Complaints List */}
            {loading ? (
                <div className="space-y-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>
            ) : complaints.length === 0 ? (
                <Card className="rounded-xl">
                    <CardContent className="py-16 text-center">
                        <FontAwesomeIcon icon={faCommentDots} className="w-10 h-10 text-muted-foreground/20 mb-4" />
                        <p className="text-base font-medium text-muted-foreground">No complaints found</p>
                        <p className="text-sm text-muted-foreground/60 mt-1">Adjust filters or wait for student submissions</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {complaints.map((complaint) => {
                        const statusCfg = STATUS_CONFIG[complaint.status] || STATUS_CONFIG.pending
                        const catInfo = CATEGORIES.find((cat) => cat.value === complaint.category)
                        const isReplying = replyingTo === complaint.id

                        return (
                            <Card key={complaint.id} className={`rounded-xl hover:shadow-md transition-shadow ${complaint.status === 'pending' ? 'border-amber-200 dark:border-amber-500/15' :
                                    complaint.status === 'resolved' ? 'border-green-200 dark:border-green-500/15' : ''
                                }`}>
                                <CardContent className="p-5">
                                    {/* Student Info Row */}
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                                                <FontAwesomeIcon icon={faUser} className="w-4 h-4 text-primary" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-foreground">{complaint.studentName}</p>
                                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                                        <FontAwesomeIcon icon={faIdCard} className="w-3 h-3" />
                                                        {complaint.registerNumber}
                                                    </span>
                                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                                        <FontAwesomeIcon icon={faBuilding} className="w-2.5 h-2.5 mr-1" />
                                                        {complaint.hostelBlock}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                <FontAwesomeIcon icon={faClock} className="w-3 h-3" />
                                                {formatDate(complaint.createdAt)}
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Badge variant="secondary" className="text-[10px] flex items-center gap-1">{catInfo && <FontAwesomeIcon icon={catInfo.icon} className="w-2.5 h-2.5" />} {catInfo?.label}</Badge>
                                                <Badge variant={statusCfg.variant} className="text-[10px]">
                                                    <FontAwesomeIcon icon={statusCfg.icon} className="w-2.5 h-2.5 mr-1" />{statusCfg.label}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Complaint Text */}
                                    <div className="bg-muted/50 rounded-lg p-3 border mb-3">
                                        <p className="text-sm text-foreground leading-relaxed">{complaint.complaintText}</p>
                                    </div>

                                    {/* Existing Reply */}
                                    {complaint.adminReply && !isReplying && (
                                        <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 mb-3">
                                            <div className="flex items-center gap-1.5 mb-1.5">
                                                <FontAwesomeIcon icon={faReply} className="w-3 h-3 text-primary" />
                                                <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Admin Reply</span>
                                                {complaint.repliedByName && <span className="text-[10px] text-muted-foreground">by {complaint.repliedByName}</span>}
                                            </div>
                                            <p className="text-sm text-foreground leading-relaxed">{complaint.adminReply}</p>
                                        </div>
                                    )}

                                    {/* Reply Form */}
                                    {isReplying ? (
                                        <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                                            <textarea
                                                value={replyText}
                                                onChange={(e) => setReplyText(e.target.value)}
                                                placeholder="Type your reply..."
                                                className="w-full min-h-[80px] p-3 rounded-lg border bg-background text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                                                maxLength={1000}
                                                disabled={replying}
                                            />
                                            <div className="flex items-center gap-2">
                                                <Select value={replyStatus || complaint.status} onValueChange={setReplyStatus}>
                                                    <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="pending">Pending</SelectItem>
                                                        <SelectItem value="in_progress">In Progress</SelectItem>
                                                        <SelectItem value="resolved">Resolved</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <div className="flex-1" />
                                                <Button variant="ghost" size="sm" onClick={() => { setReplyingTo(null); setReplyText(''); setReplyStatus('') }} disabled={replying}>Cancel</Button>
                                                <Button size="sm" onClick={() => handleReply(complaint.id)} disabled={replying || (!replyText.trim() && !replyStatus)}>
                                                    <FontAwesomeIcon icon={faPaperPlane} className="w-3 h-3 mr-1.5" />
                                                    {replying ? 'Sending...' : 'Send'}
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setReplyingTo(complaint.id)
                                                setReplyText(complaint.adminReply || '')
                                                setReplyStatus(complaint.status)
                                            }}
                                            className="rounded-full"
                                        >
                                            <FontAwesomeIcon icon={faReply} className="w-3.5 h-3.5 mr-1.5" />
                                            {complaint.adminReply ? 'Edit Reply' : 'Reply'}
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
