import type { RenderMode } from '@/lib/render-mode'

export type ExportSize = 'source' | 'square1080' | 'poster2k'

/**
 * How heavy each style's marks are by default (0 … 1). Styles differ in how
 * much of a cell a full mark covers, so each gets its own balance.
 */
export const MODE_WEIGHT: Record<RenderMode, number> = {
  ascii: 0.6,
  dots: 0.6,
  hatch: 0.55,
  mosaic: 0.6,
  contour: 0.65,
  stipple: 0.6,
  halftone: 0.6,
}

export const EXPORT_SIZE_LABELS: Record<ExportSize, string> = {
  source: 'Original',
  square1080: '1080',
  poster2k: '2K',
}
