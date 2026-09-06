import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import { inter } from './fonts'
import './globals.css'

export const metadata: Metadata = {
  description: 'React shader effects for the solar system.',
  title: 'Solaris — React shader planets',
}

export const viewport: Viewport = {
  themeColor: '#07080d',
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Viewport CSS vars are written on <html> before hydration (see
    // instrumentation-client). That inline style is client-only.
    <html className={inter.variable} lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
