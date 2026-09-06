import posthog from 'posthog-js'

import { syncVisualViewport } from './modules/showcase/visual-viewport'

syncVisualViewport()

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'

if (token) {
  posthog.init(token, {
    api_host: host,
    defaults: '2026-05-30',
  })
}
