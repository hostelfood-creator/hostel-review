'use client'

import { useEffect, useState, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faStar, faCircleCheck, faArrowRight, faLock, faLockOpen, faUserCircle, faUsers, faQrcode, faCalendarCheck, faCrown, faXmark } from '@fortawesome/free-solid-svg-icons'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { BlurFade } from '@/components/ui/blur-fade'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { ReviewSuccess } from '@/components/ui/review-success'
import { AIVoiceInput } from '@/components/ui/ai-voice-input'
import { HeroPill } from '@/components/ui/hero-pill'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { hapticSuccess, hapticLight, hapticError } from '@/lib/haptics'


interface MenuData {
  id: string
  date: string
  mealType: string
  items: string
  timing: string
  specialLabel?: string | null
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
// Now loaded from i18n translations — fallback constants kept for non-i18n callers
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

function getTagsForRatingStatic(mealType: string, rating: number): string[] {
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
const DEFAULT_ITEMS: Record<string, string> = {
  breakfast: 'Menu not yet updated for today',
  lunch: 'Menu not yet updated for today',
  snacks: 'Menu not yet updated for today',
  dinner: 'Menu not yet updated for today',
}

/** Admin-configurable meal timing from /api/meal-timings */
interface MealTimingConfig {
  start: string   // "07:00" HH:MM 24h
  end: string     // "10:00"
  label: string   // "Breakfast"
  display: string // "7:00 AM – 10:00 AM"
}

/** Parse HH:MM into total minutes since midnight */
function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Check if a meal review is open based on admin-configured start time.
 * Reviews unlock at the meal start time and stay open for the rest of the day.
 * Only the start time matters — end time is not used for locking reviews.
 */
function isMealOpen(
  timing: MealTimingConfig | undefined,
  serverHour: number,
  serverMinute: number
): boolean {
  if (!timing) return false
  const now = serverHour * 60 + serverMinute
  const start = parseTimeToMinutes(timing.start)
  return now >= start
}

export default function StudentDashboard() {
  const { t } = useTranslation()
  const [menus, setMenus] = useState<MenuData[]>([])
  const [reviews, setReviews] = useState<ReviewState>({})
  const [todayDate, setTodayDate] = useState('')
  const [displayDate, setDisplayDate] = useState('')
  const [serverHour, setServerHour] = useState(new Date().getHours())
  const [serverMinute, setServerMinute] = useState(new Date().getMinutes())
  const [userName, setUserName] = useState('')
  const [userHostelBlock, setUserHostelBlock] = useState<string | null>(null)
  const [checkinStatus, setCheckinStatus] = useState<{ checkedIn: boolean; mealType?: string; mealLabel?: string } | null>(null)
  const [weeklyHistory, setWeeklyHistory] = useState<{ date: string; meals: string[] }[] | null>(null)
  const [weeklyPercentage, setWeeklyPercentage] = useState(0)
  const [mealTimings, setMealTimings] = useState<Record<string, MealTimingConfig> | null>(null)
  // Bottom sheet state for review modal
  const [activeSheet, setActiveSheet] = useState<string | null>(null)
  // Review success animation state
  const [reviewSuccess, setReviewSuccess] = useState<{ show: boolean; rating: number; meal: string }>({ show: false, rating: 0, meal: '' })
  // Community ratings
  const [communityRatings, setCommunityRatings] = useState<Record<string, { avg: number; count: number }>>({})
  // Announcements
  const [announcements, setAnnouncements] = useState<{ id: string; title: string; body: string; priority: string }[]>([])

  // i18n-aware meal labels
  const MEAL_LABELS_I18N: Record<string, string> = {
    breakfast: t.meals.breakfastUpper,
    lunch: t.meals.lunchUpper,
    snacks: t.meals.snacksUpper,
    dinner: t.meals.dinnerUpper,
  }
  const DEFAULT_ITEMS_I18N: Record<string, string> = {
    breakfast: t.student.menuNotUpdated,
    lunch: t.student.menuNotUpdated,
    snacks: t.student.menuNotUpdated,
    dinner: t.student.menuNotUpdated,
  }

  // i18n-aware feedback tags
  const getTagsForRating = useCallback((mealType: string, rating: number): string[] => {
    const group = t.feedbackTags[mealType as keyof typeof t.feedbackTags]
    if (!group) return getTagsForRatingStatic(mealType, rating)
    if (rating <= 2) return group.low
    if (rating === 3) return group.neutral
    return group.high
  }, [t])

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        if (d.user?.name) setUserName(d.user.name.split(' ')[0])
        if (d.user?.hostelBlock) setUserHostelBlock(d.user.hostelBlock)
      })
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

