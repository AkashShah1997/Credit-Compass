import { useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarClock,
  CreditCard as CreditCardIcon,
  Gauge,
  Pencil,
  Plus,
  Receipt,
  ShieldCheck,
  Trash2,
  Wallet,
  Wifi,
} from 'lucide-react'
import { useActions, useAppState } from '../store/AppStore'
import { useChartMode } from '../store/ThemeProvider'
import { useQuickAdd } from '../components/layout/AppShell'
import { cardIsPaid, cardUtilisation, sortByDateDesc, totalCardOutstanding } from '../lib/finance'
import {
  clampDayToMonth,
  currentMonthKey,
  daysUntil,
  formatDate,
  formatDateShort,
  monthLabel,
  nextDueDate,
  relativeDay,
  todayISO,
} from '../lib/date'
import { formatCompactCurrency, formatCurrency, formatPercent, maskCard } from '../lib/format'
import { seriesColor } from '../lib/palette'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Button, IconButton } from '../components/ui/Button'
import { StatTile } from '../components/ui/StatTile'
import { ProgressBar } from '../components/ui/Progress'
import { Badge, StatusBadge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { TableWrap, Td, Th, Tr } from '../components/ui/Table'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { CurrencyInput, Field, TextInput } from '../components/ui/Field'
import { useToast } from '../components/ui/Toast'
import { ChartFrame } from '../components/charts/ChartFrame'
import { ColumnChart } from '../components/charts/ColumnChart'
import { hrefFor } from '../hooks/useRouter'
import { cn } from '../lib/cn'
import type { CreditCard } from '../types'

/** The utilisation band credit bureaus actually reward. */
const HEALTHY_UTILISATION = 30

type UtilisationTone = 'good' | 'warning' | 'critical'

function utilisationTone(percent: number): UtilisationTone {
  if (percent < HEALTHY_UTILISATION) return 'good'
  if (percent < 70) return 'warning'
  return 'critical'
}

const UTILISATION_MESSAGE: Record<UtilisationTone, string> = {
  good: 'Healthy utilisation',
  warning: 'Creeping up — try to stay under 30%',
  critical: 'High utilisation — may affect your credit score',
}

/**
 * Every stop is mixed against a fixed near-black rather than a theme token: the
 * plastic has to hold white text at the same contrast in light *and* dark mode,
 * so it deliberately does not follow the surface.
 */
function cardGradient(hue: string): string {
  return [
    `linear-gradient(135deg,`,
    `color-mix(in oklab, ${hue} 80%, #090c13) 0%,`,
    `color-mix(in oklab, ${hue} 52%, #090c13) 54%,`,
    `color-mix(in oklab, ${hue} 26%, #090c13) 100%)`,
  ].join(' ')
}

function ordinal(day: number): string {
  const n = Math.round(day)
  const teen = n % 100
  if (teen >= 11 && teen <= 13) return `${n}th`
  const suffix = n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'
  return `${n}${suffix}`
}

interface BillRow {
  card: CreditCard
  /** The date this bill is actually owed on — see the overdue note below. */
  dueDate: string
  days: number
  paid: boolean
  overdue: boolean
}

export default function Cards() {
  const state = useAppState()
  const actions = useActions()
  const mode = useChartMode()
  const toast = useToast()
  const quickAdd = useQuickAdd()

  const [formCard, setFormCard] = useState<CreditCard | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [payTarget, setPayTarget] = useState<CreditCard | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CreditCard | null>(null)

  const cards = state.cards
  const month = currentMonthKey()

  /**
   * Colour follows the card, not its position in any sorted view — so the hue is
   * resolved once from the stored order and every later list reuses it.
   */
  const colorById = useMemo(() => {
    const map: Record<string, string> = {}
    cards.forEach((card, index) => {
      map[card.id] = seriesColor(index, mode)
    })
    return map
  }, [cards, mode])

  const totalOutstanding = useMemo(() => totalCardOutstanding(cards), [cards])
  const totalLimit = useMemo(() => cards.reduce((sum, card) => sum + card.creditLimit, 0), [cards])
  const totalMinimum = useMemo(
    () => cards.reduce((sum, card) => sum + (cardIsPaid(card) ? 0 : card.minimumDue), 0),
    [cards],
  )
  const overallUtilisation = totalLimit ? (totalOutstanding / totalLimit) * 100 : 0
  const overallTone = utilisationTone(overallUtilisation)
  const headroom = Math.max(0, totalLimit - totalOutstanding)

  const bills = useMemo<BillRow[]>(() => {
    const today = todayISO()
    return cards
      .map((card) => {
        const paid = cardIsPaid(card)
        const cycleDue = clampDayToMonth(month, card.billDueDay)
        // An unpaid bill whose date has already passed stays pinned to this
        // cycle. Rolling it forward to next month would quietly hide the fact
        // that the payment is late, which is the one thing this table must show.
        const overdue = !paid && card.outstanding > 0 && cycleDue < today
        const dueDate = overdue ? cycleDue : nextDueDate(card.billDueDay)
        return { card, dueDate, days: daysUntil(dueDate), paid, overdue }
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  }, [cards, month])

  const nextBill = bills.find((bill) => !bill.paid && bill.card.outstanding > 0)
  const overdueCount = bills.filter((bill) => bill.overdue).length

  const payments = useMemo(
    () => sortByDateDesc(state.transactions.filter((txn) => txn.linkedType === 'card')).slice(0, 6),
    [state.transactions],
  )

  const utilisationData = useMemo(
    () =>
      cards.map((card) => ({
        label: card.name,
        Utilisation: Math.round(cardUtilisation(card) * 10) / 10,
        color: colorById[card.id],
      })),
    [cards, colorById],
  )

  function openAdd() {
    setFormCard(null)
    setFormOpen(true)
  }

  function openEdit(card: CreditCard) {
    setFormCard(card)
    setFormOpen(true)
  }

  function confirmPayment() {
    const card = payTarget
    if (!card) return
    const amount = card.outstanding
    actions.markCardPaid(card.id)
    setPayTarget(null)
    toast.success(`${card.name} bill of ${formatCurrency(amount)} marked paid`, {
      label: 'View entry',
      onClick: () => {
        window.location.hash = '#/transactions'
      },
    })
  }

  function confirmDelete() {
    const card = deleteTarget
    if (!card) return
    actions.removeCard(card.id)
    setDeleteTarget(null)
    toast.success(`${card.name} removed`)
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Credit cards"
        subtitle={
          cards.length === 0
            ? 'Track statements, due dates and utilisation in one place.'
            : `${cards.length} card${cards.length === 1 ? '' : 's'} · ${formatCurrency(totalOutstanding)} owed this cycle`
        }
        action={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openAdd}>
            Add card
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total outstanding"
          value={formatCurrency(totalOutstanding)}
          sub={
            totalMinimum > 0
              ? `${formatCurrency(totalMinimum)} is the combined minimum due`
              : 'No minimum due pending'
          }
          icon={<CreditCardIcon className="h-4 w-4" />}
          accent={seriesColor(1, mode)}
        />
        <StatTile
          label="Total credit limit"
          value={formatCurrency(totalLimit)}
          sub={`${formatCurrency(headroom)} still available to spend`}
          icon={<Wallet className="h-4 w-4" />}
          accent={seriesColor(0, mode)}
        />
        <StatTile
          label="Overall utilisation"
          value={formatPercent(overallUtilisation, 0)}
          upIsGood={false}
          sub={
            <span className="inline-flex">
              <StatusBadge status={overallTone}>{UTILISATION_MESSAGE[overallTone]}</StatusBadge>
            </span>
          }
          icon={<Gauge className="h-4 w-4" />}
          accent={seriesColor(6, mode)}
        />
        <StatTile
          label="Next bill due"
          value={nextBill ? formatDateShort(nextBill.dueDate) : '—'}
          sub={
            nextBill ? (
              <span>
                {nextBill.card.name} · {formatCurrency(nextBill.card.outstanding)}{' '}
                <span className={cn(nextBill.overdue && 'font-medium text-negative')}>
                  ({relativeDay(nextBill.dueDate)})
                </span>
              </span>
            ) : cards.length === 0 ? (
              'Add a card to see its bill cycle'
            ) : (
              'Everything is settled for this cycle'
            )
          }
          icon={<CalendarClock className="h-4 w-4" />}
          accent={seriesColor(3, mode)}
        />
      </div>

      {overdueCount > 0 ? (
        <Card className="border-critical/30 bg-critical-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-critical">
                <Receipt className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-ink">
                  {overdueCount} bill{overdueCount === 1 ? '' : 's'} past the due date
                </p>
                <p className="mt-0.5 text-[13px] text-ink-secondary">
                  Late payments attract interest on the full statement balance, not just the unpaid part.
                </p>
              </div>
            </div>
            <StatusBadge status="critical">Pay as soon as you can</StatusBadge>
          </div>
        </Card>
      ) : null}

      {cards.length === 0 ? (
        <Card>
          <CardHeader title="Your cards" subtitle="Statements, limits and dues" icon={<CreditCardIcon className="h-4 w-4" />} />
          <EmptyState
            className="mt-4"
            icon={<CreditCardIcon className="h-5 w-5" />}
            title="No cards added yet"
            message="Add a credit card to track its statement, bill due date and how much of the limit you are using."
            action={
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openAdd}>
                Add your first card
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <CardTile
              key={card.id}
              card={card}
              hue={colorById[card.id]}
              onEdit={() => openEdit(card)}
              onPay={() => setPayTarget(card)}
              onDelete={() => setDeleteTarget(card)}
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <ChartFrame
          className="lg:col-span-7"
          title="Utilisation by card"
          subtitle="Share of each limit currently in use"
          height={Math.max(200, cards.length * 46 + 60)}
          legend={cards.map((card) => ({ label: card.name, color: colorById[card.id] }))}
          table={{
            columns: ['Card', 'Limit', 'Outstanding', 'Utilisation'],
            numericFrom: 1,
            rows: cards.map((card) => [
              card.name,
              formatCurrency(card.creditLimit),
              formatCurrency(card.outstanding),
              formatPercent(cardUtilisation(card), 0),
            ]),
          }}
          footnote={`The dashed marker is the ${HEALTHY_UTILISATION}% threshold most credit scores treat as healthy.`}
          empty={
            cards.length === 0 ? (
              <EmptyState
                compact
                icon={<Gauge className="h-5 w-5" />}
                title="Nothing to plot"
                message="Add a card and its limit to see utilisation here."
              />
            ) : undefined
          }
        >
          <ColumnChart
            data={utilisationData}
            xKey="label"
            horizontal
            categoryWidth={104}
            series={[
              {
                key: 'Utilisation',
                label: 'Utilisation',
                color: seriesColor(0, mode),
                colorFor: (row) => String(row.color),
              },
            ]}
            format={(value) => formatPercent(value, 0)}
            yTickFormat={(value) => `${Math.round(value)}%`}
            reference={{ value: HEALTHY_UTILISATION, label: `${HEALTHY_UTILISATION}% healthy` }}
          />
        </ChartFrame>

        <Card className="lg:col-span-5">
          <CardHeader
            title="Why 30% matters"
            subtitle="Utilisation is the second-biggest factor in a credit score"
            icon={<ShieldCheck className="h-4 w-4" />}
          />
          <div className="mt-4 flex flex-col gap-3">
            <div>
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-ink-secondary">Across all your cards</span>
                <span className="tabular font-semibold text-ink">{formatPercent(overallUtilisation, 0)}</span>
              </div>
              {/* The marker shows the 30% line on the same track as the fill, so the
                  gap to a healthy score is readable without doing the arithmetic. */}
              <ProgressBar
                className="mt-2"
                value={overallUtilisation}
                tone={overallTone}
                size="lg"
                marker={HEALTHY_UTILISATION}
                label="Overall credit utilisation"
              />
              <p className="mt-2 text-[12px] text-muted">
                {overallUtilisation <= HEALTHY_UTILISATION
                  ? `You have ${formatCompactCurrency(headroom)} of headroom before you cross the healthy line.`
                  : `Paying down ${formatCompactCurrency(
                      Math.max(0, totalOutstanding - (totalLimit * HEALTHY_UTILISATION) / 100),
                    )} would bring you back under ${HEALTHY_UTILISATION}%.`}
              </p>
            </div>

            <ul className="flex flex-col gap-2.5 text-[13px] leading-relaxed text-ink-secondary">
              <li className="flex gap-2.5">
                <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                Bureaus read the balance reported on your statement date, not on the due date — spending less
                before the statement day matters more than paying early.
              </li>
              <li className="flex gap-2.5">
                <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                Paying only the minimum keeps the account current but interest accrues on the whole balance,
                and the interest-free period on new purchases disappears.
              </li>
              <li className="flex gap-2.5">
                <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                Closing an unused card lowers your total limit, which pushes utilisation up even when your
                spending has not changed.
              </li>
            </ul>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Bill calendar"
          subtitle={
            cards.length === 0
              ? 'Statement and payment dates for every card'
              : `${monthLabel(month)} cycle · ${formatCurrency(totalOutstanding)} across ${cards.length} card${cards.length === 1 ? '' : 's'}`
          }
          icon={<CalendarClock className="h-4 w-4" />}
        />
        {bills.length === 0 ? (
          <EmptyState
            className="mt-4"
            compact
            icon={<CalendarClock className="h-5 w-5" />}
            title="No bills scheduled"
            message="Once you add a card, its statement and due dates appear here in order."
          />
        ) : (
          <div className="mt-3">
            <TableWrap>
              <thead>
                <tr>
                  <Th>Card</Th>
                  <Th>Statement</Th>
                  <Th>Bill due</Th>
                  <Th>Next due date</Th>
                  <Th align="right">Minimum due</Th>
                  <Th align="right">Full amount</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <Tr key={bill.card.id}>
                    <Td>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className="h-6 w-6 shrink-0 rounded-md"
                          style={{ background: cardGradient(colorById[bill.card.id]) }}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium text-ink">
                            {bill.card.name}
                          </span>
                          <span className="block truncate text-[12px] text-muted">
                            {maskCard(bill.card.last4)}
                          </span>
                        </span>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-ink-secondary">{ordinal(bill.card.statementDay)}</Td>
                    <Td className="whitespace-nowrap text-ink-secondary">{ordinal(bill.card.billDueDay)}</Td>
                    <Td className="whitespace-nowrap">
                      <span className="block text-[13.5px] text-ink">{formatDate(bill.dueDate)}</span>
                      <span
                        className={cn(
                          'block text-[12px]',
                          bill.overdue ? 'font-medium text-negative' : 'text-muted',
                        )}
                      >
                        {relativeDay(bill.dueDate)}
                      </span>
                    </Td>
                    <Td align="right" className="tabular text-ink-secondary">
                      {formatCurrency(bill.card.minimumDue)}
                    </Td>
                    <Td align="right" className="tabular font-medium">
                      {formatCurrency(bill.card.outstanding)}
                    </Td>
                    <Td>
                      <BillStatus bill={bill} leadDays={state.settings.reminderLeadDays} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
            <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
              Reminders fire {state.settings.reminderLeadDays} days before each due date — change that in
              Settings. Days shorter than the due day (a 31st due date in April) are clamped to the last day of
              the month.
            </p>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Recent bill payments"
          subtitle="Entries logged when you marked a bill paid"
          icon={<Receipt className="h-4 w-4" />}
          action={
            <a
              href={hrefFor('/transactions')}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline"
            >
              All transactions <ArrowRight className="h-3.5 w-3.5" />
            </a>
          }
        />
        {payments.length === 0 ? (
          <EmptyState
            className="mt-4"
            compact
            icon={<Receipt className="h-5 w-5" />}
            title="No payments logged yet"
            message="Marking a bill as paid records the payment as an expense so your cash flow stays accurate."
          />
        ) : (
          <ul className="mt-2 divide-y divide-hairline">
            {payments.map((payment) => (
              <li key={payment.id}>
                <button
                  type="button"
                  onClick={() => quickAdd.editTransaction(payment)}
                  className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                    style={{
                      background: cardGradient(
                        (payment.linkedId && colorById[payment.linkedId]) || seriesColor(0, mode),
                      ),
                    }}
                  >
                    <CreditCardIcon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">{payment.note}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {formatDate(payment.date)} · {payment.method}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-[13.5px] font-semibold text-ink">
                    −{formatCurrency(payment.amount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {formOpen ? (
        <CardFormModal
          key={formCard?.id ?? 'new'}
          card={formCard}
          onClose={() => setFormOpen(false)}
        />
      ) : null}

      <ConfirmDialog
        open={payTarget !== null}
        title="Mark this bill as paid?"
        destructive={false}
        confirmLabel="Mark paid"
        message={
          payTarget ? (
            <>
              This clears the {formatCurrency(payTarget.outstanding)} outstanding on {payTarget.name} and logs
              a matching expense dated today, so your balance and cash flow stay in sync.
            </>
          ) : (
            ''
          )
        }
        onConfirm={confirmPayment}
        onCancel={() => setPayTarget(null)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this card?"
        confirmLabel="Delete card"
        message={
          deleteTarget ? (
            <>
              {deleteTarget.name} ({maskCard(deleteTarget.last4)}) will be removed along with its limit and
              dues. Payments already recorded as transactions are kept.
            </>
          ) : (
            ''
          )
        }
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function BillStatus({ bill, leadDays }: { bill: BillRow; leadDays: number }) {
  if (bill.paid) return <StatusBadge status="good">Paid this cycle</StatusBadge>
  if (bill.card.outstanding === 0) return <StatusBadge status="good">Nothing due</StatusBadge>
  if (bill.overdue) {
    const late = Math.abs(bill.days)
    return <StatusBadge status="critical">Overdue by {late} day{late === 1 ? '' : 's'}</StatusBadge>
  }
  if (bill.days <= leadDays) return <StatusBadge status="warning">Due in {bill.days} day{bill.days === 1 ? '' : 's'}</StatusBadge>
  return <StatusBadge status="info">Scheduled</StatusBadge>
}

function CardTile({
  card,
  hue,
  onEdit,
  onPay,
  onDelete,
}: {
  card: CreditCard
  hue: string
  onEdit: () => void
  onPay: () => void
  onDelete: () => void
}) {
  const utilisation = cardUtilisation(card)
  const tone = utilisationTone(utilisation)
  const paid = cardIsPaid(card)
  const dueDate = nextDueDate(card.billDueDay)
  const cycleDue = clampDayToMonth(currentMonthKey(), card.billDueDay)
  const overdue = !paid && card.outstanding > 0 && cycleDue < todayISO()

  return (
    <Card className="flex flex-col gap-4">
      {/* The panel is a fixed dark surface by design — white text on it is the
          only place in the app that does not follow the theme tokens. */}
      <div
        className="relative overflow-hidden rounded-2xl p-4 text-white shadow-pop sm:p-5"
        style={{ background: cardGradient(hue) }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-14 -right-10 h-40 w-40 rounded-full opacity-25"
          style={{ background: `radial-gradient(circle, #ffffff, transparent 68%)` }}
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium tracking-[0.14em] text-white/70 uppercase">
              {card.issuer}
            </p>
            <p className="mt-1 truncate text-[15px] font-semibold tracking-[-0.01em]">{card.name}</p>
          </div>
          <Wifi className="h-[18px] w-[18px] shrink-0 rotate-90 text-white/70" aria-hidden="true" />
        </div>

        <div className="relative mt-5">
          <p className="text-[11px] font-medium tracking-wide text-white/70 uppercase">Outstanding</p>
          <p className="tabular mt-1 text-[28px] leading-none font-semibold tracking-[-0.02em]">
            {formatCurrency(card.outstanding)}
          </p>
        </div>

        <div className="relative mt-5 flex flex-wrap items-end justify-between gap-3">
          <p className="tabular text-[14px] tracking-[0.16em] text-white/85">{maskCard(card.last4)}</p>
          <div className="text-right">
            <p className="text-[10.5px] tracking-wide text-white/65 uppercase">Bill due</p>
            <p className="text-[12.5px] font-medium">{formatDateShort(dueDate)}</p>
          </div>
        </div>

        <div className="relative mt-3 flex items-center justify-between gap-3 border-t border-white/15 pt-3 text-[11.5px] text-white/75">
          <span>Limit {formatCurrency(card.creditLimit)}</span>
          <span className="tabular">{formatPercent(utilisation, 0)} used</span>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 text-[12.5px]">
          <span className="text-muted">Utilisation</span>
          <span className="tabular font-medium text-ink">
            {formatCurrency(card.outstanding)} / {formatCurrency(card.creditLimit)}
          </span>
        </div>
        <ProgressBar
          className="mt-2"
          value={utilisation}
          tone={tone}
          marker={HEALTHY_UTILISATION}
          label={`${card.name} utilisation`}
        />
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <StatusBadge status={tone}>{UTILISATION_MESSAGE[tone]}</StatusBadge>
          {paid ? (
            <StatusBadge status="good">Paid this cycle</StatusBadge>
          ) : overdue ? (
            <StatusBadge status="critical">Overdue · {relativeDay(cycleDue)}</StatusBadge>
          ) : card.minimumDue > 0 ? (
            <Badge tone="neutral">Min {formatCurrency(card.minimumDue)}</Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          className="flex-1"
          disabled={paid || card.outstanding <= 0}
          onClick={onPay}
        >
          {paid ? 'Bill settled' : card.outstanding <= 0 ? 'Nothing due' : 'Mark bill paid'}
        </Button>
        <Button size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={onEdit}>
          Edit
        </Button>
        <IconButton label={`Delete ${card.name}`} size="sm" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */

type FormField = 'name' | 'issuer' | 'last4' | 'creditLimit' | 'outstanding' | 'minimumDue' | 'statementDay' | 'billDueDay'
type FormErrors = Partial<Record<FormField, string>>

/** Numeric inputs are held as strings so a field can be genuinely empty. */
interface FormValues {
  name: string
  issuer: string
  last4: string
  creditLimit: string
  outstanding: string
  minimumDue: string
  statementDay: string
  billDueDay: string
}

function toValues(card: CreditCard | null): FormValues {
  return {
    name: card?.name ?? '',
    issuer: card?.issuer ?? '',
    last4: card?.last4 ?? '',
    creditLimit: card ? String(card.creditLimit) : '',
    outstanding: card ? String(card.outstanding) : '',
    minimumDue: card ? String(card.minimumDue) : '',
    statementDay: card ? String(card.statementDay) : '1',
    billDueDay: card ? String(card.billDueDay) : '18',
  }
}

function num(value: string): number {
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? parsed : NaN
}

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {}
  if (!values.name.trim()) errors.name = 'Give the card a name you will recognise.'
  if (!values.issuer.trim()) errors.issuer = 'Which bank issued it?'
  if (!/^\d{4}$/.test(values.last4.trim())) errors.last4 = 'Enter the last 4 digits.'

  const limit = num(values.creditLimit)
  const outstanding = num(values.outstanding)
  const minimum = num(values.minimumDue)
  const statementDay = num(values.statementDay)
  const billDueDay = num(values.billDueDay)

  if (!Number.isFinite(limit) || limit <= 0) errors.creditLimit = 'Enter the sanctioned limit.'
  if (!Number.isFinite(outstanding) || outstanding < 0) errors.outstanding = 'Enter 0 if nothing is owed.'
  else if (Number.isFinite(limit) && limit > 0 && outstanding > limit)
    errors.outstanding = 'Outstanding cannot exceed the credit limit.'

  if (!Number.isFinite(minimum) || minimum < 0) errors.minimumDue = 'Enter 0 if there is no minimum.'
  else if (Number.isFinite(outstanding) && outstanding >= 0 && minimum > outstanding)
    errors.minimumDue = 'The minimum cannot be more than the outstanding.'

  // Days are capped at 28 so a cycle never skips a month in February.
  if (!Number.isFinite(statementDay) || statementDay < 1 || statementDay > 28)
    errors.statementDay = 'Pick a day between 1 and 28.'
  if (!Number.isFinite(billDueDay) || billDueDay < 1 || billDueDay > 28)
    errors.billDueDay = 'Pick a day between 1 and 28.'

  return errors
}

function CardFormModal({ card, onClose }: { card: CreditCard | null; onClose: () => void }) {
  const actions = useActions()
  const toast = useToast()
  const [values, setValues] = useState<FormValues>(() => toValues(card))
  const [errors, setErrors] = useState<FormErrors>({})
  const [touched, setTouched] = useState(false)

  const set = (key: keyof FormValues) => (next: string) => {
    setValues((current) => {
      const updated = { ...current, [key]: next }
      // Re-validate live only after the first failed submit, so the form does
      // not shout at someone who is still filling in the first field.
      if (touched) setErrors(validate(updated))
      return updated
    })
  }

  const limit = num(values.creditLimit)
  const outstanding = num(values.outstanding)
  const previewUtilisation =
    Number.isFinite(limit) && limit > 0 && Number.isFinite(outstanding) && outstanding >= 0
      ? (outstanding / limit) * 100
      : null

  function submit() {
    const found = validate(values)
    setTouched(true)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const payload = {
      name: values.name.trim(),
      issuer: values.issuer.trim(),
      last4: values.last4.trim(),
      creditLimit: num(values.creditLimit),
      outstanding: num(values.outstanding),
      minimumDue: num(values.minimumDue),
      statementDay: num(values.statementDay),
      billDueDay: num(values.billDueDay),
    }

    if (card) {
      actions.updateCard(card.id, payload)
      toast.success(`${payload.name} updated`)
    } else {
      actions.addCard(payload)
      toast.success(`${payload.name} added`)
    }
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={card ? 'Edit card' : 'Add credit card'}
      description={
        card
          ? 'Update the limit, dues or billing cycle for this card.'
          : 'Track a new card’s statement, dues and utilisation.'
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            {card ? 'Save changes' : 'Add card'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Card name" required error={errors.name} hint="For example, CIBC Dividend Visa">
          {(id) => (
            <TextInput
              id={id}
              value={values.name}
              invalid={Boolean(errors.name)}
              placeholder="Travel card"
              autoComplete="off"
              onChange={(event) => set('name')(event.target.value)}
            />
          )}
        </Field>

        <Field label="Issuer" required error={errors.issuer}>
          {(id) => (
            <TextInput
              id={id}
              value={values.issuer}
              invalid={Boolean(errors.issuer)}
              placeholder="CIBC"
              autoComplete="off"
              onChange={(event) => set('issuer')(event.target.value)}
            />
          )}
        </Field>

        <Field label="Last 4 digits" required error={errors.last4} hint="Only these four are stored.">
          {(id) => (
            <TextInput
              id={id}
              value={values.last4}
              invalid={Boolean(errors.last4)}
              inputMode="numeric"
              maxLength={4}
              placeholder="4821"
              className="tabular tracking-[0.2em]"
              autoComplete="off"
              // Strip non-digits on the way in rather than rejecting on submit.
              onChange={(event) => set('last4')(event.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          )}
        </Field>

        <Field label="Credit limit" required error={errors.creditLimit}>
          {(id) => (
            <CurrencyInput
              id={id}
              value={values.creditLimit}
              invalid={Boolean(errors.creditLimit)}
              placeholder="200000"
              onChange={(event) => set('creditLimit')(event.target.value)}
            />
          )}
        </Field>

        <Field label="Current outstanding" required error={errors.outstanding}>
          {(id) => (
            <CurrencyInput
              id={id}
              value={values.outstanding}
              invalid={Boolean(errors.outstanding)}
              placeholder="0"
              onChange={(event) => set('outstanding')(event.target.value)}
            />
          )}
        </Field>

        <Field label="Minimum due" error={errors.minimumDue} hint="Usually 5% of the statement balance.">
          {(id) => (
            <CurrencyInput
              id={id}
              value={values.minimumDue}
              invalid={Boolean(errors.minimumDue)}
              placeholder="0"
              onChange={(event) => set('minimumDue')(event.target.value)}
            />
          )}
        </Field>

        <Field label="Statement day" required error={errors.statementDay} hint="Day the bill is generated.">
          {(id) => (
            <TextInput
              id={id}
              type="number"
              min={1}
              max={28}
              inputMode="numeric"
              value={values.statementDay}
              invalid={Boolean(errors.statementDay)}
              className="tabular"
              onChange={(event) => set('statementDay')(event.target.value)}
            />
          )}
        </Field>

        <Field label="Bill due day" required error={errors.billDueDay} hint="Day the payment must reach.">
          {(id) => (
            <TextInput
              id={id}
              type="number"
              min={1}
              max={28}
              inputMode="numeric"
              value={values.billDueDay}
              invalid={Boolean(errors.billDueDay)}
              className="tabular"
              onChange={(event) => set('billDueDay')(event.target.value)}
            />
          )}
        </Field>
      </div>

      {previewUtilisation !== null ? (
        <div className="mt-4 rounded-xl border border-hairline bg-surface-2 p-3.5">
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span className="text-ink-secondary">Utilisation with these numbers</span>
            <span className="tabular font-semibold text-ink">{formatPercent(previewUtilisation, 0)}</span>
          </div>
          <ProgressBar
            className="mt-2"
            value={previewUtilisation}
            tone={utilisationTone(previewUtilisation)}
            marker={HEALTHY_UTILISATION}
            label="Projected utilisation"
          />
          <div className="mt-2.5">
            <StatusBadge status={utilisationTone(previewUtilisation)}>
              {UTILISATION_MESSAGE[utilisationTone(previewUtilisation)]}
            </StatusBadge>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
