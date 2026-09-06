'use client'

import posthog from 'posthog-js'

type TrackProperties = {
  clicked_copy: {
    kind: 'code' | 'texture_url'
    planet_id: string
    texture_key?: string
    texture_label?: string
  }
  clicked_cuvii: undefined
  clicked_github: {
    planet_id?: string
    target: 'repo' | 'source'
  }
  clicked_preset: {
    planet_id: string
    preset_id: string
    preset_label: string
  }
}

// Outbound links can unload the page before the default batch flush.
const outboundEvents = new Set<keyof TrackProperties>(['clicked_cuvii', 'clicked_github'])

export function track<Name extends keyof TrackProperties>(
  name: Name,
  ...args: TrackProperties[Name] extends undefined ? [] : [properties: TrackProperties[Name]]
) {
  if (!posthog.__loaded) return
  posthog.capture(name, args[0], outboundEvents.has(name) ? { send_instantly: true } : undefined)
}
