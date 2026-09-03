import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  Coins,
  Copy,
  Gauge,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Target,
  Wallet,
} from 'lucide-react'
import { useActions, useAppState } from '../store/AppStore'
import { useChartMode } from '../store/ThemeProvider'
import { useQuickAdd } from '../components/layout/AppShell'
import { budgetLimitsFor, budgetSummary, monthlySeries, type BudgetRow } from '../lib/finance'
import {
  addMonths,
  currentMonthKey,
  daysInMonth,
  monthLabel,
  monthRange,
  parseISO,
  todayISO,
} from '../lib/date'
import { formatCurrency, formatPercent, formatSignedCurrency, percentChange } from '../lib/format'
import { FLOW_COLORS, categoryColor, seriesColor } from '../lib/palette'
import { DEFAULT_BUDGET_KEY, EXPENSE_CATEGORIES, type BudgetLimits, type ExpenseCategory } from '../types'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { StatTile } from '../components/ui/StatTile'
import { ProgressBar } from '../components/ui/Progress'
import { Badge, SeriesDot, StatusBadge } from '../components/ui/Badge'
import { CurrencyInput } from '../components/ui/Field'
import { ConfirmDialog } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { MonthPicker } from '../components/ui/MonthPicker'
import { useToast } from '../components/ui/Toast'
import { ChartFrame } from '../components/charts/ChartFrame'
import { ColumnChart } from '../components/charts/ColumnChart'
import { hrefFor } from '../hooks/useRouter'
import { cn } from '../lib/cn'

/** Nobody budgets a category above a million dollars a month; past that it is a typo. */
const MAX_LIMIT = 1_000_000

/**
 * One shared column template for the header, every editor row and the totals
 * footer — that is what keeps the four columns in line as the rows animate.
 * Below `sm` the row collapses to a stack with its own inline labels.
 */
const ROW_COLS = 'grid grid-cols-1 gap-2.5 sm:grid-cols-[minmax(0,1fr)_9rem_6.5rem_7rem] sm:items-center sm:gap-3'

