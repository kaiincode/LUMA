import type { RenderMode } from '@/lib/render-mode'

export type MotionMode = 'still' | 'subtle' | 'live'
export type ExportSize = 'frame' | 'square1080' | 'poster2k' | 'source'

export type ModeSettings = {
  strength: number
}

export const DEFAULT_MODE_SETTINGS: Record<RenderMode, ModeSettings> = {
  ascii: { strength: 70 },
  dots: { strength: 70 },
  hatch: { strength: 68 },
  mosaic: { strength: 66 },
  contour: { strength: 72 },
  stipple: { strength: 70 },
  halftone: { strength: 70 },
}

export const EXPORT_SIZE_LABELS: Record<ExportSize, string> = {
  frame: 'Frame',
  square1080: '1080',
  poster2k: '2K',
  source: 'Source',
}

export function getMotionTiming(mode: MotionMode) {
  if (mode === 'live') {
    return { intervalMs: 280, phaseStep: 0.42, scale: 0.55 }
  }

  if (mode === 'subtle') {
    return { intervalMs: 680, phaseStep: 0.32, scale: 0.28 }
  }

  return { intervalMs: 0, phaseStep: 0, scale: 0 }
}
