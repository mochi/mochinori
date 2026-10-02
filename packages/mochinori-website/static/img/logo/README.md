# Mochinori logo kit

Every light/dark pair below shares an identical canvas (same viewBox and size, artwork in the same position), so swapping between them never shifts the layout.

## Files

| File | Use |
| --- | --- |
| `mochinori-logo.svg`, `mochinori-logo-dark.svg` | Primary lockup: mark plus wordmark |
| `mochinori-wordmark.svg`, `mochinori-wordmark-dark.svg` | Wordmark alone |
| `mochinori-mark.svg`, `mochinori-mark-dark.svg` | 3D mark, for 48px and up |
| `mochinori-mark-flat.svg`, `mochinori-mark-flat-dark.svg` | Flat mark on the same canvas as the 3D mark and optically matched to it, for swapping in below 48px |
| `mochinori-favicon.svg` | Favicon that switches to its dark version automatically (`prefers-color-scheme`) |
| `mochinori-favicon-light.svg`, `mochinori-favicon-dark.svg` | The same favicon as a static pair |
| `favicon.ico` | 16px (drawn on the pixel grid), 32px and 48px |
| `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` | Home-screen, web-manifest and avatar icons; opaque, safe for circular and maskable crops |
| `mochinori-icon.svg`, `mochinori-icon-small.svg` | 3D or flat mark on a cream tile |

## Snippets

Logo in a README, following the reader's theme:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="mochinori-logo-dark.svg">
  <img alt="mochinori" src="mochinori-logo.svg" width="320">
</picture>
```

Favicons:

```html
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/mochinori-favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

## Colors

| Name | Hex | Use |
| --- | --- | --- |
| Nori | `#1E3B2F` | Outline, band, face, wordmark |
| Nori, dark mode | `#44735A` | Favicon band on dark backgrounds (3:1 against `#13211A`) |
| Rice | `#FBF5EC` | Dark-mode ring, outline and wordmark; tiles |
| Mochi | `#FFFFFF` | Front face |
| Mochi shade | `#F1ECE3` | Top and side faces |

## Type

The wordmark is Poppins Medium (SIL Open Font License), kerned, tracked −1%, and converted to outlines, with rounded-square dots on the i's. No font is needed to display any file.

## Usage

- Below 48px, use the flat mark or the favicon; the 3D mark's face gets too small to read.
- On dark backgrounds, use the `-dark` files. The 3D and flat marks gain a rice-colored ring. The favicon's outline turns rice above the band, and the band switches to dark-mode nori so it stays flush with the edge.
- Keep clear space around the logo at least as tall as the nori band.
