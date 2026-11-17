import { History, Ticket as TicketIcon } from 'lucide-react'
import type { Ticket } from '@shared/types'
import { sortTickets } from '@shared/ticket'
import { ScrollArea } from '@/components/ui/scroll-area'
import { BlockedBanner, Empty } from '@/components/BillsView'
import { SearchBar } from '@/components/SearchBar'
import { TicketCard } from '@/components/TicketCard'
import { TICKET_GROUPS, TICKET_WHEN_LABEL, inTicketGroup, ticketWhen, type TicketGroupId, type TicketWhen } from '@/lib/tickets'
import { useApp } from '@/store/useApp'

const ORDER: TicketWhen[] = ['today', 'week', 'later', 'undated']

function Grid({ tickets }: { tickets: Ticket[] }) {
  return <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">{tickets.map((t) => <TicketCard key={t.id} ticket={t} />)}</div>
}

function count(n: number) {
  return `${n} ${n === 1 ? 'ticket or booking' : 'tickets and bookings'}`
}

export function TicketsView() {
  const { snapshot, group } = useApp()
  const g = group as TicketGroupId
  const meta = TICKET_GROUPS.find((x) => x.id === g)!
  const items = (snapshot?.tickets ?? []).filter((t) => inTicketGroup(t, g))
  const past = g === 'tickets-past'
  const sorted = [...items].sort((a, b) => sortTickets(a, b, past))
  const live = items.filter((t) => !t.cancelled).length

  let body: React.ReactNode
  if (!items.length) {
    body = past ? (
      <Empty icon={History} title="Nothing here yet" text="Tickets and bookings move here once the show or stay is over." />
    ) : (
      <Empty
        icon={TicketIcon}
        title="No upcoming tickets"
        text="Confirmation emails for theater, cinema, concerts and hotel stays show up here after each check, with their codes, links and attached tickets."
      />
    )
  } else if (past) {
    body = <Grid tickets={sorted} />
  } else {
    body = ORDER.map((w) => {
      const bucket = sorted.filter((t) => ticketWhen(t) === w)
      if (!bucket.length) return null
      return (
        <section key={w} className="flex flex-col gap-3">
          <h2 className="flex items-baseline gap-3 text-[15px] font-semibold">
            <span className={w === 'today' ? 'text-soon' : undefined}>{TICKET_WHEN_LABEL[w]}</span>
            <span className="text-[13px] font-normal text-ink-muted">{count(bucket.length)}</span>
          </h2>
          <Grid tickets={bucket} />
        </section>
      )
    })
  }

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col">
      <div className="border-b border-rule px-8 pb-5 pt-6">
        <SearchBar />
        <BlockedBanner />
        <div className="mt-6">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{past ? 'Past tickets' : 'Upcoming tickets'}</h1>
          <p className="mt-1 text-[15px] text-ink-muted">{items.length ? count(past ? items.length : live) : meta.hint}</p>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-8 px-8 py-6">{body}</div>
      </ScrollArea>
    </main>
  )
}
