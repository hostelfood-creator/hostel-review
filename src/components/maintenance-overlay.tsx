'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faScrewdriverWrench } from '@fortawesome/free-solid-svg-icons'

export default function MaintenanceOverlay({ forceShow = false }: { forceShow?: boolean }) {
    const pathname = usePathname()
    const [isMaintenance, setIsMaintenance] = useState(false)
    const [loading, setLoading] = useState(true)
    const isSuperAdminRef = useRef(false)

    useEffect(() => {
        let pollTimer: ReturnType<typeof setInterval> | null = null

        const checkStatus = async () => {
            try {
                // Fetch user role and maintenance status in parallel
                const [userRes, maintRes] = await Promise.all([
                    fetch('/api/auth/me'),
                    fetch('/api/admin/maintenance'),
                ])

                const userData = await userRes.json()
                const role = userData?.user?.role || 'student'
                isSuperAdminRef.current = role === 'super_admin' || role === 'admin'

                if (maintRes.ok) {
                    const maintData = await maintRes.json()
                    if (maintData?.maintenance_mode && !isSuperAdminRef.current) {
                        setIsMaintenance(true)
                    }
                }
            } catch {
                // Fail open — if the check fails, don't block access
            } finally {
                setLoading(false)
            }
        }

        checkStatus()

        // Poll every 30s for maintenance status changes.
        // Supabase Realtime on site_settings is blocked by RLS for students,
        // so we poll the API route (which uses service role) instead.
        pollTimer = setInterval(async () => {
            try {
                const res = await fetch('/api/admin/maintenance')
                if (res.ok) {
                    const data = await res.json()
                    if (!isSuperAdminRef.current) {
                        setIsMaintenance(data?.maintenance_mode === true)
                    }
                }
            } catch {
                // Fail open
            }
        }, 30_000)

        return () => {
            if (pollTimer) clearInterval(pollTimer)
        }
    }, [])

    const finalIsMaintenance = forceShow || isMaintenance

    // Never block the login page — admins must be able to sign in to turn maintenance off
    if (pathname === '/login') return null
    if (!finalIsMaintenance) return null
    if (!forceShow && loading) return null

    return (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/95 backdrop-blur-md">
            <div className="flex flex-col items-center text-center max-w-md p-6 animate-in fade-in zoom-in duration-500">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                    <FontAwesomeIcon icon={faScrewdriverWrench} className="w-10 h-10 text-primary" />
                </div>
                <h1 className="text-3xl font-black text-foreground tracking-tight mb-3">
                    We&apos;ll be back soon!
                </h1>
                <p className="text-muted-foreground text-lg leading-relaxed mb-8">
                    The website is currently being updated. Please check back later. We apologize for any inconvenience.
                </p>
                <button
                    onClick={async () => {
                        await fetch('/api/auth/logout', { method: 'POST' })
                        window.location.href = '/login'
                    }}
                    className="px-5 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                    Sign Out
                </button>
            </div>
        </div>
    )
}
