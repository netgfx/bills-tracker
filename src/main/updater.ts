import { spawnSync } from 'node:child_process'
import { dirname } from 'node:path'
import { app, shell } from 'electron'
// CommonJS package: its named exports aren't visible to an ES module import.
import electronUpdater from 'electron-updater'
import { isLoggingIn } from './auth.ts'
import { db } from './db.ts'
import { notify } from './notify.ts'
import { isDeveloperIdSigned } from './platform.ts'
import { isScanning } from './scanner.ts'

const BUSY_RETRY_MS = 30_000
const RELEASES_URL = 'https://github.com/netgfx/bills-tracker/releases/latest'

/**
 * macOS installs updates only into apps signed with an Apple Developer ID. Until releases are
 * signed, the Mac app tells the user about a new version instead of downloading it.
 */
function macCanSelfUpdate(): boolean {
  // …/Bills Tracker.app/Contents/MacOS/Bills Tracker → …/Bills Tracker.app
  const bundle = dirname(dirname(dirname(process.execPath)))
  const r = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=2', bundle], { encoding: 'utf8', timeout: 10_000 })
  return isDeveloperIdSigned(`${r.stdout ?? ''}${r.stderr ?? ''}`)
}

/**
 * Looks for a newer GitHub release, downloads it, then restarts into it silently.
 * Waits for a running scan or sign-in to finish first, so neither gets cut off.
 */
export function checkForUpdate(beforeRestart: () => void) {
  if (!app.isPackaged || !db.settings().autoUpdate) return

  const { autoUpdater } = electronUpdater
  // Being offline is normal here; the next launch tries again.
  autoUpdater.on('error', (e) => console.error('Update check failed', e))

  if (process.platform === 'darwin' && !macCanSelfUpdate()) {
    autoUpdater.autoDownload = false
    autoUpdater.on('update-available', (info) => {
      notify(`Bills Tracker ${info.version} is available`, 'Click to download it from GitHub.', () => void shell.openExternal(RELEASES_URL))
    })
    autoUpdater.checkForUpdates().catch((e) => console.error('Update check failed', e))
    return
  }

  // Otherwise a download would still install on quit after the setting is turned off.
  autoUpdater.autoInstallOnAppQuit = false

  const install = () => {
    if (!db.settings().autoUpdate) return
    if (isScanning() || isLoggingIn()) {
      setTimeout(install, BUSY_RETRY_MS)
      return
    }
    beforeRestart()
    autoUpdater.quitAndInstall(true, true)
  }

  autoUpdater.on('update-downloaded', install)
  autoUpdater.checkForUpdates().catch((e) => console.error('Update check failed', e))
}
