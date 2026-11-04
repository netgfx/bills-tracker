import { Archive, Flame, Inbox, Lightbulb, Loader2, Receipt, RefreshCw, Repeat, Settings, Smartphone, X } from 'lucide-react'
import type { Bill } from '@shared/types'
import { Button } from '@/components/ui/button'
import { GROUPS, formatDate, formatTotal, inGroup, payable, payableTotal, urgencyOf, type GroupId } from '@/lib/bills'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/useApp'

const ICONS: Record<GroupId, typeof Inbox> = {
  due: Inbox,
  electricity: Lightbulb,
  phone: Smartphone,
  gas: Flame,
  other: Receipt,
  auto: Repeat,
  paid: Archive,
}

function relativeTime(iso: string) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.round(mins / 60)
  if (h < 24) return `${h} h ago`
  return formatDate(iso)
}

function timeOf(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const t = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === today.toDateString() ? `today at ${t}` : `${formatDate(iso)} at ${t}`
}

export function Sidebar() {
  const { snapshot, group, setGroup, filters, setSettingsOpen, scanNow } = useApp()
  const bills = snapshot?.bills ?? []
  const scan = snapshot?.scan
  const searching = Boolean(filters.query || filters.from || filters.to || filters.min != null || filters.max != null)

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-rule bg-slip/60">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <Logo />
        <span className="text-[15px] font-semibold tracking-tight">Bills Tracker</span>
      </div>

      <nav aria-label="Bill groups" className="flex flex-col gap-0.5 px-3">
        {GROUPS.map((g, i) => {
          // Counts show bills that need paying; zero statements are visible in the group but not counted.
          const items = bills.filter((b) => inGroup(b, g.id))
          const count = g.id === 'paid' ? items.length : payable(items).length
          const overdue = g.id !== 'paid' && items.some((b) => urgencyOf(b) === 'overdue')
          const Icon = ICONS[g.id]
          const active = group === g.id && !searching
          return (
            <div key={g.id}>
              {(g.id === 'electricity' || g.id === 'auto') && <div className="mx-2 my-2 h-px bg-rule" />}
              <button
                type="button"
                onClick={() => setGroup(g.id)}
                title={g.hint}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-[14px] transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                  active ? 'bg-accent font-semibold text-ink' : 'text-ink-muted hover:bg-accent/60 hover:text-ink',
                  i === 0 && 'text-[15px]',
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1 truncate">{g.label}</span>
                {overdue && <span className="size-2 rounded-full bg-overdue" aria-label="has overdue bills" />}
                {g.id !== 'paid' && count > 0 && (
                  <span className="min-w-6 text-right text-[13px] tabular-nums">{count}</span>
                )}
              </button>
            </div>
          )
        })}
      </nav>

      <DueSummary bills={bills} />

      <div className="mt-auto border-t border-rule px-4 py-4">
        {scan?.running ? (
          <div className="mb-3 flex items-start gap-2 text-[13px]">
            <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-stamp" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Checking your email</p>
              <p className="truncate text-ink-muted">{scan.phase ?? 'Starting'}</p>
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Stop checking"
              title="Stop checking"
              onClick={() => void window.bills.cancelScan()}
            >
              <X />
            </Button>
          </div>
        ) : (
          <div className="mb-3 text-[13px] leading-snug text-ink-muted">
            {scan?.lastScan ? (
              scan.lastScan.ok ? (
                <p>Checked {relativeTime(scan.lastScan.finishedAt ?? scan.lastScan.startedAt)}</p>
              ) : (
                <p className="line-clamp-3 text-overdue" title={scan.lastScan.error ?? undefined}>
                  Last check failed: {scan.lastScan.error}
                </p>
              )
            ) : (
              <p>Not checked yet</p>
            )}
            {scan?.nextScanAt && <p>Next check {timeOf(scan.nextScanAt)}</p>}
          </div>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={scan?.running}
            onClick={() => void scanNow()}
          >
            <RefreshCw /> Check now
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Settings" title="Settings" onClick={() => setSettingsOpen(true)}>
            <Settings />
          </Button>
        </div>
      </div>
    </aside>
  )
}

function DueSummary({ bills }: { bills: Bill[] }) {
  const week = bills.filter((b) => inGroup(b, 'due') && b.dueDate && ['overdue', 'soon', 'week'].includes(urgencyOf(b)))
  if (!week.length) return null
  const total = payableTotal(week)
  return (
    <div className="mx-4 mt-5 rounded-md bg-paper px-3 py-2.5 text-[13px] leading-snug">
      <p className="text-ink-muted">
        {week.some((b) => urgencyOf(b) === 'overdue') ? 'Overdue or due within 7 days' : 'Due within 7 days'}
      </p>
      <p className="text-lg font-semibold">{formatTotal(total)}</p>
    </div>
  )
}

export function Logo({ className }: { className?: string }) {
  // A payment stub with its tear line, matching the cards.
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7', className)} aria-hidden>
      <rect x="2" y="6" width="28" height="20" rx="4" fill="var(--stamp)" />
      <path d="M21 6v20" stroke="var(--slip)" strokeWidth="2" strokeDasharray="2.5 2.5" />
      <rect x="6" y="11" width="10" height="2.5" rx="1.25" fill="var(--slip)" />
      <rect x="6" y="17" width="6" height="2.5" rx="1.25" fill="var(--slip)" opacity=".7" />
      <circle cx="21" cy="6" r="2.4" fill="var(--paper)" />
      <circle cx="21" cy="26" r="2.4" fill="var(--paper)" />
    </svg>
  )
}
