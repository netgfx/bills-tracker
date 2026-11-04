// Writes one version's CHANGELOG section to a file, for use as GitHub release notes.
// Usage: node scripts/release-notes.mjs <tag> <output-file>
// Fails if the tag doesn't match package.json or the section is missing or empty,
// so a release can't go out with the wrong version or without notes.
import { readFileSync, writeFileSync } from 'node:fs'

function sectionFor(changelog, version) {
  const lines = changelog.split(/\r?\n/)
  const start = lines.findIndex((l) => l === `## ${version}` || l.startsWith(`## ${version} `))
  if (start === -1) return null
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((l) => l.startsWith('## '))
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim() || null
}

const [tag, outFile] = process.argv.slice(2)
if (!tag || !outFile) {
  console.error('Usage: node scripts/release-notes.mjs <tag> <output-file>')
  process.exit(2)
}

const version = tag.replace(/^v/, '')
const root = new URL('../', import.meta.url)
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))
if (pkg.version !== version) {
  console.error(`Tag ${tag} doesn't match package.json version ${pkg.version}.`)
  process.exit(1)
}

const notes = sectionFor(readFileSync(new URL('CHANGELOG.md', root), 'utf8'), version)
if (!notes) {
  console.error(`CHANGELOG.md has no notes for ${version}.`)
  process.exit(1)
}

writeFileSync(outFile, `${notes}\n`)
