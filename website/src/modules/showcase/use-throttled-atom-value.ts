import type { Atom } from 'jotai'
import { useStore } from 'jotai'
import { useEffect, useState } from 'react'

export function useThrottledAtomValue<T>(target: Atom<T>, ms: number): T {
  const store = useStore()
  const [value, setValue] = useState(() => store.get(target))

  useEffect(() => {
    let last = 0
    let timer = 0

    function flush(): void {
      last = performance.now()
      setValue(store.get(target))
    }

    const unsubscribe = store.sub(target, () => {
      const wait = ms - (performance.now() - last)
      if (wait <= 0) {
        window.clearTimeout(timer)
        flush()
        return
      }
      window.clearTimeout(timer)
      timer = window.setTimeout(flush, wait)
    })

    return () => {
      unsubscribe()
      window.clearTimeout(timer)
    }
  }, [ms, store, target])

  return value
}
