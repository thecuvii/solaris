import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import Script from 'next/script'

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
    <html lang="en">
      <body>
        <Script id="visual-viewport" strategy="beforeInteractive">
          {`(function(){var v=window.visualViewport;document.documentElement.style.setProperty('--visual-viewport-height',(v?v.height:window.innerHeight)+'px')})()`}
        </Script>
        {children}
      </body>
    </html>
  )
}
