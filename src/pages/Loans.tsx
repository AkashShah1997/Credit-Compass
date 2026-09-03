import { useMemo, useState, type ReactNode } from 'react'
import {
  Banknote,
  CalendarCheck,
  CalendarClock,
  Coins,
  Landmark,
  ListOrdered,
  Pencil,
  Plus,
  TrendingDown,
  Trash2,
} from 'lucide-react'
import type { Loan, LoanType } from '../types'
import { LOAN_TYPES } from '../types'
import { useActions, useAppState } from '../store/AppStore'
import { useChartMode } from '../store/ThemeProvider'
import type { AmortisationRow, LoanSummary } from '../lib/finance'
import {
  amortisationSchedule,
  calculateLoanPayment,
  summariseLoan,
  totalLoanOutstanding,
  totalMonthlyLoanPayments,
} from '../lib/finance'
import {
  addMonths,
  currentMonthKey,
  daysUntil,
  formatDate,
  isSameMonth,
  monthLabel,
  monthShort,
  relativeDay,
  todayISO,
} from '../lib/date'
import {
  formatCompactCurrency,
  formatCurrency,
  formatNumber,
  formatPercent,
  formatTenure,
} from '../lib/format'
import { seriesColor } from '../lib/palette'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Button, IconButton } from '../components/ui/Button'
import { StatTile } from '../components/ui/StatTile'
import { ProgressBar, RingProgress } from '../components/ui/Progress'
import { Badge, StatusBadge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { TableWrap, Td, Th, Tr } from '../components/ui/Table'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { CurrencyInput, Field, SelectInput, Switch, TextInput } from '../components/ui/Field'
import { useToast } from '../components/ui/Toast'
import { ChartFrame } from '../components/charts/ChartFrame'
import { ColumnChart } from '../components/charts/ColumnChart'
import { TrendChart } from '../components/charts/TrendChart'
import { CategoryBars } from '../components/charts/CategoryBars'
import { hrefFor } from '../hooks/useRouter'
import { cn } from '../lib/cn'

/* Chart slots are fixed for the whole page so a figure means the same thing
   wherever it appears: principal is slot 0, interest slot 1, the outstanding
   balance slot 6. */
const PRINCIPAL_SLOT = 0
const INTEREST_SLOT = 1
const BALANCE_SLOT = 6

/** A loan is "open" while it is active and still has instalments to run. */
function isOpen(loan: Loan): boolean {
  return loan.active && loan.paidMonths < loan.tenureMonths
}

/** Balance left after `instalments` payments — used to project the payoff curve. */
function balanceAfter(rows: AmortisationRow[], principal: number, instalments: number): number {
  if (instalments <= 0) return principal
  const row = rows[Math.min(instalments, rows.length) - 1]
  return row ? row.balance : 0
}

export default function Loans() {
  const state = useAppState()
  const actions = useActions()
  const mode = useChartMode()
  const toast = useToast()

  const loans = state.loans
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [scheduleId, setScheduleId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [payId, setPayId] = useState<string | null>(null)

  const summaryById = useMemo(
    () => new Map(loans.map((loan) => [loan.id, summariseLoan(loan)] as const)),
    [loans],
  )

  /* Colour follows the loan, keyed off its position in the stored list — never
     off its rank in a sorted view, so re-sorting can't repaint a loan. */
  const colorById = useMemo(
    () => new Map(loans.map((loan, index) => [loan.id, seriesColor(index, mode)] as const)),
    [loans, mode],
  )

  const openLoans = useMemo(() => loans.filter(isOpen), [loans])

  const outstanding = useMemo(() => totalLoanOutstanding(loans), [loans])
  const paymentOutflow = useMemo(() => totalMonthlyLoanPayments(loans), [loans])
  const interestPaid = useMemo(
    () => loans.reduce((sum, loan) => sum + (summaryById.get(loan.id)?.interestPaid ?? 0), 0),
    [loans, summaryById],
  )

  /* Debt-free date: the furthest payoff month across every open loan. Month keys
     sort lexicographically, so a plain string comparison finds the latest. */
  const debtFree = useMemo(() => {
    const months = openLoans.map((loan) =>
      addMonths(currentMonthKey(), summaryById.get(loan.id)?.remainingMonths ?? 0),
    )
    return months.length ? months.reduce((latest, month) => (month > latest ? month : latest)) : null
  }, [openLoans, summaryById])

  const longestRemaining = useMemo(
    () => openLoans.reduce((max, loan) => Math.max(max, summaryById.get(loan.id)?.remainingMonths ?? 0), 0),
    [openLoans, summaryById],
  )

  /* Total debt six months out, used as the sparkline on the outstanding tile. */
  const payoffTrend = useMemo(() => {
    const schedules = openLoans.map((loan) => ({ loan, rows: amortisationSchedule(loan) }))
    return Array.from({ length: 6 }, (_, step) =>
      schedules.reduce(
        (sum, entry) => sum + balanceAfter(entry.rows, entry.loan.principal, entry.loan.paidMonths + step),
        0,
      ),
    )
  }, [openLoans])

  const borrowed = useMemo(() => openLoans.reduce((sum, loan) => sum + loan.principal, 0), [openLoans])
  const repaid = Math.max(0, borrowed - outstanding)
  const interestAhead = useMemo(
    () =>
      openLoans.reduce((sum, loan) => {
        const summary = summaryById.get(loan.id)
        return sum + (summary ? summary.totalInterest - summary.interestPaid : 0)
      }, 0),
    [openLoans, summaryById],
  )

  const selected = loans.find((loan) => loan.id === selectedId) ?? loans[0] ?? null
  const selectedSummary = selected ? summaryById.get(selected.id) : undefined
  const schedule = useMemo(() => (selected ? amortisationSchedule(selected) : []), [selected])

  /* The next twelve instalments. A loan that is already repaid has nothing
     ahead of it, so it falls back to its final year for context. */
  const upcoming = useMemo(() => {
    if (!selected) return []
    const ahead = schedule.slice(selected.paidMonths, selected.paidMonths + 12)
    return ahead.length ? ahead : schedule.slice(-12)
  }, [selected, schedule])

  const remainingRows = useMemo(
    () => (selected ? schedule.slice(selected.paidMonths) : []),
    [selected, schedule],
  )

  const balanceData = useMemo(() => {
    if (!remainingRows.length || !selectedSummary) return []
    // Start the curve at today's balance so the line begins where the loan is.
    return [
      { label: monthLabel(addMonths(remainingRows[0].month, -1)), Balance: selectedSummary.outstanding },
      ...remainingRows.map((row) => ({ label: monthLabel(row.month), Balance: row.balance })),
    ]
  }, [remainingRows, selectedSummary])

  const scheduleLoan = loans.find((loan) => loan.id === scheduleId) ?? null
  const editingLoan = loans.find((loan) => loan.id === editingId) ?? null
  const deleteLoan = loans.find((loan) => loan.id === deleteId) ?? null
  const payLoan = loans.find((loan) => loan.id === payId) ?? null
  const payLeavesBalance = payLoan
    ? balanceAfter(amortisationSchedule(payLoan), payLoan.principal, payLoan.paidMonths + 1)
    : 0

  const principalColor = seriesColor(PRINCIPAL_SLOT, mode)
  const interestColor = seriesColor(INTEREST_SLOT, mode)
  const balanceColor = seriesColor(BALANCE_SLOT, mode)

  const openForm = (loan: Loan | null) => {
    setEditingId(loan?.id ?? null)
    setFormOpen(true)
  }

  const handleSubmit = (input: Omit<Loan, 'id'>) => {
    if (editingLoan) {
      actions.updateLoan(editingLoan.id, input)
      toast.success(`${input.name} updated.`)
    } else {
      actions.addLoan(input)
      toast.success(
        `${input.name} added — ${formatCurrency(input.paymentAmount)} a month for ${formatTenure(input.tenureMonths)}.`,
      )
    }
    setFormOpen(false)
    setEditingId(null)
  }

  const confirmPay = () => {
    if (!payLoan) return
    const instalment = Math.min(payLoan.paidMonths + 1, payLoan.tenureMonths)
    actions.recordLoanPayment(payLoan.id)
    setPayId(null)
    // The store books a Loan Payment expense alongside the instalment, so say so —
    // an unexplained new transaction is the kind of surprise that erodes trust.
    toast.success(
      `Payment ${instalment} of ${payLoan.tenureMonths} recorded for ${payLoan.name}. A loan-payment expense was logged in transactions.`,
      { label: 'View', onClick: () => (window.location.hash = hrefFor('/transactions')) },
    )
  }

  const confirmDelete = () => {
    if (!deleteLoan) return
    actions.removeLoan(deleteLoan.id)
    setDeleteId(null)
    if (selectedId === deleteLoan.id) setSelectedId(null)
    if (scheduleId === deleteLoan.id) setScheduleId(null)
    toast.success(`${deleteLoan.name} deleted. Its logged payment transactions were kept.`)
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Loans"
        subtitle={
          openLoans.length
            ? `${openLoans.length} running loan${openLoans.length === 1 ? '' : 's'} · ${formatCurrency(paymentOutflow)} leaves your account every month.`
            : 'Track every borrowing, its instalments and the day you are free of it.'
        }
        action={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openForm(null)}>
            Add loan
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total outstanding"
          value={formatCurrency(outstanding)}
          sub={
            borrowed > 0
              ? `${formatCompactCurrency(repaid)} of ${formatCompactCurrency(borrowed)} borrowed is repaid`
              : 'Nothing borrowed'
          }
          icon={<TrendingDown className="h-4 w-4" />}
          accent={balanceColor}
          trend={payoffTrend}
          trendColor={balanceColor}
        />
        <StatTile
          label="Monthly loan payments"
          value={formatCurrency(paymentOutflow)}
          sub={
            state.settings.monthlySalary > 0
              ? `${formatPercent((paymentOutflow / state.settings.monthlySalary) * 100, 0)} of your monthly salary`
              : `${openLoans.length} instalment${openLoans.length === 1 ? '' : 's'} a month`
          }
          icon={<Banknote className="h-4 w-4" />}
          accent={principalColor}
        />
        <StatTile
          label="Interest paid so far"
          value={formatCurrency(interestPaid)}
          sub={
            interestAhead > 0 ? `${formatCurrency(interestAhead)} still ahead of you` : 'No interest left to pay'
          }
          icon={<Coins className="h-4 w-4" />}
          accent={interestColor}
        />
        <StatTile
          label="Debt-free date"
          value={debtFree ? monthLabel(debtFree) : '—'}
          sub={
            debtFree
              ? `${formatTenure(longestRemaining)} to go on your longest loan`
              : 'No running loans — you are debt free'
          }
          icon={<CalendarCheck className="h-4 w-4" />}
          accent={seriesColor(2, mode)}
        />
      </div>

      {loans.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Landmark className="h-5 w-5" />}
            title="No loans tracked yet"
            message="Add a mortgage, auto, personal or student loan to see its payment schedule, interest split and payoff date."
            action={
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openForm(null)}>
                Add your first loan
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {loans.map((loan) => {
              const summary = summaryById.get(loan.id)
              if (!summary) return null
              return (
                <LoanCard
                  key={loan.id}
                  loan={loan}
                  summary={summary}
                  color={colorById.get(loan.id) ?? balanceColor}
                  leadDays={state.settings.reminderLeadDays}
                  loggedThisMonth={state.transactions.some(
                    (t) =>
                      t.linkedType === 'loan' &&
                      t.linkedId === loan.id &&
                      isSameMonth(t.date, currentMonthKey()),
                  )}
                  selected={selected?.id === loan.id && loans.length > 1}
                  onSelect={() => setSelectedId(loan.id)}
                  onPay={() => setPayId(loan.id)}
                  onSchedule={() => setScheduleId(loan.id)}
                  onEdit={() => openForm(loan)}
                  onDelete={() => setDeleteId(loan.id)}
                />
              )
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <Card className="lg:col-span-5">
              <CardHeader
                title="Repayment progress"
                subtitle="Principal cleared across every running loan"
                icon={<Landmark className="h-4 w-4" />}
              />
              {borrowed === 0 ? (
                <EmptyState
                  className="mt-4"
                  compact
                  icon={<CalendarCheck className="h-5 w-5" />}
                  title="All loans closed"
                  message="Nothing is being repaid right now."
                />
              ) : (
                <>
                  <div className="mt-4 flex items-center gap-5">
                    <RingProgress value={(repaid / borrowed) * 100} size={116} tone="brand">
                      <span className="text-[20px] leading-none font-semibold tracking-[-0.02em] text-ink">
                        {Math.round((repaid / borrowed) * 100)}%
                      </span>
                      <span className="mt-1 text-[11px] text-muted">repaid</span>
                    </RingProgress>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-muted">Still owed</p>
                      <p className="tabular text-lg font-semibold text-ink">{formatCurrency(outstanding)}</p>
                      <p className="mt-2 text-[13px] text-muted">Borrowed</p>
                      <p className="tabular text-[15px] font-medium text-ink-secondary">
                        {formatCurrency(borrowed)}
                      </p>
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-hairline pt-4">
                    <div>
                      <dt className="text-[11.5px] text-muted">Interest still ahead</dt>
                      <dd className="tabular mt-0.5 text-[14px] font-semibold text-ink">
                        {formatCurrency(interestAhead)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11.5px] text-muted">Interest paid</dt>
                      <dd className="tabular mt-0.5 text-[14px] font-semibold text-ink">
                        {formatCurrency(interestPaid)}
                      </dd>
                    </div>
                  </dl>
                  <a
                    href={hrefFor('/transactions', { category: 'Loan Payment' })}
                    className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline"
                  >
                    See every loan payment
                  </a>
                </>
              )}
            </Card>

            <Card className="lg:col-span-7">
              <CardHeader
                title="Outstanding by loan"
                subtitle="Where the debt actually sits today"
                icon={<Coins className="h-4 w-4" />}
              />
              <CategoryBars
                className="mt-2"
                items={openLoans
                  .map((loan) => {
                    const summary = summaryById.get(loan.id)
                    return {
                      label: loan.name,
                      value: summary?.outstanding ?? 0,
                      color: colorById.get(loan.id) ?? balanceColor,
                      share: outstanding > 0 ? ((summary?.outstanding ?? 0) / outstanding) * 100 : 0,
                      meta: `${loan.lender} · ${formatCurrency(loan.paymentAmount)}/mo · ${formatTenure(summary?.remainingMonths ?? 0)} left`,
                    }
                  })
                  .sort((a, b) => b.value - a.value)}
                emptyLabel="Every loan is closed — nothing outstanding."
                onSelect={(item) => {
                  const match = openLoans.find((loan) => loan.name === item.label)
                  if (match) setSelectedId(match.id)
                }}
              />
              {openLoans.length > 1 ? (
                <p className="mt-3 text-[11.5px] text-muted">
                  Pick a loan to load it into the charts below.
                </p>
              ) : null}
            </Card>
          </div>

          {selected && selectedSummary ? (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Loan detail</h2>
                  <p className="mt-0.5 text-[13px] text-muted">
                    Amortisation for {selected.name} at {formatPercent(selected.interestRate)} a year.
                  </p>
                </div>
                {loans.length > 1 ? (
                  <div className="w-full sm:w-64">
                    <SelectInput
                      aria-label="Loan shown in the charts"
                      value={selected.id}
                      onChange={(event) => setSelectedId(event.target.value)}
                    >
                      {loans.map((loan) => (
                        <option key={loan.id} value={loan.id}>
                          {loan.name} · {loan.lender}
                        </option>
                      ))}
                    </SelectInput>
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <ChartFrame
                  className="lg:col-span-6"
                  title="Principal vs interest"
                  subtitle={
                    selectedSummary.remainingMonths > 0
                      ? 'Next twelve instalments'
                      : 'Final twelve instalments of a closed loan'
                  }
                  height={264}
                  legend={[
                    { label: 'Principal', color: principalColor },
                    { label: 'Interest', color: interestColor },
                  ]}
                  table={{
                    columns: ['Instalment', 'Due', 'Principal', 'Interest', 'Payment'],
                    numericFrom: 2,
                    rows: upcoming.map((row) => [
                      `#${row.index}`,
                      formatDate(row.dueDate),
                      formatCurrency(row.principalPaid),
                      formatCurrency(row.interestPaid),
                      formatCurrency(row.payment),
                    ]),
                  }}
                  footnote="Each bar is one payment. Early in a loan most of it is interest; the principal share grows every month."
                  empty={
                    upcoming.length === 0 ? (
                      <EmptyState
                        compact
                        icon={<ListOrdered className="h-5 w-5" />}
                        title="No instalments to show"
                        message="This loan has no schedule yet."
                      />
                    ) : undefined
                  }
                >
                  <ColumnChart
                    stacked
                    data={upcoming.map((row) => ({
                      label: monthShort(row.month),
                      Principal: row.principalPaid,
                      Interest: row.interestPaid,
                    }))}
                    xKey="label"
                    series={[
                      { key: 'Principal', label: 'Principal', color: principalColor },
                      { key: 'Interest', label: 'Interest', color: interestColor },
                    ]}
                  />
                </ChartFrame>

                <ChartFrame
                  className="lg:col-span-6"
                  title="Outstanding balance over time"
                  subtitle={
                    selectedSummary.remainingMonths > 0
                      ? `Projected to zero by ${monthLabel(addMonths(currentMonthKey(), selectedSummary.remainingMonths))}`
                      : 'This loan is fully repaid'
                  }
                  height={264}
                  legend={[{ label: 'Outstanding balance', color: balanceColor }]}
                  table={{
                    columns: ['Month', 'Instalment', 'Balance'],
                    numericFrom: 2,
                    rows: [
                      [
                        remainingRows.length ? monthLabel(addMonths(remainingRows[0].month, -1)) : '—',
                        'Today',
                        formatCurrency(selectedSummary.outstanding),
                      ],
                      ...remainingRows.map((row) => [
                        monthLabel(row.month),
                        `#${row.index}`,
                        formatCurrency(row.balance),
                      ]),
                    ],
                  }}
                  footnote="Assumes the payment stays exactly as it is. A lump-sum prepayment or a rate change pulls this curve in."
                  empty={
                    balanceData.length === 0 ? (
                      <EmptyState
                        compact
                        icon={<CalendarCheck className="h-5 w-5" />}
                        title="Nothing left to repay"
                        message="Every instalment on this loan has been paid."
                      />
                    ) : undefined
                  }
                >
                  <TrendChart
                    data={balanceData}
                    xKey="label"
                    series={[{ key: 'Balance', label: 'Outstanding balance', color: balanceColor }]}
                  />
                </ChartFrame>
              </div>
            </>
          ) : null}
        </>
      )}

      {scheduleLoan ? (
        <ScheduleModal
          loan={scheduleLoan}
          onClose={() => setScheduleId(null)}
          onPay={() => {
            setScheduleId(null)
            setPayId(scheduleLoan.id)
          }}
        />
      ) : null}

      {formOpen ? (
        <LoanFormModal
          key={editingLoan?.id ?? 'new-loan'}
          loan={editingLoan}
          onClose={() => {
            setFormOpen(false)
            setEditingId(null)
          }}
          onSubmit={handleSubmit}
        />
      ) : null}

      <ConfirmDialog
        open={payLoan != null}
        destructive={false}
        title="Record this loan payment?"
        confirmLabel="Record payment"
        message={
          payLoan ? (
            <>
              This marks instalment {Math.min(payLoan.paidMonths + 1, payLoan.tenureMonths)} of{' '}
              {payLoan.tenureMonths} on <strong className="font-medium text-ink">{payLoan.name}</strong> as
              paid and logs a loan-payment expense of{' '}
              <strong className="font-medium text-ink">{formatCurrency(payLoan.paymentAmount)}</strong> in your
              transactions. The outstanding balance drops to about{' '}
              {formatCurrency(payLeavesBalance)}.
            </>
          ) : (
            ''
          )
        }
        onConfirm={confirmPay}
        onCancel={() => setPayId(null)}
      />

      <ConfirmDialog
        open={deleteLoan != null}
        title="Delete this loan?"
        confirmLabel="Delete loan"
        message={
          deleteLoan ? (
            <>
              <strong className="font-medium text-ink">{deleteLoan.name}</strong> from {deleteLoan.lender} and
              its schedule will be removed. Payment transactions already logged against it stay in your history.
              This cannot be undone.
            </>
          ) : (
            ''
          )
        }
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function Metric({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11.5px] text-muted">{label}</p>
      <p className="tabular mt-0.5 truncate text-[14px] font-semibold text-ink">{value}</p>
      {sub ? <p className="mt-0.5 truncate text-[11.5px] text-muted">{sub}</p> : null}
    </div>
  )
}

function LoanCard({
  loan,
  summary,
  color,
  leadDays,
  loggedThisMonth,
  selected,
  onSelect,
  onPay,
  onSchedule,
  onEdit,
  onDelete,
}: {
  loan: Loan
  summary: LoanSummary
  color: string
  leadDays: number
  loggedThisMonth: boolean
  selected: boolean
  onSelect: () => void
  onPay: () => void
  onSchedule: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const running = isOpen(loan)
  const days = daysUntil(summary.nextDueDate)
  const dueSoon = running && days <= Math.max(1, leadDays)

  return (
    <Card className={cn('flex flex-col gap-4', selected && 'border-brand/45')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
          >
            <Landmark className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <button
              type="button"
              onClick={onSelect}
              title="Show this loan in the charts below"
              className="max-w-full truncate text-[15px] font-semibold tracking-[-0.01em] text-ink transition-colors hover:text-brand"
            >
              {loan.name}
            </button>
            <p className="mt-0.5 truncate text-[12.5px] text-muted">{loan.lender}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone="neutral">{loan.type}</Badge>
              {!running ? (
                <Badge tone="neutral">{loan.paidMonths >= loan.tenureMonths ? 'Closed' : 'Paused'}</Badge>
              ) : null}
              {loggedThisMonth ? <StatusBadge status="good">Payment logged this month</StatusBadge> : null}
              {dueSoon && !loggedThisMonth ? (
                <StatusBadge status={days <= 0 ? 'serious' : 'warning'}>
                  {days <= 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`}
                </StatusBadge>
              ) : null}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11.5px] text-muted">Monthly payment</p>
          <p className="tabular text-[17px] font-semibold tracking-[-0.01em] text-ink">
            {formatCurrency(loan.paymentAmount)}
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 text-[12px]">
          <span className="text-muted">
            {formatCurrency(summary.paidPrincipal)} of {formatCurrency(loan.principal)} principal repaid
          </span>
          <span className="tabular font-medium text-ink-secondary">
            {Math.round(summary.progressPercent)}%
          </span>
        </div>
        <ProgressBar
          className="mt-2"
          value={summary.progressPercent}
          tone={summary.progressPercent >= 100 ? 'good' : 'brand'}
          size="lg"
          label={`${loan.name} principal repaid`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-hairline pt-4 sm:grid-cols-4">
        <Metric label="Outstanding" value={formatCurrency(summary.outstanding)} />
        <Metric
          label="Instalments"
          value={`${formatNumber(Math.min(loan.paidMonths, loan.tenureMonths))} of ${formatNumber(loan.tenureMonths)}`}
          sub={running ? `${formatTenure(summary.remainingMonths)} left` : 'Fully paid'}
        />
        <Metric
          label="Next due"
          value={running ? formatDate(summary.nextDueDate) : '—'}
          sub={running ? relativeDay(summary.nextDueDate) : 'No dues'}
        />
        <Metric
          label="Interest rate"
          value={formatPercent(loan.interestRate)}
          sub={`${formatCompactCurrency(summary.totalInterest)} total interest`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          icon={<Banknote className="h-4 w-4" />}
          disabled={!running}
          onClick={onPay}
        >
          Record payment
        </Button>
        <Button size="sm" icon={<ListOrdered className="h-4 w-4" />} onClick={onSchedule}>
          Schedule
        </Button>
        <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={onEdit}>
          Edit
        </Button>
        <IconButton label={`Delete ${loan.name}`} size="sm" className="ml-auto" onClick={onDelete}>
          {/* The colour sits on the glyph, not the button, so the ghost variant's
              own text colour can't win the cascade. */}
          <Trash2 className="h-4 w-4 text-critical" />
        </IconButton>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */

function ScheduleModal({ loan, onClose, onPay }: { loan: Loan; onClose: () => void; onPay: () => void }) {
  const rows = useMemo(() => amortisationSchedule(loan), [loan])
  const nextIndex = loan.paidMonths + 1
  const totals = rows.reduce(
    (acc, row) => ({
      payment: acc.payment + row.payment,
      principal: acc.principal + row.principalPaid,
      interest: acc.interest + row.interestPaid,
    }),
    { payment: 0, principal: 0, interest: 0 },
  )

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${loan.name} — repayment schedule`}
      description={`${formatNumber(rows.length)} instalments at ${formatPercent(loan.interestRate)} a year, due on the ${loan.dueDay}${daySuffix(loan.dueDay)} of each month.`}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" disabled={!isOpen(loan)} onClick={onPay}>
            Pay instalment {Math.min(nextIndex, loan.tenureMonths)}
          </Button>
        </>
      }
    >
      <TableWrap>
        <thead>
          <tr>
            <Th>#</Th>
            <Th>Due date</Th>
            <Th align="right">Payment</Th>
            <Th align="right">Principal</Th>
            <Th align="right">Interest</Th>
            <Th align="right">Balance</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isNext = row.index === nextIndex
            return (
              <Tr
                key={row.index}
                // The next unpaid row is where the eye should land in a 48-row
                // table. Inline so the row's own hover rule can't paint over it.
                style={
                  isNext
                    ? { backgroundColor: 'color-mix(in oklab, var(--c-brand) 10%, transparent)' }
                    : undefined
                }
              >
                <Td className="tabular font-medium">{row.index}</Td>
                <Td className="whitespace-nowrap text-ink-secondary">{formatDate(row.dueDate)}</Td>
                <Td align="right" className="tabular">
                  {formatCurrency(row.payment)}
                </Td>
                <Td align="right" className="tabular text-ink-secondary">
                  {formatCurrency(row.principalPaid)}
                </Td>
                <Td align="right" className="tabular text-ink-secondary">
                  {formatCurrency(row.interestPaid)}
                </Td>
                <Td align="right" className="tabular">
                  {formatCurrency(row.balance)}
                </Td>
                <Td>
                  {row.paid ? (
                    <StatusBadge status="good">Paid</StatusBadge>
                  ) : isNext ? (
                    <Badge tone="brand" icon={<CalendarClock className="h-3 w-3" />}>
                      Next
                    </Badge>
                  ) : (
                    <span className="text-[12px] text-muted">Upcoming</span>
                  )}
                </Td>
              </Tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <Td colSpan={2} className="font-medium">
              Total over the full tenure
            </Td>
            <Td align="right" className="tabular font-semibold">
              {formatCurrency(totals.payment)}
            </Td>
            <Td align="right" className="tabular text-ink-secondary">
              {formatCurrency(totals.principal)}
            </Td>
            <Td align="right" className="tabular text-ink-secondary">
              {formatCurrency(totals.interest)}
            </Td>
            <Td align="right" className="text-muted">
              —
            </Td>
            <Td />
          </tr>
        </tfoot>
      </TableWrap>
      <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
        Reducing-balance method. The last instalment absorbs rounding so the balance lands exactly on zero.
      </p>
    </Modal>
  )
}

function daySuffix(day: number): string {
  if (day % 10 === 1 && day !== 11) return 'st'
  if (day % 10 === 2 && day !== 12) return 'nd'
  if (day % 10 === 3 && day !== 13) return 'rd'
  return 'th'
}

/* -------------------------------------------------------------------------- */

interface LoanDraft {
  name: string
  lender: string
  type: LoanType
  principal: string
  interestRate: string
  tenureMonths: string
  paymentAmount: string
  startDate: string
  dueDay: string
  paidMonths: string
  active: boolean
}

type DraftErrors = Partial<Record<keyof LoanDraft, string>>

/** Blank inputs must read as "missing", not as zero. */
function num(value: string): number {
  if (value.trim() === '') return NaN
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : NaN
}

function draftFrom(loan: Loan | null): LoanDraft {
  if (!loan) {
    return {
      name: '',
      lender: '',
      type: 'Personal Loan',
      principal: '',
      interestRate: '',
      tenureMonths: '',
      paymentAmount: '',
      startDate: todayISO(),
      dueDay: '5',
      paidMonths: '0',
      active: true,
    }
  }
  return {
    name: loan.name,
    lender: loan.lender,
    type: loan.type,
    principal: String(loan.principal),
    interestRate: String(loan.interestRate),
    tenureMonths: String(loan.tenureMonths),
    paymentAmount: String(loan.paymentAmount),
    startDate: loan.startDate,
    dueDay: String(loan.dueDay),
    paidMonths: String(loan.paidMonths),
    active: loan.active,
  }
}

function LoanFormModal({
  loan,
  onClose,
  onSubmit,
}: {
  loan: Loan | null
  onClose: () => void
  onSubmit: (input: Omit<Loan, 'id'>) => void
}) {
  const [draft, setDraft] = useState<LoanDraft>(() => draftFrom(loan))
  const [errors, setErrors] = useState<DraftErrors>({})
  /* An existing loan whose payment already matches the formula is treated as
     untouched, so editing its rate keeps the instalment in step. */
  const [emiTouched, setEmiTouched] = useState(
    () => loan != null && Math.abs(loan.paymentAmount - calculateLoanPayment(loan.principal, loan.interestRate, loan.tenureMonths)) > 1,
  )

  const principal = num(draft.principal)
  const rate = num(draft.interestRate)
  const tenure = Math.round(num(draft.tenureMonths))
  const emi = num(draft.paymentAmount)
  const suggested = calculateLoanPayment(principal || 0, rate || 0, tenure || 0)
  const monthlyInterest = principal > 0 && rate > 0 ? (principal * rate) / 12 / 100 : 0

  const update = (patch: Partial<LoanDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch }
      const affectsEmi = 'principal' in patch || 'interestRate' in patch || 'tenureMonths' in patch
      if (affectsEmi && !emiTouched) {
        const computed = calculateLoanPayment(
          num(next.principal) || 0,
          num(next.interestRate) || 0,
          Math.round(num(next.tenureMonths)) || 0,
        )
        next.paymentAmount = computed > 0 ? String(computed) : ''
      }
      return next
    })
  }

  const validate = (): DraftErrors => {
    const found: DraftErrors = {}
    if (!draft.name.trim()) found.name = 'Give the loan a name.'
    if (!draft.lender.trim()) found.lender = 'Who lent you the money?'
    if (!(principal > 0)) found.principal = 'Enter the amount borrowed.'
    if (!(rate >= 0) || rate > 60) found.interestRate = 'Enter a rate between 0 and 60%.'
    if (!(tenure >= 1) || tenure > 480) found.tenureMonths = 'Tenure must be 1 to 480 months.'
    if (!(emi > 0)) found.paymentAmount = 'Enter the monthly instalment.'
    else if (monthlyInterest > 0 && emi <= monthlyInterest && tenure > 1) {
      // Below the interest accrual the balance would grow forever.
      found.paymentAmount = `The payment must beat the monthly interest of ${formatCurrency(monthlyInterest)}.`
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate)) found.startDate = 'Pick the date the loan started.'
    const dueDay = Math.round(num(draft.dueDay))
    if (!(dueDay >= 1) || dueDay > 28) found.dueDay = 'Pick a day from 1 to 28.'
    const paid = Math.round(num(draft.paidMonths))
    if (!(paid >= 0)) found.paidMonths = 'Enter 0 or more.'
    else if (tenure >= 1 && paid > tenure) found.paidMonths = `Cannot exceed the ${tenure}-month tenure.`
    return found
  }

  const submit = () => {
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length) return

    const tenureMonths = tenure
    const paidMonths = Math.round(num(draft.paidMonths))
    onSubmit({
      name: draft.name.trim(),
      lender: draft.lender.trim(),
      type: draft.type,
      principal,
      interestRate: rate,
      paymentAmount: emi,
      tenureMonths,
      paidMonths,
      startDate: draft.startDate,
      dueDay: Math.round(num(draft.dueDay)),
      // A loan with every instalment paid is closed whatever the toggle says.
      active: draft.active && paidMonths < tenureMonths,
    })
  }

  const previewValid = emi > 0 && tenure >= 1 && principal > 0
  const totalPayable = previewValid ? emi * tenure : 0

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={loan ? `Edit ${loan.name}` : 'Add a loan'}
      description="The payment is suggested from the standard amortization formula — override it if your lender rounds differently."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            {loan ? 'Save changes' : 'Add loan'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Loan name" required error={errors.name} className="sm:col-span-2">
          {(id) => (
            <TextInput
              id={id}
              value={draft.name}
              placeholder="Car loan"
              invalid={Boolean(errors.name)}
              onChange={(event) => update({ name: event.target.value })}
            />
          )}
        </Field>

        <Field label="Lender" required error={errors.lender}>
          {(id) => (
            <TextInput
              id={id}
              value={draft.lender}
              placeholder="CIBC"
              invalid={Boolean(errors.lender)}
              onChange={(event) => update({ lender: event.target.value })}
            />
          )}
        </Field>

        <Field label="Loan type" required>
          {(id) => (
            <SelectInput
              id={id}
              value={draft.type}
              onChange={(event) => update({ type: event.target.value as LoanType })}
            >
              {LOAN_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>

        <Field label="Amount borrowed" required error={errors.principal}>
          {(id) => (
            <CurrencyInput
              id={id}
              value={draft.principal}
              placeholder="28000"
              invalid={Boolean(errors.principal)}
              onChange={(event) => update({ principal: event.target.value })}
            />
          )}
        </Field>

        <Field
          label="Interest rate"
          required
          error={errors.interestRate}
          hint="Annual nominal rate, in percent."
        >
          {(id) => (
            <TextInput
              id={id}
              type="number"
              inputMode="decimal"
              min={0}
              max={60}
              step="0.05"
              className="tabular"
              value={draft.interestRate}
              placeholder="7.49"
              invalid={Boolean(errors.interestRate)}
              onChange={(event) => update({ interestRate: event.target.value })}
            />
          )}
        </Field>

        <Field
          label="Tenure"
          required
          error={errors.tenureMonths}
          hint={tenure >= 1 ? formatTenure(tenure) : 'In months.'}
        >
          {(id) => (
            <TextInput
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              max={480}
              step="1"
              className="tabular"
              value={draft.tenureMonths}
              placeholder="72"
              invalid={Boolean(errors.tenureMonths)}
              onChange={(event) => update({ tenureMonths: event.target.value })}
            />
          )}
        </Field>

        <Field
          label="Monthly payment"
          required
          error={errors.paymentAmount}
          hint={
            suggested > 0 ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                <span>Suggested: {formatCurrency(suggested)}</span>
                {Math.round(emi || 0) !== Math.round(suggested) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEmiTouched(false)
                      setDraft((prev) => ({ ...prev, paymentAmount: String(suggested) }))
                    }}
                    className="font-medium text-brand hover:underline"
                  >
                    Use suggested
                  </button>
                ) : null}
              </span>
            ) : (
              'Fill in principal, rate and tenure for a suggestion.'
            )
          }
        >
          {(id) => (
            <CurrencyInput
              id={id}
              value={draft.paymentAmount}
              placeholder="484"
              invalid={Boolean(errors.paymentAmount)}
              onChange={(event) => {
                setEmiTouched(true)
                update({ paymentAmount: event.target.value })
              }}
            />
          )}
        </Field>

        <Field label="Start date" required error={errors.startDate}>
          {(id) => (
            <TextInput
              id={id}
              type="date"
              value={draft.startDate}
              invalid={Boolean(errors.startDate)}
              onChange={(event) => update({ startDate: event.target.value })}
            />
          )}
        </Field>

        <Field
          label="Payment due day"
          required
          error={errors.dueDay}
          hint="1 to 28, so it lands in every month."
        >
          {(id) => (
            <TextInput
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              max={28}
              step="1"
              className="tabular"
              value={draft.dueDay}
              invalid={Boolean(errors.dueDay)}
              onChange={(event) => update({ dueDay: event.target.value })}
            />
          )}
        </Field>

        <Field
          label="Instalments already paid"
          error={errors.paidMonths}
          hint={tenure >= 1 ? `Out of ${formatNumber(tenure)}.` : 'Set the tenure first.'}
        >
          {(id) => (
            <TextInput
              id={id}
              type="number"
              inputMode="numeric"
              min={0}
              step="1"
              className="tabular"
              value={draft.paidMonths}
              invalid={Boolean(errors.paidMonths)}
              onChange={(event) => update({ paidMonths: event.target.value })}
            />
          )}
        </Field>

        <div className="rounded-xl border border-hairline bg-surface-2 p-3.5 sm:col-span-2">
          <Switch
            checked={draft.active}
            onChange={(next) => update({ active: next })}
            label="Loan is active"
            description="Inactive loans stay in your history but drop out of payment reminders and the monthly outflow."
          />
        </div>

        {previewValid ? (
          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-hairline bg-surface-2 p-3.5 sm:col-span-2 sm:grid-cols-3">
            <div>
              <dt className="text-[11.5px] text-muted">Total payable</dt>
              <dd className="tabular mt-0.5 text-[14px] font-semibold text-ink">
                {formatCurrency(totalPayable)}
              </dd>
            </div>
            <div>
              <dt className="text-[11.5px] text-muted">Interest cost</dt>
              <dd className="tabular mt-0.5 text-[14px] font-semibold text-ink">
                {formatCurrency(Math.max(0, totalPayable - principal))}
              </dd>
            </div>
            <div>
              <dt className="text-[11.5px] text-muted">Cost of borrowing</dt>
              <dd className="tabular mt-0.5 text-[14px] font-semibold text-ink">
                {formatPercent(principal > 0 ? ((totalPayable - principal) / principal) * 100 : 0, 0)}
              </dd>
            </div>
          </dl>
        ) : null}
      </div>
    </Modal>
  )
}
