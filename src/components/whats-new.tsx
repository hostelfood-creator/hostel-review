'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBullhorn, faCheck, faStar, faShieldHalved, faBug, faWrench } from '@fortawesome/free-solid-svg-icons'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'

// ── Changelog Data ───────────────────────────────────────────────────────────

interface ChangelogEntry {
  version: string
  date: string
  highlights: {
    type: 'feature' | 'improvement' | 'fix' | 'security'
    text: string
  }[]
}

const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.5.0',
    date: '2025-07-01',
    highlights: [
      { type: 'feature', text: 'Analytics dashboard upgrade — rating heatmap, date range picker, and week-over-week comparison cards' },
      { type: 'feature', text: 'Print-friendly stylesheets — print admin dashboards and reports directly from the browser' },
      { type: 'feature', text: '"What\'s New" changelog — stay up-to-date with the latest features' },
    ],
  },
  {
    version: '1.4.0',
    date: '2025-06-25',
    highlights: [
      { type: 'feature', text: 'Audit trail — all admin actions are now logged for accountability' },
      { type: 'feature', text: 'User management panel — admins can search, deactivate, and promote users' },
      { type: 'feature', text: 'CSV data export — export reviews, complaints, attendance, and user data' },
      { type: 'feature', text: 'Pull-to-refresh on student dashboard for quick data refresh' },
      { type: 'feature', text: 'Complaint priority & SLA tracking with countdown timers' },
      { type: 'improvement', text: 'Accessibility enhancements — skip navigation, ARIA live regions, screen reader support' },
      { type: 'improvement', text: 'Error boundaries — graceful error pages instead of blank screens' },
      { type: 'improvement', text: 'Server-side notification read state — syncs across devices' },
    ],
  },
  {
    version: '1.3.0',
    date: '2025-06-15',
    highlights: [
      { type: 'feature', text: 'Per-hostel menus — each block can have its own meal menu' },
      { type: 'improvement', text: 'Streamlined admin dashboard — cleaner layout and faster loading' },
    ],
  },
  {
    version: '1.2.0',
    date: '2025-06-05',
    highlights: [
      { type: 'security', text: 'Cloudflare Turnstile CAPTCHA on login and registration' },
      { type: 'fix', text: 'Content Security Policy hardened for production' },
      { type: 'improvement', text: 'Rate limiting on all API endpoints' },
    ],
  },
  {
    version: '1.1.0',
    date: '2025-05-20',
    highlights: [
      { type: 'feature', text: 'QR code meal attendance check-in system' },
      { type: 'feature', text: 'Hostel block management for super admins' },
      { type: 'feature', text: 'Multi-language support (English, Hindi, Telugu)' },
    ],
  },
]

const STORAGE_KEY = 'whats-new-last-seen'
const CURRENT_VERSION = CHANGELOG[0]?.version ?? '1.0.0'

// ── Type badge config ────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; icon: IconDefinition; className: string }> = {
  feature: { label: 'New', icon: faStar, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  improvement: { label: 'Improved', icon: faWrench, className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  fix: { label: 'Fixed', icon: faBug, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  security: { label: 'Security', icon: faShieldHalved, className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
}

// ── Component ────────────────────────────────────────────────────────────────

export function WhatsNew({ variant = 'icon' }: { variant?: 'icon' | 'sidebar' }) {
  const [open, setOpen] = useState(false)
  const [hasNew, setHasNew] = useState(false)

  useEffect(() => {
    try {
      const lastSeen = localStorage.getItem(STORAGE_KEY)
      if (lastSeen !== CURRENT_VERSION) {
        setHasNew(true)
      }
    } catch {
      // localStorage unavailable
    }
  }, [])

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen) {
      try {
        localStorage.setItem(STORAGE_KEY, CURRENT_VERSION)
        setHasNew(false)
      } catch {
        // localStorage unavailable
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        {variant === 'sidebar' ? (
          <button
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors w-full"
          >
            <FontAwesomeIcon icon={faBullhorn} className="w-5 h-5" />
            What&rsquo;s New
            {hasNew && (
              <span className="ml-auto w-2 h-2 rounded-full bg-primary animate-pulse" />
            )}
          </button>
        ) : (
          <Button variant="ghost" size="icon" className="relative">
            <FontAwesomeIcon icon={faBullhorn} className="w-4 h-4" />
            {hasNew && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary animate-pulse" />
            )}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FontAwesomeIcon icon={faBullhorn} className="w-4 h-4 text-primary" />
            What&rsquo;s New
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto -mx-6 px-6 pb-2 space-y-6">
          {CHANGELOG.map((entry) => (
            <div key={entry.version}>
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="secondary" className="font-mono text-xs">
                  v{entry.version}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.date).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
                {entry.version === CURRENT_VERSION && (
                  <Badge className="bg-primary/10 text-primary text-[10px] border-0">Latest</Badge>
                )}
              </div>
              <ul className="space-y-2">
                {entry.highlights.map((h, i) => {
                  const config = TYPE_CONFIG[h.type] || TYPE_CONFIG.feature
                  return (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <span className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider mt-0.5 ${config.className}`}>
                        <FontAwesomeIcon icon={config.icon} className="w-2.5 h-2.5" />
                        {config.label}
                      </span>
                      <span className="text-foreground/90 leading-snug">{h.text}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="pt-3 border-t flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <FontAwesomeIcon icon={faCheck} className="w-3 h-3 text-green-500" />
            You&rsquo;re on the latest version
          </span>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
