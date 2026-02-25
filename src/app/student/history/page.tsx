'use client'

import { useEffect, useState, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faStar, faMessage } from '@fortawesome/free-solid-svg-icons'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

interface Review {
  id: string
  date: string
  mealType: string
  rating: number
  reviewText: string | null
  sentiment: string | null
  createdAt: string
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snacks: 'Snacks',
  dinner: 'Dinner',
}

export default function HistoryPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/reviews')
      const data = await res.json()
      setReviews(data.reviews || [])
    } catch (err) {
      console.error('Failed to load reviews:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()

    const supabase = createClient()
    const channel = supabase.channel('student_history_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, () => {
        loadData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadData])

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
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-foreground">
                            {MEAL_LABELS[review.mealType] || review.mealType}
                          </span>
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
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
