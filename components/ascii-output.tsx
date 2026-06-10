'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from 'next-themes'
import type { ExportSize } from '@/lib/render-settings'
import {
  ASCII_LINE_HEIGHT_EM,
  getMonospaceCellWidthHeightRatio,
  monospaceFontSpec,
} from '@/lib/monospace-metrics'

/** Source bitmap — same for every payload so layout matches the upload. */
export type LumaSourceMeta = {
  aspectRatio: number
  sourceWidth: number
  sourceHeight: number
  sourceDataUrl?: string
}

export type AsciiPayload =
  | ''
  | (LumaSourceMeta & {
      mode: 'ascii'
      plain: string
      cols: number
      rows: number
      colors: Uint8ClampedArray // RGB per cell, length = cols*rows*3
    })
  | (LumaSourceMeta & {
      mode: 'dots'
      cols: number
      rows: number
      colors: Uint8ClampedArray
      dotRadii: Float32Array // per cell [0..1], length = cols*rows
    })
  | (LumaSourceMeta & {
      mode: 'hatch'
      cols: number
      rows: number
      colors: Uint8ClampedArray
      hatchStrength: Float32Array // per cell [0..1], cross-hatch density
    })
  | (LumaSourceMeta & {
      mode: 'mosaic'
      cols: number
      rows: number
      colors: Uint8ClampedArray
      tileCover: Float32Array // per cell [0..1], tile fill vs gap
    })
  | (LumaSourceMeta & {
      mode: 'contour'
      cols: number
      rows: number
      colors: Uint8ClampedArray
      contourMag: Float32Array
      contourTan: Float32Array // radians, stroke direction
    })
  | (LumaSourceMeta & {
      mode: 'stipple'
      cols: number
      rows: number
      colors: Uint8ClampedArray
      stippleWeight: Float32Array
    })
  | (LumaSourceMeta & {
      mode: 'halftone'
      cols: number
      rows: number
      colors: Uint8ClampedArray
      halftoneRadii: Float32Array
      halftoneStretch: Float32Array // elongation along gradient
      halftoneRot: Float32Array // ellipse rotation (radians)
    })

/** Uniform scale — float, preserves native aspect inside padded box. */
function fitUniformScale(nativeW: number, nativeH: number, w: number, h: number) {
  const scale = Math.min(w / nativeW, h / nativeH)
  const outW = nativeW * scale
  const outH = nativeH * scale
  return { scale, outW, outH }
}

function stippleHash(ix: number, iy: number, k: number, salt: number) {
  const n = Math.sin(ix * 12.9898 + iy * 78.233 + k * 43.758 + salt * 19.413) * 43758.5453
  return n - Math.floor(n)
}

interface AsciiOutputProps {
  output: AsciiPayload
  onClear: () => void
  variant?: 'default' | 'frame'
  aspect?: 'square' | 'frame'
  exportSize?: ExportSize
  sourceAspect?: number | null
}

const OUTPUT_LABELS: Record<Exclude<AsciiPayload, ''>['mode'], string> = {
  ascii: 'ASCII output',
  dots: 'Halftone dots output',
  hatch: 'Cross-hatch output',
  mosaic: 'Mosaic tile output',
  contour: 'Contour line output',
  stipple: 'Stipple output',
  halftone: 'Halftone ellipse output',
}

