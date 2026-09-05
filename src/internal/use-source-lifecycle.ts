'use client'

import { useEffect, useEffectEvent } from 'react'

import type { SourceLifecycleProps, SourceStatus } from '../source-lifecycle'

type SourceLike = {
  ready?: () => Promise<void>
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function useSourceLifecycle(
  source: SourceLike | undefined,
  { onError, onReady, onStatusChange }: SourceLifecycleProps,
): void {
  const emitStatus = useEffectEvent((status: SourceStatus, error?: Error) => {
    onStatusChange?.(status)
    if (status === 'ready') onReady?.()
    if (status === 'error' && error) onError?.(error)
  })

  useEffect(() => {
    let cancelled = false
    const ready = source?.ready?.()

    if (!ready) {
      emitStatus('ready')
      return
    }

    emitStatus('loading')
    void ready.then(
      () => {
        if (!cancelled) emitStatus('ready')
      },
      (error: unknown) => {
        if (!cancelled) emitStatus('error', toError(error))
      },
    )

    return () => {
      cancelled = true
    }
  }, [source])
}
