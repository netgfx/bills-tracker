import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rewriteLatestYml } from './finalize-signed-installer.mjs'

const LATEST = `version: 9.9.9
files:
  - url: Bills-Tracker-Setup-9.9.9.exe
    sha512: OLDSHA==
    size: 1000
path: Bills-Tracker-Setup-9.9.9.exe
sha512: OLDSHA==
releaseDate: '2030-01-01T00:00:00.000Z'
`

test('rewriteLatestYml swaps in the signed installer checksum and size', () => {
  assert.equal(
    rewriteLatestYml(LATEST, 'Bills-Tracker-Setup-9.9.9.exe', 'NEWSHA==', 2048),
    `version: 9.9.9
files:
  - url: Bills-Tracker-Setup-9.9.9.exe
    sha512: NEWSHA==
    size: 2048
path: Bills-Tracker-Setup-9.9.9.exe
sha512: NEWSHA==
releaseDate: '2030-01-01T00:00:00.000Z'
`,
  )
})

test('rewriteLatestYml refuses a file latest.yml does not list', () => {
  assert.throws(() => rewriteLatestYml(LATEST, 'Other.exe', 'X', 1), /not listed/)
})
