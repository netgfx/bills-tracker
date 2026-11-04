import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { BillsApi } from '../shared/types'

function subscribe<T>(channel: string, cb: (v: T) => void) {
  const handler = (_e: IpcRendererEvent, v: T) => cb(v)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: BillsApi = {
  getSnapshot: () => ipcRenderer.invoke('snapshot'),
  setPaid: (id, paid) => ipcRenderer.invoke('bill:setPaid', id, paid),
  deleteBill: (id) => ipcRenderer.invoke('bill:delete', id),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  scanNow: () => ipcRenderer.invoke('scan:now'),
  cancelScan: () => ipcRenderer.invoke('scan:cancel'),
  authStatus: () => ipcRenderer.invoke('auth:status'),
  startLogin: (opts) => ipcRenderer.invoke('auth:login', opts),
  submitLoginCode: (code) => ipcRenderer.invoke('auth:code', code),
  cancelLogin: () => ipcRenderer.invoke('auth:cancel'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  gmailStatus: () => ipcRenderer.invoke('gmail:status'),
  completeOnboarding: () => ipcRenderer.invoke('onboarding:complete'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openPaymentLink: (billId) => ipcRenderer.invoke('bill:openPayment', billId),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  onSnapshot: (cb) => subscribe('snapshot', cb),
  onLoginEvent: (cb) => subscribe('login-event', cb),
  onFocusSearch: (cb) => subscribe('focus-search', cb),
}

contextBridge.exposeInMainWorld('bills', api)
