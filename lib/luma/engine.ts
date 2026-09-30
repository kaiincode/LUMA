import type { RenderMode } from '@/lib/render-mode'

/**
 * LUMA engine.
 *
 * `analyzeImage` turns a picture into a field of cells: tone, edge strength,
 * local flow direction and colour. `drawPattern` turns a field into marks at any
 * size, so the preview and every export are drawn as vectors at their final
 * resolution instead of being scaled up from a small bitmap.
 */

/**
 * What the marks sit on. `auto` uses the image's own background colour and
 * keeps the marks in their original colours.
 */
export type Paper = 'dark' | 'light' | 'auto'

export type RGB = [number, number, number]

export type LumaSource = {
  el: CanvasImageSource
  width: number
  height: number
}

export type LumaField = {
  cols: number
  rows: number
  /** Lightness after tone work, 0 (black) … 1 (white). */
  tone: Float32Array
  /** Edge strength, 0 … 1. */
  edge: Float32Array
  /** Direction of the local gradient in radians; marks follow the perpendicular. */
  angle: Float32Array
  /** How strongly the neighbourhood agrees on that direction, 0 … 1. */
  coherence: Float32Array
  /** Area-averaged colour, RGB per cell. */
  rgb: Uint8ClampedArray
  /** Opacity per cell; transparent areas get no ink. */
  alpha: Float32Array
  /** Ink colours per paper (and look), built lazily. */
  inks: Record<string, string[]>
}

export type Crop = { sx: number; sy: number; sw: number; sh: number }

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

const FIXED_PAPER: Record<'dark' | 'light', RGB> = { dark: [0, 0, 0], light: [255, 255, 255] }

/** The paper's colour. `auto` needs the background measured from the image. */
export function paperRGB(paper: Paper, background?: RGB | null): RGB {
  if (paper === 'auto') return background ?? FIXED_PAPER.light
  return FIXED_PAPER[paper]
}

export function paperCss(paper: Paper, background?: RGB | null) {
  const [r, g, b] = paperRGB(paper, background)
  return `rgb(${r},${g},${b})`
}

/** Whether text and handles drawn on this paper should be light. */
export function isDarkPaper(paper: Paper, background?: RGB | null) {
  const [r, g, b] = paperRGB(paper, background)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5
}

/**
 * The image's background colour: the per-channel median of a thin ring
 * around the edge, which is where the background usually shows. Returns null
 * when the edge is mostly transparent.
 */
export function estimateBackground(source: LumaSource): RGB | null {
  const size = 96
  const k = Math.min(1, size / Math.max(source.width, source.height))
  const w = Math.max(4, Math.round(source.width * k))
  const h = Math.max(4, Math.round(source.height * k))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source.el, 0, 0, w, h)
  const d = ctx.getImageData(0, 0, w, h).data
  const ring = Math.max(1, Math.round(Math.min(w, h) * 0.04))
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  let seen = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= ring && x < w - ring && y >= ring && y < h - ring) continue
      seen++
      const i = (y * w + x) * 4
      if (d[i + 3] < 128) continue
      rs.push(d[i])
      gs.push(d[i + 1])
      bs.push(d[i + 2])
    }
  }
  if (rs.length < seen * 0.5) return null
  const median = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1]
  return [median(rs), median(gs), median(bs)]
}

/* ------------------------------------------------------------------ */
/* Analysis                                                            */
/* ------------------------------------------------------------------ */

function boxBlur(src: Float32Array, w: number, h: number, r: number) {
  if (r <= 0) return src.slice()
  const W = w + 1
  const sat = new Float64Array(W * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += src[y * w + x]
      sat[(y + 1) * W + x + 1] = sat[y * W + x + 1] + row
    }
  }
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(h, y + r + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(w, x + r + 1)
      out[y * w + x] =
        (sat[y1 * W + x1] - sat[y0 * W + x1] - sat[y1 * W + x0] + sat[y0 * W + x0]) / ((y1 - y0) * (x1 - x0))
    }
  }
  return out
}

/** Two box passes approximate a gaussian without the ringing of a single box. */
const softBlur = (src: Float32Array, w: number, h: number, r: number) => boxBlur(boxBlur(src, w, h, r), w, h, r)

