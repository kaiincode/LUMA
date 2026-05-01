<div align="center">

<img src="./public/logo-dark.png" width="112" height="112" alt="LUMA logo" />

# LUMA

**Image in → art out.** Seven render styles, one minimal canvas.  
Contrast, edges, and color—all in the browser.

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-0B0B0B?logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-0B0B0B?logo=typescript&logoColor=3178C6)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-0B0B0B?logo=tailwindcss&logoColor=38BDF8)](https://tailwindcss.com/)
[![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-0B0B0B?logo=shadcnui&logoColor=white)](https://ui.shadcn.com/)

</div>

---

## What it does

Upload a picture and pick a **render style**. LUMA samples the image on a grid, boosts local contrast and edges, then paints each cell with median color and a little vibrance. Nothing is sent to an API for conversion—your image stays on the device.

| Style | What you get |
|--------|----------------|
| **ASCII** | Classic character ramp, crisp canvas glyphs |
| **Dots** | Colored halftone circles |
| **Hatch** | Cross-hatched engraving |
| **Mosaic** | Rounded tiles with tone-driven fill |
| **Contour** | Short strokes along structure |
| **Stipple** | Weighted multi-dot clusters |
| **Halftone** | Ellipses rotated with local gradient |

Light and dark themes swap logos, banners, and export backgrounds.

---

## Gallery

Dark-theme PNG exports from the same source image—so you can see how each mode reads.

<p align="center"><sub><strong>ASCII</strong> · <strong>Dots</strong> · <strong>Hatch</strong></sub></p>

<p align="center">
  <img src="./public/luma-ascii-dark.png" width="30%" alt="LUMA ASCII output, dark theme" />
  &nbsp;
  <img src="./public/luma-dots-dark.png" width="30%" alt="LUMA dots output, dark theme" />
  &nbsp;
  <img src="./public/luma-hatch-dark.png" width="30%" alt="LUMA hatch output, dark theme" />
</p>

<p align="center"><sub><strong>Mosaic</strong> · <strong>Contour</strong> · <strong>Stipple</strong></sub></p>

<p align="center">
  <img src="./public/luma-mosaic-dark.png" width="30%" alt="LUMA mosaic output, dark theme" />
  &nbsp;
  <img src="./public/luma-contour-dark.png" width="30%" alt="LUMA contour output, dark theme" />
  &nbsp;
  <img src="./public/luma-stipple-dark.png" width="30%" alt="LUMA stipple output, dark theme" />
</p>

<p align="center"><sub><strong>Halftone</strong></sub></p>

<p align="center">
  <img src="./public/luma-halftone-dark.png" width="46%" alt="LUMA halftone output, dark theme" />
</p>

---

## Quickstart

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Production build:

```bash
npm run build
npm start
```

---

## License

MIT
