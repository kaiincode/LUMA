import type { Metadata } from 'next'

import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { Geist, Geist_Mono, Geist as V0_Font_Geist, Geist_Mono as V0_Font_Geist_Mono } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'

// Initialize fonts
const _geist = V0_Font_Geist({ subsets: ['latin'], weight: ["100","200","300","400","500","600","700","800","900"] })
const _geistMono = V0_Font_Geist_Mono({ subsets: ['latin'], weight: ["100","200","300","400","500","600","700","800","900"] })

const siteDescription =
  'Turn any image into colored generative art in the browser: ASCII, halftone dots, cross-hatch, mosaic tiles, contour strokes, stippling, and angled halftone. No upload to a server—processing stays on your device.'

export const metadata: Metadata = {
  title: {
    default: 'LUMA',
    template: '%s · LUMA',
  },
  description: siteDescription,
  keywords: [
    'LUMA',
    'generative art',
    'image to ASCII',
    'halftone',
    'cross-hatch',
    'mosaic',
    'stipple',
    'Next.js',
    'client-side',
  ],
  openGraph: {
    title: 'LUMA',
    description: siteDescription,
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'LUMA',
    description: siteDescription,
  },
  icons: {
    icon: [
      {
        url: '/logo-light.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/logo-dark.png',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    apple: [
      {
        url: '/logo-light.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/logo-dark.png',
        media: '(prefers-color-scheme: dark)',
      },
    ],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {children}
        </ThemeProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
