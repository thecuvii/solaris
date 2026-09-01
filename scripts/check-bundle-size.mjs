import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST_DIRECTORY = 'dist'
const MAX_ENTRY_GZIP_BYTES = 15 * 1024
const MAX_TOTAL_GZIP_BYTES = 120 * 1024

const files = readdirSync(DIST_DIRECTORY, { recursive: true })
  .filter((file) => file.endsWith('.mjs'))
  .sort()

if (files.length === 0) {
  throw new Error('No JavaScript bundles found. Run `vp pack` first.')
}

let totalGzipBytes = 0
let failed = false

for (const file of files) {
  const gzipBytes = gzipSync(readFileSync(join(DIST_DIRECTORY, file))).byteLength
  totalGzipBytes += gzipBytes

  const result = gzipBytes <= MAX_ENTRY_GZIP_BYTES ? 'pass' : 'fail'
  console.log(`${result.padEnd(4)} ${file.padEnd(26)} ${formatBytes(gzipBytes)} gzip`)

  if (result === 'fail') {
    failed = true
  }
}

console.log(`\nTotal: ${formatBytes(totalGzipBytes)} / ${formatBytes(MAX_TOTAL_GZIP_BYTES)} gzip`)

if (totalGzipBytes > MAX_TOTAL_GZIP_BYTES) {
  failed = true
}

if (failed) {
  throw new Error(
    `Bundle size budget exceeded (maximum ${formatBytes(MAX_ENTRY_GZIP_BYTES)} per entry and ${formatBytes(MAX_TOTAL_GZIP_BYTES)} total).`,
  )
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB`
}
