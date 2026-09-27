'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { useMounted } from '@/hooks/use-mounted'
import { RENDER_MODE_LABELS, RENDER_MODES, type RenderMode } from '@/lib/render-mode'
import { cn } from '@/lib/utils'
import { loadSource, loadWordmark, type SourceImage } from './pattern-engine'
import { PatternPlate, type PlateMeta } from './pattern-plate'
import { StageTile } from './stage-tile'
import { Wordmark } from '@/components/wordmark'

gsap.registerPlugin(useGSAP, ScrollTrigger)

const AUTOPLAY_MS = 3400

const MODE_NOTES: Record<RenderMode, { what: string; mark: string }> = {
  ascii: { what: 'Characters picked by how much ink they carry, coloured by the pixels underneath.', mark: 'glyphs ranked by measured ink' },
  dots: { what: 'A colour halftone. Dot area follows the tone of the cell.', mark: 'circle · area follows tone' },
  hatch: { what: 'Engraving-style lines that cross and stack as tone builds.', mark: '1–3 crossed strokes per cell' },
  mosaic: { what: 'Rounded tiles that grow until they almost touch.', mark: 'tile · gap closes with tone' },
  contour: { what: 'Short strokes laid along the direction of every edge.', mark: 'stroke · turned to the edge' },
  stipple: { what: 'Clusters of tiny dots, the way a pen stipples by hand.', mark: 'up to 9 dots per cell' },
  halftone: { what: 'Stretched ellipses rotated to follow the flow of the image.', mark: 'ellipse · turned to the gradient' },
}

const STEPS = [
  { stage: 'sample', title: 'Sample', body: 'The image is laid on a grid. Every cell becomes one reading of tone and colour.' },
  { stage: 'lift', title: 'Lift', body: 'Contrast is stretched and local detail sharpened, so edges survive the grid.' },
  { stage: 'paint', title: 'Paint', body: 'Each cell takes the average colour around it, with a little extra vibrance.' },
] as const

const SPEC: Array<[string, string]> = [
  ['Styles', 'ASCII, Dots, Hatch, Mosaic, Contour, Stipple, Halftone'],
  ['Adjust', 'Detail from 60 to 260 columns, brightness and contrast'],
  ['Export', 'PNG at the original size, 1080 × 1080 or 2048 × 2048 — drawn sharp at every size'],
  ['Paper', 'Black or white. Marks grow where the image is lightest on black, darkest on white'],
  ['Processing', 'Canvas 2D in your browser. The image is never uploaded.'],
]

function heroCell(width: number) {
  // Aim for ~5 cells across each dot of the wordmark (about 28 dot pitches wide).
  const markWidth = width * (width < 640 ? 0.9 : 0.86)
  return Math.max(4, Math.min(11, Math.round(markWidth / 28 / 5)))
}

function previewCell(width: number) {
  return width < 480 ? 6 : 9
}

