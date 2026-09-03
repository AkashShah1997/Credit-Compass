import { useMemo, useState } from 'react'
import {
  CalendarClock,
  Coins,
  Landmark,
  LineChart,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useActions, useAppState } from '../store/AppStore'
import { useChartMode } from '../store/ThemeProvider'
import {
  allocationByType,
  investmentGain,
  portfolioGrowth,
  summariseInvestments,
} from '../lib/finance'
import {
  currentMonthKey,
  formatDate,
  formatDateShort,
  monthRange,
  monthShort,
  nextDueDate,
  relativeDay,
  todayISO,
} from '../lib/date'
import {
  formatCompactCurrency,
  formatCurrency,
  formatNumber,
  formatPercent,
  formatSignedCurrency,
  formatSignedPercent,
} from '../lib/format'
import { investmentColor, seriesColor } from '../lib/palette'
import { INVESTMENT_TYPES } from '../types'
import type { Investment, InvestmentType } from '../types'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Button, IconButton } from '../components/ui/Button'
import { StatTile } from '../components/ui/StatTile'
import { Badge, SeriesDot, StatusBadge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Segmented } from '../components/ui/Tabs'
import { TableWrap, Td, Th, Tr } from '../components/ui/Table'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { CurrencyInput, Field, SelectInput, Switch, TextArea, TextInput } from '../components/ui/Field'
import { useToast } from '../components/ui/Toast'
import { ChartFrame } from '../components/charts/ChartFrame'
import { TrendChart } from '../components/charts/TrendChart'
import { DonutChart } from '../components/charts/DonutChart'
import { cn } from '../lib/cn'

type SortKey = 'value' | 'return' | 'name'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'value', label: 'Value' },
  { value: 'return', label: 'Return' },
  { value: 'name', label: 'Name' },
]

/** A contribution with no explicit debit day still has to land somewhere on the calendar. */
const DEFAULT_CONTRIBUTION_DAY = 1

