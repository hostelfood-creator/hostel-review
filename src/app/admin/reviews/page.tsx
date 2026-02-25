'use client'

import { useEffect, useState, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faInbox, faStar, faDownload, faImage, faFilePdf, faReply, faPaperPlane, faXmark } from '@fortawesome/free-solid-svg-icons'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface Review {
  id: string
  date: string
  mealType: string
  rating: number
  reviewText: string | null
  sentiment: string | null
  userName: string
  userRegisterId: string | null
  hostelBlock: string | null
  department: string | null
  year: string | null
  anonymous: boolean
  createdAt: string
  adminReply: string | null
  adminRepliedAt: string | null
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snacks: 'Snacks',
  dinner: 'Dinner',
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

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState('')
  const [mealFilter, setMealFilter] = useState('')
  const [blockFilter, setBlockFilter] = useState('all')
  const [metadata, setMetadata] = useState<{ userRole?: string, userBlock?: string, hostelBlocks?: string[] }>({})

  // Reply state
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  const loadReviews = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateFilter) params.set('date', dateFilter)
      if (mealFilter) params.set('mealType', mealFilter)
      if (blockFilter && blockFilter !== 'all') params.set('hostelBlock', blockFilter)
      const res = await fetch(`/api/reviews?${params}`)
      const data = await res.json()
      setReviews(data.reviews || [])
      setMetadata({
        userRole: data.userRole,
        userBlock: data.userBlock,
        hostelBlocks: data.hostelBlocks || []
      })
    } catch (err) {
      console.error('Failed to load reviews:', err)
    } finally {
      setLoading(false)
    }
  }, [dateFilter, mealFilter, blockFilter])

  useEffect(() => {
    loadReviews()

    const supabase = createClient()
    const channel = supabase.channel('admin_reviews_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, () => {
        loadReviews()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadReviews])

  const getSentimentVariant = (sentiment: string | null) => {
    switch (sentiment) {
      case 'positive':
        return 'success' as const
      case 'negative':
        return 'destructive' as const
      default:
        return 'warning' as const
    }
  }

  const getRatingColor = (rating: number) => {
    if (rating >= 4) return 'text-green-500 dark:text-green-400'
    if (rating >= 3) return 'text-yellow-500 dark:text-yellow-400'
    return 'text-red-500 dark:text-red-400'
  }

  const handleSendReply = async (reviewId: string) => {
    const text = replyText.trim()
    if (!text) { toast.error('Reply cannot be empty'); return }
    setSendingReply(true)
    try {
      const res = await fetch('/api/admin/review-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId, reply: text }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Failed to send reply'); return }
      toast.success('Reply sent')
      setReplyingTo(null)
      setReplyText('')
      loadReviews()
    } catch { toast.error('Network error') } finally { setSendingReply(false) }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
            All Reviews
            {metadata.userRole === 'admin' && metadata.userBlock && (
              <Badge variant="secondary" className="font-mono text-[10px] ml-1">{metadata.userBlock}</Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Browse and filter all student food reviews
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="self-start">
            {reviews.length} reviews
          </Badge>
          <Button size="sm" onClick={() => {
            if (reviews.length === 0) return
            const dateLabel = dateFilter || new Date().toISOString().split('T')[0]
            const mealLabel = mealFilter && mealFilter !== 'all' ? MEAL_LABELS[mealFilter] : 'All Meals'
            const blockLabel = blockFilter && blockFilter !== 'all' ? blockFilter : 'All Blocks'
            const printW = window.open('', '_blank')
            if (!printW) return
            const rows = reviews.map((r, i) =>
              `<tr style="background:${i % 2 === 0 ? '#fff' : '#fafafa'}">
                <td style="padding:8px 12px;border:1px solid #ddd;font-size:12px">${i + 1}</td>
                <td style="padding:8px 12px;border:1px solid #ddd;font-size:12px;font-weight:600">${escHtml(r.userName)}</td>
                <td style="padding:8px 12px;border:1px solid #ddd;font-size:12px;font-family:monospace">${escHtml(r.userRegisterId || '—')}</td>
                <td style="padding:8px 12px;border:1px solid #ddd;font-size:12px">${escHtml(r.hostelBlock || '—')}</td>
                <td style="padding:8px 12px;border:1px solid #ddd;font-size:12px">${MEAL_LABELS[r.mealType] || escHtml(r.mealType)}</td>
                <td style="padding:8px 12px;border:1px solid #ddd;font-size:12px;font-weight:600;color:${r.rating >= 4 ? '#16a34a' : r.rating >= 3 ? '#eab308' : '#dc2626'}">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</td>
                <td style="padding:8px 12px;border:1px solid #ddd;font-size:12px;max-width:300px">${escHtml(r.reviewText || '—')}</td>
                <td style="padding:8px 12px;border:1px solid #ddd;font-size:12px"><span style="padding:2px 8px;border-radius:12px;background:${r.sentiment === 'positive' ? '#dcfce7' : r.sentiment === 'negative' ? '#fde2e2' : '#fef9c3'};font-size:11px">${escHtml(r.sentiment || '—')}</span></td>
              </tr>`
            ).join('')
            const avgRating = (reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1)
            printW.document.write(`<!DOCTYPE html><html><head><title>Reviews Report</title>
              <style>@media print{@page{size:landscape;margin:12mm}}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:24px;color:#111}h1{font-size:22px;margin-bottom:4px}.sub{color:#666;font-size:13px;margin-bottom:16px}table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 12px;border:1px solid #ddd;background:#f5f5f5;font-size:11px;text-transform:uppercase;letter-spacing:.5px}.footer{margin-top:24px;color:#999;font-size:11px;text-align:center;border-top:1px solid #eee;padding-top:12px}.stat{display:inline-block;padding:8px 16px;background:#f0f0f0;border-radius:8px;margin-right:12px;margin-bottom:8px}</style>
            </head><body>
              <h1>Student Food Reviews Report</h1>
              <p class="sub">${dateLabel} · ${mealLabel} · ${blockLabel} · ${reviews.length} reviews</p>
              <div style="margin-bottom:20px">
                <span class="stat"><strong>Average Rating:</strong> ${avgRating} / 5</span>
                <span class="stat"><strong>Positive:</strong> ${reviews.filter(r => r.sentiment === 'positive').length}</span>
                <span class="stat"><strong>Negative:</strong> ${reviews.filter(r => r.sentiment === 'negative').length}</span>
              </div>
              <table><thead><tr><th>#</th><th>Student</th><th>Register No.</th><th>Hostel</th><th>Meal</th><th>Rating</th><th>Review</th><th>Sentiment</th></tr></thead>
              <tbody>${rows}</tbody></table>
              <div class="footer">Generated on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} · Hostel Food Review System</div>
              <script>window.onload=function(){setTimeout(function(){window.print()},400)};<\/script>
            </body></html>`)
            printW.document.close()
          }} className="rounded-full bg-red-600 hover:bg-red-700 text-white">
            <FontAwesomeIcon icon={faFilePdf} className="w-3.5 h-3.5 mr-1.5" />
            Export PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            if (reviews.length === 0) { return }
            const headers = ['Student', 'Register ID', 'Hostel Block', 'Date', 'Meal', 'Rating', 'Review', 'Sentiment']
            const rows = reviews.map((r) => [
              r.userName,
              r.userRegisterId || '',
              r.hostelBlock || '',
              r.date,
              r.mealType,
              r.rating.toString(),
              `"${(r.reviewText || '').replace(/"/g, '""')}"`,
              r.sentiment || '',
            ])
            const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `reviews_${new Date().toISOString().split('T')[0]}.csv`
            a.click()
            URL.revokeObjectURL(url)
          }} className="rounded-full">
            <FontAwesomeIcon icon={faDownload} className="w-3.5 h-3.5 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="w-auto"
        />
        <Select value={mealFilter} onValueChange={setMealFilter}>
          <SelectTrigger className="w-[140px]">
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
        {metadata.userRole === 'super_admin' && metadata.hostelBlocks && metadata.hostelBlocks.length > 0 && (
          <Select value={blockFilter} onValueChange={setBlockFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Blocks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Blocks</SelectItem>
              {metadata.hostelBlocks.map(b => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {(dateFilter || mealFilter || (blockFilter && blockFilter !== 'all')) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDateFilter('')
              setMealFilter('')
              setBlockFilter('all')
            }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="rounded-xl">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-3 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <Card className="rounded-xl">
          <CardContent className="text-center py-16">
            <FontAwesomeIcon icon={faInbox} className="w-12 h-12 text-muted-foreground/40 mb-3 mx-auto" />
            <p className="text-muted-foreground text-sm">No reviews found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {reviews.map((review) => (
            <Card
              key={review.id}
              className={`rounded-xl ${review.rating <= 2
                ? 'border-red-200 dark:border-red-500/15 bg-red-50/50 dark:bg-red-500/[0.02]'
                : ''
                }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="text-sm font-semibold text-foreground">{review.userName}</span>
                      {review.userRegisterId && (
                        <span className="text-[10px] text-muted-foreground font-mono">{review.userRegisterId}</span>
                      )}
                      {review.hostelBlock && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {review.hostelBlock}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-muted-foreground font-medium">
                        {MEAL_LABELS[review.mealType] || review.mealType}
                      </span>
                      <span className="text-xs text-muted-foreground/60">{review.date}</span>
                    </div>
                    {review.reviewText && (
                      <p className="text-sm text-muted-foreground leading-relaxed mb-2">{review.reviewText}</p>
                    )}
                    {review.sentiment && (
                      <Badge variant={getSentimentVariant(review.sentiment)} className="text-[10px] uppercase tracking-wider">
                        {review.sentiment}
                      </Badge>
                    )}

                    {/* Admin Reply Display */}
                    {review.adminReply && (
                      <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                        <div className="flex items-center gap-1.5 mb-1">
                          <FontAwesomeIcon icon={faReply} className="w-3 h-3 text-primary" />
                          <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Admin Reply</span>
                        </div>
                        <p className="text-sm text-foreground leading-relaxed">{review.adminReply}</p>
                        {review.adminRepliedAt && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {new Date(review.adminRepliedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Reply Input */}
                    {replyingTo === review.id ? (
                      <div className="mt-3 flex gap-2">
                        <input
                          type="text"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Type your reply..."
                          className="flex-1 px-3 py-2 rounded-lg border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                          maxLength={2000}
                          disabled={sendingReply}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(review.id) } }}
                        />
                        <Button size="sm" onClick={() => handleSendReply(review.id)} disabled={sendingReply || !replyText.trim()} className="rounded-lg">
                          <FontAwesomeIcon icon={faPaperPlane} className="w-3 h-3" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setReplyingTo(null); setReplyText('') }} disabled={sendingReply} className="rounded-lg">
                          <FontAwesomeIcon icon={faXmark} className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <button
                          onClick={() => { setReplyingTo(review.id); setReplyText(review.adminReply || '') }}
                          className="text-[11px] text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
                        >
                          <FontAwesomeIcon icon={faReply} className="w-3 h-3" />
                          {review.adminReply ? 'Edit Reply' : 'Reply'}
                        </button>
                      </div>
                    )}

                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <FontAwesomeIcon icon={faStar}
                          key={star}
                          className={`w-3.5 h-3.5 ${star <= review.rating ? `${getRatingColor(review.rating)}` : 'text-muted-foreground/30'
                            }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}