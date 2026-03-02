'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPaperPlane, faCommentDots, faClock, faCheckCircle, faSpinner, faHourglassHalf, faReply, faBroom, faUtensils, faScaleBalanced, faStopwatch, faPenToSquare, faArrowLeft, faComments } from '@fortawesome/free-solid-svg-icons'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { queueComplaint, getPendingCount, flushPendingComplaints } from '@/lib/offline-queue'

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

interface ChatMessage {
    id: string
    message: string
    senderName: string
    senderRole: string
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
    const [pendingCount, setPendingCount] = useState(0)
    const PAGE_SIZE = 15

    // Threaded chat state
    const [openChat, setOpenChat] = useState<string | null>(null) // complaint ID
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
    const [chatLoading, setChatLoading] = useState(false)
    const [chatText, setChatText] = useState('')
    const [chatSending, setChatSending] = useState(false)
    const chatEndRef = useRef<HTMLDivElement>(null)

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
        // Load pending offline count
        getPendingCount().then(setPendingCount).catch(() => {})
        // Auto-flush offline queue when back online
        const handleOnline = async () => {
            const flushed = await flushPendingComplaints()
            if (flushed > 0) {
                toast.success(`${flushed} pending complaint${flushed > 1 ? 's' : ''} submitted`)
                setPendingCount((c) => Math.max(0, c - flushed))
                loadComplaints(1)
            }
        }
        window.addEventListener('online', handleOnline)
        // If already online, try flushing on mount
        if (navigator.onLine) handleOnline()

