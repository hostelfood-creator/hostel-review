'use client'

import { useLocale, LOCALES, type Locale } from '@/lib/i18n'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGlobe } from '@fortawesome/free-solid-svg-icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

export function LanguageSwitcher({ variant = 'default' }: { variant?: 'default' | 'compact' }) {
  const { locale, setLocale } = useLocale()

  const currentLocale = LOCALES.find((l) => l.code === locale) || LOCALES[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={variant === 'compact' ? 'icon' : 'sm'}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          aria-label="Change language"
        >
          <FontAwesomeIcon icon={faGlobe} className="w-4 h-4" />
          {variant !== 'compact' && (
            <span className="text-xs font-medium">{currentLocale.nativeLabel}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => setLocale(l.code as Locale)}
            className={`flex items-center justify-between gap-3 cursor-pointer ${
              locale === l.code ? 'bg-accent' : ''
            }`}
          >
            <span className="text-sm font-medium">{l.nativeLabel}</span>
            <span className="text-xs text-muted-foreground">{l.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
