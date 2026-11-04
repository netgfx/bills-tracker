import type { BillsApi } from '../shared/types'

declare global {
  interface Window {
    bills: BillsApi
  }
}

export {}