        const supabase = createClient()
        // Scope realtime to this user's complaints to avoid O(U) reloads on every complaint change
        let channelRef: ReturnType<typeof supabase.channel> | null = null
        supabase.auth.getUser().then(({ data: { user: authUser } }) => {
            if (!authUser) return
            channelRef = supabase.channel('student_complaints_realtime')
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'complaints',
                    filter: `user_id=eq.${authUser.id}`,
                }, () => {
                    setPage(1)
                    loadComplaints(1)
                })
                .subscribe()
        })
        return () => { if (channelRef) supabase.removeChannel(channelRef); window.removeEventListener('online', handleOnline) }
    }, [loadComplaints])

    const handleSubmit = async () => {
        const text = complaintText.trim()
        if (!text) { toast.error('Please enter your complaint'); return }
        if (text.length > 2000) { toast.error('Complaint must be under 2000 characters'); return }

        // Offline fallback — queue for later
        if (!navigator.onLine) {
            await queueComplaint({ complaintText: text, category })
            const count = await getPendingCount()
            setPendingCount(count)
            toast.success('Saved offline — will submit when back online')
            setComplaintText('')
            setCategory('other')
            return
        }

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
        } catch {
            // Network error — queue offline
            await queueComplaint({ complaintText: text, category })
            const count = await getPendingCount()
            setPendingCount(count)
            toast.success('Saved offline — will submit when back online')
            setComplaintText('')
            setCategory('other')
        } finally { setSubmitting(false) }
    }

    // Load threaded messages for a complaint
    const loadChatMessages = useCallback(async (complaintId: string) => {
        setChatLoading(true)
        try {
            const res = await fetch(`/api/complaints/messages?complaintId=${complaintId}`)
            const data = await res.json()
            setChatMessages(data.messages || [])
        } catch {
            toast.error('Failed to load messages')
        } finally {
            setChatLoading(false)
        }
    }, [])

    const openChatThread = useCallback((complaintId: string) => {
        setOpenChat(complaintId)
        setChatText('')
        loadChatMessages(complaintId)
    }, [loadChatMessages])

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        if (openChat && chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
        }
    }, [chatMessages, openChat])

    const sendChatMessage = async () => {
        const text = chatText.trim()
        if (!text || !openChat) return
        setChatSending(true)
        try {
            const res = await fetch('/api/complaints/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ complaintId: openChat, message: text }),
            })
            if (res.ok) {
                setChatText('')
                loadChatMessages(openChat)
            } else {
                const data = await res.json()
                toast.error(data.error || 'Failed to send message')
            }
        } catch {
            toast.error('Network error')
        } finally {
            setChatSending(false)
        }
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
        <PullToRefresh onRefresh={async () => { setPage(1); await loadComplaints(1); toast.success('Complaints refreshed') }}>
        <div className="px-5 py-6">
            <h1 className="text-2xl font-black text-foreground tracking-tight leading-none mb-6">COMPLAINT BOX</h1>

            {/* Pending offline complaints indicator */}
            {pendingCount > 0 && (
                <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                    <Badge variant="warning" className="text-[10px]">{pendingCount} Pending</Badge>
                    <span className="text-xs text-amber-700 dark:text-amber-400">Will auto-submit when online</span>
                </div>
            )}

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

                                    {/* Admin Reply (legacy) & Chat Thread Button */}
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

                                    {/* Open chat thread */}
                                    <button
                                        onClick={() => openChatThread(c.id)}
                                        className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                                    >
                                        <FontAwesomeIcon icon={faComments} className="w-3.5 h-3.5" />
                                        View conversation
                                    </button>
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

        {/* Threaded Chat Overlay */}
        <AnimatePresence>
            {openChat && (
                <motion.div
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                    className="fixed inset-0 z-50 bg-background flex flex-col"
                >
                    {/* Chat header */}
                    <div className="flex items-center gap-3 px-5 py-4 border-b">
                        <button
                            onClick={() => setOpenChat(null)}
                            className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                        >
                            <FontAwesomeIcon icon={faArrowLeft} className="w-4 h-4 text-foreground" />
                        </button>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground">Complaint Thread</p>
                            <p className="text-[11px] text-muted-foreground truncate">
                                {complaints.find(c => c.id === openChat)?.complaintText?.slice(0, 60)}...
                            </p>
                        </div>
                        {(() => {
                            const complaint = complaints.find(c => c.id === openChat)
                            if (!complaint) return null
                            const statusCfg = STATUS_CONFIG[complaint.status] || STATUS_CONFIG.pending
                            return (
                                <Badge variant={statusCfg.variant} className="text-[10px] shrink-0">
                                    {statusCfg.label}
                                </Badge>
                            )
                        })()}
                    </div>

                    {/* Chat messages */}
                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                        {/* Original complaint as first message */}
                        {(() => {
                            const complaint = complaints.find(c => c.id === openChat)
                            if (!complaint) return null
                            return (
                                <div className="flex justify-end">
                                    <div className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 bg-primary text-primary-foreground">
                                        <p className="text-sm leading-relaxed">{complaint.complaintText}</p>
                                        <p className="text-[10px] opacity-70 mt-1 text-right">{formatDate(complaint.createdAt)}</p>
                                    </div>
                                </div>
                            )
                        })()}

                        {chatLoading ? (
                            <div className="flex justify-center py-8">
                                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : (
                            chatMessages.map((msg) => {
                                const isStudent = msg.senderRole === 'student'
                                return (
                                    <div key={msg.id} className={`flex ${isStudent ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                                            isStudent
                                                ? 'bg-primary text-primary-foreground rounded-br-md'
                                                : 'bg-muted text-foreground rounded-bl-md'
                                        }`}>
                                            {!isStudent && (
                                                <p className="text-[10px] font-semibold mb-0.5 opacity-70">
                                                    {msg.senderName} ({msg.senderRole === 'super_admin' ? 'Admin' : 'Admin'})
                                                </p>
                                            )}
                                            <p className="text-sm leading-relaxed">{msg.message}</p>
                                            <p className={`text-[10px] mt-1 ${isStudent ? 'text-right opacity-70' : 'opacity-50'}`}>
                                                {formatDate(msg.createdAt)}
                                            </p>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Chat input */}
                    <div className="border-t px-5 py-3 flex items-center gap-2">
                        <input
                            type="text"
                            value={chatText}
                            onChange={(e) => setChatText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage() } }}
                            placeholder="Type a message..."
                            className="flex-1 h-11 px-4 rounded-xl border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                            disabled={chatSending}
                        />
                        <Button
                            onClick={sendChatMessage}
                            disabled={!chatText.trim() || chatSending}
                            className="h-11 w-11 rounded-xl shrink-0 p-0"
                        >
                            <FontAwesomeIcon icon={faPaperPlane} className="w-4 h-4" />
                        </Button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
        </PullToRefresh>
    )
}
