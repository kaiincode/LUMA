'use client'

import { useEffect, useRef } from 'react'
import type { RenderMode } from '@/lib/render-mode'
import { cn } from '@/lib/utils'
import { buildField, coverRect, drawField, type Field, type SourceImage } from './pattern-engine'

const MONO = '"Geist Mono", ui-monospace, monospace'
const SCAN_MS = 900

export type PlateMeta = { cols: number; rows: number; cell: number }

type Wordmark = { canvas: HTMLCanvasElement; aspect: number }

type PatternPlateProps = {
  source: SourceImage | null
  mode: RenderMode
  /** Cell size in CSS px for a given plate width. */
  cellFor: (width: number) => number
  /** When set, the pattern is shown at full strength only inside the wordmark. */
  wordmark?: Wordmark | null
  /** Shows the untouched source inside a lens that follows the pointer. */
  loupe?: boolean
  onMeta?: (meta: PlateMeta) => void
  className?: string
  label: string
}

type Layer = { full: HTMLCanvasElement; masked: HTMLCanvasElement | null }

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function PatternPlate({ source, mode, cellFor, wordmark, loupe, onMeta, className, label }: PatternPlateProps) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Everything the draw loop reads lives in one mutable ref so pointer moves
  // and mode changes never re-run React effects.
  const st = useRef({
    w: 0,
    h: 0,
    dpr: 1,
    cell: 8,
    field: null as Field | null,
    mask: null as HTMLCanvasElement | null,
    layers: new Map<RenderMode, Layer>(),
    from: null as RenderMode | null,
    to: mode,
    scanStart: 0,
    pointer: null as { x: number; y: number } | null,
    raf: 0,
    reduced: false,
    fontsReady: false,
  })

  const cellForRef = useRef(cellFor)
  cellForRef.current = cellFor
  const onMetaRef = useRef(onMeta)
  onMetaRef.current = onMeta

  const frame = () => {
    const s = st.current
    s.raf = 0
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !s.field) return

    const now = performance.now()
    const p = s.from === null && s.scanStart === 0 ? 1 : Math.min(1, (now - s.scanStart) / SCAN_MS)
    const scanning = p < 1 && !s.reduced
    const scanY = scanning ? easeInOut(p) * s.h : s.h

    // The field overhangs the plate by up to one cell; draw it at its own size.
    const fw = s.field.cols * s.cell
    const fh = s.field.rows * s.cell

    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0)
    ctx.clearRect(0, 0, s.w, s.h)

    const paint = (m: RenderMode | null, y0: number, y1: number) => {
      if (!m || y1 <= y0) return
      const layer = getLayer(m)
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, y0, s.w, y1 - y0)
      ctx.clip()
      if (layer.masked) {
        ctx.globalAlpha = 0.16
        ctx.drawImage(layer.full, 0, 0, fw, fh)
        ctx.globalAlpha = 1
        ctx.drawImage(layer.masked, 0, 0, fw, fh)
      } else {
        ctx.drawImage(layer.full, 0, 0, fw, fh)
      }
      ctx.restore()
    }

    paint(s.to, 0, scanY)
    paint(s.from, scanY, s.h)

    if (scanning) {
      // The print head: a hairline with a short falloff above it.
      const grad = ctx.createLinearGradient(0, scanY - 28, 0, scanY)
      grad.addColorStop(0, 'rgba(255,255,255,0)')
      grad.addColorStop(1, 'rgba(255,255,255,0.10)')
      ctx.fillStyle = grad
      ctx.fillRect(0, scanY - 28, s.w, 28)
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.fillRect(0, Math.round(scanY), s.w, 1)
    }

    if (loupe && s.pointer && source) {
      const r = Math.max(56, Math.min(120, s.w * 0.075))
      const { x, y } = s.pointer
      const crop = coverRect(source.width, source.height, fw / fh)
      ctx.save()
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(source.el, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, fw, fh)
      ctx.restore()
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.font = `400 11px ${MONO}`
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText('source', x + r * 0.72 + 8, y + r * 0.72 + 8)
    }

    if (scanning) s.raf = requestAnimationFrame(frame)
  }

  const schedule = () => {
    const s = st.current
    if (!s.raf) s.raf = requestAnimationFrame(frame)
  }

  const getLayer = (m: RenderMode): Layer => {
    const s = st.current
    const cached = s.layers.get(m)
    if (cached) return cached
    const field = s.field!
    const full = document.createElement('canvas')
    full.width = Math.round(field.cols * s.cell * s.dpr)
    full.height = Math.round(field.rows * s.cell * s.dpr)
    const fctx = full.getContext('2d')!
    fctx.scale(s.dpr, s.dpr)
    drawField(fctx, field, m, s.cell, MONO)

    let masked: HTMLCanvasElement | null = null
    if (s.mask) {
      masked = document.createElement('canvas')
      masked.width = full.width
      masked.height = full.height
      const mctx = masked.getContext('2d')!
      mctx.scale(s.dpr, s.dpr)
      drawField(mctx, field, m, s.cell, MONO, true)
      mctx.setTransform(1, 0, 0, 1, 0, 0)
      mctx.globalCompositeOperation = 'destination-in'
      mctx.imageSmoothingEnabled = false
      mctx.drawImage(s.mask, 0, 0, masked.width, masked.height)
    }

    // Keep at most the two layers a transition needs.
    if (s.layers.size >= 2) {
      for (const key of s.layers.keys()) {
        if (key !== s.to && key !== s.from) s.layers.delete(key)
      }
    }
    const layer = { full, masked }
    s.layers.set(m, layer)
    return layer
  }

  const rebuild = () => {
    const s = st.current
    const box = boxRef.current
    const canvas = canvasRef.current
    if (!box || !canvas || !source) return
    const w = box.clientWidth
    const h = box.clientHeight
    if (!w || !h) return
    s.w = w
    s.h = h
    s.dpr = Math.min(2, window.devicePixelRatio || 1)
    s.cell = cellForRef.current(w)
    canvas.width = Math.round(w * s.dpr)
    canvas.height = Math.round(h * s.dpr)

    const cols = Math.ceil(w / s.cell)
    const rows = Math.ceil(h / s.cell)
    s.field = buildField(source, cols, rows)
    s.layers.clear()

    s.mask = null
    if (wordmark) {
      // Fit the mark to ~88% of the width, never taller than 62% of the plate.
      let mw = w * (w < 640 ? 0.9 : 0.86)
      let mh = mw / wordmark.aspect
      if (mh > h * 0.62) {
        mh = h * 0.62
        mw = mh * wordmark.aspect
      }
      const mask = document.createElement('canvas')
      mask.width = cols
      mask.height = rows
      const mctx = mask.getContext('2d', { willReadFrequently: true })!
      mctx.imageSmoothingEnabled = true
      mctx.drawImage(wordmark.canvas, (w - mw) / 2 / s.cell, (h - mh) / 2 / s.cell, mw / s.cell, mh / s.cell)
      // Snap to whole cells so letters are built from marks, not cut through them.
      const img = mctx.getImageData(0, 0, cols, rows)
      for (let i = 0; i < img.data.length; i += 4) {
        const on = img.data[i] > 110
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
        img.data[i + 3] = on ? 255 : 0
      }
      mctx.putImageData(img, 0, 0)
      s.mask = mask
    }

    onMetaRef.current?.({ cols, rows, cell: s.cell })
    schedule()
  }

  // Build on mount, on resize and whenever the source or mark changes.
  useEffect(() => {
    const s = st.current
    s.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let cancelled = false
    document.fonts?.ready.then(() => {
      if (cancelled) return
      s.fontsReady = true
      rebuild()
    })
    let t = 0
    const ro = new ResizeObserver(() => {
      window.clearTimeout(t)
      t = window.setTimeout(rebuild, 120)
    })
    if (boxRef.current) ro.observe(boxRef.current)
    rebuild()
    // A new source prints in from the top.
    s.from = null
    s.scanStart = performance.now()
    schedule()
    return () => {
      cancelled = true
      ro.disconnect()
      window.clearTimeout(t)
      cancelAnimationFrame(s.raf)
      s.raf = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, wordmark])

  // Mode changes run the print head from top to bottom.
  useEffect(() => {
    const s = st.current
    if (s.to === mode) return
    s.from = s.to
    s.to = mode
    s.scanStart = performance.now()
    schedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const onPointerMove = (e: React.PointerEvent) => {
    if (!loupe || e.pointerType === 'touch') return
    const rect = e.currentTarget.getBoundingClientRect()
    st.current.pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    schedule()
  }

  const onPointerLeave = () => {
    st.current.pointer = null
    schedule()
  }

  return (
    <div
      ref={boxRef}
      className={cn('relative overflow-hidden bg-[var(--plate)]', loupe && 'cursor-none', className)}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <canvas ref={canvasRef} role="img" aria-label={label} className="absolute inset-0 h-full w-full" />
    </div>
  )
}
