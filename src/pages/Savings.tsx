import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  Car,
  Check,
  Gift,
  GraduationCap,
  Heart,
  History,
  Home,
  Laptop,
  MoreHorizontal,
  Palmtree,
  Pencil,
  PiggyBank,
  Plane,
  Plus,
  Shield,
  Sparkles,
  Target,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import { useActions, useAppState } from '../store/AppStore'
import { useChartMode } from '../store/ThemeProvider'
import {
  averageMonthlyExpense,
  emergencyFund,
  savingsGrowth,
  summariseGoal,
  totalSaved,
} from '../lib/finance'
import {
  daysUntil,
  formatDate,
  monthRange,
  monthShort,
  relativeDay,
  todayISO,
} from '../lib/date'
import {
  formatCompactCurrency,
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  progressPercent,
} from '../lib/format'
import { seriesColor } from '../lib/palette'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Button, IconButton } from '../components/ui/Button'
import { StatTile } from '../components/ui/StatTile'
import { ProgressBar, RingProgress } from '../components/ui/Progress'
import { Badge, StatusBadge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Field, CurrencyInput, TextInput, Switch } from '../components/ui/Field'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Segmented } from '../components/ui/Tabs'
import { TableWrap, Td, Th, Tr } from '../components/ui/Table'
import { useToast } from '../components/ui/Toast'
import { ChartFrame } from '../components/charts/ChartFrame'
import { TrendChart } from '../components/charts/TrendChart'
import { GOAL_ICONS, type GoalContribution, type GoalIcon, type SavingsGoal } from '../types'
import { cn } from '../lib/cn'

/* -------------------------------------------------------------------------- */
/* Icon vocabulary                                                            */
/* -------------------------------------------------------------------------- */

/** `typeof Shield` is the shared lucide component signature — no extra type import. */
const GOAL_ICON_COMPONENTS: Record<GoalIcon, typeof Shield> = {
  shield: Shield,
  palm: Palmtree,
  laptop: Laptop,
  home: Home,
  car: Car,
  graduation: GraduationCap,
  gift: Gift,
  heart: Heart,
  plane: Plane,
  piggy: PiggyBank,
}

const GOAL_ICON_LABELS: Record<GoalIcon, string> = {
  shield: 'Safety net',
  palm: 'Holiday',
  laptop: 'Gadget',
  home: 'Home',
  car: 'Vehicle',
  graduation: 'Education',
  gift: 'Gift',
  heart: 'Wedding',
  plane: 'Travel',
  piggy: 'General',
}

/**
 * The accent follows the chosen icon, not the card's position, so reordering or
 * filtering the grid never repaints a goal the user has already learned.
 */
function goalAccent(icon: GoalIcon, mode: 'light' | 'dark'): string {
  return seriesColor(GOAL_ICONS.indexOf(icon), mode)
}

/** A six-month cushion is the standard emergency-fund recommendation. */
const EMERGENCY_MONTHS = 6

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

type GoalFilter = 'all' | 'active' | 'done'

interface GoalDraft {
  name: string
  target: string
  saved: string
  icon: GoalIcon
  monthlyContribution: string
  deadline: string
  isEmergencyFund: boolean
}

function emptyDraft(): GoalDraft {
  return {
    name: '',
    target: '',
    saved: '',
    icon: 'piggy',
    monthlyContribution: '',
    deadline: '',
    isEmergencyFund: false,
  }
}

function draftFromGoal(goal: SavingsGoal): GoalDraft {
  return {
    name: goal.name,
    target: String(goal.target),
    saved: String(goal.saved),
    icon: goal.icon,
    monthlyContribution: goal.monthlyContribution ? String(goal.monthlyContribution) : '',
    deadline: goal.deadline ?? '',
    isEmergencyFund: Boolean(goal.isEmergencyFund),
  }
}

