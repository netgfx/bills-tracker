import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Archive, Check, Copy, ExternalLink, Flame, Lightbulb, Mail, MoreHorizontal, Repeat, Smartphone, Trash2, Undo2, Receipt } from 'lucide-react'
import type { Bill, BillCategory } from '@shared/types'
import { isValidRf, looksLikeRf } from '@shared/rf'
import { gmailEmailUrl } from '@shared/bill'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  amountForClipboard,
  duePhrase,
  formatAmount,
  isNothingToPay,
  formatDate,
  groupRf,
  rfForClipboard,
  urgencyOf,
  type Urgency,
} from '@/lib/bills'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/useApp'

const CATEGORY: Record<BillCategory, { label: string; icon: typeof Lightbulb; color: string }> = {
  electricity: { label: 'Electricity', icon: Lightbulb, color: 'var(--cat-electricity)' },
  phone: { label: 'Phone & internet', icon: Smartphone, color: 'var(--cat-phone)' },
  gas: { label: 'Gas', icon: Flame, color: 'var(--cat-gas)' },
  other: { label: 'Other', icon: Receipt, color: 'var(--cat-other)' },
}

const URGENCY_STYLE: Record<Urgency, { edge: string; text: string; wash: string }> = {
  overdue: { edge: 'bg-overdue', text: 'text-overdue', wash: 'bg-overdue-wash' },
  soon: { edge: 'bg-soon', text: 'text-soon', wash: 'bg-soon-wash' },
  week: { edge: 'bg-soon/50', text: 'text-soon', wash: 'bg-transparent' },
  later: { edge: 'bg-later', text: 'text-later', wash: 'bg-transparent' },
  undated: { edge: 'bg-rule', text: 'text-ink-muted', wash: 'bg-transparent' },
  nothing: { edge: 'bg-rule', text: 'text-ink-muted', wash: 'bg-transparent' },
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  async function copy(key: string, text: string, label: string) {
    await window.bills.copyText(text)
    setCopied(key)
    toast.success(`${label} copied`, { description: text, duration: 1800 })
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400)
  }
  return { copied, copy }
}

function Stamp() {
  return (
    <span
      aria-hidden
      className="stamp pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border-2 border-stamp px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-stamp"
    >
      Copied
    </span>
  )
}

