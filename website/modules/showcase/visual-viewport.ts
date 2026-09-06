export function syncVisualViewport() {
  const visual = window.visualViewport
  const height = visual?.height ?? window.innerHeight
  const offsetTop = visual?.offsetTop ?? 0
  const bottomInset = Math.max(0, window.innerHeight - height - offsetTop)
  const root = document.documentElement
  root.style.setProperty('--visual-viewport-height', `${height}px`)
  root.style.setProperty('--visual-viewport-offset-top', `${offsetTop}px`)
  root.style.setProperty('--visual-viewport-bottom-inset', `${bottomInset}px`)
}
