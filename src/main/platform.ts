/** Platform facts that don't need Electron, so they can be unit-tested. */

/**
 * The Agent SDK ships the Claude CLI as one optional package per OS and CPU,
 * e.g. `@anthropic-ai/claude-agent-sdk-darwin-arm64/claude` or `…-win32-x64/claude.exe`.
 */
export function claudeBinarySpecifier(platform: NodeJS.Platform, arch: string): string {
  const os = platform === 'win32' ? 'win32' : platform === 'darwin' ? 'darwin' : 'linux'
  const cpu = arch === 'arm64' ? 'arm64' : 'x64'
  return `@anthropic-ai/claude-agent-sdk-${os}-${cpu}/${os === 'win32' ? 'claude.exe' : 'claude'}`
}

/** Files unpacked from the asar archive live beside it, in `app.asar.unpacked`. */
export function unpackedPath(resolved: string, sep: string): string {
  return resolved.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`)
}

/** True when `codesign -dv` output shows an Apple Developer ID signature, which macOS updates require. */
export function isDeveloperIdSigned(codesignOutput: string): boolean {
  return /^Authority=Developer ID Application:/m.test(codesignOutput)
}