export function LandingPage() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const heroRef = useRef<HTMLElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const objectUrl = useRef<string | null>(null)

  const mounted = useMounted()
  const { resolvedTheme, setTheme } = useTheme()

  const [source, setSource] = useState<SourceImage | null>(null)
  const [wordmark, setWordmark] = useState<{ canvas: HTMLCanvasElement; aspect: number } | null>(null)
  const [heroMode, setHeroMode] = useState<RenderMode>('hatch')
  const [autoplay, setAutoplay] = useState(true)
  const [heroVisible, setHeroVisible] = useState(true)
  const [heroMeta, setHeroMeta] = useState<PlateMeta | null>(null)
  const [styleMode, setStyleMode] = useState<RenderMode>('ascii')
  const [previewMeta, setPreviewMeta] = useState<PlateMeta | null>(null)
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    loadSource('/banner.png', 'banner.png').then(setSource).catch(() => setNotice('The sample image did not load.'))
    loadWordmark('/logo-dark.png').then(setWordmark).catch(() => setWordmark(null))
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) setAutoplay(false)
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    }
  }, [])

  // Cycle styles while the hero is on screen.
  useEffect(() => {
    if (!autoplay || !heroVisible) return
    const t = window.setTimeout(() => {
      setHeroMode((m) => RENDER_MODES[(RENDER_MODES.indexOf(m) + 1) % RENDER_MODES.length])
    }, AUTOPLAY_MS)
    return () => window.clearTimeout(t)
  }, [autoplay, heroVisible, heroMode])

  useEffect(() => {
    const el = heroRef.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting), { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const takeFile = useCallback((file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setNotice(`${file.name} isn't an image. Try a JPG, PNG or WebP.`)
      return
    }
    const url = URL.createObjectURL(file)
    loadSource(url, file.name)
      .then((next) => {
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
        objectUrl.current = url
        setSource(next)
        setNotice(null)
      })
      .catch(() => {
        URL.revokeObjectURL(url)
        setNotice(`${file.name} couldn't be read. Try a JPG, PNG or WebP.`)
      })
  }, [])

  // Dropping an image anywhere on the page redraws every plate with it.
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
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [takeFile])

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      gsap.from('.hero-line > span', { yPercent: 105, duration: 1.1, ease: 'expo.out', stagger: 0.09, delay: 0.25 })
      gsap.from('.hero-fade', { opacity: 0, y: 14, duration: 0.9, ease: 'power3.out', stagger: 0.06, delay: 0.55 })
      gsap.utils.toArray<HTMLElement>('.reveal').forEach((el) => {
        gsap.from(el, {
          opacity: 0,
          y: 28,
          duration: 0.9,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        })
      })
    },
    { scope: rootRef },
  )

  const pickMode = (m: RenderMode) => {
    setAutoplay(false)
    setHeroMode(m)
  }

  const sourceLabel = source ? `${source.name} — ${source.width} × ${source.height}` : 'loading source'
  const isDark = mounted && resolvedTheme === 'dark'

  return (
    <div ref={rootRef} className="luma landing min-h-screen bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-foreground focus:px-3 focus:py-2 focus:text-background"
      >
        Skip to content
      </a>

      <header className="relative z-20 mx-auto flex h-16 max-w-[1680px] items-center justify-between px-4 md:px-8">
        <Link href="/" aria-label="LUMA home" className="focus-ring -m-2 p-2">
          <Wordmark />
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1 text-sm">
          <a href="#styles" className="nav-link hidden sm:inline-flex">
            Styles
          </a>
          <a href="#process" className="nav-link hidden sm:inline-flex">
            Process
          </a>
          <a href="#spec" className="nav-link hidden sm:inline-flex">
            Spec
          </a>
          <button
            type="button"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="nav-link focus-ring ml-1 size-9 justify-center p-0"
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <Link href="/studio" className="btn-solid ml-2 h-9 px-4">
            Open studio
            <ArrowUpRight className="size-4" />
          </Link>
        </nav>
      </header>

      <main id="main">
        {/* Hero: the wordmark is a live render of the source image. */}
        <section ref={heroRef} aria-labelledby="hero-title" className="px-2 md:px-4">
          <div className="relative mx-auto max-w-[1680px]">
            <PatternPlate
              source={source}
              mode={heroMode}
              cellFor={heroCell}
              wordmark={wordmark}
              loupe
              onMeta={setHeroMeta}
              label={`The LUMA wordmark drawn in ${RENDER_MODE_LABELS[heroMode]} style from ${source?.name ?? 'the sample image'}`}
              className="h-[min(68svh,46vw)] min-h-[340px] w-full"
            />
            <div className="plate-readout pointer-events-none absolute inset-x-0 top-0 flex justify-between gap-4 p-3 md:p-4">
              <span className="truncate">{sourceLabel}</span>
              <span className="hidden shrink-0 sm:block">
                {RENDER_MODE_LABELS[heroMode].toLowerCase()}
                {heroMeta ? ` · ${heroMeta.cell}px cell · ${heroMeta.cols} × ${heroMeta.rows}` : ''}
              </span>
            </div>
            <div className="plate-readout pointer-events-none absolute inset-x-0 bottom-0 flex justify-between gap-4 p-3 md:p-4">
              <span className="hidden md:block">Hover the plate to see the source</span>
              <span className="truncate" role="status" aria-live="polite">
                {notice ?? <span className="hidden md:inline">Drop any image on the page to redraw it</span>}
              </span>
            </div>
          </div>

          <div
            role="group"
            aria-label="Render style"
            className="mx-auto flex max-w-[1680px] overflow-x-auto border-b border-[var(--rule)] [scrollbar-width:none]"
          >
            {RENDER_MODES.map((m) => {
              const active = m === heroMode
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active}
                  onClick={() => pickMode(m)}
                  className={cn(
                    'focus-ring relative h-12 min-w-[6.5rem] flex-1 px-3 text-left font-mono text-xs transition-colors',
                    active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'absolute inset-x-0 top-0 h-px origin-left bg-foreground',
                      active ? (autoplay ? 'mode-progress' : 'scale-x-100') : 'scale-x-0',
                    )}
                    style={active && autoplay ? { animationDuration: `${AUTOPLAY_MS}ms` } : undefined}
                    key={active ? `${m}-${autoplay}` : m}
                  />
                  {RENDER_MODE_LABELS[m]}
                </button>
              )
            })}
          </div>

          <div className="mx-auto max-w-[1680px] px-2 pb-24 pt-10 md:px-4 md:pb-36 md:pt-14">
            <h1 id="hero-title" className="font-display">
              <span className="hero-line block overflow-hidden pb-[0.06em]">
                <span className="hero-in block">Image in,</span>
              </span>
              <span className="hero-line block overflow-hidden pb-[0.08em]">
                <span className="hero-out block">pattern out.</span>
              </span>
            </h1>
            <div className="mt-10 grid gap-7 md:mt-14 md:grid-cols-12">
              <p className="hero-fade max-w-[42ch] text-base leading-relaxed text-muted-foreground md:col-span-5 md:col-start-7 md:text-[1.0625rem] lg:col-span-4 lg:col-start-7">
                LUMA lays your picture on a grid and redraws every cell as a character, dot, stroke or
                tile. Seven styles, tuned and exported in the studio — without the image ever leaving
                your browser.
              </p>
              <div className="hero-fade flex flex-wrap items-start gap-2 md:col-span-6 md:col-start-7 lg:col-span-2 lg:col-start-11 lg:flex-col lg:items-stretch">
                <Link href="/studio" className="btn-solid h-12 justify-between px-5">
                  Open the studio
                  <ArrowRight className="size-4" />
                </Link>
                <button type="button" onClick={() => fileRef.current?.click()} className="btn-line h-12 justify-between px-5">
                  Try your own image
                </button>
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
              </div>
            </div>
          </div>
        </section>

        {/* Styles: one list, one live preview. */}
        <section id="styles" aria-labelledby="styles-title" className="section border-t border-[var(--rule)]">
          <div className="shell grid gap-y-10 md:grid-cols-12">
            <p className="section-index md:col-span-3">Styles — 7</p>
            <div className="md:col-span-9">
              <h2 id="styles-title" className="reveal section-title max-w-[16ch]">
                Seven ways to redraw a cell.
              </h2>
              <p className="reveal mt-6 max-w-[52ch] text-muted-foreground">
                Every style reads the same grid — tone, edge direction and colour for each cell. What
                changes is the mark that cell leaves behind.
              </p>
            </div>
          </div>

          <div className="shell mt-14 grid gap-8 md:mt-20 lg:grid-cols-12 lg:gap-12">
            <div className="sticky top-2 z-10 lg:order-2 lg:col-span-6 lg:col-start-7 lg:top-6 lg:self-start">
              <PatternPlate
                source={source}
                mode={styleMode}
                cellFor={previewCell}
                onMeta={setPreviewMeta}
                label={`${source?.name ?? 'The sample image'} drawn in ${RENDER_MODE_LABELS[styleMode]} style`}
                className="h-[36svh] w-full lg:aspect-[4/5] lg:h-auto lg:max-h-[calc(100svh-6rem)]"
              />
              <div className="flex justify-between gap-4 bg-background py-3 font-mono text-xs text-muted-foreground">
                <span>{RENDER_MODE_LABELS[styleMode]} · live render</span>
                {previewMeta ? (
                  <span>
                    {previewMeta.cols} × {previewMeta.rows} cells
                  </span>
                ) : null}
              </div>
            </div>

            <ul className="lg:order-1 lg:col-span-6">
              {RENDER_MODES.map((m) => {
                const active = m === styleMode
                return (
                  <li key={m} className="border-t border-[var(--rule)] last:border-b">
                    <button
                      type="button"
                      aria-pressed={active}
                      data-active={active}
                      onClick={() => setStyleMode(m)}
                      onMouseEnter={() => setStyleMode(m)}
                      onFocus={() => setStyleMode(m)}
                      className="mode-row focus-ring grid w-full gap-x-6 gap-y-2 py-6 text-left md:grid-cols-[1fr_minmax(0,15rem)] md:items-end md:py-8"
                    >
                      <span className="mode-name font-display">{RENDER_MODE_LABELS[m]}</span>
                      <span className="flex flex-col gap-2 md:pb-2">
                        <span className="text-sm leading-snug text-muted-foreground">{MODE_NOTES[m].what}</span>
                        <span className="font-mono text-[0.6875rem] text-muted-foreground/80">{MODE_NOTES[m].mark}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>

        {/* Process: a real sequence, so it is numbered. */}
        <section id="process" aria-labelledby="process-title" className="section border-t border-[var(--rule)]">
          <div className="shell grid gap-y-10 md:grid-cols-12">
            <p className="section-index md:col-span-3">Process — 4 steps</p>
            <div className="md:col-span-9">
              <h2 id="process-title" className="reveal section-title max-w-[13ch]">
                What happens to a picture.
              </h2>
              <p className="reveal mt-6 max-w-[52ch] text-muted-foreground">
                Shown here on a 16 × 16 grid so you can see each cell. In the studio the grid runs to
                hundreds of columns.
              </p>
            </div>
          </div>

          <ol className="shell mt-14 grid gap-x-4 gap-y-12 sm:grid-cols-2 md:mt-20 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li key={step.stage} className="reveal">
                <StageTile source={source} stage={step.stage} label={`${step.title} step`} />
                <StepText n={i + 1} title={step.title} body={step.body} />
              </li>
            ))}
            <li className="reveal">
              <StageTile source={source} stage={styleMode} label={`Mark step, drawn in ${RENDER_MODE_LABELS[styleMode]}`} />
              <StepText
                n={4}
                title="Mark"
                body={`The style draws one mark per cell — here ${RENDER_MODE_LABELS[styleMode]}, the one picked above.`}
              />
            </li>
          </ol>
        </section>

        {/* Spec */}
        <section id="spec" aria-labelledby="spec-title" className="section border-t border-[var(--rule)]">
          <div className="shell grid gap-y-12 md:grid-cols-12">
            <p className="section-index md:col-span-3">Spec</p>
            <div className="md:col-span-4">
              <h2 id="spec-title" className="reveal section-title">
                Runs in
                <br />
                the tab.
              </h2>
              <p className="reveal mt-6 max-w-[40ch] text-muted-foreground">
                Conversion happens on a canvas in your browser. Your image isn&apos;t sent anywhere, and
                there&apos;s nothing to sign up for.
              </p>
            </div>
            <dl className="reveal md:col-span-5">
              {SPEC.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-4 border-t border-[var(--rule)] py-4 last:border-b">
                  <dt className="font-mono text-xs leading-6 text-muted-foreground">{k}</dt>
                  <dd className="text-sm leading-6">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Closing call to action */}
        <section aria-label="Open the studio" className="border-t border-[var(--rule)]">
          <Link href="/studio" className="cta-link focus-ring group block px-4 py-16 md:px-8 md:py-24">
            <span className="mx-auto flex max-w-[1680px] items-end justify-between gap-6">
              <span className="cta-text font-display">Open the studio</span>
              <ArrowUpRight className="mb-[0.6em] size-[clamp(2rem,5vw,5rem)] shrink-0 stroke-[1.25] transition-transform duration-500 group-hover:-translate-y-2 group-hover:translate-x-2" />
            </span>
          </Link>
        </section>
      </main>

      <footer className="border-t border-[var(--rule)]">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-4 px-4 py-6 font-mono text-xs text-muted-foreground md:px-8">
          <span>LUMA — image in, pattern out</span>
          <a href="#main" className="focus-ring hover:text-foreground">
            Back to top ↑
          </a>
        </div>
      </footer>

      <div
        aria-hidden={!dragging}
        className={cn(
          'pointer-events-none fixed inset-0 z-50 grid place-items-center bg-[var(--plate)]/85 backdrop-blur-sm transition-opacity duration-200',
          dragging ? 'opacity-100' : 'opacity-0',
        )}
      >
        <p className="font-display text-[clamp(2.5rem,8vw,7rem)] text-white [font-variation-settings:'wdth'_150] font-extralight">
          Drop to redraw
        </p>
      </div>
    </div>
  )
}

function StepText({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="mt-5 grid grid-cols-[2rem_1fr] gap-x-2">
      <span className="font-mono text-xs leading-7 text-muted-foreground">{n}</span>
      <div>
        <h3 className="font-display text-xl font-medium tracking-[-0.01em] [font-variation-settings:'wdth'_120]">{title}</h3>
        <p className="mt-2 max-w-[34ch] text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}
