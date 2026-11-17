// After SignPath signs the Windows installer, its bytes no longer match what electron-builder wrote into
// latest.yml and the .blockmap, and installed apps would reject the update. This rebuilds the blockmap the
// same way electron-builder does and puts the signed file's sha512 and size into latest.yml.
// Usage: node scripts/finalize-signed-installer.mjs release/Bills-Tracker-Setup-X.Y.Z.exe release/latest.yml
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Replaces the checksum and size recorded for `fileName` in latest.yml's text. The file's old sha512 also
 * appears as the top-level `sha512:`, so every occurrence of it is replaced.
 */
export function rewriteLatestYml(text, fileName, sha512, size) {
  const lines = text.split('\n')
  const at = lines.findIndex((l) => l.trim() === `- url: ${fileName}`)
  if (at < 0) throw new Error(`${fileName} is not listed in latest.yml`)
  let oldSha = null
  for (let i = at + 1; i < lines.length && /^\s{4}\S/.test(lines[i]); i++) {
    const sha = /^(\s+sha512: )(.+)$/.exec(lines[i])
    if (sha) {
      oldSha = sha[2].trim()
      lines[i] = `${sha[1]}${sha512}`
    }
    const sz = /^(\s+size: )\d+\s*$/.exec(lines[i])
    if (sz) lines[i] = `${sz[1]}${size}`
  }
  if (!oldSha) throw new Error(`No sha512 for ${fileName} in latest.yml`)
  return lines.map((l) => (l.includes(oldSha) ? l.replace(oldSha, sha512) : l)).join('\n')
}

async function main([exe, latest]) {
  if (!exe || !latest) throw new Error('Usage: finalize-signed-installer.mjs <installer.exe> <latest.yml>')
  const require = createRequire(import.meta.url)
  const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap.js')
  const { sha512, size } = await buildBlockMap(exe, 'gzip', `${exe}.blockmap`)
  writeFileSync(latest, rewriteLatestYml(readFileSync(latest, 'utf8'), basename(exe), sha512, size))
  console.log(`Updated ${latest} and ${exe}.blockmap for the signed installer (${size} bytes)`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
}
