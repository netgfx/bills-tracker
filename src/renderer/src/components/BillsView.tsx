import { AlertTriangle, MailCheck, SearchX } from 'lucide-react'
import type { Bill } from '@shared/types'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { BillStub } from '@/components/BillStub'
import { SearchBar } from '@/components/SearchBar'
import {
  GROUPS,
  URGENCY_LABEL,
  applyFilters,
  formatTotal,
  hasFilters,
  inGroup,
  payable,
  payableTotal,
  sortByDue,
  sortByPaid,
  urgencyOf,
  type Urgency,
} from '@/lib/bills'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/useApp'

const ORDER: Urgency[] = ['overdue', 'soon', 'week', 'later', 'undated', 'nothing']

function Grid({ bills }: { bills: Bill[] }) {
  return <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">{bills.map((b) => <BillStub key={b.id} bill={b} />)}</div>
}

function Section({ title, bills, tone }: { title: string; bills: Bill[]; tone?: Urgency }) {
  const total = payableTotal(bills)
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-baseline gap-3 text-[15px] font-semibold">
        <span className={cn(tone === 'overdue' && 'text-overdue', tone === 'soon' && 'text-soon')}>{title}</span>
        <span className="text-[13px] font-normal text-ink-muted">
          {bills.length} {bills.length === 1 ? 'bill' : 'bills'}
          {total > 0 && `, ${formatTotal(total)}`}
        </span>
      </h2>
      <Grid bills={bills} />
    </section>
  )
}

function headline(group: string, bills: Bill[]): string {
  if (group === 'paid') return bills.length ? `${bills.length} paid ${bills.length === 1 ? 'bill' : 'bills'}` : 'Nothing paid yet'
  const due = payable(bills)
  if (!due.length) return 'Nothing to pay here'
  const verb = group === 'auto' ? 'will be charged' : 'to pay'
  return `${formatTotal(payableTotal(due))} ${verb} across ${due.length} ${due.length === 1 ? 'bill' : 'bills'}`
}

export function BillsView() {
  const { snapshot, group, filters, leaving, clearFilters, scanNow } = useApp()
  const all = snapshot?.bills ?? []
  const searching = hasFilters(filters)
  const meta = GROUPS.find((g) => g.id === group)!

  let body: React.ReactNode
  let title: string
  let sub: string

  if (searching) {
    const results = applyFilters(all, filters).sort((a, b) =>
      a.status === b.status ? sortByDue(a, b) : a.status === 'unpaid' ? -1 : 1,
    )
    title = `${results.length} ${results.length === 1 ? 'result' : 'results'}`
    sub = filters.query ? `Searching every bill, paid or not, for “${filters.query}”` : 'Every bill, paid or not, that matches your filters'
    const unpaid = results.filter((b) => b.status === 'unpaid')
    const paid = results.filter((b) => b.status === 'paid')
    body = results.length ? (
      <>
        {unpaid.length > 0 && <Section title="Not paid" bills={unpaid} />}
        {paid.length > 0 && <Section title="Paid" bills={paid} />}
      </>
    ) : (
      <Empty icon={SearchX} title="No bills match" text="Try a vendor name, part of a payment code, or widen the dates.">
        <Button variant="outline" onClick={clearFilters}>
          Clear search
        </Button>
      </Empty>
    )
  } else {
    const items = all.filter((b) => inGroup(b, group) || leaving.has(b.id))
    title = meta.label
    sub = headline(group, items.filter((b) => !leaving.has(b.id)))
    if (group === 'paid') {
      body = items.length ? (
        <Grid bills={items.sort(sortByPaid)} />
      ) : (
        <Empty icon={MailCheck} title="No paid bills yet" text="Bills you mark as paid move here, so you can always find a past payment code." />
      )
    } else if (!items.length) {
      const last = snapshot?.scan.lastScan
      body = snapshot?.scan.running ? (
        <Empty icon={MailCheck} title="Checking your email" text="Bills show up here as soon as the check finishes. This takes a minute or two." />
      ) : last && !last.ok && !all.length ? (
        <Empty icon={AlertTriangle} title="Couldn’t check your email" text={`${last.error ?? 'The last check failed.'} Bills Tracker will try again automatically.`}>
          <Button variant="outline" onClick={() => void scanNow()}>
            Try again now
          </Button>
        </Empty>
      ) : last ? (
        <Empty icon={MailCheck} title="You’re all caught up" text={`No unpaid ${group === 'due' ? '' : meta.label.toLowerCase() + ' '}bills in your email. New ones show up here after each check.`} />
      ) : (
        <Empty icon={MailCheck} title="Your first check is on its way" text="Bills Tracker is reading your recent email. This takes a minute or two.">
          <Button variant="outline" onClick={() => void scanNow()} disabled={snapshot?.scan.running}>
            Check now
          </Button>
        </Empty>
      )
    } else {
      const sorted = items.sort(sortByDue)
      body = ORDER.map((u) => {
        const bucket = sorted.filter((b) => urgencyOf(b) === u)
        if (!bucket.length) return null
        const label = group === 'auto' && u === 'overdue' ? 'Already charged' : URGENCY_LABEL[u]
        return <Section key={u} title={label} bills={bucket} tone={group === 'auto' ? undefined : u} />
      })
    }
  }

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col">
      <div className="border-b border-rule px-8 pb-5 pt-6">
        <SearchBar />
        <BlockedBanner />
        <div className="mt-6">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{title}</h1>
          <p className="mt-1 text-[15px] text-ink-muted">{sub}</p>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-8 px-8 py-6">{body}</div>
      </ScrollArea>
    </main>
  )
}

function BlockedBanner() {
  const blocked = useApp((s) => s.snapshot?.scan.blocked)
  if (!blocked) return null
  return (
    <div role="alert" className="mt-4 flex items-center gap-3 rounded-md border border-overdue/30 bg-overdue-wash px-4 py-3 text-[14px]">
      <AlertTriangle className="size-4 shrink-0 text-overdue" />
      <p className="flex-1">
        {blocked === 'auth'
          ? 'Your Claude sign-in expired, so email checks are paused.'
          : 'Gmail is no longer connected to your Claude account, so email checks are paused.'}
      </p>
      {blocked === 'auth' ? (
        <Button size="sm" onClick={() => void window.bills.logout()}>
          Sign in again
        </Button>
      ) : (
        <Button size="sm" onClick={() => void window.bills.openExternal('https://claude.ai/settings/connectors')}>
          Reconnect Gmail
        </Button>
      )}
    </div>
  )
}

function Empty({
  icon: Icon,
  title,
  text,
  children,
}: {
  icon: typeof MailCheck
  title: string
  text: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-rule px-8 py-10">
      <Icon className="size-6 text-ink-muted" />
      <div>
        <p className="text-base font-semibold">{title}</p>
        <p className="mt-1 max-w-[52ch] text-ink-muted">{text}</p>
      </div>
      {children}
    </div>
  )
}
