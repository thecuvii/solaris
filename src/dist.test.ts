import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'

// These assertions inspect the built package, so they only run after `vp pack`.
// CI builds before testing; locally run `pnpm build && pnpm test`.
const distDirectory = resolve(import.meta.dirname, '../dist')
const hasDist = existsSync(join(distDirectory, 'index.mjs'))

type PackageJson = {
  exports: Record<string, { import: string; types: string }>
}

describe.skipIf(!hasDist)('dist', () => {
  const bundles = readdirSync(distDirectory, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith('.mjs'))

  test('every JavaScript chunk keeps the use client directive', () => {
    expect(bundles.length).toBeGreaterThan(0)
    for (const file of bundles) {
      const source = readFileSync(join(distDirectory, file), 'utf8')
      expect(source.startsWith("'use client'"), `${file} is missing 'use client'`).toBe(true)
    }
  })

  test('every package export resolves to a built file', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'),
    ) as PackageJson
    for (const [subpath, entry] of Object.entries(packageJson.exports)) {
      expect(existsSync(resolve(import.meta.dirname, '..', entry.import)), subpath).toBe(true)
      expect(existsSync(resolve(import.meta.dirname, '..', entry.types)), subpath).toBe(true)
    }
  })
})
