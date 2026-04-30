'use client'

import { useEffect, useRef, useState } from 'react'
import { RefreshCcw, Upload } from 'lucide-react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'

interface ImageToAsciiProps {
  onOutput: (ascii: '' | { plain: string; cols: number; rows: number; colors: Uint8ClampedArray }) => void
  variant?: 'default' | 'frame'
  aspect?: 'square' | 'frame'
}

// Dot-field background + "ink" characters for subject.
const DOT_BG = '.'
const INK = 'x9+*#%@'
const SHADE = " .'`-:=+x*9#%@"

// 8x8 Bayer ordered dither matrix (0..63)
const BAYER_8 = [
  [0, 48, 12, 60, 3, 51, 15, 63],
  [32, 16, 44, 28, 35, 19, 47, 31],
  [8, 56, 4, 52, 11, 59, 7, 55],
  [40, 24, 36, 20, 43, 27, 39, 23],
  [2, 50, 14, 62, 1, 49, 13, 61],
  [34, 18, 46, 30, 33, 17, 45, 29],
  [10, 58, 6, 54, 9, 57, 5, 53],
  [42, 26, 38, 22, 41, 25, 37, 21],
]

export function ImageToAscii({ onOutput, variant = 'default', aspect = 'frame' }: ImageToAsciiProps) {
  const [image, setImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const preRef = useRef<{
    cols: number
    rows: number
    lum: Float32Array
    edges: Float32Array
    rgb: Uint8ClampedArray
    baseThreshold: number
  } | null>(null)
  const animRef = useRef<number | null>(null)

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setImage(event.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const convertImageToAscii = (targetCols?: number) => {
    if (!image) return
    // Choose columns based on frame width for more detail, while staying performant.
    const cols = Math.max(110, Math.min(220, Math.round(targetCols ?? 170)))

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const charAspect = 0.52 // text cell height/width compensation
      const rows = Math.max(24, Math.round((cols * img.height) / img.width * charAspect))
      const idx = (x: number, y: number) => y * cols + x

      canvas.width = cols
      canvas.height = rows
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, cols, rows)

      const imageData = ctx.getImageData(0, 0, cols, rows)
      const data = imageData.data

      // Build luminance buffer in [0..1]
      const lum = new Float32Array(cols * rows)
      const rgb = new Uint8ClampedArray(cols * rows * 3)
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const r = data[i] / 255
        const g = data[i + 1] / 255
        const b = data[i + 2] / 255
        // sRGB luminance
        lum[p] = 0.2126 * r + 0.7152 * g + 0.0722 * b
        rgb[p * 3 + 0] = data[i]
        rgb[p * 3 + 1] = data[i + 1]
        rgb[p * 3 + 2] = data[i + 2]
      }

      // Auto-contrast using percentiles (1%–99%)
      const sorted = Array.from(lum)
      sorted.sort((a, b) => a - b)
      const lo = sorted[Math.floor(sorted.length * 0.01)] ?? 0
      const hi = sorted[Math.floor(sorted.length * 0.99)] ?? 1
      const range = Math.max(1e-6, hi - lo)
      for (let i = 0; i < lum.length; i++) {
        lum[i] = Math.min(1, Math.max(0, (lum[i] - lo) / range))
      }

      // Gamma (helps separate tones after contrast stretch)
      const gamma = 0.9
      for (let i = 0; i < lum.length; i++) lum[i] = Math.pow(lum[i], gamma)

      // Local contrast (CLAHE-lite): normalize by local mean/std (fast 7x7 box)
      const local = new Float32Array(cols * rows)
      const radius = 3
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          let sum = 0
          let sum2 = 0
          let n = 0
          for (let oy = -radius; oy <= radius; oy++) {
            const yy = y + oy
            if (yy < 0 || yy >= rows) continue
            for (let ox = -radius; ox <= radius; ox++) {
              const xx = x + ox
              if (xx < 0 || xx >= cols) continue
              const v = lum[idx(xx, yy)]
              sum += v
              sum2 += v * v
              n++
            }
          }
          const mean = sum / n
          const varr = Math.max(1e-6, sum2 / n - mean * mean)
          const std = Math.sqrt(varr)
          // map to ~[0..1]
          local[idx(x, y)] = Math.min(1, Math.max(0, 0.5 + (lum[idx(x, y)] - mean) / (std * 3.2)))
        }
      }
      for (let i = 0; i < lum.length; i++) lum[i] = local[i]

      // Unsharp mask (simple 3x3 box blur + add back)
      const blur = new Float32Array(cols * rows)
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          let sum = 0
          let n = 0
          for (let oy = -1; oy <= 1; oy++) {
            const yy = y + oy
            if (yy < 0 || yy >= rows) continue
            for (let ox = -1; ox <= 1; ox++) {
              const xx = x + ox
              if (xx < 0 || xx >= cols) continue
              sum += lum[idx(xx, yy)]
              n++
            }
          }
          blur[idx(x, y)] = sum / n
        }
      }
      const sharpenAmount = 0.55
      for (let i = 0; i < lum.length; i++) {
        lum[i] = Math.min(1, Math.max(0, lum[i] + (lum[i] - blur[i]) * sharpenAmount))
      }

      // DoG edges (difference of Gaussians-ish): blur radius 1 vs 2 and subtract
      const blur2 = new Float32Array(cols * rows)
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          let sum = 0
          let n = 0
          for (let oy = -2; oy <= 2; oy++) {
            const yy = y + oy
            if (yy < 0 || yy >= rows) continue
            for (let ox = -2; ox <= 2; ox++) {
              const xx = x + ox
              if (xx < 0 || xx >= cols) continue
              sum += lum[idx(xx, yy)]
              n++
            }
          }
          blur2[idx(x, y)] = sum / n
        }
      }

      const edges = new Float32Array(cols * rows)
      for (let y = 1; y < rows - 1; y++) {
        for (let x = 1; x < cols - 1; x++) {
          const i = idx(x, y)
          const dog = Math.abs(blur[i] - blur2[i]) * 2.6
          edges[i] = Math.min(1, dog)
        }
      }

      // Adaptive threshold via Otsu on "inkness"
      const inkness = new Float32Array(cols * rows)
      for (let i = 0; i < inkness.length; i++) {
        inkness[i] = Math.min(1, Math.max(0, Math.pow(1 - lum[i], 1.12) * 0.95 + edges[i] * 0.95))
      }
      const hist = new Uint32Array(256)
      for (let i = 0; i < inkness.length; i++) hist[Math.max(0, Math.min(255, (inkness[i] * 255) | 0))]++
      const total = inkness.length
      let sum = 0
      for (let t = 0; t < 256; t++) sum += t * hist[t]
      let sumB = 0
      let wB = 0
      let varMax = -1
      let threshold = 96
      for (let t = 0; t < 256; t++) {
        wB += hist[t]
        if (wB === 0) continue
        const wF = total - wB
        if (wF === 0) break
        sumB += t * hist[t]
        const mB = sumB / wB
        const mF = (sum - sumB) / wF
        const v = wB * wF * (mB - mF) * (mB - mF)
        if (v > varMax) {
          varMax = v
          threshold = t
        }
      }
      const baseThreshold = Math.max(0.08, Math.min(0.28, threshold / 255))

      preRef.current = { cols, rows, lum, edges, rgb, baseThreshold }

      const render = (phase: number) => {
        const pre = preRef.current
        if (!pre) return
        const { cols, rows, lum, edges, rgb, baseThreshold } = pre
        const inkLevels = INK.length - 1
        const shadeLevels = SHADE.length - 1
        // Animate threshold slightly so the piece "breathes" but stays legible.
        const inkThreshold = Math.max(0.06, Math.min(0.32, baseThreshold + Math.sin(phase) * 0.02))
        const outLines = new Array<string>(rows)
        const colors = new Uint8ClampedArray(cols * rows * 3)

        const median = (arr: number[]) => {
          arr.sort((a, b) => a - b)
          return arr[Math.floor(arr.length / 2)]
        }
        for (let y = 0; y < rows; y++) {
          let line = ''
          for (let x = 0; x < cols; x++) {
            const i = idx(x, y)
            const l = lum[i] // 0..1 (dark..light)
            const e = edges[i] ?? 0
            const ink = Math.min(1, Math.max(0, Math.pow(1 - l, 1.15) * 0.95 + e * 0.95))
            const isSubject = ink >= inkThreshold

            const rs: number[] = []
            const gs: number[] = []
            const bs: number[] = []
            for (let oy = -1; oy <= 1; oy++) {
              const yy = y + oy
              if (yy < 0 || yy >= rows) continue
              for (let ox = -1; ox <= 1; ox++) {
                const xx = x + ox
                if (xx < 0 || xx >= cols) continue
                const ii = (yy * cols + xx) * 3
                rs.push(rgb[ii])
                gs.push(rgb[ii + 1])
                bs.push(rgb[ii + 2])
              }
            }
            let r = median(rs)
            let g = median(gs)
            let b = median(bs)

            // Gentle vibrance: push away from luma a bit.
            const lum255 = Math.round(l * 255)
            r = Math.max(0, Math.min(255, Math.round(lum255 + (r - lum255) * 1.12)))
            g = Math.max(0, Math.min(255, Math.round(lum255 + (g - lum255) * 1.12)))
            b = Math.max(0, Math.min(255, Math.round(lum255 + (b - lum255) * 1.12)))

            const ci = i * 3
            colors[ci] = r
            colors[ci + 1] = g
            colors[ci + 2] = b

            if (!isSubject) {
              // Background: ordered dither for smooth tone + gentle shimmer.
              const bgTone = Math.min(1, Math.max(0, 1 - (l * 0.92 + e * 0.12)))
              const bx = (x + Math.floor(phase * 2)) & 7
              const by = (y + Math.floor(phase * 1)) & 7
              const t = (BAYER_8[by][bx] + 0.5) / 64
              const ch = bgTone > t ? ':' : DOT_BG
              line += ch
              continue
            }

            // Subject: multi-level shading using luminance + edge boost.
            const edgeBoost = Math.min(1, e * 1.3)
            const shadeVal = Math.min(1, Math.max(0, (1 - l) * 0.85 + edgeBoost * 0.25))
            let s = Math.max(0, Math.min(shadeLevels, Math.round(shadeVal * shadeLevels)))

            // Add subtle motion: jitter the shade index by a tiny amount.
            const drift = ((x * 3 + y * 5 + Math.floor(phase * 3)) % 7 === 0) ? 1 : 0
            s = Math.max(0, Math.min(shadeLevels, s + drift))
            const ch = SHADE[s]
            line += ch
          }
          outLines[y] = line
        }
        onOutput({ plain: outLines.join('\n'), cols, rows, colors })
      }

      // Initial render + animation loop
      if (animRef.current) window.clearInterval(animRef.current)
      let p = 0
      render(p)
      animRef.current = window.setInterval(() => {
        p += 0.22
        render(p)
      }, 110)
    }
    img.src = image
  }

  useEffect(() => {
    if (variant === 'frame' && image) {
      const el = frameRef.current
      const widthPx = el?.clientWidth ?? 720
      // Estimate columns from frame width at a comfortable monospace size.
      const estimatedCols = Math.round(widthPx / 5.0)
      convertImageToAscii(estimatedCols)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, variant])

  useEffect(() => {
    return () => {
      if (animRef.current) window.clearInterval(animRef.current)
      animRef.current = null
    }
  }, [])

  const handleReload = () => {
    setImage(null)
    onOutput('')
    if (animRef.current) window.clearInterval(animRef.current)
    animRef.current = null
    setTimeout(() => fileInputRef.current?.click(), 0)
  }

  return (
    <div
      ref={frameRef}
      className="relative w-full rounded-2xl border border-border bg-background overflow-hidden transition-colors hover:bg-accent/20"
      style={{ aspectRatio: aspect === 'square' ? '1 / 1' : '16 / 11' }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="absolute inset-0 grid place-items-center focus:outline-none"
        aria-label="Upload image"
      >
        {image ? (
          <div className="absolute inset-0">
            <Image src={image} alt="Input image" fill className="object-contain p-8" />
          </div>
        ) : (
          <div className="grid place-items-center">
            <Upload className="h-5 w-5 opacity-80" />
          </div>
        )}
      </button>

      {image && (
        <div className="absolute right-3 top-3">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Reload image" onClick={handleReload}>
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
