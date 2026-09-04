import type { PlanetId } from '../showcase/showcase-data'
import { earthExampleDeclaration } from './earth-example'

export const planetExampleDeclarations: Partial<Record<PlanetId, string>> = {
  earth: earthExampleDeclaration,
}

export const planetExampleProps: Partial<Record<PlanetId, string>> = {
  earth: '  model={earthModel}',
}
