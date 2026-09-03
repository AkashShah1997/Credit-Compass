import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  Link2,
  Pencil,
  Plus,
  Search,
  Tags,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import type { Category, PaymentMethod, Transaction, TransactionType } from '../types'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAYMENT_METHODS } from '../types'
import { useActions, useAppState } from '../store/AppStore'
import { useChartMode } from '../store/ThemeProvider'
import { useQuickAdd } from '../components/layout/AppShell'
import { filterTransactions, monthBounds, monthlySeries, sumBy } from '../lib/finance'
import {
  addMonths,
  currentMonthKey,
  daysUntil,
  endOfMonth,
  formatDate,
  monthShort,
  monthsBetween,
  startOfMonth,
} from '../lib/date'
import { formatCurrency, formatNumber, formatSignedCurrency } from '../lib/format'
import { FLOW_COLORS, categoryColor } from '../lib/palette'
import { exportTransactionsCsv, exportTransactionsExcel, exportTransactionsPdf, rangeLabel } from '../lib/export'
import { Card, PageHeader } from '../components/ui/Card'
import { Button, IconButton } from '../components/ui/Button'
import { Field, TextInput } from '../components/ui/Field'
import { ConfirmDialog } from '../components/ui/Modal'
import { Badge, SeriesDot } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Segmented } from '../components/ui/Tabs'
import { useToast } from '../components/ui/Toast'
import { TableWrap, Td, Th, Tr } from '../components/ui/Table'
import { ChartFrame } from '../components/charts/ChartFrame'
import { ColumnChart } from '../components/charts/ColumnChart'
import { cn } from '../lib/cn'

/** One page of rows. The demo ledger holds ~350 entries; rendering them all at
 *  once costs a visible frame drop on mobile, so the list grows in blocks. */
const PAGE_SIZE = 50

/** A filtered span can cover years. Past a year the axis stops being readable,
 *  so the chart shows the most recent months and says so in the footnote. */
const MAX_CHART_MONTHS = 12

/** `Other` exists in both category lists — de-duplicated so it renders once. */
const ALL_CATEGORIES: Category[] = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES.filter((c) => !(EXPENSE_CATEGORIES as readonly string[]).includes(c)),
]

type RangePreset = 'all' | 'this-month' | 'last-month' | 'last-3' | 'this-year' | 'custom'
type SortKey = 'date' | 'amount'
type SortDirection = 'asc' | 'desc'

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'last-3', label: 'Last 3 months' },
  { value: 'this-year', label: 'This year' },
  { value: 'all', label: 'All time' },
]

function resolveRange(preset: RangePreset, from: string, to: string): { from: string; to: string } | null {
  const now = currentMonthKey()
  switch (preset) {
    case 'this-month':
      return monthBounds(now)
    case 'last-month':
      return monthBounds(addMonths(now, -1))
    case 'last-3':
      return { from: startOfMonth(addMonths(now, -2)), to: endOfMonth(now) }
    case 'this-year':
      return { from: `${now.slice(0, 4)}-01-01`, to: `${now.slice(0, 4)}-12-31` }
    case 'custom':
      // A half-open custom range is legitimate: "everything since April".
      if (!from && !to) return null
      return { from: from || '0001-01-01', to: to || '9999-12-31' }
    default:
      return null
  }
}

function presetLabel(preset: RangePreset, from: string, to: string): string {
  if (preset === 'custom') {
    if (from && to) return rangeLabel(from, to)
    if (from) return `From ${formatDate(from)}`
    if (to) return `Until ${formatDate(to)}`
    return 'Custom range'
  }
  return PRESETS.find((p) => p.value === preset)?.label ?? 'All time'
}

/** Sticky subheading text: recency reads faster than a date for the newest rows. */
function dayHeading(iso: string): string {
  const diff = daysUntil(iso)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  return formatDate(iso)
}

const isMonthKey = (value: string | null): value is string => Boolean(value && /^\d{4}-\d{2}$/.test(value))

