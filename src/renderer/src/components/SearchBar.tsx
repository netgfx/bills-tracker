import { useEffect, useRef, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { CalendarRange, Euro, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDate, formatTotal } from '@/lib/bills'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/useApp'

function toYmd(d: Date | undefined): string | null {
  if (!d) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fromYmd(s: string | null): Date | undefined {
  return s ? new Date(`${s}T12:00:00`) : undefined
}

export function SearchBar() {
  const { filters, setFilters, clearFilters } = useApp()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const focus = () => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    // The main process catches Ctrl+F first; this covers key events that reach the page directly.
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    const off = window.bills.onFocusSearch(focus)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      off()
    }
  }, [])

  const range: DateRange | undefined = filters.from || filters.to ? { from: fromYmd(filters.from), to: fromYmd(filters.to) } : undefined
  const hasDate = Boolean(filters.from || filters.to)
  const hasPrice = filters.min != null || filters.max != null
  const anything = Boolean(filters.query || hasDate || hasPrice)

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
        <Input
          ref={inputRef}
          type="search"
          value={filters.query}
          onChange={(e) => setFilters({ query: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              clearFilters()
              inputRef.current?.blur()
            }
          }}
          placeholder="Search vendor, payment code, amount or account number"
          aria-label="Search all bills, including paid ones"
          className="h-10 bg-slip pl-9 pr-20 text-[14px] [&::-webkit-search-cancel-button]:hidden"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-rule bg-paper px-1.5 py-0.5 text-[11px] text-ink-muted">
          Ctrl F
        </kbd>
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn('h-10 bg-slip', hasDate && 'border-stamp text-stamp')}>
            <CalendarRange />
            {hasDate ? `${formatDate(filters.from) || 'Any'} to ${formatDate(filters.to) || 'any'}` : 'Dates'}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <div className="border-b border-rule px-4 py-3 text-[13px] text-ink-muted">
            Filters by due date, or by email date when a bill has none.
          </div>
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={range}
            defaultMonth={range?.from ?? new Date(new Date().setMonth(new Date().getMonth() - 1))}
            onSelect={(r) => setFilters({ from: toYmd(r?.from), to: toYmd(r?.to) })}
            weekStartsOn={1}
          />
          {hasDate && (
            <div className="flex justify-end border-t border-rule px-3 py-2">
              <Button variant="ghost" size="sm" onClick={() => setFilters({ from: null, to: null })}>
                Clear dates
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <PriceFilter active={hasPrice} />

      {anything && (
        <Button variant="ghost" className="h-10" onClick={clearFilters}>
          <X /> Clear
        </Button>
      )}
    </div>
  )
}

function PriceFilter({ active }: { active: boolean }) {
  const { filters, setFilters } = useApp()
  const [min, setMin] = useState(filters.min?.toString() ?? '')
  const [max, setMax] = useState(filters.max?.toString() ?? '')

  useEffect(() => {
    setMin(filters.min?.toString() ?? '')
    setMax(filters.max?.toString() ?? '')
  }, [filters.min, filters.max])

  const parse = (s: string) => {
    const n = Number(s.replace(',', '.'))
    return s.trim() === '' || Number.isNaN(n) ? null : n
  }
  const label =
    filters.min != null && filters.max != null
      ? `${formatTotal(filters.min)} to ${formatTotal(filters.max)}`
      : filters.min != null
        ? `From ${formatTotal(filters.min)}`
        : filters.max != null
          ? `Up to ${formatTotal(filters.max)}`
          : 'Amount'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('h-10 bg-slip', active && 'border-stamp text-stamp')}>
          <Euro />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            setFilters({ min: parse(min), max: parse(max) })
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="min">From €</Label>
              <Input id="min" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder="0" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="max">To €</Label>
              <Input id="max" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Any" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {active && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setFilters({ min: null, max: null })}>
                Clear
              </Button>
            )}
            <Button type="submit" size="sm">
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
