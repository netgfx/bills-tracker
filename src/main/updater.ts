import { app } from 'electron'
// CommonJS package: its named exports aren't visible to an ES module import.
import electronUpdater from 'electron-updater'
import { isLoggingIn } from './auth.ts'
import { db } from './db.ts'
import { isScanning } from './scanner.ts'

const BUSY_RETRY_MS = 30_000

/**
 * Looks for a newer GitHub release, downloads it, then restarts into it silently.
 * Waits for a running scan or sign-in to finish first, so neither gets cut off.
 */
export function checkForUpdate(beforeRestart: () => void) {
  if (!app.isPackaged || !db.settings().autoUpdate) return

  const { autoUpdater } = electronUpdater
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
  // Being offline is normal here; the next launch tries again.
  autoUpdater.on('error', (e) => console.error('Update check failed', e))
  autoUpdater.checkForUpdates().catch((e) => console.error('Update check failed', e))
}