export default function Transactions({ query }: { query: URLSearchParams }) {
  const state = useAppState()
  const { removeTransactions } = useActions()
  const quickAdd = useQuickAdd()
  const toast = useToast()
  const mode = useChartMode()
  const flow = FLOW_COLORS[mode]

  // Deep links (from the dashboard's category bars, the global search, an alert)
  // seed the filters once. They are deliberately not written back to the hash:
  // typing in the search box should not push a history entry per keystroke.
  const initialMonth = query.get('month')
  const [search, setSearch] = useState(() => query.get('q') ?? '')
  const [type, setType] = useState<TransactionType | 'all'>(() => {
    const value = query.get('type')
    return value === 'income' || value === 'expense' ? value : 'all'
  })
  const [categories, setCategories] = useState<Category[]>(() => {
    const raw = query.get('category')
    if (!raw) return []
    return raw
      .split(',')
      .map((value) => value.trim())
      .filter((value): value is Category => (ALL_CATEGORIES as string[]).includes(value))
  })
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [preset, setPreset] = useState<RangePreset>(() => (isMonthKey(initialMonth) ? 'custom' : 'all'))
  const [customFrom, setCustomFrom] = useState(() => (isMonthKey(initialMonth) ? startOfMonth(initialMonth) : ''))
  const [customTo, setCustomTo] = useState(() => (isMonthKey(initialMonth) ? endOfMonth(initialMonth) : ''))

  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [direction, setDirection] = useState<SortDirection>('desc')
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [pending, setPending] = useState<{ ids: string[]; title: string; message: ReactNode } | null>(null)
  const [busyExport, setBusyExport] = useState<'pdf' | 'excel' | null>(null)

  const rangeInvalid = preset === 'custom' && Boolean(customFrom) && Boolean(customTo) && customFrom > customTo
  const range = useMemo(
    () => (rangeInvalid ? null : resolveRange(preset, customFrom, customTo)),
    [rangeInvalid, preset, customFrom, customTo],
  )

  const filtered = useMemo(
    () => filterTransactions(state.transactions, { search, type, categories, methods, range }),
    [state.transactions, search, type, categories, methods, range],
  )

  const sorted = useMemo(() => {
    const rows = [...filtered]
    rows.sort((a, b) => {
      // Same-day rows fall back to entry order so the newest addition leads.
      const diff =
        sortKey === 'amount'
          ? a.amount - b.amount || a.date.localeCompare(b.date)
          : a.date === b.date
            ? a.createdAt.localeCompare(b.createdAt)
            : a.date.localeCompare(b.date)
      return direction === 'asc' ? diff : -diff
    })
    return rows
  }, [filtered, sortKey, direction])

  const paged = useMemo(() => sorted.slice(0, visible), [sorted, visible])

  const income = useMemo(() => sumBy(filtered, 'income'), [filtered])
  const expense = useMemo(() => sumBy(filtered, 'expense'), [filtered])

  const activeFilterCount =
    (search.trim() ? 1 : 0) + (type !== 'all' ? 1 : 0) + categories.length + methods.length + (preset !== 'all' ? 1 : 0)

  // Any change to the query resets paging and the selection — a checkbox the
  // user can no longer see must never end up in a bulk delete.
  const signature = [search, type, categories.join('|'), methods.join('|'), preset, customFrom, customTo, sortKey, direction].join('~')
  useEffect(() => {
    setVisible(PAGE_SIZE)
    setSelected(new Set())
  }, [signature])

  /* ---------------------------------------------------------------------- */
  /* Chart                                                                  */
  /* ---------------------------------------------------------------------- */

  const span = useMemo(() => {
    if (!filtered.length) return { months: [] as string[], truncated: false }
    let min = filtered[0].date.slice(0, 7)
    let max = min
    for (const t of filtered) {
      const key = t.date.slice(0, 7)
      if (key < min) min = key
      if (key > max) max = key
    }
    const all = monthsBetween(min, max)
    return { months: all.slice(-MAX_CHART_MONTHS), truncated: all.length > MAX_CHART_MONTHS }
  }, [filtered])

  const chartMonths = span.months
  const chartTruncated = span.truncated
  const chartSeries = useMemo(() => monthlySeries(filtered, chartMonths), [filtered, chartMonths])
  const multiYear = new Set(chartMonths.map((m) => m.slice(0, 4))).size > 1
  const chartData = chartSeries.map((row) => ({
    label: multiYear ? `${monthShort(row.month)} ’${row.month.slice(2, 4)}` : monthShort(row.month),
    Income: row.income,
    Expenses: row.expense,
    Net: row.net,
  }))

  /* ---------------------------------------------------------------------- */
  /* Grouping                                                               */
  /* ---------------------------------------------------------------------- */

  // Date subheadings only make sense while the list is in date order; sorting by
  // amount deliberately falls back to one flat run.
  const groups = useMemo(() => {
    if (sortKey !== 'date') return [{ key: 'flat', heading: null as string | null, rows: paged }]
    const out: { key: string; heading: string | null; rows: Transaction[] }[] = []
    for (const transaction of paged) {
      const last = out[out.length - 1]
      if (last && last.key === transaction.date) last.rows.push(transaction)
      else out.push({ key: transaction.date, heading: dayHeading(transaction.date), rows: [transaction] })
    }
    return out
  }, [paged, sortKey])

  /* ---------------------------------------------------------------------- */
  /* Handlers                                                               */
  /* ---------------------------------------------------------------------- */

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    // Both columns are most useful newest/largest first on the initial click.
    setDirection('desc')
  }

  function toggleSelection(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function setAllVisible(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const transaction of paged) {
        if (checked) next.add(transaction.id)
        else next.delete(transaction.id)
      }
      return next
    })
  }

  function changeType(next: TransactionType | 'all') {
    setType(next)
    // Keeping an expense category selected while filtering to income would
    // silently return nothing, so incompatible picks are dropped.
    if (next === 'all') return
    const allowed: readonly string[] = next === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
    setCategories((prev) => prev.filter((category) => allowed.includes(category)))
  }

  function clearAll() {
    setSearch('')
    setType('all')
    setCategories([])
    setMethods([])
    setPreset('all')
    setCustomFrom('')
    setCustomTo('')
  }

  function askDeleteOne(transaction: Transaction) {
    setPending({
      ids: [transaction.id],
      title: 'Delete this transaction?',
      message: (
        <>
          <strong className="font-medium text-ink">{transaction.note || transaction.category}</strong> —{' '}
          {formatCurrency(transaction.amount)} on {formatDate(transaction.date)}. This cannot be undone.
          {transaction.linkedType ? (
            <> It was created automatically from your {transaction.linkedType}; deleting it here does not reverse that.</>
          ) : null}
        </>
      ),
    })
  }

  function askDeleteSelected() {
    const ids = [...selected]
    const linked = filtered.filter((t) => selected.has(t.id) && t.linkedType).length
    setPending({
      ids,
      title: `Delete ${ids.length} transaction${ids.length === 1 ? '' : 's'}?`,
      message: (
        <>
          {ids.length === 1 ? 'This entry' : `These ${ids.length} entries`} will be removed from your ledger. This cannot
          be undone.
          {linked > 0 ? (
            <> {linked} of them {linked === 1 ? 'was' : 'were'} generated from a loan, card or goal — deleting the record
            does not reverse the underlying payment.</>
          ) : null}
        </>
      ),
    })
  }

  function confirmDelete() {
    if (!pending) return
    const count = pending.ids.length
    removeTransactions(pending.ids)
    setSelected(new Set())
    setPending(null)
    toast.success(`${count} transaction${count === 1 ? '' : 's'} deleted`)
  }

  const exportScope = range ? rangeLabel(range.from, range.to) : 'All time'

  async function runExport(kind: 'pdf' | 'excel' | 'csv', close: () => void) {
    close()
    if (!filtered.length) {
      toast.warn('Nothing to export — no transactions match these filters.')
      return
    }
    if (kind === 'csv') {
      exportTransactionsCsv(filtered)
      toast.success(`${filtered.length} transactions exported to CSV`)
      return
    }
    setBusyExport(kind)
    try {
      if (kind === 'pdf') await exportTransactionsPdf(state, filtered, exportScope)
      else await exportTransactionsExcel(filtered)
      toast.success(`${filtered.length} transactions exported to ${kind === 'pdf' ? 'PDF' : 'Excel'}`)
    } catch {
      toast.warn('That export could not be generated. Please try again.')
    } finally {
      setBusyExport(null)
    }
  }

  /* ---------------------------------------------------------------------- */

  const ledgerEmpty = state.transactions.length === 0
  const selectableCategories: readonly Category[] =
    type === 'income' ? INCOME_CATEGORIES : type === 'expense' ? EXPENSE_CATEGORIES : ALL_CATEGORIES
  const allVisibleSelected = paged.length > 0 && paged.every((t) => selected.has(t.id))
  const someVisibleSelected = !allVisibleSelected && paged.some((t) => selected.has(t.id))

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Transactions"
        subtitle={`${formatNumber(state.transactions.length)} entries in your ledger — search, filter and tidy them up here.`}
        action={
          <>
            <FilterPopover
              label="Export"
              icon={<Download className="h-4 w-4" />}
              align="right"
              width="w-56"
              disabled={ledgerEmpty}
            >
              {(close) => (
                <div className="flex flex-col">
                  <p className="px-2 pt-1 pb-2 text-[11.5px] text-muted">
                    {formatNumber(filtered.length)} matching {filtered.length === 1 ? 'entry' : 'entries'}
                  </p>
                  <MenuItem
                    icon={<FileText className="h-4 w-4" />}
                    label="PDF statement"
                    hint={busyExport === 'pdf' ? 'Generating…' : exportScope}
                    disabled={busyExport !== null}
                    onClick={() => void runExport('pdf', close)}
                  />
                  <MenuItem
                    icon={<FileSpreadsheet className="h-4 w-4" />}
                    label="Excel workbook"
                    hint={busyExport === 'excel' ? 'Generating…' : '.xlsx'}
                    disabled={busyExport !== null}
                    onClick={() => void runExport('excel', close)}
                  />
                  <MenuItem
                    icon={<FileDown className="h-4 w-4" />}
                    label="CSV file"
                    hint="Opens anywhere"
                    disabled={busyExport !== null}
                    onClick={() => void runExport('csv', close)}
                  />
                </div>
              )}
            </FilterPopover>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => quickAdd.addTransaction()}>
              Add transaction
            </Button>
          </>
        }
      />

      {/* ---------------------------------------------------------------- */}
      {/* Filter bar                                                        */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[180px] flex-1 sm:max-w-xs">
            <TextInput
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search notes, categories, amounts…"
              aria-label="Search transactions"
              leading={<Search className="h-4 w-4" aria-hidden="true" />}
            />
          </div>

          <Segmented
            ariaLabel="Filter by direction"
            value={type}
            onChange={changeType}
            options={[
              { value: 'all', label: 'All' },
              { value: 'income', label: 'Income', icon: <ArrowDownLeft className="h-3.5 w-3.5" /> },
              { value: 'expense', label: 'Expense', icon: <ArrowUpRight className="h-3.5 w-3.5" /> },
            ]}
          />

          <FilterPopover
            label="Category"
            icon={<Tags className="h-4 w-4" />}
            count={categories.length}
            width="w-60"
          >
            {() => (
              <div className="flex flex-col">
                <div className="scrollbar-slim max-h-64 overflow-y-auto">
                  {selectableCategories.map((category) => (
                    <CheckRow
                      key={category}
                      label={category}
                      color={categoryColor(category, mode)}
                      checked={categories.includes(category)}
                      onToggle={() =>
                        setCategories((prev) =>
                          prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
                        )
                      }
                    />
                  ))}
                </div>
                <PopoverFooter
                  count={categories.length}
                  onClear={() => setCategories([])}
                  onAll={() => setCategories([...selectableCategories])}
                />
              </div>
            )}
          </FilterPopover>

          <FilterPopover
            label="Method"
            icon={<CreditCard className="h-4 w-4" />}
            count={methods.length}
            width="w-56"
          >
            {() => (
              <div className="flex flex-col">
                {PAYMENT_METHODS.map((method) => (
                  <CheckRow
                    key={method}
                    label={method}
                    checked={methods.includes(method)}
                    onToggle={() =>
                      setMethods((prev) =>
                        prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method],
                      )
                    }
                  />
                ))}
                <PopoverFooter
                  count={methods.length}
                  onClear={() => setMethods([])}
                  onAll={() => setMethods([...PAYMENT_METHODS])}
                />
              </div>
            )}
          </FilterPopover>

          <FilterPopover
            label={preset === 'all' ? 'Date range' : presetLabel(preset, customFrom, customTo)}
            icon={<CalendarRange className="h-4 w-4" />}
            active={preset !== 'all'}
            width="w-72"
          >
            {(close) => (
              <div className="flex flex-col">
                {PRESETS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setPreset(option.value)
                      setCustomFrom('')
                      setCustomTo('')
                      close()
                    }}
                    className={cn(
                      'flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2',
                      preset === option.value ? 'font-medium text-brand' : 'text-ink',
                    )}
                  >
                    {option.label}
                    {preset === option.value ? <span aria-hidden="true">•</span> : null}
                  </button>
                ))}

                <div className="mt-2 flex flex-col gap-2 border-t border-hairline pt-3">
                  <p className="text-[11.5px] font-medium tracking-wide text-muted uppercase">Custom range</p>
                  <Field label="From">
                    {(id) => (
                      <TextInput
                        id={id}
                        type="date"
                        value={customFrom}
                        max={customTo || undefined}
                        onChange={(event) => {
                          setCustomFrom(event.target.value)
                          setPreset('custom')
                        }}
                      />
                    )}
                  </Field>
                  <Field
                    label="To"
                    error={rangeInvalid ? 'End date is before the start date.' : undefined}
                  >
                    {(id) => (
                      <TextInput
                        id={id}
                        type="date"
                        value={customTo}
                        invalid={rangeInvalid}
                        onChange={(event) => {
                          setCustomTo(event.target.value)
                          setPreset('custom')
                        }}
                      />
                    )}
                  </Field>
                </div>
              </div>
            )}
          </FilterPopover>
        </div>

        {activeFilterCount > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-hairline pt-3">
            <span className="text-[12px] text-muted">Filters</span>
            {search.trim() ? <Chip label={`“${search.trim()}”`} onRemove={() => setSearch('')} /> : null}
            {type !== 'all' ? (
              <Chip label={type === 'income' ? 'Income only' : 'Expenses only'} onRemove={() => setType('all')} />
            ) : null}
            {categories.map((category) => (
              <Chip
                key={category}
                label={category}
                color={categoryColor(category, mode)}
                onRemove={() => setCategories((prev) => prev.filter((c) => c !== category))}
              />
            ))}
            {methods.map((method) => (
              <Chip
                key={method}
                label={method}
                onRemove={() => setMethods((prev) => prev.filter((m) => m !== method))}
              />
            ))}
            {preset !== 'all' ? (
              <Chip
                label={presetLabel(preset, customFrom, customTo)}
                onRemove={() => {
                  setPreset('all')
                  setCustomFrom('')
                  setCustomTo('')
                }}
              />
            ) : null}
            <button
              type="button"
              onClick={clearAll}
              className="ml-1 text-[12.5px] font-medium text-brand transition-opacity hover:underline"
            >
              Clear all
            </button>
          </div>
        ) : null}

        {rangeInvalid ? (
          <p className="mt-3 text-[12px] font-medium text-critical">
            The custom range ends before it starts — it is being ignored until you fix the dates.
          </p>
        ) : null}
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Summary of the current filter                                     */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          <SummaryCell label="Matching entries" value={formatNumber(filtered.length)} />
          <SummaryCell label="Income" value={formatCurrency(income)} accent={flow.income} />
          <SummaryCell label="Expenses" value={formatCurrency(expense)} accent={flow.expense} />
          <SummaryCell
            label="Net"
            value={formatSignedCurrency(income - expense)}
            accent={flow.net}
            valueClass={income - expense >= 0 ? 'text-positive' : 'text-negative'}
          />
        </div>
      </Card>

      {chartMonths.length >= 2 ? (
        <ChartFrame
          title="Income vs expenses"
          subtitle={`${chartMonths.length} months across the filtered range`}
          height={248}
          legend={[
            { label: 'Income', color: flow.income },
            { label: 'Expenses', color: flow.expense },
            { label: 'Net', color: flow.net },
          ]}
          table={{
            columns: ['Month', 'Income', 'Expenses', 'Net'],
            numericFrom: 1,
            rows: chartSeries.map((row) => [
              row.label,
              formatCurrency(row.income),
              formatCurrency(row.expense),
              formatSignedCurrency(row.net),
            ]),
          }}
          footnote={
            chartTruncated
              ? `Showing the most recent ${MAX_CHART_MONTHS} months of the filtered range; every matching entry is still counted in the totals above.`
              : 'Totals reflect the filters above, so a category or method filter narrows these bars too.'
          }
        >
          <ColumnChart
            data={chartData}
            xKey="label"
            series={[
              { key: 'Income', label: 'Income', color: flow.income },
              { key: 'Expenses', label: 'Expenses', color: flow.expense },
              { key: 'Net', label: 'Net', color: flow.net, asLine: true },
            ]}
          />
        </ChartFrame>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Ledger                                                            */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        {ledgerEmpty ? (
          <EmptyState
            icon={<Wallet className="h-5 w-5" />}
            title="No transactions yet"
            message="Log your first income or expense and this ledger fills up — everything else in CreditCompass builds on it."
            action={
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => quickAdd.addTransaction()}>
                Add your first transaction
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title="No transactions match these filters"
            message="Try a broader date range, or clear the filters to see the whole ledger again."
            action={
              <Button variant="primary" onClick={clearAll}>
                Clear all filters
              </Button>
            }
          />
        ) : (
          <>
            {/* Desktop: one table, grouped by day. */}
            <div className="hidden sm:block">
              <TableWrap>
                <thead>
                  <tr>
                    <Th className="w-10">
                      <SelectAllBox
                        checked={allVisibleSelected}
                        indeterminate={someVisibleSelected}
                        onChange={setAllVisible}
                        label={`Select all ${paged.length} visible transactions`}
                      />
                    </Th>
                    <Th
                      className="w-32"
                      aria-sort={sortKey === 'date' ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <SortButton
                        label="Date"
                        active={sortKey === 'date'}
                        direction={direction}
                        onClick={() => toggleSort('date')}
                      />
                    </Th>
                    <Th>Description</Th>
                    <Th className="w-36">Category</Th>
                    <Th className="w-36">Method</Th>
                    <Th
                      align="right"
                      className="w-36"
                      aria-sort={sortKey === 'amount' ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <SortButton
                        label="Amount"
                        align="right"
                        active={sortKey === 'amount'}
                        direction={direction}
                        onClick={() => toggleSort('amount')}
                      />
                    </Th>
                    <Th align="right" className="w-24">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>

                {groups.map((group) => (
                  <tbody key={group.key}>
                    {group.heading ? (
                      <tr>
                        {/* Sticks under the 56px app header while the page scrolls. */}
                        <td
                          colSpan={7}
                          className="sticky top-14 z-[1] border-b border-hairline bg-surface-2/95 px-3 py-1.5 backdrop-blur"
                        >
                          <span className="text-[11.5px] font-semibold tracking-wide text-ink-secondary uppercase">
                            {group.heading}
                          </span>
                          <span className="ml-2 text-[11.5px] text-muted">
                            {group.rows.length} {group.rows.length === 1 ? 'entry' : 'entries'} ·{' '}
                            {formatSignedCurrency(
                              group.rows.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0),
                            )}
                          </span>
                        </td>
                      </tr>
                    ) : null}
                    {group.rows.map((transaction) => (
                      <Tr key={transaction.id} className={cn(selected.has(transaction.id) && 'bg-brand-soft/40')}>
                        <Td>
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer accent-brand"
                            checked={selected.has(transaction.id)}
                            onChange={() => toggleSelection(transaction.id)}
                            aria-label={`Select ${transaction.note || transaction.category}`}
                          />
                        </Td>
                        <Td className="tabular text-[13px] whitespace-nowrap text-ink-secondary">
                          {formatDate(transaction.date)}
                        </Td>
                        <Td>
                          <button
                            type="button"
                            onClick={() => quickAdd.editTransaction(transaction)}
                            className="flex max-w-[26rem] items-center gap-2 text-left text-[13.5px] font-medium text-ink hover:text-brand hover:underline"
                          >
                            <span className="truncate">{transaction.note || transaction.category}</span>
                            {transaction.linkedType ? (
                              <Link2
                                className="h-3.5 w-3.5 shrink-0 text-muted"
                                aria-label={`Created from a ${transaction.linkedType}`}
                              />
                            ) : null}
                          </button>
                        </Td>
                        <Td>
                          <span className="inline-flex items-center gap-2 text-[13px] text-ink-secondary">
                            <SeriesDot color={categoryColor(transaction.category, mode)} />
                            {transaction.category}
                          </span>
                        </Td>
                        <Td className="text-[13px] text-ink-secondary">{transaction.method}</Td>
                        <Td align="right">
                          <span
                            className={cn(
                              'tabular text-[13.5px] font-semibold whitespace-nowrap',
                              transaction.type === 'income' ? 'text-positive' : 'text-ink',
                            )}
                          >
                            {transaction.type === 'income' ? '+' : '−'}
                            {formatCurrency(transaction.amount)}
                          </span>
                        </Td>
                        <Td align="right">
                          <div className="flex justify-end gap-1">
                            <IconButton
                              size="sm"
                              label="Edit transaction"
                              onClick={() => quickAdd.editTransaction(transaction)}
                            >
                              <Pencil className="h-4 w-4" />
                            </IconButton>
                            <IconButton
                              size="sm"
                              label="Delete transaction"
                              className="hover:text-critical"
                              onClick={() => askDeleteOne(transaction)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                ))}
              </TableWrap>
            </div>

            {/* Mobile: the same rows as stacked cards. */}
            <div className="sm:hidden">
              <div className="flex items-center justify-between border-b border-hairline pb-2">
                <label className="flex items-center gap-2 text-[12.5px] text-ink-secondary">
                  <SelectAllBox
                    checked={allVisibleSelected}
                    indeterminate={someVisibleSelected}
                    onChange={setAllVisible}
                    label={`Select all ${paged.length} visible transactions`}
                  />
                  Select all shown
                </label>
                <SortButton
                  label={sortKey === 'date' ? 'Date' : 'Amount'}
                  active
                  direction={direction}
                  onClick={() => toggleSort(sortKey)}
                />
              </div>

              {groups.map((group) => (
                <div key={group.key}>
                  {group.heading ? (
                    <div className="sticky top-14 z-10 -mx-4 flex items-baseline justify-between border-y border-hairline bg-surface-2/95 px-4 py-1.5 backdrop-blur">
                      <span className="text-[11.5px] font-semibold tracking-wide text-ink-secondary uppercase">
                        {group.heading}
                      </span>
                      <span className="text-[11.5px] text-muted">
                        {formatSignedCurrency(
                          group.rows.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0),
                        )}
                      </span>
                    </div>
                  ) : null}
                  <ul className="divide-y divide-hairline">
                    {group.rows.map((transaction) => (
                      <li
                        key={transaction.id}
                        className={cn(
                          '-mx-4 flex items-center gap-3 px-4 py-2.5',
                          selected.has(transaction.id) && 'bg-brand-soft/40',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 accent-brand"
                          checked={selected.has(transaction.id)}
                          onChange={() => toggleSelection(transaction.id)}
                          aria-label={`Select ${transaction.note || transaction.category}`}
                        />
                        <button
                          type="button"
                          onClick={() => quickAdd.editTransaction(transaction)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                            style={{
                              backgroundColor: `color-mix(in oklab, ${categoryColor(transaction.category, mode)} 14%, transparent)`,
                              color: categoryColor(transaction.category, mode),
                            }}
                          >
                            {transaction.type === 'income' ? (
                              <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-medium text-ink">
                              {transaction.note || transaction.category}
                            </span>
                            <span className="block truncate text-[12px] text-muted">
                              {transaction.category} · {transaction.method}
                              {sortKey === 'date' ? '' : ` · ${formatDate(transaction.date)}`}
                            </span>
                          </span>
                          <span
                            className={cn(
                              'tabular shrink-0 text-[13.5px] font-semibold',
                              transaction.type === 'income' ? 'text-positive' : 'text-ink',
                            )}
                          >
                            {transaction.type === 'income' ? '+' : '−'}
                            {formatCurrency(transaction.amount)}
                          </span>
                        </button>
                        <IconButton
                          size="sm"
                          label="Delete transaction"
                          className="shrink-0 hover:text-critical"
                          onClick={() => askDeleteOne(transaction)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-col items-center gap-2">
              <p className="text-[12.5px] text-muted">
                Showing {formatNumber(paged.length)} of {formatNumber(sorted.length)}{' '}
                {sorted.length === 1 ? 'entry' : 'entries'}
              </p>
              {visible < sorted.length ? (
                <Button onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                  Show {Math.min(PAGE_SIZE, sorted.length - visible)} more
                </Button>
              ) : null}
            </div>
          </>
        )}
      </Card>

      {/* Sticky bulk bar — clears the mobile tab bar, sits low on desktop. */}
      {selected.size > 0 ? (
        <div className="pointer-events-none sticky bottom-24 z-30 flex justify-center lg:bottom-6">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-hairline bg-surface px-3 py-2 shadow-pop">
            <span className="pl-1 text-[13px] font-medium text-ink">
              {selected.size} selected
            </span>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button size="sm" variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={askDeleteSelected}>
              Delete selected
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.title ?? 'Delete transaction?'}
        message={pending?.message ?? ''}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Local pieces                                                               */
/* -------------------------------------------------------------------------- */

function SummaryCell({
  label,
  value,
  accent,
  valueClass,
}: {
  label: string
  value: string
  accent?: string
  valueClass?: string
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted">
        {accent ? <SeriesDot color={accent} /> : null}
        {label}
      </p>
      <p className={cn('tabular mt-1 truncate text-[20px] font-semibold tracking-[-0.02em] text-ink', valueClass)}>
        {value}
      </p>
    </div>
  )
}

function SortButton({
  label,
  active,
  direction,
  align = 'left',
  onClick,
}: {
  label: string
  active: boolean
  direction: SortDirection
  align?: 'left' | 'right'
  onClick: () => void
}) {
  const Chevron = direction === 'asc' ? ChevronUp : ChevronDown
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 text-[12px] font-medium transition-colors hover:text-ink',
        align === 'right' && 'flex-row-reverse',
        active ? 'text-ink' : 'text-muted',
      )}
    >
      {label}
      <Chevron className={cn('h-3.5 w-3.5', !active && 'opacity-0')} aria-hidden="true" />
    </button>
  )
}

function SelectAllBox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean
  indeterminate: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  // `indeterminate` is a DOM property with no HTML attribute equivalent.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <input
      ref={ref}
      type="checkbox"
      className="h-4 w-4 cursor-pointer accent-brand"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      aria-label={label}
    />
  )
}

function Chip({ label, color, onRemove }: { label: string; color?: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-2 py-0.5 pr-1 pl-2 text-[12px] text-ink">
      {color ? <SeriesDot color={color} /> : null}
      <span className="max-w-[12rem] truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        className="flex h-4 w-4 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-ink"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

function CheckRow({
  label,
  checked,
  color,
  onToggle,
}: {
  label: string
  checked: boolean
  color?: string
  onToggle: () => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] text-ink transition-colors hover:bg-surface-2">
      <input type="checkbox" className="h-4 w-4 shrink-0 accent-brand" checked={checked} onChange={onToggle} />
      {color ? <SeriesDot color={color} /> : null}
      <span className="truncate">{label}</span>
    </label>
  )
}

function PopoverFooter({ count, onClear, onAll }: { count: number; onClear: () => void; onAll: () => void }) {
  return (
    <div className="mt-1 flex items-center justify-between border-t border-hairline px-2 pt-2">
      <button
        type="button"
        onClick={onAll}
        className="text-[12px] font-medium text-ink-secondary transition-colors hover:text-ink"
      >
        Select all
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={count === 0}
        className="text-[12px] font-medium text-brand transition-opacity hover:underline disabled:pointer-events-none disabled:opacity-40"
      >
        Clear
      </button>
    </div>
  )
}

function MenuItem({
  icon,
  label,
  hint,
  disabled,
  onClick,
}: {
  icon: ReactNode
  label: string
  hint?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-50"
    >
      <span className="shrink-0 text-ink-secondary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {hint ? <span className="block truncate text-[11.5px] text-muted">{hint}</span> : null}
      </span>
    </button>
  )
}

/**
 * Lightweight dropdown. A native `<select multiple>` cannot show colour keys or
 * a "clear" affordance, so the filters use a popover of checkboxes instead —
 * closed by an outside click or Escape, like every other menu in the app.
 */
function FilterPopover({
  label,
  icon,
  count = 0,
  active,
  align = 'left',
  width = 'w-60',
  disabled,
  children,
}: {
  label: string
  icon: ReactNode
  count?: number
  active?: boolean
  align?: 'left' | 'right'
  width?: string
  disabled?: boolean
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const highlighted = active || count > 0

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        className={cn(
          'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors',
          'disabled:pointer-events-none disabled:opacity-45',
          highlighted
            ? 'border-brand/40 bg-brand-soft text-brand-ink'
            : 'border-hairline-strong bg-surface text-ink hover:bg-surface-2',
        )}
      >
        {icon}
        <span className="max-w-[10rem] truncate">{label}</span>
        {count > 0 ? (
          <Badge tone="brand" className="ml-0.5">
            {count}
          </Badge>
        ) : null}
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {open ? (
        <div
          className={cn(
            'absolute z-40 mt-2 rounded-xl border border-hairline bg-surface p-2 shadow-pop',
            width,
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  )
}
