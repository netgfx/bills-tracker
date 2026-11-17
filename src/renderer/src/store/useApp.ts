import { create } from 'zustand'
import type { AppSnapshot, Bill, Settings, Ticket } from '@shared/types'
import { EMPTY_FILTERS, type Filters, type GroupId } from '@/lib/bills'

interface AppState {
  snapshot: AppSnapshot | null
  group: GroupId
  filters: Filters
  /** Ids mid tear-off animation; hidden from lists as soon as the animation ends. */
  leaving: Set<string>
  settingsOpen: boolean
  /** The ticket on the print sheet while the print dialog is open. */
  printing: Ticket | null

  removeTicket(id: string): Promise<void>
  printTicket(t: Ticket | null): void

  init(): () => void
  setGroup(g: GroupId): void
  setFilters(patch: Partial<Filters>): void
  clearFilters(): void
  setPaid(bill: Bill, paid: boolean): Promise<void>
  removeBill(id: string): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<void>
  scanNow(): Promise<void>
  setSettingsOpen(open: boolean): void
}

export const useApp = create<AppState>((set, get) => ({
  snapshot: null,
  group: 'due',
  filters: EMPTY_FILTERS,
  leaving: new Set(),
  settingsOpen: false,
  printing: null,

  async removeTicket(id) {
    await window.bills.deleteTicket(id)
  },
  printTicket: (printing) => set({ printing }),

  init() {
    void window.bills.getSnapshot().then((snapshot) => set({ snapshot }))
    return window.bills.onSnapshot((snapshot) => set({ snapshot }))
  },

  setGroup: (group) => set({ group, filters: EMPTY_FILTERS }),
  setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),
  clearFilters: () => set({ filters: EMPTY_FILTERS }),

  async setPaid(bill, paid) {
    const leaving = new Set(get().leaving).add(bill.id)
    set({ leaving })
    await new Promise((r) => setTimeout(r, 220))
    try {
      const updated = await window.bills.setPaid(bill.id, paid)
      const snap = get().snapshot
      if (snap) set({ snapshot: { ...snap, bills: snap.bills.map((b) => (b.id === updated.id ? updated : b)) } })
    } finally {
      const next = new Set(get().leaving)
      next.delete(bill.id)
      set({ leaving: next })
    }
  },

  async removeBill(id) {
    await window.bills.deleteBill(id)
  },

  async updateSettings(patch) {
    const settings = await window.bills.updateSettings(patch)
    const snap = get().snapshot
    if (snap) set({ snapshot: { ...snap, settings } })
  },

  async scanNow() {
    await window.bills.scanNow()
  },

  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}))
