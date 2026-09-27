import { cn } from '@/lib/utils'

// Where the mark sits inside the square 2000 × 2000 logo PNGs (measured from the files).
const LOGO = 2000
const MARK = { x: 458, y: 885, w: 1046, h: 261 }

/** The dot-matrix LUMA mark, cropped out of the square logo PNGs. Size it with a width class. */
export function Wordmark({ className }: { className?: string }) {
  const imgStyle = {
    width: `${(LOGO / MARK.w) * 100}%`,
    left: `${(-MARK.x / MARK.w) * 100}%`,
    // `top` in percent is measured against the box height, so use the mark height.
    top: `${(-MARK.y / MARK.h) * 100}%`,
  }
  return (
    <span
      className={cn('relative block w-[76px] overflow-hidden', className)}
      style={{ aspectRatio: `${MARK.w} / ${MARK.h}` }}
      aria-hidden
    >
      {(['light', 'dark'] as const).map((t) => (
        <img
          key={t}
          src={`/logo-${t}.png`}
          alt=""
          draggable={false}
          style={imgStyle}
          className={cn('absolute h-auto max-w-none', t === 'light' ? 'dark:hidden' : 'hidden dark:block')}
        />
      ))}
    </span>
  )
}
