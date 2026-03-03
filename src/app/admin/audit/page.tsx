'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faShieldHalved, faChevronLeft, faChevronRight, faChevronDown,
  faEye, faUserShield, faUtensils, faCommentDots, faBullhorn,
  faClock, faUsers, faWrench, faFileLines, faXmark
} from '@fortawesome/free-solid-svg-icons'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

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

/** Map action prefixes to icons and human labels */
const ACTION_META: Record<string, { icon: typeof faUserShield; label: string; color: string }> = {
  user_deactivate: { icon: faUsers, label: 'User Deactivated', color: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-500/10' },
  user_reactivate: { icon: faUsers, label: 'User Reactivated', color: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-500/10' },
  user_promote_admin: { icon: faUserShield, label: 'Promoted to Admin', color: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/10' },
  user_demote_student: { icon: faUsers, label: 'Demoted to Student', color: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/10' },
  menu_upsert: { icon: faUtensils, label: 'Menu Updated', color: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-500/10' },
  menu_copy_all: { icon: faUtensils, label: 'Menu Copied', color: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-500/10' },
  complaint_update: { icon: faCommentDots, label: 'Complaint Updated', color: 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/10' },
  review_reply: { icon: faCommentDots, label: 'Review Replied', color: 'text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-500/10' },
  survey_create: { icon: faFileLines, label: 'Survey Created', color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-500/10' },
  announcement_create: { icon: faBullhorn, label: 'Announcement Created', color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10' },
  announcement_delete: { icon: faBullhorn, label: 'Announcement Deleted', color: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-500/10' },
  maintenance_toggle: { icon: faWrench, label: 'Maintenance Toggled', color: 'text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-500/10' },
  meal_timings_update: { icon: faClock, label: 'Meal Timings Updated', color: 'text-teal-600 dark:text-teal-400 bg-teal-100 dark:bg-teal-500/10' },
  super_delete_user: { icon: faUsers, label: 'User Deleted', color: 'text-red-700 dark:text-red-300 bg-red-200 dark:bg-red-500/15' },
  super_reset_password: { icon: faUserShield, label: 'Password Reset', color: 'text-amber-700 dark:text-amber-300 bg-amber-200 dark:bg-amber-500/15' },
}

function getActionMeta(action: string) {
  if (ACTION_META[action]) return ACTION_META[action]
  // Try prefix match
  for (const [key, meta] of Object.entries(ACTION_META)) {
    if (action.startsWith(key.split('_')[0])) return meta
  }
  return { icon: faShieldHalved, label: action.replace(/_/g, ' '), color: 'text-muted-foreground bg-muted' }
}

/** Human-friendly relative time */
function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Full date-time display */
function fullDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

/** Unique action types for filter dropdown */
const ALL_ACTIONS = [
  'user_deactivate', 'user_reactivate', 'user_promote_admin', 'user_demote_student',
  'menu_upsert', 'menu_copy_all', 'complaint_update', 'review_reply',
  'survey_create', 'announcement_create', 'announcement_delete',
  'maintenance_toggle', 'meal_timings_update',
  'super_delete_user', 'super_reset_password',
]

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const pageSize = 25
  const totalPages = Math.ceil(total / pageSize)

  const loadLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (actionFilter) params.set('action', actionFilter)

      const res = await fetch(`/api/admin/audit-logs?${params}`)
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to load audit logs')
        setLogs([])
        setTotal(0)
        return
      }

      setLogs(data.logs || [])
      setTotal(data.total || 0)
    } catch {
      toast.error('Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }, [page, actionFilter])

  useEffect(() => { loadLogs() }, [loadLogs])

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <FontAwesomeIcon icon={faShieldHalved} className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground tracking-tight">Audit Logs</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Track all admin actions across the system. {total} event{total !== 1 ? 's' : ''} recorded.
        </p>
      </div>

      {/* Filters */}
      <Card className="rounded-xl mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <select
                value={actionFilter}
                onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}
                className="text-xs bg-muted border border-border rounded-lg px-3 py-1.5 pr-7 appearance-none cursor-pointer"
                aria-label="Filter by action"
              >
                <option value="">All Actions</option>
                {ALL_ACTIONS.map(a => {
                  const meta = getActionMeta(a)
                  return <option key={a} value={a}>{meta.label}</option>
                })}
              </select>
              <FontAwesomeIcon icon={faChevronDown} className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            </div>

            {actionFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setActionFilter(''); setPage(1) }}
                className="text-xs text-muted-foreground"
              >
                <FontAwesomeIcon icon={faXmark} className="w-3 h-3 mr-1" />
                Clear
              </Button>
            )}

            <div className="flex-1" />

            <span className="text-xs text-muted-foreground">
              {total} event{total !== 1 ? 's' : ''}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Log entries */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <Card key={i} className="rounded-xl">
              <CardContent className="p-4 flex items-center gap-4">
                <Skeleton className="w-9 h-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-72" />
                </div>
                <Skeleton className="h-3 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <Card className="rounded-xl">
          <CardContent className="p-8 text-center">
            <FontAwesomeIcon icon={faShieldHalved} className="w-8 h-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {actionFilter ? 'No events found for this action type.' : 'No audit logs recorded yet.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {logs.map((log, i) => {
              const meta = getActionMeta(log.action)
              const isExpanded = expandedId === log.id
              const detailKeys = Object.keys(log.details || {})

              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <Card
                    className={`rounded-xl transition-all cursor-pointer hover:shadow-sm ${
                      isExpanded ? 'ring-1 ring-primary/20' : ''
                    }`}
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {/* Action icon */}
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${meta.color}`}>
                          <FontAwesomeIcon icon={meta.icon} className="w-4 h-4" />
                        </div>

                        {/* Main content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <h3 className="text-sm font-bold text-foreground">{meta.label}</h3>
                            <Badge className="text-[9px] font-semibold bg-muted text-muted-foreground">
                              {log.actor_role.replace('_', ' ').toUpperCase()}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {log.actor_email || log.actor_id.slice(0, 8) + '...'}
                            {log.target_id && (
                              <span> · Target: {log.target_type}/{log.target_id.slice(0, 8)}...</span>
                            )}
                          </p>

                          {/* Expanded details */}
                          <AnimatePresence>
                            {isExpanded && detailKeys.length > 0 && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-3 pt-3 border-t border-border/40 space-y-1.5">
                                  {detailKeys.map(key => (
                                    <div key={key} className="flex items-start gap-2 text-xs">
                                      <span className="text-muted-foreground font-medium min-w-[80px] shrink-0">
                                        {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim()}:
                                      </span>
                                      <span className="text-foreground break-all">
                                        {typeof log.details[key] === 'object'
                                          ? JSON.stringify(log.details[key])
                                          : String(log.details[key])}
                                      </span>
                                    </div>
                                  ))}
                                  {log.ip_address && (
                                    <div className="flex items-start gap-2 text-xs">
                                      <span className="text-muted-foreground font-medium min-w-[80px] shrink-0">IP:</span>
                                      <span className="text-foreground font-mono text-[11px]">{log.ip_address}</span>
                                    </div>
                                  )}
                                  <div className="flex items-start gap-2 text-xs">
                                    <span className="text-muted-foreground font-medium min-w-[80px] shrink-0">Timestamp:</span>
                                    <span className="text-foreground">{fullDateTime(log.created_at)}</span>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Time + expand icon */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap">
                            {timeAgo(log.created_at)}
                          </span>
                          <FontAwesomeIcon
                            icon={faEye}
                            className={`w-3 h-3 transition-colors ${isExpanded ? 'text-primary' : 'text-muted-foreground/40'}`}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · {total} events
          </p>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <FontAwesomeIcon icon={faChevronLeft} className="w-3 h-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              <FontAwesomeIcon icon={faChevronRight} className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
