'use client'

import { useState } from 'react'
import { Header } from '@/components/header'
import { Banner } from '@/components/banner'
import { Footer } from '@/components/footer'
import { ImageToAscii } from '@/components/image-to-ascii'
import { AsciiOutput } from '@/components/ascii-output'

type AsciiPayload = '' | { plain: string; cols: number; rows: number; colors: Uint8ClampedArray }

export default function Home() {
  const [asciiOutput, setAsciiOutput] = useState<AsciiPayload>('')

  const handleClear = () => {
    setAsciiOutput('')
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <Banner />

      <main className="flex-1 w-full px-4 py-10 md:py-14">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ImageToAscii onOutput={setAsciiOutput} variant="frame" aspect="square" />
            <AsciiOutput output={asciiOutput} onClear={handleClear} variant="frame" aspect="square" />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
