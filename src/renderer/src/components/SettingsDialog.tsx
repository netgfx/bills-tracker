import { useEffect, useState } from 'react'
import { LogOut, Plus, X } from 'lucide-react'
import type { AuthStatus } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { useApp } from '@/store/useApp'

function Row({ id, title, text, children }: { id?: string; title: string; text?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-[14px] font-medium">
          {title}
        </Label>
        {text && <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">{text}</p>}
      </div>
      {children}
    </div>
  )
}

export function SettingsDialog() {
  const { settingsOpen, setSettingsOpen, snapshot, updateSettings } = useApp()
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const s = snapshot?.settings

  useEffect(() => {
    if (settingsOpen) void window.bills.authStatus().then(setAuth)
  }, [settingsOpen])

  if (!s) return null

  const setTime = (i: number, v: string) => {
    const next = [...s.scanTimes]
    next[i] = v
    void updateSettings({ scanTimes: next })
  }

  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Changes save as you make them.</DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-rule">
          <Row title="Check email at" text="Missed checks run when your PC wakes up or the app starts.">
            <div className="flex flex-col items-end gap-2">
              {s.scanTimes.map((t, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input
                    type="time"
                    aria-label={`Check time ${i + 1}`}
                    value={t}
                    onChange={(e) => e.target.value && setTime(i, e.target.value)}
                    className="h-8 w-28"
                  />
                  {s.scanTimes.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove this time"
                      onClick={() => void updateSettings({ scanTimes: s.scanTimes.filter((_, j) => j !== i) })}
                    >
                      <X />
                    </Button>
                  )}
                </div>
              ))}
              {s.scanTimes.length < 4 && (
                <Button variant="ghost" size="sm" onClick={() => void updateSettings({ scanTimes: [...s.scanTimes, '14:00'] })}>
                  <Plus /> Add a time
                </Button>
              )}
            </div>
          </Row>

          <Row id="login" title="Start with Windows" text="Opens quietly in the tray when you sign in to Windows.">
            <Switch id="login" checked={s.openAtLogin} onCheckedChange={(v) => void updateSettings({ openAtLogin: v })} />
          </Row>

          <Row id="receipts" title="Mark bills paid from receipts" text="When a payment confirmation email matches a bill, move it to Paid.">
            <Switch
              id="receipts"
              checked={s.autoMarkPaidFromReceipts}
              onCheckedChange={(v) => void updateSettings({ autoMarkPaidFromReceipts: v })}
            />
          </Row>

          <Row id="notify" title="Remind me" text="Days before a due date to show a Windows notification.">
            <Input
              id="notify"
              type="number"
              min={0}
              max={14}
              value={s.notifyDaysBefore}
              onChange={(e) => void updateSettings({ notifyDaysBefore: Math.max(0, Math.min(14, Number(e.target.value) || 0)) })}
              className="h-8 w-20"
            />
          </Row>

          <Row id="lookback" title="First check looks back" text="Days of email to read the first time.">
            <Input
              id="lookback"
              type="number"
              min={7}
              max={365}
              value={s.firstScanLookbackDays}
              onChange={(e) =>
                void updateSettings({ firstScanLookbackDays: Math.max(7, Math.min(365, Number(e.target.value) || 60)) })
              }
              className="h-8 w-20"
            />
          </Row>
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 text-[13px]">
            <p className="font-medium">Claude account</p>
            <p className="truncate text-ink-muted">
              {auth?.email ? `${auth.email}${auth.subscriptionType ? `, ${auth.subscriptionType} plan` : ''}` : 'Checking…'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSettingsOpen(false)
              void window.bills.logout()
            }}
          >
            <LogOut /> Sign out
          </Button>
        </div>
        <p className="text-[12px] text-ink-muted">Version {snapshot?.appVersion}</p>
      </DialogContent>
    </Dialog>
  )
}
