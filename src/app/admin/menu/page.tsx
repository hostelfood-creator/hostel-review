'use client'

import { useEffect, useState, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPencil, faCalendarWeek, faCheck, faStar, faBuilding, faCopy } from '@fortawesome/free-solid-svg-icons'
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
  specialLabel?: string | null
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

const SPECIAL_LABELS = [
  'Festival Special',
  'Guest Day',
  'Pongal Special',
  'Diwali Feast',
  'Onam Special',
  'Republic Day',
  'Independence Day',
  'Christmas Special',
  'Eid Special',
  'Exam Special',
]

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
  const [editForm, setEditForm] = useState({ items: '', timing: '', specialLabel: '' })
  const [saving, setSaving] = useState(false)

  // Hostel block state
  const [userRole, setUserRole] = useState<'admin' | 'super_admin'>('admin')
  const [userHostelBlock, setUserHostelBlock] = useState<string>('')
  const [selectedBlock, setSelectedBlock] = useState<string>('')
  const [allBlocks, setAllBlocks] = useState<string[]>([])
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [copyingToAll, setCopyingToAll] = useState(false)

  const selectedDate = weekDates[activeDay].date

  // Load user profile and hostel blocks on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const [meRes, blocksRes] = await Promise.all([
          fetch('/api/auth/me'),
          fetch('/api/blocks'),
        ])
        const meData = await meRes.json()
        const blocksData = await blocksRes.json()

        const role = meData.user?.role === 'super_admin' ? 'super_admin' : 'admin'
        const block = meData.user?.hostelBlock || ''

        setUserRole(role)
        setUserHostelBlock(block)

        const blocks = (blocksData.blocks || []).map((b: { name: string }) => b.name)
        setAllBlocks(blocks)

        // Admin is locked to their block; super_admin defaults to first block
        setSelectedBlock(role === 'super_admin' ? (blocks[0] || block) : block)
        setProfileLoaded(true)
      } catch {
        toast.error('Failed to load profile')
      }
    }
    loadProfile()
  }, [])

  const loadMenus = useCallback(async () => {
    if (!selectedBlock) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/menu?date=${selectedDate}&hostelBlock=${encodeURIComponent(selectedBlock)}`)
      const data = await res.json()
      setMenus(data.menus || [])
    } catch (err) {
      console.error('Failed to load menus:', err)
      toast.error('Failed to load menus')
    } finally {
      setLoading(false)
    }
  }, [selectedDate, selectedBlock])

  useEffect(() => {
    if (profileLoaded) loadMenus()
  }, [loadMenus, profileLoaded])

  const getMenuForMeal = (meal: string) => {
    return menus.find((m) => m.mealType === meal)
  }

  const startEdit = (meal: string) => {
    const existing = getMenuForMeal(meal)
    setEditForm({
      items: existing?.items || '',
      timing: existing?.timing || DEFAULT_TIMINGS[meal] || '',
      specialLabel: existing?.specialLabel || '',
    })
    setEditing(meal)
  }

  const saveMenu = async (meal: string) => {
    if (!editForm.items.trim()) {
      toast.error('Menu items cannot be empty')
      return
    }
    if (!selectedBlock) {
      toast.error('No hostel block selected')
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
          specialLabel: editForm.specialLabel.trim() || null,
          hostelBlock: selectedBlock,
        }),
      })
      if (res.ok) {
        setEditing(null)
        loadMenus()
        toast.success(`${MEAL_LABELS[meal]} menu saved for ${weekDates[activeDay].label} (${selectedBlock})`)
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

  const copyToAllHostels = async () => {
    if (!selectedBlock || menus.length === 0) {
      toast.error('No menus to copy. Save menus first.')
      return
    }
    setCopyingToAll(true)
    try {
      // Save each meal with copyToAll flag
      let successCount = 0
      for (const menu of menus) {
        const res = await fetch('/api/admin/menu', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: menu.date,
            mealType: menu.mealType,
            items: menu.items,
            timing: menu.timing,
            specialLabel: menu.specialLabel || null,
            hostelBlock: selectedBlock,
            copyToAll: true,
          }),
        })
        if (res.ok) successCount++
      }
      toast.success(`Copied ${successCount} meal(s) to all hostels for ${weekDates[activeDay].label}`)
    } catch {
      toast.error('Failed to copy menus')
    } finally {
      setCopyingToAll(false)
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
          Set menus for each day. Students see the menu for their hostel automatically.
        </p>
      </div>

      {/* Hostel Block Selector */}
      <div className="mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faBuilding} className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Hostel:</span>
          </div>
          {userRole === 'super_admin' && allBlocks.length > 0 ? (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                {allBlocks.map((block) => (
                  <button
                    key={block}
                    onClick={() => { setSelectedBlock(block); setEditing(null) }}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                      selectedBlock === block
                        ? 'bg-foreground text-background shadow-md'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {block}
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={copyToAllHostels}
                disabled={copyingToAll || menus.length === 0}
                className="text-xs ml-2"
              >
                <FontAwesomeIcon icon={faCopy} className="w-3 h-3 mr-1" />
                {copyingToAll ? 'Copying...' : 'Apply to All Hostels'}
              </Button>
            </div>
          ) : (
            <span className="text-sm font-semibold text-primary bg-primary/10 px-3 py-1 rounded-lg">
              {userHostelBlock || 'Not assigned'}
            </span>
          )}
        </div>
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
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-foreground">
                            {MEAL_LABELS[meal]}
                          </h3>
                          {menu?.specialLabel && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
                              <FontAwesomeIcon icon={faStar} className="w-2.5 h-2.5" />
                              {menu.specialLabel}
                            </span>
                          )}
                        </div>
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
                      <div>
                        <Label className="text-[10px] uppercase tracking-wider font-medium">
                          Special Tag <span className="normal-case text-muted-foreground">(optional)</span>
                        </Label>
                        <div className="flex flex-wrap gap-1.5 mt-1.5 mb-1.5">
                          {SPECIAL_LABELS.map((label) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() =>
                                setEditForm((f) => ({
                                  ...f,
                                  specialLabel: f.specialLabel === label ? '' : label,
                                }))
                              }
                              className={`text-[10px] font-medium px-2 py-1 rounded-full border transition-all ${
                                editForm.specialLabel === label
                                  ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/30'
                                  : 'bg-background text-muted-foreground border-border hover:border-amber-300 hover:text-amber-600'
                              }`}
                            >
                              <FontAwesomeIcon icon={faStar} className="w-2.5 h-2.5 mr-0.5" />
                              {label}
                            </button>
                          ))}
                        </div>
                        <Input
                          type="text"
                          value={editForm.specialLabel}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, specialLabel: e.target.value }))
                          }
                          placeholder="Or type a custom label..."
                          className="mt-1"
                          maxLength={100}
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