function percentile(values: Float32Array, p: number) {
  const hist = new Uint32Array(1024)
  for (let i = 0; i < values.length; i++) hist[Math.min(1023, (clamp01(values[i]) * 1023) | 0)]++
  const target = values.length * p
  let acc = 0
  for (let i = 0; i < 1024; i++) {
    acc += hist[i]
    if (acc >= target) return i / 1023
  }
  return 1
}

/**
 * Samples the source into a `w × h` bitmap. Halving step by step averages every
 * source pixel, which a single large downscale in the browser does not do.
 */
function sample(source: LumaSource, w: number, h: number, crop?: Crop) {
  const c = crop ?? { sx: 0, sy: 0, sw: source.width, sh: source.height }
  let cur: CanvasImageSource = source.el
  let cx = c.sx
  let cy = c.sy
  let cw = c.sw
  let ch = c.sh
  while (cw / 2 >= w * 1.5 && ch / 2 >= h * 1.5) {
    const nw = Math.round(cw / 2)
    const nh = Math.round(ch / 2)
    const step = document.createElement('canvas')
    step.width = nw
    step.height = nh
    const sctx = step.getContext('2d')!
    sctx.imageSmoothingQuality = 'high'
    sctx.drawImage(cur, cx, cy, cw, ch, 0, 0, nw, nh)
    cur = step
    cx = 0
    cy = 0
    cw = nw
    ch = nh
  }
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const octx = out.getContext('2d', { willReadFrequently: true })!
  octx.imageSmoothingQuality = 'high'
  octx.drawImage(cur, cx, cy, cw, ch, 0, 0, w, h)
  return octx.getImageData(0, 0, w, h).data
}

/**
 * Builds a `cols × rows` field. Tone, edges and flow are measured at twice the
 * cell resolution and pooled, which keeps thin features that a straight
 * one-sample-per-cell pass would drop.
 */
export function analyzeImage(source: LumaSource, cols: number, rows: number, crop?: Crop): LumaField {
  const W = cols * 2
  const H = rows * 2
  const N = W * H
  const px = sample(source, W, H, crop)

  // Luma from the encoded values: close enough to perceived lightness.
  const lum = new Float32Array(N)
  for (let i = 0, p = 0; p < N; i += 4, p++) {
    lum[p] = px[i + 3] ? (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255 : 0.5
  }

  // 1. Global stretch between the 0.5th and 99.5th percentiles.
  const lo = percentile(lum, 0.005)
  const hi = percentile(lum, 0.995)
  const range = Math.max(0.04, hi - lo)
  for (let i = 0; i < N; i++) lum[i] = clamp01((lum[i] - lo) / range)

  // 2. Local contrast: unsharp mask at a large radius lifts form without
  //    amplifying noise in flat areas the way variance normalisation does.
  const big = softBlur(lum, W, H, Math.max(2, Math.round(W / 36)))
  const fine = softBlur(lum, W, H, 1)
  const tone2 = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    // Clamping the detail terms stops bright rims and dark moats (halos)
    // from forming along strong edges.
    const coarse = Math.max(-0.18, Math.min(0.18, lum[i] - big[i]))
    const detail = Math.max(-0.12, Math.min(0.12, lum[i] - fine[i]))
    const v = lum[i] + 0.55 * coarse + 0.35 * detail
    // Gentle S-curve for separation in the mid-tones.
    const t = clamp01(v)
    tone2[i] = t + 0.3 * (t * t * (3 - 2 * t) - t)
  }

  // 3. Sobel gradients on a lightly smoothed copy.
  const smooth = fine
  const gx = new Float32Array(N)
  const gy = new Float32Array(N)
  const mag = new Float32Array(N)
  const at = (x: number, y: number) =>
    smooth[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))]
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tl = at(x - 1, y - 1)
      const t = at(x, y - 1)
      const tr = at(x + 1, y - 1)
      const l = at(x - 1, y)
      const r = at(x + 1, y)
      const bl = at(x - 1, y + 1)
      const b = at(x, y + 1)
      const br = at(x + 1, y + 1)
      const i = y * W + x
      gx[i] = tr + 2 * r + br - tl - 2 * l - bl
      gy[i] = bl + 2 * b + br - tl - 2 * t - tr
      mag[i] = Math.hypot(gx[i], gy[i])
    }
  }
  const magScale = 1 / Math.max(0.35, percentile(new Float32Array(mag.map((m) => m / 4)), 0.97) * 4)

  // 4. Structure tensor, smoothed, for a stable flow direction.
  const jxx = new Float32Array(N)
  const jyy = new Float32Array(N)
  const jxy = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    jxx[i] = gx[i] * gx[i]
    jyy[i] = gy[i] * gy[i]
    jxy[i] = gx[i] * gy[i]
  }
  const tr = Math.max(2, Math.round(W / 120))
  const sxx = softBlur(jxx, W, H, tr)
  const syy = softBlur(jyy, W, H, tr)
  const sxy = softBlur(jxy, W, H, tr)

  // 5. Pool 2×2 into cells.
  const n = cols * rows
  const tone = new Float32Array(n)
  const edge = new Float32Array(n)
  const angle = new Float32Array(n)
  const coherence = new Float32Array(n)
  const rgb = new Uint8ClampedArray(n * 3)
  const alpha = new Float32Array(n)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = y * cols + x
      let t = 0
      let eSum = 0
      let eMax = 0
      let a = 0
      let b = 0
      let d = 0
      let r = 0
      let g = 0
      let bl = 0
      let op = 0
      for (let oy = 0; oy < 2; oy++) {
        for (let ox = 0; ox < 2; ox++) {
          const i = (y * 2 + oy) * W + x * 2 + ox
          t += tone2[i]
          const e = mag[i] * magScale
          eSum += e
          if (e > eMax) eMax = e
          a += sxx[i]
          b += syy[i]
          d += sxy[i]
          const w = px[i * 4 + 3]
          r += px[i * 4] * w
          g += px[i * 4 + 1] * w
          bl += px[i * 4 + 2] * w
          op += w
        }
      }
      tone[c] = t / 4
      edge[c] = clamp01(eSum / 8 + eMax / 2)
      angle[c] = 0.5 * Math.atan2(2 * d, a - b)
      const lam = Math.sqrt((a - b) * (a - b) + 4 * d * d)
      coherence[c] = a + b > 1e-6 ? clamp01(lam / (a + b)) : 0
      const wsum = Math.max(1, op)
      rgb[c * 3] = r / wsum
      rgb[c * 3 + 1] = g / wsum
      rgb[c * 3 + 2] = bl / wsum
      alpha[c] = op / (4 * 255)
    }
  }

  return { cols, rows, tone, edge, angle, coherence, rgb, alpha, inks: {} }
}

