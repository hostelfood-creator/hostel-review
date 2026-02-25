'use client'

import { useEffect, useState, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faInbox, faStar, faDownload, faImage } from '@fortawesome/free-solid-svg-icons'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'

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
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snacks: 'Snacks',
  dinner: 'Dinner',
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState('')
  const [mealFilter, setMealFilter] = useState('')
  const [blockFilter, setBlockFilter] = useState('all')
  const [metadata, setMetadata] = useState<{ userRole?: string, userBlock?: string, hostelBlocks?: string[] }>({})

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