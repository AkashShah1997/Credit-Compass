/**
 * Reports — the reporting and export centre.
 *
 * One page, two lenses: a month in detail or a year in aggregate. The lens
 * choice drives every panel *and* what the export buttons produce, so the file
 * that lands in Downloads always matches what is on screen.
 */

import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Award,
  CalendarDays,
  CalendarRange,
  FileDown,
  FileSpreadsheet,
  FileText,
  Layers,
  Loader2,
  Percent,
  PiggyBank,
  Receipt,
  Sheet,
  Target,
  TrendingDown,
  Wallet,
} from 'lucide-react'
import { useAppState } from '../store/AppStore'
import { useChartMode } from '../store/ThemeProvider'
import { useQuickAdd } from '../components/layout/AppShell'
import {
  availableYears,
  averageMonthlyExpense,
  budgetRows,
  categoryBreakdown,
  monthTotals,
  monthlySeries,
  savingsGrowth,
  sortByDateDesc,
  transactionsInMonth,
  yearSummary,
  type MonthTotals,
} from '../lib/finance'
import {
  addMonths,
  currentMonthKey,
  daysInMonth,
  formatDate,
  formatDateShort,
  monthKey,
  monthLabel,
  monthRange,
  monthShort,
  todayISO,
} from '../lib/date'
import {
  formatCompactCurrency,
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  percentChange,
} from '../lib/format'
import { FLOW_COLORS, NEUTRAL_SERIES, categoryColor, seriesColor } from '../lib/palette'
import {
  exportMonthlyPdf,
  exportTransactionsCsv,
  exportTransactionsExcel,
  exportWorkbook,
  exportYearlyPdf,
} from '../lib/export'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { SelectInput } from '../components/ui/Field'
import { StatTile } from '../components/ui/StatTile'
import { Badge, SeriesDot, StatusBadge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { MonthPicker } from '../components/ui/MonthPicker'
import { Segmented } from '../components/ui/Tabs'
import { TableWrap, Td, Th, Tr } from '../components/ui/Table'
import { useToast } from '../components/ui/Toast'
import { ChartFrame } from '../components/charts/ChartFrame'
import { ColumnChart } from '../components/charts/ColumnChart'
import { TrendChart } from '../components/charts/TrendChart'
import { DonutChart } from '../components/charts/DonutChart'
import { CategoryBars } from '../components/charts/CategoryBars'
import type { Transaction } from '../types'
import { cn } from '../lib/cn'

type ReportScope = 'monthly' | 'yearly'
type ExportKey = 'pdf' | 'workbook' | 'excel' | 'csv'

interface ExportAction {
  key: ExportKey
  label: string
  hint: string
  icon: ReactNode
  run: () => void
}

export default function Reports() {
  const state = useAppState()
  const toast = useToast()

  const [scope, setScope] = useState<ReportScope>('monthly')
  const [month, setMonth] = useState(currentMonthKey())
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [busy, setBusy] = useState<ExportKey | null>(null)

  const years = useMemo(() => availableYears(state.transactions), [state.transactions])
  // A year can vanish from the list if its last transaction is deleted while it
  // is selected — fall back rather than render an empty report for a dead year.
  const activeYear = years.includes(year) ? year : (years[0] ?? new Date().getFullYear())

  const periodTransactions = useMemo(
    () =>
      scope === 'monthly'
        ? transactionsInMonth(state.transactions, month)
        : state.transactions.filter((t) => t.date.startsWith(String(activeYear))),
    [state.transactions, scope, month, activeYear],
  )

  const periodLabel = scope === 'monthly' ? monthLabel(month, true) : String(activeYear)

  /**
   * One funnel for all four downloads: it blocks a second click while a bundle
   * is still loading, refuses to build an empty report, and always clears the
   * busy flag — a failed export must not leave a button stuck on "Preparing…".
   */
  const runExport = async (
    key: ExportKey,
    task: () => void | Promise<void>,
    doneMessage: string,
    requiresRows = true,
  ) => {
    if (busy) return
    if (requiresRows && periodTransactions.length === 0) {
      toast.warn(`There is nothing to export for ${periodLabel} yet.`)
      return
    }
    setBusy(key)
    try {
      await task()
      toast.success(doneMessage)
    } catch (error) {
      console.error('[reports] export failed', error)
      toast.warn('That download could not be generated. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const exportActions: ExportAction[] = [
    {
      key: 'pdf',
      label: 'PDF report',
      hint: `Formatted ${scope === 'monthly' ? 'month' : 'year'} report for ${periodLabel}`,
      icon: <FileText className="h-[18px] w-[18px]" aria-hidden="true" />,
      run: () =>
        void runExport(
          'pdf',
          () => (scope === 'monthly' ? exportMonthlyPdf(state, month) : exportYearlyPdf(state, activeYear)),
          `${periodLabel} PDF report downloaded.`,
        ),
    },
    {
      key: 'workbook',
      label: 'Excel workbook',
      hint: 'Every sheet — summary, ledger, budget, savings, investments, debt',
      icon: <Sheet className="h-[18px] w-[18px]" aria-hidden="true" />,
      // The workbook covers the whole workspace, so it is worth generating even
      // when the selected period itself is empty.
      run: () => void runExport('workbook', () => exportWorkbook(state), 'Workbook downloaded.', false),
    },
    {
      key: 'excel',
      label: 'Transactions (Excel)',
      hint: `${periodTransactions.length} ${periodTransactions.length === 1 ? 'entry' : 'entries'} from ${periodLabel}`,
      icon: <FileSpreadsheet className="h-[18px] w-[18px]" aria-hidden="true" />,
      run: () =>
        void runExport(
          'excel',
          () =>
            exportTransactionsExcel(
              periodTransactions,
              `MoneyFlow-${scope === 'monthly' ? month : activeYear}-transactions.xlsx`,
            ),
          'Transactions exported to Excel.',
        ),
    },
    {
      key: 'csv',
      label: 'Transactions (CSV)',
      hint: 'Plain text — opens in any spreadsheet app',
      icon: <FileDown className="h-[18px] w-[18px]" aria-hidden="true" />,
      run: () =>
        void runExport('csv', () => exportTransactionsCsv(periodTransactions), 'Transactions exported to CSV.'),
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Reports"
        subtitle={`A complete picture of ${periodLabel}, ready to read or to download.`}
        action={
          <>
            <Segmented
              ariaLabel="Report period"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'monthly', label: 'Monthly', icon: <CalendarDays className="h-4 w-4" /> },
                { value: 'yearly', label: 'Yearly', icon: <CalendarRange className="h-4 w-4" /> },
              ]}
            />
            {scope === 'monthly' ? (
              <MonthPicker value={month} onChange={setMonth} />
            ) : (
              <SelectInput
                aria-label="Report year"
                value={activeYear}
                onChange={(event) => setYear(Number(event.target.value))}
                className="w-[7.5rem]"
              >
                {years.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectInput>
            )}
            <Button
              variant="primary"
              icon={
                busy === 'pdf' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <FileText className="h-4 w-4" aria-hidden="true" />
                )
              }
              disabled={busy != null}
              onClick={exportActions[0].run}
            >
              {busy === 'pdf' ? 'Preparing…' : 'PDF report'}
            </Button>
          </>
        }
      />

      {scope === 'monthly' ? (
        <MonthlyReport month={month} transactions={periodTransactions} onSelectMonth={setMonth} />
      ) : (
        <YearlyReport
          year={activeYear}
          transactions={periodTransactions}
          onViewMonth={(key) => {
            setMonth(key)
            setScope('monthly')
          }}
        />
      )}

      <ExportPanel actions={exportActions} busy={busy} periodLabel={periodLabel} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Monthly report                                                             */
/* -------------------------------------------------------------------------- */

function MonthlyReport({
  month,
  transactions,
  onSelectMonth,
}: {
  month: string
  transactions: Transaction[]
  onSelectMonth: (month: string) => void
}) {
  const state = useAppState()
  const mode = useChartMode()
  const quickAdd = useQuickAdd()
  const flow = FLOW_COLORS[mode]

  const totals = useMemo(() => monthTotals(state.transactions, month), [state.transactions, month])
  const previous = useMemo(
    () => monthTotals(state.transactions, addMonths(month, -1)),
    [state.transactions, month],
  )
  const months = useMemo(() => monthRange(12, month), [month])
  const series = useMemo(() => monthlySeries(state.transactions, months), [state.transactions, months])
  const averageSpend = useMemo(
    () => averageMonthlyExpense(state.transactions, months),
    [state.transactions, months],
  )
  const breakdown = useMemo(() => categoryBreakdown(transactions, 'expense'), [transactions])
  const budgets = useMemo(
    () => budgetRows(state, month).filter((row) => row.limit > 0),
    [state, month],
  )

  /**
   * Daily spend for the month. For the *current* month the series stops at
   * today — days that have not happened yet are not days of zero spending, and
   * plotting them as zero drags the line to the floor.
   */
  const daily = useMemo(() => {
    const total = daysInMonth(month)
    const lastDay =
      month === currentMonthKey() ? Math.min(total, Number(todayISO().slice(8, 10))) : total
    const perDay = new Array<number>(total).fill(0)
    for (const t of transactions) {
      if (t.type !== 'expense') continue
      const day = Number(t.date.slice(8, 10))
      if (day >= 1 && day <= total) perDay[day - 1] += t.amount
    }
    let running = 0
    return perDay.slice(0, Math.max(1, lastDay)).map((amount, index) => {
      running += amount
      return {
        day: formatDateShort(`${month}-${String(index + 1).padStart(2, '0')}`),
        spent: amount,
        running: Math.round(running),
      }
    })
  }, [transactions, month])

  // Offer a one-click escape from an empty month to the last one that has data.
  const lastActiveMonth = useMemo(() => {
    const keys = state.transactions
      .map((t) => monthKey(t.date))
      .filter((key) => key !== month && key <= currentMonthKey())
      .sort()
    return keys.length ? keys[keys.length - 1] : null
  }, [state.transactions, month])

  const netDelta = previous.net > 0 ? percentChange(totals.net, previous.net) : null
  const ratePoints = totals.savingsRate - previous.savingsRate
  const dailyAverage = daily.length ? daily.reduce((s, row) => s + row.spent, 0) / daily.length : 0

  // The budget chart grows a band per tracked category; the daily chart beside
  // it borrows that height so the two cards in the row stay level.
  const comparisonHeight = Math.max(240, budgets.length * 42 + 40)

  const donutData = breakdown.map((row) => ({
    name: row.category,
    value: row.amount,
    color: categoryColor(row.category, mode),
  }))

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Income"
          value={formatCurrency(totals.income)}
          delta={percentChange(totals.income, previous.income)}
          upIsGood
          icon={<ArrowDownLeft className="h-4 w-4" />}
          accent={flow.income}
          trend={series.map((row) => row.income)}
          trendColor={flow.income}
        />
        <StatTile
          label="Expenses"
          value={formatCurrency(totals.expense)}
          delta={percentChange(totals.expense, previous.expense)}
          upIsGood={false}
          icon={<ArrowUpRight className="h-4 w-4" />}
          accent={flow.expense}
          trend={series.map((row) => row.expense)}
          trendColor={flow.expense}
        />
        <StatTile
          label="Net saved"
          value={formatSignedCurrency(totals.net)}
          sub={
            totals.net >= 0
              ? `Kept out of ${formatCurrency(totals.income)} earned`
              : `Spent ${formatCurrency(Math.abs(totals.net))} more than you earned`
          }
          delta={netDelta}
          upIsGood
          icon={<PiggyBank className="h-4 w-4" />}
          accent={flow.net}
          trend={series.map((row) => row.net)}
          trendColor={flow.net}
        />
        <StatTile
          label="Savings rate"
          value={formatPercent(totals.savingsRate, 1)}
          sub={
            previous.income > 0
              ? `${ratePoints >= 0 ? '+' : '−'}${Math.abs(ratePoints).toFixed(1)} pts vs ${monthLabel(addMonths(month, -1))}`
              : 'No comparable month before this one'
          }
          icon={<Percent className="h-4 w-4" />}
          accent={flow.net}
        />
      </div>

      <ChartFrame
        title="Income vs expenses"
        subtitle={`Twelve months ending ${monthLabel(month)}`}
        height={280}
        legend={[
          { label: 'Income', color: flow.income },
          { label: 'Expenses', color: flow.expense },
          { label: 'Net', color: flow.net },
        ]}
        table={{
          columns: ['Month', 'Income', 'Expenses', 'Net', 'Savings rate'],
          numericFrom: 1,
          rows: series.map((row) => [
            row.label,
            formatCurrency(row.income),
            formatCurrency(row.expense),
            formatSignedCurrency(row.net),
            formatPercent(row.savingsRate, 1),
          ]),
        }}
        footnote={
          averageSpend > 0
            ? `The dashed line is the ${formatCurrency(averageSpend)} average monthly spend across the months with activity.`
            : undefined
        }
      >
        <ColumnChart
          data={series.map((row) => ({
            label: axisMonth(row.month),
            Income: row.income,
            Expenses: row.expense,
            Net: row.net,
          }))}
          xKey="label"
          reference={averageSpend > 0 ? { value: averageSpend, label: 'Avg spend' } : undefined}
          series={[
            { key: 'Income', label: 'Income', color: flow.income },
            { key: 'Expenses', label: 'Expenses', color: flow.expense },
            { key: 'Net', label: 'Net', color: flow.net, asLine: true },
          ]}
        />
      </ChartFrame>

      {transactions.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Receipt className="h-5 w-5" />}
            title={`Nothing recorded in ${monthLabel(month, true)}`}
            message="Add an entry for this month, or jump back to the last month with activity."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" variant="primary" onClick={() => quickAdd.addTransaction({ type: 'expense' })}>
                  Add a transaction
                </Button>
                {lastActiveMonth ? (
                  <Button
                    size="sm"
                    iconEnd={<ArrowRight className="h-4 w-4" />}
                    onClick={() => onSelectMonth(lastActiveMonth)}
                  >
                    Go to {monthLabel(lastActiveMonth)}
                  </Button>
                ) : null}
              </div>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <ChartFrame
              className="lg:col-span-5"
              title="Category spending"
              subtitle={`${formatCurrency(totals.expense)} across ${breakdown.length} ${breakdown.length === 1 ? 'category' : 'categories'}`}
              height={280}
              legend={donutData.map((slice) => ({ label: slice.name, color: slice.color }))}
              table={{
                columns: ['Category', 'Amount', 'Share', 'Entries'],
                numericFrom: 1,
                rows: breakdown.map((row) => [
                  row.category,
                  formatCurrency(row.amount),
                  formatPercent(row.share, 1),
                  row.count,
                ]),
              }}
              empty={
                breakdown.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<Wallet className="h-5 w-5" />}
                    title="No expenses this month"
                    message="Only income was recorded in this period."
                  />
                ) : undefined
              }
            >
              <DonutChart
                data={donutData}
                centerLabel="Total spent"
                centerValue={formatCompactCurrency(totals.expense)}
              />
            </ChartFrame>

            <Card className="lg:col-span-7">
              <CardHeader
                title="Ranked categories"
                subtitle="Tap a row to open the matching transactions"
                icon={<Layers className="h-4 w-4" />}
              />
              <CategoryBars
                className="mt-2"
                emptyLabel="No expenses recorded this month"
                items={breakdown.map((row) => ({
                  label: row.category,
                  value: row.amount,
                  color: categoryColor(row.category, mode),
                  share: row.share,
                  meta: `${row.count} ${row.count === 1 ? 'transaction' : 'transactions'} · ${formatCurrency(row.amount / Math.max(1, row.count))} average`,
                }))}
                onSelect={(item) => {
                  window.location.hash = `#/transactions?category=${encodeURIComponent(item.label)}&month=${month}`
                }}
              />
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <ChartFrame
              className="lg:col-span-6"
              title="Spending vs budget"
              subtitle={
                budgets.length
                  ? `${budgets.filter((row) => row.spent > row.limit).length} of ${budgets.length} categories over the limit`
                  : 'No limits set for this month'
              }
              height={comparisonHeight}
              legend={[
                { label: 'Budget', color: NEUTRAL_SERIES[mode] },
                { label: 'Spent', color: flow.expense },
              ]}
              table={{
                columns: ['Category', 'Budget', 'Spent', 'Remaining', 'Used'],
                numericFrom: 1,
                rows: budgets.map((row) => [
                  row.category,
                  formatCurrency(row.limit),
                  formatCurrency(row.spent),
                  formatSignedCurrency(row.remaining),
                  formatPercent(row.usedPercent, 0),
                ]),
              }}
              footnote="Only categories with a limit appear here. Grey is the limit, orange is what you actually spent."
              empty={
                budgets.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<Target className="h-5 w-5" />}
                    title="No budgets for this month"
                    message="Set a limit per category to measure the month against a plan."
                    action={
                      <Button size="sm" variant="primary" onClick={() => (window.location.hash = '#/budget')}>
                        Set budgets
                      </Button>
                    }
                  />
                ) : undefined
              }
            >
              <ColumnChart
                horizontal
                categoryWidth={96}
                data={budgets.map((row) => ({
                  category: row.category,
                  Budget: row.limit,
                  Spent: row.spent,
                }))}
                xKey="category"
                series={[
                  { key: 'Budget', label: 'Budget', color: NEUTRAL_SERIES[mode] },
                  { key: 'Spent', label: 'Spent', color: flow.expense },
                ]}
              />
            </ChartFrame>

            <ChartFrame
              className="lg:col-span-6"
              title="Spending day by day"
              subtitle={`${monthLabel(month, true)} · ${formatCurrency(dailyAverage)} a day on average`}
              height={comparisonHeight}
              table={{
                columns: ['Day', 'Spent', 'Running total'],
                numericFrom: 1,
                rows: daily.map((row) => [row.day, formatCurrency(row.spent), formatCurrency(row.running)]),
              }}
              footnote={
                month === currentMonthKey()
                  ? 'The month is still running — the series stops at today rather than plotting future days as zero.'
                  : undefined
              }
            >
              <TrendChart
                data={daily.map((row) => ({ day: row.day, spent: row.spent }))}
                xKey="day"
                reference={dailyAverage > 0 ? { value: dailyAverage, label: 'Daily avg' } : undefined}
                series={[{ key: 'spent', label: 'Spent', color: flow.expense, kind: 'area' }]}
              />
            </ChartFrame>
          </div>

          {/* Remounting on month change resets the filter and the row cap, so a
              new month never opens half-filtered. */}
          <MonthLedger key={month} month={month} transactions={transactions} />
        </>
      )}
    </>
  )
}

