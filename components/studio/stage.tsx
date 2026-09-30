'use client'

import { useEffect, useRef, useState } from 'react'
import type { RenderMode } from '@/lib/render-mode'
import {
  containRect,
  drawPattern,
  isDarkPaper,
  paperCss,
  type LumaField,
  type LumaSource,
  type Paper,
  type Rect,
  type RGB,
} from '@/lib/luma/engine'
import { cn } from '@/lib/utils'

/** Space left around the artwork inside the stage, as a share of the short side. */
export const STAGE_PADDING = 0.05

type StageProps = {
  field: LumaField | null
  mode: RenderMode
  paper: Paper
  /** The image's background colour, for `auto` paper. */
  background: RGB | null
  /** Mark weight and tone adjustments, passed straight to the engine. */
  look: { strength: number; brightness: number; contrast: number }
  font: string
  compare: boolean
  source: LumaSource | null
  label: string
  onSize?: (size: { w: number; h: number }) => void
  children?: React.ReactNode
}

export function Stage({ field, mode, paper, background, look, font, compare, source, label, onSize, children }: StageProps) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [split, setSplit] = useState(50)

  const onSizeRef = useRef(onSize)
  onSizeRef.current = onSize

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const ro = new ResizeObserver(() => {
      const next = { w: box.clientWidth, h: box.clientHeight }
      setSize(next)
      onSizeRef.current?.(next)
    })
    ro.observe(box)
    return () => ro.disconnect()
  }, [])

  const art: Rect | null =
    field && source && size.w && size.h
      ? (() => {
          const pad = Math.min(size.w, size.h) * STAGE_PADDING
          return containRect({ x: pad, y: pad, w: size.w - pad * 2, h: size.h - pad * 2 }, source.width / source.height)
        })()
      : null

  // The pattern is drawn into an offscreen layer; the visible canvas only
  // composites it, so dragging the compare divider stays cheap.
  const layerRef = useRef<HTMLCanvasElement | null>(null)
  const splitRef = useRef(split)
  splitRef.current = split
  const compositeRef = useRef<() => void>(() => {})

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.w || !size.h) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const pw = Math.round(size.w * dpr)
    const ph = Math.round(size.h * dpr)
    // Resizing a canvas clears it, so only do it when the size really changed.
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw
      canvas.height = ph
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const layer = (layerRef.current ??= document.createElement('canvas'))
    if (layer.width !== pw || layer.height !== ph) {
      layer.width = pw
      layer.height = ph
    }
    const lctx = layer.getContext('2d')!

    // Only the image's own rectangle is paper; the rest of the stage stays the
    // neutral surface behind it, so the artwork always shows its true shape.
    const render = () => {
      lctx.setTransform(1, 0, 0, 1, 0, 0)
      lctx.clearRect(0, 0, pw, ph)
      if (!field || !art) return
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      lctx.fillStyle = paperCss(paper, background)
      lctx.fillRect(art.x, art.y, art.w, art.h)
      drawPattern(lctx, field, mode, art, { paper, background, font, ...look })
    }

    const composite = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, pw, ph)
      ctx.drawImage(layer, 0, 0)
      if (compare && art && source) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.save()
        ctx.beginPath()
        ctx.rect(art.x, art.y, art.w * (splitRef.current / 100), art.h)
        ctx.clip()
        ctx.drawImage(source.el, art.x, art.y, art.w, art.h)
        ctx.restore()
      }
    }
    compositeRef.current = composite

    // Wait for the next frame so a fast slider drag redraws once per frame, not once per step.
    const raf = requestAnimationFrame(() => {
      render()
      composite()
    })
    return () => cancelAnimationFrame(raf)
    // `art` is derived from size and source, both listed; `look` is compared by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, mode, paper, background, look.strength, look.brightness, look.contrast, font, compare, source, size])

  useEffect(() => {
    compositeRef.current()
  }, [split])

  // The divider sits on the paper, so it flips with it; the labels sit on the stage.
  const dark = isDarkPaper(paper, background)
  const ink = 'text-muted-foreground'

  return (
    <div ref={boxRef} className="relative h-full w-full overflow-hidden bg-foreground/[0.05]">
      <canvas ref={canvasRef} role="img" aria-label={label} className="absolute inset-0 h-full w-full" />
      {art ? (
        // A hairline round the artwork so white paper still reads on a light stage.
        <div
          aria-hidden
          className="pointer-events-none absolute ring-1 ring-foreground/10"
          style={{ left: art.x, top: art.y, width: art.w, height: art.h }}
        />
      ) : null}

      {compare && art ? (
        <>
          <input
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={split}
            onChange={(e) => setSplit(Number(e.target.value))}
            aria-label="Compare original and pattern"
            className="peer absolute z-10 cursor-ew-resize opacity-0"
            style={{ left: art.x, top: art.y, width: art.w, height: art.h }}
          />
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute w-px peer-focus-visible:[&>span]:outline-2 peer-focus-visible:[&>span]:outline-offset-2',
              dark ? 'bg-white [&>span]:outline-white' : 'bg-black [&>span]:outline-black',
            )}
            style={{ left: art.x + (art.w * split) / 100, top: art.y, height: art.h }}
          >
            <span
              className={cn(
                'absolute left-1/2 top-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full font-mono text-[0.625rem]',
                dark ? 'bg-white text-black' : 'bg-black text-white',
              )}
            >
              ⇆
            </span>
          </div>
          <span className={cn('pointer-events-none absolute font-mono text-[0.6875rem]', ink)} style={{ left: art.x + 8, top: art.y + art.h + 8 }}>
            Original
          </span>
          <span
            className={cn('pointer-events-none absolute -translate-x-full font-mono text-[0.6875rem]', ink)}
            style={{ left: art.x + art.w - 8, top: art.y + art.h + 8 }}
          >
            LUMA
          </span>
        </>
      ) : null}

      {children}
    </div>
  )
}
