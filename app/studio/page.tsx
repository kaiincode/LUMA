import type { Metadata, Viewport } from 'next'
import { Studio } from '@/components/studio/studio'

export const metadata: Metadata = {
  title: 'Studio',
}

// Lets the tool bar sit above the home indicator on phones with rounded screens.
export const viewport: Viewport = {
  viewportFit: 'cover',
}

export default function StudioPage() {
  return <Studio />
}
