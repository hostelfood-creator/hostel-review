'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBuilding, faPencil, faCheck, faXmark, faRotateLeft,
  faUtensils, faShieldHalved, faClockRotateLeft, faArrowRight,
  faCalendarDay
} from '@fortawesome/free-solid-svg-icons'

// ── Types ─────────────────────────────────────────────────

interface MealCount {
  meal: string
  actualCount: number
  displayCount: number
  hasOverride: boolean
  overrideId: string | null
  reason: string | null
}

interface BlockData {
  blockId: string
  blockName: string
  meals: MealCount[]
  totalActual: number
  totalDisplay: number
}

interface AuditLog {
  id: string
  actor_id: string
  actor_email: string | null
  actor_role: string
  action: string
  target_type: string
  target_id: string | null
  details: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

// ── Constants ─────────────────────────────────────────────

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snacks: 'Snacks',
  dinner: 'Dinner',
}

const MEAL_COLORS: Record<string, string> = {
  breakfast: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  lunch: 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400',
  snacks: 'bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400',
  dinner: 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400',
}

const ACTION_LABELS: Record<string, string> = {
  user_deactivate: 'User Deactivated',
  user_reactivate: 'User Reactivated',
  user_promote_admin: 'Promoted to Admin',
  user_demote_student: 'Demoted to Student',
  menu_upsert: 'Menu Updated',
  menu_copy_all: 'Menu Copied to All',
  complaint_update: 'Complaint Updated',
  review_reply: 'Review Replied',
  announcement_create: 'Announcement Created',
  announcement_delete: 'Announcement Deleted',
  maintenance_toggle: 'Maintenance Toggled',
  meal_timings_update: 'Meal Timings Updated',
  checkin_count_override: 'Check-in Count Edited',
  checkin_count_override_removed: 'Check-in Override Removed',
  super_add_block: 'Block Added',
  super_remove_block: 'Block Removed',
  super_add_admin: 'Admin Created',
  super_remove_admin: 'Admin Removed',
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

// ── Component ─────────────────────────────────────────────

export default function SuperAdminControlPage() {
  const [blocks, setBlocks] = useState<BlockData[]>([])
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(true)
  const [selectedDate, setSelectedDate] = useState(() => {
    // Default to today in IST
    const now = new Date()
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    return ist.toISOString().split('T')[0]
  })

  // Edit state: track which cell is being edited
  const [editingCell, setEditingCell] = useState<{ block: string; meal: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editReason, setEditReason] = useState('')
  const [saving, setSaving] = useState(false)

  // Admin actions state
  const [adminActions, setAdminActions] = useState<AuditLog[]>([])
  const [actionsLoading, setActionsLoading] = useState(true)

  // ── Data Loading ────────────────────────────────────────

  const loadBlockData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/checkin-overrides?date=${selectedDate}`)
      if (res.status === 403 || res.status === 401) {
        setIsSuperAdmin(false)
        return
      }
      if (res.ok) {
        const data = await res.json()
        setBlocks(data.blocks || [])
      } else {
        toast.error('Failed to load block data')
      }
    } catch {
      toast.error('Network error loading block data')
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  const loadAdminActions = useCallback(async () => {
    setActionsLoading(true)
    try {
      const res = await fetch('/api/admin/audit-logs?pageSize=20')
      if (res.ok) {
        const data = await res.json()
        setAdminActions(data.logs || [])
      }
    } catch {
      // silent — audit logs are secondary info
    } finally {
      setActionsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBlockData()
  }, [loadBlockData])

  useEffect(() => {
    loadAdminActions()
  }, [loadAdminActions])

  // ── Handlers ────────────────────────────────────────────

  const startEdit = (block: string, meal: string, currentCount: number) => {
    setEditingCell({ block, meal })
    setEditValue(currentCount.toString())
    setEditReason('')
  }

  const cancelEdit = () => {
    setEditingCell(null)
    setEditValue('')
    setEditReason('')
  }

  const saveOverride = async (blockName: string, meal: string, actualCount: number) => {
    const count = parseInt(editValue, 10)
    if (isNaN(count) || count < 0) {
      toast.error('Please enter a valid non-negative number')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/checkin-overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          mealType: meal,
          hostelBlock: blockName,
          overrideCount: count,
          originalCount: actualCount,
          reason: editReason.trim() || null,
        }),
      })

      if (res.ok) {
        toast.success(`Check-in count updated to ${count} for ${MEAL_LABELS[meal]} in ${blockName}`)
        cancelEdit()
        loadBlockData()
        loadAdminActions() // Refresh actions to show the new override
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to save override')
      }
    } catch {
      toast.error('Network error saving override')
    } finally {
      setSaving(false)
    }
  }

  const removeOverride = async (overrideId: string, blockName: string, meal: string) => {
    try {
      const res = await fetch('/api/admin/checkin-overrides', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: overrideId,
          date: selectedDate,
          mealType: meal,
          hostelBlock: blockName,
        }),
      })

      if (res.ok) {
        toast.success(`Override removed — reverted to actual count`)
        loadBlockData()
        loadAdminActions()
      } else {
        toast.error('Failed to remove override')
      }
    } catch {
      toast.error('Network error')
    }
  }

  // ── Render ──────────────────────────────────────────────

  if (loading && blocks.length === 0) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center text-center gap-4 p-6">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <FontAwesomeIcon icon={faBuilding} className="w-8 h-8 text-destructive" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Access Restricted</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            This section is only accessible to Super Admins.
          </p>
        </div>
      </div>
    )
  }

  // Grand totals across all blocks
  const grandTotalActual = blocks.reduce((s, b) => s + b.totalActual, 0)
  const grandTotalDisplay = blocks.reduce((s, b) => s + b.totalDisplay, 0)
  const totalOverrides = blocks.reduce(
    (s, b) => s + b.meals.filter((m) => m.hasOverride).length,
    0
  )

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FontAwesomeIcon icon={faShieldHalved} className="w-6 h-6 text-primary" />
            Block Control Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage check-in counts across all hostel blocks. Edit counts to correct records.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faCalendarDay} className="w-4 h-4 text-muted-foreground" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Total Blocks</p>
            <p className="text-2xl font-bold text-foreground">{blocks.length}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Total Check-ins</p>
            <p className="text-2xl font-bold text-foreground">{grandTotalDisplay}</p>
            {grandTotalDisplay !== grandTotalActual && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Actual: {grandTotalActual}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Active Overrides</p>
            <p className="text-2xl font-bold text-foreground">{totalOverrides}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Date</p>
            <p className="text-lg font-bold text-foreground">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Block Cards with Editable Check-in Counts */}
      {blocks.length === 0 ? (
        <Card className="rounded-xl">
          <CardContent className="py-12 text-center">
            <FontAwesomeIcon icon={faBuilding} className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No hostel blocks configured. Add blocks from the Block Management page.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {blocks.map((block) => (
            <Card key={block.blockId} className="rounded-xl overflow-hidden">
              <CardHeader className="pb-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <FontAwesomeIcon icon={faBuilding} className="w-4 h-4 text-primary" />
                      {block.blockName}
                    </CardTitle>
                    <CardDescription className="mt-0.5">
                      Total: <span className="font-semibold text-foreground">{block.totalDisplay}</span>
                      {block.totalDisplay !== block.totalActual && (
                        <span className="text-muted-foreground ml-1">(actual: {block.totalActual})</span>
                      )}
                    </CardDescription>
                  </div>
                  {block.meals.some((m) => m.hasOverride) && (
                    <Badge variant="secondary" className="text-[10px] font-medium">
                      {block.meals.filter((m) => m.hasOverride).length} override{block.meals.filter((m) => m.hasOverride).length > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {block.meals.map((meal) => {
                    const isEditing =
                      editingCell?.block === block.blockName &&
                      editingCell?.meal === meal.meal
                    return (
                      <div
                        key={meal.meal}
                        className={`p-4 transition-colors ${isEditing ? 'bg-primary/5' : 'hover:bg-muted/30'}`}
                      >
                        <div className="flex items-center justify-between">
                          {/* Meal label */}
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-1 rounded-md text-xs font-semibold ${MEAL_COLORS[meal.meal]}`}>
                              {MEAL_LABELS[meal.meal]}
                            </span>
                          </div>

                          {/* Count display / edit */}
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min="0"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="w-24 h-8 text-sm text-right"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveOverride(block.blockName, meal.meal, meal.actualCount)
                                  if (e.key === 'Escape') cancelEdit()
                                }}
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-green-600 hover:bg-green-100 dark:hover:bg-green-500/10"
                                onClick={() => saveOverride(block.blockName, meal.meal, meal.actualCount)}
                                disabled={saving}
                              >
                                <FontAwesomeIcon icon={faCheck} className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-muted-foreground hover:bg-muted"
                                onClick={cancelEdit}
                              >
                                <FontAwesomeIcon icon={faXmark} className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <span className="text-xl font-bold text-foreground">
                                  {meal.displayCount}
                                </span>
                                {meal.hasOverride && (
                                  <span className="text-xs text-muted-foreground ml-1.5">
                                    (was {meal.actualCount})
                                  </span>
                                )}
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                onClick={() => startEdit(block.blockName, meal.meal, meal.displayCount)}
                                title="Edit check-in count"
                              >
                                <FontAwesomeIcon icon={faPencil} className="w-3.5 h-3.5" />
                              </Button>
                              {meal.hasOverride && meal.overrideId && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-500/10"
                                  onClick={() => removeOverride(meal.overrideId!, block.blockName, meal.meal)}
                                  title="Revert to actual count"
                                >
                                  <FontAwesomeIcon icon={faRotateLeft} className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Edit reason input (shown when editing) */}
                        {isEditing && (
                          <div className="mt-2">
                            <Input
                              placeholder="Reason for change (optional)"
                              value={editReason}
                              onChange={(e) => setEditReason(e.target.value)}
                              className="h-8 text-xs"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveOverride(block.blockName, meal.meal, meal.actualCount)
                              }}
                            />
                          </div>
                        )}

                        {/* Override badge with reason */}
                        {!isEditing && meal.hasOverride && meal.reason && (
                          <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                            <FontAwesomeIcon icon={faPencil} className="w-2.5 h-2.5" />
                            {meal.reason}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Admin Actions / Audit Trail ── */}
      <Card className="rounded-xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faClockRotateLeft} className="w-4 h-4 text-primary" />
              Recent Admin Actions
            </CardTitle>
            <a href="/admin/audit" className="text-xs text-primary hover:underline flex items-center gap-1">
              View All <FontAwesomeIcon icon={faArrowRight} className="w-3 h-3" />
            </a>
          </div>
          <CardDescription>
            Individual admin actions across all blocks — visible only to Super Admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {actionsLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : adminActions.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No admin actions recorded yet.
            </div>
          ) : (
            <div className="divide-y max-h-[500px] overflow-y-auto">
              {adminActions.map((action) => {
                const label = ACTION_LABELS[action.action] || action.action.replace(/_/g, ' ')
                const details = action.details || {}
                const blockInfo = (details.hostelBlock as string) || (details.hostel_block as string) || null
                return (
                  <div key={action.id} className="p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{label}</span>
                          <Badge
                            variant={action.actor_role === 'super_admin' ? 'default' : 'secondary'}
                            className="text-[9px] font-medium"
                          >
                            {action.actor_role === 'super_admin' ? 'Super Admin' : 'Admin'}
                          </Badge>
                          {blockInfo && (
                            <Badge variant="outline" className="text-[9px]">
                              {blockInfo}
                            </Badge>
                          )}
                        </div>
                        {/* Action details */}
                        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2">
                          {action.actor_email && (
                            <span>{action.actor_email}</span>
                          )}
                          {action.target_id && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-[10px]">{action.target_id}</span>
                            </>
                          )}
                        </div>
                        {/* Show override details for checkin edits */}
                        {action.action === 'checkin_count_override' && details.originalCount !== undefined && (
                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                            <FontAwesomeIcon icon={faUtensils} className="w-3 h-3" />
                            <span className="capitalize">{details.mealType as string}</span>
                            <span>:</span>
                            <span className="line-through text-red-400">{String(details.originalCount)}</span>
                            <FontAwesomeIcon icon={faArrowRight} className="w-2.5 h-2.5" />
                            <span className="font-semibold text-green-600 dark:text-green-400">{String(details.overrideCount)}</span>
                            {details.reason && (
                              <span className="italic ml-1">&mdash; {details.reason as string}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                        {timeAgo(action.created_at)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
