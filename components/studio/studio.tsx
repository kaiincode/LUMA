'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Contrast, Download, ImagePlus, Moon, RotateCcw, Shapes, SlidersHorizontal, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Slider } from '@/components/ui/slider'
import { useMounted } from '@/hooks/use-mounted'
import { RENDER_MODE_LABELS, RENDER_MODES, type RenderMode } from '@/lib/render-mode'
import { EXPORT_SIZE_LABELS, MODE_WEIGHT, type ExportSize } from '@/lib/render-settings'
import {
  analyzeImage,
  containRect,
  coverCrop,
  drawPattern,
  gridFor,
  PAPER_COLOR,
  type LumaSource,
  type Paper,
} from '@/lib/luma/engine'
import { cn } from '@/lib/utils'
import { Wordmark } from '@/components/wordmark'
import { Stage } from './stage'
import { StylePicker } from './style-picker'

const MONO = '"Geist Mono", ui-monospace, monospace'
const FALLBACK_MONO = 'ui-monospace, monospace'

/** Longest side of the working copy. Phone photos are often 4000px+; the grid never needs that. */
const WORKING_SIZE = 1600

type Source = {
  name: string
  url: string
  /** Original pixel size, used for the "Original" export. */
  width: number
  height: number
  /** Downscaled working copy used for analysis and the compare view. */
  work: LumaSource
}

const EXPORT_SIZES: ExportSize[] = ['source', 'square1080', 'poster2k']
const DEFAULT_DETAIL = 70

