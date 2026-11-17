import { Notification } from 'electron'
import { resourcePath } from './paths.ts'

/**
 * Notifications still on screen or in the notification center. Without a reference an Electron
 * Notification can be garbage-collected, and clicking it then does nothing (mostly seen on macOS).
 */
const live = new Set<Notification>()
let defaultClick: () => void = () => {}

/** What clicking a notification does when the caller doesn't say: open the window. */
export function setDefaultNotificationClick(fn: () => void) {
  defaultClick = fn
}

export function notify(title: string, body: string, onClick?: () => void): boolean {
  if (!Notification.isSupported()) return false
  const n = new Notification({
    title,
    body,
    // macOS always shows the app's own icon and ignores this; Windows needs it.
    ...(process.platform === 'darwin' ? {} : { icon: resourcePath('icon.png') }),
  })
  live.add(n)
  const release = () => live.delete(n)
  n.on('click', () => {
    release()
    ;(onClick ?? defaultClick)()
  })
  n.on('close', release)
  n.on('failed', (_e, error) => {
    release()
    console.error('Notification failed', error)
  })
  n.show()
  // Windows keeps notifications in the Action Center for a while; let go after a day.
  setTimeout(release, 24 * 3_600_000).unref()
  return true
}
