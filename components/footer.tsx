'use client'

export function Footer() {
  return (
    <footer className="w-full bg-background py-10 md:py-16">
      <div className="w-full px-2 md:px-4 overflow-hidden">
        <img
          src="/luma-ascii-light.png"
          alt="LUMA"
          className="mx-auto w-[34vw] max-w-md h-auto select-none opacity-90 dark:invert"
          draggable={false}
        />
      </div>
    </footer>
  )
}
