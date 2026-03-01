'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { ThemeToggle } from '@/lib/theme'
import { useTranslation } from '@/lib/i18n'
import { LanguageSwitcher } from '@/components/language-switcher'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUtensils, faChartLine, faMessage, faBars, faRightFromBracket, faCommentDots, faQrcode, faClipboardList, faFileLines, faUsers } from '@fortawesome/free-solid-svg-icons'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { WhatsNew } from '@/components/whats-new'

interface User {
  id: string
  name: string
  registerId: string
  role: string
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (data.user) setUser(data.user)
        else router.push('/login')
      })
      .catch(() => router.push('/login'))
  }, [router])

  const handleLogout = async () => {
    // 1. Call API to sign out on server
    await fetch('/api/auth/logout', { method: 'POST' })
    // 2. Clear Supabase auth cookies on client
    document.cookie.split(';').forEach(c => {
      const name = c.trim().split('=')[0]
      if (name.startsWith('sb-') && name.endsWith('-auth-token')) {
        document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
      }
    })
    // 3. Clear any other possible auth-related cookies just in case
    document.cookie = 'supabase-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    // 4. Force hard reload to login page to clear all client state
    window.location.href = '/login'
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center transition-colors">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const navItems = [
    { href: '/admin', icon: <FontAwesomeIcon icon={faChartLine} className="w-5 h-5" />, label: t.nav.dashboard },
    { href: '/admin/reviews', icon: <FontAwesomeIcon icon={faMessage} className="w-5 h-5" />, label: t.nav.reviews },
    { href: '/admin/menu', icon: <FontAwesomeIcon icon={faUtensils} className="w-5 h-5" />, label: t.nav.menu },
    { href: '/admin/complaints', icon: <FontAwesomeIcon icon={faCommentDots} className="w-5 h-5" />, label: t.nav.complaints },
    { href: '/admin/attendance', icon: <FontAwesomeIcon icon={faQrcode} className="w-5 h-5" />, label: t.nav.attendance },
    { href: '/admin/attendance/list', icon: <FontAwesomeIcon icon={faClipboardList} className="w-5 h-5" />, label: t.nav.attendanceList },
    { href: '/admin/reports', icon: <FontAwesomeIcon icon={faFileLines} className="w-5 h-5" />, label: t.nav.reports },
    { href: '/admin/users', icon: <FontAwesomeIcon icon={faUsers} className="w-5 h-5" />, label: 'Users' },
  ]

  // Add Super Admin specific features
  if (user.role === 'super_admin') {
    navItems.push({
      href: '/admin/blocks',
      icon: <FontAwesomeIcon icon={faBars} className="w-5 h-5" />,
      label: t.nav.blocks,
    })
  }

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="min-h-screen bg-background flex transition-colors">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 dark:bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-card border-r flex flex-col transition-all duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
      >
        {/* Logo */}
        <div className="px-6 py-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <FontAwesomeIcon icon={faUtensils} className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground tracking-tight">Food Review</h1>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                Admin Panel
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
              >
                {item.icon}
                {item.label}
              </Link>
            )
          })}
          <WhatsNew variant="sidebar" />
        </nav>

        {/* User & Logout */}
        <div className="px-3 py-4 border-t">
          <div className="flex items-center gap-3 px-3 mb-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground font-medium truncate">{user.name}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{user.role}</p>
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b px-4 lg:px-8 py-4 flex items-center gap-4 transition-colors">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden"
          >
            <FontAwesomeIcon icon={faBars} className="w-6 h-6" />
          </Button>
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </span>
          <LanguageSwitcher variant="compact" />
          <WhatsNew variant="icon" />
          <ThemeToggle />
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
