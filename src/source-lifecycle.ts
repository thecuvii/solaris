export type SourceStatus = 'loading' | 'ready' | 'error'

/**
 * Load notifications for a planet source.
 * `ready` means images are decoded or generated data is available, not that the GPU upload finished.
 */
export type SourceLifecycleProps = {
  onError?: (error: Error) => void
  onReady?: () => void
  onStatusChange?: (status: SourceStatus) => void
}
