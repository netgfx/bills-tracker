import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BillsView } from '@/components/BillsView'
import { Onboarding } from '@/components/Onboarding'
import { PrintSheet } from '@/components/PrintSheet'
import { SettingsDialog } from '@/components/SettingsDialog'
import { Sidebar } from '@/components/Sidebar'
import { TicketsView } from '@/components/TicketsView'
import { hasFilters } from '@/lib/bills'
import { isTicketGroup } from '@/lib/tickets'
import { useApp } from '@/store/useApp'

export function App() {
  const init = useApp((s) => s.init)
  const snapshot = useApp((s) => s.snapshot)
  // Search covers bills, so typing in the tickets area shows bill results.
  const tickets = useApp((s) => isTicketGroup(s.group) && !hasFilters(s.filters))

  useEffect(() => init(), [init])

  return (
    <TooltipProvider delayDuration={400}>
      {!snapshot ? (
        <div className="grid h-full place-items-center">
          <Loader2 className="size-6 animate-spin text-ink-muted" />
        </div>
      ) : !snapshot.onboarded ? (
        <Onboarding />
      ) : (
        <div className="flex h-full">
          <Sidebar />
          {tickets ? <TicketsView /> : <BillsView />}
          <SettingsDialog />
          <PrintSheet />
        </div>
      )}
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
