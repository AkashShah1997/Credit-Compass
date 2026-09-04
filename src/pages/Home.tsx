/**
 * Credit health — the whole app, really.
 *
 * Top to bottom it answers one question: what is my score doing, why, and what
 * do I do next? Every number comes from `lib/credit.ts`; this file arranges it
 * and owns the two things you actually touch each month — your score and your
 * card balances.
 */

import { useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CalendarClock,
  Clock,
  Copy,
  CreditCard,
  Download,
  Gauge,
  History,
  Minus,
  Search,
  Sparkles,
  Trash2,
  TrendingDown,
} from 'lucide-react'
import { useActions, useAppState } from '../store/AppStore'
import { useChartMode } from '../store/ThemeProvider'
import {
  UTILISATION_HEALTHY,
  UTILISATION_IDEAL,
  creditOverview,
  isEmptyWorkspace,
  scoreByMonth,
  signedPoints,
  simulatePaydown,
  type CreditEvent,
  type CreditFactor,
  type FactorStatus,
  type Impact,
  type Timing,
} from '../lib/credit'
import { formatDate, formatDateShort, monthKey, monthRange, monthShort, todayISO } from '../lib/date'
import { formatCurrency, formatNumber, formatPercent, formatTenure, ordinal } from '../lib/format'
import { BUREAU_SLOT, seriesColor } from '../lib/palette'
import { FILE_PREFIX } from '../lib/brand'
import { DEFAULT_PROMPT_OPTIONS, buildCreditPrompt, promptStats, type PromptOptions } from '../lib/prompt'
import { CREDIT_BUREAUS, SCORE_SOURCES, type AppState, type CreditBureau } from '../types'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Button, IconButton } from '../components/ui/Button'
import { StatTile } from '../components/ui/StatTile'
import { ProgressBar, RingProgress } from '../components/ui/Progress'
import { Badge, SeriesDot, StatusBadge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { CurrencyInput, Field, SelectInput, Switch, TextInput } from '../components/ui/Field'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Segmented } from '../components/ui/Tabs'
import { useToast } from '../components/ui/Toast'
import { ChartFrame } from '../components/charts/ChartFrame'
import { TrendChart } from '../components/charts/TrendChart'
import { SetupWizard } from '../components/setup/SetupWizard'
import { hrefFor } from '../hooks/useRouter'
import { cn } from '../lib/cn'

const IMPACT_STATUS: Record<Impact, 'serious' | 'warning' | 'info'> = {
  high: 'serious',
  medium: 'warning',
  low: 'info',
}
const IMPACT_LABEL: Record<Impact, string> = { high: 'High impact', medium: 'Medium impact', low: 'Small gain' }

const TIMING_LABEL: Record<Timing, string> = {
  now: 'Do today',
  'before-statement': 'Before the statement date',
  'this-month': 'This month',
  ongoing: 'Keep doing',
  avoid: 'Avoid for now',
}

const FACTOR_STATUS: Record<FactorStatus, { status: 'good' | 'warning' | 'critical' | 'info'; label: string }> = {
  good: { status: 'good', label: 'Healthy' },
  warning: { status: 'warning', label: 'Needs work' },
  critical: { status: 'critical', label: 'Fix first' },
  unknown: { status: 'info', label: 'No data' },
}

const EVENT_ICON: Record<CreditEvent['kind'], typeof Gauge> = {
  score: Gauge,
  inquiry: Search,
  account: CreditCard,
  debt: CalendarClock,
}

/** Thirteen months, so a year-ago reading is always on the chart. */
const CHART_MONTHS = 13

/** The first point and every January carry the year so no two labels collide. */
function axisLabel(month: string, index: number): string {
  const short = monthShort(month)
  return index === 0 || month.endsWith('-01') ? `${short} ’${month.slice(2, 4)}` : short
}

