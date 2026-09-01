import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { Suspense, lazy, useSyncExternalStore, type ReactNode } from 'react'

import appCss from '../styles.css?url'

const DesignDials = import.meta.env.DEV
  ? lazy(() => import('../design-dials').then((module) => ({ default: module.DesignDials })))
  : null
const subscribeToHydration = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Solaris — React shader planets',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        {import.meta.env.DEV ? <link rel="stylesheet" href="/virtual:stylex.css" /> : null}
        {import.meta.env.DEV ? <script type="module" src="/@id/virtual:stylex:runtime" /> : null}
      </head>
      <body>
        {children}
        <DevDesignDials />
        <Scripts />
      </body>
    </html>
  )
}

function DevDesignDials() {
  const hydrated = useSyncExternalStore(subscribeToHydration, getClientSnapshot, getServerSnapshot)

  if (!hydrated || !DesignDials) return null

  return (
    <Suspense fallback={null}>
      <DesignDials />
    </Suspense>
  )
}