/** Detail 45–100 maps to 60–260 columns. */
const columnsFor = (detail: number) => Math.round(60 + ((detail - 45) / 55) * 200)
const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`)

function loadImage(url: string, name: string): Promise<Source> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      const width = img.naturalWidth
      const height = img.naturalHeight
      const k = Math.min(1, WORKING_SIZE / Math.max(width, height))
      const work = document.createElement('canvas')
      work.width = Math.max(1, Math.round(width * k))
      work.height = Math.max(1, Math.round(height * k))
      const ctx = work.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, work.width, work.height)
      resolve({ name, url, width, height, work: { el: work, width: work.width, height: work.height } })
    }
    img.onerror = () => reject(new Error(name))
    img.src = url
  })
}

/** Hands the PNG to the share sheet on phones (so it can go to Photos), or downloads it. */
async function saveBlob(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: 'image/png' })
  const touch = window.matchMedia('(pointer: coarse)').matches
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return
      // Share refused (e.g. the gesture expired): fall through to a download.
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'sm',
  name = label,
}: {
  label: string
  name?: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
  size?: 'sm' | 'lg'
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col rounded-lg bg-foreground/[0.06] p-0.5">
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            'cursor-pointer rounded-md text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-foreground',
            size === 'lg' ? 'py-2.5 text-sm' : 'py-1.5 text-xs',
            o.value === value ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={o.value === value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </div>
  )
}

/**
 * A labelled slider. With `commit`, the value is applied when the thumb is
 * released rather than on every step — used for Detail, which re-analyses
 * the image.
 */
function AdjustSlider({
  id,
  label,
  format,
  value,
  min,
  max,
  step,
  onChange,
  commit = false,
  hideLabel = false,
}: {
  id: string
  label: string
  format: (v: number) => string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  commit?: boolean
  hideLabel?: boolean
}) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return (
    <div className="grid gap-2">
      <div className={cn('flex items-baseline justify-between text-sm', hideLabel && 'sr-only')}>
        <span id={`${id}-label`}>{label}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{format(local)}</span>
      </div>
      <Slider
        aria-labelledby={`${id}-label`}
        aria-valuetext={format(local)}
        value={[local]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => {
          const next = v ?? local
          setLocal(next)
          if (!commit) onChange(next)
        }}
        onValueCommit={([v]) => {
          if (commit) onChange(v ?? local)
        }}
      />
    </div>
  )
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-b border-[var(--rule)] px-4 py-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[0.6875rem] text-muted-foreground">{title}</h2>
        {aside ? <span className="font-mono text-[0.6875rem] tabular-nums text-muted-foreground">{aside}</span> : null}
      </div>
      {children}
    </section>
  )
}

type Tool = 'style' | 'adjust' | 'paper' | 'save'
type AdjustKey = 'detail' | 'brightness' | 'contrast'

const TOOLS: Array<{ id: Tool; label: string; icon: typeof Shapes }> = [
  { id: 'style', label: 'Style', icon: Shapes },
  { id: 'adjust', label: 'Adjust', icon: SlidersHorizontal },
  { id: 'paper', label: 'Paper', icon: Contrast },
  { id: 'save', label: 'Save', icon: Download },
]

export function Studio() {
  const mounted = useMounted()
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = mounted && resolvedTheme === 'dark'

  const fileRef = useRef<HTMLInputElement | null>(null)
  const [source, setSource] = useState<Source | null>(null)
  const [mode, setMode] = useState<RenderMode>('dots')
  const [detail, setDetail] = useState(DEFAULT_DETAIL)
  const [brightness, setBrightness] = useState(0)
  const [contrast, setContrast] = useState(0)
  const [paper, setPaper] = useState<Paper>('dark')
  const [exportSize, setExportSize] = useState<ExportSize>('poster2k')
  const [compare, setCompare] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [font, setFont] = useState(FALLBACK_MONO)
  const [saving, setSaving] = useState(false)
  const [tool, setTool] = useState<Tool>('style')
  const [adjustKey, setAdjustKey] = useState<AdjustKey>('brightness')

  // Start on the paper that matches the theme; after that the two are independent.
  const paperSet = useRef(false)
  useEffect(() => {
    if (!mounted || paperSet.current || !resolvedTheme) return
    paperSet.current = true
    setPaper(resolvedTheme === 'light' ? 'light' : 'dark')
  }, [mounted, resolvedTheme])

  // Glyph coverage is measured in the real font, so wait until it has loaded.
  useEffect(() => {
    document.fonts
      ?.load(`600 16px ${MONO}`)
      .then(() => setFont(MONO))
      .catch(() => {})
  }, [])

  const cols = columnsFor(detail)
  // Brightness and contrast run -100 … 100 in the UI and -1 … 1 in the engine.
  const look = useMemo(
    () => ({ strength: MODE_WEIGHT[mode], brightness: brightness / 100, contrast: contrast / 100 }),
    [mode, brightness, contrast],
  )
  const adjusted = detail !== DEFAULT_DETAIL || brightness !== 0 || contrast !== 0
  const resetAdjust = () => {
    setDetail(DEFAULT_DETAIL)
    setBrightness(0)
    setContrast(0)
  }
  const gridKind = mode === 'ascii' ? 'text' : 'square'

  const field = useMemo(() => {
    if (!source) return null
    const grid = gridFor(mode, cols, source.width, source.height)
    return analyzeImage(source.work, grid.cols, grid.rows)
    // Only the grid shape matters, not which square mode is showing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, cols, gridKind])

  const thumbs = useMemo(() => {
    if (!source) return { square: null, text: null }
    const crop = coverCrop(source.work.width, source.work.height, 1)
    return {
      square: analyzeImage(source.work, 26, 26, crop),
      text: analyzeImage(source.work, 22, 13, crop),
    }
  }, [source])

  const takeFile = useCallback((file: File | undefined | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setNotice(`${file.name} isn't an image. Use a JPG, PNG, WebP or GIF.`)
      return
    }
    const url = URL.createObjectURL(file)
    loadImage(url, file.name)
      .then((next) => {
        setSource((prev) => {
          if (prev?.url.startsWith('blob:')) URL.revokeObjectURL(prev.url)
          return next
        })
        setCompare(false)
        setNotice(null)
      })
      .catch(() => {
        URL.revokeObjectURL(url)
        setNotice(`${file.name} couldn't be read. Try another file.`)
      })
  }, [])

  const loadSample = () => {
    loadImage('/banner.png', 'banner.png')
      .then((next) => {
        setSource(next)
        setNotice(null)
      })
      .catch(() => setNotice('The sample image did not load.'))
  }

  const chooseFile = () => fileRef.current?.click()

  // Drop anywhere, or paste from the clipboard.
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (!depth) setDragging(false)
    }
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      takeFile(e.dataTransfer?.files[0])
    }
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((it) => it.type.startsWith('image/'))
      if (item) takeFile(item.getAsFile())
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('paste', onPaste)
    }
  }, [takeFile])

  // 1–7 pick a style, C toggles compare.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement
      if (t.isContentEditable || t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && (t as HTMLInputElement).type === 'text')) return
      const n = Number(e.key)
      if (n >= 1 && n <= RENDER_MODES.length) setMode(RENDER_MODES[n - 1])
      else if (e.key.toLowerCase() === 'c' && source) setCompare((c) => !c)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [source])

  const exportDims = useMemo(() => {
    if (!source) return null
    if (exportSize === 'square1080') return { w: 1080, h: 1080, pad: 0.06 }
    if (exportSize === 'poster2k') return { w: 2048, h: 2048, pad: 0.06 }
    return { w: source.width, h: source.height, pad: 0 }
  }, [exportSize, source])

  const save = async () => {
    if (!source || !field || !exportDims || saving) return
    setSaving(true)
    try {
      const { w, h, pad } = exportDims
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = PAPER_COLOR[paper]
      ctx.fillRect(0, 0, w, h)
      const inset = Math.min(w, h) * pad
      const rect = containRect({ x: inset, y: inset, w: w - inset * 2, h: h - inset * 2 }, source.width / source.height)
      drawPattern(ctx, field, mode, rect, { paper, font, ...look })
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
      if (!blob) throw new Error('encode')
      const base = source.name.replace(/\.[^.]+$/, '') || 'image'
      await saveBlob(blob, `${base}-luma-${mode}-${paper === 'dark' ? 'black' : 'white'}.png`)
    } catch {
      setNotice("The image couldn't be saved. Try a smaller export size.")
    } finally {
      setSaving(false)
    }
  }

  const displayCols = (d: number) => (mode === 'ascii' ? gridFor('ascii', columnsFor(d), 1, 1).cols : columnsFor(d))

  const sliders: Record<AdjustKey, React.ComponentProps<typeof AdjustSlider>> = {
    detail: {
      id: 'detail',
      label: 'Detail',
      format: (v) => `${displayCols(v)} columns`,
      value: detail,
      min: 45,
      max: 100,
      step: 5,
      onChange: setDetail,
      commit: true,
    },
    brightness: {
      id: 'brightness',
      label: 'Brightness',
      format: signed,
      value: brightness,
      min: -100,
      max: 100,
      step: 5,
      onChange: setBrightness,
    },
    contrast: {
      id: 'contrast',
      label: 'Contrast',
      format: signed,
      value: contrast,
      min: -100,
      max: 100,
      step: 5,
      onChange: setContrast,
    },
  }

  const paperOptions: Array<{ value: Paper; label: string }> = [
    { value: 'dark', label: 'Black' },
    { value: 'light', label: 'White' },
  ]
  const exportOptions = EXPORT_SIZES.map((s) => ({ value: s, label: EXPORT_SIZE_LABELS[s] }))
  const exportReadout = exportDims ? `${exportDims.w} × ${exportDims.h} px` : '—'
  const onPaperInk = paper === 'dark' ? 'text-white' : 'text-black'

  return (
    <div className="luma studio flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          takeFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--rule)] px-3 lg:h-14 lg:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" aria-label="LUMA home" className="focus-ring -m-2 p-2">
            <Wordmark />
          </Link>
          <span className="text-muted-foreground/60">/</span>
          <span className="text-sm text-muted-foreground">Studio</span>
        </div>
        <p className="hidden min-w-0 truncate font-mono text-xs text-muted-foreground lg:block">
          {source ? `${source.name} — ${source.width} × ${source.height}` : 'No image yet'}
        </p>
        <div className="flex items-center gap-1">
          {source ? (
            <button
              type="button"
              onClick={chooseFile}
              className="nav-link focus-ring h-9 gap-1.5 rounded-md px-2.5 text-sm lg:hidden"
              aria-label="Choose another image"
            >
              <ImagePlus className="size-4" />
              New
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="nav-link focus-ring size-9 justify-center rounded-md p-0"
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_340px]">
        <main className="relative min-h-0 flex-1">
          <Stage
            field={field}
            mode={mode}
            paper={paper}
            look={look}
            font={font}
            compare={compare && !!source}
            source={source?.work ?? null}
            label={source ? `${source.name} drawn in ${RENDER_MODE_LABELS[mode]} style` : 'Empty canvas'}
          >
            {source ? (
              <>
                <p
                  className={cn(
                    'pointer-events-none absolute left-4 top-3 hidden font-mono text-[0.6875rem] lg:block',
                    paper === 'dark' ? 'text-white/60' : 'text-black/55',
                  )}
                >
                  {RENDER_MODE_LABELS[mode]} · {field?.cols} × {field?.rows} cells
                </p>
                <button
                  type="button"
                  aria-pressed={compare}
                  onClick={() => setCompare((c) => !c)}
                  className={cn(
                    'focus-ring absolute right-3 top-3 z-20 rounded-full px-3.5 py-1.5 text-xs font-medium backdrop-blur transition-colors lg:top-2.5 lg:py-1',
                    paper === 'dark'
                      ? compare
                        ? 'bg-white text-black'
                        : 'bg-white/15 text-white hover:bg-white/25'
                      : compare
                        ? 'bg-black text-white'
                        : 'bg-black/[0.07] text-black hover:bg-black/15',
                  )}
                >
                  {compare ? 'Done' : 'Compare'}
                </button>
              </>
            ) : (
              <div className={cn('absolute inset-0 grid place-items-center p-6 text-center', onPaperInk)}>
                <div className="flex max-w-md flex-col items-center gap-5">
                  <p className="font-display text-[clamp(2.25rem,9vw,4rem)] font-extralight leading-none tracking-[-0.04em] [font-variation-settings:'wdth'_140]">
                    <span className="lg:hidden">Pick a photo</span>
                    <span className="hidden lg:inline">Drop an image</span>
                  </p>
                  <p className={cn('text-sm', paper === 'dark' ? 'text-white/60' : 'text-black/60')}>
                    <span className="lg:hidden">It stays on your phone — nothing is uploaded.</span>
                    <span className="hidden lg:inline">Or paste one, or choose a file. It stays in this tab — nothing is uploaded.</span>
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={chooseFile}
                      className={cn(
                        'focus-ring inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-medium lg:h-10 lg:px-4',
                        paper === 'dark' ? 'bg-white text-black hover:bg-white/85' : 'bg-black text-white hover:bg-black/85',
                      )}
                    >
                      <ImagePlus className="size-4" />
                      Choose image
                    </button>
                    <button
                      type="button"
                      onClick={loadSample}
                      className={cn(
                        'focus-ring inline-flex h-12 items-center rounded-full border px-5 text-sm lg:h-10 lg:px-4',
                        paper === 'dark' ? 'border-white/25 hover:border-white' : 'border-black/20 hover:border-black',
                      )}
                    >
                      Use sample
                    </button>
                  </div>
                  {notice ? (
                    <p role="alert" className="text-sm">
                      {notice}
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </Stage>
        </main>

        {/* Phones and tablets: one tool at a time in a fixed-height dock, so nothing scrolls. */}
        {source ? (
          <div className="shrink-0 border-t border-[var(--rule)] bg-background lg:hidden">
            <div role="tabpanel" aria-label={TOOLS.find((t) => t.id === tool)?.label} className="flex h-[8.5rem] flex-col justify-center">
              {tool === 'style' ? (
                <StylePicker name="style-mobile" value={mode} onChange={setMode} thumbs={thumbs} paper={paper} font={font} layout="strip" />
              ) : null}

              {tool === 'adjust' ? (
                <div className="grid gap-4 px-4">
                  <div className="flex items-center gap-1.5">
                    {(['detail', 'brightness', 'contrast'] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={adjustKey === k}
                        onClick={() => setAdjustKey(k)}
                        className={cn(
                          'focus-ring h-8 rounded-full px-3 text-xs transition-colors',
                          adjustKey === k ? 'bg-foreground text-background' : 'bg-foreground/[0.07] text-muted-foreground',
                        )}
                      >
                        {sliders[k].label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={resetAdjust}
                      disabled={!adjusted}
                      aria-label="Reset adjustments"
                      className="focus-ring ml-auto grid size-8 place-items-center rounded-full text-muted-foreground disabled:opacity-30"
                    >
                      <RotateCcw className="size-4" />
                    </button>
                  </div>
                  <AdjustSlider key={adjustKey} {...sliders[adjustKey]} />
                </div>
              ) : null}

              {tool === 'paper' ? (
                <div role="radiogroup" aria-label="Paper" className="grid grid-cols-2 gap-3 px-4">
                  {paperOptions.map((o) => (
                    <label
                      key={o.value}
                      className={cn(
                        'flex h-16 cursor-pointer items-center gap-3 rounded-xl px-4 ring-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-foreground',
                        paper === o.value ? 'ring-2 ring-foreground' : 'ring-[var(--rule)]',
                      )}
                    >
                      <input
                        type="radio"
                        name="paper-mobile"
                        value={o.value}
                        checked={paper === o.value}
                        onChange={() => setPaper(o.value)}
                        className="sr-only"
                      />
                      <span className="size-7 rounded-full ring-1 ring-foreground/25" style={{ background: PAPER_COLOR[o.value] }} />
                      <span className="text-sm">{o.label}</span>
                    </label>
                  ))}
                </div>
              ) : null}

              {tool === 'save' ? (
                <div className="grid gap-3 px-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Size</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">{exportReadout}</span>
                  </div>
                  <Segmented label="Export size" name="export-mobile" value={exportSize} onChange={setExportSize} options={exportOptions} size="lg" />
                  <button type="button" onClick={save} disabled={saving} className="btn-solid h-11 w-full justify-center disabled:opacity-50">
                    <Download className="size-4" />
                    {saving ? 'Preparing…' : 'Save image'}
                  </button>
                </div>
              ) : null}
            </div>

            {notice ? (
              <p role="alert" className="px-4 pb-2 text-xs text-destructive">
                {notice}
              </p>
            ) : null}

            <nav aria-label="Tools" className="grid grid-cols-4 border-t border-[var(--rule)] pb-[env(safe-area-inset-bottom)]">
              {TOOLS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={tool === id}
                  onClick={() => setTool(id)}
                  className={cn(
                    'focus-ring flex h-14 flex-col items-center justify-center gap-1 text-[0.6875rem] transition-colors',
                    tool === id ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  <Icon className="size-5" strokeWidth={tool === id ? 2.2 : 1.6} />
                  {label}
                </button>
              ))}
            </nav>
          </div>
        ) : null}

        {/* Desktop: everything in one column beside the stage. */}
        <aside aria-label="Settings" className="hidden min-h-0 flex-col border-l border-[var(--rule)] lg:flex">
          <div className="flex-1 overflow-y-auto">
            <Section title="Image">
              <div className="flex items-center gap-3">
                <div className="size-11 shrink-0 overflow-hidden rounded-[3px] bg-foreground/[0.06]">
                  {source ? <img src={source.url} alt="" className="size-full object-cover" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{source ? source.name : 'No image'}</p>
                  <p className="font-mono text-[0.6875rem] text-muted-foreground">
                    {source ? `${source.width} × ${source.height}` : 'Drop, paste or choose'}
                  </p>
                </div>
                <button type="button" onClick={chooseFile} className="btn-line h-8 px-3 text-xs">
                  {source ? 'Replace' : 'Choose'}
                </button>
              </div>
              {notice && source ? (
                <p role="alert" className="mt-3 text-xs text-destructive">
                  {notice}
                </p>
              ) : null}
            </Section>

            <Section title="Style">
              <StylePicker name="style-desktop" value={mode} onChange={setMode} thumbs={thumbs} paper={paper} font={font} />
            </Section>

            <Section
              title="Adjust"
              aside={
                adjusted ? (
                  <button type="button" onClick={resetAdjust} className="focus-ring inline-flex items-center gap-1 hover:text-foreground">
                    <RotateCcw className="size-3" />
                    Reset
                  </button>
                ) : null
              }
            >
              <div className="grid gap-5">
                <AdjustSlider {...sliders.detail} id="detail-desk" />
                <AdjustSlider {...sliders.brightness} id="brightness-desk" />
                <AdjustSlider {...sliders.contrast} id="contrast-desk" />
              </div>
            </Section>

            <Section title="Paper">
              <Segmented label="Paper" value={paper} onChange={setPaper} options={paperOptions} />
            </Section>
          </div>

          <div className="bg-background px-4 py-4">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="font-mono text-[0.6875rem] text-muted-foreground">Export</h2>
              <span className="font-mono text-[0.6875rem] tabular-nums text-muted-foreground">{exportReadout}</span>
            </div>
            <Segmented label="Export size" name="export-desktop" value={exportSize} onChange={setExportSize} options={exportOptions} />
            <button
              type="button"
              onClick={save}
              disabled={!source || saving}
              className="btn-solid mt-3 h-11 w-full justify-center disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="size-4" />
              {saving ? 'Preparing…' : 'Download PNG'}
            </button>
          </div>
        </aside>
      </div>

      <div
        aria-hidden={!dragging}
        className={cn(
          'pointer-events-none fixed inset-0 z-50 grid place-items-center bg-black/80 backdrop-blur-sm transition-opacity duration-200',
          dragging ? 'opacity-100' : 'opacity-0',
        )}
      >
        <p className="font-display text-[clamp(2.5rem,8vw,7rem)] font-extralight text-white [font-variation-settings:'wdth'_150]">
          Drop to load
        </p>
      </div>
    </div>
  )
}
