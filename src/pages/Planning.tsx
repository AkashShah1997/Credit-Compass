import { useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Coins,
  Compass,
  Gauge,
  Hourglass,
  Landmark,
  PiggyBank,
  RotateCcw,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useAppState } from '../store/AppStore'
import { useChartMode } from '../store/ThemeProvider'
import {
  cashFlowForecast,
  fiStatus,
  projectCorpus,
  salaryDayPlan,
  yearsToTarget,
  type FiStatus,
  type SalaryPlan,
} from '../lib/finance'
import { formatDate, formatDateShort, monthShort } from '../lib/date'
import {
  formatCompactCurrency,
  formatCurrency,
  formatNumber,
  formatPercent,
  formatSignedCurrency,
  formatTenure,
} from '../lib/format'
import { FLOW_COLORS, seriesColor, type Mode } from '../lib/palette'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { CurrencyInput, Field, TextInput } from '../components/ui/Field'
import { ConfirmDialog } from '../components/ui/Modal'
import { Badge, SeriesDot, StatusBadge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Segmented, Tabs } from '../components/ui/Tabs'
import { StatTile } from '../components/ui/StatTile'
import { RingProgress } from '../components/ui/Progress'
import { TableWrap, Td, Th, Tr } from '../components/ui/Table'
import { useToast } from '../components/ui/Toast'
import { ChartFrame } from '../components/charts/ChartFrame'
import { ColumnChart } from '../components/charts/ColumnChart'
import { TrendChart } from '../components/charts/TrendChart'
import { hrefFor } from '../hooks/useRouter'
import { cn } from '../lib/cn'

type TabKey = 'salary' | 'cashflow' | 'independence'

