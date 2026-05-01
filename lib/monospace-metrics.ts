/** Same stack as `ascii-output` canvas — must stay in sync for aspect ratio. */
export const ASCII_MONO_FONT_STACK =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

/** Line height multiplier matching ascii canvas (`ch = fs * this`). */
export const ASCII_LINE_HEIGHT_EM = 1.22

export function monospaceFontSpec(sizePx: number): string {
  return `${sizePx}px ${ASCII_MONO_FONT_STACK}`
}

/**
 * Width/height of one monospace cell (cw/ch). Independent of font size for typical vector fonts.
 * Used so sampling grid rows match rendered ASCII aspect = image aspect.
 */
export function getMonospaceCellWidthHeightRatio(): number {
  if (typeof document === 'undefined') return 0.62 / ASCII_LINE_HEIGHT_EM
  const fs = 10
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  if (!ctx) return 0.62 / ASCII_LINE_HEIGHT_EM
  ctx.font = monospaceFontSpec(fs)
  const cw = ctx.measureText('M').width
  const ch = fs * ASCII_LINE_HEIGHT_EM
  const r = cw / ch
  if (!Number.isFinite(r) || r <= 0) return 0.62 / ASCII_LINE_HEIGHT_EM
  return r
}
