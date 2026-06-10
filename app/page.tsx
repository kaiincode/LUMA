'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/header'
import { Banner } from '@/components/banner'
import { Footer } from '@/components/footer'
import { ImageToAscii } from '@/components/image-to-ascii'
import { AsciiOutput, type AsciiPayload } from '@/components/ascii-output'
import { RenderModeStrip } from '@/components/render-mode-strip'
import { WorkbenchControls } from '@/components/workbench-controls'
import type { RenderMode } from '@/lib/render-mode'
import {
  DEFAULT_MODE_SETTINGS,
  type ExportSize,
  type ModeSettings,
  type MotionMode,
} from '@/lib/render-settings'

export default function Home() {
  const [renderMode, setRenderMode] = useState<RenderMode>('ascii')
  const [asciiOutput, setAsciiOutput] = useState<AsciiPayload>('')
  const [motionMode, setMotionMode] = useState<MotionMode>('subtle')
  const [detail, setDetail] = useState(75)
  const [exportSize, setExportSize] = useState<ExportSize>('frame')
  const [modeSettingsByMode, setModeSettingsByMode] = useState(DEFAULT_MODE_SETTINGS)
  const [sourceAspect, setSourceAspect] = useState<number | null>(null)

  const modeSettings = modeSettingsByMode[renderMode]

  const handleClear = () => {
    setAsciiOutput('')
  }

  const handleModeSettingsChange = (settings: ModeSettings) => {
    setModeSettingsByMode((current) => ({
      ...current,
      [renderMode]: settings,
    }))
  }

  useEffect(() => {
    setAsciiOutput('')
  }, [renderMode])

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <Banner />

      <main className="flex-1 w-full px-4 py-10 md:py-14">
        <div className="max-w-6xl mx-auto">
          <RenderModeStrip value={renderMode} onChange={setRenderMode} />
          <WorkbenchControls
            motionMode={motionMode}
            onMotionModeChange={setMotionMode}
            detail={detail}
            onDetailChange={setDetail}
            exportSize={exportSize}
            onExportSizeChange={setExportSize}
            modeSettings={modeSettings}
            onModeSettingsChange={handleModeSettingsChange}
          />
          <div className="relative grid grid-cols-1 overflow-hidden border border-border bg-background lg:grid-cols-2">
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-40 h-px bg-border lg:inset-x-auto lg:inset-y-0 lg:left-1/2 lg:top-0 lg:h-auto lg:w-px" />
            <ImageToAscii
              renderMode={renderMode}
              onOutput={setAsciiOutput}
              variant="frame"
              aspect="square"
              motionMode={motionMode}
              detail={detail}
              modeSettings={modeSettings}
              onSourceAspectChange={setSourceAspect}
            />
            <AsciiOutput
              output={asciiOutput}
              onClear={handleClear}
              variant="frame"
              aspect="square"
              exportSize={exportSize}
              sourceAspect={sourceAspect}
            />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
