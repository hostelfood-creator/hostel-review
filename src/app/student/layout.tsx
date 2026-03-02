'use client'

import { useEffect, useState, useTransition, useCallback } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUtensils, faClock, faUserCircle, faBell, faRightFromBracket, faCommentDots, faQrcode } from '@fortawesome/free-solid-svg-icons'
import { ThemeToggle } from '@/lib/theme'
import { useTranslation } from '@/lib/i18n'
import { LanguageSwitcher } from '@/components/language-switcher'
import { WhatsNew } from '@/components/whats-new'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { hapticTap } from '@/lib/haptics'

interface Notification {
  id: string
  message: string
  title?: string
  timestamp: string
  type: string
  read: boolean
}

interface User {
  id: string
  name: string
  registerId: string
  role: string
  hostelBlock?: string
}

/** Strip HTML tags from untrusted content as defense-in-depth */
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').trim()
}

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const { t } = useTranslation()
  const [isPending, startTransition] = useTransition()
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null)

  /** Navigate with React transition — gives instant visual feedback */
  const navigateTo = useCallback((href: string) => {
    if (href === pathname) return
    hapticTap()
    setNavigatingTo(href)
    startTransition(() => {
      router.push(href)
    })
  }, [pathname, router])

  // Clear navigating state when route change completes
  useEffect(() => {
    setNavigatingTo(null)
  }, [pathname])

  // Prefetch all student routes on mount for instant navigation
  useEffect(() => {
    const routes = ['/student', '/student/scan', '/student/history', '/student/complaints', '/student/profile']
    routes.forEach((route) => {
      if (route !== pathname) router.prefetch(route)
    })
  }, [router, pathname])

  // Read IDs from localStorage (fallback for offline)
  const getReadIds = (): string[] => {
    try {
      return JSON.parse(localStorage.getItem('notif_read_ids') || '[]')
    } catch { return [] }
  }
  const markAllRead = async (notifs: Notification[]) => {
    const ids = notifs.filter(n => !n.read).map(n => n.id)
    if (ids.length === 0) {
      setNotifications(notifs.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
      return
    }
    // Update server-side read state
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: ids }),
      })
    } catch { /* ignore — localStorage fallback below */ }
    // Also update localStorage as offline fallback
    const existing = new Set(getReadIds())
    ids.forEach(id => existing.add(id))
    const arr = [...existing].slice(-200)
    localStorage.setItem('notif_read_ids', JSON.stringify(arr))
    setNotifications(notifs.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const data = await res.json()
      // Server now returns read state from notification_reads table
      // Merge with localStorage fallback for offline-first behavior
      const localReadSet = new Set(getReadIds())
      const notifs: Notification[] = (data.notifications || []).map((n: Notification) => ({
        ...n,
        read: n.read || localReadSet.has(n.id),
      }))
      setNotifications(notifs)
      setUnreadCount(notifs.filter(n => !n.read).length)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (data.user) setUser(data.user)
        else router.push('/login')
      })
      .catch(() => router.push('/login'))

    // Fetch notifications from API
    fetchNotifications()

    // Subscribe to realtime menu and settings changes for live notifications
    const supabase = createClient()
    const menuChannel = supabase.channel('student_notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'menus' }, (payload) => {
        const rawMeal = stripHtml(String(payload.new.meal_type || 'Meal'))
        const mealLabel = rawMeal.replace(/^\w/, (c: string) => c.toUpperCase())
        setNotifications((prev) => [{
          id: `menu-rt-${payload.new.id}`,
          message: `Admin posted today\'s ${mealLabel} menu. Check it out!`,
          title: 'Menu Update',
          timestamp: new Date().toISOString(),
          type: 'menu_update',
          read: false,
        }, ...prev.slice(0, 9)])
        setUnreadCount((n) => n + 1)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'site_settings', filter: 'id=eq.1' }, (payload) => {
        if (payload.new.maintenance_mode) {
          setNotifications((prev) => [{
            id: 'maint-rt',
            message: 'The system will go under maintenance shortly. Save your work.',
            title: 'Maintenance Alert',
            timestamp: new Date().toISOString(),
            type: 'maintenance',
            read: false,
          }, ...prev.slice(0, 9)])
          setUnreadCount((n) => n + 1)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(menuChannel) }
  }, [router])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center transition-colors">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Bottom nav: 4 regular items + center QR FAB
  const navItemsLeft = [
    { href: '/student', icon: <FontAwesomeIcon icon={faUtensils} className="w-5 h-5" />, label: t.nav.menu },
    { href: '/student/history', icon: <FontAwesomeIcon icon={faClock} className="w-5 h-5" />, label: t.nav.history },
  ]
  const navItemsRight = [
    { href: '/student/complaints', icon: <FontAwesomeIcon icon={faCommentDots} className="w-5 h-5" />, label: t.nav.complaints },
    { href: '/student/profile', icon: <FontAwesomeIcon icon={faUserCircle} className="w-5 h-5" />, label: t.nav.profile },
  ]

  // Desktop sidebar still uses 5-item list
  const navItems = [
    { href: '/student', icon: <FontAwesomeIcon icon={faUtensils} className="w-5 h-5" />, label: t.nav.menu },
    { href: '/student/scan', icon: <FontAwesomeIcon icon={faQrcode} className="w-5 h-5" />, label: t.nav.checkin },
    { href: '/student/history', icon: <FontAwesomeIcon icon={faClock} className="w-5 h-5" />, label: t.nav.history },
    { href: '/student/complaints', icon: <FontAwesomeIcon icon={faCommentDots} className="w-5 h-5" />, label: t.nav.complaints },
    { href: '/student/profile', icon: <FontAwesomeIcon icon={faUserCircle} className="w-5 h-5" />, label: t.nav.profile },
  ]

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="min-h-screen bg-background transition-colors flex">
      {/* Desktop Sidebar — hidden on mobile */}
      <aside className="hidden lg:flex w-64 border-r bg-card flex-col shrink-0 sticky top-0 h-screen">
        {/* Logo */}
        <div className="px-6 py-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <FontAwesomeIcon icon={faUtensils} className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground tracking-tight">Food Review</h1>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                Student Portal
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href
            return (
              <button
                key={item.href}
                type="button"
                onClick={() => navigateTo(item.href)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
              >
                {item.icon}
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* User & Logout */}
        <div className="px-3 py-4 border-t">
          <div className="flex items-center gap-3 px-3 mb-3">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-gradient-to-tr from-primary to-amber-400 text-white text-[10px] font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground font-medium truncate">{user.name}{user.hostelBlock ? ` · ${user.hostelBlock}` : ''}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full justify-start text-muted-foreground hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/5"
          >
            <FontAwesomeIcon icon={faRightFromBracket} className="w-4 h-4 mr-2" />
            {t.common.logout}
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b px-4 lg:px-8 py-4 transition-colors">
          <div className="flex items-center justify-between">
            {/* College Logo */}
            <div className="flex items-center gap-2.5">
              <Image
                src="/college-logo.png"
                alt="College Logo"
                width={36}
                height={36}
                className="rounded-lg object-contain"
                priority
              />
              <div className="flex flex-col leading-tight">
                <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-widest hidden sm:block">Hostel Portal</span>
                <span className="text-sm font-bold text-foreground tracking-tight">Food Review</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {user.hostelBlock && (
                <Badge variant="secondary" className="text-[10px] mr-1 rounded-full max-w-[90px] sm:max-w-none truncate">
                  {user.hostelBlock}
                </Badge>
              )}
              {/* Language, WhatsNew, Theme — hidden on mobile, shown on desktop */}
              <span className="hidden lg:flex items-center gap-1">
                <LanguageSwitcher variant="compact" />
                <WhatsNew variant="icon" />
                <ThemeToggle />
              </span>
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full relative"
                  onClick={() => {
                    const opening = !showNotifications
                    setShowNotifications(opening)
                    // Delay mark-as-read so user briefly sees unread highlights
                    if (opening) {
                      setTimeout(() => markAllRead(notifications), 1500)
                    }
                  }}
                >
                  <FontAwesomeIcon icon={faBell} className="w-5 h-5 text-muted-foreground" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-primary rounded-full text-[9px] text-primary-foreground font-bold flex items-center justify-center px-0.5">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </Button>
                {showNotifications && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setShowNotifications(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-80 bg-card border rounded-2xl shadow-2xl z-40 overflow-hidden">
                      <div className="px-4 py-3 border-b flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Live</span>
                      </div>
                      <div className="max-h-72 overflow-y-auto divide-y divide-border">
                        {notifications.length === 0 ? (
                          <div className="px-4 py-6 text-center text-sm text-muted-foreground">No notifications</div>
                        ) : notifications.map((n) => (
                          <div key={n.id} className={`px-4 py-3 hover:bg-accent/50 transition-colors ${!n.read ? 'bg-primary/5' : ''}`}>
                            <div className="flex items-start gap-2.5">
                              <div className="flex-1 min-w-0">
                                {n.title && <p className="text-xs font-semibold text-foreground mb-0.5">{n.title}</p>}
                                <p className="text-sm text-foreground leading-snug">{n.message}</p>
                                <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide font-medium">
                                  {n.timestamp ? new Date(n.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                                </p>
                              </div>
                              {!n.read && <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto no-scrollbar pb-24 lg:pb-8">
          {/* Top loading bar for page transitions */}
          {(isPending || navigatingTo) && (
            <div className="fixed top-0 left-0 right-0 z-50 h-0.5">
              <div className="h-full bg-primary rounded-r-full" style={{ animation: 'nav-progress 1.5s ease-in-out infinite' }} />
            </div>
          )}
          <div className={`max-w-4xl mx-auto transition-opacity duration-150 ${isPending ? 'opacity-60 pointer-events-none' : 'opacity-100'}`}>
            {children}
          </div>
        </main>

        {/* Bottom Navigation — mobile only — center FAB QR */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur-lg border-t pb-safe pt-3 px-4 transition-colors lg:hidden">
          <div className="flex items-end justify-around max-w-lg mx-auto relative">
            {/* Left nav items */}
            {navItemsLeft.map((item) => {
              const active = pathname === item.href
              const isNavigating = navigatingTo === item.href
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => navigateTo(item.href)}
                  className="flex flex-col items-center justify-center gap-1 active:scale-90 transition-transform duration-100 bg-transparent border-none outline-none cursor-pointer"
                >
                  <span className={`transition-colors duration-150 ${active || isNavigating ? 'text-primary' : 'text-muted-foreground'}`}>
                    {isNavigating ? (
                      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    ) : item.icon}
                  </span>
                  <span className={`text-[10px] font-semibold uppercase tracking-widest transition-colors duration-150 ${active || isNavigating ? 'text-primary' : 'text-muted-foreground'}`}>
                    {item.label}
                  </span>
                </button>
              )
            })}

            {/* Center FAB — QR Scan */}
            <button
              type="button"
              onClick={() => navigateTo('/student/scan')}
              className="flex flex-col items-center -mt-5 active:scale-90 transition-transform duration-100 bg-transparent border-none outline-none cursor-pointer"
            >
              <span className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg border-4 border-background transition-colors bg-primary text-primary-foreground`}>
                {navigatingTo === '/student/scan' ? (
                  <div className="w-6 h-6 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                ) : (
                  <FontAwesomeIcon icon={faQrcode} className="w-6 h-6" />
                )}
              </span>
              <span className={`text-[10px] font-semibold uppercase tracking-widest mt-1 transition-colors duration-150 ${
                pathname === '/student/scan' || navigatingTo === '/student/scan' ? 'text-primary' : 'text-muted-foreground'
              }`}>
                {t.nav.checkin}
              </span>
            </button>

            {/* Right nav items */}
            {navItemsRight.map((item) => {
              const active = pathname === item.href
              const isNavigating = navigatingTo === item.href
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => navigateTo(item.href)}
                  className="flex flex-col items-center justify-center gap-1 active:scale-90 transition-transform duration-100 bg-transparent border-none outline-none cursor-pointer"
                >
                  <span className={`transition-colors duration-150 ${active || isNavigating ? 'text-primary' : 'text-muted-foreground'}`}>
                    {isNavigating ? (
                      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    ) : item.icon}
                  </span>
                  <span className={`text-[10px] font-semibold uppercase tracking-widest transition-colors duration-150 ${active || isNavigating ? 'text-primary' : 'text-muted-foreground'}`}>
                    {item.label}
                  </span>
                </button>
              )
            })}
          </div>
        </nav>
      </div>
    </div>
  )
}