/** `2026-01` → `Jan '26`; every other month keeps the bare short name. */
function axisMonth(key: string): string {
  const short = monthShort(key)
  return key.endsWith('-01') ? `${short} '${key.slice(2, 4)}` : short
}

/* -------------------------------------------------------------------------- */
/* Monthly ledger                                                             */
/* -------------------------------------------------------------------------- */

const LEDGER_PAGE = 25

function MonthLedger({ month, transactions }: { month: string; transactions: Transaction[] }) {
  const mode = useChartMode()
  const quickAdd = useQuickAdd()
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [expanded, setExpanded] = useState(false)

  const rows = useMemo(
    () => sortByDateDesc(transactions).filter((t) => filter === 'all' || t.type === filter),
    [transactions, filter],
  )
  const visible = expanded ? rows : rows.slice(0, LEDGER_PAGE)
  const income = rows.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = rows.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  return (
    <Card>
      <CardHeader
        title="Every transaction"
        subtitle={`${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} in ${monthLabel(month, true)}`}
        icon={<Receipt className="h-4 w-4" />}
        action={
          <Segmented
            size="sm"
            ariaLabel="Filter transactions by type"
            value={filter}
            onChange={(next) => {
              setFilter(next)
              setExpanded(false)
            }}
            options={[
              { value: 'all', label: 'All' },
              { value: 'income', label: 'Income' },
              { value: 'expense', label: 'Expenses' },
            ]}
          />
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          className="mt-4"
          compact
          icon={<Receipt className="h-5 w-5" />}
          title={filter === 'all' ? 'No entries this month' : `No ${filter} entries this month`}
          message={
            filter === 'all'
              ? 'Add a transaction to start the ledger.'
              : 'Switch the filter back to All to see the rest of the month.'
          }
          action={
            filter === 'all' ? (
              <Button size="sm" variant="primary" onClick={() => quickAdd.addTransaction()}>
                Add a transaction
              </Button>
            ) : (
              <Button size="sm" onClick={() => setFilter('all')}>
                Show all
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="mt-3">
            <TableWrap>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Description</Th>
                  <Th>Category</Th>
                  <Th>Method</Th>
                  <Th align="right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((transaction) => (
                  <Tr key={transaction.id}>
                    <Td className="whitespace-nowrap text-ink-secondary">{formatDate(transaction.date)}</Td>
                    <Td>
                      <button
                        type="button"
                        onClick={() => quickAdd.editTransaction(transaction)}
                        className="max-w-[15rem] truncate text-left font-medium text-ink hover:text-brand hover:underline"
                      >
                        {transaction.note || 'Untitled entry'}
                      </button>
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-2 whitespace-nowrap text-ink-secondary">
                        <SeriesDot color={categoryColor(transaction.category, mode)} />
                        {transaction.category}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap text-ink-secondary">{transaction.method}</Td>
                    <Td
                      align="right"
                      className={cn(
                        'tabular font-semibold whitespace-nowrap',
                        transaction.type === 'income' ? 'text-positive' : 'text-ink',
                      )}
                    >
                      {transaction.type === 'income' ? '+' : '−'}
                      {formatCurrency(transaction.amount)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">Income {formatCurrency(income)}</Badge>
              <Badge tone="neutral">Expenses {formatCurrency(expense)}</Badge>
              <StatusBadge status={income - expense >= 0 ? 'good' : 'critical'}>
                Net {formatSignedCurrency(income - expense)}
              </StatusBadge>
            </div>
            {rows.length > LEDGER_PAGE ? (
              <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
                {expanded ? `Show first ${LEDGER_PAGE}` : `Show all ${rows.length}`}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Yearly report                                                              */
/* -------------------------------------------------------------------------- */

function YearlyReport({
  year,
  transactions,
  onViewMonth,
}: {
  year: number
  transactions: Transaction[]
  onViewMonth: (month: string) => void
}) {
  const state = useAppState()
  const mode = useChartMode()
  const quickAdd = useQuickAdd()
  const flow = FLOW_COLORS[mode]

  const summary = useMemo(() => yearSummary(state.transactions, year), [state.transactions, year])
  const lastYear = useMemo(() => yearSummary(state.transactions, year - 1), [state.transactions, year])
  const breakdown = useMemo(() => categoryBreakdown(transactions, 'expense'), [transactions])

  // The current year is only partly written — showing the remaining months as
  // empty columns reads as a collapse in spending rather than a calendar edge.
  const monthRows = useMemo(
    () =>
      summary.months.filter(
        (row) => row.month <= currentMonthKey() || row.income > 0 || row.expense > 0,
      ),
    [summary.months],
  )

  const savings = useMemo(
    () => savingsGrowth(state.goals, monthRows.map((row) => row.month)),
    [state.goals, monthRows],
  )
  const savingsIsFlat = savings.every((row) => row.total === 0)
  const savingsColor = seriesColor(2, mode)
  const ratePoints = summary.savingsRate - lastYear.savingsRate
  const activeMonths = monthRows.filter((row) => row.income > 0 || row.expense > 0).length

  if (transactions.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<CalendarRange className="h-5 w-5" />}
          title={`No activity recorded in ${year}`}
          message="Pick another year from the selector, or start logging entries for this one."
          action={
            <Button size="sm" variant="primary" onClick={() => quickAdd.addTransaction()}>
              Add a transaction
            </Button>
          }
        />
      </Card>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total income"
          value={formatCurrency(summary.income)}
          delta={percentChange(summary.income, lastYear.income)}
          deltaLabel={`vs ${year - 1}`}
          upIsGood
          icon={<ArrowDownLeft className="h-4 w-4" />}
          accent={flow.income}
          trend={monthRows.map((row) => row.income)}
          trendColor={flow.income}
        />
        <StatTile
          label="Total expenses"
          value={formatCurrency(summary.expense)}
          delta={percentChange(summary.expense, lastYear.expense)}
          deltaLabel={`vs ${year - 1}`}
          upIsGood={false}
          icon={<ArrowUpRight className="h-4 w-4" />}
          accent={flow.expense}
          trend={monthRows.map((row) => row.expense)}
          trendColor={flow.expense}
        />
        <StatTile
          label="Net saved"
          value={formatSignedCurrency(summary.net)}
          sub={`Across ${activeMonths} ${activeMonths === 1 ? 'month' : 'months'} with activity`}
          delta={lastYear.net > 0 ? percentChange(summary.net, lastYear.net) : null}
          deltaLabel={`vs ${year - 1}`}
          upIsGood
          icon={<PiggyBank className="h-4 w-4" />}
          accent={flow.net}
          trend={monthRows.map((row) => row.net)}
          trendColor={flow.net}
        />
        <StatTile
          label="Savings rate"
          value={formatPercent(summary.savingsRate, 1)}
          sub={
            lastYear.income > 0
              ? `${ratePoints >= 0 ? '+' : '−'}${Math.abs(ratePoints).toFixed(1)} pts vs ${year - 1}`
              : `No ${year - 1} data to compare against`
          }
          icon={<Percent className="h-4 w-4" />}
          accent={flow.net}
        />
      </div>

      <ChartFrame
        title={`Month by month, ${year}`}
        subtitle="Income and expense columns with the net line on the same rupee scale"
        height={288}
        legend={[
          { label: 'Income', color: flow.income },
          { label: 'Expenses', color: flow.expense },
          { label: 'Net', color: flow.net },
        ]}
        table={{
          columns: ['Month', 'Income', 'Expenses', 'Net', 'Savings rate'],
          numericFrom: 1,
          rows: monthRows.map((row) => [
            row.label,
            formatCurrency(row.income),
            formatCurrency(row.expense),
            formatSignedCurrency(row.net),
            formatPercent(row.savingsRate, 1),
          ]),
        }}
        footnote={
          monthRows.length < 12
            ? `${year} is still in progress — months after ${monthLabel(monthRows[monthRows.length - 1].month)} are not plotted.`
            : undefined
        }
      >
        <ColumnChart
          data={monthRows.map((row) => ({
            label: monthShort(row.month),
            Income: row.income,
            Expenses: row.expense,
            Net: row.net,
          }))}
          xKey="label"
          series={[
            { key: 'Income', label: 'Income', color: flow.income },
            { key: 'Expenses', label: 'Expenses', color: flow.expense },
            { key: 'Net', label: 'Net', color: flow.net, asLine: true },
          ]}
        />
      </ChartFrame>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <HighlightCard
          className="lg:col-span-4"
          title="Best month"
          icon={<Award className="h-4 w-4" />}
          totals={summary.bestMonth}
          status={summary.bestMonth && summary.bestMonth.net >= 0 ? 'good' : 'warning'}
          caption="Highest net saved"
          onViewMonth={onViewMonth}
        />
        <HighlightCard
          className="lg:col-span-4"
          title="Worst month"
          icon={<TrendingDown className="h-4 w-4" />}
          totals={summary.worstMonth}
          status={summary.worstMonth && summary.worstMonth.net < 0 ? 'critical' : 'warning'}
          caption="Lowest net saved"
          onViewMonth={onViewMonth}
        />
        <Card className="lg:col-span-4">
          <CardHeader
            title="Biggest category"
            subtitle={`Where ${year} spending concentrated`}
            icon={<Layers className="h-4 w-4" />}
          />
          {summary.topCategory ? (
            <div className="mt-4 flex flex-col gap-2">
              <p className="inline-flex items-center gap-2 text-[13px] text-ink-secondary">
                <SeriesDot color={categoryColor(summary.topCategory.category, mode)} />
                {summary.topCategory.category}
              </p>
              <p className="tabular text-[26px] leading-none font-semibold tracking-[-0.025em] text-ink">
                {formatCurrency(summary.topCategory.amount)}
              </p>
              <p className="text-[12.5px] text-muted">
                {formatPercent(
                  summary.expense ? (summary.topCategory.amount / summary.expense) * 100 : 0,
                  1,
                )}{' '}
                of everything you spent this year
              </p>
              <div className="mt-1">
                <Badge tone="neutral">
                  {formatCurrency(summary.topCategory.amount / Math.max(1, activeMonths))} a month
                </Badge>
              </div>
            </div>
          ) : (
            <EmptyState
              className="mt-4"
              compact
              icon={<Wallet className="h-5 w-5" />}
              title="No expenses in this year"
            />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-6">
          <CardHeader
            title={`Category spending in ${year}`}
            subtitle={`${formatCurrency(summary.expense)} across ${breakdown.length} ${breakdown.length === 1 ? 'category' : 'categories'}`}
            icon={<Layers className="h-4 w-4" />}
          />
          <CategoryBars
            className="mt-2"
            emptyLabel="No expenses recorded this year"
            items={breakdown.map((row) => ({
              label: row.category,
              value: row.amount,
              color: categoryColor(row.category, mode),
              share: row.share,
              meta: `${row.count} ${row.count === 1 ? 'transaction' : 'transactions'} · ${formatCurrency(row.amount / Math.max(1, activeMonths))} a month`,
            }))}
            onSelect={(item) => {
              window.location.hash = `#/transactions?category=${encodeURIComponent(item.label)}`
            }}
          />
        </Card>

        <ChartFrame
          className="lg:col-span-6"
          title="Savings balance"
          subtitle="Closing balance across every goal, month by month"
          height={272}
          table={{
            columns: ['Month', 'Balance'],
            numericFrom: 1,
            rows: savings.map((row) => [row.label, formatCurrency(row.total)]),
          }}
          footnote="Built from goal contribution logs, so it tracks money actually moved into savings."
          empty={
            savingsIsFlat ? (
              <EmptyState
                compact
                icon={<PiggyBank className="h-5 w-5" />}
                title="No savings movement"
                message="Contribute to a goal and the balance line starts here."
                action={
                  <Button size="sm" variant="primary" onClick={() => (window.location.hash = '#/savings')}>
                    Open savings
                  </Button>
                }
              />
            ) : undefined
          }
        >
          <TrendChart
            data={savings.map((row) => ({ label: monthShort(row.month), total: row.total }))}
            xKey="label"
            series={[{ key: 'total', label: 'Savings balance', color: savingsColor, kind: 'area' }]}
          />
        </ChartFrame>
      </div>

      <Card>
        <CardHeader
          title={`${year} in months`}
          subtitle="Open any month to see it in full detail"
          icon={<CalendarDays className="h-4 w-4" />}
        />
        <div className="mt-3">
          <TableWrap>
            <thead>
              <tr>
                <Th>Month</Th>
                <Th align="right">Income</Th>
                <Th align="right">Expenses</Th>
                <Th align="right">Net</Th>
                <Th align="right">Savings rate</Th>
              </tr>
            </thead>
            <tbody>
              {monthRows.map((row) => {
                const isBest = summary.bestMonth?.month === row.month
                const isWorst = summary.worstMonth?.month === row.month
                return (
                  <Tr key={row.month}>
                    <Td>
                      <span className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onViewMonth(row.month)}
                          className="font-medium whitespace-nowrap text-ink hover:text-brand hover:underline"
                        >
                          {row.label}
                        </button>
                        {isBest ? <StatusBadge status="good">Best</StatusBadge> : null}
                        {isWorst && !isBest ? <StatusBadge status="warning">Worst</StatusBadge> : null}
                      </span>
                    </Td>
                    <Td align="right" className="tabular whitespace-nowrap text-ink-secondary">
                      {formatCurrency(row.income)}
                    </Td>
                    <Td align="right" className="tabular whitespace-nowrap text-ink-secondary">
                      {formatCurrency(row.expense)}
                    </Td>
                    <Td
                      align="right"
                      className={cn(
                        'tabular font-semibold whitespace-nowrap',
                        row.net < 0 ? 'text-negative' : 'text-ink',
                      )}
                    >
                      {formatSignedCurrency(row.net)}
                    </Td>
                    <Td align="right" className="tabular whitespace-nowrap text-ink-secondary">
                      {row.income > 0 ? formatPercent(row.savingsRate, 1) : '—'}
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <Td className="font-semibold">Total</Td>
                <Td align="right" className="tabular font-semibold whitespace-nowrap">
                  {formatCurrency(summary.income)}
                </Td>
                <Td align="right" className="tabular font-semibold whitespace-nowrap">
                  {formatCurrency(summary.expense)}
                </Td>
                <Td
                  align="right"
                  className={cn(
                    'tabular font-semibold whitespace-nowrap',
                    summary.net < 0 ? 'text-negative' : 'text-ink',
                  )}
                >
                  {formatSignedCurrency(summary.net)}
                </Td>
                <Td align="right" className="tabular font-semibold whitespace-nowrap">
                  {formatPercent(summary.savingsRate, 1)}
                </Td>
              </tr>
            </tfoot>
          </TableWrap>
        </div>
      </Card>
    </>
  )
}

function HighlightCard({
  title,
  icon,
  caption,
  totals,
  status,
  onViewMonth,
  className,
}: {
  title: string
  icon: ReactNode
  caption: string
  totals: MonthTotals | null
  status: 'good' | 'warning' | 'critical'
  onViewMonth: (month: string) => void
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader title={title} subtitle={caption} icon={icon} />
      {totals ? (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-[13px] text-ink-secondary">{totals.label}</p>
          <p
            className={cn(
              'tabular text-[26px] leading-none font-semibold tracking-[-0.025em]',
              totals.net < 0 ? 'text-negative' : 'text-ink',
            )}
          >
            {formatSignedCurrency(totals.net)}
          </p>
          <p className="text-[12.5px] text-muted">
            {formatCurrency(totals.income)} in · {formatCurrency(totals.expense)} out
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={status}>
              {totals.income > 0 ? `${formatPercent(totals.savingsRate, 0)} saved` : 'No income logged'}
            </StatusBadge>
            <Button
              size="sm"
              variant="ghost"
              iconEnd={<ArrowRight className="h-4 w-4" />}
              onClick={() => onViewMonth(totals.month)}
            >
              View month
            </Button>
          </div>
        </div>
      ) : (
        <EmptyState
          className="mt-4"
          compact
          icon={<CalendarDays className="h-5 w-5" />}
          title="Not enough data"
          message="At least one month with activity is needed."
        />
      )}
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

function ExportPanel({
  actions,
  busy,
  periodLabel,
}: {
  actions: ExportAction[]
  busy: ExportKey | null
  periodLabel: string
}) {
  return (
    <Card>
      <CardHeader
        title="Download this report"
        subtitle={`Everything below covers ${periodLabel}`}
        icon={<FileDown className="h-4 w-4" />}
      />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {actions.map((action) => {
          const loading = busy === action.key
          return (
            <button
              key={action.key}
              type="button"
              // Every button locks while a bundle loads: the PDF and Excel
              // libraries are code-split, and two parallel downloads race.
              disabled={busy != null}
              aria-busy={loading}
              onClick={action.run}
              className="flex flex-col gap-2 rounded-xl border border-hairline bg-surface-2 p-4 text-left transition-colors hover:border-hairline-strong hover:bg-surface-3 disabled:pointer-events-none disabled:opacity-45"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-ink">
                {loading ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" /> : action.icon}
              </span>
              <span className="text-[13.5px] font-semibold text-ink">
                {loading ? 'Preparing…' : action.label}
              </span>
              <span className="text-[12px] leading-snug text-muted">{action.hint}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
        PDF figures print as <span className="font-medium text-ink-secondary">Rs.</span> rather than ₹ — the
        PDF core fonts carry no rupee glyph, and substituting one would garble every amount. Excel and CSV
        files keep raw numbers so you can pivot them yourself.
      </p>
    </Card>
  )
}