    // Fetch weekly check-in history
    fetch('/api/checkin/history?days=7')
      .then(r => r.json())
      .then(d => {
        if (d.history) setWeeklyHistory(d.history)
        if (d.summary) setWeeklyPercentage(d.summary.percentage)
      })
      .catch(() => {})

    // Fetch admin-configured meal timings (public endpoint)
    fetch('/api/meal-timings')
      .then(r => r.json())
      .then(d => {
        if (d.timings) setMealTimings(d.timings as Record<string, MealTimingConfig>)
      })
      .catch(() => {})

    // Fetch community ratings for today
    fetch('/api/reviews/community')
      .then(r => r.json())
      .then(d => {
        if (d.ratings) setCommunityRatings(d.ratings)
      })
      .catch(() => {})

    // Fetch announcements
    fetch('/api/admin/announcements')
      .then(r => r.json())
      .then(d => {
        if (d.announcements) setAnnouncements(d.announcements)
      })
      .catch(() => {})
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
      // Use hours + minutes from API for precise meal window checks
      if (typeof data.hours === 'number') {
        setServerHour(data.hours)
        setServerMinute(typeof data.minutes === 'number' ? data.minutes : 0)
      } else if (data.timestamp) {
        const d = new Date(data.timestamp)
        const istH = parseInt(
          d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }),
          10
        )
        const istM = parseInt(
          d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', minute: 'numeric' }),
          10
        )
        setServerHour(isNaN(istH) ? new Date().getHours() : istH)
        setServerMinute(isNaN(istM) ? new Date().getMinutes() : istM)
      }
    } catch {
      // Fallback to client time
      const now = new Date()
      setTodayDate(now.toISOString().split('T')[0])
      setServerHour(now.getHours())
      setServerMinute(now.getMinutes())
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
        const menuUrl = userHostelBlock
          ? `/api/menu/today?hostelBlock=${encodeURIComponent(userHostelBlock)}`
          : '/api/menu/today'
        const [menuRes, reviewRes] = await Promise.all([
          fetch(menuUrl),
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
  }, [todayDate, userHostelBlock, initReviewState])

  /** Pull-to-refresh: reload all dashboard data */
  const refreshAll = useCallback(async () => {
    await fetchServerTime()
    // Re-fetch checkin status
    try {
      const res = await fetch('/api/checkin')
      const d = await res.json()
      if (d.checkins && d.currentMeal) {
        const current = d.checkins.find((c: { meal_type: string }) => c.meal_type === d.currentMeal)
        setCheckinStatus({ checkedIn: !!current, mealType: d.currentMeal, mealLabel: d.currentMealLabel })
      }
    } catch { /* ignore */ }
    // Re-fetch weekly history
    try {
      const histRes = await fetch('/api/checkin/history?days=7')
      const histData = await histRes.json()
      if (histData.history) setWeeklyHistory(histData.history)
      if (histData.summary) setWeeklyPercentage(histData.summary.percentage)
    } catch { /* ignore */ }
    // Re-fetch meal timings (admin may have changed them)
    try {
      const timRes = await fetch('/api/meal-timings')
      const timData = await timRes.json()
      if (timData.timings) setMealTimings(timData.timings as Record<string, MealTimingConfig>)
    } catch { /* ignore */ }
    // Re-fetch community ratings
    try {
      const crRes = await fetch('/api/reviews/community')
      const crData = await crRes.json()
      if (crData.ratings) setCommunityRatings(crData.ratings)
    } catch { /* ignore */ }
    // Menu + reviews will reload via todayDate change
    toast.success('Dashboard refreshed')
  }, [fetchServerTime])

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
        hapticSuccess()
        // Close the bottom sheet and show success animation
        setActiveSheet(null)
        setReviewSuccess({ show: true, rating: review.rating, meal: MEAL_LABELS_I18N[mealType] || mealType })
        // Refresh community ratings after submission
        fetch('/api/reviews/community')
          .then(r => r.json())
          .then(d => {
            if (d.ratings) setCommunityRatings(d.ratings)
          })
          .catch(() => {})
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to submit review')
        hapticError()
        setReviews((prev) => ({
          ...prev,
          [mealType]: { ...prev[mealType], submitting: false },
        }))
      }
    } catch {
      toast.error('Network error. Please try again.')
      hapticError()
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
    const base = serverHour < 12 ? t.student.goodMorning : serverHour < 17 ? t.student.goodAfternoon : t.student.goodEvening
    return userName ? `${base}, ${userName}` : base
  }

  return (
    <PullToRefresh onRefresh={refreshAll}>
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
            {t.student.readyToRate}
          </p>
        </BlurFade>
      </section>

      {/* Announcements */}
      {announcements.length > 0 && (
        <BlurFade delay={0.32} inView>
          <div className="space-y-2 mb-6">
            {announcements.slice(0, 3).map((a) => (
              <HeroPill
                key={a.id}
                label={a.title}
                announcement={a.priority === 'urgent' ? '🚨 Urgent' : '📣 Notice'}
                onClick={() => toast.info(a.body, { duration: 6000 })}
              />
            ))}
          </div>
        </BlurFade>
      )}



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
                    ? `${t.student.checkedInFor} ${checkinStatus.mealLabel || 'meal'}`
                    : checkinStatus?.mealType
                      ? `${t.student.checkInFor} ${checkinStatus.mealLabel || 'meal'}`
                      : t.student.mealCheckin
                  }
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {checkinStatus?.checkedIn
                    ? t.student.allSet
                    : t.student.scanQR
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

      {/* Weekly Check-in History */}
      {weeklyHistory && weeklyHistory.length > 0 && (
        <BlurFade delay={0.38} inView>
          <Card className="mb-6 rounded-xl">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faCalendarCheck} className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">{t.student.thisWeek}</span>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  {weeklyPercentage}% {t.student.attended}
                </Badge>
              </div>
              <div className="flex gap-1.5">
                {weeklyHistory.slice().reverse().map((day) => {
                  const d = new Date(day.date + 'T00:00:00')
                  const dayLabel = d.toLocaleDateString('en-US', { weekday: 'narrow' })
                  const mealCount = day.meals.length
                  return (
                    <div key={day.date} className="flex-1 text-center">
                      <p className="text-[10px] text-muted-foreground mb-1">{dayLabel}</p>
                      <div className="flex flex-col gap-0.5">
                        {['breakfast', 'lunch', 'snacks', 'dinner'].map((meal) => (
                          <div
                            key={meal}
                            className={`h-2 rounded-full transition-colors ${
                              day.meals.includes(meal)
                                ? 'bg-green-500 dark:bg-green-400'
                                : 'bg-muted'
                            }`}
                            title={`${meal}: ${day.meals.includes(meal) ? 'attended' : 'missed'}`}
                          />
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 font-medium">{mealCount}/4</p>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> {t.student.attended}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted inline-block" /> {t.student.missed}</span>
              </div>
            </CardContent>
          </Card>
        </BlurFade>
      )}

      {/* Title */}
      <BlurFade delay={0.4} inView>
        <div className="mb-6">
          <h1 className="text-2xl font-black text-foreground tracking-tight leading-none">
            {t.student.todaysMenu}
          </h1>
          <p className="text-muted-foreground text-base font-medium mt-1 tracking-wide">
            {displayDate}
          </p>
        </div>
      </BlurFade>

      {/* Meal Cards — compact, tap to open review sheet */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MEAL_ORDER.map((mealType, index) => {
          const menu = getMenuForMeal(mealType)
          const review = reviews[mealType]
          const items = menu?.items || DEFAULT_ITEMS_I18N[mealType]
          const mealTiming = mealTimings?.[mealType]
          const timing = mealTiming?.display || menu?.timing || ''
          const isSubmitted = review?.submitted
          const isOpen = isMealOpen(mealTiming, serverHour, serverMinute)

          return (
            <BlurFade key={mealType} delay={0.15 + index * 0.1} inView>
              <Card
                className={`rounded-xl transition-all duration-300 cursor-pointer active:scale-[0.98] ${isSubmitted
                  ? 'border-green-200 dark:border-green-500/20'
                  : !isOpen
                    ? 'opacity-80 border-muted'
                    : 'hover:border-primary/30 dark:hover:border-primary/20 hover:shadow-md'
                  }`}
                onClick={() => {
                  if (isOpen && !isSubmitted) {
                    hapticLight()
                    setActiveSheet(mealType)
                  }
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    {/* Lock/unlock icon */}
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isSubmitted
                        ? 'bg-green-100 dark:bg-green-500/10'
                        : isOpen
                          ? 'bg-green-100 dark:bg-green-500/10'
                          : 'bg-muted'
                    }`}>
                      <FontAwesomeIcon
                        icon={isSubmitted ? faCircleCheck : isOpen ? faLockOpen : faLock}
                        className={`w-4 h-4 ${
                          isSubmitted
                            ? 'text-green-600 dark:text-green-400'
                            : isOpen
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-muted-foreground'
                        }`}
                      />
                    </div>

                    {/* Meal info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-foreground tracking-tight">
                          {MEAL_LABELS_I18N[mealType]}
                        </h2>
                        {menu?.specialLabel && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-500/15 dark:to-orange-500/15 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
                            <FontAwesomeIcon icon={faCrown} className="w-2 h-2" />
                            {menu.specialLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{timing}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{items}</p>
                    </div>

                    {/* Right side badge/action */}
                    {isSubmitted ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <FontAwesomeIcon icon={faStar} key={star}
                              className={`w-2.5 h-2.5 ${star <= (review?.existingRating || 0) ? 'text-primary' : 'text-zinc-200 dark:text-zinc-700'}`}
                            />
                          ))}
                        </div>
                        <span className="text-lg">{['😡', '🙁', '😐', '🙂', '😍'][(review?.existingRating || 1) - 1]}</span>
                      </div>
                    ) : isOpen ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full text-xs px-3 h-7 shrink-0 border-primary/30 text-primary font-semibold"
                        onClick={(e) => {
                          e.stopPropagation()
                          hapticLight()
                          setActiveSheet(mealType)
                        }}
                      >
                        Rate
                      </Button>
                    ) : (
                      <Badge variant="secondary" className="text-[9px] shrink-0">
                        <FontAwesomeIcon icon={faLock} className="w-2.5 h-2.5 mr-0.5" />
                        {t.student.locked}
                      </Badge>
                    )}
                  </div>

                  {/* Community Poll — revealed only after you rate this meal */}
                  {isSubmitted && communityRatings[mealType] && communityRatings[mealType].count > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      className="mt-3 pt-3 border-t border-border/40"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-semibold text-muted-foreground tracking-wide flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faUsers} className="w-3 h-3" />
                          Student Poll
                        </span>
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {communityRatings[mealType].count} {communityRatings[mealType].count === 1 ? 'vote' : 'votes'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <div className="flex-1 h-2 rounded-full bg-muted/80 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(communityRatings[mealType].avg / 5) * 100}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.15 }}
                            className={`h-full rounded-full ${
                              communityRatings[mealType].avg >= 4
                                ? 'bg-gradient-to-r from-green-400 to-green-500'
                                : communityRatings[mealType].avg >= 3
                                  ? 'bg-gradient-to-r from-primary/70 to-primary'
                                  : 'bg-gradient-to-r from-orange-400 to-red-400'
                            }`}
                          />
                        </div>
                        <span className="text-xs font-bold text-primary min-w-[36px] text-right">
                          {communityRatings[mealType].avg.toFixed(1)}★
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        You rated {review?.existingRating}★ · Hostel avg {communityRatings[mealType].avg.toFixed(1)}★
                      </p>
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </BlurFade>
          )
        })}
      </div>

      {/* ── Bottom Sheet Review Modal ── */}
      {MEAL_ORDER.map((mealType) => {
        const review = reviews[mealType]
        const menu = getMenuForMeal(mealType)
        const items = menu?.items || DEFAULT_ITEMS_I18N[mealType]
        const mealTiming = mealTimings?.[mealType]
        const timing = mealTiming?.display || menu?.timing || ''

        return (
          <BottomSheet
            key={mealType}
            open={activeSheet === mealType}
            onClose={() => setActiveSheet(null)}
            title={`${MEAL_LABELS_I18N[mealType]} — Rate & Review`}
          >
            <div className="space-y-5">
              {/* Menu preview */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.02, duration: 0.25 }}
                className="p-3 rounded-xl bg-muted/50"
              >
                <p className="text-xs text-muted-foreground font-medium mb-1">{timing}</p>
                <p className="text-sm text-foreground leading-relaxed">{items}</p>
              </motion.div>

              {/* Rating Slider */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05, duration: 0.3 }}
                className="space-y-3"
              >
                <Label className="text-xs text-muted-foreground font-medium">{t.student.rateExperience}</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[(review?.rating || 0) === 0 ? 3 : review!.rating]}
                    onValueChange={(val: number[]) => {
                      hapticLight()
                      setRating(mealType, val[0])
                    }}
                    min={1}
                    max={5}
                    step={1}
                    showTooltip
                    tooltipContent={(value: number) => t.student.ratingLabels[value - 1]}
                    aria-label="Rate your experience"
                    className="flex-1"
                  />
                  <span className="text-4xl min-w-[48px] text-center">
                    {(review?.rating || 0) > 0
                      ? ['😡', '🙁', '😐', '🙂', '😍'][review!.rating - 1]
                      : <span className="opacity-50 grayscale">😐</span>
                    }
                  </span>
                </div>
              </motion.div>

              {/* Feedback Tags */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.25 }}
                className="space-y-2"
              >
                <Label className="text-xs text-muted-foreground font-medium">Quick feedback</Label>
                <div className="flex flex-wrap gap-2">
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
                          onClick={() => {
                            hapticLight()
                            toggleTag(mealType, tag)
                          }}
                          className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all duration-150 ${isSelected
                            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                            : 'bg-background text-muted-foreground border-border hover:border-primary/40'
                          }`}
                        >
                          {tag}
                        </motion.button>
                      )
                    })}
                  </AnimatePresence>
                </div>
              </motion.div>

              {/* Review Text */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, duration: 0.25 }}
                className="space-y-2"
              >
                <Label className="text-xs text-muted-foreground font-medium">{t.student.anythingToAdd}</Label>
                <Input
                  type="text"
                  value={review?.reviewText || ''}
                  onChange={(e) => setReviewText(mealType, e.target.value)}
                  placeholder="Optional comment..."
                  className="h-11 text-sm"
                />
                {/* Voice-to-text input */}
                <AIVoiceInput
                  onTranscript={(text) => {
                    const current = review?.reviewText || ''
                    setReviewText(mealType, current ? `${current} ${text}` : text)
                  }}
                  visualizerBars={32}
                  className="pt-0"
                />
              </motion.div>

              {/* Submit button */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16, duration: 0.25 }}
              >
              <Button
                onClick={() => {
                  submitReview(mealType)
                }}
                disabled={!review || review.submitting}
                className="w-full h-12 rounded-xl text-sm font-semibold"
              >
                {review?.submitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <FontAwesomeIcon icon={faArrowRight} className="w-4 h-4 mr-2" />
                    Submit Review
                  </>
                )}
              </Button>
              </motion.div>
            </div>
          </BottomSheet>
        )
      })}

      <div className="h-8" />

      {/* Floating QR FAB — always visible on mobile for quick check-in */}
      {checkinStatus && !checkinStatus.checkedIn && (
        <Link href="/student/scan" className="fixed bottom-28 right-6 z-20 lg:hidden">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.5 }}
            className="w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center"
          >
            <FontAwesomeIcon icon={faQrcode} className="w-6 h-6" />
          </motion.div>
        </Link>
      )}

      {/* Review Success Animation Overlay */}
      <ReviewSuccess
        show={reviewSuccess.show}
        rating={reviewSuccess.rating}
        mealLabel={reviewSuccess.meal}
        onComplete={() => setReviewSuccess({ show: false, rating: 0, meal: '' })}
      />
    </div>
    </PullToRefresh>
  )
}
