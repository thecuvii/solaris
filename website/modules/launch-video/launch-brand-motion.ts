import { endCardStart, mix, progress, skyAt, skyMorphEnd, sunToLogoStart } from './launch-timeline'

/** Match the shader's composition centre and disc diameter before moving the same orb. */
export function positionLaunchBrand(time: number) {
  const logo = document.querySelector<SVGSVGElement>('.launch-brand-logo')
  const grid = document.querySelector<HTMLElement>('.launch-brand-grid')
  const frame = document.querySelector<HTMLIFrameElement>('.launch-sky iframe')
  const composition = frame?.contentDocument?.querySelector('[data-solaris-composition]')
  if (!logo || !grid || !composition) return
  const source = composition.getBoundingClientRect()
  const target = grid.getBoundingClientRect()
  const size = logo.clientWidth
  const diameter = Math.min(source.width, source.height) * skyAt(skyMorphEnd).settings.sunScale!
  const travel = progress(time, sunToLogoStart + 0.45, endCardStart + 0.6)
  const dx = source.x + source.width / 2 - (target.x + size / 2)
  const dy = source.y + source.height / 2 - (target.y + target.height / 2)
  logo.style.transform = `translate(${dx * (1 - travel)}px, ${dy * (1 - travel)}px) scale(${mix(diameter / ((size * 11) / 13), 1, travel)})`
  // The warm halo contracts into the crisp brand silhouette.
  logo.style.filter = `drop-shadow(0 0 ${30 * (1 - travel)}px #ecc38180)`
}
