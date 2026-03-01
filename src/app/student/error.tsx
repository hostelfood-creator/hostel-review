'use client'

import { useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTriangleExclamation, faArrowRotateRight, faHouse } from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/components/ui/button'

export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Student dashboard error:', error)
  }, [error])

  return (
    <div className="flex items-center justify-center py-20 px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-xl bg-orange-100 dark:bg-orange-500/10 flex items-center justify-center">
          <FontAwesomeIcon icon={faTriangleExclamation} className="w-8 h-8 text-orange-500" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Oops! Something broke</h2>
        <p className="text-sm text-muted-foreground mb-6">
          We hit an unexpected error. Your reviews are safe — try again.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => (window.location.href = '/student')}>
            <FontAwesomeIcon icon={faHouse} className="w-3.5 h-3.5 mr-1.5" />
            Dashboard
          </Button>
          <Button size="sm" onClick={reset}>
            <FontAwesomeIcon icon={faArrowRotateRight} className="w-3.5 h-3.5 mr-1.5" />
            Try Again
          </Button>
        </div>
      </div>
    </div>
  )
}
