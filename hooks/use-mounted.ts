'use client'

import { useEffect, useState } from 'react'

/** True after mount — avoids SSR/client mismatch for theme-dependent UI. */
export function useMounted() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  return mounted
}
