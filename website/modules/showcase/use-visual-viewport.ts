'use client'

import { useEffect } from 'react'

function syncVisualViewport() {
  const visual = window.visualViewport
  const height = visual?.height ?? window.innerHeight
  const offsetTop = visual?.offsetTop ?? 0
  const bottomInset = Math.max(0, window.innerHeight - height - offsetTop)
  const root = document.documentElement
  root.style.setProperty('--visual-viewport-height', `${height}px`)
  root.style.setProperty('--visual-viewport-offset-top', `${offsetTop}px`)
  root.style.setProperty('--visual-viewport-bottom-inset', `${bottomInset}px`)
}

export function useVisualViewport() {
  useEffect(() => {
    syncVisualViewport()
    const visual = window.visualViewport
    visual?.addEventListener('resize', syncVisualViewport)
    visual?.addEventListener('scroll', syncVisualViewport)
    window.addEventListener('resize', syncVisualViewport)
    return () => {
      visual?.removeEventListener('resize', syncVisualViewport)
      visual?.removeEventListener('scroll', syncVisualViewport)
      window.removeEventListener('resize', syncVisualViewport)
    }
  }, [])
}
