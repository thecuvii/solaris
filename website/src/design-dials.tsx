import { DialRoot, useDialKit } from 'dialkit'
import 'dialkit/styles.css'

const accentPalettes = {
  github: 'oklch(31.32% 0 0)',
  neptune: 'oklch(54.8% 0.134 253)',
  solar: 'oklch(56% 0.112 55)',
  lunar: 'oklch(58% 0.035 262)',
  aurora: 'oklch(55% 0.082 187)',
  paper: 'oklch(51.92% 0.2726 277.19)',
} as const

export function DesignDials() {
  const colors = useDialKit(
    'Interface',
    {
      controls: {
        palette: {
          type: 'select',
          options: [
            { label: 'GitHub Glass', value: 'github' },
            { label: 'Neptune Blue', value: 'neptune' },
            { label: 'Solar Amber', value: 'solar' },
            { label: 'Lunar Silver', value: 'lunar' },
            { label: 'Aurora Teal', value: 'aurora' },
            { label: 'Paper Violet', value: 'paper' },
            { label: 'Custom', value: 'custom' },
          ],
          default: 'github',
        },
        customAccent: { type: 'color', default: '#313131' },
      },
    },
    {
      id: 'solaris-interface-accent-v2',
      persist: true,
    },
  )
  const accent =
    accentPalettes[colors.controls.palette as keyof typeof accentPalettes] ??
    colors.controls.customAccent

  return (
    <>
      <style>{`:root {
        --control-accent: ${accent};
      }`}</style>
      <DialRoot defaultOpen={false} position="bottom-left" productionEnabled theme="dark" />
    </>
  )
}
