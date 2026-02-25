'use client'

import { useEffect, useState, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faStar, faCircleCheck, faArrowRight, faLock, faLockOpen, faUserCircle, faQrcode } from '@fortawesome/free-solid-svg-icons'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { BlurFade } from '@/components/ui/blur-fade'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'


interface MenuData {
  id: string
  date: string
  mealType: string
  items: string
  timing: string
}

interface ReviewState {
  [mealType: string]: {
    rating: number
    reviewText: string
    tags: string[]
    submitted: boolean
    submitting: boolean
    existingRating?: number
    existingText?: string
    existingTags?: string[]

  }
}

// Dynamic tags by rating tier and meal type:
// Low (1-2) → negative problem tags | Neutral (3) → mixed | High (4-5) → positive praise tags
const FEEDBACK_TAGS: Record<string, Record<'low' | 'neutral' | 'high', string[]>> = {
  breakfast: {
    low: ['Cold', 'Undercooked', 'Tasteless', 'Salty', 'Missing Items', 'Stale'],
    neutral: ['Okay', 'Average', 'Could Improve', 'Partially Good', 'Acceptable'],
    high: ['Fresh', 'Nutritious', 'Perfectly Cooked', 'Great Variety', 'Excellent', 'Hot & Tasty'],
  },
  lunch: {
    low: ['Undercooked', 'Overcooked', 'Too Salty', 'Spicy', 'Small Portion', 'Stale'],
    neutral: ['Average', 'Okay', 'Could be Better', 'Acceptable Portion'],
    high: ['Tasty', 'Fresh', 'Well Portioned', 'Flavorful', 'Excellent', 'Great Quality'],
  },
  snacks: {
    low: ['Stale', 'Oily', 'Cold', 'Not Fresh', 'Tasteless', 'Small Portion'],
    neutral: ['Average', 'Okay', 'Could Improve'],
    high: ['Fresh', 'Crunchy', 'Hot & Crispy', 'Sweet', 'Tasty', 'Great Snack'],
  },
  dinner: {
    low: ['Cold', 'Undercooked', 'Overcooked', 'Too Salty', 'Small Portion', 'Missing Items'],
    neutral: ['Average', 'Okay', 'Could be Better', 'Acceptable'],
    high: ['Tasty', 'Fresh', 'Well Portioned', 'Excellent', 'Nutritious', 'Great Quality'],
  },
}

function getTagsForRating(mealType: string, rating: number): string[] {
  const group = FEEDBACK_TAGS[mealType]
  if (!group) return []
  if (rating <= 2) return group.low
  if (rating === 3) return group.neutral
  return group.high
}

const MEAL_ORDER = ['breakfast', 'lunch', 'snacks', 'dinner']
const MEAL_LABELS: Record<string, string> = {
  breakfast: 'BREAKFAST',
  lunch: 'LUNCH',
  snacks: 'SNACKS',
  dinner: 'DINNER',
}
const DEFAULT_TIMING: Record<string, string> = {
  breakfast: '7:30 - 9:30 AM',
  lunch: '12:30 - 2:30 PM',
  snacks: '4:30 - 5:30 PM',
  dinner: '7:30 - 9:30 PM',
}
const DEFAULT_ITEMS: Record<string, string> = {
  breakfast: 'Menu not yet updated for today',
  lunch: 'Menu not yet updated for today',
  snacks: 'Menu not yet updated for today',
  dinner: 'Menu not yet updated for today',
}

/** Parse timing like "7:30 - 9:30 AM" and return the start hour in 24h format */
function getMealStartHour(timing: string): number {
  if (!timing) return 0

  // Extract only the START portion (before any dash/hyphen) to avoid
  // the end-time's AM/PM suffix from affecting the start hour detection.
  const startPart = timing.split(/[-–—]/, 1)[0].trim()

  // Match the start hour and its immediate AM/PM suffix (if any)
  const match = startPart.match(/(\d{1,2})[:.]?\d{0,2}\s*(am|pm)?/i)
  if (!match) return 0

  let hour = parseInt(match[1], 10)

  // Only use AM/PM that directly follows the start time
  const isPM = match[2]?.toUpperCase() === 'PM'
  const isAM = match[2]?.toUpperCase() === 'AM'

  if (isPM && hour < 12) hour += 12
  if (isAM && hour === 12) hour = 0
  return hour
}

/** Check if meal review is open: opens at meal start time, stays open until midnight */
function isMealOpen(timing: string, currentHour: number): boolean {
  const startHour = getMealStartHour(timing)
  return currentHour >= startHour
}

