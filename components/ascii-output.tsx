'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from 'next-themes'

export type AsciiPayload =
  | ''
  | {
      plain: string
      cols: number
      rows: number
      colors: Uint8ClampedArray // RGB per cell, length = cols*rows*3
    }

interface AsciiOutputProps {
  output: AsciiPayload
  onClear: () => void
  variant?: 'default' | 'frame'
  aspect?: 'square' | 'frame'
}

export function AsciiOutput({ output, variant = 'default', aspect = 'frame' }: AsciiOutputProps) {
  const plain = output ? output.plain : ''
  const ariaLabel = useMemo(() => (plain ? 'ASCII output' : 'ASCII output (empty)'), [plain])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [fontSizePx, setFontSizePx] = useState<number>(10)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const computeCols = () => {
      const lines = plain ? plain.split('\n') : []
      let max = 0
      for (const line of lines) max = Math.max(max, line.length)
      return Math.max(1, max)
    }

    const update = () => {
      const cols = computeCols()
      const widthPx = el.clientWidth
      // Monospace glyph width is ~0.6–0.65em; use 0.62 as a practical constant.
      const next = widthPx / (cols * 0.62)
      setFontSizePx(Math.max(6, Math.min(14, next)))
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [plain])

  const draw = (ctx: CanvasRenderingContext2D, width: number, height: number, payload: Exclude<AsciiPayload, ''>, bg: string) => {
    const { cols, rows, colors } = payload
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)

    const pad = 18
    const w = Math.max(1, width - pad * 2)
    const h = Math.max(1, height - pad * 2)

    // Fit font size to both axes.
    const fsByW = w / (cols * 0.62)
    const fsByH = h / (rows * 1.22)
    const fs = Math.max(7, Math.min(18, Math.floor(Math.min(fsByW, fsByH))))
    setFontSizePx(fs)

    // Render into an offscreen canvas at native size, then scale up with nearest-neighbor.
    const off = document.createElement('canvas')
    const offCtx = off.getContext('2d')
    if (!offCtx) return
    offCtx.textBaseline = 'top'
    offCtx.font = `${fs}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`

    const cw = Math.max(1, Math.round(offCtx.measureText('M').width))
    const ch = Math.max(1, Math.round(fs * 1.22))
    const nativeW = cols * cw
    const nativeH = rows * ch
    off.width = nativeW
    off.height = nativeH
    offCtx.textBaseline = 'top'
    offCtx.font = `${fs}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`
    offCtx.clearRect(0, 0, nativeW, nativeH)

    const lines = payload.plain.split('\n')
    for (let y = 0; y < rows; y++) {
      const line = lines[y] ?? ''
      const yPx = y * ch
      for (let x = 0; x < cols; x++) {
        const chh = line[x] ?? '.'
        const i = (y * cols + x) * 3
        offCtx.fillStyle = `rgb(${colors[i]},${colors[i + 1]},${colors[i + 2]})`
        offCtx.fillText(chh, x * cw, yPx)
      }
    }

    // Make glyph edges crisp: threshold alpha to 0/255 (removes font anti-alias blur).
    // Note: this is a stylistic choice to match "sharp" ASCII renders.
    const img = offCtx.getImageData(0, 0, nativeW, nativeH)
    const d = img.data
    for (let p = 0; p < d.length; p += 4) {
      const a = d[p + 3]
      d[p + 3] = a > 96 ? 255 : 0
    }
    offCtx.putImageData(img, 0, 0)

    // Use integer scaling + no smoothing to keep edges crisp.
    const scale = Math.max(1, Math.floor(Math.min(w / nativeW, h / nativeH)))
    const outW = nativeW * scale
    const outH = nativeH * scale
    const offsetX = Math.floor((width - outW) / 2)
    const offsetY = Math.floor((height - outH) / 2)

    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, offsetX, offsetY, outW, outH)
  }

  useEffect(() => {
    const el = containerRef.current
    const canvas = canvasRef.current
    if (!el || !canvas) return

    const bg = resolvedTheme === 'dark' ? '#000000' : '#ffffff'

    if (!output) {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = 1
      canvas.height = 1
      ctx.clearRect(0, 0, 1, 1)
      return
    }

    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1))
    canvas.width = Math.floor(el.clientWidth * dpr)
    canvas.height = Math.floor(el.clientHeight * dpr)
    canvas.style.width = `${el.clientWidth}px`
    canvas.style.height = `${el.clientHeight}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw(ctx, el.clientWidth, el.clientHeight, output, bg)
  }, [output, resolvedTheme])

  const handleDownload = () => {
    const el = containerRef.current
    if (!el || !output) return

    const bg = resolvedTheme === 'dark' ? '#000000' : '#ffffff'
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1))
    const outCanvas = document.createElement('canvas')
    outCanvas.width = Math.floor(el.clientWidth * dpr)
    outCanvas.height = Math.floor(el.clientHeight * dpr)
    const ctx = outCanvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw(ctx, el.clientWidth, el.clientHeight, output, bg)

    const a = document.createElement('a')
    a.href = outCanvas.toDataURL('image/png')
    a.download = resolvedTheme === 'dark' ? 'luma-ascii-dark.png' : 'luma-ascii-light.png'
    a.click()
  }

  return (
    <div
      aria-label={ariaLabel}
      className="w-full rounded-2xl border border-border bg-background overflow-hidden"
      style={{ aspectRatio: aspect === 'square' ? '1 / 1' : '16 / 11' }}
    >
      <div ref={containerRef} className="relative h-full w-full overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0" />
        <div className="absolute right-3 top-3">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Download PNG"
            onClick={handleDownload}
            disabled={!output}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