/**
 * Ink colours for a paper. On black or white, tone is carried by the size of
 * each mark, so the colour is pulled towards a luminance that reads on that
 * paper and given a little extra saturation — dark hues stay visible on black
 * and pale hues on white. On `auto` paper the marks keep their own colour,
 * with brightness applied directly.
 */
function inksFor(field: LumaField, opts: DrawOptions) {
  const auto = opts.paper === 'auto'
  const bright = auto ? (opts.brightness ?? 0) * 0.35 : 0
  const key = auto ? `auto:${bright.toFixed(3)}` : opts.paper
  const cached = field.inks[key]
  if (cached) return cached
  const target = opts.paper === 'dark' ? 0.74 : 0.3
  const pull = auto ? 0 : 0.55
  const vib = auto ? 1.08 : 1.3
  const n = field.cols * field.rows
  const out = new Array<string>(n)
  for (let i = 0; i < n; i++) {
    let r = field.rgb[i * 3] / 255
    let g = field.rgb[i * 3 + 1] / 255
    let b = field.rgb[i * 3 + 2] / 255
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    r = y + (r - y) * vib
    g = y + (g - y) * vib
    b = y + (b - y) * vib
    const shift = (target - y) * pull + bright
    out[i] = `rgb(${Math.round(clamp01(r + shift) * 255)},${Math.round(clamp01(g + shift) * 255)},${Math.round(
      clamp01(b + shift) * 255,
    )})`
  }
  field.inks[key] = out
  return out
}

/* ------------------------------------------------------------------ */
/* Glyphs                                                              */
/* ------------------------------------------------------------------ */

// A short, distinct set reads as tone; a long alphabet reads as noise.
const GLYPH_SET = " .,:;-~+=*!ixoz#%&@"

// Glyphs that follow an edge, indexed by the edge direction in 45° steps:
// horizontal, falling (\ on screen), vertical, rising (/).
const EDGE_GLYPHS = ['-', '\\', '|', '/']

type GlyphRamp = { chars: string[]; cover: Float32Array; edgeCover: Float32Array }
const rampCache = new Map<string, GlyphRamp>()

