'use client'

import { useEffect } from 'react'

import { syncVisualViewport } from './visual-viewport'

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