export default function Investments() {
  const state = useAppState()
  const actions = useActions()
  const toast = useToast()
  const mode = useChartMode()

  const [sort, setSort] = useState<SortKey>('value')
  const [typeFilter, setTypeFilter] = useState<InvestmentType | 'all'>('all')
  const [formFor, setFormFor] = useState<{ investment: Investment | null } | null>(null)
  const [valueFor, setValueFor] = useState<Investment | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Investment | null>(null)

  const investments = state.investments
  const summary = useMemo(() => summariseInvestments(investments), [investments])
  const months = useMemo(() => monthRange(12), [])
  const growth = useMemo(() => portfolioGrowth(investments, months), [investments, months])
  const allocation = useMemo(() => allocationByType(investments), [investments])

  const investedColor = seriesColor(1, mode)
  const valueColor = seriesColor(0, mode)

  // Only offer filters for types the portfolio actually holds — an empty result
  // set is a dead end, not a feature.
  const presentTypes = useMemo(
    () => INVESTMENT_TYPES.filter((type) => investments.some((inv) => inv.type === type)),
    [investments],
  )

  const visible = useMemo(() => {
    const rows = investments.filter((inv) => typeFilter === 'all' || inv.type === typeFilter)
    return [...rows].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'return') return investmentGain(b).percent - investmentGain(a).percent
      return b.currentValue - a.currentValue
    })
  }, [investments, typeFilter, sort])

  const recurring = useMemo(
    () =>
      investments
        .filter((inv) => inv.active && (inv.monthlyAmount ?? 0) > 0)
        .map((inv) => ({ inv, day: inv.contributionDay ?? DEFAULT_CONTRIBUTION_DAY }))
        .sort((a, b) => a.day - b.day || a.inv.name.localeCompare(b.inv.name)),
    [investments],
  )

  const growthData = growth.map((row) => ({
    label: monthShort(row.month),
    'Current value': row.value,
    Invested: row.invested,
  }))

  const donutData = allocation.map((row) => ({
    name: row.type,
    value: row.value,
    color: investmentColor(row.type, mode),
  }))

  const nextContributionDate = recurring.length ? recurring.map((s) => nextDueDate(s.day)).sort()[0] : null

  function handleDelete() {
    if (!pendingDelete) return
    actions.removeInvestment(pendingDelete.id)
    toast.success(`${pendingDelete.name} removed from your portfolio`)
    setPendingDelete(null)
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Investments"
        subtitle={`${summary.activeCount} active holding${summary.activeCount === 1 ? '' : 's'} worth ${formatCurrency(summary.currentValue)} today.`}
        action={
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setFormFor({ investment: null })}
          >
            Add investment
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Portfolio value"
          value={formatCurrency(summary.currentValue)}
          sub={`Across ${investments.length} holding${investments.length === 1 ? '' : 's'}`}
          icon={<Wallet className="h-4 w-4" />}
          accent={valueColor}
          trend={growth.map((row) => row.value)}
          trendColor={valueColor}
        />
        <StatTile
          label="Total invested"
          value={formatCurrency(summary.invested)}
          sub="Capital you have actually put in"
          icon={<Landmark className="h-4 w-4" />}
          accent={investedColor}
          trend={growth.map((row) => row.invested)}
          trendColor={investedColor}
        />
        <StatTile
          label="Unrealised gain"
          value={
            <span className={summary.gain >= 0 ? 'text-positive' : 'text-negative'}>
              {formatSignedCurrency(summary.gain)}
            </span>
          }
          sub={
            summary.invested > 0
              ? `On ${formatCompactCurrency(summary.invested)} invested`
              : 'Add a holding to track returns'
          }
          delta={summary.invested > 0 ? summary.gainPercent : null}
          deltaLabel="overall return"
          upIsGood
          icon={
            summary.gain >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />
          }
          accent={summary.gain >= 0 ? valueColor : investedColor}
        />
        <StatTile
          label="Monthly contributions"
          value={formatCurrency(summary.monthlyContribution)}
          sub={
            nextContributionDate
              ? `${recurring.length} recurring contribution${recurring.length === 1 ? '' : 's'} · next debit ${relativeDay(nextContributionDate)}`
              : 'No recurring instalments set up'
          }
          icon={<CalendarClock className="h-4 w-4" />}
          accent={seriesColor(2, mode)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <ChartFrame
          className="lg:col-span-7"
          title="Invested vs current value"
          subtitle="Twelve months of month-end snapshots"
          height={272}
          legend={[
            { label: 'Current value', color: valueColor },
            { label: 'Invested', color: investedColor, dashed: true },
          ]}
          table={{
            columns: ['Month', 'Invested', 'Value', 'Gain'],
            numericFrom: 1,
            rows: growth.map((row) => [
              row.label,
              formatCurrency(row.invested),
              formatCurrency(row.value),
              formatSignedCurrency(row.value - row.invested),
            ]),
          }}
          footnote="Each point is the holding's own snapshot for that month. Use “Update value” on a holding to add this month's point."
          empty={
            investments.length === 0 ? (
              <EmptyState
                compact
                icon={<LineChart className="h-5 w-5" />}
                title="Nothing invested yet"
                message="Add your first TFSA, RRSP or GIC to start plotting growth."
                action={
                  <Button size="sm" variant="primary" onClick={() => setFormFor({ investment: null })}>
                    Add investment
                  </Button>
                }
              />
            ) : undefined
          }
        >
          <TrendChart
            data={growthData}
            xKey="label"
            series={[
              { key: 'Current value', label: 'Current value', color: valueColor, kind: 'area' },
              { key: 'Invested', label: 'Invested', color: investedColor, kind: 'line', dashed: true },
            ]}
          />
        </ChartFrame>

        <ChartFrame
          className="lg:col-span-5"
          title="Allocation"
          subtitle={`${allocation.length} instrument type${allocation.length === 1 ? '' : 's'} in the mix`}
          height={272}
          legend={donutData.map((slice) => ({ label: slice.name, color: slice.color }))}
          table={{
            columns: ['Type', 'Value', 'Share'],
            numericFrom: 1,
            rows: allocation.map((row) => [row.type, formatCurrency(row.value), formatPercent(row.share)]),
          }}
          empty={
            allocation.length === 0 ? (
              <EmptyState
                compact
                icon={<Coins className="h-5 w-5" />}
                title="No allocation to show"
                message="Allocation appears once a holding carries a current value."
              />
            ) : undefined
          }
        >
          <DonutChart
            data={donutData}
            centerLabel="Portfolio"
            centerValue={formatCompactCurrency(summary.currentValue)}
          />
        </ChartFrame>
      </div>

      <Card>
        <CardHeader
          title="Holdings"
          subtitle={
            investments.length
              ? `Showing ${visible.length} of ${investments.length} holding${investments.length === 1 ? '' : 's'}`
              : 'Everything you own, in one ledger'
          }
        />

        {/* The controls sit on their own wrapping row rather than in the card
            header — a shrink-0 header action would push the card sideways at
            375px, and the page body must never scroll horizontally. */}
        {investments.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Segmented ariaLabel="Sort holdings" options={SORT_OPTIONS} value={sort} onChange={setSort} />
            <SelectInput
              aria-label="Filter by investment type"
              className="text-[13px]"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as InvestmentType | 'all')}
            >
              <option value="all">All types</option>
              {presentTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </SelectInput>
          </div>
        ) : null}

        {investments.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={<TrendingUp className="h-5 w-5" />}
            title="Your portfolio is empty"
            message="Track your TFSA, RRSP, FHSA, GICs and other holdings together so you always know what your money is worth."
            action={
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setFormFor({ investment: null })}>
                Add investment
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            className="mt-4"
            compact
            icon={<Coins className="h-5 w-5" />}
            title="No holdings match this filter"
            message={`You have nothing under ${typeFilter}.`}
            action={
              <Button size="sm" onClick={() => setTypeFilter('all')}>
                Show all types
              </Button>
            }
          />
        ) : (
          <>
            <TableWrap className="mt-4 hidden lg:block">
              <thead>
                <tr>
                  <Th>Holding</Th>
                  <Th align="right">Invested</Th>
                  <Th align="right">Current value</Th>
                  <Th align="right">Gain / loss</Th>
                  <Th align="right">Return</Th>
                  <Th align="right">Monthly contribution</Th>
                  <Th align="right">Started</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((inv) => {
                  const { gain, percent } = investmentGain(inv)
                  return (
                    <Tr key={inv.id}>
                      <Td>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <SeriesDot color={investmentColor(inv.type, mode)} />
                          <div className="min-w-0">
                            <p className="truncate text-[13.5px] font-medium text-ink">{inv.name}</p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                              {inv.type}
                              {inv.units ? <span>· {formatNumber(inv.units, true)} units</span> : null}
                            </p>
                          </div>
                          {!inv.active ? <Badge tone="neutral">Paused</Badge> : null}
                        </div>
                      </Td>
                      <Td align="right" className="tabular text-ink-secondary">
                        {formatCurrency(inv.invested)}
                      </Td>
                      <Td align="right" className="tabular font-medium">
                        {formatCurrency(inv.currentValue)}
                      </Td>
                      <Td
                        align="right"
                        className={cn('tabular font-medium', gain >= 0 ? 'text-positive' : 'text-negative')}
                      >
                        {formatSignedCurrency(gain)}
                      </Td>
                      <Td
                        align="right"
                        className={cn('tabular', gain >= 0 ? 'text-positive' : 'text-negative')}
                      >
                        {formatSignedPercent(percent)}
                      </Td>
                      <Td align="right" className="tabular text-ink-secondary">
                        {inv.monthlyAmount ? formatCurrency(inv.monthlyAmount) : '—'}
                      </Td>
                      <Td align="right" className="whitespace-nowrap text-ink-secondary">
                        {formatDate(inv.startDate)}
                      </Td>
                      <Td align="right">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            label={`Update value of ${inv.name}`}
                            size="sm"
                            onClick={() => setValueFor(inv)}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </IconButton>
                          <IconButton
                            label={`Edit ${inv.name}`}
                            size="sm"
                            onClick={() => setFormFor({ investment: inv })}
                          >
                            <Pencil className="h-4 w-4" />
                          </IconButton>
                          <IconButton
                            label={`Delete ${inv.name}`}
                            size="sm"
                            onClick={() => setPendingDelete(inv)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </div>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <Td className="font-semibold">Total</Td>
                  <Td align="right" className="tabular font-semibold">
                    {formatCurrency(visible.reduce((s, i) => s + i.invested, 0))}
                  </Td>
                  <Td align="right" className="tabular font-semibold">
                    {formatCurrency(visible.reduce((s, i) => s + i.currentValue, 0))}
                  </Td>
                  <Td align="right" className="tabular font-semibold">
                    {formatSignedCurrency(visible.reduce((s, i) => s + (i.currentValue - i.invested), 0))}
                  </Td>
                  <Td colSpan={4} />
                </tr>
              </tfoot>
            </TableWrap>

            {/* Below lg the same rows read as cards — a horizontally scrolling
                eight-column table is unusable on a phone. */}
            <ul className="mt-4 flex flex-col gap-3 lg:hidden">
              {visible.map((inv) => (
                <li key={inv.id}>
                  <HoldingCard
                    investment={inv}
                    onUpdateValue={() => setValueFor(inv)}
                    onEdit={() => setFormFor({ investment: inv })}
                    onDelete={() => setPendingDelete(inv)}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <ContributionCalendar recurring={recurring} total={summary.monthlyContribution} onAdd={() => setFormFor({ investment: null })} />

      {formFor ? (
        <InvestmentFormModal
          investment={formFor.investment}
          onClose={() => setFormFor(null)}
        />
      ) : null}

      {valueFor ? <UpdateValueModal investment={valueFor} onClose={() => setValueFor(null)} /> : null}

      <ConfirmDialog
        open={pendingDelete != null}
        title="Delete this holding?"
        message={
          pendingDelete
            ? `${pendingDelete.name} and its ${pendingDelete.history.length}-month value history will be removed. Transactions already logged against it stay in your ledger.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Holdings — mobile card                                                     */
/* -------------------------------------------------------------------------- */

function HoldingCard({
  investment,
  onUpdateValue,
  onEdit,
  onDelete,
}: {
  investment: Investment
  onUpdateValue: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const mode = useChartMode()
  const { gain, percent } = investmentGain(investment)

  return (
    <div className="rounded-xl border border-hairline bg-surface-2 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <SeriesDot color={investmentColor(investment.type, mode)} />
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-medium text-ink">{investment.name}</p>
            <p className="mt-0.5 text-[12px] text-muted">
              {investment.type} · started {formatDateShort(investment.startDate)}
            </p>
          </div>
        </div>
        {!investment.active ? <Badge tone="neutral">Paused</Badge> : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        <div>
          <p className="text-[11.5px] text-muted">Invested</p>
          <p className="tabular text-[13.5px] text-ink-secondary">{formatCurrency(investment.invested)}</p>
        </div>
        <div className="text-right">
          <p className="text-[11.5px] text-muted">Current value</p>
          <p className="tabular text-[13.5px] font-semibold text-ink">
            {formatCurrency(investment.currentValue)}
          </p>
        </div>
        <div>
          <p className="text-[11.5px] text-muted">Gain / loss</p>
          <p className={cn('tabular text-[13.5px] font-medium', gain >= 0 ? 'text-positive' : 'text-negative')}>
            {formatSignedCurrency(gain)} ({formatSignedPercent(percent)})
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11.5px] text-muted">Monthly contribution</p>
          <p className="tabular text-[13.5px] text-ink-secondary">
            {investment.monthlyAmount ? formatCurrency(investment.monthlyAmount) : '—'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={onUpdateValue}>
          Update value
        </Button>
        <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={onEdit}>
          Edit
        </Button>
        <IconButton label={`Delete ${investment.name}`} size="sm" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Contribution calendar                                                      */
/* -------------------------------------------------------------------------- */

function ContributionCalendar({
  recurring,
  total,
  onAdd,
}: {
  recurring: { inv: Investment; day: number }[]
  total: number
  onAdd: () => void
}) {
  const mode = useChartMode()

  return (
    <Card>
      <CardHeader
        title="Contribution calendar"
        subtitle="Every recurring contribution, in the order it debits"
        icon={<CalendarClock className="h-4 w-4" />}
        action={
          recurring.length ? (
            <span className="text-right">
              <span className="tabular block text-[15px] font-semibold text-ink">{formatCurrency(total)}</span>
              <span className="block text-[11.5px] text-muted">per month</span>
            </span>
          ) : null
        }
      />

      {recurring.length === 0 ? (
        <EmptyState
          className="mt-4"
          compact
          icon={<CalendarClock className="h-5 w-5" />}
          title="No recurring contributions"
          message="Add a holding with a monthly amount and it will show up here with its debit date."
          action={
            <Button size="sm" variant="primary" onClick={onAdd}>
              Add a contribution
            </Button>
          }
        />
      ) : (
        <ul className="mt-2 divide-y divide-hairline">
          {recurring.map(({ inv, day }) => {
            const due = nextDueDate(day)
            const relative = relativeDay(due)
            const soon = relative === 'today' || relative === 'tomorrow'
            return (
              <li key={inv.id} className="flex items-center gap-3 py-2.5">
                <span
                  className="tabular flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-xl text-[13px] font-semibold"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${investmentColor(inv.type, mode)} 14%, transparent)`,
                    color: investmentColor(inv.type, mode),
                  }}
                  aria-hidden="true"
                >
                  {day}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{inv.name}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {ordinal(day)} of every month · next {formatDateShort(due)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tabular block text-[13.5px] font-semibold text-ink">
                    {formatCurrency(inv.monthlyAmount ?? 0)}
                  </span>
                  <span className={cn('block text-[11.5px]', soon ? 'font-medium text-serious' : 'text-muted')}>
                    {relative}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {recurring.length > 0 ? (
        <p className="mt-3 text-[11.5px] text-muted">
          Debit days are clamped to shorter months — a 31st contribution lands on the 30th in April.
        </p>
      ) : null}
    </Card>
  )
}

function ordinal(day: number): string {
  const teen = day % 100
  if (teen >= 11 && teen <= 13) return `${day}th`
  const last = day % 10
  return `${day}${last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th'}`
}

/* -------------------------------------------------------------------------- */
/* Add / edit                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Upsert this month's snapshot.
 *
 * The growth chart reads `history`, so any edit that changes what a holding is
 * worth has to leave a point behind for the current month — otherwise the chart
 * keeps drawing a stale value the numbers above it contradict.
 */
function withCurrentSnapshot(
  investment: Investment,
  invested: number,
  value: number,
): Investment['history'] {
  const month = currentMonthKey()
  return [...investment.history.filter((h) => h.month !== month), { month, invested, value }].sort((a, b) =>
    a.month.localeCompare(b.month),
  )
}

const toNumber = (input: string): number => {
  const parsed = Number(input.replace(/,/g, '').trim())
  return Number.isFinite(parsed) ? parsed : NaN
}

interface FormState {
  name: string
  type: InvestmentType
  invested: string
  currentValue: string
  monthlyAmount: string
  contributionDay: string
  units: string
  startDate: string
  active: boolean
  notes: string
}

function InvestmentFormModal({
  investment,
  onClose,
}: {
  investment: Investment | null
  onClose: () => void
}) {
  const actions = useActions()
  const toast = useToast()

  // Mounted only while open, so this initialiser doubles as the reset.
  const [form, setForm] = useState<FormState>(() => ({
    name: investment?.name ?? '',
    type: investment?.type ?? 'TFSA',
    invested: investment ? String(investment.invested) : '',
    currentValue: investment ? String(investment.currentValue) : '',
    monthlyAmount: investment?.monthlyAmount ? String(investment.monthlyAmount) : '',
    contributionDay: String(investment?.contributionDay ?? DEFAULT_CONTRIBUTION_DAY),
    units: investment?.units ? String(investment.units) : '',
    startDate: investment?.startDate ?? todayISO(),
    active: investment?.active ?? true,
    notes: investment?.notes ?? '',
  }))
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  // A contribution is opt-in for any account type: a TFSA topped up on payday, a
  // GIC never. Leaving the amount blank means a one-off holding.
  const hasContribution = form.monthlyAmount.trim() !== ''
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const invested = toNumber(form.invested)
  const currentValue = toNumber(form.currentValue)
  const previewGain =
    Number.isFinite(invested) && Number.isFinite(currentValue) && invested > 0
      ? { gain: currentValue - invested, percent: ((currentValue - invested) / invested) * 100 }
      : null

  function validate(): Partial<Record<keyof FormState, string>> {
    const next: Partial<Record<keyof FormState, string>> = {}
    if (!form.name.trim()) next.name = 'Give the holding a name'
    if (!Number.isFinite(invested) || invested <= 0) next.invested = 'Enter the capital you have put in'
    if (!Number.isFinite(currentValue) || currentValue < 0) next.currentValue = 'Enter what it is worth today'
    if (!form.startDate) next.startDate = 'Pick a start date'
    // A holding cannot begin in the future — that would put a snapshot ahead of
    // today and bend the growth chart.
    else if (form.startDate > todayISO()) next.startDate = 'Start date cannot be in the future'
    if (hasContribution) {
      const monthly = toNumber(form.monthlyAmount)
      if (!Number.isFinite(monthly) || monthly <= 0) next.monthlyAmount = 'Enter an amount above zero, or leave it blank'
      const day = toNumber(form.contributionDay)
      if (!Number.isFinite(day) || day < 1 || day > 28) next.contributionDay = 'Pick a day between 1 and 28'
    }
    if (form.units.trim()) {
      const units = toNumber(form.units)
      if (!Number.isFinite(units) || units <= 0) next.units = 'Units must be a positive number'
    }
    return next
  }

  function handleSubmit() {
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const units = form.units.trim() ? toNumber(form.units) : undefined
    const shared = {
      name: form.name.trim(),
      type: form.type,
      invested,
      currentValue,
      monthlyAmount: hasContribution ? toNumber(form.monthlyAmount) : undefined,
      contributionDay: hasContribution ? Math.round(toNumber(form.contributionDay)) : undefined,
      units,
      startDate: form.startDate,
      active: form.active,
      notes: form.notes.trim() || undefined,
    }

    if (investment) {
      actions.updateInvestment(investment.id, {
        ...shared,
        history: withCurrentSnapshot(investment, invested, currentValue),
      })
      toast.success(`${shared.name} updated`)
    } else {
      actions.addInvestment(shared)
      toast.success(`${shared.name} added to your portfolio`)
    }
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={investment ? 'Edit holding' : 'Add investment'}
      description={
        investment
          ? 'Changes are reflected in this month’s snapshot.'
          : 'Track a TFSA, RRSP, GIC or anything else you own.'
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit}>
            {investment ? 'Save changes' : 'Add investment'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required error={errors.name} className="sm:col-span-2">
          {(id) => (
            <TextInput
              id={id}
              value={form.name}
              invalid={Boolean(errors.name)}
              placeholder="e.g. Wealthsimple TFSA"
              onChange={(event) => set('name', event.target.value)}
            />
          )}
        </Field>

        <Field label="Type" required>
          {(id) => (
            <SelectInput
              id={id}
              value={form.type}
              onChange={(event) => set('type', event.target.value as InvestmentType)}
            >
              {INVESTMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>

        <Field label="Start date" required error={errors.startDate}>
          {(id) => (
            <TextInput
              id={id}
              type="date"
              max={todayISO()}
              value={form.startDate}
              invalid={Boolean(errors.startDate)}
              onChange={(event) => set('startDate', event.target.value)}
            />
          )}
        </Field>

        <Field label="Invested so far" required error={errors.invested}>
          {(id) => (
            <CurrencyInput
              id={id}
              value={form.invested}
              invalid={Boolean(errors.invested)}
              placeholder="0"
              onChange={(event) => set('invested', event.target.value)}
            />
          )}
        </Field>

        <Field
          label="Current value"
          required
          error={errors.currentValue}
          hint={
            previewGain ? (
              <span className={previewGain.gain >= 0 ? 'text-positive' : 'text-negative'}>
                {formatSignedCurrency(previewGain.gain)} ({formatSignedPercent(previewGain.percent)}) so far
              </span>
            ) : (
              'What the holding is worth today'
            )
          }
        >
          {(id) => (
            <CurrencyInput
              id={id}
              value={form.currentValue}
              invalid={Boolean(errors.currentValue)}
              placeholder="0"
              onChange={(event) => set('currentValue', event.target.value)}
            />
          )}
        </Field>

        <Field
          label="Monthly contribution"
          error={errors.monthlyAmount}
          hint="Optional — leave blank for a one-off holding"
        >
          {(id) => (
            <CurrencyInput
              id={id}
              value={form.monthlyAmount}
              invalid={Boolean(errors.monthlyAmount)}
              placeholder="0"
              onChange={(event) => set('monthlyAmount', event.target.value)}
            />
          )}
        </Field>

        <Field
          label="Debit day"
          error={errors.contributionDay}
          hint="1–28, so the date exists in every month"
        >
          {(id) => (
            <TextInput
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              max={28}
              value={form.contributionDay}
              invalid={Boolean(errors.contributionDay)}
              disabled={!hasContribution}
              onChange={(event) => set('contributionDay', event.target.value)}
            />
          )}
        </Field>

        <Field label="Units" error={errors.units} hint="Optional — grams, shares or fund units">
          {(id) => (
            <TextInput
              id={id}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.001"
              className="tabular"
              value={form.units}
              invalid={Boolean(errors.units)}
              placeholder="—"
              onChange={(event) => set('units', event.target.value)}
            />
          )}
        </Field>

        <div className="flex items-center rounded-xl border border-hairline bg-surface-2 px-3.5 py-3 sm:col-span-2">
          <Switch
            checked={form.active}
            onChange={(next) => set('active', next)}
            label="Active"
            description="Paused holdings stay in the portfolio but drop out of the contribution calendar and monthly outflow."
          />
        </div>

        <Field label="Notes" className="sm:col-span-2">
          {(id) => (
            <TextArea
              id={id}
              value={form.notes}
              placeholder="Folio number, broker, or why you bought it"
              onChange={(event) => set('notes', event.target.value)}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------------------- */
/* Update value                                                               */
/* -------------------------------------------------------------------------- */

function UpdateValueModal({ investment, onClose }: { investment: Investment; onClose: () => void }) {
  const actions = useActions()
  const toast = useToast()
  const [value, setValue] = useState(String(investment.currentValue))
  const [error, setError] = useState<string>()

  const parsed = toNumber(value)
  const valid = Number.isFinite(parsed) && parsed >= 0
  const change = valid ? parsed - investment.currentValue : 0
  const gain = valid ? parsed - investment.invested : 0

  function handleSave() {
    if (!valid) {
      setError('Enter the latest value')
      return
    }
    actions.updateInvestment(investment.id, {
      currentValue: parsed,
      history: withCurrentSnapshot(investment, investment.invested, parsed),
    })
    toast.success(`${investment.name} marked at ${formatCurrency(parsed)}`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Update value"
      description={investment.name}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave}>
            Save value
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Current value"
          required
          error={error}
          hint={`Last recorded ${formatCurrency(investment.currentValue)}`}
        >
          {(id) => (
            <CurrencyInput
              id={id}
              value={value}
              invalid={Boolean(error)}
              onChange={(event) => {
                setValue(event.target.value)
                setError(undefined)
              }}
            />
          )}
        </Field>

        <div className="flex flex-col gap-2 rounded-xl bg-surface-2 px-3.5 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-muted">Change from last entry</span>
            <span
              className={cn(
                'tabular text-[13px] font-semibold',
                change >= 0 ? 'text-positive' : 'text-negative',
              )}
            >
              {formatSignedCurrency(change)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-muted">
              Gain on {formatCurrency(investment.invested)} invested
            </span>
            <span
              className={cn('tabular text-[13px] font-semibold', gain >= 0 ? 'text-positive' : 'text-negative')}
            >
              {formatSignedCurrency(gain)}
            </span>
          </div>
          <div>
            <StatusBadge status={gain >= 0 ? 'good' : 'warning'}>
              {gain >= 0 ? 'Above cost' : 'Below cost'}
            </StatusBadge>
          </div>
        </div>

        <p className="text-[11.5px] leading-relaxed text-muted">
          Saving records a snapshot for {currentMonthKey()}, so the growth chart shows the value you actually
          saw this month.
        </p>
      </div>
    </Modal>
  )
}
