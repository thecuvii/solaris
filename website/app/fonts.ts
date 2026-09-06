import localFont from 'next/font/local'

// Self-hosted Inter Variable via next/font/local.
// next/font inlines the @font-face, preloads the woff2, and generates a
// size-adjusted Arial fallback so the swap does not cause layout shift.
export const inter = localFont({
  adjustFontFallback: 'Arial',
  display: 'swap',
  preload: true,
  src: '../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  variable: '--font-inter',
  weight: '100 900',
})
