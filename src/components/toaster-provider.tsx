<<<<<<< HEAD
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
=======
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
>>>>>>> 0200fb90bb8a9c38a8b428bf606ec91468124b07
