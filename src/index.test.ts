import { expect, test } from 'vite-plus/test'
import { Earth, Moon, Neptune, SolarSky, Sun } from './index'

test('exports the public celestial components', () => {
  expect(Earth).toBeTypeOf('function')
  expect(Moon).toBeTypeOf('function')
  expect(Neptune).toBeTypeOf('function')
  expect(SolarSky).toBeTypeOf('function')
  expect(Sun).toBeTypeOf('function')
})
