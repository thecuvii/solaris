import type { ReactNode } from 'react'

import { ShowcaseLayout } from '../../modules/showcase/showcase-layout'

export default function ShowcaseChromeLayout({ children }: { children: ReactNode }) {
  return <ShowcaseLayout>{children}</ShowcaseLayout>
}
