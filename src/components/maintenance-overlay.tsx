<<<<<<< HEAD
'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faScrewdriverWrench } from '@fortawesome/free-solid-svg-icons'

export default function MaintenanceOverlay() {
    const pathname = usePathname()
    const [isMaintenance, setIsMaintenance] = useState(false)
    const [loading, setLoading] = useState(true)
    // Use a ref so the Realtime callback always reads the latest value (avoids stale closure)
    const isSuperAdminRef = useRef(false)

    useEffect(() => {
        const supabase = createClient()

        const checkStatus = async () => {
            try {
                // Determine if this user is a super admin
                const userRes = await fetch('/api/auth/me')
                const userData = await userRes.json()
                const role = userData?.user?.role || 'student'
                isSuperAdminRef.current = role === 'super_admin' || role === 'admin'

                // Fetch initial maintenance status from the DB
                const { data } = await supabase
                    .from('site_settings')
                    .select('maintenance_mode')
                    .eq('id', 1)
                    .single()

                if (data?.maintenance_mode && !isSuperAdminRef.current) {
                    setIsMaintenance(true)
                }
            } catch (err) {
                console.error('Failed to check maintenance mode:', err)
            } finally {
                setLoading(false)
            }
        }

        checkStatus()

        // Use ref in the callback so it always reads the up-to-date admin status
        const channel = supabase.channel('site_settings_overlay')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'site_settings', filter: 'id=eq.1' }, (payload) => {
                const isOn = payload.new.maintenance_mode === true
                // Only non-admins get locked out
                if (!isSuperAdminRef.current) {
                    setIsMaintenance(isOn)
                }
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])  // Run once on mount — ref keeps the value current without re-subscribing

    // Never block the login page — admins must be able to sign in to turn maintenance off
    if (loading || !isMaintenance || pathname === '/login') return null

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
=======
'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faScrewdriverWrench } from '@fortawesome/free-solid-svg-icons'

export default function MaintenanceOverlay() {
    const pathname = usePathname()
    const [isMaintenance, setIsMaintenance] = useState(false)
    const [loading, setLoading] = useState(true)
    // Use a ref so the Realtime callback always reads the latest value (avoids stale closure)
    const isSuperAdminRef = useRef(false)

    useEffect(() => {
        const supabase = createClient()

        const checkStatus = async () => {
            try {
                // Determine if this user is a super admin
                const userRes = await fetch('/api/auth/me')
                const userData = await userRes.json()
                const role = userData?.user?.role || 'student'
                isSuperAdminRef.current = role === 'super_admin' || role === 'admin'

                // Fetch initial maintenance status from the DB
                const { data } = await supabase
                    .from('site_settings')
                    .select('maintenance_mode')
                    .eq('id', 1)
                    .single()

                if (data?.maintenance_mode && !isSuperAdminRef.current) {
                    setIsMaintenance(true)
                }
            } catch (err) {
                console.error('Failed to check maintenance mode:', err)
            } finally {
                setLoading(false)
            }
        }

        checkStatus()

        // Use ref in the callback so it always reads the up-to-date admin status
        const channel = supabase.channel('site_settings_overlay')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'site_settings', filter: 'id=eq.1' }, (payload) => {
                const isOn = payload.new.maintenance_mode === true
                // Only non-admins get locked out
                if (!isSuperAdminRef.current) {
                    setIsMaintenance(isOn)
                }
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])  // Run once on mount — ref keeps the value current without re-subscribing

    // Never block the login page — admins must be able to sign in to turn maintenance off
    if (loading || !isMaintenance || pathname === '/login') return null

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
>>>>>>> 0200fb90bb8a9c38a8b428bf606ec91468124b07
