'use client'

import { useTheme } from 'next-themes'

export function Banner() {
  const { theme, resolvedTheme } = useTheme()
  const isDark = (resolvedTheme ?? theme) === 'dark'

  return (
    <div className="w-full px-4 py-3">
      <img
        src={isDark ? '/banner-dark.png' : '/banner-light.png'}
        alt=""
        className="w-full max-w-xl mx-auto h-auto block select-none"
        draggable={false}
      />
    </div>
  )
}