export default function Savings() {
  const state = useAppState()
  const actions = useActions()
  const toast = useToast()
  const mode = useChartMode()

  const [filter, setFilter] = useState<GoalFilter>('all')
  const [form, setForm] = useState<{ goal: SavingsGoal | null; draft: GoalDraft } | null>(null)
  const [contributing, setContributing] = useState<{ goalId: string; mode: 'add' | 'withdraw' } | null>(null)
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [goalToDelete, setGoalToDelete] = useState<SavingsGoal | null>(null)
  const [entryToDelete, setEntryToDelete] = useState<{ goalId: string; entry: GoalContribution } | null>(null)

  const goals = state.goals

  // Modals and panels hold ids, never goal objects: a contribution logged while
  // one is open must re-render it with the new balance, not a captured copy.
  const selectedGoal = goals.find((g) => g.id === selectedGoalId) ?? null
  const contributingGoal = contributing ? (goals.find((g) => g.id === contributing.goalId) ?? null) : null

  const months = useMemo(() => monthRange(12), [])
  const growth = useMemo(() => savingsGrowth(goals, months), [goals, months])
  const avgExpense = useMemo(
    () => averageMonthlyExpense(state.transactions, monthRange(6)),
    [state.transactions],
  )
  const ef = useMemo(() => emergencyFund(goals), [goals])

  const saved = totalSaved(goals)
  const totalTarget = goals.reduce((s, g) => s + g.target, 0)
  const activeGoals = goals.filter((g) => g.saved < g.target)
  const completedGoals = goals.filter((g) => g.target > 0 && g.saved >= g.target)
  const monthlyCommitment = goals.reduce((s, g) => s + (g.monthlyContribution ?? 0), 0)
  const remainingAcross = Math.max(0, totalTarget - saved)
  const salary = state.settings.monthlySalary

  const visibleGoals = useMemo(() => {
    const rows = goals.filter((goal) => {
      if (filter === 'active') return goal.saved < goal.target
      if (filter === 'done') return goal.target > 0 && goal.saved >= goal.target
      return true
    })
    // Emergency fund leads, then unfinished goals by how close they are, so the
    // grid reads as a queue of what to fund next rather than an insertion log.
    return [...rows].sort((a, b) => {
      if (Boolean(a.isEmergencyFund) !== Boolean(b.isEmergencyFund)) return a.isEmergencyFund ? -1 : 1
      const aDone = a.target > 0 && a.saved >= a.target
      const bDone = b.target > 0 && b.saved >= b.target
      if (aDone !== bDone) return aDone ? 1 : -1
      return progressPercent(b.saved, b.target) - progressPercent(a.saved, a.target)
    })
  }, [goals, filter])

  const growthData = growth.map((row) => ({ label: monthShort(row.month), Saved: row.total }))
  const peakSaved = growth.reduce((max, row) => Math.max(max, row.total), 0)
  // A target line only helps while it is within reach of the plotted range —
  // beyond that it flattens the curve it is meant to give context to.
  const showTargetLine = totalTarget > 0 && peakSaved > 0 && totalTarget <= peakSaved * 2

  const savingsColor = seriesColor(0, mode)

  function openCreate(preset?: Partial<GoalDraft>) {
    setForm({ goal: null, draft: { ...emptyDraft(), ...preset } })
  }

  function confirmDeleteGoal() {
    if (!goalToDelete) return
    actions.removeGoal(goalToDelete.id)
    if (selectedGoalId === goalToDelete.id) setSelectedGoalId(null)
    toast.success(`"${goalToDelete.name}" deleted.`)
    setGoalToDelete(null)
  }

  function confirmDeleteEntry() {
    if (!entryToDelete) return
    actions.removeContribution(entryToDelete.goalId, entryToDelete.entry.id)
    toast.success('Entry removed — the goal balance has been adjusted.')
    setEntryToDelete(null)
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Savings"
        subtitle={
          goals.length === 0
            ? 'Set a target, put money aside, and watch the gap close.'
            : `${formatCurrency(saved)} across ${goals.length} goal${goals.length === 1 ? '' : 's'} — ${formatPercent(progressPercent(saved, totalTarget), 0)} of everything you are aiming for.`
        }
        action={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openCreate()}>
            New goal
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total saved"
          value={formatCurrency(saved)}
          sub={
            totalTarget > 0
              ? `${formatCompactCurrency(remainingAcross)} still to fund`
              : 'No targets set yet'
          }
          icon={<PiggyBank className="h-4 w-4" />}
          accent={savingsColor}
          trend={growth.map((row) => row.total)}
          trendColor={savingsColor}
        />
        <StatTile
          label="Active goals"
          value={String(activeGoals.length)}
          sub={
            activeGoals.length === 0
              ? 'Nothing left in progress'
              : `${activeGoals.map((g) => g.name).slice(0, 2).join(', ')}${activeGoals.length > 2 ? ` +${activeGoals.length - 2} more` : ''}`
          }
          icon={<Target className="h-4 w-4" />}
          accent={seriesColor(2, mode)}
        />
        <StatTile
          label="Monthly commitment"
          value={formatCurrency(monthlyCommitment)}
          sub={
            salary > 0 && monthlyCommitment > 0
              ? `${formatPercent((monthlyCommitment / salary) * 100, 0)} of your ${formatCompactCurrency(salary)} salary`
              : 'Set a monthly amount on a goal to plan ahead'
          }
          icon={<CalendarClock className="h-4 w-4" />}
          accent={seriesColor(6, mode)}
        />
        <StatTile
          label="Goals completed"
          value={String(completedGoals.length)}
          sub={
            completedGoals.length > 0
              ? `${formatCompactCurrency(completedGoals.reduce((s, g) => s + g.target, 0))} of targets met`
              : 'Nothing fully funded yet'
          }
          icon={<Sparkles className="h-4 w-4" />}
          accent={seriesColor(4, mode)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <EmergencyPanel
          className="lg:col-span-5"
          goal={ef ?? null}
          avgExpense={avgExpense}
          onCreate={() =>
            openCreate({
              name: 'Emergency Fund',
              icon: 'shield',
              isEmergencyFund: true,
              // Pre-fill the textbook target so the user only has to confirm it.
              target: avgExpense > 0 ? String(Math.round((avgExpense * EMERGENCY_MONTHS) / 1000) * 1000) : '',
            })
          }
          onAdd={(goal) => setContributing({ goalId: goal.id, mode: 'add' })}
          onEdit={(goal) => setForm({ goal, draft: draftFromGoal(goal) })}
        />

        <ChartFrame
          className="lg:col-span-7"
          title="Savings growth"
          subtitle="Closing balance across every goal, last twelve months"
          height={252}
          table={{
            columns: ['Month', 'Total saved'],
            numericFrom: 1,
            rows: growth.map((row) => [row.label, formatCurrency(row.total)]),
          }}
          footnote={
            showTargetLine
              ? 'Reconstructed from the contribution log on each goal; the dashed line is the sum of every target.'
              : 'Reconstructed from the contribution log on each goal — money added before this window shows as the opening level.'
          }
          empty={
            peakSaved === 0 ? (
              <EmptyState
                compact
                icon={<History className="h-5 w-5" />}
                title="No contributions logged"
                message="Add money to a goal and the balance will start plotting here."
                action={
                  goals.length > 0 ? (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => setContributing({ goalId: goals[0].id, mode: 'add' })}
                    >
                      Add money
                    </Button>
                  ) : (
                    <Button size="sm" variant="primary" onClick={() => openCreate()}>
                      Create a goal
                    </Button>
                  )
                }
              />
            ) : undefined
          }
        >
          <TrendChart
            data={growthData}
            xKey="label"
            series={[{ key: 'Saved', label: 'Total saved', color: savingsColor, kind: 'area' }]}
            reference={showTargetLine ? { value: totalTarget, label: 'All targets' } : undefined}
          />
        </ChartFrame>
      </div>

      {/* Goal cards sit directly on the page ground rather than nested inside a
          Card — stacking two surfaces would flatten their own elevation. */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Your goals</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              {goals.length === 0
                ? 'Nothing tracked yet'
                : `${activeGoals.length} in progress · ${completedGoals.length} funded`}
            </p>
          </div>
          {goals.length > 0 ? (
            <Segmented
              size="sm"
              ariaLabel="Filter goals"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'active', label: 'Active' },
                { value: 'done', label: 'Funded' },
              ]}
            />
          ) : null}
        </div>

        {goals.length === 0 ? (
          <EmptyState
            icon={<Target className="h-5 w-5" />}
            title="No savings goals yet"
            message="Name what you are saving for, set a target, and every rupee you put aside will be tracked against it."
            action={
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openCreate()}>
                Create your first goal
              </Button>
            }
          />
        ) : visibleGoals.length === 0 ? (
          <EmptyState
            compact
            icon={<Target className="h-5 w-5" />}
            title={filter === 'done' ? 'Nothing funded yet' : 'No goals in progress'}
            message={
              filter === 'done'
                ? 'Goals move here once the saved amount reaches the target.'
                : 'Every goal has hit its target — time to set a new one.'
            }
            action={
              <Button size="sm" onClick={() => setFilter('all')}>
                Show all goals
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                mode={mode}
                selected={goal.id === selectedGoalId}
                onSelect={() => setSelectedGoalId((current) => (current === goal.id ? null : goal.id))}
                onAdd={() => setContributing({ goalId: goal.id, mode: 'add' })}
                onWithdraw={() => setContributing({ goalId: goal.id, mode: 'withdraw' })}
                onEdit={() => setForm({ goal, draft: draftFromGoal(goal) })}
                onDelete={() => setGoalToDelete(goal)}
              />
            ))}
          </div>
        )}
      </section>

      {selectedGoal ? (
        <ContributionHistory
          goal={selectedGoal}
          mode={mode}
          onClose={() => setSelectedGoalId(null)}
          onAdd={() => setContributing({ goalId: selectedGoal.id, mode: 'add' })}
          onDeleteEntry={(entry) => setEntryToDelete({ goalId: selectedGoal.id, entry })}
        />
      ) : goals.length > 0 ? (
        <p className="text-center text-[12.5px] text-muted">
          Select a goal above to see every deposit and withdrawal against it.
        </p>
      ) : null}

      {form ? (
        <GoalFormModal
          goal={form.goal}
          initial={form.draft}
          existingEmergencyFundId={goals.find((g) => g.isEmergencyFund && g.id !== form.goal?.id)?.id ?? null}
          onClose={() => setForm(null)}
        />
      ) : null}

      {contributing && contributingGoal ? (
        <ContributeModal
          goal={contributingGoal}
          initialMode={contributing.mode}
          onClose={() => setContributing(null)}
        />
      ) : null}

      <ConfirmDialog
        open={goalToDelete != null}
        title="Delete this goal?"
        message={
          goalToDelete ? (
            <>
              <strong className="font-semibold text-ink">{goalToDelete.name}</strong> and its{' '}
              {goalToDelete.contributions.length} logged{' '}
              {goalToDelete.contributions.length === 1 ? 'entry' : 'entries'} will be removed. The{' '}
              {formatCurrency(goalToDelete.saved)} tracked here will no longer count towards your net worth.
              This cannot be undone.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Delete goal"
        onConfirm={confirmDeleteGoal}
        onCancel={() => setGoalToDelete(null)}
      />

      <ConfirmDialog
        open={entryToDelete != null}
        title="Remove this entry?"
        message={
          entryToDelete ? (
            <>
              {formatSignedCurrency(entryToDelete.entry.amount)} dated {formatDate(entryToDelete.entry.date)} will
              be deleted and the goal balance adjusted to match.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Remove entry"
        onConfirm={confirmDeleteEntry}
        onCancel={() => setEntryToDelete(null)}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Emergency fund                                                             */
/* -------------------------------------------------------------------------- */

function EmergencyPanel({
  goal,
  avgExpense,
  className,
  onCreate,
  onAdd,
  onEdit,
}: {
  goal: SavingsGoal | null
  avgExpense: number
  className?: string
  onCreate: () => void
  onAdd: (goal: SavingsGoal) => void
  onEdit: (goal: SavingsGoal) => void
}) {
  if (!goal) {
    return (
      <Card className={cn('flex flex-col', className)}>
        <CardHeader
          title="Emergency fund"
          subtitle="The buffer that keeps a bad month from becoming a bad year"
          icon={<Shield className="h-4 w-4" />}
        />
        <EmptyState
          className="mt-4 flex-1"
          icon={<Shield className="h-5 w-5" />}
          title="No emergency fund yet"
          message={
            avgExpense > 0
              ? `You spend about ${formatCurrency(avgExpense)} a month, so aim for roughly ${formatCurrency(avgExpense * EMERGENCY_MONTHS)} set aside.`
              : 'Mark one goal as your emergency fund and it will be tracked here.'
          }
          action={
            <Button variant="primary" icon={<Shield className="h-4 w-4" />} onClick={onCreate}>
              Create emergency fund
            </Button>
          }
        />
      </Card>
    )
  }

  const summary = summariseGoal(goal)
  const status: 'good' | 'warning' | 'critical' =
    summary.percent >= 100 ? 'good' : summary.percent >= 50 ? 'warning' : 'critical'
  const monthsCovered = avgExpense > 0 ? goal.saved / avgExpense : null
  const coverage = monthsCovered == null ? 0 : Math.min(100, (monthsCovered / EMERGENCY_MONTHS) * 100)

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title="Emergency fund"
        subtitle={goal.name}
        icon={<Shield className="h-4 w-4" />}
        action={
          <Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => onAdd(goal)}>
            Add money
          </Button>
        }
      />

      <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <RingProgress value={summary.percent} tone={status} size={140} thickness={11}>
          <span className="text-[26px] leading-none font-semibold tracking-[-0.02em] text-ink">
            {Math.round(summary.percent)}%
          </span>
          <span className="mt-1 text-[11px] text-muted">funded</span>
        </RingProgress>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-[12.5px] text-muted">Saved</p>
          <p className="tabular text-[24px] leading-tight font-semibold tracking-[-0.02em] text-ink">
            {formatCurrency(goal.saved)}
          </p>
          <p className="tabular mt-1 text-[13px] text-ink-secondary">
            of {formatCurrency(goal.target)} target
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5 sm:justify-start">
            <StatusBadge status={status}>
              {summary.percent >= 100
                ? 'Fully funded'
                : `${formatCompactCurrency(summary.remaining)} to go`}
            </StatusBadge>
            {goal.monthlyContribution ? (
              <Badge tone="neutral" icon={<CalendarClock className="h-3 w-3" />}>
                {formatCurrency(goal.monthlyContribution)}/month
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13px] font-medium text-ink">
            {monthsCovered == null
              ? 'Coverage unknown'
              : `${monthsCovered.toFixed(1)} months of expenses covered`}
          </p>
          <p className="tabular text-[12px] text-muted">target {EMERGENCY_MONTHS} months</p>
        </div>
        <ProgressBar
          className="mt-2"
          value={coverage}
          tone={status}
          size="lg"
          label="Emergency fund coverage against six months of expenses"
        />
      </div>

      <p className="mt-4 text-[12px] leading-relaxed text-muted">
        {monthsCovered == null ? (
          <>
            Log a few months of expenses and this panel will show how long the fund would actually last.
            Six months of spending is the usual recommendation.
          </>
        ) : (
          <>
            Six months of expenses is the usual recommendation — about{' '}
            <span className="font-medium text-ink-secondary">
              {formatCurrency(avgExpense * EMERGENCY_MONTHS)}
            </span>{' '}
            at your recent spend of {formatCurrency(avgExpense)} a month.
            {summary.percent < 100 && goal.monthlyContribution && summary.monthsToGoal
              ? ` At ${formatCurrency(goal.monthlyContribution)} a month you get there in about ${summary.monthsToGoal} months.`
              : ''}
          </>
        )}
      </p>

      <button
        type="button"
        onClick={() => onEdit(goal)}
        className="mt-3 self-start text-[12.5px] font-medium text-brand hover:underline"
      >
        Adjust the target
      </button>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Goal card                                                                  */
/* -------------------------------------------------------------------------- */

function GoalCard({
  goal,
  mode,
  selected,
  onSelect,
  onAdd,
  onWithdraw,
  onEdit,
  onDelete,
}: {
  goal: SavingsGoal
  mode: 'light' | 'dark'
  selected: boolean
  onSelect: () => void
  onAdd: () => void
  onWithdraw: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const summary = summariseGoal(goal)
  const Icon = GOAL_ICON_COMPONENTS[goal.icon]
  const accent = goalAccent(goal.icon, mode)
  const done = goal.target > 0 && goal.saved >= goal.target
  const overdue = Boolean(goal.deadline) && !done && daysUntil(goal.deadline ?? todayISO()) < 0
  const tone = done ? 'good' : overdue ? 'serious' : 'brand'

  return (
    <Card
      className={cn(
        'relative flex flex-col gap-4 transition-shadow',
        selected && 'ring-2 ring-brand/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onSelect}
          aria-expanded={selected}
          className="-m-1 flex min-w-0 flex-1 items-start gap-3 rounded-xl p-1 text-left transition-colors hover:bg-surface-2"
        >
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: `color-mix(in oklab, ${accent} 14%, transparent)`,
              color: accent,
            }}
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] font-semibold tracking-[-0.01em] text-ink">
              {goal.name}
            </span>
            <span className="mt-0.5 block truncate text-[12px] text-muted">
              {goal.isEmergencyFund ? 'Emergency fund' : GOAL_ICON_LABELS[goal.icon]} ·{' '}
              {goal.contributions.length} {goal.contributions.length === 1 ? 'entry' : 'entries'}
            </span>
          </span>
        </button>

        <GoalMenu
          goalName={goal.name}
          canWithdraw={goal.saved > 0}
          onWithdraw={onWithdraw}
          onHistory={onSelect}
          onDelete={onDelete}
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="tabular text-[20px] leading-none font-semibold tracking-[-0.02em] text-ink">
            {formatCurrency(goal.saved)}
          </span>
          <span className="tabular shrink-0 text-[12.5px] text-muted">of {formatCurrency(goal.target)}</span>
        </div>
        <ProgressBar
          className="mt-2.5"
          value={summary.percent}
          tone={tone}
          label={`${goal.name} progress`}
        />
        <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
          <span className="font-medium text-ink-secondary">{formatPercent(summary.percent, 0)} funded</span>
          <span className="tabular text-muted">
            {summary.remaining > 0 ? `${formatCurrency(summary.remaining)} to go` : 'Target reached'}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {done ? (
          <StatusBadge status="good">Goal reached</StatusBadge>
        ) : overdue ? (
          <StatusBadge status="serious">Deadline passed</StatusBadge>
        ) : summary.onTrack ? (
          <StatusBadge status="good">On track</StatusBadge>
        ) : (
          <StatusBadge status="warning">Behind plan</StatusBadge>
        )}
        {goal.deadline ? (
          <Badge tone="neutral" icon={<CalendarClock className="h-3 w-3" />}>
            Due {relativeDay(goal.deadline)}
          </Badge>
        ) : null}
        {goal.monthlyContribution ? (
          <Badge tone="brand">{formatCurrency(goal.monthlyContribution)}/mo</Badge>
        ) : null}
      </div>

      <p className="text-[12px] leading-relaxed text-muted">
        {done
          ? `Fully funded — ${formatCurrency(goal.saved)} put away.`
          : summary.requiredMonthly != null
            ? `Needs ${formatCurrency(summary.requiredMonthly)} a month to land by ${formatDate(goal.deadline ?? todayISO())}.`
            : summary.monthsToGoal != null
              ? `About ${summary.monthsToGoal} month${summary.monthsToGoal === 1 ? '' : 's'} away at the current monthly amount.`
              : 'No deadline or monthly plan — add one to see how long this will take.'}
      </p>

      <div className="mt-auto flex flex-wrap gap-2">
        <Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={onAdd}>
          Add money
        </Button>
        <Button size="sm" icon={<Pencil className="h-4 w-4" />} onClick={onEdit}>
          Edit
        </Button>
      </div>
    </Card>
  )
}

function GoalMenu({
  goalName,
  canWithdraw,
  onWithdraw,
  onHistory,
  onDelete,
}: {
  goalName: string
  canWithdraw: boolean
  onWithdraw: () => void
  onHistory: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
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

  const item =
    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-2'

  return (
    <div ref={container} className="relative shrink-0">
      <IconButton
        label={`More actions for ${goalName}`}
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </IconButton>
      {open ? (
        <div
          role="menu"
          className="absolute top-full right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-hairline bg-surface py-1 shadow-pop"
        >
          <button
            type="button"
            role="menuitem"
            className={cn(item, 'text-ink')}
            onClick={() => {
              setOpen(false)
              onHistory()
            }}
          >
            <History className="h-4 w-4 text-muted" aria-hidden="true" />
            View history
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canWithdraw}
            className={cn(item, 'text-ink disabled:pointer-events-none disabled:opacity-45')}
            onClick={() => {
              setOpen(false)
              onWithdraw()
            }}
          >
            <ArrowUpRight className="h-4 w-4 text-muted" aria-hidden="true" />
            Withdraw
          </button>
          <div className="my-1 border-t border-hairline" />
          <button
            type="button"
            role="menuitem"
            className={cn(item, 'text-critical')}
            onClick={() => {
              setOpen(false)
              onDelete()
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete goal
          </button>
        </div>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Contribution history                                                       */
/* -------------------------------------------------------------------------- */

function ContributionHistory({
  goal,
  mode,
  onClose,
  onAdd,
  onDeleteEntry,
}: {
  goal: SavingsGoal
  mode: 'light' | 'dark'
  onClose: () => void
  onAdd: () => void
  onDeleteEntry: (entry: GoalContribution) => void
}) {
  const rows = useMemo(
    () => [...goal.contributions].sort((a, b) => b.date.localeCompare(a.date)),
    [goal.contributions],
  )
  const deposits = rows.filter((row) => row.amount >= 0)
  const withdrawals = rows.filter((row) => row.amount < 0)
  const Icon = GOAL_ICON_COMPONENTS[goal.icon]
  const accent = goalAccent(goal.icon, mode)

  return (
    <Card>
      <CardHeader
        title={`${goal.name} — contribution history`}
        subtitle={
          rows.length === 0
            ? 'Nothing logged against this goal yet'
            : `${deposits.length} deposit${deposits.length === 1 ? '' : 's'} · ${withdrawals.length} withdrawal${withdrawals.length === 1 ? '' : 's'} · ${formatCurrency(goal.saved)} balance`
        }
        icon={
          <span style={{ color: accent }}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        }
        action={
          <>
            {/* Withdrawals live inside the modal's toggle, so the header keeps
                to one action and stays intact at 375px. */}
            <Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={onAdd}>
              Add money
            </Button>
            <IconButton label="Close history" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </IconButton>
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          className="mt-4"
          compact
          icon={<History className="h-5 w-5" />}
          title="No entries yet"
          message="Every deposit and withdrawal you record against this goal shows up here."
          action={
            <Button size="sm" variant="primary" onClick={onAdd}>
              Add the first one
            </Button>
          }
        />
      ) : (
        <div className="mt-3">
          <TableWrap>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Note</Th>
                <Th align="right">Amount</Th>
                <Th align="right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <Tr key={entry.id}>
                  <Td className="whitespace-nowrap text-[13px] font-medium">{formatDate(entry.date)}</Td>
                  <Td className="text-[13px] text-ink-secondary">
                    <span className="flex items-center gap-2">
                      {entry.amount >= 0 ? (
                        <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                      ) : (
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                      )}
                      {entry.note?.trim() || (entry.amount >= 0 ? 'Deposit' : 'Withdrawal')}
                    </span>
                  </Td>
                  <Td align="right">
                    <span
                      className={cn(
                        'tabular text-[13px] font-semibold',
                        entry.amount >= 0 ? 'text-positive' : 'text-negative',
                      )}
                    >
                      {formatSignedCurrency(entry.amount)}
                    </span>
                  </Td>
                  <Td align="right">
                    <IconButton
                      label={`Remove entry from ${formatDate(entry.date)}`}
                      size="sm"
                      onClick={() => onDeleteEntry(entry)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
          <p className="mt-3 text-[11.5px] text-muted">
            Removing an entry adjusts the goal balance by the same amount — it does not touch your
            transaction log.
          </p>
        </div>
      )}
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Add money / withdraw                                                       */
/* -------------------------------------------------------------------------- */

function ContributeModal({
  goal,
  initialMode,
  onClose,
}: {
  goal: SavingsGoal
  initialMode: 'add' | 'withdraw'
  onClose: () => void
}) {
  const actions = useActions()
  const toast = useToast()

  const [direction, setDirection] = useState<'add' | 'withdraw'>(initialMode)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const value = Number(amount)
  const isWithdrawal = direction === 'withdraw'
  const signed = isWithdrawal ? -value : value
  const nextSaved = Math.max(0, goal.saved + (Number.isFinite(signed) ? signed : 0))
  const remaining = Math.max(0, goal.target - goal.saved)

  const amountError =
    !Number.isFinite(value) || value <= 0
      ? 'Enter an amount above zero.'
      : isWithdrawal && value > goal.saved
        ? `This goal only holds ${formatCurrency(goal.saved)}.`
        : undefined
  // A future-dated entry would pull the savings-growth curve past today, so the
  // chart would show money that has not moved yet.
  const dateError = !date ? 'Pick a date.' : date > todayISO() ? 'Pick today or an earlier date.' : undefined

  const quickAmounts = [
    goal.monthlyContribution && goal.monthlyContribution > 0
      ? { label: `Monthly ${formatCompactCurrency(goal.monthlyContribution)}`, value: goal.monthlyContribution }
      : null,
    !isWithdrawal && remaining > 0 ? { label: `Finish it ${formatCompactCurrency(remaining)}`, value: remaining } : null,
    isWithdrawal && goal.saved > 0 ? { label: `All of it ${formatCompactCurrency(goal.saved)}`, value: goal.saved } : null,
  ].filter((entry): entry is { label: string; value: number } => entry != null)

  function submit() {
    setSubmitted(true)
    if (amountError || dateError) return
    actions.contributeToGoal(goal.id, signed, date, note.trim() || undefined)
    toast.success(
      isWithdrawal
        ? `Withdrew ${formatCurrency(value)} from "${goal.name}".`
        : `Added ${formatCurrency(value)} to "${goal.name}".`,
    )
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={isWithdrawal ? 'Withdraw from goal' : 'Add money to goal'}
      description={goal.name}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            {isWithdrawal ? 'Withdraw' : 'Add money'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          ariaLabel="Deposit or withdrawal"
          value={direction}
          onChange={(next) => {
            setDirection(next)
            setSubmitted(false)
          }}
          options={[
            { value: 'add', label: 'Deposit', icon: <ArrowDownLeft className="h-3.5 w-3.5" /> },
            { value: 'withdraw', label: 'Withdraw', icon: <ArrowUpRight className="h-3.5 w-3.5" /> },
          ]}
        />

        <Field label="Amount" required error={submitted ? amountError : undefined}>
          {(id) => (
            <CurrencyInput
              id={id}
              autoFocus
              value={amount}
              placeholder="0"
              onChange={(event) => setAmount(event.target.value)}
              invalid={submitted && amountError != null}
            />
          )}
        </Field>

        {quickAmounts.length > 0 ? (
          <div className="-mt-2 flex flex-wrap gap-2">
            {quickAmounts.map((quick) => (
              <button
                key={quick.label}
                type="button"
                onClick={() => setAmount(String(Math.round(quick.value)))}
                className="rounded-full border border-hairline bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-ink-secondary transition-colors hover:border-hairline-strong hover:text-ink"
              >
                {quick.label}
              </button>
            ))}
          </div>
        ) : null}

        <Field label="Date" required error={submitted ? dateError : undefined}>
          {(id) => (
            <TextInput
              id={id}
              type="date"
              max={todayISO()}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              invalid={submitted && dateError != null}
            />
          )}
        </Field>

        <Field label="Note" hint="Optional — where this money came from, or what it was for.">
          {(id) => (
            <TextInput
              id={id}
              value={note}
              maxLength={80}
              placeholder={isWithdrawal ? 'e.g. Dentist bill' : 'e.g. Salary transfer'}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </Field>

        <div className="rounded-xl border border-hairline bg-surface-2 px-3.5 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12.5px] text-muted">New balance</span>
            <span className="tabular text-[15px] font-semibold text-ink">{formatCurrency(nextSaved)}</span>
          </div>
          <ProgressBar
            className="mt-2"
            value={progressPercent(nextSaved, goal.target)}
            tone={nextSaved >= goal.target ? 'good' : 'brand'}
            size="sm"
            label="Projected goal progress"
          />
          <p className="mt-2 text-[12px] text-muted">
            {formatPercent(progressPercent(nextSaved, goal.target), 0)} of {formatCurrency(goal.target)}
            {nextSaved >= goal.target && goal.target > 0 ? ' — that finishes the goal.' : ''}
          </p>
        </div>
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------------------- */
/* Create / edit goal                                                         */
/* -------------------------------------------------------------------------- */

function GoalFormModal({
  goal,
  initial,
  existingEmergencyFundId,
  onClose,
}: {
  goal: SavingsGoal | null
  initial: GoalDraft
  /** The goal currently flagged as the emergency fund, if it is not this one. */
  existingEmergencyFundId: string | null
  onClose: () => void
}) {
  const actions = useActions()
  const toast = useToast()
  const mode = useChartMode()

  const [draft, setDraft] = useState<GoalDraft>(initial)
  const [submitted, setSubmitted] = useState(false)

  const patch = (next: Partial<GoalDraft>) => setDraft((current) => ({ ...current, ...next }))

  const target = Number(draft.target)
  const saved = Number(draft.saved || 0)
  const monthly = Number(draft.monthlyContribution || 0)

  const errors = {
    name: !draft.name.trim() ? 'Give this goal a name.' : undefined,
    target: !Number.isFinite(target) || target <= 0 ? 'Set a target above zero.' : undefined,
    saved:
      !Number.isFinite(saved) || saved < 0
        ? 'Cannot be negative.'
        : target > 0 && saved > target
          ? 'That is more than the target.'
          : undefined,
    monthly: !Number.isFinite(monthly) || monthly < 0 ? 'Cannot be negative.' : undefined,
  }
  const hasErrors = Object.values(errors).some(Boolean)

  // Shown as a hint, never a blocker: an existing goal whose deadline has slipped
  // still needs to be editable for every other reason.
  const deadlinePassed = Boolean(draft.deadline) && draft.deadline < todayISO()

  const remainingForPlan = Math.max(0, (Number.isFinite(target) ? target : 0) - (goal ? goal.saved : saved))
  const monthsToDeadline = draft.deadline ? Math.max(1, Math.round(daysUntil(draft.deadline) / 30.44)) : null
  const requiredMonthly =
    monthsToDeadline != null && remainingForPlan > 0 ? Math.ceil(remainingForPlan / monthsToDeadline) : null

  function submit() {
    setSubmitted(true)
    if (hasErrors) return

    const shared = {
      name: draft.name.trim(),
      target,
      icon: draft.icon,
      monthlyContribution: monthly > 0 ? monthly : undefined,
      deadline: draft.deadline || undefined,
      isEmergencyFund: draft.isEmergencyFund,
    }

    if (goal) {
      // `goal/update` already demotes the previous emergency fund for us.
      actions.updateGoal(goal.id, shared)
      toast.success(`"${shared.name}" updated.`)
    } else {
      // `goal/add` does not, so clear the old flag first to keep exactly one.
      if (draft.isEmergencyFund && existingEmergencyFundId) {
        actions.updateGoal(existingEmergencyFundId, { isEmergencyFund: false })
      }
      actions.addGoal({ ...shared, saved: saved > 0 ? saved : undefined })
      toast.success(`"${shared.name}" created.`)
    }
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={goal ? 'Edit goal' : 'New savings goal'}
      description={
        goal
          ? 'Targets, deadlines and plans can change — the contribution history stays intact.'
          : 'Name it, price it, and give it a date if there is one.'
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            {goal ? 'Save changes' : 'Create goal'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Goal name" required error={submitted ? errors.name : undefined}>
          {(id) => (
            <TextInput
              id={id}
              autoFocus
              value={draft.name}
              maxLength={48}
              placeholder="e.g. Goa trip"
              onChange={(event) => patch({ name: event.target.value })}
              invalid={submitted && errors.name != null}
            />
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Target amount" required error={submitted ? errors.target : undefined}>
            {(id) => (
              <CurrencyInput
                id={id}
                value={draft.target}
                placeholder="0"
                onChange={(event) => patch({ target: event.target.value })}
                invalid={submitted && errors.target != null}
              />
            )}
          </Field>

          {goal ? (
            <Field
              label="Saved so far"
              hint="Adjusted through deposits and withdrawals, not edited directly."
            >
              {(id) => (
                <TextInput id={id} value={formatCurrency(goal.saved)} readOnly disabled className="tabular" />
              )}
            </Field>
          ) : (
            <Field
              label="Already saved"
              hint="Optional — logged as an opening balance."
              error={submitted ? errors.saved : undefined}
            >
              {(id) => (
                <CurrencyInput
                  id={id}
                  value={draft.saved}
                  placeholder="0"
                  onChange={(event) => patch({ saved: event.target.value })}
                  invalid={submitted && errors.saved != null}
                />
              )}
            </Field>
          )}
        </div>

        <div>
          <p className="text-[13px] font-medium text-ink-secondary">Icon</p>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Goal icon">
            {GOAL_ICONS.map((icon) => {
              const Icon = GOAL_ICON_COMPONENTS[icon]
              const active = draft.icon === icon
              const accent = goalAccent(icon, mode)
              return (
                <button
                  key={icon}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={GOAL_ICON_LABELS[icon]}
                  title={GOAL_ICON_LABELS[icon]}
                  onClick={() => patch({ icon })}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl border transition-colors',
                    active
                      ? 'border-brand ring-2 ring-brand/30'
                      : 'border-hairline hover:border-hairline-strong',
                  )}
                  style={
                    active
                      ? { backgroundColor: `color-mix(in oklab, ${accent} 16%, transparent)`, color: accent }
                      : undefined
                  }
                >
                  <Icon className={cn('h-[18px] w-[18px]', !active && 'text-ink-secondary')} aria-hidden="true" />
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[12px] text-muted">
            The icon also picks the colour this goal wears across the app.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Monthly contribution"
            hint={
              requiredMonthly != null
                ? `Deadline needs about ${formatCurrency(requiredMonthly)} a month.`
                : 'Optional — used for forecasting and cash-flow planning.'
            }
            error={submitted ? errors.monthly : undefined}
          >
            {(id) => (
              <CurrencyInput
                id={id}
                value={draft.monthlyContribution}
                placeholder="0"
                onChange={(event) => patch({ monthlyContribution: event.target.value })}
                invalid={submitted && errors.monthly != null}
              />
            )}
          </Field>

          <Field
            label="Deadline"
            hint={
              deadlinePassed
                ? 'That date has already passed — the goal will show as overdue.'
                : 'Optional — drives the on-track badge.'
            }
          >
            {(id) => (
              <TextInput
                id={id}
                type="date"
                value={draft.deadline}
                onChange={(event) => patch({ deadline: event.target.value })}
              />
            )}
          </Field>
        </div>

        {requiredMonthly != null && monthly > 0 ? (
          <div className="flex items-start gap-2 rounded-xl border border-hairline bg-surface-2 px-3.5 py-3">
            {monthly >= requiredMonthly ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-good" aria-hidden="true" />
            ) : (
              <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            )}
            <p className="text-[12.5px] leading-relaxed text-ink-secondary">
              {monthly >= requiredMonthly
                ? `${formatCurrency(monthly)} a month clears the ${formatCurrency(remainingForPlan)} still needed with room to spare.`
                : `${formatCurrency(monthly)} a month leaves you short — you need ${formatCurrency(requiredMonthly)} to hit this deadline.`}
            </p>
          </div>
        ) : null}

        <div className="rounded-xl border border-hairline px-3.5 py-3">
          <Switch
            checked={draft.isEmergencyFund}
            onChange={(next) => patch({ isEmergencyFund: next })}
            label="This is my emergency fund"
            description={
              existingEmergencyFundId && draft.isEmergencyFund
                ? 'Only one goal can hold this — the current emergency fund will be unflagged.'
                : 'Featured on the dashboard and used for the six-month coverage check.'
            }
          />
        </div>

        {!goal ? (
          <p className="text-[12px] text-muted">
            You can log deposits and withdrawals against this goal as soon as it exists.
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
