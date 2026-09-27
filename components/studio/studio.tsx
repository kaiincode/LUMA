'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Download, ImagePlus, Moon, RotateCcw, Sun } from 'lucide-react'
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
  type Paper,
} from '@/lib/luma/engine'
import { cn } from '@/lib/utils'
import { Wordmark } from '@/components/wordmark'
import { Stage } from './stage'
import { StylePicker } from './style-picker'

const MONO = '"Geist Mono", ui-monospace, monospace'
const FALLBACK_MONO = 'ui-monospace, monospace'

type Source = { el: HTMLImageElement; width: number; height: number; name: string; url: string }

const EXPORT_SIZES: ExportSize[] = ['source', 'square1080', 'poster2k']
const DEFAULT_DETAIL = 70

/** Detail 45–100 maps to 60–260 columns. */
const columnsFor = (detail: number) => Math.round(60 + ((detail - 45) / 55) * 200)

function loadImage(url: string, name: string): Promise<Source> {
  return new Promise((resolve, reject) => {
    const el = new Image()
    el.decoding = 'async'
    el.onload = () => resolve({ el, width: el.naturalWidth, height: el.naturalHeight, name, url })
    el.onerror = () => reject(new Error(name))
    el.src = url
  })
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col rounded-lg bg-foreground/[0.06] p-0.5">
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            'cursor-pointer rounded-md py-1.5 text-center text-xs transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-foreground',
            o.value === value ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <input
            type="radio"
            name={label}
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

const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`)

function AdjustSlider({
  id,
  label,
  readout,
  value,
  min,
  max,
  step,
  onChange,
}: {
  id: string
  label: string
  readout: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="grid gap-2.5">
      <div className="flex items-baseline justify-between text-sm">
        <span id={`${id}-label`}>{label}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{readout}</span>
      </div>
      <Slider aria-labelledby={`${id}-label`} value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v ?? value)} />
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
    return analyzeImage(source, grid.cols, grid.rows)
    // Only the grid shape matters, not which square mode is showing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, cols, gridKind])

  const thumbs = useMemo(() => {
    if (!source) return { square: null, text: null }
    const crop = coverCrop(source.width, source.height, 1)
    return {
      square: analyzeImage(source, 26, 26, crop),
      text: analyzeImage(source, 22, 13, crop),
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

  const download = () => {
    if (!source || !field || !exportDims) return
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
    const base = source.name.replace(/\.[^.]+$/, '') || 'image'
    canvas.toBlob((blob) => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${base}-luma-${mode}-${paper === 'dark' ? 'black' : 'white'}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    }, 'image/png')
  }

  return (
    <div className="luma studio flex min-h-svh flex-col bg-background text-foreground lg:h-svh lg:overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--rule)] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" aria-label="LUMA home" className="focus-ring -m-2 p-2">
            <Wordmark />
          </Link>
          <span className="text-muted-foreground/60">/</span>
          <span className="text-sm text-muted-foreground">Studio</span>
        </div>
        <p className="hidden min-w-0 truncate font-mono text-xs text-muted-foreground md:block">
          {source ? `${source.name} — ${source.width} × ${source.height}` : 'No image yet'}
        </p>
        <button
          type="button"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className="nav-link focus-ring size-9 justify-center rounded-md p-0"
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </header>

      <div className="grid flex-1 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main
          className={cn(
            'relative lg:h-auto lg:min-h-0',
            // On small screens the stage takes the image's shape and stays pinned
            // while the controls scroll underneath, so changes stay in view.
            source
              ? 'sticky top-0 z-20 aspect-[var(--stage-ar)] max-h-[45svh] min-h-[220px] w-full lg:static lg:aspect-auto lg:max-h-none'
              : 'h-[62svh] min-h-[360px]',
          )}
          style={source ? ({ '--stage-ar': `${source.width} / ${source.height * 1.12}` } as React.CSSProperties) : undefined}
        >
          <Stage
            field={field}
            mode={mode}
            paper={paper}
            look={look}
            font={font}
            compare={compare && !!source}
            source={source}
            label={source ? `${source.name} drawn in ${RENDER_MODE_LABELS[mode]} style` : 'Empty canvas'}
          >
            {source ? (
              <>
                <p
                  className={cn(
                    'pointer-events-none absolute left-4 top-3 font-mono text-[0.6875rem]',
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
                    'focus-ring absolute right-3 top-2.5 rounded-full px-3 py-1 text-xs backdrop-blur transition-colors',
                    paper === 'dark'
                      ? compare
                        ? 'bg-white text-black'
                        : 'bg-white/10 text-white hover:bg-white/20'
                      : compare
                        ? 'bg-black text-white'
                        : 'bg-black/5 text-black hover:bg-black/10',
                  )}
                >
                  Compare
                </button>
              </>
            ) : (
              <div className={cn('absolute inset-0 grid place-items-center p-6 text-center', paper === 'dark' ? 'text-white' : 'text-black')}>
                <div className="flex max-w-md flex-col items-center gap-5">
                  <p className="font-display text-[clamp(2.25rem,5vw,4rem)] font-extralight leading-none tracking-[-0.04em] [font-variation-settings:'wdth'_140]">
                    Drop an image
                  </p>
                  <p className={cn('text-sm', paper === 'dark' ? 'text-white/60' : 'text-black/60')}>
                    Or paste one, or choose a file. It stays in this tab — nothing is uploaded.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className={cn(
                        'focus-ring inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium',
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
                        'focus-ring inline-flex h-10 items-center rounded-full border px-4 text-sm',
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

        <aside aria-label="Settings" className="flex flex-col border-[var(--rule)] lg:min-h-0 lg:border-l">
          <div className="flex-1 lg:overflow-y-auto">
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
                <button type="button" onClick={() => fileRef.current?.click()} className="btn-line h-8 px-3 text-xs">
                  {source ? 'Replace' : 'Choose'}
                </button>
              </div>
              {notice && source ? (
                <p role="alert" className="mt-3 text-xs text-destructive">
                  {notice}
                </p>
              ) : null}
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
            </Section>

            <Section title="Style">
              <StylePicker value={mode} onChange={setMode} thumbs={thumbs} paper={paper} font={font} />
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
                <AdjustSlider
                  id="detail"
                  label="Detail"
                  readout={`${field?.cols ?? cols} columns`}
                  value={detail}
                  min={45}
                  max={100}
                  step={5}
                  onChange={setDetail}
                />
                <AdjustSlider
                  id="brightness"
                  label="Brightness"
                  readout={signed(brightness)}
                  value={brightness}
                  min={-100}
                  max={100}
                  step={5}
                  onChange={setBrightness}
                />
                <AdjustSlider
                  id="contrast"
                  label="Contrast"
                  readout={signed(contrast)}
                  value={contrast}
                  min={-100}
                  max={100}
                  step={5}
                  onChange={setContrast}
                />
              </div>
            </Section>

            <Section title="Paper">
              <Segmented
                label="Paper"
                value={paper}
                onChange={setPaper}
                options={[
                  { value: 'dark', label: 'Black' },
                  { value: 'light', label: 'White' },
                ]}
              />
            </Section>
          </div>

          <div className="border-t border-[var(--rule)] bg-background px-4 py-4 lg:border-t-0">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="font-mono text-[0.6875rem] text-muted-foreground">Export</h2>
              <span className="font-mono text-[0.6875rem] tabular-nums text-muted-foreground">
                {exportDims ? `${exportDims.w} × ${exportDims.h} px` : '—'}
              </span>
            </div>
            <Segmented
              label="Export size"
              value={exportSize}
              onChange={setExportSize}
              options={EXPORT_SIZES.map((s) => ({ value: s, label: EXPORT_SIZE_LABELS[s] }))}
            />
            <button
              type="button"
              onClick={download}
              disabled={!source}
              className="btn-solid mt-3 h-11 w-full justify-center disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="size-4" />
              Download PNG
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
