<<<<<<< HEAD
'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Trash2, UserPlus, Building2, Plus } from 'lucide-react'

// Types based on the API response
type AdminUser = {
    id: string
    register_id: string
    name: string
    email: string
    role: string
    hostel_block: string | null
    created_at: string
}

type HostelBlock = {
    id: string
    name: string
}

export default function SuperAdminPage() {
    const [admins, setAdmins] = useState<AdminUser[]>([])
    const [blocks, setBlocks] = useState<HostelBlock[]>([])
    const [loading, setLoading] = useState(true)
    const [isSuperAdmin, setIsSuperAdmin] = useState(true)

    // Form states
    const [newBlockName, setNewBlockName] = useState('')
    const [creatingBlock, setCreatingBlock] = useState(false)

    const [newAdmin, setNewAdmin] = useState({
        registerId: '',
        name: '',
        password: '',
        hostelBlock: '',
        role: 'admin',
    })
    const [creatingAdmin, setCreatingAdmin] = useState(false)

    // Fetch data
    const loadData = async () => {
        try {
            const res = await fetch('/api/admin/super')
            if (res.status === 403 || res.status === 401) {
                // Regular admin — not authorized for this page
                setIsSuperAdmin(false)
                return
            }
            if (res.ok) {
                const data = await res.json()
                setAdmins(data.admins || [])
                setBlocks(data.blocks || [])
            } else {
                toast.error('Failed to load admin data')
            }
        } catch {
            toast.error('Network error loading data')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadData()
    }, [])

    // Handlers
    const handleAddBlock = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newBlockName.trim()) return

        setCreatingBlock(true)
        try {
            const res = await fetch('/api/admin/super', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'add_block', name: newBlockName }),
            })

            const data = await res.json()
            if (res.ok) {
                toast.success(`Block ${newBlockName} added successfully`)
                setNewBlockName('')
                loadData()
            } else {
                toast.error(data.error || 'Failed to add block')
            }
        } catch {
            toast.error('Network error')
        } finally {
            setCreatingBlock(false)
        }
    }

    const handleDeleteBlock = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete block ${name}?`)) return

        try {
            const res = await fetch('/api/admin/super', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'remove_block', id }),
            })

            if (res.ok) {
                toast.success('Block removed')
                loadData()
            } else {
                const data = await res.json()
                toast.error(data.error || 'Failed to remove block')
            }
        } catch {
            toast.error('Network error')
        }
    }

    const handleAddAdmin = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newAdmin.registerId || !newAdmin.name || !newAdmin.password) {
            toast.error('Please fill required fields')
            return
        }

        setCreatingAdmin(true)
        try {
            const res = await fetch('/api/admin/super', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'add_admin', ...newAdmin }),
            })

            const data = await res.json()
            if (res.ok) {
                toast.success(`${newAdmin.role === 'super_admin' ? 'Super Admin' : 'Admin'} ${newAdmin.name} created successfully`)
                setNewAdmin({ registerId: '', name: '', password: '', hostelBlock: '', role: 'admin' })
                loadData()
            } else {
                toast.error(data.error || 'Failed to create admin')
            }
        } catch {
            toast.error('Network error')
        } finally {
            setCreatingAdmin(false)
        }
    }

    const handleDeleteAdmin = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to remove admin ${name}?`)) return

        try {
            const res = await fetch('/api/admin/super', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'remove_admin', id }),
            })

            if (res.ok) {
                toast.success('Admin removed')
                loadData()
            } else {
                const data = await res.json()
                toast.error(data.error || 'Failed to remove admin')
            }
        } catch {
            toast.error('Network error')
        }
    }

    if (loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    if (!isSuperAdmin) {
        return (
            <div className="flex h-[50vh] flex-col items-center justify-center text-center gap-4 p-6">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                    <Building2 className="w-8 h-8 text-destructive" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-foreground">Access Restricted</h2>
                    <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                        This section is only accessible to Super Admins. Please contact your system administrator if you need access.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-8 max-w-5xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Super Admin Panel</h1>
                <p className="text-muted-foreground mt-2">
                    Manage hostel blocks and administrator accounts across the institution.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                {/* --- BLOCKS MANAGEMENT --- */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-primary" />
                                Add Hostel Block
                            </CardTitle>
                            <CardDescription>Create a new hostel block.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleAddBlock} className="flex gap-3">
                                <Input
                                    placeholder="Enter Hostel Block Name"
                                    value={newBlockName}
                                    onChange={(e) => setNewBlockName(e.target.value)}
                                    disabled={creatingBlock}
                                    className="flex-1"
                                />
                                <Button type="submit" disabled={creatingBlock || !newBlockName.trim()}>
                                    {creatingBlock ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                                    Add Block
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Existing Blocks</CardTitle>
                            <CardDescription>{blocks.length} blocks configured.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {blocks.length === 0 ? (
                                <div className="text-center py-6 text-muted-foreground text-sm border border-dashed rounded-lg bg-muted/50">
                                    No blocks found. Add one above.
                                </div>
                            ) : (
                                <div className="divide-y border rounded-lg overflow-hidden">
                                    {blocks.map((block) => (
                                        <div key={block.id} className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                                            <span className="font-medium text-sm">{block.name}</span>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDeleteBlock(block.id, block.name)}
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>


                {/* --- ADMIN MANAGEMENT --- */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <UserPlus className="w-5 h-5 text-primary" />
                                Add Wardens / Admins
                            </CardTitle>
                            <CardDescription>Create a new administrator account.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleAddAdmin} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Register ID *</Label>
                                        <Input
                                            placeholder="Enter Admin User ID"
                                            value={newAdmin.registerId}
                                            onChange={(e) => setNewAdmin({ ...newAdmin, registerId: e.target.value })}
                                            disabled={creatingAdmin}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Full Name *</Label>
                                        <Input
                                            placeholder="Enter Admin Full Name"
                                            value={newAdmin.name}
                                            onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })}
                                            disabled={creatingAdmin}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">Password *</Label>
                                    <Input
                                        type="password"
                                        placeholder="Min 8 characters"
                                        value={newAdmin.password}
                                        onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                                        disabled={creatingAdmin}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Role *</Label>
                                        <Select
                                            disabled={creatingAdmin}
                                            value={newAdmin.role}
                                            onValueChange={(val) => setNewAdmin({ ...newAdmin, role: val, hostelBlock: '' })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="admin">Admin (Block Warden)</SelectItem>
                                                <SelectItem value="super_admin">Super Admin (All Access)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {newAdmin.role === 'admin' && (
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Assign Block (Optional)</Label>
                                            <Select
                                                disabled={creatingAdmin || blocks.length === 0}
                                                value={newAdmin.hostelBlock}
                                                onValueChange={(val) => setNewAdmin({ ...newAdmin, hostelBlock: val === 'none' ? '' : val })}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Block" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">-- General Admin --</SelectItem>
                                                    {blocks.map(b => (
                                                        <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                </div>

                                <Button type="submit" className="w-full" disabled={creatingAdmin || !newAdmin.registerId || !newAdmin.name || !newAdmin.password}>
                                    {creatingAdmin ? 'Creating...' : 'Create Admin Account'}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Administrators</CardTitle>
                            <CardDescription>{admins.length} accounts configured.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="divide-y border rounded-lg overflow-hidden">
                                {admins.map((admin) => (
                                    <div key={admin.id} className="p-3 hover:bg-muted/50 transition-colors flex items-center justify-between">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-sm">{admin.name}</span>
                                                {admin.role === 'super_admin' && (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary uppercase">
                                                        Super
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                                <span>{admin.register_id}</span>
                                                <span>•</span>
                                                <span>{admin.hostel_block || 'General'}</span>
                                            </div>
                                        </div>
                                        {admin.role !== 'super_admin' && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDeleteAdmin(admin.id, admin.name)}
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>

            </div>
        </div>
    )
}
=======
'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Trash2, UserPlus, Building2, Plus } from 'lucide-react'

// Types based on the API response
type AdminUser = {
    id: string
    register_id: string
    name: string
    email: string
    role: string
    hostel_block: string | null
    created_at: string
}

type HostelBlock = {
    id: string
    name: string
}

export default function SuperAdminPage() {
    const [admins, setAdmins] = useState<AdminUser[]>([])
    const [blocks, setBlocks] = useState<HostelBlock[]>([])
    const [loading, setLoading] = useState(true)
    const [isSuperAdmin, setIsSuperAdmin] = useState(true)

    // Form states
    const [newBlockName, setNewBlockName] = useState('')
    const [creatingBlock, setCreatingBlock] = useState(false)

    const [newAdmin, setNewAdmin] = useState({
        registerId: '',
        name: '',
        password: '',
        hostelBlock: '',
        role: 'admin',
    })
    const [creatingAdmin, setCreatingAdmin] = useState(false)

    // Fetch data
    const loadData = async () => {
        try {
            const res = await fetch('/api/admin/super')
            if (res.status === 403 || res.status === 401) {
                // Regular admin — not authorized for this page
                setIsSuperAdmin(false)
                return
            }
            if (res.ok) {
                const data = await res.json()
                setAdmins(data.admins || [])
                setBlocks(data.blocks || [])
            } else {
                toast.error('Failed to load admin data')
            }
        } catch {
            toast.error('Network error loading data')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadData()
    }, [])

    // Handlers
    const handleAddBlock = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newBlockName.trim()) return

        setCreatingBlock(true)
        try {
            const res = await fetch('/api/admin/super', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'add_block', name: newBlockName }),
            })

            const data = await res.json()
            if (res.ok) {
                toast.success(`Block ${newBlockName} added successfully`)
                setNewBlockName('')
                loadData()
            } else {
                toast.error(data.error || 'Failed to add block')
            }
        } catch {
            toast.error('Network error')
        } finally {
            setCreatingBlock(false)
        }
    }

    const handleDeleteBlock = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete block ${name}?`)) return

        try {
            const res = await fetch('/api/admin/super', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'remove_block', id }),
            })

            if (res.ok) {
                toast.success('Block removed')
                loadData()
            } else {
                const data = await res.json()
                toast.error(data.error || 'Failed to remove block')
            }
        } catch {
            toast.error('Network error')
        }
    }

    const handleAddAdmin = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newAdmin.registerId || !newAdmin.name || !newAdmin.password) {
            toast.error('Please fill required fields')
            return
        }

        setCreatingAdmin(true)
        try {
            const res = await fetch('/api/admin/super', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'add_admin', ...newAdmin }),
            })

            const data = await res.json()
            if (res.ok) {
                toast.success(`${newAdmin.role === 'super_admin' ? 'Super Admin' : 'Admin'} ${newAdmin.name} created successfully`)
                setNewAdmin({ registerId: '', name: '', password: '', hostelBlock: '', role: 'admin' })
                loadData()
            } else {
                toast.error(data.error || 'Failed to create admin')
            }
        } catch {
            toast.error('Network error')
        } finally {
            setCreatingAdmin(false)
        }
    }

    const handleDeleteAdmin = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to remove admin ${name}?`)) return

        try {
            const res = await fetch('/api/admin/super', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'remove_admin', id }),
            })

            if (res.ok) {
                toast.success('Admin removed')
                loadData()
            } else {
                const data = await res.json()
                toast.error(data.error || 'Failed to remove admin')
            }
        } catch {
            toast.error('Network error')
        }
    }

    if (loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    if (!isSuperAdmin) {
        return (
            <div className="flex h-[50vh] flex-col items-center justify-center text-center gap-4 p-6">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                    <Building2 className="w-8 h-8 text-destructive" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-foreground">Access Restricted</h2>
                    <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                        This section is only accessible to Super Admins. Please contact your system administrator if you need access.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-8 max-w-5xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Super Admin Panel</h1>
                <p className="text-muted-foreground mt-2">
                    Manage hostel blocks and administrator accounts across the institution.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                {/* --- BLOCKS MANAGEMENT --- */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-primary" />
                                Add Hostel Block
                            </CardTitle>
                            <CardDescription>Create a new hostel block.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleAddBlock} className="flex gap-3">
                                <Input
                                    placeholder="Enter Hostel Block Name"
                                    value={newBlockName}
                                    onChange={(e) => setNewBlockName(e.target.value)}
                                    disabled={creatingBlock}
                                    className="flex-1"
                                />
                                <Button type="submit" disabled={creatingBlock || !newBlockName.trim()}>
                                    {creatingBlock ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                                    Add Block
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Existing Blocks</CardTitle>
                            <CardDescription>{blocks.length} blocks configured.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {blocks.length === 0 ? (
                                <div className="text-center py-6 text-muted-foreground text-sm border border-dashed rounded-lg bg-muted/50">
                                    No blocks found. Add one above.
                                </div>
                            ) : (
                                <div className="divide-y border rounded-lg overflow-hidden">
                                    {blocks.map((block) => (
                                        <div key={block.id} className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                                            <span className="font-medium text-sm">{block.name}</span>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDeleteBlock(block.id, block.name)}
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>


                {/* --- ADMIN MANAGEMENT --- */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <UserPlus className="w-5 h-5 text-primary" />
                                Add Wardens / Admins
                            </CardTitle>
                            <CardDescription>Create a new administrator account.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleAddAdmin} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Register ID *</Label>
                                        <Input
                                            placeholder="Enter Admin User ID"
                                            value={newAdmin.registerId}
                                            onChange={(e) => setNewAdmin({ ...newAdmin, registerId: e.target.value })}
                                            disabled={creatingAdmin}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Full Name *</Label>
                                        <Input
                                            placeholder="Enter Admin Full Name"
                                            value={newAdmin.name}
                                            onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })}
                                            disabled={creatingAdmin}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">Password *</Label>
                                    <Input
                                        type="password"
                                        placeholder="Min 8 characters"
                                        value={newAdmin.password}
                                        onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                                        disabled={creatingAdmin}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Role *</Label>
                                        <Select
                                            disabled={creatingAdmin}
                                            value={newAdmin.role}
                                            onValueChange={(val) => setNewAdmin({ ...newAdmin, role: val, hostelBlock: '' })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="admin">Admin (Block Warden)</SelectItem>
                                                <SelectItem value="super_admin">Super Admin (All Access)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {newAdmin.role === 'admin' && (
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Assign Block (Optional)</Label>
                                            <Select
                                                disabled={creatingAdmin || blocks.length === 0}
                                                value={newAdmin.hostelBlock}
                                                onValueChange={(val) => setNewAdmin({ ...newAdmin, hostelBlock: val === 'none' ? '' : val })}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Block" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">-- General Admin --</SelectItem>
                                                    {blocks.map(b => (
                                                        <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                </div>

                                <Button type="submit" className="w-full" disabled={creatingAdmin || !newAdmin.registerId || !newAdmin.name || !newAdmin.password}>
                                    {creatingAdmin ? 'Creating...' : 'Create Admin Account'}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Administrators</CardTitle>
                            <CardDescription>{admins.length} accounts configured.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="divide-y border rounded-lg overflow-hidden">
                                {admins.map((admin) => (
                                    <div key={admin.id} className="p-3 hover:bg-muted/50 transition-colors flex items-center justify-between">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-sm">{admin.name}</span>
                                                {admin.role === 'super_admin' && (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary uppercase">
                                                        Super
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                                <span>{admin.register_id}</span>
                                                <span>•</span>
                                                <span>{admin.hostel_block || 'General'}</span>
                                            </div>
                                        </div>
                                        {admin.role !== 'super_admin' && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDeleteAdmin(admin.id, admin.name)}
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>

            </div>
        </div>
    )
}
>>>>>>> 0200fb90bb8a9c38a8b428bf606ec91468124b07