export default function Budget() {
  const state = useAppState()
  const actions = useActions()
  const toast = useToast()
  const mode = useChartMode()
  const quickAdd = useQuickAdd()

  const [month, setMonth] = useState(currentMonthKey())
  const [confirmReset, setConfirmReset] = useState(false)

  const thisMonth = currentMonthKey()
  const isCurrent = month === thisMonth
  const isPast = month < thisMonth

  const summary = useMemo(() => budgetSummary(state, month), [state, month])
  const limits = useMemo(() => budgetLimitsFor(state.budgets, month), [state.budgets, month])
  const previousMonth = addMonths(month, -1)
  const previousPlan = useMemo(
    () => budgetLimitsFor(state.budgets, previousMonth),
    [state.budgets, previousMonth],
  )
  const previousPlanTotal = Object.values(previousPlan).reduce((sum, value) => sum + (value ?? 0), 0)

  // A month only "owns" its plan once it has been edited; until then it reads
  // straight through to the default plan.
  const hasOverride = Object.prototype.hasOwnProperty.call(state.budgets, month)
  const trackedCount = summary.rows.filter((row) => row.limit > 0).length

  const totalDays = daysInMonth(month)
  const dayOfMonth = isCurrent ? parseISO(todayISO()).getDate() : isPast ? totalDays : 0
  // The day itself still counts as spendable, which is how `dailyAllowance` is
  // derived in the finance layer — keep the two in step.
  const daysLeft = Math.max(0, totalDays - dayOfMonth + (isCurrent ? 1 : 0))
  const elapsedPercent = (dayOfMonth / totalDays) * 100

  const series = useMemo(() => monthlySeries(state.transactions, monthRange(6, month)), [state.transactions, month])
  const previousSpend = series[series.length - 2]?.expense ?? 0

  const paceStatus: 'good' | 'warning' | 'critical' =
    summary.usedPercent >= 100 ? 'critical' : summary.usedPercent > elapsedPercent + 5 ? 'warning' : 'good'
  const paceLabel =
    summary.usedPercent >= 100
      ? isPast
        ? 'Closed over budget'
        : 'Over budget'
      : isPast
        ? 'Closed under budget'
        : paceStatus === 'warning'
          ? 'Ahead of schedule'
          : 'On track for the month'

  // Straight-line run rate. Only worth showing once a few days have banked —
  // one heavy day on the 2nd would project a wildly alarmist month.
  const projected = isCurrent && dayOfMonth >= 3 ? (summary.totalSpent / dayOfMonth) * totalDays : null

  const alerts = useMemo(
    () =>
      summary.rows
        .filter((row) => row.limit > 0 && row.tone !== 'good')
        .sort((a, b) => b.usedPercent - a.usedPercent),
    [summary],
  )

  const suggestion = useMemo(() => {
    // Six months ending with the month *before* the one on screen: folding in a
    // half-finished current month would drag every average down.
    const window = monthRange(6, addMonths(month, -1))
    const inWindow = new Set(window)
    const activeMonths = new Set<string>()
    const totals = new Map<ExpenseCategory, number>()

    for (const transaction of state.transactions) {
      const key = transaction.date.slice(0, 7)
      if (!inWindow.has(key)) continue
      // A month with income but no spending is still a month that happened, so
      // it counts in the divisor.
      activeMonths.add(key)
      if (transaction.type !== 'expense') continue
      const category = transaction.category as ExpenseCategory
      totals.set(category, (totals.get(category) ?? 0) + transaction.amount)
    }

    if (activeMonths.size === 0) return null
    const next: BudgetLimits = {}
    for (const category of EXPENSE_CATEGORIES) {
      const average = (totals.get(category) ?? 0) / activeMonths.size
      // Round *up* to the nearest $10: a limit that rounds down is one you
      // break on day one.
      if (average > 0) next[category] = Math.ceil(average / 10) * 10
    }
    return Object.keys(next).length > 0 ? { limits: next, months: activeMonths.size } : null
  }, [state.transactions, month])

  /* ---------------------------------------------------------------------- */
  /* Mutations                                                              */
  /* ---------------------------------------------------------------------- */

  /** Replace the month's plan wholesale and offer a one-click way back. */
  const applyMonthPlan = (next: BudgetLimits, message: string) => {
    const before = state.budgets[month]
    actions.setBudgets(month, next)
    toast.success(message, {
      label: 'Undo',
      onClick: () => {
        if (before) actions.setBudgets(month, before)
        else actions.clearMonthBudget(month)
      },
    })
  }

  const commitLimit = (category: ExpenseCategory, value: number) => {
    // Rewrite the whole month rather than patching one key. Limits merge as
    // `{...default, ...month}`, so a month that only holds one category would
    // let every other default limit leak through — and clearing an inherited
    // limit would silently do nothing. Writing an explicit 0 is what shadows a
    // default the user wants untracked *this* month only.
    const next: BudgetLimits = { ...limits }
    if (value > 0) next[category] = value
    else if ((state.budgets[DEFAULT_BUDGET_KEY]?.[category] ?? 0) > 0) next[category] = 0
    else delete next[category]

    // The field saves itself on blur, so the toast is the only proof the edit
    // landed — and the only way back out of it.
    applyMonthPlan(
      next,
      value > 0
        ? `${category} limit set to ${formatCurrency(value)} for ${monthLabel(month)}.`
        : `${category} is no longer tracked in ${monthLabel(month)}.`,
    )
  }

  const copyLastMonth = () => {
    applyMonthPlan(previousPlan, `Copied ${monthLabel(previousMonth)}’s plan into ${monthLabel(month)}.`)
  }

  const applySuggestion = () => {
    if (!suggestion) return
    applyMonthPlan(
      suggestion.limits,
      `Limits set from your ${suggestion.months}-month average spend.`,
    )
  }

  const saveAsDefault = () => {
    const before = state.budgets[DEFAULT_BUDGET_KEY]
    // Zeroes exist only to shadow a default; storing them *as* the default
    // would be a plan made of blanks.
    const cleaned: BudgetLimits = {}
    for (const category of EXPENSE_CATEGORIES) {
      const limit = limits[category] ?? 0
      if (limit > 0) cleaned[category] = limit
    }
    actions.setBudgets(DEFAULT_BUDGET_KEY, cleaned)
    toast.success('Saved as your default plan — every month without its own plan follows it now.', {
      label: 'Undo',
      onClick: () => {
        if (before) actions.setBudgets(DEFAULT_BUDGET_KEY, before)
        else actions.clearMonthBudget(DEFAULT_BUDGET_KEY)
      },
    })
  }

  const resetMonth = () => {
    const before = state.budgets[month]
    actions.clearMonthBudget(month)
    setConfirmReset(false)
    toast.success(`${monthLabel(month)} follows your default plan again.`, {
      label: 'Undo',
      onClick: () => {
        if (before) actions.setBudgets(month, before)
      },
    })
  }

  /* ---------------------------------------------------------------------- */
  /* Chart                                                                  */
  /* ---------------------------------------------------------------------- */

  // The plan and the actual are the same unit, so they share one axis — never a
  // second scale. Blue is the plan; spend keeps the expense orange it wears
  // everywhere else in the app.
  const planColor = seriesColor(0, mode)
  const spentColor = FLOW_COLORS[mode].expense

  const chartRows = useMemo(
    () =>
      summary.rows
        .filter((row) => row.limit > 0 || row.spent > 0)
        .sort((a, b) => Math.max(b.limit, b.spent) - Math.max(a.limit, a.spent)),
    [summary],
  )

  const planned = trackedCount > 0

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Budget"
        subtitle={`Plan what each category may cost in ${monthLabel(month, true)}, then watch it against what actually left your account.`}
        action={
          <>
            <MonthPicker value={month} onChange={setMonth} />
            <Button
              variant="primary"
              icon={<ArrowUpRight className="h-4 w-4" />}
              onClick={() => quickAdd.addTransaction({ type: 'expense' })}
            >
              Add expense
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total budget"
          value={formatCurrency(summary.totalLimit)}
          sub={
            planned
              ? `${trackedCount} of ${EXPENSE_CATEGORIES.length} categories have a limit`
              : 'No limits set for this month yet'
          }
          icon={<Target className="h-4 w-4" />}
          accent={planColor}
        />
        <StatTile
          label="Spent"
          value={formatCurrency(summary.totalSpent)}
          sub={planned ? `${formatPercent(summary.usedPercent, 0)} of the plan` : 'Across every expense category'}
          delta={percentChange(summary.totalSpent, previousSpend)}
          deltaLabel={`vs ${monthLabel(previousMonth)}`}
          upIsGood={false}
          icon={<Wallet className="h-4 w-4" />}
          accent={spentColor}
          trend={series.map((row) => row.expense)}
          trendColor={spentColor}
        />
        <StatTile
          label={summary.totalRemaining < 0 ? 'Over budget' : 'Remaining'}
          value={formatCurrency(Math.abs(summary.totalRemaining))}
          sub={
            !planned ? (
              'Set a limit to track what is left'
            ) : summary.totalRemaining < 0 ? (
              <span className="font-medium text-negative">Past your plan for this month</span>
            ) : (
              `Still available across ${trackedCount} budgeted categor${trackedCount === 1 ? 'y' : 'ies'}`
            )
          }
          icon={<Coins className="h-4 w-4" />}
          accent={summary.totalRemaining < 0 ? FLOW_COLORS[mode].expense : FLOW_COLORS[mode].net}
        />
        <StatTile
          label="Time left"
          value={isPast ? 'Month closed' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`}
          sub={
            isPast
              ? `${monthLabel(month)} is final — these figures no longer move`
              : isCurrent
                ? `Day ${dayOfMonth} of ${totalDays} · ${Math.round(elapsedPercent)}% of the month gone`
                : `${totalDays} days once ${monthLabel(month)} begins`
          }
          icon={<CalendarDays className="h-4 w-4" />}
          accent="var(--c-brand)"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Pace ------------------------------------------------------------ */}
        <Card className="lg:col-span-7">
          <CardHeader
            title="Are you spending too fast?"
            subtitle={`${formatCurrency(summary.totalSpent)} of ${formatCurrency(summary.totalLimit)} used`}
            icon={<Gauge className="h-4 w-4" />}
            action={<StatusBadge status={paceStatus}>{paceLabel}</StatusBadge>}
          />

          {!planned ? (
            <EmptyState
              className="mt-4"
              icon={<Target className="h-5 w-5" />}
              title="No plan for this month"
              message="Give a category a monthly limit and this bar starts tracking it against the calendar."
              action={
                suggestion ? (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Sparkles className="h-4 w-4" />}
                    onClick={applySuggestion}
                  >
                    Auto-suggest from my average
                  </Button>
                ) : previousPlanTotal > 0 ? (
                  <Button size="sm" variant="primary" icon={<Copy className="h-4 w-4" />} onClick={copyLastMonth}>
                    Copy {monthLabel(previousMonth)}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="mt-5">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="text-[26px] leading-none font-semibold tracking-[-0.025em] text-ink sm:text-[30px]">
                    {formatPercent(summary.usedPercent, 0)}
                  </span>
                  <span
                    className={cn(
                      'tabular text-[13px] font-medium',
                      summary.totalRemaining < 0 ? 'text-negative' : 'text-ink-secondary',
                    )}
                  >
                    {summary.totalRemaining >= 0
                      ? `${formatCurrency(summary.totalRemaining)} left`
                      : `${formatCurrency(Math.abs(summary.totalRemaining))} over`}
                  </span>
                </div>
                <ProgressBar
                  value={summary.usedPercent}
                  tone={paceStatus}
                  size="lg"
                  marker={elapsedPercent}
                  label="Share of the total budget used"
                />
                <p className="mt-2.5 text-[12px] leading-relaxed text-muted">
                  {isPast ? (
                    <>The month is over, so the whole bar is settled: this is the final figure for {monthLabel(month)}.</>
                  ) : (
                    <>
                      The faint tick sits at {Math.round(elapsedPercent)}% — the share of {monthLabel(month)} that has
                      already passed. Fill that stops short of the tick means you are spending slower than the month is
                      running out; fill past it means the opposite.
                    </>
                  )}
                </p>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-hairline pt-4 sm:grid-cols-3">
                <div>
                  <dt className="text-[12px] text-muted">Expected by today</dt>
                  <dd className="tabular mt-1 text-[15px] font-semibold text-ink">
                    {formatCurrency(Math.round((summary.totalLimit * elapsedPercent) / 100))}
                  </dd>
                </div>
                <div>
                  <dt className="text-[12px] text-muted">Actually spent</dt>
                  <dd className="tabular mt-1 text-[15px] font-semibold text-ink">
                    {formatCurrency(summary.totalSpent)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[12px] text-muted">
                    {projected == null ? 'Difference' : 'Month-end at this pace'}
                  </dt>
                  <dd
                    className={cn(
                      'tabular mt-1 text-[15px] font-semibold',
                      projected == null
                        ? summary.totalSpent > (summary.totalLimit * elapsedPercent) / 100
                          ? 'text-negative'
                          : 'text-positive'
                        : projected > summary.totalLimit
                          ? 'text-negative'
                          : 'text-positive',
                    )}
                  >
                    {projected == null
                      ? formatSignedCurrency(
                          Math.round((summary.totalLimit * elapsedPercent) / 100 - summary.totalSpent),
                        )
                      : formatCurrency(Math.round(projected))}
                  </dd>
                </div>
              </dl>

              {isCurrent && daysLeft > 0 && summary.totalRemaining > 0 ? (
                <p className="mt-4 text-[12px] text-muted">
                  That leaves{' '}
                  <span className="tabular font-medium text-ink-secondary">
                    {formatCurrency(Math.round(summary.totalRemaining / daysLeft))}
                  </span>{' '}
                  a day for the {daysLeft} {daysLeft === 1 ? 'day' : 'days'} still to come.
                </p>
              ) : null}
            </>
          )}
        </Card>

        {/* Alerts ---------------------------------------------------------- */}
        <Card className="lg:col-span-5">
          <CardHeader
            title="Needs attention"
            subtitle={
              alerts.length > 0
                ? `${summary.overspentCount} over, ${summary.atRiskCount} close to the limit`
                : 'Categories that crossed the line'
            }
            icon={<Bell className="h-4 w-4" />}
          />

          {alerts.length === 0 ? (
            <EmptyState
              className="mt-4"
              compact
              icon={planned ? <CheckCircle2 className="h-5 w-5" /> : <Target className="h-5 w-5" />}
              title={planned ? 'Nothing to flag' : 'Nothing being watched'}
              message={
                planned
                  ? `No category has passed ${Math.round(state.settings.budgetAlertThreshold || 80)}% of its limit in ${monthLabel(month)}.`
                  : 'Alerts appear here once a category has a monthly limit to break.'
              }
            />
          ) : (
            <ul className="mt-2 flex flex-col">
              {alerts.map((row) => (
                <li key={row.category}>
                  <a
                    href={hrefFor('/transactions', { category: row.category, month })}
                    className="flex items-center gap-2.5 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2"
                  >
                    <SeriesDot color={categoryColor(row.category, mode)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{row.category}</span>
                      <span className="tabular block truncate text-[12px] text-muted">
                        {formatCurrency(row.spent)} of {formatCurrency(row.limit)} ·{' '}
                        {formatPercent(row.usedPercent, 0)}
                      </span>
                    </span>
                    <StatusBadge status={row.tone === 'critical' ? 'critical' : 'warning'}>
                      {row.remaining < 0
                        ? `${formatCurrency(Math.abs(row.remaining))} over`
                        : `${formatCurrency(row.remaining)} left`}
                    </StatusBadge>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
            A warning fires at {Math.round(state.settings.budgetAlertThreshold || 80)}% of a limit — change that in
            Settings. Tap a row to see the transactions behind it.
          </p>
        </Card>
      </div>

      {/* Editor -------------------------------------------------------------- */}
      <Card>
        <CardHeader
          title={`Limits for ${monthLabel(month, true)}`}
          subtitle="Type a limit and press Enter, or just click away — it saves on its own."
          icon={<SlidersHorizontal className="h-4 w-4" />}
          action={
            hasOverride ? (
              <Badge tone="brand">Custom plan</Badge>
            ) : (
              <Badge tone="neutral">Following default</Badge>
            )
          }
        />

        <div className="mt-4 flex flex-wrap items-center gap-2 border-b border-hairline pb-4">
          <Button
            size="sm"
            icon={<Copy className="h-4 w-4" />}
            onClick={copyLastMonth}
            disabled={previousPlanTotal === 0}
            title={
              previousPlanTotal === 0
                ? `${monthLabel(previousMonth)} has no plan to copy`
                : `Copy the ${monthLabel(previousMonth)} limits into this month`
            }
          >
            Copy {monthLabel(previousMonth)}’s plan
          </Button>
          <Button
            size="sm"
            icon={<Sparkles className="h-4 w-4" />}
            onClick={applySuggestion}
            disabled={!suggestion}
            title={
              suggestion
                ? `Fill every limit with your ${suggestion.months}-month average spend`
                : 'Not enough history to average yet'
            }
          >
            Auto-suggest from my average
          </Button>
          <Button
            size="sm"
            icon={<Save className="h-4 w-4" />}
            onClick={saveAsDefault}
            disabled={!planned}
            title="Reuse this plan for every month that has none of its own"
          >
            Save as my default plan
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw className="h-4 w-4" />}
            onClick={() => setConfirmReset(true)}
            disabled={!hasOverride}
            title={hasOverride ? 'Drop this month’s plan' : 'This month has no plan of its own'}
          >
            Reset to default
          </Button>
        </div>

        <div className={cn(ROW_COLS, 'mt-4 hidden px-2 pb-1 sm:grid')}>
          <span className="text-[11.5px] font-medium text-muted">Category</span>
          <span className="text-[11.5px] font-medium text-muted">Monthly limit</span>
          <span className="text-right text-[11.5px] font-medium text-muted">Spent</span>
          <span className="text-right text-[11.5px] font-medium text-muted">Remaining</span>
        </div>

        <ul className="divide-y divide-hairline">
          {summary.rows.map((row) => (
            <BudgetRowEditor
              key={row.category}
              row={row}
              color={categoryColor(row.category, mode)}
              daysLeft={daysLeft}
              showAllowance={isCurrent}
              inherited={!hasOverride && (state.budgets[DEFAULT_BUDGET_KEY]?.[row.category] ?? 0) > 0}
              onCommit={(value) => commitLimit(row.category, value)}
            />
          ))}
        </ul>

        <div className={cn(ROW_COLS, 'border-t border-hairline px-2 pt-4')}>
          <span className="text-[13px] font-semibold text-ink">Total</span>
          <span className="flex items-center justify-between sm:block sm:pl-3">
            <span className="text-[11.5px] text-muted sm:hidden">Budgeted</span>
            {/* pl-3 lines the $ up with the one inside the inputs above. */}
            <span className="tabular text-[13px] font-semibold text-ink">{formatCurrency(summary.totalLimit)}</span>
          </span>
          <span className="flex items-center justify-between sm:block sm:text-right">
            <span className="text-[11.5px] text-muted sm:hidden">Spent</span>
            <span className="tabular text-[13px] font-semibold text-ink">{formatCurrency(summary.totalSpent)}</span>
          </span>
          <span className="flex items-center justify-between sm:block sm:text-right">
            <span className="text-[11.5px] text-muted sm:hidden">Remaining</span>
            <span
              className={cn(
                'tabular text-[13px] font-semibold',
                summary.totalRemaining < 0 ? 'text-negative' : 'text-ink',
              )}
            >
              {formatSignedCurrency(summary.totalRemaining)}
            </span>
          </span>
        </div>

        <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
          A month with no plan of its own inherits your default plan, so the limits above may be coming from there —
          the badge beside this card’s title says which. Editing any limit gives {monthLabel(month)} its own copy;
          “Reset to default” hands it back. Clearing a limit stops tracking that category for this month only.
        </p>
      </Card>

      {/* Budget vs actual ---------------------------------------------------- */}
      <ChartFrame
        title="Budget vs actual"
        subtitle={`What you planned against what you spent in ${monthLabel(month)}`}
        height={Math.max(240, chartRows.length * 46 + 24)}
        legend={
          chartRows.length > 0
            ? [
                { label: 'Budget', color: planColor },
                { label: 'Spent', color: spentColor },
              ]
            : undefined
        }
        table={{
          columns: ['Category', 'Budget', 'Spent', 'Remaining', 'Used'],
          numericFrom: 1,
          rows: chartRows.map((row) => [
            row.category,
            row.limit > 0 ? formatCurrency(row.limit) : '—',
            formatCurrency(row.spent),
            row.limit > 0 ? formatSignedCurrency(row.remaining) : '—',
            row.limit > 0 ? formatPercent(row.usedPercent, 0) : '—',
          ]),
        }}
        footnote="Categories with no limit still show their actual spend, so nothing hides from the comparison."
        empty={
          chartRows.length === 0 ? (
            <EmptyState
              icon={<Wallet className="h-5 w-5" />}
              title="Nothing to compare yet"
              message={`No limits and no spending recorded for ${monthLabel(month)}.`}
              action={
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => quickAdd.addTransaction({ type: 'expense' })}
                >
                  Add an expense
                </Button>
              }
            />
          ) : undefined
        }
      >
        <ColumnChart
          data={chartRows.map((row) => ({ label: row.category, Budget: row.limit, Spent: row.spent }))}
          xKey="label"
          horizontal
          categoryWidth={96}
          series={[
            { key: 'Budget', label: 'Budget', color: planColor },
            { key: 'Spent', label: 'Spent', color: spentColor },
          ]}
        />
      </ChartFrame>

      <ConfirmDialog
        open={confirmReset}
        title={`Reset ${monthLabel(month)} to your default plan?`}
        message={`The limits you set for ${monthLabel(month, true)} will be discarded and the month will follow your default plan again. Spending is not touched.`}
        confirmLabel="Reset month"
        onConfirm={resetMonth}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function BudgetRowEditor({
  row,
  color,
  daysLeft,
  showAllowance,
  inherited,
  onCommit,
}: {
  row: BudgetRow
  color: string
  daysLeft: number
  /** Daily allowance only means something while the month is still running. */
  showAllowance: boolean
  /** True when this limit is currently coming from the default plan. */
  inherited: boolean
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState(() => (row.limit > 0 ? String(row.limit) : ''))
  const [error, setError] = useState<string | null>(null)

  // The stored limit also changes from outside this input — copy last month,
  // auto-suggest, reset — so mirror it back into the draft when it does.
  useEffect(() => {
    setDraft(row.limit > 0 ? String(row.limit) : '')
    setError(null)
  }, [row.limit])

  const commit = () => {
    const raw = draft.trim()
    if (raw === '') {
      setError(null)
      if (row.limit > 0) onCommit(0)
      return
    }
    const value = Number(raw)
    if (!Number.isFinite(value) || value < 0) {
      setError('Enter a positive amount')
      return
    }
    if (value > MAX_LIMIT) {
      setError('That is above the $1 million ceiling')
      return
    }
    setError(null)
    const rounded = Math.round(value)
    if (rounded !== row.limit) onCommit(rounded)
  }

  const tracked = row.limit > 0
  const meta = !tracked
    ? row.spent > 0
      ? `Not budgeted — ${formatCurrency(row.spent)} spent here anyway`
      : 'No limit set'
    : row.remaining < 0
      ? `Over by ${formatCurrency(Math.abs(row.remaining))}`
      : showAllowance && row.dailyAllowance > 0
        ? `${formatCurrency(Math.round(row.dailyAllowance))}/day left for ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`
        : `${formatPercent(row.usedPercent, 0)} of the limit used`

  return (
    <li className="px-2 py-3.5">
      <div className={ROW_COLS}>
        <div className="flex min-w-0 items-center gap-2">
          <SeriesDot color={color} />
          <span className="truncate text-[13.5px] font-medium text-ink">{row.category}</span>
          {inherited ? (
            <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-muted">
              default
            </span>
          ) : null}
        </div>

        <div>
          <CurrencyInput
            aria-label={`Monthly limit for ${row.category}`}
            value={draft}
            placeholder="0"
            invalid={Boolean(error)}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commit()
                event.currentTarget.blur()
              } else if (event.key === 'Escape') {
                setDraft(row.limit > 0 ? String(row.limit) : '')
                setError(null)
              }
            }}
            className="h-9"
          />
        </div>

        <div className="flex items-center justify-between sm:block sm:text-right">
          <span className="text-[11.5px] text-muted sm:hidden">Spent</span>
          <span className="tabular text-[13px] font-medium text-ink">{formatCurrency(row.spent)}</span>
        </div>

        <div className="flex items-center justify-between sm:block sm:text-right">
          <span className="text-[11.5px] text-muted sm:hidden">Remaining</span>
          <span
            className={cn(
              'tabular text-[13px] font-semibold',
              !tracked ? 'text-muted' : row.remaining < 0 ? 'text-negative' : 'text-ink',
            )}
          >
            {tracked ? formatSignedCurrency(row.remaining) : '—'}
          </span>
        </div>
      </div>

      {/* A limit of zero is "not tracked", not "100% used" — keep the bar quiet. */}
      <ProgressBar
        className="mt-3"
        value={tracked ? row.usedPercent : 0}
        tone={tracked ? row.tone : 'brand'}
        label={`${row.category} budget used`}
      />

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className={cn('text-[11.5px]', error ? 'font-medium text-critical' : 'text-muted')}>
          {error ?? meta}
        </span>
        {tracked && row.tone !== 'good' ? (
          <StatusBadge status={row.tone}>{row.tone === 'critical' ? 'Over budget' : 'Close to limit'}</StatusBadge>
        ) : null}
      </div>
    </li>
  )
}
