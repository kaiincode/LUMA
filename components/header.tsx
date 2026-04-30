'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function Header() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const isDark = (resolvedTheme ?? theme) === 'dark'

  return (
    <header className="w-full bg-background">
      <div className="max-w-full mx-auto px-4 py-4 grid grid-cols-3 items-center">
        <div className="flex items-center justify-start">
          <span className="sr-only">LUMA</span>
        </div>

        <Link href="/" className="inline-flex items-center justify-center" aria-label="LUMA">
          <img
            src={isDark ? '/logo-dark.png' : '/logo-light.png'}
            alt="LUMA"
            className="h-16 md:h-20 w-auto opacity-95"
          />
        </Link>

        <div className="flex items-center justify-end">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="rounded-full"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </header>
  )
}
