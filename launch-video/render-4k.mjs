import { chromium } from 'playwright'
import { mkdir, copyFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'

const output = fileURLToPath(new URL('./output/', import.meta.url))
const frames = `${output}/frames-v28-4k`
await mkdir(frames, { recursive: true })
const fps = 30
const resumeFrame = Number(process.env.LAUNCH_FROM_FRAME ?? 0)
let duration
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  })
  // Keep the approved CSS framing; rasterize every pixel at 2x density.
  // Sky normally caps DPR at 1.5 for interactive performance. Lift only this
  // capture browser's compiled module to 2; production sources stay unchanged.
  let skyDprOverrides = 0
  await page.route('**/*.js*', async (route) => {
    const response = await route.fetch()
    const source = await response.text()
    const patched = source.replace(/maxDevicePixelRatio:\s*1\.5\b/g, () => {
      skyDprOverrides++
      return 'maxDevicePixelRatio: 2'
    })
    await route.fulfill({ response, body: patched })
  })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('http://localhost:3000/earth/launch/?capture=1')
  await page.waitForFunction(() => Boolean(window.solarisShot), { timeout: 60000 })
  duration = await page.evaluate(() => window.solarisShot.duration)
  const frameCount = Math.ceil(duration * fps)
  console.log('Filming scene ready')
  await page.waitForFunction(() => document.querySelector('canvas')?.style.opacity === '1')
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      Array.from(document.images)
        .filter((image) => image.complete)
        .map((image) => image.decode().catch(() => {})),
    )
  })
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('[data-launch-cut] canvas')).length === 12 &&
      Array.from(document.querySelectorAll('[data-launch-cut] canvas')).every(
        (canvas) => canvas.style.opacity === '1',
      ),
  )
  await page.waitForFunction(() => {
    const frame = document.querySelector('.launch-sky iframe')
    return (
      frame?.contentWindow?.solarisSkyShot &&
      frame.contentDocument.querySelector('main canvas')?.style.opacity === '1'
    )
  })
  await page.waitForTimeout(1000)
  const raster = await page.evaluate(() => {
    const skyDocument = document.querySelector('.launch-sky iframe').contentDocument
    const canvases = [
      ...document.querySelectorAll('canvas'),
      ...skyDocument.querySelectorAll('canvas'),
    ]
    return canvases.map((canvas) => ({
      width: canvas.width,
      height: canvas.height,
      cssWidth: canvas.getBoundingClientRect().width,
      cssHeight: canvas.getBoundingClientRect().height,
    }))
  })
  if (!skyDprOverrides) throw new Error('Sky capture DPR override did not match')
  if (raster.some((c) => c.cssWidth > 100 && c.width < Math.round(c.cssWidth * 2)))
    throw new Error('A canvas is below native 4K density')
  console.log('Verified native 2x canvas density', raster)
  // Freeze browser time, then advance it explicitly, including the shader's rAF loop.
  const epoch = new Date()
  await page.clock.install({ time: epoch })
  await page.clock.pauseAt(new Date(epoch.getTime() + 100))
  // Drive NumberFlow's native Web Animations with the same deterministic clock.
  await page.evaluate(() => {
    window.launchDigitAnimations = new Set()
    const animate = Element.prototype.animate
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args)
      if (this.getRootNode().host?.matches('number-flow-react')) {
        animation.pause()
        animation.currentTime = 0
        window.launchDigitAnimations.add({ animation, start: performance.now() })
      }
      return animation
    }
  })
  let rollingCodeFrames = 0
  let rollingPanelFrames = 0
  for (
    let frame = process.env.LAUNCH_SKIP_WARMUP === '1' ? resumeFrame : 0;
    frame < Math.min(frameCount, Number(process.env.LAUNCH_TO_FRAME ?? frameCount));
    frame++
  ) {
    await page.evaluate((t) => window.solarisShot.seek(t), frame / fps)
    await page.clock.runFor(frame % 3 === 0 ? 34 : 33)
    const rolling = await page.evaluate(() => {
      for (const record of window.launchDigitAnimations) {
        const elapsed = performance.now() - record.start
        const end = record.animation.effect?.getComputedTiming().endTime
        if (Number.isFinite(end) && elapsed >= end) {
          record.animation.finish()
          window.launchDigitAnimations.delete(record)
        } else record.animation.currentTime = elapsed
      }
      const active = Array.from(document.querySelectorAll('number-flow-react')).filter((node) =>
        node.shadowRoot
          ?.getAnimations()
          .some((a) => a.currentTime > 0 && a.currentTime < a.effect.getComputedTiming().endTime),
      )
      return {
        code: active.some((node) => node.closest('.launch-code')),
        panel: active.some((node) => !node.closest('.launch-code')),
      }
    })
    if (frame >= 66 && frame <= 120) {
      rollingCodeFrames += Number(rolling.code)
      rollingPanelFrames += Number(rolling.panel)
    }
    if (frame >= resumeFrame)
      await page.screenshot({ path: `${frames}/${String(frame).padStart(5, '0')}.png` })
    if (frame % fps === 0) console.log(`Rendered ${frame / fps}s / ${duration}s`)
  }
  if (errors.length) throw new Error(errors.join('\n'))
  await copyFile(`${frames}/00015.png`, `${output}/solaris-launch-poster-v28-4k.png`)
  await writeFile(
    `${output}/render-report-v28-4k.json`,
    JSON.stringify(
      {
        width: 3840,
        height: 2160,
        raster,
        skyDprOverrides,
        fps,
        duration: frameCount / fps,
        timelineDuration: duration,
        frames: frameCount,
        errors,
        rollingCodeFrames,
        rollingPanelFrames,
      },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
const encoder = spawn(
  'ffmpeg',
  [
    '-y',
    '-framerate',
    String(fps),
    '-i',
    `${frames}/%05d.png`,
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '15',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    `${output}/solaris-launch-opening-v28-4k.mp4`,
  ],
  { stdio: 'inherit' },
)
const [code] = await once(encoder, 'exit')
if (code !== 0) throw new Error(`ffmpeg exited ${code}`)
console.log(`${output}/solaris-launch-opening-v28-4k.mp4`)