export function AsciiOutput({
  output,
  variant = 'default',
  aspect = 'frame',
  exportSize = 'frame',
  sourceAspect,
}: AsciiOutputProps) {
  const colsCount = output ? output.cols : 0
  const ariaLabel = useMemo(
    () => (output ? OUTPUT_LABELS[output.mode] : 'Output (empty)'),
    [output],
  )
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [fontSizePx, setFontSizePx] = useState<number>(10)
  const [comparePosition, setComparePosition] = useState(50)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const update = () => {
      const cols = Math.max(1, colsCount || 1)
      const widthPx = el.clientWidth
      const cellWh = getMonospaceCellWidthHeightRatio()
      const next = widthPx / (cols * cellWh * ASCII_LINE_HEIGHT_EM)
      setFontSizePx(Math.max(6, Math.min(14, next)))
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [colsCount])

  const drawDots = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    payload: Extract<AsciiPayload, { mode: 'dots' }>,
    bg: string,
  ) => {
    const { cols, rows, colors, dotRadii } = payload
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)

    const pad = 18
    const w = Math.max(1, width - pad * 2)
    const h = Math.max(1, height - pad * 2)

    const cellPx = 8
    const nativeW = cols * cellPx
    const nativeH = rows * cellPx

    const off = document.createElement('canvas')
    const offCtx = off.getContext('2d')
    if (!offCtx) return
    off.width = nativeW
    off.height = nativeH
    offCtx.clearRect(0, 0, nativeW, nativeH)

    const rScale = cellPx * 0.48

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x
        const i = idx * 3
        const cx = x * cellPx + cellPx / 2
        const cy = y * cellPx + cellPx / 2
        const rn = dotRadii[idx] ?? 0
        const r = Math.max(0, rn * rScale)
        if (r < 0.25) continue
        offCtx.fillStyle = `rgb(${colors[i]},${colors[i + 1]},${colors[i + 2]})`
        offCtx.beginPath()
        offCtx.arc(cx, cy, r, 0, Math.PI * 2)
        offCtx.fill()
      }
    }

    const { scale, outW, outH } = fitUniformScale(payload.sourceWidth, payload.sourceHeight, w, h)
    const offsetX = (width - outW) / 2
    const offsetY = (height - outH) / 2

    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, offsetX, offsetY, outW, outH)
    setFontSizePx(cellPx * scale)
  }

  const drawHatch = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    payload: Extract<AsciiPayload, { mode: 'hatch' }>,
    bg: string,
  ) => {
    const { cols, rows, colors, hatchStrength } = payload
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)

    const pad = 18
    const w = Math.max(1, width - pad * 2)
    const h = Math.max(1, height - pad * 2)

    const cellPx = 8
    const nativeW = cols * cellPx
    const nativeH = rows * cellPx

    const off = document.createElement('canvas')
    const offCtx = off.getContext('2d')
    if (!offCtx) return
    off.width = nativeW
    off.height = nativeH
    offCtx.clearRect(0, 0, nativeW, nativeH)
    offCtx.lineCap = 'square'

    const span = cellPx * 0.58

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x
        const i = idx * 3
        const str = hatchStrength[idx] ?? 0
        if (str < 0.07) continue

        const cx = x * cellPx + cellPx / 2
        const cy = y * cellPx + cellPx / 2
        const rgb = `${colors[i]},${colors[i + 1]},${colors[i + 2]}`
        offCtx.strokeStyle = `rgb(${rgb})`
        offCtx.lineWidth = Math.max(1, Math.min(3, 0.65 + str * 2.35))

        const weave = (x * 7 + y * 11) % 2 === 0
        offCtx.beginPath()

        // Primary diagonal (45° family)
        if (weave) {
          offCtx.moveTo(cx - span, cy - span)
          offCtx.lineTo(cx + span, cy + span)
        } else {
          offCtx.moveTo(cx - span, cy + span)
          offCtx.lineTo(cx + span, cy - span)
        }

        // Cross-hatch when strength rises
        if (str > 0.34) {
          if (weave) {
            offCtx.moveTo(cx - span, cy + span)
            offCtx.lineTo(cx + span, cy - span)
          } else {
            offCtx.moveTo(cx - span, cy - span)
            offCtx.lineTo(cx + span, cy + span)
          }
        }

        offCtx.stroke()

        // Third pass: tight weave + edge accent for darkest strokes
        if (str > 0.62) {
          offCtx.lineWidth = Math.max(1, Math.min(2.25, 0.5 + str * 1.6))
          offCtx.beginPath()
          offCtx.moveTo(cx - span * 0.72, cy)
          offCtx.lineTo(cx + span * 0.72, cy)
          offCtx.stroke()
        }
      }
    }

    const { scale, outW, outH } = fitUniformScale(payload.sourceWidth, payload.sourceHeight, w, h)
    const offsetX = (width - outW) / 2
    const offsetY = (height - outH) / 2

    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, offsetX, offsetY, outW, outH)
    setFontSizePx(cellPx * scale)
  }

  const drawMosaic = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    payload: Extract<AsciiPayload, { mode: 'mosaic' }>,
    bg: string,
  ) => {
    const { cols, rows, colors, tileCover } = payload
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)

    const pad = 18
    const w = Math.max(1, width - pad * 2)
    const h = Math.max(1, height - pad * 2)
    const cellPx = 8
    const nativeW = cols * cellPx
    const nativeH = rows * cellPx

    const off = document.createElement('canvas')
    const offCtx = off.getContext('2d')
    if (!offCtx) return
    off.width = nativeW
    off.height = nativeH
    offCtx.clearRect(0, 0, nativeW, nativeH)

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x
        const i = idx * 3
        const cover = tileCover[idx] ?? 0
        const gap = Math.max(0, (1 - cover) * cellPx * 0.46)
        const sz = Math.max(0.25, cellPx - gap * 2)
        const ox = x * cellPx + gap
        const oy = y * cellPx + gap
        if (sz < 0.4) continue
        const rad = Math.min(sz * 0.22, 2.25)
        offCtx.fillStyle = `rgb(${colors[i]},${colors[i + 1]},${colors[i + 2]})`
        offCtx.beginPath()
        offCtx.roundRect(ox, oy, sz, sz, rad)
        offCtx.fill()
      }
    }

    const { scale, outW, outH } = fitUniformScale(payload.sourceWidth, payload.sourceHeight, w, h)
    const offsetX = (width - outW) / 2
    const offsetY = (height - outH) / 2
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, offsetX, offsetY, outW, outH)
    setFontSizePx(cellPx * scale)
  }

  const drawContour = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    payload: Extract<AsciiPayload, { mode: 'contour' }>,
    bg: string,
  ) => {
    const { cols, rows, colors, contourMag, contourTan } = payload
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)

    const pad = 18
    const w = Math.max(1, width - pad * 2)
    const h = Math.max(1, height - pad * 2)
    const cellPx = 8
    const nativeW = cols * cellPx
    const nativeH = rows * cellPx

    const off = document.createElement('canvas')
    const offCtx = off.getContext('2d')
    if (!offCtx) return
    off.width = nativeW
    off.height = nativeH
    offCtx.clearRect(0, 0, nativeW, nativeH)
    offCtx.lineCap = 'butt'

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x
        const i = idx * 3
        const mag = contourMag[idx] ?? 0
        const L = mag * cellPx * 0.54
        if (L < 0.28) continue
        const cx = x * cellPx + cellPx / 2
        const cy = y * cellPx + cellPx / 2
        const th = contourTan[idx] ?? 0
        const c = Math.cos(th)
        const s = Math.sin(th)
        offCtx.strokeStyle = `rgb(${colors[i]},${colors[i + 1]},${colors[i + 2]})`
        offCtx.lineWidth = Math.max(0.85, Math.min(2.85, 0.65 + mag * 2.4))
        offCtx.beginPath()
        offCtx.moveTo(cx - (c * L) / 2, cy - (s * L) / 2)
        offCtx.lineTo(cx + (c * L) / 2, cy + (s * L) / 2)
        offCtx.stroke()
      }
    }

    const { scale, outW, outH } = fitUniformScale(payload.sourceWidth, payload.sourceHeight, w, h)
    const offsetX = (width - outW) / 2
    const offsetY = (height - outH) / 2
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, offsetX, offsetY, outW, outH)
    setFontSizePx(cellPx * scale)
  }

  const drawStipple = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    payload: Extract<AsciiPayload, { mode: 'stipple' }>,
    bg: string,
  ) => {
    const { cols, rows, colors, stippleWeight } = payload
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)

    const pad = 18
    const w = Math.max(1, width - pad * 2)
    const h = Math.max(1, height - pad * 2)
    const cellPx = 8
    const nativeW = cols * cellPx
    const nativeH = rows * cellPx

    const off = document.createElement('canvas')
    const offCtx = off.getContext('2d')
    if (!offCtx) return
    off.width = nativeW
    off.height = nativeH
    offCtx.clearRect(0, 0, nativeW, nativeH)

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x
        const i = idx * 3
        const wt = stippleWeight[idx] ?? 0
        const nDots = Math.max(1, Math.min(8, Math.round(1 + wt * 7)))
        const cx = x * cellPx + cellPx / 2
        const cy = y * cellPx + cellPx / 2
        offCtx.fillStyle = `rgb(${colors[i]},${colors[i + 1]},${colors[i + 2]})`
        for (let k = 0; k < nDots; k++) {
          const u = stippleHash(x, y, k, 1) - 0.5
          const v = stippleHash(x, y, k, 2) - 0.5
          const px = cx + u * cellPx * 0.84
          const py = cy + v * cellPx * 0.84
          const rr = Math.max(0.22, (0.1 + stippleHash(x, y, k, 3) * 0.32) * cellPx * (0.32 + wt * 0.58))
          offCtx.beginPath()
          offCtx.arc(px, py, rr, 0, Math.PI * 2)
          offCtx.fill()
        }
      }
    }

    const { scale, outW, outH } = fitUniformScale(payload.sourceWidth, payload.sourceHeight, w, h)
    const offsetX = (width - outW) / 2
    const offsetY = (height - outH) / 2
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, offsetX, offsetY, outW, outH)
    setFontSizePx(cellPx * scale)
  }

  const drawHalftone = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    payload: Extract<AsciiPayload, { mode: 'halftone' }>,
    bg: string,
  ) => {
    const { cols, rows, colors, halftoneRadii, halftoneStretch, halftoneRot } = payload
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)

    const pad = 18
    const w = Math.max(1, width - pad * 2)
    const h = Math.max(1, height - pad * 2)
    const cellPx = 8
    const nativeW = cols * cellPx
    const nativeH = rows * cellPx

    const off = document.createElement('canvas')
    const offCtx = off.getContext('2d')
    if (!offCtx) return
    off.width = nativeW
    off.height = nativeH
    offCtx.clearRect(0, 0, nativeW, nativeH)

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x
        const i = idx * 3
        const rn = halftoneRadii[idx] ?? 0
        const str = halftoneStretch[idx] ?? 0.3
        const r0 = rn * cellPx * 0.46
        if (r0 < 0.18) continue
        const cx = x * cellPx + cellPx / 2
        const cy = y * cellPx + cellPx / 2
        const rx = r0 * (0.58 + str * 1.08)
        const ry = r0 * Math.max(0.2, 0.68 - str * 0.4)
        offCtx.fillStyle = `rgb(${colors[i]},${colors[i + 1]},${colors[i + 2]})`
        offCtx.beginPath()
        offCtx.ellipse(cx, cy, rx, ry, halftoneRot[idx] ?? 0, 0, Math.PI * 2)
        offCtx.fill()
      }
    }

    const { scale, outW, outH } = fitUniformScale(payload.sourceWidth, payload.sourceHeight, w, h)
    const offsetX = (width - outW) / 2
    const offsetY = (height - outH) / 2
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, offsetX, offsetY, outW, outH)
    setFontSizePx(cellPx * scale)
  }

  const draw = (ctx: CanvasRenderingContext2D, width: number, height: number, payload: Exclude<AsciiPayload, ''>, bg: string) => {
    if (payload.mode === 'dots') {
      drawDots(ctx, width, height, payload, bg)
      return
    }
    if (payload.mode === 'hatch') {
      drawHatch(ctx, width, height, payload, bg)
      return
    }
    if (payload.mode === 'mosaic') {
      drawMosaic(ctx, width, height, payload, bg)
      return
    }
    if (payload.mode === 'contour') {
      drawContour(ctx, width, height, payload, bg)
      return
    }
    if (payload.mode === 'stipple') {
      drawStipple(ctx, width, height, payload, bg)
      return
    }
    if (payload.mode === 'halftone') {
      drawHalftone(ctx, width, height, payload, bg)
      return
    }

    const { cols, rows, colors } = payload
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)

    const pad = 18
    const w = Math.max(1, width - pad * 2)
    const h = Math.max(1, height - pad * 2)

    const cellWh = getMonospaceCellWidthHeightRatio()
    // Fit font size to both axes (cw ≈ cellWh * lineHeight * fs).
    const fsByW = w / (cols * cellWh * ASCII_LINE_HEIGHT_EM)
    const fsByH = h / (rows * ASCII_LINE_HEIGHT_EM)
    const fs = Math.max(7, Math.min(18, Math.floor(Math.min(fsByW, fsByH))))

    // Render into an offscreen canvas at native size, then scale up with nearest-neighbor.
    const off = document.createElement('canvas')
    const offCtx = off.getContext('2d')
    if (!offCtx) return
    offCtx.textBaseline = 'top'
    offCtx.font = monospaceFontSpec(fs)

    const cw = Math.max(1, Math.round(offCtx.measureText('M').width))
    const ch = Math.max(1, Math.round(fs * ASCII_LINE_HEIGHT_EM))
    const nativeW = cols * cw
    const nativeH = rows * ch
    off.width = nativeW
    off.height = nativeH
    offCtx.textBaseline = 'top'
    offCtx.font = monospaceFontSpec(fs)
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

    // Float scale keeps output aspect identical to nativeW/nativeH (matches source image).
    const { scale, outW, outH } = fitUniformScale(payload.sourceWidth, payload.sourceHeight, w, h)
    const offsetX = (width - outW) / 2
    const offsetY = (height - outH) / 2

    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, offsetX, offsetY, outW, outH)
    setFontSizePx(fs * scale)
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
    const exportDimensions = (() => {
      if (exportSize === 'square1080') return { width: 1080, height: 1080, dpr: 1 }
      if (exportSize === 'poster2k') return { width: 2048, height: 2048, dpr: 1 }
      if (exportSize === 'source') {
        return {
          width: Math.max(1, output.sourceWidth),
          height: Math.max(1, output.sourceHeight),
          dpr: 1,
        }
      }
      return { width: el.clientWidth, height: el.clientHeight, dpr }
    })()
    const outCanvas = document.createElement('canvas')
    outCanvas.width = Math.floor(exportDimensions.width * exportDimensions.dpr)
    outCanvas.height = Math.floor(exportDimensions.height * exportDimensions.dpr)
    const ctx = outCanvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(exportDimensions.dpr, 0, 0, exportDimensions.dpr, 0, 0)
    draw(ctx, exportDimensions.width, exportDimensions.height, output, bg)

    const a = document.createElement('a')
    a.href = outCanvas.toDataURL('image/png')
    const downloadBase: Record<Exclude<AsciiPayload, ''>['mode'], string> = {
      ascii: 'luma-ascii',
      dots: 'luma-dots',
      hatch: 'luma-hatch',
      mosaic: 'luma-mosaic',
      contour: 'luma-contour',
      stipple: 'luma-stipple',
      halftone: 'luma-halftone',
    }
    const base = downloadBase[output.mode]
    a.download = resolvedTheme === 'dark' ? `${base}-dark.png` : `${base}-light.png`
    a.click()
  }

  return (
    <div
      aria-label={ariaLabel}
      className="w-full overflow-hidden bg-background"
      style={{
        aspectRatio:
          output
            ? output.aspectRatio
            : sourceAspect
              ? sourceAspect
            : aspect === 'square'
              ? 1
              : 16 / 11,
      }}
    >
      <div ref={containerRef} className="relative h-full w-full overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0" />
        {output && output.sourceDataUrl && (
          <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - comparePosition}% 0 0)` }}>
            <img
              src={output.sourceDataUrl}
              alt="Original comparison"
              className="h-full w-full object-contain p-[18px]"
              draggable={false}
            />
          </div>
        )}
        {output && output.sourceDataUrl && (
          <div
            className="pointer-events-none absolute inset-y-0 z-10 w-px bg-foreground/80"
            style={{ left: `${comparePosition}%` }}
            aria-hidden
          >
            <span className="absolute left-1/2 top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 border border-border bg-background shadow-sm" />
          </div>
        )}
        {output && output.sourceDataUrl && (
          <input
            type="range"
            min={0}
            max={100}
            value={comparePosition}
            onChange={(event) => setComparePosition(Number(event.target.value))}
            aria-label="Compare original and output"
            className="absolute inset-0 z-20 h-full w-full cursor-ew-resize opacity-0"
          />
        )}
        <div className="absolute right-3 top-3 z-30">
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
