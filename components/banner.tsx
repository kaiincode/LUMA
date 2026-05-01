'use client'

import { useTheme } from 'next-themes'
import { useMounted } from '@/hooks/use-mounted'

export function Banner() {
  const mounted = useMounted()
  const { theme, resolvedTheme } = useTheme()
  const useDarkAssets = mounted && (resolvedTheme ?? theme) === 'dark'

  return (
    <div className="w-full px-4 py-3">
      <img
        src={useDarkAssets ? '/banner-dark.png' : '/banner-light.png'}
        alt=""
        className="w-full max-w-xl mx-auto h-auto block select-none"
        draggable={false}
      />
    </div>
  )
}

