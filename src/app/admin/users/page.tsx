'use client'

import { useEffect, useState, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUsers, faSearch, faUserShield, faUserSlash, faUserCheck, faChevronDown, faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

interface UserRecord {
  id: string
  register_id: string
  name: string
  email: string
  role: string
  hostel_block: string | null
  department: string | null
  year: string | null
  created_at: string
  deactivated: boolean | null
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [blockFilter, setBlockFilter] = useState('')
  const [yearFilter, setYearFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [blocks, setBlocks] = useState<string[]>([])
  const [userRole, setUserRole] = useState<string>('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const pageSize = 25

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { if (d.user?.role) setUserRole(d.user.role) })
      .catch(() => {})

    fetch('/api/blocks')
      .then(r => r.json())
      .then(d => setBlocks((d.blocks || []).map((b: { name: string }) => b.name)))
      .catch(() => {})
  }, [])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (search) params.set('search', search)
      if (roleFilter) params.set('role', roleFilter)
      if (blockFilter) params.set('block', blockFilter)
      if (yearFilter) params.set('year', yearFilter)
      if (statusFilter) params.set('status', statusFilter)

      const res = await fetch(`/api/admin/users?${params}`)
      const data = await res.json()
      setUsers(data.users || [])
      setTotal(data.total || 0)
    } catch {
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [page, search, roleFilter, blockFilter, yearFilter, statusFilter])

  useEffect(() => { loadUsers() }, [loadUsers])

  const handleAction = async (userId: string, action: string, confirmMsg: string) => {
    if (!confirm(confirmMsg)) return
    setActionLoading(userId)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`User ${action.replace('_', ' ')} successful`)
        loadUsers()
      } else {
        toast.error(data.error || 'Action failed')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const totalPages = Math.ceil(total / pageSize)

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'super_admin': return 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400'
      case 'admin': return 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400'
      default: return 'bg-gray-100 dark:bg-gray-500/15 text-gray-700 dark:text-gray-400'
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <FontAwesomeIcon icon={faUsers} className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground tracking-tight">User Management</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Search, filter, and manage registered users. Total: {total} users
        </p>
      </div>

      {/* Search & Filters */}
      <Card className="rounded-xl mb-6">
        <CardContent className="p-4">
          <form onSubmit={handleSearch} className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, register ID, or email..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" size="sm">Search</Button>
          </form>

          <div className="flex flex-wrap gap-2">
            {/* Role filter */}
            <div className="relative">
              <select
                value={roleFilter}
                onChange={(e) => { setRoleFilter(e.target.value); setPage(1) }}
                className="text-xs bg-muted border border-border rounded-lg px-3 py-1.5 pr-7 appearance-none cursor-pointer"
                aria-label="Filter by role"
              >
                <option value="">All Roles</option>
                <option value="student">Student</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
              <FontAwesomeIcon icon={faChevronDown} className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            </div>

            {/* Block filter */}
            <div className="relative">
              <select
                value={blockFilter}
                onChange={(e) => { setBlockFilter(e.target.value); setPage(1) }}
                className="text-xs bg-muted border border-border rounded-lg px-3 py-1.5 pr-7 appearance-none cursor-pointer"
                aria-label="Filter by hostel block"
              >
                <option value="">All Blocks</option>
                {blocks.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <FontAwesomeIcon icon={faChevronDown} className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            </div>

            {/* Year filter */}
            <div className="relative">
              <select
                value={yearFilter}
                onChange={(e) => { setYearFilter(e.target.value); setPage(1) }}
                className="text-xs bg-muted border border-border rounded-lg px-3 py-1.5 pr-7 appearance-none cursor-pointer"
                aria-label="Filter by year"
              >
                <option value="">All Years</option>
                <option value="I">I</option>
                <option value="II">II</option>
                <option value="III">III</option>
                <option value="IV">IV</option>
                <option value="V">V</option>
              </select>
              <FontAwesomeIcon icon={faChevronDown} className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            </div>

            {/* Status filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
                className="text-xs bg-muted border border-border rounded-lg px-3 py-1.5 pr-7 appearance-none cursor-pointer"
                aria-label="Filter by status"
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="deactivated">Deactivated</option>
              </select>
              <FontAwesomeIcon icon={faChevronDown} className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            </div>

            {(search || roleFilter || blockFilter || yearFilter || statusFilter) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearch(''); setSearchInput(''); setRoleFilter(''); setBlockFilter(''); setYearFilter(''); setStatusFilter(''); setPage(1) }}
                className="text-xs text-muted-foreground"
              >
                Clear All
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* User List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <Card key={i} className="rounded-xl">
              <CardContent className="p-4 flex items-center gap-4">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-60" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : users.length === 0 ? (
        <Card className="rounded-xl">
          <CardContent className="p-8 text-center">
            <FontAwesomeIcon icon={faUsers} className="w-8 h-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No users found matching your filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <Card key={u.id} className={`rounded-xl transition-all ${u.deactivated ? 'opacity-60 border-red-200 dark:border-red-500/20' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-sm font-bold text-foreground truncate">{u.name}</h3>
                      <Badge className={`text-[10px] font-semibold ${getRoleBadgeColor(u.role)}`}>
                        {u.role.replace('_', ' ').toUpperCase()}
                      </Badge>
                      {u.deactivated && (
                        <Badge className="text-[10px] font-semibold bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400">
                          DEACTIVATED
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {u.register_id} · {u.email}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {u.hostel_block && <span>{u.hostel_block} · </span>}
                      {u.department && <span>{u.department} · </span>}
                      {u.year && <span>Year {u.year} · </span>}
                      Joined {new Date(u.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-1.5 shrink-0">
                    {u.deactivated ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAction(u.id, 'reactivate', `Reactivate ${u.name}?`)}
                        disabled={actionLoading === u.id}
                        className="text-xs text-green-600 hover:text-green-700 border-green-200"
                      >
                        <FontAwesomeIcon icon={faUserCheck} className="w-3 h-3 mr-1" />
                        Reactivate
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAction(u.id, 'deactivate', `Deactivate ${u.name}? They won't be able to log in.`)}
                        disabled={actionLoading === u.id}
                        className="text-xs text-red-600 hover:text-red-700 border-red-200"
                      >
                        <FontAwesomeIcon icon={faUserSlash} className="w-3 h-3 mr-1" />
                        Deactivate
                      </Button>
                    )}

                    {userRole === 'super_admin' && u.role === 'student' && !u.deactivated && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAction(u.id, 'promote_admin', `Promote ${u.name} to Admin?`)}
                        disabled={actionLoading === u.id}
                        className="text-xs text-blue-600 hover:text-blue-700 border-blue-200"
                      >
                        <FontAwesomeIcon icon={faUserShield} className="w-3 h-3 mr-1" />
                        Promote
                      </Button>
                    )}

                    {userRole === 'super_admin' && u.role === 'admin' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAction(u.id, 'demote_student', `Demote ${u.name} to student?`)}
                        disabled={actionLoading === u.id}
                        className="text-xs text-amber-600 hover:text-amber-700 border-amber-200"
                      >
                        Demote
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · {total} users
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
