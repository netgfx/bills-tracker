import { app } from 'electron'
import { join, sep } from 'node:path'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { claudeBinarySpecifier, unpackedPath } from './platform.ts'

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

/**
 * Dev only: `BILLS_DEV_SCAN_WINDOW=2026-08-19..2026-08-22` scans just those days, to test one
 * email without paying for a whole lookback window.
 */
export function devScanWindow(): { after: Date; before: Date } | null {
  const m = !app.isPackaged && /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(process.env.BILLS_DEV_SCAN_WINDOW ?? '')
  return m ? { after: new Date(`${m[1]}T00:00:00`), before: new Date(`${m[2]}T00:00:00`) } : null
}

export function dataFile(): string {
  return join(app.getPath('userData'), 'bills.json')
}

/** Ticket PDFs, images and saved barcodes, one folder per ticket id. */
export function ticketsDir(): string {
  const dir = join(app.getPath('userData'), 'tickets')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Working directory for SDK sessions; empty so there is nothing on disk to read. */
export function scanWorkDir(): string {
  const dir = join(app.getPath('userData'), 'scan-workspace')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Resolve the Claude CLI the Agent SDK ships for this OS and CPU, accounting for asar unpacking. */
export function claudeExecutable(): string {
  return unpackedPath(nodeRequire.resolve(claudeBinarySpecifier(process.platform, process.arch)), sep)
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
