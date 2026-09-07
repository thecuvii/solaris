import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import { socialImage } from '../modules/planet-page/planet-metadata'
import { inter } from './fonts'
import './globals.css'

const description = 'React shader effects for the solar system.'
const title = 'Solaris — React shader planets'

export const metadata: Metadata = {
  description,
  metadataBase: new URL('https://solaris.cuvii.dev'),
  openGraph: {
    description,
    images: [socialImage],
    siteName: 'Solaris',
    title,
    type: 'website',
    url: '/',
  },
  title,
  twitter: {
    card: 'summary_large_image',
    description,
    images: [socialImage],
    title,
  },
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
