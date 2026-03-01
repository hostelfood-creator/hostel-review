'use client'

import { useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTriangleExclamation, faArrowRotateRight, faHouse } from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/components/ui/button'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Application error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-red-100 dark:bg-red-500/10 flex items-center justify-center">
          <FontAwesomeIcon icon={faTriangleExclamation} className="w-10 h-10 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Something went wrong</h1>
        <p className="text-muted-foreground mb-1">
          An unexpected error occurred. Don&apos;t worry, your data is safe.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/60 mb-6 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => (window.location.href = '/')}>
            <FontAwesomeIcon icon={faHouse} className="w-4 h-4 mr-2" />
            Go Home
          </Button>
          <Button onClick={reset}>
            <FontAwesomeIcon icon={faArrowRotateRight} className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    </div>
  )
}
