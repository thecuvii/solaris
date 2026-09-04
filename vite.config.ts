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
      'observed-sun/index': 'src/observed-sun/index.ts',
      'pluto/index': 'src/pluto/index.ts',
      'saturn/index': 'src/saturn/index.ts',
      'sun/index': 'src/sun/index.ts',
      'titan/index': 'src/titan/index.ts',
      'uranus/index': 'src/uranus/index.ts',
      'venus/index': 'src/venus/index.ts',
    },
    format: ['esm'],
    sourcemap: true,
  },
  staged: {
    '*.{css,js,json,jsx,md,mjs,ts,tsx,yaml,yml}': 'vp check --fix',
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
