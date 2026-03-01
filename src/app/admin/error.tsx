'use client'

import { useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTriangleExclamation, faArrowRotateRight, faHouse } from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/components/ui/button'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Admin panel error:', error)
  }, [error])

  return (
    <div className="flex items-center justify-center py-20 px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-xl bg-red-100 dark:bg-red-500/10 flex items-center justify-center">
          <FontAwesomeIcon icon={faTriangleExclamation} className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Admin Panel Error</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Something went wrong in the admin panel. Try refreshing or go back.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/50 mb-4 font-mono">ID: {error.digest}</p>
        )}
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => (window.location.href = '/admin')}>
            <FontAwesomeIcon icon={faHouse} className="w-3.5 h-3.5 mr-1.5" />
            Admin Home
          </Button>
          <Button size="sm" onClick={reset}>
            <FontAwesomeIcon icon={faArrowRotateRight} className="w-3.5 h-3.5 mr-1.5" />
            Retry
          </Button>
        </div>
      </div>
    </div>
  )
}
