import { chromium } from 'playwright'
import { mkdir, copyFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'

const output = fileURLToPath(new URL('./output/', import.meta.url))
const frames = `${output}/frames-v27`
await mkdir(frames, { recursive: true })
const fps = 30
const resumeFrame = Number(process.env.LAUNCH_FROM_FRAME ?? 0)
let duration
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
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
  await copyFile(`${frames}/00015.png`, `${output}/solaris-launch-poster-v27.png`)
  await writeFile(
    `${output}/render-report-v27.json`,
    JSON.stringify(
      {
        width: 1920,
        height: 1080,
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
    '17',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    `${output}/solaris-launch-opening-v27.mp4`,
  ],
  { stdio: 'inherit' },
)
const [code] = await once(encoder, 'exit')
if (code !== 0) throw new Error(`ffmpeg exited ${code}`)
console.log(`${output}/solaris-launch-opening-v27.mp4`)
