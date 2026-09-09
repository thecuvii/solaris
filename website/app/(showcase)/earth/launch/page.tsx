import { LaunchDirector } from '../../../../modules/launch-video/launch-director'
import { PlanetTexturePreloads } from '../../../../modules/planet-page/planet-texture-preloads'

export const metadata = {
  title: 'Solaris — launch preview',
  robots: { index: false, follow: false },
}

export default function LaunchPage() {
  return (
    <>
      <span hidden data-launch-preview="" />
      <PlanetTexturePreloads planetId="earth" />
      <LaunchDirector />
    </>
  )
}
