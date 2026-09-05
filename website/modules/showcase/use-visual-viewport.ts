'use client'

import { useEffect } from 'react'

function syncVisualViewport() {
  const visual = window.visualViewport
  const height = visual?.height ?? window.innerHeight
  document.documentElement.style.setProperty('--visual-viewport-height', `${height}px`)
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
