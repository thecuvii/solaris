import { DialRoot, useDialKit } from 'dialkit'
import 'dialkit/styles.css'

const buttonPalettes = {
  github: { end: 'oklch(26.86% 0 0)', start: 'oklch(36% 0 0)' },
  neptune: { end: 'oklch(49.6% 0.134 261.2)', start: 'oklch(63.8% 0.095 229.9)' },
  solar: { end: 'oklch(48.6% 0.105 44)', start: 'oklch(67.7% 0.119 65.5)' },
  lunar: { end: 'oklch(50.4% 0.035 260.6)', start: 'oklch(68.4% 0.033 263.4)' },
  aurora: { end: 'oklch(48.9% 0.072 190)', start: 'oklch(63.3% 0.092 184.8)' },
  paper: {
    end: 'oklch(51.9% 0.272 277.2)',
    start: 'oklch(62.2% 0.206 277.5)',
  },
} as const

export function DesignDials() {
  const colors = useDialKit(
    'Interface',
    {
      button: {
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
        custom: {
          _collapsed: true,
          gradientStart: { type: 'color', default: '#4596ba' },
          gradientEnd: { type: 'color', default: '#345fad' },
        },
      },
    },
    {
      id: 'solaris-interface',
      persist: true,
    },
  )
  const palette = buttonPalettes[colors.button.palette as keyof typeof buttonPalettes]
  const gradientStart = palette?.start ?? colors.button.custom.gradientStart
  const gradientEnd = palette?.end ?? colors.button.custom.gradientEnd

  return (
    <>
      <style>{`:root {
        --reset-button-gradient-start: ${gradientStart};
        --reset-button-gradient-end: ${gradientEnd};
      }`}</style>
      <DialRoot defaultOpen={false} position="bottom-left" productionEnabled theme="dark" />
    </>
  )
}