export default function Home() {
  const state = useAppState()
  const actions = useActions()
  const toast = useToast()
  const mode = useChartMode()

  const overview = useMemo(() => creditOverview(state), [state])
  const { trend, band, nextBand, utilisation, factors, recommendations, inquiries, ages, drop, timeline } = overview
  const goal = state.settings.scoreGoal
  const latest = trend.latest

  const [wizardOpen, setWizardOpen] = useState(false)
  const [scoreOpen, setScoreOpen] = useState(false)
  const [balancesOpen, setBalancesOpen] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const [deleteScore, setDeleteScore] = useState<{ id: string; label: string } | null>(null)
  const [showAllEvents, setShowAllEvents] = useState(false)

  const equifaxColor = seriesColor(BUREAU_SLOT.Equifax, mode)
  const transunionColor = seriesColor(BUREAU_SLOT.TransUnion, mode)

  /* Score chart ----------------------------------------------------------- */
  const months = useMemo(() => monthRange(CHART_MONTHS), [])
  const series = useMemo(() => scoreByMonth(state.creditScores, months), [state.creditScores, months])
  const chartData = useMemo(
    () =>
      series.map((point, i) => ({
        label: axisLabel(point.month, i),
        Equifax: point.Equifax,
        TransUnion: point.TransUnion,
      })),
    [series],
  )
  const hasReadings = series.some((point) => point.Equifax != null || point.TransUnion != null)

  const markers = useMemo(() => {
    const labelFor = new Map(months.map((month, i) => [month, axisLabel(month, i)]))
    const out: { x: string; label: string }[] = []
    for (const debt of state.debts) {
      const label = labelFor.get(monthKey(debt.startDate))
      if (label) out.push({ x: label, label: debt.name })
    }
    for (const inquiry of state.inquiries) {
      const label = labelFor.get(monthKey(inquiry.date))
      if (label && !out.some((m) => m.x === label)) out.push({ x: label, label: 'Inquiry' })
    }
    return out
  }, [months, state.debts, state.inquiries])

  // Fit the axis to the readings and the goal rather than 300–900, which would
  // turn a seventy-point drop into a wobble.
  const yDomain = useMemo<[number, number]>(() => {
    const values = series.flatMap((p) => [p.Equifax, p.TransUnion]).filter((v): v is number => v != null)
    if (!values.length) return [600, 800]
    values.push(goal)
    return [
      Math.max(300, Math.floor((Math.min(...values) - 30) / 50) * 50),
      Math.min(900, Math.ceil((Math.max(...values) + 30) / 50) * 50),
    ]
  }, [series, goal])

  const goalProgress = latest ? Math.max(0, Math.min(100, ((latest.score - 300) / Math.max(1, goal - 300)) * 100)) : 0
  const ChangeIcon =
    trend.changeSincePrevious == null || trend.changeSincePrevious === 0
      ? Minus
      : trend.changeSincePrevious > 0
        ? ArrowUpRight
        : ArrowDownRight

  const visibleEvents = showAllEvents ? timeline : timeline.slice(0, 8)

  // The "why it dropped" card above covers the new-account story in full, so
  // repeating it as a numbered action would be the same paragraph twice.
  const actions_ = drop ? recommendations.filter((rec) => rec.id !== `new:${drop.cause.id}`) : recommendations

  /* Empty state ----------------------------------------------------------- */
  if (isEmptyWorkspace(state)) {
    return (
      <>
        <div className="flex flex-col gap-5">
          <PageHeader
            title="Credit health"
            subtitle="Where your score stands, what is holding it there, and the next thing to do about it."
          />
          <Card>
            <EmptyState
              icon={<Gauge className="h-5 w-5" />}
              title="Let's set this up — about a minute"
              message="Add your cards, anything you are paying off, and your score today. That is all this app ever needs from you; everything else it works out. If you already have a backup file, restore it from Settings instead."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="primary" icon={<Sparkles className="h-4 w-4" />} onClick={() => setWizardOpen(true)}>
                    Start setup
                  </Button>
                  <Button onClick={() => (window.location.hash = hrefFor('/settings'))}>Restore a backup</Button>
                </div>
              }
            />
          </Card>
        </div>
        {wizardOpen ? <SetupWizard onClose={() => setWizardOpen(false)} /> : null}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Credit health"
        subtitle="Where your score stands, what is holding it there, and the next thing to do about it."
        action={
          <>
            {state.accounts.length ? (
              <Button icon={<CreditCard className="h-4 w-4" />} onClick={() => setBalancesOpen(true)}>
                Update balances
              </Button>
            ) : null}
            <Button variant="primary" icon={<Gauge className="h-4 w-4" />} onClick={() => setScoreOpen(true)}>
              Update score
            </Button>
          </>
        }
      />

      {/* Hero ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="relative overflow-hidden lg:col-span-5">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-16 -right-12 h-52 w-52 rounded-full opacity-[0.07]"
            style={{ background: `radial-gradient(circle, ${equifaxColor}, transparent 70%)` }}
          />
          <div className="relative flex h-full flex-col justify-between gap-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
                  <Gauge className="h-4 w-4" aria-hidden="true" />
                  Credit score
                </p>
                {latest ? (
                  <>
                    <p className="mt-2.5 text-[48px] leading-none font-semibold tracking-[-0.03em] text-ink sm:text-[56px]">
                      {latest.score}
                    </p>
                    <p className="mt-2.5 text-[13px] text-ink-secondary">
                      {latest.bureau}
                      {latest.source ? ` via ${latest.source}` : ''} · {formatDate(latest.date)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-2.5 text-[24px] leading-tight font-semibold tracking-[-0.02em] text-ink">
                      No reading yet
                    </p>
                    <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">
                      Borrowell, Credit Karma and most bank apps show it free. Everything below already works
                      without it.
                    </p>
                  </>
                )}
              </div>
              {latest && band ? (
                <RingProgress value={goalProgress} size={104} thickness={9} tone={band.tone === 'info' ? 'brand' : band.tone}>
                  <span className="text-[17px] leading-none font-semibold tracking-[-0.02em] text-ink">
                    {Math.round(goalProgress)}%
                  </span>
                  <span className="mt-1 text-[10px] text-muted">of {goal}</span>
                </RingProgress>
              ) : null}
            </div>

            {latest && band ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={band.tone}>{band.label}</StatusBadge>
                  {trend.changeSincePrevious != null ? (
                    <Badge
                      tone={trend.changeSincePrevious > 0 ? 'good' : trend.changeSincePrevious < 0 ? 'critical' : 'neutral'}
                      icon={<ChangeIcon className="h-3 w-3" />}
                    >
                      {signedPoints(trend.changeSincePrevious)} since last
                    </Badge>
                  ) : null}
                  {trend.peak && trend.changeSincePeak != null && trend.changeSincePeak < 0 ? (
                    <Badge tone="neutral">{signedPoints(trend.changeSincePeak)} from peak {trend.peak.score}</Badge>
                  ) : null}
                </div>
                <p className="text-[13px] leading-relaxed text-ink-secondary">
                  {nextBand
                    ? `${nextBand.points} point${nextBand.points === 1 ? '' : 's'} to ${nextBand.band.label.toLowerCase()} (${nextBand.band.min}+). `
                    : 'Top band — nothing above this. '}
                  {latest.score < goal ? `${goal - latest.score} to your ${goal} goal.` : 'Goal reached.'}
                </p>
              </>
            ) : (
              <Button variant="primary" size="sm" icon={<Gauge className="h-4 w-4" />} onClick={() => setScoreOpen(true)}>
                Log your score
              </Button>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-7">
          <StatTile
            label="Utilization"
            value={utilisation.accounts.length ? formatPercent(utilisation.percent, 0) : '—'}
            upIsGood={false}
            sub={
              utilisation.accounts.length ? (
                <span className="inline-flex">
                  <StatusBadge status={utilisation.tone}>
                    {utilisation.percent < UTILISATION_IDEAL
                      ? 'Under 10% — ideal'
                      : utilisation.percent < UTILISATION_HEALTHY
                        ? 'Under the 30% line'
                        : `Pay ${formatCurrency(utilisation.toHealthy)} to get under 30%`}
                  </StatusBadge>
                </span>
              ) : (
                'Add a card to measure this'
              )
            }
            icon={<CreditCard className="h-4 w-4" />}
            accent={seriesColor(1, mode)}
          />
          <StatTile
            label="Next statement"
            value={utilisation.nextStatement ? formatDateShort(utilisation.nextStatement.statementDate) : '—'}
            sub={
              utilisation.nextStatement
                ? utilisation.nextStatement.toHealthy > 0
                  ? `${utilisation.nextStatement.account.name} · pay ${formatCurrency(utilisation.nextStatement.toHealthy)} first`
                  : `${utilisation.nextStatement.account.name} · nothing to pay down`
                : 'No statement dates yet'
            }
            icon={<CalendarClock className="h-4 w-4" />}
            accent={seriesColor(3, mode)}
          />
          <StatTile
            label="Inquiries counting"
            value={String(inquiries.weighing.length)}
            upIsGood={false}
            sub={
              inquiries.nextToClear
                ? `Oldest clears ${formatDate(inquiries.nextToClear.impactEnds)}`
                : 'None in the last 12 months'
            }
            icon={<Search className="h-4 w-4" />}
            accent={seriesColor(4, mode)}
          />
          <StatTile
            label="Credit history"
            value={ages.oldestMonths != null ? formatTenure(ages.oldestMonths) : '—'}
            sub={
              ages.oldestMonths == null
                ? 'Set your start date in Settings'
                : ages.thinFile
                  ? 'Still a young file — it heals with time'
                  : 'Long enough to stop holding you back'
            }
            icon={<Clock className="h-4 w-4" />}
            accent={seriesColor(2, mode)}
          />
        </div>
      </div>

      {/* Why it dropped --------------------------------------------------- */}
      {drop ? (
        <Card className="border-hairline-strong">
          <CardHeader
            title="Why your score dropped"
            subtitle="The most likely cause, and when it should come back"
            icon={<TrendingDown className="h-4 w-4" />}
          />
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <p className="text-[13.5px] leading-relaxed text-ink-secondary">
                Your <strong className="font-semibold text-ink">{drop.cause.label}</strong> started{' '}
                {formatTenure(drop.monthsIn)} ago
                {drop.points != null && drop.from ? (
                  <>
                    , and your score has moved{' '}
                    <strong
                      className={cn('font-semibold', drop.points < 0 ? 'text-negative' : 'text-positive')}
                    >
                      {signedPoints(drop.points)}
                    </strong>{' '}
                    since {formatDate(drop.from.date)}
                  </>
                ) : null}
                . Opening it did three things at once: added a hard inquiry, put a brand-new account on your file,
                and pulled down your average account age. A 40–80 point drop from that combination is normal and
                does not mean anything is wrong.
              </p>
              <p className="mt-3 text-[13.5px] leading-relaxed text-ink-secondary">
                All three fade on their own.{' '}
                {drop.inquiryClears
                  ? `The inquiry stops counting on ${formatDate(drop.inquiryClears)}, and the account stops reading as "new" around the same time.`
                  : 'The account stops reading as "new" at about twelve months.'}{' '}
                What would set it back is opening or closing another account before then.
              </p>
            </div>
            <div className="rounded-xl border border-hairline bg-surface-2 p-4">
              <p className="text-[12px] font-medium text-muted">Expected recovery</p>
              <p className="mt-1 text-[17px] font-semibold tracking-[-0.01em] text-ink">
                {drop.recoveryFrom} – {drop.recoveryTo}
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                Month 12 to 18 after opening, assuming payments stay on time and utilization comes down. You are{' '}
                {formatTenure(drop.monthsIn)} in.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {/* What to do next -------------------------------------------------- */}
      <Card>
        <CardHeader
          title="What to do next"
          subtitle="Ordered by how much each moves the score, using your actual balances and dates"
          icon={<Sparkles className="h-4 w-4" />}
          action={
            <Button size="sm" icon={<Bot className="h-4 w-4" />} onClick={() => setAskOpen(true)}>
              Ask an AI
            </Button>
          }
        />
        <ol className="mt-2 flex flex-col divide-y divide-hairline">
          {actions_.map((rec, index) => (
            <li key={rec.id} className="flex gap-3 py-3.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12px] font-semibold text-ink-secondary">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={IMPACT_STATUS[rec.impact]}>{IMPACT_LABEL[rec.impact]}</StatusBadge>
                  <Badge tone="neutral" icon={<Clock className="h-3 w-3" />}>
                    {TIMING_LABEL[rec.timing]}
                  </Badge>
                </div>
                <p className="mt-1.5 text-[14px] font-semibold tracking-[-0.01em] text-ink">{rec.title}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-secondary">{rec.detail}</p>
                {rec.effect ? (
                  <p className="mt-2 inline-block rounded-lg bg-surface-2 px-3 py-1.5 text-[12.5px] font-medium text-ink">
                    {rec.effect}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
          General guidance based on how Equifax and TransUnion describe their scoring. It is not financial advice
          and not either bureau’s formula — treat it as direction, not prediction.
        </p>
      </Card>

      {/* Simulator -------------------------------------------------------- */}
      {utilisation.accounts.length > 0 ? <PaydownSimulator overview={overview} /> : null}

      {/* History ---------------------------------------------------------- */}
      <ChartFrame
        title="Score history"
        subtitle="One line per bureau — they run different models, so only compare a line to itself"
        height={288}
        legend={[
          { label: 'Equifax', color: equifaxColor },
          { label: 'TransUnion', color: transunionColor, dashed: true },
          { label: `Goal ${goal}`, color: 'var(--c-axis)', dashed: true },
        ]}
        table={{
          columns: ['Month', 'Equifax', 'TransUnion'],
          numericFrom: 1,
          rows: series
            .filter((point) => point.Equifax != null || point.TransUnion != null)
            .map((point) => [point.label, point.Equifax ?? '—', point.TransUnion ?? '—']),
        }}
        footnote={
          markers.length
            ? 'Dashed vertical lines mark the month a loan started or a lender pulled your file — the events a score reacts to.'
            : 'One reading a month is enough to see the trend.'
        }
        empty={
          hasReadings ? undefined : (
            <EmptyState
              compact
              icon={<Gauge className="h-5 w-5" />}
              title="No readings yet"
              message="Log your score and the line starts here, plotted against your goal."
              action={
                <Button size="sm" variant="primary" onClick={() => setScoreOpen(true)}>
                  Log your score
                </Button>
              }
            />
          )
        }
      >
        <TrendChart
          data={chartData}
          xKey="label"
          series={[
            { key: 'Equifax', label: 'Equifax', color: equifaxColor, kind: 'line' },
            { key: 'TransUnion', label: 'TransUnion', color: transunionColor, kind: 'line', dashed: true },
          ]}
          format={(value) => String(Math.round(value))}
          yTickFormat={(value) => String(Math.round(value))}
          yDomain={yDomain}
          reference={{ value: goal, label: `Goal ${goal}` }}
          markers={markers}
        />
      </ChartFrame>

      {/* Factors ---------------------------------------------------------- */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">What the score is made of</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Five factors, weighted roughly the way the bureaus describe them. Fix the top of the list first.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {factors.map((factor) => (
            <FactorCard key={factor.key} factor={factor} />
          ))}
        </div>
      </section>

      {/* Timeline --------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Timeline"
          subtitle="Every reading, inquiry and account — the story behind the line"
          icon={<History className="h-4 w-4" />}
        />
        {timeline.length === 0 ? (
          <EmptyState className="mt-4" compact icon={<History className="h-5 w-5" />} title="Nothing yet" />
        ) : (
          <>
            <ul className="mt-2 flex flex-col divide-y divide-hairline">
              {visibleEvents.map((event) => {
                const Icon = EVENT_ICON[event.kind]
                const color =
                  event.kind === 'score'
                    ? event.bureau === 'TransUnion'
                      ? transunionColor
                      : equifaxColor
                    : undefined
                return (
                  <li key={event.id} className="flex items-center gap-3 py-2.5">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-secondary"
                      style={color ? { backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`, color } : undefined}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
                        {color ? <SeriesDot color={color} /> : null}
                        <span className="truncate">{event.title}</span>
                      </span>
                      <span className="block truncate text-[12px] text-muted">{event.detail}</span>
                    </span>
                    <span className="tabular shrink-0 text-[12px] text-muted">{formatDate(event.date)}</span>
                    {event.kind === 'score' ? (
                      <IconButton
                        label={`Remove ${event.title}`}
                        size="sm"
                        onClick={() => setDeleteScore({ id: event.id, label: event.title })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    ) : (
                      <span className="h-8 w-8 shrink-0" aria-hidden="true" />
                    )}
                  </li>
                )
              })}
            </ul>
            {timeline.length > 8 ? (
              <div className="mt-3 flex justify-center">
                <Button size="sm" variant="ghost" onClick={() => setShowAllEvents((v) => !v)}>
                  {showAllEvents ? 'Show recent only' : `Show all ${timeline.length}`}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>

      {scoreOpen ? <UpdateScoreModal state={state} onClose={() => setScoreOpen(false)} /> : null}
      {balancesOpen ? <UpdateBalancesModal state={state} onClose={() => setBalancesOpen(false)} /> : null}
      {askOpen ? <AskAiModal state={state} onClose={() => setAskOpen(false)} /> : null}

      <ConfirmDialog
        open={deleteScore != null}
        title={`Remove ${deleteScore?.label ?? 'this reading'}?`}
        message="The reading is deleted from your history. Nothing else changes."
        confirmLabel="Remove"
        onConfirm={() => {
          if (deleteScore) {
            actions.removeScore(deleteScore.id)
            toast.success('Reading removed.')
          }
          setDeleteScore(null)
        }}
        onCancel={() => setDeleteScore(null)}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Simulator                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * "If I pay this much before the statement date, what gets reported?"
 *
 * The single most useful thing on the page, because utilization is the only
 * factor that can move within one cycle — and because the number that matters
 * is not what you owe today but what the balance reads on the statement day.
 */
function PaydownSimulator({ overview }: { overview: ReturnType<typeof creditOverview> }) {
  const { utilisation } = overview
  const [accountId, setAccountId] = useState(utilisation.accounts[0]?.account.id ?? '')
  const selected = utilisation.accounts.find((row) => row.account.id === accountId) ?? utilisation.accounts[0]
  const [payment, setPayment] = useState(() => Math.min(selected?.toHealthy ?? 0, selected?.balance ?? 0))

  if (!selected) return null

  const scenario = simulatePaydown(utilisation, selected.account.id, payment)
  const max = Math.max(1, Math.round(selected.balance))
  const crossesHealthy = scenario.accountPercent < UTILISATION_HEALTHY && selected.percent >= UTILISATION_HEALTHY
  const crossesIdeal = scenario.accountPercent < UTILISATION_IDEAL

  return (
    <Card>
      <CardHeader
        title="What if I pay some off?"
        subtitle={`Drag to see what ${selected.account.name} would report on the ${ordinal(selected.account.statementDay)}`}
        icon={<Gauge className="h-4 w-4" />}
        action={
          utilisation.accounts.length > 1 ? (
            <SelectInput
              aria-label="Account to simulate"
              className="w-44 text-[13px]"
              value={selected.account.id}
              onChange={(event) => {
                const next = utilisation.accounts.find((row) => row.account.id === event.target.value)
                setAccountId(event.target.value)
                setPayment(Math.min(next?.toHealthy ?? 0, next?.balance ?? 0))
              }}
            >
              {utilisation.accounts.map((row) => (
                <option key={row.account.id} value={row.account.id}>
                  {row.account.name}
                </option>
              ))}
            </SelectInput>
          ) : undefined
        }
      />

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="paydown" className="text-[13px] font-medium text-ink-secondary">
              Pay before the statement closes
            </label>
            <span className="tabular text-[22px] leading-none font-semibold tracking-[-0.02em] text-ink">
              {formatCurrency(scenario.payment)}
            </span>
          </div>
          <input
            id="paydown"
            type="range"
            min={0}
            max={max}
            step={Math.max(1, Math.round(max / 200))}
            value={Math.min(payment, max)}
            onChange={(event) => setPayment(Number(event.target.value))}
            className="mt-3 w-full cursor-pointer accent-brand"
          />
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span>{formatCurrency(0)}</span>
            <span>{formatCurrency(max)} (clear it)</span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {selected.toHealthy > 0 ? (
              <Button size="sm" onClick={() => setPayment(selected.toHealthy)}>
                Under 30% · {formatCurrency(selected.toHealthy)}
              </Button>
            ) : null}
            {selected.toIdeal > 0 ? (
              <Button size="sm" onClick={() => setPayment(selected.toIdeal)}>
                Under 10% · {formatCurrency(selected.toIdeal)}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setPayment(0)}>
              Reset
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-hairline bg-surface-2 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12.5px] text-muted">{selected.account.name} would report</span>
            <span className="tabular text-[26px] leading-none font-semibold tracking-[-0.02em] text-ink">
              {formatPercent(scenario.accountPercent, 0)}
            </span>
          </div>
          <ProgressBar
            className="mt-3"
            value={scenario.accountPercent}
            tone={scenario.accountTone}
            size="lg"
            markers={[UTILISATION_IDEAL, UTILISATION_HEALTHY]}
            label="Projected utilization"
          />
          <p className="mt-2 text-[11.5px] text-muted">
            Was {formatPercent(selected.percent, 0)} · ticks are the 10% and 30% lines
          </p>

          {utilisation.accounts.length > 1 ? (
            <p className="mt-3 border-t border-hairline pt-3 text-[12.5px] text-ink-secondary">
              Across every account: {formatPercent(utilisation.percent, 0)} →{' '}
              <strong className="font-semibold text-ink">{formatPercent(scenario.overallPercent, 0)}</strong>
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {crossesIdeal ? (
              <StatusBadge status="good">Under 10% — the top band</StatusBadge>
            ) : crossesHealthy ? (
              <StatusBadge status="good">Crosses under 30%</StatusBadge>
            ) : scenario.accountPercent >= UTILISATION_HEALTHY ? (
              <StatusBadge status="warning">Still over 30%</StatusBadge>
            ) : (
              <StatusBadge status="good">Under the 30% line</StatusBadge>
            )}
            {scenario.interestSaved != null && scenario.interestSaved >= 1 ? (
              <Badge tone="neutral">Saves about {formatCurrency(scenario.interestSaved)}/mo interest</Badge>
            ) : null}
          </div>
        </div>
      </div>

      <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
        Bureaus read the balance on your statement date — {formatDate(selected.statementDate)} for this account,{' '}
        {selected.daysToStatement === 0 ? 'today' : `in ${selected.daysToStatement} day${selected.daysToStatement === 1 ? '' : 's'}`}. Paying
        after that date still avoids interest, but the higher figure has already been reported.
      </p>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Factor card                                                                */
/* -------------------------------------------------------------------------- */

function FactorCard({ factor }: { factor: CreditFactor }) {
  const meta = FACTOR_STATUS[factor.status]
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">{factor.label}</p>
          <p className="mt-0.5 text-[11.5px] text-muted">≈{factor.weight}% of the score</p>
        </div>
        <StatusBadge status={meta.status}>{meta.label}</StatusBadge>
      </div>
      <p className="text-[13px] leading-snug font-medium text-ink">{factor.headline}</p>
      <p className="text-[12.5px] leading-relaxed text-ink-secondary">{factor.detail}</p>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Update score                                                               */
/* -------------------------------------------------------------------------- */

function UpdateScoreModal({ state, onClose }: { state: AppState; onClose: () => void }) {
  const actions = useActions()
  const toast = useToast()
  const latest = state.creditScores.length
    ? [...state.creditScores].sort((a, b) => a.date.localeCompare(b.date))[state.creditScores.length - 1]
    : null

  const [score, setScore] = useState('')
  const [bureau, setBureau] = useState<CreditBureau>(latest?.bureau ?? 'Equifax')
  const [source, setSource] = useState<string>(latest?.source ?? 'Borrowell')
  const [date, setDate] = useState(todayISO())
  const [submitted, setSubmitted] = useState(false)

  const value = Number(score)
  const scoreError =
    score.trim() === '' || !Number.isFinite(value) || value < 300 || value > 900
      ? 'Canadian scores run from 300 to 900.'
      : undefined
  const dateError = !date ? 'Pick a date.' : date > todayISO() ? 'Pick today or earlier.' : undefined

  function submit() {
    setSubmitted(true)
    if (scoreError || dateError) return
    actions.addScore({ date, score: Math.round(value), bureau, source: source || undefined })
    toast.success(`${bureau} ${Math.round(value)} logged.`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Update your score"
      description="One number, once a month. Borrowell and most bank apps show Equifax; Credit Karma shows TransUnion."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          ariaLabel="Credit bureau"
          value={bureau}
          onChange={setBureau}
          options={CREDIT_BUREAUS.map((option) => ({ value: option, label: option }))}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={`${bureau} score`} required error={submitted ? scoreError : undefined}>
            {(id) => (
              <TextInput
                id={id}
                autoFocus
                type="number"
                inputMode="numeric"
                min={300}
                max={900}
                className="tabular"
                value={score}
                placeholder={latest ? String(latest.score) : '700'}
                invalid={submitted && scoreError != null}
                onChange={(event) => setScore(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submit()
                }}
              />
            )}
          </Field>
          <Field label="Date" required error={submitted ? dateError : undefined}>
            {(id) => (
              <TextInput
                id={id}
                type="date"
                max={todayISO()}
                value={date}
                invalid={submitted && dateError != null}
                onChange={(event) => setDate(event.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label="Where from">
          {(id) => (
            <SelectInput id={id} value={source} onChange={(event) => setSource(event.target.value)}>
              {SCORE_SOURCES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        {latest ? (
          <p className="text-[12px] text-muted">
            Last reading: {latest.bureau} {latest.score} on {formatDate(latest.date)}.
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------------------- */
/* Update balances                                                            */
/* -------------------------------------------------------------------------- */

function UpdateBalancesModal({ state, onClose }: { state: AppState; onClose: () => void }) {
  const actions = useActions()
  const toast = useToast()
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(state.accounts.map((account) => [account.id, String(account.balance)])),
  )

  function save() {
    let changed = 0
    for (const account of state.accounts) {
      const raw = values[account.id] ?? ''
      const next = Number(raw)
      if (raw.trim() === '' || !Number.isFinite(next) || next < 0) continue
      const rounded = Math.round(next * 100) / 100
      if (rounded === account.balance) continue
      actions.updateAccount(account.id, { balance: rounded })
      changed += 1
    }
    toast.success(changed ? `${changed} balance${changed === 1 ? '' : 's'} updated.` : 'Nothing changed.')
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Update balances"
      description="What is on each card right now. This is the number utilization is calculated from."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {state.accounts.map((account, index) => (
          <Field
            key={account.id}
            label={account.name}
            hint={`Limit ${formatCurrency(account.limit)} · was ${formatCurrency(account.balance)} · statement closes on the ${ordinal(account.statementDay)}`}
          >
            {(id) => (
              <CurrencyInput
                id={id}
                autoFocus={index === 0}
                value={values[account.id] ?? ''}
                onChange={(event) => setValues((current) => ({ ...current, [account.id]: event.target.value }))}
              />
            )}
          </Field>
        ))}
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------------------- */
/* Ask an AI                                                                  */
/* -------------------------------------------------------------------------- */

const TEXTAREA_CLASS =
  'scrollbar-slim min-h-72 w-full resize-y rounded-xl border border-hairline-strong bg-surface-2 px-3 py-2.5 ' +
  'font-mono text-[12px] leading-relaxed text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25'

function AskAiModal({ state, onClose }: { state: AppState; onClose: () => void }) {
  const toast = useToast()
  const [options, setOptions] = useState<PromptOptions>(DEFAULT_PROMPT_OPTIONS)

  const prompt = useMemo(() => buildCreditPrompt(state, options), [state, options])
  const stats = promptStats(prompt)
  const toggle = (key: keyof PromptOptions) => (next: boolean) =>
    setOptions((current) => ({ ...current, [key]: next }))

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt)
      toast.success('Copied — paste it into ChatGPT, Claude, Gemini or any assistant.')
    } catch {
      toast.warn('Could not reach the clipboard — select the text and press Ctrl+C.')
    }
  }

  function download() {
    const blob = new Blob([prompt], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${FILE_PREFIX}-credit-prompt-${todayISO()}.txt`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.success('Saved as a text file.')
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Ask an AI about your credit"
      description="A plain-text briefing built from your numbers. Copy it, paste it into any assistant, and ask away."
      footer={
        <>
          <Button icon={<Download className="h-4 w-4" />} onClick={download}>
            Download .txt
          </Button>
          <Button variant="primary" icon={<Copy className="h-4 w-4" />} onClick={() => void copy()}>
            Copy prompt
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="rounded-xl border border-hairline bg-surface-2 px-3.5 py-3">
            <Switch
              checked={options.includeAppSuggestions}
              onChange={toggle('includeAppSuggestions')}
              label="This app’s suggestions"
              description="Include the list above and ask the assistant to agree, disagree or add to it."
            />
          </div>
          <div className="rounded-xl border border-hairline bg-surface-2 px-3.5 py-3">
            <Switch
              checked={options.includeScoreHistory}
              onChange={toggle('includeScoreHistory')}
              label="Full score history"
              description="Every reading, not just the latest — lets the assistant see the shape of the drop."
            />
          </div>
        </div>

        <textarea
          readOnly
          value={prompt}
          aria-label="Generated prompt"
          className={TEXTAREA_CLASS}
          onFocus={(event) => event.currentTarget.select()}
        />

        <p className="text-[11.5px] leading-relaxed text-muted">
          {formatNumber(stats.words)} words · {formatNumber(stats.characters)} characters. No name and no account
          numbers — only the figures a scoring question needs. Edit it in the box before copying if you like.
        </p>
      </div>
    </Modal>
  )
}
