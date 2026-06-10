'use client'

import { Activity, Gauge, ImageDown, SlidersHorizontal } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import type { ExportSize, ModeSettings, MotionMode } from '@/lib/render-settings'
import { EXPORT_SIZE_LABELS } from '@/lib/render-settings'

type WorkbenchControlsProps = {
  motionMode: MotionMode
  onMotionModeChange: (mode: MotionMode) => void
  detail: number
  onDetailChange: (detail: number) => void
  exportSize: ExportSize
  onExportSizeChange: (size: ExportSize) => void
  modeSettings: ModeSettings
  onModeSettingsChange: (settings: ModeSettings) => void
}

const MOTION_MODES: MotionMode[] = ['still', 'subtle', 'live']
const EXPORT_SIZES: ExportSize[] = ['frame', 'square1080', 'poster2k', 'source']

const motionLabels: Record<MotionMode, string> = {
  still: 'Still',
  subtle: 'Subtle',
  live: 'Live',
}

export function WorkbenchControls({
  motionMode,
  onMotionModeChange,
  detail,
  onDetailChange,
  exportSize,
  onExportSizeChange,
  modeSettings,
  onModeSettingsChange,
}: WorkbenchControlsProps) {
  return (
    <div className="grid border-x border-b border-t border-x-border border-b-border border-t-white bg-background dark:border-t-white/20 lg:grid-cols-7">
      <div className="flex min-h-14 items-center gap-3 border-b border-border px-3 py-2 lg:col-span-2 lg:border-b-0 lg:border-r">
        <Gauge className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[0.65rem] font-semibold uppercase text-muted-foreground">Detail</span>
            <span className="text-xs tabular-nums text-muted-foreground">{detail}%</span>
          </div>
          <Slider
            value={[detail]}
            min={45}
            max={100}
            step={5}
            onValueChange={([next]) => onDetailChange(next ?? detail)}
            aria-label="Render detail"
          />
        </div>
      </div>

      <div className="flex min-h-14 items-stretch border-b border-border lg:col-span-2 lg:border-b-0 lg:border-r">
        <div className="flex w-10 items-center justify-center border-r border-border">
          <Activity className="size-4 text-muted-foreground" />
        </div>
        <div className="grid flex-1 grid-cols-3">
          {MOTION_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onMotionModeChange(mode)}
              className={cn(
                'border-r border-border px-2 text-xs font-semibold uppercase last:border-r-0',
                'transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset',
                motionMode === mode ? 'bg-zinc-100 text-foreground dark:bg-zinc-900' : 'text-muted-foreground',
              )}
            >
              {motionLabels[mode]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-14 items-center gap-3 border-b border-border px-3 py-2 lg:col-span-2 lg:border-b-0 lg:border-r">
        <SlidersHorizontal className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[0.65rem] font-semibold uppercase text-muted-foreground">Strength</span>
            <span className="text-xs tabular-nums text-muted-foreground">{modeSettings.strength}%</span>
          </div>
          <Slider
            value={[modeSettings.strength]}
            min={35}
            max={100}
            step={5}
            onValueChange={([next]) => onModeSettingsChange({ strength: next ?? modeSettings.strength })}
            aria-label="Mode strength"
          />
        </div>
      </div>

      <div className="flex min-h-14 items-stretch lg:col-span-1">
        <div className="flex w-10 items-center justify-center border-r border-border">
          <ImageDown className="size-4 text-muted-foreground" />
        </div>
        <Select value={exportSize} onValueChange={(value) => onExportSizeChange(value as ExportSize)}>
          <SelectTrigger
            aria-label="Export size"
            className={cn(
              'h-full min-h-14 flex-1 rounded-none border-0 bg-transparent px-2 text-xs font-semibold uppercase shadow-none',
              'focus:ring-0 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset',
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end" className="rounded-none">
            {EXPORT_SIZES.map((size) => (
              <SelectItem key={size} value={size}>
                {EXPORT_SIZE_LABELS[size]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
