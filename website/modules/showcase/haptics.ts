import { WebHaptics } from 'web-haptics'

const TICK_GAP_MS = 18

let client: WebHaptics | null = null
let lastTickAt = 0

function getClient() {
  client ??= new WebHaptics()
  return client
}

function pulse(preset: 'light' | 'medium' | 'nudge' | 'rigid' | 'selection') {
  if (typeof window === 'undefined') return
  const haptics = getClient()
  haptics.cancel()
  void haptics.trigger(preset)
}

export function hapticPress() {
  pulse('light')
}

export function hapticTick(major = false) {
  const now = performance.now()
  if (now - lastTickAt < TICK_GAP_MS) return
  lastTickAt = now
  pulse(major ? 'rigid' : 'selection')
}

export function hapticSettle() {
  pulse('nudge')
}
