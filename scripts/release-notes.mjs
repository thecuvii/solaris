// Prints the CHANGELOG.md section for a release tag so the publish workflow can
// attach it to the GitHub release. Usage: node scripts/release-notes.mjs v0.1.0
import { readFile } from 'node:fs/promises'
import process from 'node:process'

const [, , tag, changelogPath = 'CHANGELOG.md'] = process.argv

if (!tag) {
  throw new Error('Usage: node scripts/release-notes.mjs <tag> [changelog-path]')
}

const version = tag.replace(/^v/, '')
const changelog = await readFile(changelogPath, 'utf8')

// Matches `## 0.1.0`, `## [0.1.0]`, `## [0.1.0](compare-url) (2026-09-06)`.
const headingPattern = new RegExp(
  `^## \\[?${version.replaceAll('.', '\\.')}\\]?(?:\\([^\\n]+\\))?(?: \\([^\\n]+\\))?\\s*$`,
  'm',
)
const heading = headingPattern.exec(changelog)

if (!heading) {
  process.stdout.write('No stable public changes.\n')
  process.exit(0)
}

const bodyStart = heading.index + heading[0].length
const nextHeading = changelog.slice(bodyStart).search(/^## /m)
const bodyEnd = nextHeading === -1 ? changelog.length : bodyStart + nextHeading
const releaseNotes = changelog.slice(bodyStart, bodyEnd).trim()

process.stdout.write(`${releaseNotes || 'No stable public changes.'}\n`)
