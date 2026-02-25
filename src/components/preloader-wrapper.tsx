'use client'

import { useState } from 'react'
import { LogoPreloader } from '@/components/ui/logo-preloader'

export function PreloaderWrapper() {
    const [showPreloader, setShowPreloader] = useState(true)

    if (!showPreloader) return null

    return (
        <LogoPreloader
            duration={1.8}
            logoSize={120}
            onComplete={() => setShowPreloader(false)}
        />
    )
}
