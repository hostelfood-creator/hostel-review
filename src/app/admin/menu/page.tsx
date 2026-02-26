'use client'

import { useEffect, useState, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPencil, faCalendarWeek, faCheck } from '@fortawesome/free-solid-svg-icons'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

interface MenuData {
  id: string
  date: string
  mealType: string
  items: string
  timing: string
}

const MEAL_ORDER = ['breakfast', 'lunch', 'snacks', 'dinner']
const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snacks: 'Snacks',
  dinner: 'Dinner',
}

const DEFAULT_TIMINGS: Record<string, string> = {
  breakfast: '7:30 - 9:30 AM',
  lunch: '12:30 - 2:30 PM',
  snacks: '4:30 - 5:30 PM',
  dinner: '7:30 - 9:30 PM',
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Get IST date string YYYY-MM-DD using Intl API (avoids UTC shift) */
function toISTDateStr(d: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })
  return formatter.format(d) // en-CA = YYYY-MM-DD
}

/** Get dates for the current week (Mon-Sun) using IST */
function getWeekDates(): { label: string; date: string; isToday: boolean }[] {
  const now = new Date()
  const todayStr = toISTDateStr(now)
  const day = now.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayOffset)

  return DAYS.map((label, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const dateStr = toISTDateStr(d)
    const isToday = dateStr === todayStr
    return { label, date: dateStr, isToday }
  })
}

export default function AdminMenuPage() {
  const weekDates = getWeekDates()
  const todayIndex = weekDates.findIndex((d) => d.isToday)
  const [activeDay, setActiveDay] = useState(todayIndex >= 0 ? todayIndex : 0)
  const [menus, setMenus] = useState<MenuData[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ items: '', timing: '' })
  const [saving, setSaving] = useState(false)

  const selectedDate = weekDates[activeDay].date

  const loadMenus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/menu?date=${selectedDate}`)
      const data = await res.json()
      setMenus(data.menus || [])
    } catch (err) {
      console.error('Failed to load menus:', err)
      toast.error('Failed to load menus')
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  useEffect(() => {
    loadMenus()
  }, [loadMenus])

  const getMenuForMeal = (meal: string) => {
    return menus.find((m) => m.mealType === meal)
  }

  const startEdit = (meal: string) => {
    const existing = getMenuForMeal(meal)
    setEditForm({
      items: existing?.items || '',
      timing: existing?.timing || DEFAULT_TIMINGS[meal] || '',
    })
    setEditing(meal)
  }

  const saveMenu = async (meal: string) => {
    if (!editForm.items.trim()) {
      toast.error('Menu items cannot be empty')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          mealType: meal,
          items: editForm.items.trim(),
          timing: editForm.timing.trim() || DEFAULT_TIMINGS[meal],
        }),
      })
      if (res.ok) {
        setEditing(null)
        loadMenus()
        toast.success(`${MEAL_LABELS[meal]} menu saved for ${weekDates[activeDay].label}`)
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to save menu')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <FontAwesomeIcon icon={faCalendarWeek} className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground tracking-tight">Weekly Menu</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Set menus for each day. Students see the menu for the current day automatically.
        </p>
      </div>

      {/* Day Tabs */}
      <div className="flex gap-1.5 mb-6 overflow-x-auto no-scrollbar pb-1">
        {weekDates.map((day, i) => {
          const isActive = activeDay === i
          const hasMenus = false // We'd need to check per day but keeping it simple
          void hasMenus
          return (
            <button
              key={day.date}
              onClick={() => { setActiveDay(i); setEditing(null) }}
              className={`flex flex-col items-center px-3 py-2 rounded-xl text-xs font-semibold transition-all min-w-[56px] ${isActive
                  ? 'bg-foreground text-background shadow-md'
                  : day.isToday
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
            >
              <span className="text-[10px] uppercase tracking-wider">{day.label}</span>
              <span className="text-sm mt-0.5">{formatDate(day.date)}</span>
              {day.isToday && !isActive && (
                <span className="w-1 h-1 bg-primary rounded-full mt-1" />
              )}
            </button>
          )
        })}
      </div>

      {/* Meal Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="rounded-xl">
              <CardContent className="p-5 space-y-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MEAL_ORDER.map((meal) => {
            const menu = getMenuForMeal(meal)
            const isEditing = editing === meal

            return (
              <Card key={meal} className={`rounded-xl transition-all ${menu ? 'border-green-200 dark:border-green-500/20' : ''}`}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {menu && (
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                      )}
                      <div>
                        <h3 className="text-sm font-bold text-foreground">
                          {MEAL_LABELS[meal]}
                        </h3>
                        <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                          {menu?.timing || DEFAULT_TIMINGS[meal]}
                        </p>
                      </div>
                    </div>
                    {!isEditing && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEdit(meal)}
                        className="text-muted-foreground hover:text-primary"
                      >
                        <FontAwesomeIcon icon={faPencil} className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-[10px] uppercase tracking-wider font-medium">
                          Menu Items
                        </Label>
                        <Textarea
                          value={editForm.items}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, items: e.target.value }))
                          }
                          rows={3}
                          placeholder="e.g. Rice, Dal, Chapati, Mixed Veg"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase tracking-wider font-medium">
                          Timing
                        </Label>
                        <Input
                          type="text"
                          value={editForm.timing}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, timing: e.target.value }))
                          }
                          placeholder={DEFAULT_TIMINGS[meal]}
                          className="mt-1"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => saveMenu(meal)}
                          disabled={saving}
                          className="flex-1 bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                        >
                          <FontAwesomeIcon icon={faCheck} className="w-3.5 h-3.5 mr-1.5" />
                          {saving ? 'Saving...' : 'Save'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setEditing(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {menu ? (
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {menu.items}
                        </p>
                      ) : (
                        <div className="py-4 text-center">
                          <p className="text-xs text-muted-foreground">Menu not set for {weekDates[activeDay].label}</p>
                          <Button
                            variant="link"
                            size="sm"
                            onClick={() => startEdit(meal)}
                            className="mt-2 text-xs"
                          >
                            + Add Menu
                          </Button>
                        </div>
                      )}
                    </div>
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