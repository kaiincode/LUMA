'use client'

import type { LucideIcon } from 'lucide-react'
import {
  CircleDot,
  Grid2x2,
  Layers,
  Orbit,
  Sparkles,
  Type,
  Waves,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { RENDER_MODE_LABELS, RENDER_MODES, type RenderMode } from '@/lib/render-mode'

const MODE_ICONS: Record<RenderMode, LucideIcon> = {
  ascii: Type,
  dots: CircleDot,
  hatch: Layers,
  mosaic: Grid2x2,
  contour: Waves,
  stipple: Sparkles,
  halftone: Orbit,
}

type RenderModeStripProps = {
  value: RenderMode
  onChange: (mode: RenderMode) => void
}

export function RenderModeStrip({ value, onChange }: RenderModeStripProps) {
  return (
    <div className="w-full max-w-4xl mx-auto pb-8">
      <p className="text-center text-[0.65rem] font-medium uppercase tracking-[0.35em] text-muted-foreground mb-4">
        Render style
      </p>
      <div className="relative">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 md:w-14 bg-gradient-to-r from-background to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 md:w-14 bg-gradient-to-l from-background to-transparent"
          aria-hidden
        />
        <div
          role="radiogroup"
          aria-label="Choose render mode"
          className={cn(
            'flex gap-2 md:gap-2.5 overflow-x-auto px-10 md:px-12 py-2',
            'snap-x snap-mandatory justify-start md:justify-center',
            '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          )}
        >
          {RENDER_MODES.map((mode) => {
            const active = value === mode
            const Icon = MODE_ICONS[mode]
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange(mode)}
                className={cn(
                  'group relative flex shrink-0 snap-center flex-col items-center gap-2 rounded-2xl px-2.5 pt-3 pb-2.5 min-w-[4.75rem] md:min-w-[5.25rem]',
                  'transition-all duration-300 ease-out',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  active
                    ? 'text-foreground scale-[1.02]'
                    : 'text-muted-foreground hover:text-foreground/90 scale-100',
                )}
              >
                <span
                  className={cn(
                    'relative flex size-[2.875rem] items-center justify-center rounded-xl border transition-all duration-300',
                    active
                      ? 'border-foreground/25 bg-foreground/[0.06] shadow-[0_8px_28px_-8px_rgba(0,0,0,0.28)] dark:shadow-[0_8px_32px_-8px_rgba(255,255,255,0.12)]'
                      : 'border-border/60 bg-muted/25 group-hover:border-border group-hover:bg-muted/45',
                  )}
                >
                  {active && (
                    <span
                      className="absolute inset-0 rounded-xl opacity-40 dark:opacity-25"
                      style={{
                        background:
                          'radial-gradient(circle at 30% 20%, oklch(0.72 0.19 264 / 35%), transparent 55%), radial-gradient(circle at 70% 80%, oklch(0.78 0.15 84 / 30%), transparent 50%)',
                      }}
                    />
                  )}
                  <Icon
                    className={cn(
                      'relative size-[1.15rem] transition-transform duration-300',
                      active && 'scale-110',
                    )}
                    strokeWidth={active ? 2.25 : 1.75}
                  />
                </span>
                <span
                  className={cn(
                    'max-w-[5.5rem] text-center text-[0.68rem] font-semibold uppercase leading-tight tracking-[0.06em]',
                    active && 'text-foreground',
                  )}
                >
                  {RENDER_MODE_LABELS[mode]}
                </span>
                {active && (
                  <span
                    className="absolute bottom-1 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-foreground/70 dark:bg-foreground/85"
                    aria-hidden
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
