import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BillsView } from '@/components/BillsView'
import { Onboarding } from '@/components/Onboarding'
import { SettingsDialog } from '@/components/SettingsDialog'
import { Sidebar } from '@/components/Sidebar'
import { useApp } from '@/store/useApp'

export function App() {
  const init = useApp((s) => s.init)
  const snapshot = useApp((s) => s.snapshot)

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
          <BillsView />
          <SettingsDialog />
        </div>
      )}
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
