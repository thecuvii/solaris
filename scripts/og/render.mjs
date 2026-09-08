import { createServer } from 'vite'
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Usage: node scripts/og/render.mjs [output.png]
// Preview: node scripts/og/render.mjs --serve
// Uses the procedural sky shader.
const root = fileURLToPath(new URL('../../', import.meta.url))
const server = await createServer({
  configFile: false,
  root,
  publicDir: resolve(root, 'website/public'),
  server: {
    host: '127.0.0.1',
    port: process.argv.includes('--serve') ? 3107 : 0,
    strictPort: true,
  },
})
await server.listen()
const url = `${server.resolvedUrls.local[0]}scripts/og/`
if (process.argv.includes('--serve')) {
  console.log(`OG preview: ${url}`)
} else {
  let browser
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const page = await browser.newPage({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 2,
    })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(url)
    await page.waitForFunction(
      () => {
        const canvases = [...document.querySelectorAll('canvas')]
        return canvases.length === 1 && canvases.every((canvas) => canvas.style.opacity === '1')
      },
      undefined,
      { timeout: 60000 },
    )
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    )
    if (errors.length) throw new Error(errors.join('\n'))
    const output = resolve(root, process.argv[2] ?? 'website/public/og.png')
    await page.locator('.artwork').screenshot({ path: output })
    console.log(`Saved ${output} (2400 × 1260; 2× OG export)`)
  } finally {
    await browser?.close()
    await server.close()
  }
}
