import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claudeBinarySpecifier, isDeveloperIdSigned, unpackedPath } from './platform.ts'

test('claudeBinarySpecifier picks the CLI package for each OS and CPU', () => {
  assert.equal(claudeBinarySpecifier('win32', 'x64'), '@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe')
  assert.equal(claudeBinarySpecifier('win32', 'arm64'), '@anthropic-ai/claude-agent-sdk-win32-arm64/claude.exe')
  assert.equal(claudeBinarySpecifier('darwin', 'arm64'), '@anthropic-ai/claude-agent-sdk-darwin-arm64/claude')
  assert.equal(claudeBinarySpecifier('darwin', 'x64'), '@anthropic-ai/claude-agent-sdk-darwin-x64/claude')
})

test('unpackedPath points into app.asar.unpacked', () => {
  assert.equal(
    unpackedPath('/Applications/Bills Tracker.app/Contents/Resources/app.asar/node_modules/x/claude', '/'),
    '/Applications/Bills Tracker.app/Contents/Resources/app.asar.unpacked/node_modules/x/claude',
  )
  assert.equal(unpackedPath('C:\\a\\resources\\app.asar\\node_modules\\x\\claude.exe', '\\'), 'C:\\a\\resources\\app.asar.unpacked\\node_modules\\x\\claude.exe')
  assert.equal(unpackedPath('/dev/node_modules/x/claude', '/'), '/dev/node_modules/x/claude')
})

test('isDeveloperIdSigned only accepts a Developer ID authority', () => {
  const signed = 'Executable=/x\nIdentifier=com.example\nAuthority=Developer ID Application: Someone (ABCDE12345)\nAuthority=Developer ID Certification Authority\n'
  assert.equal(isDeveloperIdSigned(signed), true)
  assert.equal(isDeveloperIdSigned('Executable=/x\nSignature=adhoc\nTeamIdentifier=not set\n'), false)
  assert.equal(isDeveloperIdSigned(''), false)
})
