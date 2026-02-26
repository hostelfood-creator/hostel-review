'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faIdCard, faEnvelope, faBuilding, faGraduationCap, faCalendar, faStar, faPenToSquare, faCheck, faXmark, faKey, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

interface User {
  id: string
  name: string
  registerId: string
  email: string | null
  role: string
  hostelBlock: string | null
  department: string | null
  year: string | null
}

const VALID_YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year']

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [reviewCount, setReviewCount] = useState(0)
  const [avgRating, setAvgRating] = useState(0)
  const [loggingOut, setLoggingOut] = useState(false)

  // Edit state
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editYear, setEditYear] = useState('')
  const [saving, setSaving] = useState(false)

  // Password change state
  const [changingPassword, setChangingPassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [userRes, reviewRes] = await Promise.all([
        fetch('/api/auth/me'),
        fetch('/api/reviews'),
      ])
      const userData = await userRes.json()
      const reviewData = await reviewRes.json()
      if (userData.user) {
        setUser(userData.user)
        setEditName(userData.user.name)
        setEditYear(userData.user.year || '')
      }
      if (reviewData.reviews) {
        // Use server-side total from pagination for accurate count (reviews array is capped at pageSize)
        const actualCount = reviewData.pagination?.total ?? reviewData.reviews.length
        setReviewCount(actualCount)
        const total = reviewData.reviews.reduce((s: number, r: { rating: number }) => s + r.rating, 0)
        setAvgRating(reviewData.reviews.length > 0 ? Math.round((total / reviewData.reviews.length) * 10) / 10 : 0)
      }
    } catch (err) {
      console.error('Failed to load profile:', err)
    }
  }, [])

  useEffect(() => {
    loadData()

    const supabase = createClient()
    // Get user ID for filtered realtime subscription (avoid O(U*R) traffic)
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      if (!authUser) return
      const ch = supabase.channel('student_profile_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews', filter: `user_id=eq.${authUser.id}` }, () => {
          loadData()
        })
        .subscribe()
      channelRef = ch
    })
    let channelRef: ReturnType<typeof supabase.channel> | null = null

    return () => {
      if (channelRef) supabase.removeChannel(channelRef)
    }
  }, [loadData])

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/login')
    } catch {
      setLoggingOut(false)
    }
  }

  const handleChangePassword = async () => {
    if (!currentPassword) { toast.error('Enter your current password'); return }
    if (!newPassword || newPassword.length < 6) { toast.error('New password must be at least 6 characters'); return }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return }
    if (currentPassword === newPassword) { toast.error('New password must be different'); return }

    setSavingPassword(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to change password')
        return
      }

      toast.success('Password changed successfully')
      setChangingPassword(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setShowCurrentPw(false)
      setShowNewPw(false)
    } catch {
      toast.error('Network error, please try again')
    } finally {
      setSavingPassword(false)
    }
  }

  const handleStartEdit = () => {
    if (user) {
      setEditName(user.name)
      setEditYear(user.year || '')
      setEditing(true)
    }
  }

  const handleCancelEdit = () => {
    setEditing(false)
    if (user) {
      setEditName(user.name)
      setEditYear(user.year || '')
    }
  }

  const handleSaveEdit = async () => {
    const name = editName.trim()
    if (!name || name.length < 2) {
      toast.error('Name must be at least 2 characters')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, year: editYear || null }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to update profile')
        return
      }

      toast.success('Profile updated successfully')
      setEditing(false)
      loadData() // Refresh data
    } catch {
      toast.error('Network error, please try again')
    } finally {
      setSaving(false)
    }
  }

  if (!user) {
    return (
      <div className="px-5 py-6 space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="flex flex-col items-center space-y-3">
          <Skeleton className="w-20 h-20 rounded-full" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    )
  }

  const infoItems = [
    { label: 'Register ID', value: user.registerId, icon: <FontAwesomeIcon icon={faIdCard} className="w-[18px] h-[18px]" /> },
    { label: 'Email', value: user.email || 'Not provided', icon: <FontAwesomeIcon icon={faEnvelope} className="w-[18px] h-[18px]" /> },
    { label: 'Hostel Block', value: user.hostelBlock || 'Not assigned', icon: <FontAwesomeIcon icon={faBuilding} className="w-[18px] h-[18px]" /> },
    { label: 'Department', value: user.department || 'Not specified', icon: <FontAwesomeIcon icon={faGraduationCap} className="w-[18px] h-[18px]" /> },
    { label: 'Year', value: user.year || 'Not specified', icon: <FontAwesomeIcon icon={faCalendar} className="w-[18px] h-[18px]" /> },
  ]

  return (
    <div className="px-5 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-foreground tracking-tight leading-none">
          PROFILE
        </h1>
        {!editing && (
          <Button variant="outline" size="sm" onClick={handleStartEdit} className="rounded-full">
            <FontAwesomeIcon icon={faPenToSquare} className="w-3.5 h-3.5 mr-1.5" />
            Edit
          </Button>
        )}
      </div>

      {/* Name & Role */}
      <div className="flex flex-col items-center mb-8">
        {editing ? (
          <div className="w-full max-w-xs space-y-3">
            <div>
              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">
                Name
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                maxLength={100}
                disabled={saving}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">
                Year
              </label>
              <select
                value={editYear}
                onChange={(e) => setEditYear(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                disabled={saving}
              >
                <option value="">Not specified</option>
                {VALID_YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveEdit} disabled={saving} className="flex-1 rounded-lg" size="sm">
                <FontAwesomeIcon icon={faCheck} className="w-3.5 h-3.5 mr-1.5" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
              <Button variant="outline" onClick={handleCancelEdit} disabled={saving} className="rounded-lg" size="sm">
                <FontAwesomeIcon icon={faXmark} className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold text-foreground">{user.name}</h2>
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider mt-1">
              {user.role}
            </Badge>
          </>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card className="rounded-xl">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{reviewCount}</p>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-1">
              Total Reviews
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-4 text-center flex flex-col items-center justify-center min-h-[100px]">
            <p className="text-2xl font-bold text-foreground mb-1">{avgRating}</p>
            <div className="flex gap-0.5 mb-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <FontAwesomeIcon icon={faStar}
                  key={star}
                  className={`w-3.5 h-3.5 ${star <= avgRating
                    ? 'text-primary'
                    : 'text-zinc-200 dark:text-zinc-800'
                    }`}
                />
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-1">
              Avg Rating
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Info */}
      <Card className="rounded-xl">
        <CardContent className="p-0">
          {infoItems.map((item, idx) => (
            <div key={item.label}>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="text-muted-foreground">{item.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                    {item.label}
                  </p>
                  <p className="text-sm text-foreground truncate">{item.value}</p>
                </div>
              </div>
              {idx < infoItems.length - 1 && <Separator />}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card className="rounded-xl mt-6">
        <CardContent className="p-4">
          {changingPassword ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FontAwesomeIcon icon={faKey} className="w-3.5 h-3.5 text-primary" />
                Change Password
              </h3>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPw ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 rounded-lg border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    placeholder="Enter current password"
                    disabled={savingPassword}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <FontAwesomeIcon icon={showCurrentPw ? faEyeSlash : faEye} className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 rounded-lg border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    placeholder="Min 6 characters"
                    disabled={savingPassword}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(!showNewPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <FontAwesomeIcon icon={showNewPw ? faEyeSlash : faEye} className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  placeholder="Re-enter new password"
                  disabled={savingPassword}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleChangePassword} disabled={savingPassword} className="flex-1 rounded-lg" size="sm">
                  <FontAwesomeIcon icon={faCheck} className="w-3.5 h-3.5 mr-1.5" />
                  {savingPassword ? 'Saving...' : 'Update Password'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setChangingPassword(false)
                    setCurrentPassword('')
                    setNewPassword('')
                    setConfirmPassword('')
                    setShowCurrentPw(false)
                    setShowNewPw(false)
                  }}
                  disabled={savingPassword}
                  className="rounded-lg"
                  size="sm"
                >
                  <FontAwesomeIcon icon={faXmark} className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setChangingPassword(true)}
              className="w-full flex items-center gap-3 text-left"
            >
              <div className="text-muted-foreground">
                <FontAwesomeIcon icon={faKey} className="w-[18px] h-[18px]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  Security
                </p>
                <p className="text-sm text-foreground">Change Password</p>
              </div>
              <FontAwesomeIcon icon={faPenToSquare} className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </CardContent>
      </Card>

      {/* Logout */}
      <Button
        variant="outline"
        onClick={handleLogout}
        disabled={loggingOut}
        className="w-full mt-6 border-red-200 dark:border-red-500/20 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/5"
      >
        {loggingOut ? 'Signing out...' : 'Sign Out'}
      </Button>
    </div>
  )
}
