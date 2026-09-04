import { useSyncExternalStore } from 'react'

const MOBILE_QUERY = '(max-width: 960px)'

function subscribeMobile(onStoreChange: () => void) {
  const media = window.matchMedia(MOBILE_QUERY)
  media.addEventListener('change', onStoreChange)
  return () => media.removeEventListener('change', onStoreChange)
}

export function useMobileShowcase() {
  return useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  )
}
