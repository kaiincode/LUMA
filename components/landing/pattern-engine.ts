import type { RenderMode } from '@/lib/render-mode'
import { analyzeImage, coverCrop, drawPattern, type LumaField } from '@/lib/luma/engine'

/**
 * Landing-page adapters over the LUMA engine: fields that cover a plate, drawn
 * on black paper with square cells.
 */

export type Field = LumaField

export type SourceImage = {
  el: CanvasImageSource
  width: number
  height: number
  name: string
}

export const coverRect = coverCrop

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** A field that covers a `cols × rows` plate, cropping the source to fit. */
export function buildField(source: SourceImage, cols: number, rows: number): Field {
  return analyzeImage(source, cols, rows, coverCrop(source.width, source.height, cols / rows))
}

/**
 * Draws every cell of `field` in `mode`, cells `cell` px wide, on black paper.
 * `boost` lifts every cell so shapes drawn from a smooth image still read solid.
 */
export function drawField(
  ctx: CanvasRenderingContext2D,
  field: Field,
  mode: RenderMode,
  cell: number,
  monoFamily: string,
  boost = false,
) {
  drawPattern(ctx, field, mode, { x: 0, y: 0, w: field.cols * cell, h: field.rows * cell }, {
    paper: 'dark',
    strength: 0.6,
    font: monoFamily,
    boost,
  })
}

export type Stage = 'sample' | 'lift' | 'paint'

/** Intermediate pipeline views for the process section. */
export function drawStage(ctx: CanvasRenderingContext2D, field: Field, stage: Stage, cell: number, source: SourceImage, ink: string) {
  const { cols, rows, tone, edge, rgb } = field
  const w = cols * cell
  const h = rows * cell

  if (stage === 'sample') {
    const crop = coverCrop(source.width, source.height, cols / rows)
    ctx.drawImage(source.el, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h)
    // Difference keeps the grid visible on light and dark images alike.
    ctx.globalCompositeOperation = 'difference'
    ctx.strokeStyle = ink
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0; x <= cols; x++) {
      ctx.moveTo(Math.round(x * cell) + 0.5, 0)
      ctx.lineTo(Math.round(x * cell) + 0.5, h)
    }
    for (let y = 0; y <= rows; y++) {
      ctx.moveTo(0, Math.round(y * cell) + 0.5)
      ctx.lineTo(w, Math.round(y * cell) + 0.5)
    }
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    return
  }

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      if (stage === 'lift') {
        const v = Math.round(clamp01(tone[i] * 0.85 + edge[i] * 0.5) * 255)
        ctx.fillStyle = `rgb(${v},${v},${v})`
      } else {
        ctx.fillStyle = `rgb(${rgb[i * 3]},${rgb[i * 3 + 1]},${rgb[i * 3 + 2]})`
      }
      ctx.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5)
    }
  }
}

/** Loads an image URL into a SourceImage. */
export function loadSource(url: string, name: string): Promise<SourceImage> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve({ el: img, width: img.naturalWidth, height: img.naturalHeight, name })
    img.onerror = () => reject(new Error(`Could not read ${name}`))
    img.src = url
  })
}

/**
 * Samples the dot wordmark from the logo into a cell mask. Returns the mask
 * cropped to the mark's bounding box, plus its aspect ratio.
 */
export async function loadWordmark(url: string) {
  const src = await loadSource(url, 'logo')
  const img = src.el as HTMLImageElement
  const c = document.createElement('canvas')
  const scale = 0.5
  c.width = Math.round(src.width * scale)
  c.height = Math.round(src.height * scale)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, c.width, c.height)
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  let minX = c.width
  let minY = c.height
  let maxX = 0
  let maxY = 0
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4] > 128) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const crop = document.createElement('canvas')
  crop.width = maxX - minX + 1
  crop.height = maxY - minY + 1
  crop.getContext('2d')!.drawImage(c, minX, minY, crop.width, crop.height, 0, 0, crop.width, crop.height)
  return { canvas: crop, aspect: crop.width / crop.height }
}
