export type SourceStatus = 'loading' | 'ready' | 'error'

/**
 * Load notifications for a planet source.
 * `ready` means images are decoded or generated data is available, not that the GPU upload finished.
 */
export type SourceLifecycleProps = {
  /**
   * Called when a texture fails to load, or when the renderer fails (shader
   * compilation, framebuffer setup, unusable source data). The canvas stays
   * blank and nothing is thrown into React.
   */
  onError?: (error: Error) => void
  onReady?: () => void
  onStatusChange?: (status: SourceStatus) => void
}
