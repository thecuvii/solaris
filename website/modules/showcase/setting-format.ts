export function getPrecision(step: number): number {
  return step < 0.01 ? 3 : step < 1 ? 2 : 0
}

export const numberFlowTimings = {
  opacityTiming: { duration: 160, easing: 'ease-out' },
  spinTiming: { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  transformTiming: { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
} as const

export const liveNumberFlowTimings = {
  opacityTiming: { duration: 0 },
  spinTiming: { duration: 0 },
  transformTiming: { duration: 0 },
} as const

export function numberFlowFormat(precision: number) {
  return {
    maximumFractionDigits: precision,
    minimumFractionDigits: precision,
    useGrouping: false,
  } as const
}
