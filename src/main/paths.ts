import { app } from 'electron'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const nodeRequire = createRequire(import.meta.url)

/**
 * The app keeps its own Claude login, separate from any Claude Code install on
 * the machine, so the user's personal CLI settings, hooks and MCP servers never
 * leak into the bill scanner.
 */
export function claudeConfigDir(): string {
  // Dev only: reuse an existing Claude Code login instead of signing in again.
  if (!app.isPackaged && process.env.BILLS_DEV_CLAUDE_CONFIG_DIR) return process.env.BILLS_DEV_CLAUDE_CONFIG_DIR
  const dir = join(app.getPath('userData'), 'claude')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function dataFile(): string {
  return join(app.getPath('userData'), 'bills.json')
}

/** Working directory for SDK sessions; empty so there is nothing on disk to read. */
export function scanWorkDir(): string {
  const dir = join(app.getPath('userData'), 'scan-workspace')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Resolve the claude.exe the Agent SDK ships, accounting for asar unpacking. */
export function claudeExecutable(): string {
  const pkg = process.arch === 'arm64' ? 'claude-agent-sdk-win32-arm64' : 'claude-agent-sdk-win32-x64'
  const resolved = nodeRequire.resolve(`@anthropic-ai/${pkg}/claude.exe`)
  return resolved.replace(`app.asar${process.platform === 'win32' ? '\\' : '/'}`, `app.asar.unpacked${process.platform === 'win32' ? '\\' : '/'}`)
}

export function resourcePath(name: string): string {
  return app.isPackaged ? join(process.resourcesPath, 'resources', name) : join(app.getAppPath(), 'resources', name)
}

export function claudeEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env }
  // An API key or token in the environment would silently override the subscription login.
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  delete env.CLAUDE_CODE_OAUTH_TOKEN
  delete env.ANTHROPIC_BASE_URL
  env.CLAUDE_CONFIG_DIR = claudeConfigDir()
  env.CLAUDE_AGENT_SDK_CLIENT_APP = `bills-tracker/${app.getVersion()}`
  env.DISABLE_AUTOUPDATER = '1'
  return env
}