/** A small labelled value from the bill, copied on click: customer code, account number. */
function DetailCopy({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <button
      type="button"
      onClick={onCopy}
      title={`Copy ${label.toLowerCase()}`}
      className="group/detail -ml-1.5 inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="text-ink-muted">{label}</span>
      <span className="rf-code truncate font-semibold">{value}</span>
      {copied ? (
        <Check className="size-3.5 shrink-0 text-stamp" />
      ) : (
        <Copy className="size-3.5 shrink-0 text-ink-muted opacity-0 transition-opacity group-hover/detail:opacity-100" />
      )}
    </button>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function BillStub({ bill }: { bill: Bill }) {
  const { setPaid, removeBill, leaving } = useApp()
  const { copied, copy } = useCopy()
  const cat = CATEGORY[bill.category]
  const urgency = bill.status === 'paid' ? 'undated' : urgencyOf(bill)
  const u = URGENCY_STYLE[urgency]
  const paid = bill.status === 'paid'
  const nothing = isNothingToPay(bill)
  const Icon = cat.icon
  const emailUrl = gmailEmailUrl(bill)
  // Older scans sometimes put the customer code in the account field too; show it once.
  const accountNumber = bill.accountNumber && bill.accountNumber !== bill.customerCode ? bill.accountNumber : null

  async function togglePaid() {
    await setPaid(bill, !paid)
    const done = nothing ? `${bill.vendor} archived` : `${bill.vendor} marked as paid`
    toast(paid ? `${bill.vendor} moved back to To pay` : done, {
      action: { label: 'Undo', onClick: () => void setPaid(bill, paid) },
    })
  }

  return (
    <article
      aria-label={`${bill.vendor}, ${formatAmount(bill)}, ${duePhrase(bill)}`}
      className={cn(
        'group/stub relative grid grid-cols-[1fr_17rem] overflow-visible rounded-lg border border-rule bg-slip',
        leaving.has(bill.id) && 'tearing',
        paid && 'opacity-80',
      )}
    >
      {/* Urgency edge: the first thing the eye catches when scanning a column of bills. */}
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1 rounded-l-lg', u.edge)} />

      <div className="flex min-w-0 flex-col gap-3 py-4 pl-5 pr-4">
        <header className="flex items-start gap-3">
          <span
            className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md"
            style={{ background: `color-mix(in oklab, ${cat.color} 16%, transparent)`, color: cat.color }}
            title={cat.label}
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold leading-tight">{bill.vendor}</h3>
            <p className="truncate text-[13px] text-ink-muted">
              {bill.billingPeriod ? `Period ${bill.billingPeriod}` : cat.label}
              {bill.isAutomaticPayment && (
                <span className="ml-2 inline-flex items-center gap-1 text-[color:var(--cat-auto)]">
                  <Repeat className="size-3" /> Automatic
                </span>
              )}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="-mr-2 -mt-1 text-ink-muted" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {emailUrl && (
                <DropdownMenuItem onSelect={() => void window.bills.openExternal(emailUrl)}>
                  <Mail /> Open email in Gmail
                </DropdownMenuItem>
              )}
              {bill.paymentUrl && (
                <DropdownMenuItem onSelect={() => void copy('payurl', bill.paymentUrl!, 'Payment link')}>
                  <Copy /> Copy payment link
                </DropdownMenuItem>
              )}
              {(emailUrl || bill.paymentUrl) && <DropdownMenuSeparator />}
              <DropdownMenuItem
                variant="destructive"
                onSelect={async () => {
                  await removeBill(bill.id)
                  toast(`Removed ${bill.vendor}`, { description: 'It won’t come back on the next scan.' })
                }}
              >
                <Trash2 /> Not a bill, remove it
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <div className="flex items-end justify-between gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={bill.amount == null}
                onClick={() => bill.amount != null && void copy('amount', amountForClipboard(bill.amount), 'Amount')}
                className="relative -ml-1.5 rounded-md px-1.5 py-0.5 text-left text-[28px] font-semibold leading-none tracking-tight transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:text-xl disabled:font-medium disabled:text-ink-muted"
              >
                {formatAmount(bill)}
                {copied === 'amount' && <Stamp />}
              </button>
            </TooltipTrigger>
            {bill.amount != null && <TooltipContent>Click to copy the amount</TooltipContent>}
          </Tooltip>
          <div className="text-right">
            <p className={cn('rounded px-1.5 text-[13px] font-semibold', !paid && u.text, !paid && u.wash)}>
              {!paid
                ? duePhrase(bill)
                : bill.paidSource === 'auto'
                  ? bill.isAutomaticPayment
                    ? `Charged ${formatDate(bill.paidAt)}`
                    : 'Replaced by a newer bill'
                  : nothing
                    ? `Archived ${formatDate(bill.paidAt)}`
                    : `Paid ${formatDate(bill.paidAt)}`}
            </p>
            {bill.dueDate && (
              <p className="text-[13px] text-ink-muted">{paid ? `Was due ${formatDate(bill.dueDate)}` : formatDate(bill.dueDate)}</p>
            )}
          </div>
        </div>

        {/* Everything else from the email you might need to pay, so there's no reason to go back to it. */}
        {(bill.customerCode || accountNumber || emailUrl) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
            {bill.customerCode && (
              <DetailCopy
                label="Customer code"
                value={bill.customerCode}
                copied={copied === 'cust'}
                onCopy={() => void copy('cust', bill.customerCode!, 'Customer code')}
              />
            )}
            {accountNumber && (
              <DetailCopy
                label="Account"
                value={accountNumber}
                copied={copied === 'acct'}
                onCopy={() => void copy('acct', accountNumber, 'Account number')}
              />
            )}
            {emailUrl && (
              <button
                type="button"
                onClick={() => void window.bills.openExternal(emailUrl)}
                className="-ml-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-ink-muted transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Mail className="size-3.5" /> View email
              </button>
            )}
          </div>
        )}

        {bill.notes && <p className="text-[13px] leading-snug text-ink-muted">{bill.notes}</p>}
      </div>

      {/* The tear-off payment stub: what you need at the bank, nothing else. */}
      <div className="perforation flex flex-col justify-between gap-3 py-4 pl-5 pr-4">
        <div>
          <p className="mb-1 text-[12px] text-ink-muted">Payment code</p>
          {bill.rfCode ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => void copy('rf', rfForClipboard(bill.rfCode!), 'Payment code')}
                  className="rf-code group/rf relative -ml-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2 rounded-md px-1.5 py-1 text-left text-[15px] font-semibold transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className="break-normal">{groupRf(bill.rfCode)}</span>
                  <Copy className="size-3.5 shrink-0 text-ink-muted opacity-0 transition-opacity group-hover/rf:opacity-100" />
                  {copied === 'rf' && <Stamp />}
                </button>
              </TooltipTrigger>
              <TooltipContent>Click to copy without spaces</TooltipContent>
            </Tooltip>
          ) : null}
          {bill.rfCode && looksLikeRf(bill.rfCode) && !isValidRf(bill.rfCode) && (
            <p className="mt-1 flex items-start gap-1.5 text-[12px] leading-snug text-soon">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              This code fails the RF check. Compare it with the email before paying.
            </p>
          )}
          {!bill.rfCode && (
            <p className="text-[13px] text-ink-muted">
              {bill.isAutomaticPayment ? 'Not needed, charged automatically' : 'None in the email'}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {bill.paymentUrl && !paid && !nothing && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void window.bills.openPaymentLink(bill.id).catch(() => toast.error('Couldn’t open the payment link'))
                  }
                  className="w-full"
                >
                  <ExternalLink /> Pay online
                  <span className="min-w-0 truncate font-normal text-ink-muted">{hostOf(bill.paymentUrl)}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-80 break-all">{bill.paymentUrl}</TooltipContent>
            </Tooltip>
          )}
          <Button
            size="sm"
            variant={paid ? 'outline' : bill.isAutomaticPayment || nothing ? 'secondary' : 'default'}
            onClick={() => void togglePaid()}
            className="w-full"
          >
            {paid ? (
              <>
                <Undo2 /> {nothing ? 'Move back' : 'Mark as unpaid'}
              </>
            ) : nothing ? (
              <>
                <Archive /> Archive
              </>
            ) : (
              <>
                <Check /> Mark as paid
              </>
            )}
          </Button>
        </div>
      </div>
    </article>
  )
}
