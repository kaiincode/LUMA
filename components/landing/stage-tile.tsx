'use client'

import { useEffect, useRef } from 'react'
import type { RenderMode } from '@/lib/render-mode'
import { buildField, drawField, drawStage, type SourceImage, type Stage } from './pattern-engine'

const GRID = 16

type StageTileProps = {
  source: SourceImage | null
  stage: Stage | RenderMode
  label: string
}

/** One square view of the pipeline, on a deliberately coarse grid so each cell reads. */
export function StageTile({ source, stage, label }: StageTileProps) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const box = boxRef.current
    const canvas = canvasRef.current
    if (!box || !canvas || !source) return

    const draw = () => {
      const size = box.clientWidth
      if (!size) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(size * dpr)
      canvas.height = Math.round(size * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)
      const cell = size / GRID
      const field = buildField(source, GRID, GRID)
      if (stage === 'sample' || stage === 'lift' || stage === 'paint') {
        drawStage(ctx, field, stage, cell, source, 'rgba(255,255,255,0.9)')
      } else {
        drawField(ctx, field, stage, cell, '"Geist Mono", ui-monospace, monospace')
      }
    }

    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(box)
    return () => ro.disconnect()
  }, [source, stage])

  return (
    <div ref={boxRef} className="relative aspect-square overflow-hidden bg-[var(--plate)]">
      <canvas ref={canvasRef} role="img" aria-label={label} className="absolute inset-0 h-full w-full" />
    </div>
  )
}
