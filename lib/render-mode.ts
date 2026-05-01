export const RENDER_MODES = [
  'ascii',
  'dots',
  'hatch',
  'mosaic',
  'contour',
  'stipple',
  'halftone',
] as const

export type RenderMode = (typeof RENDER_MODES)[number]

export const RENDER_MODE_LABELS: Record<RenderMode, string> = {
  ascii: 'ASCII',
  dots: 'Dots',
  hatch: 'Hatch',
  mosaic: 'Mosaic',
  contour: 'Contour',
  stipple: 'Stipple',
  halftone: 'Halftone',
}
