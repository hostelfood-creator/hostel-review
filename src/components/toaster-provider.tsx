'use client'

import { Toaster } from 'sonner'
import { useTheme } from '@/lib/theme'

export function ToasterProvider() {
    const { theme } = useTheme()

    return (
        <Toaster
            richColors
            position="top-center"
            theme={theme}
            toastOptions={{
                style: {
                    fontSize: '14px',
                },
            }}
        />
    )
}
