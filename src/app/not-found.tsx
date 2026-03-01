import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSearchMinus, faHouse } from '@fortawesome/free-solid-svg-icons'
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="text-8xl font-black text-primary/15 mb-2 select-none">404</div>
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-primary/10 flex items-center justify-center">
          <FontAwesomeIcon icon={faSearchMinus} className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Page not found</h1>
        <p className="text-muted-foreground mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <FontAwesomeIcon icon={faHouse} className="w-4 h-4" />
          Back to Home
        </Link>
      </div>
    </div>
  )
}
