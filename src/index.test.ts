import { expect, test } from 'vite-plus/test'
import * as solaris from './index'

test('exports the public celestial components', () => {
  expect(solaris.Earth).toBeTypeOf('function')
  expect(solaris.Jupiter).toBeTypeOf('function')
  expect(solaris.LunarEclipse).toBeTypeOf('function')
  expect(solaris.Mars).toBeTypeOf('function')
  expect(solaris.Mercury).toBeTypeOf('function')
  expect(solaris.Moon).toBeTypeOf('function')
  expect(solaris.Neptune).toBeTypeOf('function')
  expect(solaris.ObservedSun).toBeTypeOf('function')
  expect(solaris.Pluto).toBeTypeOf('function')
  expect(solaris.Saturn).toBeTypeOf('function')
  expect(solaris.Sun).toBeTypeOf('function')
  expect(solaris.Titan).toBeTypeOf('function')
  expect(solaris.Uranus).toBeTypeOf('function')
  expect(solaris.Venus).toBeTypeOf('function')
  expect(solaris.preloadTextureImages).toBeTypeOf('function')
})

test('does not export effects or sources', () => {
  expect(solaris).not.toHaveProperty('AtmosphericOrbEffect')
  expect(solaris).not.toHaveProperty('LunarOrbEffect')
  expect(solaris).not.toHaveProperty('createEarthSurfaceSource')
  expect(solaris).not.toHaveProperty('createLunarSurfaceSource')
  expect(solaris).not.toHaveProperty('loadTextureImage')
})