export default function StudentDashboard() {
  const [menus, setMenus] = useState<MenuData[]>([])
  const [reviews, setReviews] = useState<ReviewState>({})
  const [todayDate, setTodayDate] = useState('')
  const [displayDate, setDisplayDate] = useState('')
  const [serverHour, setServerHour] = useState(new Date().getHours())
  const [userName, setUserName] = useState('')
  const [checkinStatus, setCheckinStatus] = useState<{ checkedIn: boolean; mealType?: string; mealLabel?: string } | null>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { if (d.user?.name) setUserName(d.user.name.split(' ')[0]) })
      .catch(() => { })

    // Fetch today's check-in status
    fetch('/api/checkin')
      .then(r => r.json())
      .then(d => {
        if (d.checkins && d.currentMeal) {
          const current = d.checkins.find((c: { meal_type: string }) => c.meal_type === d.currentMeal)
          setCheckinStatus({
            checkedIn: !!current,
            mealType: d.currentMeal,
            mealLabel: d.currentMealLabel,
          })
        } else {
          setCheckinStatus({ checkedIn: false })
        }
      })
      .catch(() => setCheckinStatus({ checkedIn: false }))
  }, [])

  const initReviewState = useCallback(() => {
    const state: ReviewState = {}
    for (const meal of MEAL_ORDER) {
      state[meal] = { rating: 3, reviewText: '', tags: [], submitted: false, submitting: false }
    }
    return state
  }, [])

  // Fetch server time and update clock every 60s
  const fetchServerTime = useCallback(async () => {
    try {
      const res = await fetch('/api/time')
      const data = await res.json()
      setTodayDate(data.date)
      setDisplayDate(data.display)
      setServerHour(data.hours)
    } catch {
      // Fallback to client time
      const now = new Date()
      setTodayDate(now.toISOString().split('T')[0])
      setServerHour(now.getHours())
    }
  }, [])

  useEffect(() => {
    fetchServerTime()
    const timer = setInterval(fetchServerTime, 60000)
    return () => clearInterval(timer)
  }, [fetchServerTime])

  useEffect(() => {
    if (!todayDate) return
    const loadData = async () => {
      try {
        const [menuRes, reviewRes] = await Promise.all([
          fetch('/api/menu/today'),
          fetch(`/api/reviews?date=${todayDate}`),
        ])
        const menuData = await menuRes.json()
        const reviewData = await reviewRes.json()
        setMenus(menuData.menus || [])

        const state = initReviewState()
        if (reviewData.reviews) {
          for (const r of reviewData.reviews) {
            if (state[r.mealType]) {
              state[r.mealType] = {
                rating: r.rating,
                reviewText: r.reviewText || '',
                tags: [],
                submitted: true,
                submitting: false,
                existingRating: r.rating,
                existingText: r.reviewText || '',
                existingTags: [],
              }
            }
          }
        }
        setReviews(state)
      } catch (err) {
        console.error('Failed to load data:', err)
        toast.error('Failed to load menu data')
        setReviews(initReviewState())
      }
    }
    loadData()
  }, [todayDate, initReviewState])

  const setRating = (mealType: string, rating: number) => {
    if (reviews[mealType]?.submitted) return
    setReviews((prev) => ({
      ...prev,
      [mealType]: { ...prev[mealType], rating },
    }))
  }

  const toggleTag = (mealType: string, tag: string) => {
    if (reviews[mealType]?.submitted) return
    setReviews((prev) => ({
      ...prev,
      [mealType]: {
        ...prev[mealType],
        tags: prev[mealType].tags.includes(tag)
          ? prev[mealType].tags.filter((t) => t !== tag)
          : [...prev[mealType].tags, tag],
      },
    }))
  }

  const setReviewText = (mealType: string, text: string) => {
    if (reviews[mealType]?.submitted) return
    setReviews((prev) => ({
      ...prev,
      [mealType]: { ...prev[mealType], reviewText: text },
    }))
  }

  const submitReview = async (mealType: string) => {
    const review = reviews[mealType]
    if (!review || review.rating === 0 || review.submitted) return

    setReviews((prev) => ({
      ...prev,
      [mealType]: { ...prev[mealType], submitting: true },
    }))

    try {
      // Append selected tags to review text for persistence
      const tagStr = review.tags.length > 0 ? review.tags.map(t => `#${t}`).join(' ') : ''
      const fullReviewText = [review.reviewText, tagStr].filter(Boolean).join(' ') || null

      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealType,
          rating: review.rating,
          reviewText: fullReviewText,
          anonymous: false,

        }),
      })

      if (res.ok) {
        setReviews((prev) => ({
          ...prev,
          [mealType]: {
            ...prev[mealType],
            submitted: true,
            submitting: false,
            existingRating: review.rating,
            existingText: review.reviewText,
          },
        }))
        // No toast - the in-card confirmation handles the feedback
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to submit review')
        setReviews((prev) => ({
          ...prev,
          [mealType]: { ...prev[mealType], submitting: false },
        }))
      }
    } catch {
      toast.error('Network error. Please try again.')
      setReviews((prev) => ({
        ...prev,
        [mealType]: { ...prev[mealType], submitting: false },
      }))
    }
  }

  const getMenuForMeal = (mealType: string) => {
    return menus.find((m) => m.mealType === mealType)
  }

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'T00:00:00')
    const weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
    const day = d.getDate()
    const month = d.toLocaleDateString('en-US', { month: 'short' })
    const year = d.getFullYear()
    return `${weekday}, ${day} ${month} ${year}`
  }

  const getGreeting = () => {
    const base = serverHour < 12 ? 'Good Morning' : serverHour < 17 ? 'Good Afternoon' : 'Good Evening'
    return userName ? `${base}, ${userName}` : base
  }

  return (
    <div className="px-5 lg:px-8 py-6">
      {/* Personalized Greeting with BlurFade */}
      <section className="mb-8">
        <BlurFade delay={0.15} inView>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl xl:text-5xl">
            {getGreeting()} 👋
          </h2>
        </BlurFade>
        <BlurFade delay={0.3} inView>
          <p className="text-xl text-muted-foreground tracking-tight sm:text-2xl xl:text-3xl mt-1">
            Ready to rate your meals today?
          </p>
        </BlurFade>
      </section>

      {/* Meal Check-in Card */}
      <BlurFade delay={0.35} inView>
        <Link href="/student/scan">
          <Card className={`mb-6 rounded-xl border transition-all duration-300 hover:shadow-md cursor-pointer ${
            checkinStatus?.checkedIn
              ? 'border-green-200 dark:border-green-500/20 bg-green-50/50 dark:bg-green-500/5'
              : 'border-primary/20 hover:border-primary/40'
          }`}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                checkinStatus?.checkedIn
                  ? 'bg-green-100 dark:bg-green-500/15'
                  : 'bg-primary/10'
              }`}>
                <FontAwesomeIcon
                  icon={checkinStatus?.checkedIn ? faCircleCheck : faQrcode}
                  className={`w-6 h-6 ${
                    checkinStatus?.checkedIn
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-primary'
                  }`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {checkinStatus?.checkedIn
                    ? `Checked in for ${checkinStatus.mealLabel || 'meal'}`
                    : checkinStatus?.mealType
                      ? `Check in for ${checkinStatus.mealLabel || 'meal'}`
                      : 'Meal Check-in'
                  }
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {checkinStatus?.checkedIn
                    ? 'You\'re all set! Tap to view details.'
                    : 'Scan the QR code or tap here to check in'
                  }
                </p>
              </div>
              <FontAwesomeIcon
                icon={faArrowRight}
                className="w-4 h-4 text-muted-foreground shrink-0"
              />
            </CardContent>
          </Card>
        </Link>
      </BlurFade>

      {/* Title */}
      <BlurFade delay={0.4} inView>
        <div className="mb-6">
          <h1 className="text-2xl font-black text-foreground tracking-tight leading-none">
            TODAY&apos;S MENU
          </h1>
          <p className="text-muted-foreground text-base font-medium mt-1 tracking-wide">
            {displayDate}
          </p>
        </div>
      </BlurFade>

      {/* Meal Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MEAL_ORDER.map((mealType, index) => {
          const menu = getMenuForMeal(mealType)
          const review = reviews[mealType]
          const items = menu?.items || DEFAULT_ITEMS[mealType]
          const timing = menu?.timing || DEFAULT_TIMING[mealType]
          const isSubmitted = review?.submitted
          const isOpen = isMealOpen(timing, serverHour)

          return (
            <BlurFade key={mealType} delay={0.15 + index * 0.1} inView>
              <Card
                className={`rounded-xl transition-all duration-300 ${isSubmitted
                  ? 'border-green-200 dark:border-green-500/20'
                  : !isOpen
                    ? 'opacity-80 border-muted'
                    : 'hover:border-primary/30 dark:hover:border-primary/20 hover:shadow-md'
                  }`}
              >
                <CardContent className="p-5">
                  {/* Header Row */}
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2.5">
                      {/* Lock/Unlock Animation */}
                      <AnimatePresence mode="wait">
                        {isOpen ? (
                          <motion.div
                            key="unlocked"
                            initial={{ scale: 0.5, opacity: 0, rotate: -45 }}
                            animate={{ scale: 1, opacity: 1, rotate: 0 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                          >
                            <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-500/10 flex items-center justify-center">
                              <FontAwesomeIcon
                                icon={faLockOpen}
                                className="w-4 h-4 text-green-600 dark:text-green-400"
                              />
                            </div>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="locked"
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                          >
                            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                              <FontAwesomeIcon
                                icon={faLock}
                                className="w-4 h-4 text-muted-foreground"
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <div>
                        <h2 className="text-lg font-bold text-foreground tracking-tight">
                          {MEAL_LABELS[mealType]}
                        </h2>
                        <p className="text-xs text-muted-foreground font-medium">{timing}</p>
                      </div>
                    </div>
                    {isSubmitted && (
                      <Badge variant="secondary" className="text-[10px] font-semibold uppercase tracking-wider rounded-md bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20">
                        <FontAwesomeIcon icon={faCircleCheck} className="w-3 h-3 mr-1" />
                        Reviewed
                      </Badge>
                    )}
                    {!isOpen && !isSubmitted && (
                      <Badge variant="secondary" className="text-[10px] font-semibold uppercase tracking-wider rounded-md">
                        <FontAwesomeIcon icon={faLock} className="w-3 h-3 mr-1" />
                        Locked
                      </Badge>
                    )}
                  </div>

                  {/* Menu Items */}
                  <p className="text-muted-foreground text-sm leading-relaxed mb-4 pl-[46px]">
                    {items}
                  </p>

                  {/* Submitted State — Professional Thank You Confirmation */}
                  {isSubmitted ? (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                      className="pl-[46px]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-full bg-green-100 dark:bg-green-500/10 flex items-center justify-center">
                          <FontAwesomeIcon icon={faCircleCheck} className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground leading-tight">
                            Thank you for your feedback.
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                            The hostel management has received your review and will act on it accordingly.
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-lg">{['😡', '🙁', '😐', '🙂', '😍'][(review?.existingRating || 1) - 1]}</span>
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <FontAwesomeIcon icon={faStar} key={star}
                                  className={`w-3 h-3 ${star <= (review?.existingRating || 0) ? 'text-primary' : 'text-zinc-200 dark:text-zinc-700'}`}
                                />
                              ))}
                            </div>
                            {review?.existingTags && review.existingTags.length > 0 && (
                              <div className="flex flex-wrap gap-1 ml-1">
                                {review.existingTags.map((tag) => (
                                  <span key={tag} className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full border border-border">{tag}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ) : isOpen ? (
                    <div className="flex flex-col gap-3 pl-[46px]">
                      {/* Interactive Slider Rating */}
                      <div className="flex flex-col gap-2 mb-2">
                        <Label className="text-xs text-muted-foreground font-medium">Rate your experience</Label>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[(review?.rating || 0) === 0 ? 3 : review!.rating]}
                            onValueChange={(val: number[]) => setRating(mealType, val[0])}
                            min={1}
                            max={5}
                            step={1}
                            showTooltip
                            tooltipContent={(value: number) => ["Awful", "Poor", "Okay", "Good", "Amazing"][value - 1]}
                            aria-label="Rate your experience"
                            className="flex-1"
                          />
                          <span className="text-3xl min-w-[40px] text-center transition-all duration-300 transform hover:scale-110">
                            {(review?.rating || 0) > 0 ? (
                              ["😡", "🙁", "😐", "🙂", "😍"][review!.rating - 1]
                            ) : (
                              <span className="opacity-50 grayscale transition-all duration-300">😐</span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Feedback Tags — change dynamically with slider rating */}
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        <AnimatePresence mode="wait">
                          {getTagsForRating(mealType, review?.rating || 3).map((tag: string) => {
                            const isSelected = review?.tags?.includes(tag)
                            return (
                              <motion.button
                                key={tag}
                                initial={{ opacity: 0, scale: 0.85 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.85 }}
                                transition={{ duration: 0.15 }}
                                onClick={() => toggleTag(mealType, tag)}
                                className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all duration-150 ${isSelected
                                  ? 'bg-primary text-primary-foreground border-primary shadow-sm scale-105'
                                  : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                                  }`}
                              >
                                {tag}
                              </motion.button>
                            )
                          })}
                        </AnimatePresence>
                      </div>

                      {/* Review Input & Submit */}
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            value={review?.reviewText || ''}
                            onChange={(e) => setReviewText(mealType, e.target.value)}
                            placeholder="Anything else to add? (optional)"
                            className="flex-1 h-10 text-sm"
                          />
                          <Button
                            onClick={() => submitReview(mealType)}
                            disabled={
                              !review || review.submitting
                            }
                            size="icon"
                            className="min-w-[40px] h-10 bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                          >
                            {review?.submitting ? (
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                              <FontAwesomeIcon icon={faArrowRight} className="w-5 h-5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="pl-[46px]">
                      <p className="text-xs text-muted-foreground italic">
                        Reviews will open at meal time
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </BlurFade>
          )
        })}
      </div>

      <div className="h-8" />
    </div>
  )
}
