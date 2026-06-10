'use client'

import { useEffect, useRef, useState } from 'react'
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
import { RENDER_MODES, type RenderMode } from '@/lib/render-mode'

const MODE_DETAILS: Record<
  RenderMode,
  {
    label: string
    icon: LucideIcon
    description: string
  }
> = {
  ascii: {
    label: 'ASCII',
    icon: Type,
    description: 'Classic text character structures mapped by luminance grids.',
  },
  dots: {
    label: 'Dots',
    icon: CircleDot,
    description: 'Crisp Braille and variable-density circular grids.',
  },
  hatch: {
    label: 'Hatch',
    icon: Layers,
    description: 'Sketch-like hand-drawn cross-hatching shading details.',
  },
  mosaic: {
    label: 'Mosaic',
    icon: Grid2x2,
    description: 'Retro block tiles and stylized digital mosaic cells.',
  },
  contour: {
    label: 'Contour',
    icon: Waves,
    description: 'Fluid topographic vector wave lines charting lighting levels.',
  },
  stipple: {
    label: 'Stipple',
    icon: Sparkles,
    description: 'Delicate vintage ink-stippled pointillism shading dots.',
  },
  halftone: {
    label: 'Halftone',
    icon: Orbit,
    description: 'Classic newsprint press halftone circular grids.',
  },
}

type RenderModeStripProps = {
  value: RenderMode
  onChange: (mode: RenderMode) => void
}

export function RenderModeStrip({ value, onChange }: RenderModeStripProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 })

  const updatePill = () => {
    const activeIndex = RENDER_MODES.indexOf(value)
    const activeBtn = buttonRefs.current[activeIndex]
    if (activeBtn) {
      setPillStyle({
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
      })
    }
  }

  // Handle auto-scroll to active button on mobile
  const scrollToActive = () => {
    const activeIndex = RENDER_MODES.indexOf(value)
    const activeBtn = buttonRefs.current[activeIndex]
    const container = containerRef.current
    if (activeBtn && container) {
      const containerWidth = container.offsetWidth
      const btnLeft = activeBtn.offsetLeft
      const btnWidth = activeBtn.offsetWidth
      
      // Center the active button in the viewport
      container.scrollTo({
        left: btnLeft - containerWidth / 2 + btnWidth / 2,
        behavior: 'smooth',
      })
    }
  }

  useEffect(() => {
    updatePill()
    scrollToActive()
    window.addEventListener('resize', updatePill)
    return () => window.removeEventListener('resize', updatePill)
  }, [value])

  // Small delay on mount to ensure elements have painted and offset values are correct
  useEffect(() => {
    const timer = setTimeout(() => {
      updatePill()
      scrollToActive()
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="w-full">
      <div className="relative">
        {/* Main Segmented Pill Container */}
        <div
          ref={containerRef}
          role="radiogroup"
          aria-label="Choose render mode"
          className={cn(
            'relative mx-auto grid w-full grid-cols-7 items-stretch',
            'border border-b-0 border-border bg-background',
            'overflow-x-auto select-none scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          )}
        >
          {/* Square active plate */}
          {pillStyle.width > 0 && (
            <div
              className={cn(
                'absolute inset-y-0 transition-all duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
                'bg-zinc-100 dark:bg-zinc-900'
              )}
              style={{
                left: `${pillStyle.left}px`,
                width: `${pillStyle.width}px`,
              }}
            />
          )}

          {/* Mode Tabs */}
          {RENDER_MODES.map((mode, index) => {
            const active = value === mode
            const details = MODE_DETAILS[mode]
            const Icon = details.icon

            return (
              <button
                key={mode}
                ref={(el) => {
                  buttonRefs.current[index] = el
                }}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange(mode)}
                className={cn(
                  'group relative z-10 flex min-w-0 items-center justify-center gap-1.5 border-r border-border px-1.5 py-3 last:border-r-0 md:gap-2 md:px-3',
                  'cursor-pointer select-none transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset'
                )}
              >
                {/* Subtle hover highlight for inactive elements */}
                {!active && (
                  <span className="absolute inset-0 bg-zinc-200/0 transition-colors duration-150 hover:bg-zinc-200/40 dark:bg-zinc-800/0 dark:hover:bg-zinc-800/35" />
                )}

                {/* Inline Icon */}
                <Icon
                  className={cn(
                    'size-3.5 shrink-0 transition-colors duration-150',
                    active
                      ? 'text-foreground'
                      : 'text-muted-foreground/75 group-hover:text-foreground/90'
                  )}
                  strokeWidth={active ? 2.5 : 1.75}
                />

                {/* Label - non-wrapping tracking label */}
                <span
                  className={cn(
                    'truncate text-[0.58rem] font-semibold uppercase leading-none tracking-normal transition-colors duration-150 sm:text-[0.68rem] md:text-xs',
                    active
                      ? 'text-foreground'
                      : 'text-muted-foreground/75 group-hover:text-foreground/90'
                  )}
                >
                  {details.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
