import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, CornerDownLeft, CreditCard, Landmark, PiggyBank, Search, TrendingUp } from 'lucide-react'
import { useAppState } from '../../store/AppStore'
import { Modal } from '../ui/Modal'
import { TextInput } from '../ui/Field'
import { formatCurrency } from '../../lib/format'
import { formatDate } from '../../lib/date'
import { ALL_NAV_ITEMS } from './nav'
import { cn } from '../../lib/cn'

interface Result {
  id: string
  title: string
  meta: string
  href: string
  group: string
  icon: typeof Search
}

/**
 * Command palette. Searches the ledger and every tracked entity, so "bali" or
 * "hdfc" jumps straight to the goal or the card rather than making the user
 * guess which page owns it.
 */
export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useAppState()
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      return ALL_NAV_ITEMS.map((item) => ({
        id: `nav-${item.path}`,
        title: item.label,
        meta: item.description,
        href: `#${item.path}`,
        group: 'Go to',
        icon: item.icon,
      }))
    }

    const out: Result[] = []

    for (const item of ALL_NAV_ITEMS) {
      if (item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)) {
        out.push({ id: `nav-${item.path}`, title: item.label, meta: item.description, href: `#${item.path}`, group: 'Go to', icon: item.icon })
      }
    }

    for (const goal of state.goals) {
      if (goal.name.toLowerCase().includes(q)) {
        out.push({ id: goal.id, title: goal.name, meta: `Goal · ${formatCurrency(goal.saved)} of ${formatCurrency(goal.target)}`, href: '#/savings', group: 'Savings', icon: PiggyBank })
      }
    }
    for (const inv of state.investments) {
      if (inv.name.toLowerCase().includes(q) || inv.type.toLowerCase().includes(q)) {
        out.push({ id: inv.id, title: inv.name, meta: `${inv.type} · ${formatCurrency(inv.currentValue)}`, href: '#/investments', group: 'Investments', icon: TrendingUp })
      }
    }
    for (const loan of state.loans) {
      if (loan.name.toLowerCase().includes(q) || loan.lender.toLowerCase().includes(q)) {
        out.push({ id: loan.id, title: loan.name, meta: `${loan.lender} · ${formatCurrency(loan.paymentAmount)}/mo`, href: '#/loans', group: 'Loans', icon: Landmark })
      }
    }
    for (const card of state.cards) {
      if (card.name.toLowerCase().includes(q) || card.issuer.toLowerCase().includes(q)) {
        out.push({ id: card.id, title: card.name, meta: `${card.issuer} · ${formatCurrency(card.outstanding)} due`, href: '#/cards', group: 'Cards', icon: CreditCard })
      }
    }

    const matches = state.transactions
      .filter((t) => `${t.note} ${t.category} ${t.method}`.toLowerCase().includes(q))
      .slice(0, 8)
    for (const t of matches) {
      out.push({
        id: t.id,
        title: t.note,
        meta: `${t.category} · ${formatDate(t.date)} · ${t.type === 'income' ? '+' : '−'}${formatCurrency(t.amount)}`,
        href: `#/transactions?q=${encodeURIComponent(t.note)}`,
        group: 'Transactions',
        icon: ArrowLeftRight,
      })
    }

    return out.slice(0, 24)
  }, [query, state])

  const grouped = useMemo(() => {
    const map = new Map<string, Result[]>()
    for (const result of results) {
      const list = map.get(result.group) ?? []
      list.push(result)
      map.set(result.group, list)
    }
    return [...map.entries()]
  }, [results])

  const go = (href: string) => {
    window.location.hash = href.replace(/^#/, '')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Search" description="Find a transaction, goal, investment, loan or page.">
      <div className="flex flex-col gap-4">
        <TextInput
          autoFocus
          value={query}
          placeholder="Search everything…"
          leading={<Search className="h-4 w-4" />}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && results[0]) go(results[0].href)
          }}
        />

        {results.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted">
            Nothing matched “{query}”.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {grouped.map(([group, items]) => (
              <div key={group}>
                <p className="mb-1 px-1 text-[11px] font-medium tracking-wide text-muted uppercase">{group}</p>
                <ul className="flex flex-col">
                  {items.map((result, index) => {
                    const Icon = result.icon
                    const isFirst = results[0]?.id === result.id && index === 0
                    return (
                      <li key={`${group}-${result.id}`}>
                        <button
                          type="button"
                          onClick={() => go(result.href)}
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-2"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-secondary">
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-ink">{result.title}</span>
                            <span className="block truncate text-[12px] text-muted">{result.meta}</span>
                          </span>
                          <CornerDownLeft
                            className={cn('h-3.5 w-3.5 shrink-0 text-muted', !isFirst && 'opacity-0')}
                            aria-hidden="true"
                          />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
