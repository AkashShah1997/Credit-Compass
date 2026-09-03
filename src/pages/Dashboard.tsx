import { useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CreditCard,
  Landmark,
  PiggyBank,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useAppState } from '../store/AppStore'
import { useChartMode } from '../store/ThemeProvider'
import { useQuickAdd } from '../components/layout/AppShell'
import {
  budgetSummary,
  categoryBreakdown,
  dashboardMetrics,
  emergencyFund,
  monthlySeries,
  netWorthHistory,
  sortByDateDesc,
  summariseGoal,
  summariseInvestments,
  summariseLoan,
  transactionsInMonth,
} from '../lib/finance'
import { currentMonthKey, formatDate, monthShort, monthRange, nextDueDate, relativeDay } from '../lib/date'
import {
  formatCompactCurrency,
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  formatTenure,
} from '../lib/format'
import { FLOW_COLORS, categoryColor } from '../lib/palette'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { StatTile } from '../components/ui/StatTile'
import { MeterRow, ProgressBar, RingProgress } from '../components/ui/Progress'
import { Badge, SeriesDot, StatusBadge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { MonthPicker } from '../components/ui/MonthPicker'
import { ChartFrame } from '../components/charts/ChartFrame'
import { ColumnChart } from '../components/charts/ColumnChart'
import { DonutChart } from '../components/charts/DonutChart'
import { CategoryBars } from '../components/charts/CategoryBars'
import { hrefFor } from '../hooks/useRouter'
import { cn } from '../lib/cn'

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard() {
  const state = useAppState()
  const mode = useChartMode()
  const quickAdd = useQuickAdd()
  const [month, setMonth] = useState(currentMonthKey())

  const metrics = useMemo(() => dashboardMetrics(state, month), [state, month])
  const months = useMemo(() => monthRange(6, month), [month])
  const series = useMemo(() => monthlySeries(state.transactions, months), [state.transactions, months])
  const worthHistory = useMemo(() => netWorthHistory(state, monthRange(6)), [state])
  const breakdown = useMemo(
    () => categoryBreakdown(transactionsInMonth(state.transactions, month), 'expense'),
    [state.transactions, month],
  )
  const budget = useMemo(() => budgetSummary(state, month), [state, month])
  const investments = useMemo(() => summariseInvestments(state.investments), [state.investments])
  const ef = useMemo(() => emergencyFund(state.goals), [state.goals])
  const flow = FLOW_COLORS[mode]

  const chartData = series.map((row) => ({
    label: monthShort(row.month),
    Income: row.income,
    Expenses: row.expense,
    Net: row.net,
  }))

  const donutData = breakdown.slice(0, 8).map((row) => ({
    name: row.category,
    value: row.amount,
    color: categoryColor(row.category, mode),
  }))

  const recent = useMemo(() => sortByDateDesc(state.transactions).slice(0, 7), [state.transactions])

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`${greeting()}, ${state.settings.name.split(' ')[0]}`}
        subtitle={`Here is where your money stands in ${formatDate(`${month}-01`).slice(2)}.`}
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Hero: the one ≥48px figure on this view. */}
        <Card className="relative overflow-hidden lg:col-span-5">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-16 -right-12 h-52 w-52 rounded-full opacity-[0.07]"
            style={{ background: `radial-gradient(circle, ${flow.income}, transparent 70%)` }}
          />
          <div className="relative flex h-full flex-col justify-between gap-5">
            <div>
              <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
                <Wallet className="h-4 w-4" aria-hidden="true" />
                Total balance
              </p>
              <p className="mt-2.5 text-[42px] leading-none font-semibold tracking-[-0.03em] text-ink sm:text-[48px]">
                {formatCurrency(metrics.totalBalance)}
              </p>
              <p className="mt-3 text-[13px] text-ink-secondary">
                Bank and cash after {formatCurrency(state.cards.reduce((s, c) => s + c.outstanding, 0))} of card
                dues.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand" icon={<Sparkles className="h-3 w-3" />}>
                Net worth {formatCompactCurrency(metrics.netWorth)}
              </Badge>
              <Badge tone={metrics.netFlow >= 0 ? 'good' : 'critical'} icon={metrics.netFlow >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}>
                {formatSignedCurrency(metrics.netFlow)} this month
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                icon={<ArrowDownLeft className="h-4 w-4" />}
                onClick={() => quickAdd.addTransaction({ type: 'income' })}
              >
                Add income
              </Button>
              <Button
                size="sm"
                icon={<ArrowUpRight className="h-4 w-4" />}
                onClick={() => quickAdd.addTransaction({ type: 'expense' })}
              >
                Add expense
              </Button>
              <Button size="sm" variant="ghost" iconEnd={<ArrowRight className="h-4 w-4" />} onClick={() => (window.location.hash = '#/reports')}>
                Reports
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-7">
          <StatTile
            label="Monthly income"
            value={formatCurrency(metrics.income)}
            delta={metrics.incomeChange}
            upIsGood
            icon={<ArrowDownLeft className="h-4 w-4" />}
            accent={flow.income}
            trend={series.map((row) => row.income)}
            trendColor={flow.income}
          />
          <StatTile
            label="Monthly expenses"
            value={formatCurrency(metrics.expense)}
            delta={metrics.expenseChange}
            upIsGood={false}
            icon={<ArrowUpRight className="h-4 w-4" />}
            accent={flow.expense}
            trend={series.map((row) => row.expense)}
            trendColor={flow.expense}
          />
          <StatTile
            label="Savings"
            value={formatCurrency(metrics.totalSavings)}
            sub={`${state.goals.length} goal${state.goals.length === 1 ? '' : 's'} · ${formatPercent(metrics.savingsRate, 0)} of income saved this month`}
            icon={<PiggyBank className="h-4 w-4" />}
            accent={flow.net}
            onClick={() => (window.location.hash = '#/savings')}
          />
          <StatTile
            label="Investments"
            value={formatCurrency(investments.currentValue)}
            sub={
              <span className={cn('font-medium', investments.gain >= 0 ? 'text-positive' : 'text-negative')}>
                {formatSignedCurrency(investments.gain)} ({formatPercent(investments.gainPercent)})
              </span>
            }
            icon={<TrendingUp className="h-4 w-4" />}
            accent={flow.income}
            onClick={() => (window.location.hash = '#/investments')}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <ChartFrame
          className="lg:col-span-7"
          title="Income vs expenses"
          subtitle="Last six months, with the net line on the same rupee scale"
          height={272}
          legend={[
            { label: 'Income', color: flow.income },
            { label: 'Expenses', color: flow.expense },
            { label: 'Net', color: flow.net },
          ]}
          table={{
            columns: ['Month', 'Income', 'Expenses', 'Net'],
            numericFrom: 1,
            rows: series.map((row) => [
              row.label,
              formatCurrency(row.income),
              formatCurrency(row.expense),
              formatSignedCurrency(row.net),
            ]),
          }}
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

        <ChartFrame
          className="lg:col-span-5"
          title="Where the money went"
          subtitle={`${formatCurrency(metrics.expense)} spent across ${breakdown.length} categories`}
          height={272}
          legend={donutData.map((slice) => ({ label: slice.name, color: slice.color }))}
          table={{
            columns: ['Category', 'Amount', 'Share'],
            numericFrom: 1,
            rows: breakdown.map((row) => [row.category, formatCurrency(row.amount), formatPercent(row.share)]),
          }}
          empty={
            breakdown.length === 0 ? (
              <EmptyState
                compact
                icon={<Wallet className="h-5 w-5" />}
                title="No spending recorded"
                message="Add an expense to see the split by category."
                action={
                  <Button size="sm" variant="primary" onClick={() => quickAdd.addTransaction({ type: 'expense' })}>
                    Add expense
                  </Button>
                }
              />
            ) : undefined
          }
        >
          <DonutChart
            data={donutData}
            centerLabel="Total spent"
            centerValue={formatCompactCurrency(metrics.expense)}
          />
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <EmergencyFundCard goal={ef} />
        <BudgetSnapshot summary={budget} month={month} />
        <UpcomingDues />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader
            title="Recent activity"
            subtitle="Your seven latest entries"
            action={
              <a
                href={hrefFor('/transactions')}
                className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline"
              >
                View all <ArrowRight className="h-3.5 w-3.5" />
              </a>
            }
          />
          {recent.length === 0 ? (
            <EmptyState
              className="mt-4"
              compact
              icon={<Wallet className="h-5 w-5" />}
              title="Nothing here yet"
              message="Your transactions will appear here as you add them."
            />
          ) : (
            <ul className="mt-2 divide-y divide-hairline">
              {recent.map((transaction) => (
                <li key={transaction.id}>
                  <button
                    type="button"
                    onClick={() => quickAdd.editTransaction(transaction)}
                    className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-surface-2"
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
                      <span className="block truncate text-[13.5px] font-medium text-ink">{transaction.note}</span>
                      <span className="block truncate text-[12px] text-muted">
                        {transaction.category} · {formatDate(transaction.date)}
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
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader
            title="Savings goals"
            subtitle={`${formatCurrency(metrics.totalSavings)} put away so far`}
            action={
              <a
                href={hrefFor('/savings')}
                className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline"
              >
                Manage <ArrowRight className="h-3.5 w-3.5" />
              </a>
            }
          />
          {state.goals.length === 0 ? (
            <EmptyState
              className="mt-4"
              compact
              icon={<Target className="h-5 w-5" />}
              title="No goals yet"
              message="Create a goal to start tracking progress."
              action={
                <Button size="sm" variant="primary" onClick={() => (window.location.hash = '#/savings')}>
                  Create a goal
                </Button>
              }
            />
          ) : (
            <div className="mt-2 flex flex-col gap-1">
              {state.goals.slice(0, 4).map((goal) => {
                const summary = summariseGoal(goal)
                return (
                  <MeterRow
                    key={goal.id}
                    label={goal.name}
                    value={summary.percent}
                    tone={summary.percent >= 100 ? 'good' : 'brand'}
                    right={`${formatCompactCurrency(goal.saved)} / ${formatCompactCurrency(goal.target)}`}
                    sub={
                      summary.remaining > 0
                        ? `${formatCurrency(summary.remaining)} to go${summary.monthsToGoal ? ` · about ${formatTenure(summary.monthsToGoal)}` : ''}`
                        : 'Goal reached'
                    }
                    onClick={() => (window.location.hash = '#/savings')}
                  />
                )
              })}
            </div>
          )}
        </Card>
      </div>

      <ChartFrame
        title="Net worth trend"
        subtitle="Assets minus everything you owe, over the last six months"
        height={220}
        legend={[
          { label: 'Net worth', color: flow.net },
          { label: 'Assets', color: flow.income },
        ]}
        table={{
          columns: ['Month', 'Assets', 'Liabilities', 'Net worth'],
          numericFrom: 1,
          rows: worthHistory.map((row) => [
            row.label,
            formatCurrency(row.assets),
            formatCurrency(row.liabilities),
            formatCurrency(row.net),
          ]),
        }}
        footnote="Bank balances before today are estimated from each month's realised cash flow; investments and loan balances use their actual histories."
      >
        <ColumnChart
          data={worthHistory.map((row) => ({
            label: monthShort(row.month),
            Assets: row.assets,
            'Net worth': row.net,
          }))}
          xKey="label"
          series={[
            { key: 'Assets', label: 'Assets', color: flow.income },
            { key: 'Net worth', label: 'Net worth', color: flow.net, asLine: true },
          ]}
        />
      </ChartFrame>

      {breakdown.length > 0 ? (
        <Card>
          <CardHeader title="Category detail" subtitle="Ranked spend for the selected month" />
          <CategoryBars
            className="mt-2"
            items={breakdown.map((row) => ({
              label: row.category,
              value: row.amount,
              color: categoryColor(row.category, mode),
              share: row.share,
              meta: `${row.count} transaction${row.count === 1 ? '' : 's'}`,
            }))}
            onSelect={(item) => {
              window.location.hash = `#/transactions?category=${encodeURIComponent(item.label)}&month=${month}`
            }}
          />
        </Card>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function EmergencyFundCard({ goal }: { goal: ReturnType<typeof emergencyFund> }) {
  if (!goal) {
    return (
      <Card className="lg:col-span-4">
        <CardHeader title="Emergency fund" subtitle="Your first line of defence" icon={<Shield className="h-4 w-4" />} />
        <EmptyState
          className="mt-4"
          compact
          icon={<Shield className="h-5 w-5" />}
          title="Not set up"
          message="Mark a savings goal as your emergency fund to track it here."
          action={
            <Button size="sm" variant="primary" onClick={() => (window.location.hash = '#/savings')}>
              Set one up
            </Button>
          }
        />
      </Card>
    )
  }

  const summary = summariseGoal(goal)
  const tone = summary.percent >= 100 ? 'good' : summary.percent >= 50 ? 'warning' : 'critical'
  const status = summary.percent >= 100 ? 'good' : summary.percent >= 50 ? 'warning' : 'critical'

  return (
    <Card className="lg:col-span-4">
      <CardHeader title="Emergency fund" subtitle={goal.name} icon={<Shield className="h-4 w-4" />} />
      <div className="mt-4 flex items-center gap-5">
        <RingProgress value={summary.percent} tone={tone}>
          <span className="text-[22px] leading-none font-semibold tracking-[-0.02em] text-ink">
            {Math.round(summary.percent)}%
          </span>
          <span className="mt-1 text-[11px] text-muted">funded</span>
        </RingProgress>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted">Saved</p>
          <p className="tabular text-lg font-semibold text-ink">{formatCurrency(goal.saved)}</p>
          <p className="mt-2 text-[13px] text-muted">Target</p>
          <p className="tabular text-[15px] font-medium text-ink-secondary">{formatCurrency(goal.target)}</p>
          <div className="mt-3">
            <StatusBadge status={status}>
              {summary.percent >= 100
                ? 'Fully funded'
                : `${formatCompactCurrency(summary.remaining)} to go`}
            </StatusBadge>
          </div>
        </div>
      </div>
      {goal.monthlyContribution ? (
        <p className="mt-4 text-[12px] text-muted">
          At {formatCurrency(goal.monthlyContribution)} a month you reach the target in about{' '}
          {summary.monthsToGoal ? formatTenure(summary.monthsToGoal) : '—'}.
        </p>
      ) : null}
    </Card>
  )
}

function BudgetSnapshot({ summary, month }: { summary: ReturnType<typeof budgetSummary>; month: string }) {
  const mode = useChartMode()
  const tracked = summary.rows.filter((row) => row.limit > 0).sort((a, b) => b.usedPercent - a.usedPercent)

  return (
    <Card className="lg:col-span-4">
      <CardHeader
        title="Budget this month"
        subtitle={`${formatCurrency(summary.totalSpent)} of ${formatCurrency(summary.totalLimit)} used`}
        icon={<Target className="h-4 w-4" />}
        action={
          <a href={hrefFor('/budget')} className="text-[13px] font-medium text-brand hover:underline">
            Edit
          </a>
        }
      />
      {tracked.length === 0 ? (
        <EmptyState
          className="mt-4"
          compact
          icon={<Target className="h-5 w-5" />}
          title="No budgets set"
          message="Set a monthly limit per category to get alerts before you overspend."
          action={
            <Button size="sm" variant="primary" onClick={() => (window.location.hash = '#/budget')}>
              Set budgets
            </Button>
          }
        />
      ) : (
        <>
          <div className="mt-4">
            <ProgressBar
              value={summary.usedPercent}
              tone={summary.usedPercent >= 100 ? 'critical' : summary.usedPercent >= 80 ? 'warning' : 'brand'}
              size="lg"
              label="Overall budget used"
            />
            <div className="mt-2 flex items-center justify-between text-[12px]">
              <span className="text-muted">{Math.round(summary.usedPercent)}% used</span>
              <span className={cn('font-medium', summary.totalRemaining < 0 ? 'text-negative' : 'text-ink-secondary')}>
                {summary.totalRemaining >= 0
                  ? `${formatCurrency(summary.totalRemaining)} left`
                  : `${formatCurrency(Math.abs(summary.totalRemaining))} over`}
              </span>
            </div>
          </div>

          <div className="mt-3 flex flex-col">
            {tracked.slice(0, 3).map((row) => (
              <MeterRow
                key={row.category}
                icon={<SeriesDot color={categoryColor(row.category, mode)} />}
                label={row.category}
                value={row.usedPercent}
                tone={row.tone}
                right={`${formatCompactCurrency(row.spent)} / ${formatCompactCurrency(row.limit)}`}
              />
            ))}
          </div>

          {summary.overspentCount > 0 ? (
            <div className="mt-2">
              <StatusBadge status="critical">
                {summary.overspentCount} categor{summary.overspentCount === 1 ? 'y' : 'ies'} over budget
              </StatusBadge>
            </div>
          ) : summary.atRiskCount > 0 ? (
            <div className="mt-2">
              <StatusBadge status="warning">{summary.atRiskCount} close to the limit</StatusBadge>
            </div>
          ) : (
            <div className="mt-2">
              <StatusBadge status="good">Comfortably on track</StatusBadge>
            </div>
          )}
          <p className="mt-3 text-[11.5px] text-muted">Showing {month === currentMonthKey() ? 'the current month' : 'a past month'}.</p>
        </>
      )}
    </Card>
  )
}

function UpcomingDues() {
  const state = useAppState()

  const dues = useMemo(() => {
    const items: { id: string; label: string; sub: string; amount: number; date: string; icon: typeof CalendarClock }[] = []

    for (const loan of state.loans.filter((l) => l.active && l.paidMonths < l.tenureMonths)) {
      const summary = summariseLoan(loan)
      items.push({
        id: loan.id,
        label: `${loan.name} payment`,
        sub: `${summary.remainingMonths} payments left · ${formatCompactCurrency(summary.outstanding)} outstanding`,
        amount: loan.paymentAmount,
        date: summary.nextDueDate,
        icon: Landmark,
      })
    }
    for (const card of state.cards.filter((c) => c.outstanding > 0)) {
      items.push({
        id: card.id,
        label: `${card.name} bill`,
        sub: `•••• ${card.last4} · minimum ${formatCurrency(card.minimumDue)}`,
        amount: card.outstanding,
        date: nextDueDate(card.billDueDay),
        icon: CreditCard,
      })
    }
    const salary = nextDueDate(state.settings.salaryDay)
    items.push({
      id: 'salary',
      label: 'Salary credit',
      sub: 'Expected inflow',
      amount: state.settings.monthlySalary,
      date: salary,
      icon: Wallet,
    })

    return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5)
  }, [state])

  return (
    <Card className="lg:col-span-4">
      <CardHeader title="Coming up" subtitle="Next dues and credits" icon={<CalendarClock className="h-4 w-4" />} />
      {dues.length === 0 ? (
        <EmptyState className="mt-4" compact icon={<CalendarClock className="h-5 w-5" />} title="Nothing scheduled" />
      ) : (
        <ul className="mt-2 divide-y divide-hairline">
          {dues.map((due) => {
            const Icon = due.icon
            const relative = relativeDay(due.date)
            const soon = relative === 'today' || relative === 'tomorrow'
            return (
              <li key={due.id} className="flex items-center gap-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-secondary">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{due.label}</span>
                  <span className="block truncate text-[12px] text-muted">{due.sub}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tabular block text-[13.5px] font-semibold text-ink">
                    {formatCurrency(due.amount)}
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
      <p className="mt-3 text-[11.5px] text-muted">
        Reminders fire {state.settings.reminderLeadDays} days ahead — change that in Settings.
      </p>
    </Card>
  )
}