export default function Planning() {
  const [tab, setTab] = useState<TabKey>('salary')

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Planning"
        subtitle="What the next pay-cheque already owes, where the balance lands, and when work becomes optional."
        action={
          <a
            href={hrefFor('/settings')}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline"
          >
            Assumptions in Settings <ArrowRight className="h-3.5 w-3.5" />
          </a>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'salary', label: 'Salary day', icon: <CalendarClock className="h-4 w-4" /> },
          { value: 'cashflow', label: 'Cash flow', icon: <TrendingUp className="h-4 w-4" /> },
          { value: 'independence', label: 'Independence', icon: <Compass className="h-4 w-4" /> },
        ]}
      />

      {/* Only the active section mounts: each one runs its own projections, and
          three sets of them per render would be work nobody can see. */}
      {tab === 'salary' ? <SalaryDay /> : null}
      {tab === 'cashflow' ? <CashFlow /> : null}
      {tab === 'independence' ? <Independence /> : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Salary day                                                                 */
/* -------------------------------------------------------------------------- */

interface AllocationSegment {
  key: string
  label: string
  detail: string
  amount: number
  color: string
  /** The leftover, not another claim — it is not subtracted from the running balance. */
  isRemainder?: boolean
}

/**
 * Eight validated categorical slots exist and the palette never cycles past
 * them, so a pay-cheque with more claims than that folds its tail into one
 * labelled segment rather than borrowing a colour that means something else.
 */
const MAX_SEGMENTS = 8

function buildAllocation(plan: SalaryPlan, mode: Mode): AllocationSegment[] {
  const reserved = (plan.plannedSavings > 0 ? 1 : 0) + (plan.discretionary > 0 ? 1 : 0)
  const room = Math.max(1, MAX_SEGMENTS - reserved)
  const shown = plan.commitments.length > room ? plan.commitments.slice(0, room - 1) : plan.commitments
  const folded = plan.commitments.slice(shown.length)

  const rows: Omit<AllocationSegment, 'color'>[] = shown.map((commitment, index) => ({
    key: `${commitment.kind}-${commitment.label}-${index}`,
    label: commitment.label,
    detail: `${commitment.kind} · due ${formatDateShort(commitment.date)}`,
    amount: commitment.amount,
  }))

  if (folded.length > 0) {
    rows.push({
      key: 'folded',
      label: `${folded.length} more commitment${folded.length === 1 ? '' : 's'}`,
      detail: `Due ${formatDateShort(folded[0].date)} – ${formatDateShort(folded[folded.length - 1].date)}`,
      amount: folded.reduce((sum, commitment) => sum + commitment.amount, 0),
    })
  }
  if (plan.plannedSavings > 0) {
    rows.push({
      key: 'savings',
      label: 'Planned savings',
      detail: 'Monthly contributions across your goals',
      amount: plan.plannedSavings,
    })
  }
  if (plan.discretionary > 0) {
    rows.push({
      key: 'free',
      label: 'Free to spend',
      detail: 'Everything nobody has claimed yet',
      amount: plan.discretionary,
      isRemainder: true,
    })
  }

  return rows.map((row, index) => ({ ...row, color: seriesColor(index, mode) }))
}

function salaryTiming(days: number): string {
  if (days <= 0) return 'Credited today'
  if (days === 1) return 'Lands tomorrow'
  return `Lands in ${days} days`
}

function SalaryDay() {
  const state = useAppState()
  const mode = useChartMode()
  const plan = useMemo(() => salaryDayPlan(state), [state])
  const segments = useMemo(() => buildAllocation(plan, mode), [plan, mode])
  const flow = FLOW_COLORS[mode]

  // A running balance turns the list into a real waterfall: each row says what
  // is left of the pay-cheque once that claim is honoured.
  const rows = useMemo(() => {
    let left = plan.income
    return segments.map((segment) => {
      if (!segment.isRemainder) left -= segment.amount
      return { ...segment, left }
    })
  }, [segments, plan.income])

  const claimed = plan.totalCommitted + plan.plannedSavings
  // When commitments overshoot the pay-cheque the bar has to be wider than the
  // salary, otherwise the overspend simply would not fit on screen.
  const barTotal = Math.max(plan.income, claimed) || 1
  const overspent = plan.discretionary < 0
  const commitmentRatio = plan.income > 0 ? (plan.totalCommitted / plan.income) * 100 : 0
  const nothingClaimed = plan.commitments.length === 0 && plan.plannedSavings === 0

  if (plan.income <= 0) {
    return (
      <Card>
        <EmptyState
          icon={<Wallet className="h-5 w-5" />}
          title="No salary on file"
          message="Salary-day planning needs a take-home figure and the day it lands. Add both in Settings and this view fills itself in."
          action={
            <Button variant="primary" onClick={() => (window.location.hash = '#/settings')}>
              Add my salary
            </Button>
          }
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            Next salary
          </p>
          <p className="mt-2.5 text-[32px] leading-none font-semibold tracking-[-0.03em] text-ink sm:text-[36px]">
            {formatDate(plan.salaryDate)}
          </p>
          <p className="mt-2 text-[13px] text-ink-secondary">{salaryTiming(plan.daysAway)}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone="brand" icon={<Wallet className="h-3 w-3" />}>
              {formatCurrency(plan.income)} expected
            </Badge>
            {overspent ? (
              <StatusBadge status="critical">
                Short by {formatCurrency(Math.abs(plan.discretionary))}
              </StatusBadge>
            ) : commitmentRatio >= 70 ? (
              <StatusBadge status="warning">{Math.round(commitmentRatio)}% already spoken for</StatusBadge>
            ) : (
              <StatusBadge status="good">Comfortable headroom</StatusBadge>
            )}
          </div>
          <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
            Dues are drawn from your loans, recurring contributions, card bills and the most recent rent payment.
          </p>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-8">
          <StatTile
            label="Committed"
            value={formatCurrency(plan.totalCommitted)}
            sub={`${plan.commitments.length} due${plan.commitments.length === 1 ? '' : 's'} before the next credit`}
            icon={<Landmark className="h-4 w-4" />}
            accent={flow.expense}
          />
          <StatTile
            label="Planned savings"
            value={formatCurrency(plan.plannedSavings)}
            sub="Goal contributions you have already promised yourself"
            icon={<PiggyBank className="h-4 w-4" />}
            accent={flow.net}
          />
          <StatTile
            label="Free to spend"
            value={
              overspent ? formatSignedCurrency(plan.discretionary) : formatCurrency(plan.discretionary)
            }
            sub={
              overspent
                ? 'Commitments exceed this pay-cheque — something has to give'
                : `About ${formatCompactCurrency(plan.discretionary / 30)} a day across the month`
            }
            icon={<Wallet className="h-4 w-4" />}
            accent={flow.income}
          />
          <StatTile
            label="Commitment ratio"
            value={formatPercent(commitmentRatio, 0)}
            upIsGood={false}
            sub="Share of the paycheque owed before you spend a dollar"
            icon={<Gauge className="h-4 w-4" />}
            accent={flow.expense}
          />
        </div>
      </div>

      <Card>
        <CardHeader
          title="Where this pay-cheque goes"
          subtitle="Claims in due-date order, ending with what is actually yours"
          icon={<CalendarDays className="h-4 w-4" />}
        />

        {nothingClaimed ? (
          <EmptyState
            className="mt-4"
            compact
            icon={<PiggyBank className="h-5 w-5" />}
            title="Nothing is claimed yet"
            message="No loan payments, recurring contributions, card bills or goal contributions are on file, so the whole paycheque is discretionary."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" variant="primary" onClick={() => (window.location.hash = '#/savings')}>
                  Add a savings goal
                </Button>
                <Button size="sm" onClick={() => (window.location.hash = '#/loans')}>
                  Add a loan
                </Button>
              </div>
            }
          />
        ) : (
          <>
            {/* The bar is decorative — every segment is repeated as a labelled row
                below, so colour is never the only carrier of meaning. */}
            <div className="relative mt-5">
              <div aria-hidden="true" className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full">
                {segments.map((segment) => (
                  <span
                    key={segment.key}
                    title={`${segment.label} · ${formatCurrency(segment.amount)}`}
                    className="h-full min-w-[3px] first:rounded-l-full last:rounded-r-full"
                    style={{
                      width: `${(segment.amount / barTotal) * 100}%`,
                      backgroundColor: segment.color,
                    }}
                  />
                ))}
              </div>
              {overspent ? (
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-ink"
                  style={{ left: `${(plan.income / barTotal) * 100}%` }}
                />
              ) : null}
            </div>
            {overspent ? (
              <p className="mt-2 text-[11.5px] text-muted">
                The dark marker is where the {formatCurrency(plan.income)} pay-cheque runs out.
              </p>
            ) : null}

            <ul className="mt-4 divide-y divide-hairline">
              <li className="flex items-start gap-3 py-2.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-ink">
                  <Wallet className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-ink">Salary credited</p>
                  <p className="truncate text-[12px] text-muted">{formatDate(plan.salaryDate)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular text-[13.5px] font-semibold text-positive">
                    {formatSignedCurrency(plan.income)}
                  </p>
                  <p className="text-[11.5px] text-muted">starting balance</p>
                </div>
              </li>

              {rows.map((row) => (
                <li key={row.key} className="flex items-start gap-3 py-2.5">
                  {/* Same 32px gutter as the salary row above, so the dots line
                      up under the icon rather than floating half a step left. */}
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center">
                    <SeriesDot color={row.color} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-ink">{row.label}</p>
                    <p className="truncate text-[12px] text-muted">{row.detail}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        'tabular text-[13.5px] font-semibold',
                        row.isRemainder ? 'text-ink' : 'text-ink-secondary',
                      )}
                    >
                      {row.isRemainder ? formatCurrency(row.amount) : `−${formatCurrency(row.amount)}`}
                    </p>
                    <p className="tabular text-[11.5px] text-muted">
                      {row.isRemainder ? 'left over' : `${formatCurrency(row.left)} left`}
                    </p>
                  </div>
                </li>
              ))}

              {overspent ? (
                <li className="flex items-start gap-3 py-2.5">
                  <span className="mt-0.5 h-8 w-8 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-ink">Free to spend</p>
                    <p className="text-[12px] text-muted">
                      Commitments run past the pay-cheque — cover it from savings or move a due date.
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-[13.5px] font-semibold text-negative">
                      {formatSignedCurrency(plan.discretionary)}
                    </p>
                    <StatusBadge status="critical" className="mt-1">
                      Shortfall
                    </StatusBadge>
                  </div>
                </li>
              ) : null}
            </ul>
          </>
        )}
      </Card>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Cash flow                                                                  */
/* -------------------------------------------------------------------------- */

type Horizon = '3' | '6' | '12'

function CashFlow() {
  const state = useAppState()
  const mode = useChartMode()
  const [horizon, setHorizon] = useState<Horizon>('6')
  const forecast = useMemo(() => cashFlowForecast(state, Number(horizon)), [state, horizon])
  const flow = FLOW_COLORS[mode]

  const first = forecast[0]
  const last = forecast[forecast.length - 1]
  const hasData = forecast.some(
    (row) => row.income > 0 || row.committed > 0 || row.variable > 0 || row.savings > 0,
  )
  const shortfall = forecast.find((row) => row.closingBalance < 0)
  const lowest = forecast.reduce((worst, row) => (row.closingBalance < worst.closingBalance ? row : worst), first)
  const monthlyOutgoings = first.committed + first.variable + first.savings

  const chartData = forecast.map((row) => ({
    label: monthShort(row.month),
    Income: row.income,
    Outflow: row.committed + row.variable + row.savings,
    'Closing balance': row.closingBalance,
  }))

  // The chart and the table share one horizon; each gets its own control so the
  // one you can see is always the one that moves.
  const horizonPicker = (ariaLabel: string) => (
    <Segmented
      size="sm"
      ariaLabel={ariaLabel}
      value={horizon}
      onChange={setHorizon}
      options={[
        { value: '3', label: '3M' },
        { value: '6', label: '6M' },
        { value: '12', label: '12M' },
      ]}
    />
  )

  const emptyState = (
    <EmptyState
      compact
      icon={<TrendingUp className="h-5 w-5" />}
      title="Nothing to forecast yet"
      message="A forecast needs a salary, some recorded spending, or at least one commitment. Add any of them and the next months appear here."
      action={
        <Button size="sm" variant="primary" onClick={() => (window.location.hash = '#/settings')}>
          Set up my salary
        </Button>
      }
    />
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Monthly surplus"
          value={formatSignedCurrency(first.net)}
          sub="Income less commitments, savings and average variable spend"
          icon={<TrendingUp className="h-4 w-4" />}
          accent={flow.net}
        />
        <StatTile
          label="Committed each month"
          value={formatCurrency(first.committed)}
          sub="Rent, loan payments and recurring contributions — known to the dollar"
          icon={<Landmark className="h-4 w-4" />}
          accent={flow.expense}
        />
        <StatTile
          label="Average variable spend"
          value={formatCurrency(first.variable)}
          sub="Trailing six-month average of everything discretionary"
          icon={<Coins className="h-4 w-4" />}
          accent={flow.expense}
        />
        <StatTile
          label={`Balance in ${horizon} months`}
          value={formatCurrency(last.closingBalance)}
          sub={`Projected for the end of ${last.label}`}
          icon={<Wallet className="h-4 w-4" />}
          accent={flow.income}
        />
      </div>

      {hasData ? (
        <div className="flex flex-wrap items-center gap-2">
          {shortfall ? (
            <StatusBadge status="critical">
              Balance goes negative in {shortfall.label} ({formatCurrency(shortfall.closingBalance)})
            </StatusBadge>
          ) : lowest.closingBalance < monthlyOutgoings ? (
            <StatusBadge status="warning">
              Thinnest point {formatCurrency(lowest.closingBalance)} in {lowest.label} — under one month of
              outgoings
            </StatusBadge>
          ) : (
            <StatusBadge status="good">Balance stays above a month of outgoings throughout</StatusBadge>
          )}
        </div>
      ) : null}

      {/* Income is an inflow and the rest are outflows, so they are never stacked
          together — two columns on one dollar axis, with the balance as a line. */}
      <ChartFrame
        title="Money in against money out"
        subtitle={`Next ${horizon} months at today's commitments`}
        height={280}
        action={horizonPicker('Forecast horizon for the chart')}
        legend={[
          { label: 'Income', color: flow.income },
          { label: 'Outflow', color: flow.expense },
          { label: 'Closing balance', color: flow.net },
        ]}
        table={{
          columns: ['Month', 'Income', 'Outflow', 'Closing balance'],
          numericFrom: 1,
          rows: forecast.map((row) => [
            row.label,
            formatCurrency(row.income),
            formatCurrency(row.committed + row.variable + row.savings),
            formatCurrency(row.closingBalance),
          ]),
        }}
        empty={hasData ? undefined : emptyState}
        footnote="Committed outflows are exact: rent is your latest recorded payment, loan payments come from active loans and contributions from active investments. Variable spend is the trailing six-month average of everything else, so an unusual month ahead will not show up here. Income assumes your pay stays flat."
      >
        <ColumnChart
          data={chartData}
          xKey="label"
          series={[
            { key: 'Income', label: 'Income', color: flow.income },
            { key: 'Outflow', label: 'Outflow', color: flow.expense },
            { key: 'Closing balance', label: 'Closing balance', color: flow.net, asLine: true },
          ]}
        />
      </ChartFrame>

      <Card>
        <CardHeader
          title="Month by month"
          subtitle="The same forecast in full, including what each part is made of"
          action={horizonPicker('Forecast horizon for the table')}
        />
        {hasData ? (
          <TableWrap className="mt-3">
            <thead>
              <tr>
                <Th>Month</Th>
                <Th align="right">Income</Th>
                <Th align="right">Committed</Th>
                <Th align="right">Variable</Th>
                <Th align="right">Savings</Th>
                <Th align="right">Net</Th>
                <Th align="right">Closing balance</Th>
              </tr>
            </thead>
            <tbody>
              {forecast.map((row) => (
                <Tr key={row.month}>
                  <Td className="font-medium whitespace-nowrap">{row.label}</Td>
                  <Td align="right" className="tabular text-ink-secondary">
                    {formatCurrency(row.income)}
                  </Td>
                  <Td align="right" className="tabular text-ink-secondary">
                    {formatCurrency(row.committed)}
                  </Td>
                  <Td align="right" className="tabular text-ink-secondary">
                    {formatCurrency(row.variable)}
                  </Td>
                  <Td align="right" className="tabular text-ink-secondary">
                    {formatCurrency(row.savings)}
                  </Td>
                  <Td
                    align="right"
                    className={cn('tabular font-medium', row.net < 0 ? 'text-negative' : 'text-positive')}
                  >
                    {formatSignedCurrency(row.net)}
                  </Td>
                  <Td align="right">
                    {row.closingBalance < 0 ? (
                      <StatusBadge status="critical">{formatCurrency(row.closingBalance)}</StatusBadge>
                    ) : (
                      <span className="tabular font-medium text-ink">{formatCurrency(row.closingBalance)}</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <div className="mt-4">{emptyState}</div>
        )}
        <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
          The opening balance is today's bank and cash assets. Credit-card dues are not deducted here — they
          appear as spending in the month you record the payment.
        </p>
      </Card>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Financial independence                                                     */
/* -------------------------------------------------------------------------- */

interface ScenarioInputs {
  monthlyInvestment: number
  returnRate: number
  monthlyExpenses: number
}

/**
 * Re-derives the FI picture from what-if inputs using exactly the arithmetic in
 * `fiStatus`, so an untouched scenario reproduces the stored numbers to the
 * dollar. The corpus itself is never a what-if: it is money you actually have.
 */
function deriveFi(base: FiStatus, safeWithdrawalRate: number, input: ScenarioInputs): FiStatus {
  const annualExpenses = input.monthlyExpenses * 12
  const fiNumber = annualExpenses > 0 ? (annualExpenses * 100) / safeWithdrawalRate : 0
  const corpus = Math.max(0, base.currentCorpus)
  const yearsToFi = yearsToTarget(corpus, input.monthlyInvestment, input.returnRate, fiNumber)

  return {
    monthlyExpenses: input.monthlyExpenses,
    annualExpenses,
    fiNumber,
    currentCorpus: base.currentCorpus,
    percent: fiNumber > 0 ? Math.min(100, (corpus / fiNumber) * 100) : 0,
    yearsToFi,
    targetYear: yearsToFi == null ? null : new Date().getFullYear() + Math.ceil(yearsToFi),
    monthlyInvestment: input.monthlyInvestment,
    monthsOfFreedom: input.monthlyExpenses > 0 ? corpus / input.monthlyExpenses : 0,
  }
}

function numberError(raw: string, min: number, max: number, message: string): string | undefined {
  const value = Number(raw)
  if (raw.trim() === '' || !Number.isFinite(value)) return message
  if (value < min || value > max) return message
  return undefined
}

function Independence() {
  const state = useAppState()
  const mode = useChartMode()
  const toast = useToast()
  const fi = useMemo(() => fiStatus(state), [state])
  const swr = state.settings.safeWithdrawalRate > 0 ? state.settings.safeWithdrawalRate : 4

  const defaults = useMemo(
    () => ({
      monthlyInvestment: Math.round(fi.monthlyInvestment),
      returnRate: state.settings.expectedReturnRate,
      monthlyExpenses: Math.round(fi.monthlyExpenses),
    }),
    [fi.monthlyInvestment, fi.monthlyExpenses, state.settings.expectedReturnRate],
  )

  // Scenario inputs live here and nowhere else — nothing on this tab writes to
  // the store, so a wild "what if" can never corrupt the real plan.
  const [draft, setDraft] = useState(() => ({
    monthlyInvestment: String(Math.round(fi.monthlyInvestment)),
    returnRate: String(state.settings.expectedReturnRate),
    monthlyExpenses: String(Math.round(fi.monthlyExpenses)),
  }))
  const [confirmReset, setConfirmReset] = useState(false)

  const errors = {
    monthlyInvestment: numberError(draft.monthlyInvestment, 0, 1e9, 'Enter $0 or more'),
    returnRate: numberError(draft.returnRate, 0, 40, 'Use a rate between 0% and 40%'),
    monthlyExpenses: numberError(draft.monthlyExpenses, 1, 1e9, 'Enter what a month of life costs'),
  }

  // An invalid field falls back to its saved value so the chart keeps rendering
  // while the user is halfway through typing.
  const scenario: ScenarioInputs = {
    monthlyInvestment: errors.monthlyInvestment ? defaults.monthlyInvestment : Number(draft.monthlyInvestment),
    returnRate: errors.returnRate ? defaults.returnRate : Number(draft.returnRate),
    monthlyExpenses: errors.monthlyExpenses ? defaults.monthlyExpenses : Number(draft.monthlyExpenses),
  }

  const changed =
    scenario.monthlyInvestment !== defaults.monthlyInvestment ||
    scenario.returnRate !== defaults.returnRate ||
    scenario.monthlyExpenses !== defaults.monthlyExpenses
  const edited =
    draft.monthlyInvestment !== String(defaults.monthlyInvestment) ||
    draft.returnRate !== String(defaults.returnRate) ||
    draft.monthlyExpenses !== String(defaults.monthlyExpenses)

  const view = changed ? deriveFi(fi, swr, scenario) : fi
  const corpus = Math.max(0, view.currentCorpus)

  const projection = useMemo(
    () => projectCorpus(corpus, scenario.monthlyInvestment, scenario.returnRate, 25),
    [corpus, scenario.monthlyInvestment, scenario.returnRate],
  )

  const investedColor = seriesColor(1, mode)
  const valueColor = seriesColor(0, mode)

  const reset = () => {
    setDraft({
      monthlyInvestment: String(defaults.monthlyInvestment),
      returnRate: String(defaults.returnRate),
      monthlyExpenses: String(defaults.monthlyExpenses),
    })
    setConfirmReset(false)
    toast.success('Scenario reset to your saved settings.')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader
            title="Financial independence"
            subtitle="The corpus that pays for your life without a salary"
            icon={<Compass className="h-4 w-4" />}
            action={changed ? <StatusBadge status="info">Scenario</StatusBadge> : undefined}
          />

          {view.fiNumber <= 0 ? (
            <EmptyState
              className="mt-4"
              compact
              icon={<Compass className="h-5 w-5" />}
              title="No FI number yet"
              message="Tell us what a month of your life costs — below, or permanently in Settings — and we work out the corpus that covers it forever."
              action={
                <Button size="sm" variant="primary" onClick={() => (window.location.hash = '#/settings')}>
                  Open Settings
                </Button>
              }
            />
          ) : (
            <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-center">
              <RingProgress
                value={view.percent}
                size={156}
                thickness={12}
                tone={view.percent >= 100 ? 'good' : 'brand'}
              >
                <span className="text-[26px] leading-none font-semibold tracking-[-0.02em] text-ink">
                  {formatPercent(view.percent, view.percent < 10 ? 1 : 0)}
                </span>
                <span className="mt-1 text-[11px] text-muted">of the way there</span>
              </RingProgress>

              <dl className="w-full min-w-0 flex-1 divide-y divide-hairline">
                <div className="flex items-baseline justify-between gap-3 pb-2.5">
                  <dt className="text-[13px] text-muted">FI number</dt>
                  <dd className="tabular text-[15px] font-semibold text-ink">
                    {formatCurrency(view.fiNumber)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 py-2.5">
                  <dt className="text-[13px] text-muted">Current corpus</dt>
                  <dd className="tabular text-[15px] font-medium text-ink-secondary">
                    {formatCurrency(view.currentCorpus)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 pt-2.5">
                  <dt className="text-[13px] text-muted">Months of freedom</dt>
                  <dd className="text-right">
                    <span className="tabular block text-[15px] font-medium text-ink-secondary">
                      {formatNumber(view.monthsOfFreedom, view.monthsOfFreedom < 10)} months
                    </span>
                    <span className="block text-[11.5px] text-muted">
                      {formatTenure(view.monthsOfFreedom)} without earning
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
          )}

          <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
            The corpus counts investments, savings goals and bank balances, minus loans and card dues. Property
            and vehicles are left out — you cannot live off a roof you sleep under.
          </p>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-7">
          <StatTile
            label="FI number"
            value={formatCurrency(view.fiNumber)}
            sub={`${formatCurrency(view.monthlyExpenses)} a month at a ${formatPercent(swr)} withdrawal rate`}
            icon={<Target className="h-4 w-4" />}
            accent={valueColor}
          />
          <StatTile
            label="Current corpus"
            value={formatCurrency(view.currentCorpus)}
            sub={`${formatCompactCurrency(Math.max(0, view.fiNumber - corpus))} still to build`}
            icon={<Coins className="h-4 w-4" />}
            accent={investedColor}
          />
          <StatTile
            label="Years to FI"
            value={view.yearsToFi == null ? '—' : `${formatNumber(view.yearsToFi, true)} yrs`}
            sub={
              view.yearsToFi == null
                ? 'Out of reach on these numbers — raise the monthly investment or trim the target'
                : `Investing ${formatCurrency(scenario.monthlyInvestment)} a month at ${formatPercent(scenario.returnRate)}`
            }
            icon={<Hourglass className="h-4 w-4" />}
            accent={valueColor}
          />
          <StatTile
            label="Target year"
            value={view.targetYear ?? '—'}
            sub={
              view.targetYear == null
                ? 'No crossing point inside 80 years'
                : `You would be free from ${view.targetYear} onwards`
            }
            icon={<CalendarDays className="h-4 w-4" />}
            accent={investedColor}
          />
        </div>
      </div>

      <Card>
        <CardHeader
          title="What if…"
          subtitle="Try different numbers. Nothing here is saved — your Settings stay exactly as they are."
          icon={<Gauge className="h-4 w-4" />}
          action={
            <Button
              size="sm"
              icon={<RotateCcw className="h-4 w-4" />}
              disabled={!edited}
              onClick={() => setConfirmReset(true)}
            >
              Reset to my settings
            </Button>
          }
        />

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            label="Monthly investment"
            error={errors.monthlyInvestment}
            hint={`Saved: ${formatCurrency(defaults.monthlyInvestment)}`}
          >
            {(id) => (
              <CurrencyInput
                id={id}
                value={draft.monthlyInvestment}
                invalid={Boolean(errors.monthlyInvestment)}
                step="500"
                onChange={(event) => setDraft((d) => ({ ...d, monthlyInvestment: event.target.value }))}
              />
            )}
          </Field>

          <Field
            label="Expected return"
            error={errors.returnRate}
            hint={`Percent a year. Saved: ${formatPercent(defaults.returnRate)}`}
          >
            {(id) => (
              <TextInput
                id={id}
                type="number"
                inputMode="decimal"
                min={0}
                max={40}
                step="0.5"
                className="tabular"
                value={draft.returnRate}
                invalid={Boolean(errors.returnRate)}
                onChange={(event) => setDraft((d) => ({ ...d, returnRate: event.target.value }))}
              />
            )}
          </Field>

          <Field
            label="Monthly expenses"
            error={errors.monthlyExpenses}
            hint={`Saved: ${formatCurrency(defaults.monthlyExpenses)}`}
          >
            {(id) => (
              <CurrencyInput
                id={id}
                value={draft.monthlyExpenses}
                invalid={Boolean(errors.monthlyExpenses)}
                step="1000"
                onChange={(event) => setDraft((d) => ({ ...d, monthlyExpenses: event.target.value }))}
              />
            )}
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {changed ? (
            <StatusBadge status="info">Scenario only — these values are not saved</StatusBadge>
          ) : (
            <Badge tone="neutral">Showing your saved settings</Badge>
          )}
          <a
            href={hrefFor('/settings')}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"
          >
            Make these permanent <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </Card>

      <ChartFrame
        title="Corpus projection"
        subtitle="Twenty-five years of compounding at the numbers above"
        height={300}
        legend={[
          { label: 'Projected value', color: valueColor },
          { label: 'Invested', color: investedColor, dashed: true },
        ]}
        table={{
          columns: ['Year', 'Invested', 'Projected value'],
          numericFrom: 1,
          rows: projection.map((point) => [
            String(point.year),
            formatCurrency(point.invested),
            formatCurrency(point.value),
          ]),
        }}
        empty={
          scenario.monthlyInvestment <= 0 && corpus <= 0 ? (
            <EmptyState
              compact
              icon={<TrendingUp className="h-5 w-5" />}
              title="Nothing to compound yet"
              message="With no corpus and no monthly investment there is no curve to draw. Start a recurring contribution or a savings goal and it appears here."
              action={
                <Button size="sm" variant="primary" onClick={() => (window.location.hash = '#/investments')}>
                  Start investing
                </Button>
              }
            />
          ) : undefined
        }
        footnote={`Compounded monthly on today's corpus of ${formatCompactCurrency(corpus)}, adding ${formatCurrency(scenario.monthlyInvestment)} every month at ${formatPercent(scenario.returnRate)} a year. Steady returns are an assumption, not a promise, and inflation of ${formatPercent(state.settings.inflationRate)} is not deducted — the FI number is priced in today's dollars.`}
      >
        <TrendChart
          data={projection.map((point) => ({
            year: String(point.year),
            'Projected value': point.value,
            Invested: point.invested,
          }))}
          xKey="year"
          series={[
            { key: 'Projected value', label: 'Projected value', color: valueColor, kind: 'area' },
            { key: 'Invested', label: 'Invested', color: investedColor, kind: 'line', dashed: true },
          ]}
          reference={view.fiNumber > 0 ? { value: view.fiNumber, label: 'FI number' } : undefined}
        />
      </ChartFrame>

      <ConfirmDialog
        open={confirmReset}
        title="Discard this scenario?"
        message="The three inputs go back to the values saved in Settings. Nothing on this page was ever saved, so there is nothing else to undo."
        confirmLabel="Discard"
        onConfirm={reset}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  )
}
