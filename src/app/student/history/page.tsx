'use client'

import { useEffect, useState, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faStar, faMessage, faPenToSquare, faTrash, faCheck, faXmark, faReply } from '@fortawesome/free-solid-svg-icons'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

interface Review {
  id: string
  date: string
  mealType: string
  rating: number
  reviewText: string | null
  sentiment: string | null
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

const PAGE_SIZE = 20

export default function HistoryPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRating, setEditRating] = useState(0)
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  /** Get today's date in IST */
  const getTodayIST = () => {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    })
    const parts = Object.fromEntries(formatter.formatToParts(now).map(p => [p.type, p.value]))
    return `${parts.year}-${parts.month}-${parts.day}`
  }

  /** Check if a review can be edited (same day IST) */
  const canEdit = (review: Review) => review.date === getTodayIST()

  /** Check if a review can be deleted (within 24 hours) */
  const canDelete = (review: Review) => {
    const createdAt = new Date(review.createdAt).getTime()
    return (Date.now() - createdAt) < 24 * 60 * 60 * 1000
  }

  const loadData = useCallback(async (pageNum: number, append = false) => {
    try {
      if (append) setLoadingMore(true)
      const res = await fetch(`/api/reviews?page=${pageNum}&pageSize=${PAGE_SIZE}`)
      const data = await res.json()
      const newReviews = data.reviews || []
      if (append) {
        setReviews(prev => [...prev, ...newReviews])
      } else {
        setReviews(newReviews)
      }
      // Check if there are more pages
      if (data.pagination) {
        setHasMore(pageNum < data.pagination.totalPages)
      } else {
        setHasMore(newReviews.length === PAGE_SIZE)
      }
    } catch (err) {
      console.error('Failed to load reviews:', err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    loadData(1)

    const supabase = createClient()
    // Get user ID for filtered realtime subscription (avoid O(U*R) traffic)
    let channelRef: ReturnType<typeof supabase.channel> | null = null
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      if (!authUser) return
      const ch = supabase.channel('student_history_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews', filter: `user_id=eq.${authUser.id}` }, () => {
          setPage(1)
          loadData(1)
        })
        .subscribe()
      channelRef = ch
    })

    return () => {
      if (channelRef) supabase.removeChannel(channelRef)
    }
  }, [loadData])

  const handleLoadMore = () => {
    const nextPage = page + 1
    setPage(nextPage)
    loadData(nextPage, true)
  }

  const startEdit = (review: Review) => {
    setEditingId(review.id)
    setEditRating(review.rating)
    setEditText(review.reviewText || '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditRating(0)
    setEditText('')
  }

  const handleSaveEdit = async (reviewId: string) => {
    if (editRating < 1 || editRating > 5) { toast.error('Rating must be 1-5'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId, rating: editRating, reviewText: editText }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Failed to update'); return }
      toast.success('Review updated')
      setEditingId(null)
      setPage(1)
      loadData(1)
    } catch { toast.error('Network error') } finally { setSaving(false) }
  }

  const handleDelete = async (reviewId: string) => {
    setDeletingId(reviewId)
    try {
      const res = await fetch(`/api/reviews?id=${reviewId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Failed to delete'); return }
      toast.success('Review deleted')
      setReviews(prev => prev.filter(r => r.id !== reviewId))
    } catch { toast.error('Network error') } finally { setDeletingId(null) }
  }

  const groupedByDate = reviews.reduce<Record<string, Review[]>>((acc, r) => {
    if (!acc[r.date]) acc[r.date] = []
    acc[r.date].push(r)
    return acc
  }, {})

  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a))

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-IN', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }

  const getSentimentVariant = (sentiment: string | null): 'success' | 'destructive' | 'warning' => {
    switch (sentiment) {
      case 'positive': return 'success'
      case 'negative': return 'destructive'
      default: return 'warning'
    }
  }

  if (loading) {
    return (
      <div className="px-5 py-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        <div className="space-y-3 mt-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="px-5 py-6">
      <h1 className="text-2xl font-black text-foreground tracking-tight leading-none mb-1">
        REVIEW HISTORY
      </h1>
      <p className="text-muted-foreground text-sm font-medium mb-6 tracking-wide">
        Your past food reviews
      </p>

      {sortedDates.length === 0 ? (
        <div className="text-center py-16">
          <FontAwesomeIcon icon={faMessage} className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No reviews yet</p>
          <p className="text-muted-foreground/60 text-xs mt-1">Start reviewing today&apos;s meals</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDates.map((date) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  {formatDate(date)}
                </h3>
                <Separator className="flex-1" />
              </div>
              <div className="space-y-2">
                {groupedByDate[date]
                  .sort((a, b) => {
                    const order = ['breakfast', 'lunch', 'snacks', 'dinner']
                    return order.indexOf(a.mealType) - order.indexOf(b.mealType)
                  })
                  .map((review) => (
                    <Card key={review.id} className="rounded-xl">
                      <CardContent className="p-4">
                        {editingId === review.id ? (
                          /* Edit Mode */
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-foreground">
                                {MEAL_LABELS[review.mealType] || review.mealType}
                              </span>
                              <Badge variant="warning" className="text-[10px]">Editing</Badge>
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Rating</label>
                              <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button key={star} onClick={() => setEditRating(star)} disabled={saving}>
                                    <FontAwesomeIcon icon={faStar}
                                      className={`w-5 h-5 transition-colors ${star <= editRating ? 'text-primary' : 'text-zinc-300 dark:text-zinc-700'}`}
                                    />
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Review</label>
                              <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                className="w-full p-2 rounded-lg border bg-background text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all min-h-[60px]"
                                maxLength={2000}
                                disabled={saving}
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleSaveEdit(review.id)} disabled={saving} className="rounded-lg">
                                <FontAwesomeIcon icon={faCheck} className="w-3 h-3 mr-1" />
                                {saving ? 'Saving...' : 'Save'}
                              </Button>
                              <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving} className="rounded-lg">
                                <FontAwesomeIcon icon={faXmark} className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          /* Normal View */
                          <>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-semibold text-foreground">
                                {MEAL_LABELS[review.mealType] || review.mealType}
                              </span>
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-0.5">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <FontAwesomeIcon icon={faStar}
                                      key={star}
                                      className={`w-3.5 h-3.5 ${star <= review.rating
                                        ? 'text-primary'
                                        : 'text-zinc-300 dark:text-zinc-700'
                                        }`}
                                    />
                                  ))}
                                </div>
                                {/* Edit/Delete actions */}
                                {(canEdit(review) || canDelete(review)) && (
                                  <div className="flex items-center gap-1 ml-1">
                                    {canEdit(review) && (
                                      <button
                                        onClick={() => startEdit(review)}
                                        className="p-1 rounded text-muted-foreground hover:text-primary transition-colors"
                                        title="Edit review"
                                      >
                                        <FontAwesomeIcon icon={faPenToSquare} className="w-3 h-3" />
                                      </button>
                                    )}
                                    {canDelete(review) && (
                                      <button
                                        onClick={() => handleDelete(review.id)}
                                        disabled={deletingId === review.id}
                                        className="p-1 rounded text-muted-foreground hover:text-red-500 transition-colors"
                                        title="Delete review"
                                      >
                                        <FontAwesomeIcon icon={faTrash} className={`w-3 h-3 ${deletingId === review.id ? 'animate-spin' : ''}`} />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            {review.reviewText && (
                              <p className="text-muted-foreground text-xs leading-relaxed">
                                {review.reviewText}
                              </p>
                            )}
                            {review.sentiment && (
                              <div className="mt-2">
                                <Badge variant={getSentimentVariant(review.sentiment)} className="text-[10px] uppercase tracking-wider">
                                  {review.sentiment}
                                </Badge>
                              </div>
                            )}
                            {/* Admin Reply */}
                            {review.adminReply && (
                              <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <FontAwesomeIcon icon={faReply} className="w-3 h-3 text-primary" />
                                  <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Admin Reply</span>
                                </div>
                                <p className="text-xs text-foreground leading-relaxed">{review.adminReply}</p>
                                {review.adminRepliedAt && (
                                  <p className="text-[10px] text-muted-foreground mt-1">
                                    {new Date(review.adminRepliedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                  </p>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </div>
          ))}

          {/* Load More */}
          {hasMore && (
            <div className="text-center pt-2 pb-4">
              <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loadingMore} className="rounded-full">
                {loadingMore ? 'Loading...' : 'Load More Reviews'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
