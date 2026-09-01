import stylex from '@stylexjs/unplugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  server: { allowedHosts: true },
  plugins: [
    stylex.vite({
      dev: process.env.NODE_ENV === 'development',
      runtimeInjection: false,
      useCSSLayers: true,
    }),
    tanstackStart(),
    nitro({
      preset: 'cloudflare_module',
      compatibilityDate: '2026-09-01',
      cloudflare: {
        deployConfig: true,
        nodeCompat: true,
        wrangler: {
          name: 'solaris',
        },
      },
      rollupConfig: { external: [/^@sentry\//] },
    }),
    viteReact(),
  ],
})

export default config
