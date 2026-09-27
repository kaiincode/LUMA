'use client'

import { useEffect, useRef } from 'react'
import { RENDER_MODE_LABELS, RENDER_MODES, type RenderMode } from '@/lib/render-mode'
import { MODE_WEIGHT } from '@/lib/render-settings'
import { drawPattern, PAPER_COLOR, type LumaField, type Paper } from '@/lib/luma/engine'
import { cn } from '@/lib/utils'

function Thumb({ field, mode, paper, font }: { field: LumaField | null; mode: RenderMode; paper: Paper; font: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const size = canvas.clientWidth || 64
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = PAPER_COLOR[paper]
    ctx.fillRect(0, 0, size, size)
    if (field) drawPattern(ctx, field, mode, { x: 0, y: 0, w: size, h: size }, { paper, strength: MODE_WEIGHT[mode], font })
  }, [field, mode, paper, font])
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="aspect-square w-full rounded-md"
      style={{ background: PAPER_COLOR[paper] }}
    />
  )
}

type StylePickerProps = {
  /** Radio group name; must be unique when more than one picker is on the page. */
  name: string
  value: RenderMode
  onChange: (mode: RenderMode) => void
  /** Small square fields for the thumbnails: text-shaped cells for ASCII, square for the rest. */
  thumbs: { square: LumaField | null; text: LumaField | null }
  paper: Paper
  font: string
  /** `grid` for the desktop panel, `strip` for a one-row scroller on phones. */
  layout?: 'grid' | 'strip'
}

export function StylePicker({ name, value, onChange, thumbs, paper, font, layout = 'grid' }: StylePickerProps) {
  const stripRef = useRef<HTMLDivElement | null>(null)

  // Keep the chosen style in view in the scroller.
  useEffect(() => {
    if (layout !== 'strip') return
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-mode="${value}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [layout, value])

  return (
    <div
      ref={stripRef}
      role="radiogroup"
      aria-label="Style"
      className={cn(
        layout === 'strip'
          ? 'flex snap-x gap-2.5 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          : 'grid grid-cols-4 gap-x-2 gap-y-3',
      )}
    >
      {RENDER_MODES.map((mode) => {
        const active = mode === value
        return (
          <label key={mode} data-mode={mode} className={cn('group cursor-pointer', layout === 'strip' && 'w-[4.25rem] shrink-0 snap-center')}>
            <input
              type="radio"
              name={name}
              value={mode}
              checked={active}
              onChange={() => onChange(mode)}
              className="peer sr-only"
            />
            <span
              className={cn(
                'block rounded-lg p-0.5 ring-1 transition-shadow peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-foreground',
                active ? 'ring-2 ring-foreground' : 'ring-[var(--rule)] group-hover:ring-foreground/40',
              )}
            >
              <Thumb field={mode === 'ascii' ? thumbs.text : thumbs.square} mode={mode} paper={paper} font={font} />
            </span>
            <span
              className={cn(
                'mt-1.5 block text-center text-xs',
                active ? 'font-medium text-foreground' : 'text-muted-foreground group-hover:text-foreground',
              )}
            >
              {RENDER_MODE_LABELS[mode]}
            </span>
          </label>
        )
      })}
    </div>
  )
}