/** Measures how much of a cell each glyph inks, in the font actually used. */
export function glyphRamp(font: string): GlyphRamp {
  const hit = rampCache.get(font)
  if (hit) return hit
  const size = 48
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.font = `600 ${size}px ${font}`
  const cw = Math.ceil(ctx.measureText('M').width)
  const ch = Math.ceil(size * 1.2)
  c.width = cw
  c.height = ch
  const inkOf = (g: string) => {
    ctx.clearRect(0, 0, cw, ch)
    ctx.font = `600 ${size}px ${font}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#fff'
    ctx.fillText(g, cw / 2, ch / 2)
    const d = ctx.getImageData(0, 0, cw, ch).data
    let s = 0
    for (let i = 3; i < d.length; i += 4) s += d[i]
    return s / (255 * cw * ch)
  }
  const measured: Array<[string, number]> = []
  for (const g of GLYPH_SET) measured.push([g, inkOf(g)])
  measured.sort((a, b) => a[1] - b[1])
  const max = measured[measured.length - 1][1] || 1
  // Keep glyphs that add a visibly new step so the ramp is even.
  const chars: string[] = []
  const cover: number[] = []
  for (const [g, v] of measured) {
    const norm = v / max
    if (!cover.length || norm - cover[cover.length - 1] > 0.018) {
      chars.push(g)
      cover.push(norm)
    }
  }
  const ramp = {
    chars,
    cover: Float32Array.from(cover),
    edgeCover: Float32Array.from(EDGE_GLYPHS.map((g) => inkOf(g) / max)),
  }
  rampCache.set(font, ramp)
  return ramp
}

function nearestGlyph(ramp: GlyphRamp, v: number) {
  const c = ramp.cover
  let lo = 0
  let hi = c.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (c[mid] < v) lo = mid
    else hi = mid
  }
  return v - c[lo] < c[hi] - v ? lo : hi
}

/* ------------------------------------------------------------------ */
/* Drawing                                                             */
/* ------------------------------------------------------------------ */

export type DrawOptions = {
  paper: Paper
  /** 0 … 1: how heavy the marks are. */
  strength?: number
  /** -1 … 1: lightens or darkens the image before it becomes marks. */
  brightness?: number
  /** -1 … 1: spreads or flattens the tones before they become marks. */
  contrast?: number
  /** The image's background colour, used when `paper` is `auto`. */
  background?: RGB | null
  /** Treat every cell as solid subject (used for type set in patterns). */
  boost?: boolean
  /** Font stack for ASCII. */
  font?: string
}

export type Rect = { x: number; y: number; w: number; h: number }

function hash(x: number, y: number, k: number) {
  let h = (x * 374761393 + y * 668265263 + k * 1274126177) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * How much ink a cell gets. On dark paper light areas get the most ink; on
 * light paper, dark areas do — so the output always reads like the source.
 */
export function coverageMap(field: LumaField, opts: DrawOptions) {
  const { tone, edge, alpha, rgb, cols, rows } = field
  const s = opts.strength ?? 0.55
  const gamma = 1.55 - s * 0.95 // 1.55 (light) … 0.6 (heavy)
  const edgeGain = 0.12 + s * 0.4
  const bright = (opts.brightness ?? 0) * 0.45
  const contrast = opts.contrast ?? 0
  // Contrast as a slope around mid-grey: 0.35× (flat) … 2.6× (punchy).
  const slope = contrast >= 0 ? 1 + contrast * 1.6 : 1 + contrast * 0.65
  const out = new Float32Array(cols * rows)
  if (opts.paper === 'auto') {
    // On the image's own background, ink goes wherever a cell differs from
    // that background, by colour as much as by lightness. Contrast steepens
    // the response; brightness is applied to the ink colour instead.
    const [br, bg, bb] = paperRGB('auto', opts.background)
    const exp = gamma / slope
    for (let i = 0; i < cols * rows; i++) {
      const dr = rgb[i * 3] - br
      const dg = rgb[i * 3 + 1] - bg
      const db = rgb[i * 3 + 2] - bb
      // "Redmean" weighting: a cheap approximation of perceived colour distance.
      const rm = (rgb[i * 3] + br) / 2
      const dist = Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db) / 765
      let v = Math.max(0, dist * 2.4 - 0.06) / 0.94
      v = Math.pow(clamp01(v), exp) + edge[i] * edgeGain * Math.min(1, v * 2)
      if (opts.boost) v = 0.42 + 0.58 * v
      out[i] = clamp01(v) * alpha[i]
    }
    return out
  }
  for (let i = 0; i < cols * rows; i++) {
    const t = clamp01((tone[i] - 0.5) * slope + 0.5 + bright)
    let v = opts.paper === 'dark' ? t : 1 - t
    // A small knee keeps near-paper tones clean instead of dusting them
    // with specks too small to read as marks.
    v = Math.max(0, v - 0.05) / 0.95
    // Edges only deepen marks that are already there, so a bright subject on
    // a dark ground doesn't grow a rim of stray marks on the ground side.
    v = Math.pow(v, gamma) + edge[i] * edgeGain * Math.min(1, v * 2)
    if (opts.boost) v = 0.42 + 0.58 * v
    out[i] = clamp01(v) * alpha[i]
  }
  return out
}

export function drawPattern(
  ctx: CanvasRenderingContext2D,
  field: LumaField,
  mode: RenderMode,
  rect: Rect,
  opts: DrawOptions,
) {
  const { cols, rows, angle, coherence, edge } = field
  const cw = rect.w / cols
  const ch = rect.h / rows
  const s = Math.min(cw, ch)
  const cov = coverageMap(field, opts)
  const inks = inksFor(field, opts)

  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.x, rect.y, rect.w, rect.h)
  ctx.clip()

  if (mode === 'ascii') {
    const font = opts.font ?? 'ui-monospace, monospace'
    const ramp = glyphRamp(font)
    ctx.font = `600 ${Math.min(ch * 1.08, cw / 0.6)}px ${font}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // Serpentine error diffusion so gradients step smoothly between glyphs.
    const err = new Float32Array((cols + 2) * 2)
    for (let y = 0; y < rows; y++) {
      const cur = (y & 1) * (cols + 2)
      const nxt = ((y + 1) & 1) * (cols + 2)
      err.fill(0, nxt, nxt + cols + 2)
      const ltr = (y & 1) === 0
      for (let k = 0; k < cols; k++) {
        const x = ltr ? k : cols - 1 - k
        const i = y * cols + x
        const v = cov[i] + err[cur + x + 1]
        let g: string
        let inked: number
        if (edge[i] > 0.58 && coherence[i] > 0.6 && cov[i] > 0.1) {
          // On a clear edge, draw a stroke that runs along it.
          const along = angle[i] + Math.PI / 2
          const k = ((Math.round(along / (Math.PI / 4)) % 4) + 4) % 4
          g = EDGE_GLYPHS[k]
          inked = ramp.edgeCover[k]
        } else {
          const gi = nearestGlyph(ramp, clamp01(v))
          g = ramp.chars[gi]
          inked = ramp.cover[gi]
        }
        // Damped diffusion: smooth gradients without scattering the shapes.
        const e = (v - inked) * 0.7
        const dir = ltr ? 1 : -1
        err[cur + x + 1 + dir] += (e * 7) / 16
        err[nxt + x + 1 - dir] += (e * 3) / 16
        err[nxt + x + 1] += (e * 5) / 16
        err[nxt + x + 1 + dir] += (e * 1) / 16
        if (g === ' ') continue
        ctx.fillStyle = inks[i]
        ctx.fillText(g, rect.x + (x + 0.5) * cw, rect.y + (y + 0.5) * ch)
      }
    }
    ctx.restore()
    return
  }

  ctx.lineCap = mode === 'contour' ? 'round' : 'butt'

  for (let y = 0; y < rows; y++) {
    const cy = rect.y + (y + 0.5) * ch
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      const v = cov[i]
      if (v < 0.015) continue
      const cx = rect.x + (x + 0.5) * cw
      ctx.fillStyle = inks[i]
      ctx.strokeStyle = inks[i]

      switch (mode) {
        case 'dots': {
          // Area follows coverage, so radius follows its square root.
          const r = Math.sqrt(v) * s * 0.56
          if (r < 0.2) break
          ctx.beginPath()
          ctx.arc(cx, cy, r, 0, Math.PI * 2)
          ctx.fill()
          break
        }
        case 'mosaic': {
          const side = Math.sqrt(v) * s * 0.94
          if (side < 0.5) break
          ctx.beginPath()
          ctx.roundRect(cx - side / 2, cy - side / 2, side, side, side * 0.2)
          ctx.fill()
          break
        }
        case 'hatch': {
          // Strokes run corner to corner so neighbouring cells join into
          // long engraved lines; width carries the tone.
          const h = s / 2
          const w1 = Math.min(1, v * 1.7) * s * 0.3
          const w2 = clamp01((v - 0.38) / 0.5) * s * 0.26
          const w3 = clamp01((v - 0.72) / 0.28) * s * 0.22
          if (w1 > 0.15) {
            ctx.lineWidth = w1
            ctx.beginPath()
            ctx.moveTo(cx - h, cy + h)
            ctx.lineTo(cx + h, cy - h)
            ctx.stroke()
          }
          if (w2 > 0.15) {
            ctx.lineWidth = w2
            ctx.beginPath()
            ctx.moveTo(cx - h, cy - h)
            ctx.lineTo(cx + h, cy + h)
            ctx.stroke()
          }
          if (w3 > 0.15) {
            ctx.lineWidth = w3
            ctx.beginPath()
            ctx.moveTo(cx - h, cy)
            ctx.lineTo(cx + h, cy)
            ctx.stroke()
          }
          break
        }
        case 'contour': {
          // Short strokes along the flow; longer where the flow is coherent.
          const t = angle[i] + Math.PI / 2
          const len = s * (0.75 + coherence[i] * 0.9)
          const dx = Math.cos(t) * len * 0.5
          const dy = Math.sin(t) * len * 0.5
          const w = s * (0.06 + v * 0.34)
          if (w < 0.15) break
          ctx.lineWidth = w
          ctx.beginPath()
          ctx.moveTo(cx - dx, cy - dy)
          ctx.lineTo(cx + dx, cy + dy)
          ctx.stroke()
          break
        }
        case 'stipple': {
          // Dot count carries tone; positions are jittered inside a 3×3
          // lattice so dots never clump.
          const slots = 9
          const count = Math.min(slots, Math.floor(v * slots * 1.05 + hash(x, y, 7)))
          if (!count) break
          const r = s * 0.15
          const start = Math.floor(hash(x, y, 11) * slots)
          ctx.beginPath()
          for (let k = 0; k < count; k++) {
            const slot = (start + k * 4) % slots
            const sx = ((slot % 3) + 0.2 + hash(x, y, k * 3) * 0.6) / 3
            const sy = (Math.floor(slot / 3) + 0.2 + hash(x, y, k * 3 + 1) * 0.6) / 3
            const rr = r * (0.75 + hash(x, y, k * 3 + 2) * 0.5)
            const px = cx - s / 2 + sx * s
            const py = cy - s / 2 + sy * s
            ctx.moveTo(px + rr, py)
            ctx.arc(px, py, rr, 0, Math.PI * 2)
          }
          ctx.fill()
          break
        }
        case 'halftone': {
          // Ellipses keep the area of the equivalent dot, stretched along the
          // flow where the image has a clear direction.
          const r0 = Math.sqrt(v) * s * 0.56
          if (r0 < 0.2) break
          const e = 1 + coherence[i] * 1.4
          const k = Math.sqrt(e)
          ctx.beginPath()
          ctx.ellipse(cx, cy, r0 * k, r0 / k, angle[i] + Math.PI / 2, 0, Math.PI * 2)
          ctx.fill()
          break
        }
      }
    }
  }
  ctx.restore()
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Crop that makes the source cover a target aspect ratio, centred. */
export function coverCrop(sw: number, sh: number, aspect: number): Crop {
  if (sw / sh > aspect) {
    const w = sh * aspect
    return { sx: (sw - w) / 2, sy: 0, sw: w, sh }
  }
  const h = sw / aspect
  return { sx: 0, sy: (sh - h) / 2, sw, sh: h }
}

/** Largest rect with the given aspect that fits inside `box`, centred. */
export function containRect(box: Rect, aspect: number): Rect {
  let w = box.w
  let h = w / aspect
  if (h > box.h) {
    h = box.h
    w = h * aspect
  }
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }
}

/**
 * Grid for a mode. ASCII cells are text-shaped (about 0.6 : 1), the others
 * are square, so both fill the image with the same number of columns.
 */
export function gridFor(mode: RenderMode, cols: number, width: number, height: number) {
  if (mode === 'ascii') {
    // Glyphs need more room than dots to stay legible.
    const c = Math.max(8, Math.round(cols * 0.62))
    return { cols: c, rows: Math.max(2, Math.round(((c * height) / width) * 0.6)) }
  }
  return { cols, rows: Math.max(2, Math.round((cols * height) / width)) }
}
