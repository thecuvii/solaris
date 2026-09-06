import { defineConfig } from 'vite-plus'

export default defineConfig({
  fmt: {
    ignorePatterns: ['website/.next/**', 'website/out/**'],
    semi: false,
    singleQuote: true,
  },
  lint: {
    ignorePatterns: ['dist/**', 'website/.next/**', 'website/out/**'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    plugins: ['typescript', 'react'],
  },
  pack: {
    // Rolldown drops top-level directives from non-entry modules, and every
    // planet entry is a re-export barrel. Re-attach the directive to each JS
    // chunk so React Server Components treat the package as client-only.
    banner: { js: "'use client'" },
    deps: {
      neverBundle: ['react', 'react-dom', 'react/jsx-runtime'],
    },
    dts: true,
    entry: {
      index: 'src/index.ts',
      'earth/index': 'src/earth/index.ts',
      'jupiter/index': 'src/jupiter/index.ts',
      'mars/index': 'src/mars/index.ts',
      'mercury/index': 'src/mercury/index.ts',
      'moon/index': 'src/moon/index.ts',
      'neptune/index': 'src/neptune/index.ts',
      'pluto/index': 'src/pluto/index.ts',
      'saturn/index': 'src/saturn/index.ts',
      'sky/index': 'src/sky/index.ts',
      'sun/index': 'src/sun/index.ts',
      'titan/index': 'src/titan/index.ts',
      'uranus/index': 'src/uranus/index.ts',
      'venus/index': 'src/venus/index.ts',
    },
    format: ['esm'],
    publint: true,
    sourcemap: true,
  },
  staged: {
    '*.{css,js,json,jsx,md,mjs,ts,tsx,yaml,yml}': 'vp check --fix',
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
