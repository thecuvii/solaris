import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import Script from 'next/script'

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
    <html className={inter.variable} lang="en">
      <body>
        <Script id="visual-viewport" strategy="beforeInteractive">
          {`(function(){var v=window.visualViewport,h=v?v.height:window.innerHeight,t=v?v.offsetTop:0,r=document.documentElement;r.style.setProperty('--visual-viewport-height',h+'px');r.style.setProperty('--visual-viewport-offset-top',t+'px');r.style.setProperty('--visual-viewport-bottom-inset',Math.max(0,window.innerHeight-h-t)+'px')})()`}
        </Script>
        {children}
      </body>
    </html>
  )
}
