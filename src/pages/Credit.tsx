/**
 * Credit health — the home page.
 *
 * One question answered top to bottom: what is my score doing, why, and what
 * do I do next? Every number here comes from `lib/credit.ts`; this file only
 * arranges it. Readings are logged by hand because no Canadian bureau offers
 * a consumer API — the modal makes that a twenty-second job once a month.
 */

import { useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Clock,
  CreditCard,
  Gauge,
  History,
  Landmark,
  Minus,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useActions, useAppState } from '../store/AppStore'
import { useChartMode } from '../store/ThemeProvider'
import {
  UTILISATION_HEALTHY,
  UTILISATION_IDEAL,
  changeSinceDate,
  creditOverview,
  scoreByMonth,
  signedPoints,
  type CreditEvent,
  type CreditFactor,
  type FactorStatus,
  type Impact,
  type Timing,
} from '../lib/credit'
import { formatDate, formatDateShort, monthKey, monthRange, monthShort, todayISO } from '../lib/date'
import { formatCurrency, formatPercent, formatTenure } from '../lib/format'
import { FLOW_COLORS, seriesColor } from '../lib/palette'
import { CREDIT_BUREAUS, SCORE_SOURCES, type CreditBureau, type CreditInquiry, type CreditScoreEntry } from '../types'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Button, IconButton } from '../components/ui/Button'
import { StatTile } from '../components/ui/StatTile'
import { ProgressBar, RingProgress } from '../components/ui/Progress'
import { Badge, SeriesDot, StatusBadge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { Field, SelectInput, TextInput } from '../components/ui/Field'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Segmented } from '../components/ui/Tabs'
import { useToast } from '../components/ui/Toast'
import { ChartFrame } from '../components/charts/ChartFrame'
import { TrendChart } from '../components/charts/TrendChart'
import { hrefFor } from '../hooks/useRouter'
import { cn } from '../lib/cn'

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

const IMPACT_STATUS: Record<Impact, 'serious' | 'warning' | 'info'> = {
  high: 'serious',
  medium: 'warning',
  low: 'info',
}
const IMPACT_LABEL: Record<Impact, string> = { high: 'High impact', medium: 'Medium impact', low: 'Small gain' }

const TIMING_LABEL: Record<Timing, string> = {
  now: 'Do it today',
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
  loan: Landmark,
}

/** Thirteen months so a year-ago reading is always on the chart for comparison. */
const CHART_MONTHS = 13

/** `2026-01` → `Jan ’26`; the first point and every January carry the year so no two labels collide. */
function axisLabel(month: string, index: number): string {
  const short = monthShort(month)
  return index === 0 || month.endsWith('-01') ? `${short} ’${month.slice(2, 4)}` : short
}

type DeleteTarget = { kind: 'score' | 'inquiry'; id: string; label: string }

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function Credit() {
  const state = useAppState()
  const actions = useActions()
  const toast = useToast()
  const mode = useChartMode()
  const flow = FLOW_COLORS[mode]

  const overview = useMemo(() => creditOverview(state), [state])
  const { trend, band, nextBand, utilisation, factors, recommendations, inquiries, ages, timeline } = overview
  const goal = state.settings.creditScoreGoal
  const latest = trend.latest

  const [logOpen, setLogOpen] = useState(false)
  const [inquiryOpen, setInquiryOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<DeleteTarget | null>(null)
  const [showAllEvents, setShowAllEvents] = useState(false)

  /* Score chart ----------------------------------------------------------- */

  const months = useMemo(() => monthRange(CHART_MONTHS), [])
  const series = useMemo(() => scoreByMonth(state.creditScores, months), [state.creditScores, months])
  const chartData = useMemo(
    () => series.map((point, i) => ({ label: axisLabel(point.month, i), Equifax: point.Equifax, TransUnion: point.TransUnion })),
    [series],
  )
  const hasReadings = series.some((point) => point.Equifax != null || point.TransUnion != null)

  const equifaxColor = seriesColor(0, mode)
  const transunionColor = seriesColor(6, mode)

  // Loans and inquiries inside the window, placed on the axis label of their month.
  const markers = useMemo(() => {
    const labelFor = new Map(months.map((month, i) => [month, axisLabel(month, i)]))
    const out: { x: string; label: string }[] = []
    for (const loan of state.loans) {
      const label = labelFor.get(monthKey(loan.startDate))
      if (label) out.push({ x: label, label: loan.name })
    }
    for (const inquiry of state.inquiries) {
      const label = labelFor.get(monthKey(inquiry.date))
      if (label && !out.some((m) => m.x === label)) out.push({ x: label, label: 'Inquiry' })
    }
    return out
  }, [months, state.loans, state.inquiries])

  // Fit the axis to the readings and the goal rather than 0–900, which turns a
  // seventy-point drop into a wobble.
  const yDomain = useMemo<[number, number]>(() => {
    const values = series.flatMap((p) => [p.Equifax, p.TransUnion]).filter((v): v is number => v != null)
    values.push(goal)
    const min = Math.min(...values)
    const max = Math.max(...values)
    return [Math.max(300, Math.floor((min - 30) / 50) * 50), Math.min(900, Math.ceil((max + 30) / 50) * 50)]
  }, [series, goal])

  /* Hero figures ---------------------------------------------------------- */

  const newest = ages.newest?.isNew ? ages.newest : null
  const sinceNewest = newest ? changeSinceDate(state.creditScores, newest.openedDate) : null
  const goalProgress = latest ? Math.max(0, Math.min(100, ((latest.score - 300) / Math.max(1, goal - 300)) * 100)) : 0
  const ChangeIcon =
    trend.changeSincePrevious == null || trend.changeSincePrevious === 0
      ? Minus
      : trend.changeSincePrevious > 0
        ? ArrowUpRight
        : ArrowDownRight

  const visibleEvents = showAllEvents ? timeline : timeline.slice(0, 10)

  /* Handlers -------------------------------------------------------------- */

  function saveScore(input: Omit<CreditScoreEntry, 'id'>) {
    actions.addScore(input)
    toast.success(`${input.bureau} ${input.score} logged for ${formatDate(input.date)}.`)
    setLogOpen(false)
  }

  function saveInquiry(input: Omit<CreditInquiry, 'id'>) {
    actions.addInquiry(input)
    toast.success(`${input.lender} inquiry added — it counts for about a year.`)
    setInquiryOpen(false)
  }

  function confirmDelete() {
    if (!pendingDelete) return
    if (pendingDelete.kind === 'score') actions.removeScore(pendingDelete.id)
    else actions.removeInquiry(pendingDelete.id)
    toast.success(`${pendingDelete.label} removed.`)
    setPendingDelete(null)
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Credit health"
        subtitle="Where your score stands, what is holding it there, and the next thing to do about it."
        action={
          <>
            <Button icon={<Search className="h-4 w-4" />} onClick={() => setInquiryOpen(true)}>
              Add inquiry
            </Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setLogOpen(true)}>
              Log score
            </Button>
          </>
        }
      />

      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                              */}
      {/* ---------------------------------------------------------------- */}
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
                    <p className="mt-2.5 text-[26px] leading-tight font-semibold tracking-[-0.02em] text-ink">
                      No reading yet
                    </p>
                    <p className="mt-2 text-[13px] text-ink-secondary">
                      Borrowell, Credit Karma and the CIBC app all show a score for free. Log the first one and
                      the trend starts here.
                    </p>
                  </>
                )}
              </div>
              {latest && band ? (
                <RingProgress value={goalProgress} size={108} thickness={9} tone={band.tone === 'info' ? 'brand' : band.tone}>
                  <span className="text-[17px] leading-none font-semibold tracking-[-0.02em] text-ink">
                    {Math.round(goalProgress)}%
                  </span>
                  <span className="mt-1 text-[10px] text-muted">of {goal} goal</span>
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
                      {signedPoints(trend.changeSincePrevious)} since last reading
                    </Badge>
                  ) : null}
                  {sinceNewest && newest ? (
                    <Badge tone="neutral">
                      {signedPoints(sinceNewest.change)} since {newest.label.toLowerCase()}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-[13px] leading-relaxed text-ink-secondary">
                  {nextBand
                    ? `${nextBand.points} point${nextBand.points === 1 ? '' : 's'} to ${nextBand.band.label.toLowerCase()} (${nextBand.band.min}+). `
                    : 'Top band — there is nothing above this. '}
                  {latest.score < goal ? `${goal - latest.score} to your ${goal} goal.` : 'Goal reached.'}
                  {trend.changeSincePeak != null && trend.changeSincePeak < 0 && trend.peak
                    ? ` Peak was ${trend.peak.score} on ${formatDate(trend.peak.date)}.`
                    : ''}
                </p>
              </>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setLogOpen(true)}>
                Log score
              </Button>
              <Button size="sm" icon={<CreditCard className="h-4 w-4" />} onClick={() => (window.location.hash = hrefFor('/cards'))}>
                Cards
              </Button>
              <Button size="sm" variant="ghost" iconEnd={<ArrowRight className="h-4 w-4" />} onClick={() => (window.location.hash = hrefFor('/settings'))}>
                Change goal
              </Button>
            </div>
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
                'Add a card or line of credit to measure this'
              )
            }
            icon={<CreditCard className="h-4 w-4" />}
            accent={flow.expense}
          />
          <StatTile
            label="Next statement"
            value={utilisation.nextStatement ? formatDateShort(utilisation.nextStatement.statementDate) : '—'}
            sub={
              utilisation.nextStatement
                ? utilisation.nextStatement.toHealthy > 0
                  ? `${utilisation.nextStatement.card.name} · pay ${formatCurrency(utilisation.nextStatement.toHealthy)} first`
                  : `${utilisation.nextStatement.card.name} · nothing to pay down`
                : 'No statement dates on file'
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
                ? `Oldest one clears ${formatDate(inquiries.nextToClear.impactEnds)}`
                : 'None in the last 12 months — clear to apply when you need to'
            }
            icon={<Search className="h-4 w-4" />}
            accent={seriesColor(1, mode)}
          />
          <StatTile
            label="Average account age"
            value={ages.averageMonths != null ? formatTenure(ages.averageMonths) : '—'}
            sub={
              ages.oldest
                ? `Oldest ${ages.oldest.label} · ${formatTenure(ages.oldest.months)}${ages.unknownCount ? ` · ${ages.unknownCount} card${ages.unknownCount === 1 ? '' : 's'} missing an opened date` : ''}`
                : ages.unknownCount
                  ? 'Add opened dates to your cards to measure this'
                  : 'No accounts on file yet'
            }
            icon={<Clock className="h-4 w-4" />}
            accent={seriesColor(2, mode)}
          />
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* What to do next                                                   */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="What to do next"
          subtitle="Ordered by how much each one moves the score, using your actual balances and dates"
          icon={<Sparkles className="h-4 w-4" />}
        />
        <ol className="mt-2 flex flex-col divide-y divide-hairline">
          {recommendations.map((rec, index) => (
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
              {rec.href ? (
                <a
                  href={rec.href}
                  aria-label={`Open the page for: ${rec.title}`}
                  className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
              ) : null}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
          General guidance based on how Equifax and TransUnion describe their scoring. It is not financial advice
          and it is not either bureau’s formula — treat the numbers as direction, not prediction.
        </p>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* History & utilization                                             */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <ChartFrame
          className="lg:col-span-7"
          title="Score history"
          subtitle="Each bureau on its own line — they run different models, so only compare a line to itself"
          height={288}
          legend={[
            { label: 'Equifax', color: equifaxColor },
            { label: 'TransUnion', color: transunionColor },
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
              ? 'Dashed vertical lines mark the month a loan was opened or a lender pulled your file — the events a score reacts to.'
              : 'Log one reading a month; the line fills in from there.'
          }
          empty={
            hasReadings ? undefined : (
              <EmptyState
                compact
                icon={<Gauge className="h-5 w-5" />}
                title="No score history yet"
                message="Log the score from Borrowell, Credit Karma or your bank app and it plots here against your goal."
                action={
                  <Button size="sm" variant="primary" onClick={() => setLogOpen(true)}>
                    Log a score
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

        <Card className="flex flex-col lg:col-span-5">
          <CardHeader
            title="Utilization by account"
            subtitle={
              utilisation.accounts.length
                ? `${formatCurrency(utilisation.totalBalance)} of ${formatCurrency(utilisation.totalLimit)} in use`
                : 'Share of each limit in use'
            }
            icon={<CreditCard className="h-4 w-4" />}
            action={
              utilisation.accounts.length ? (
                <StatusBadge status={utilisation.tone}>{formatPercent(utilisation.percent, 0)} overall</StatusBadge>
              ) : undefined
            }
          />

          {utilisation.accounts.length === 0 ? (
            <EmptyState
              className="mt-4 flex-1"
              compact
              icon={<CreditCard className="h-5 w-5" />}
              title="No revolving credit on file"
              message="Add your credit cards and lines of credit — utilization is the fastest lever on a score."
              action={
                <Button size="sm" variant="primary" onClick={() => (window.location.hash = hrefFor('/cards'))}>
                  Add a card
                </Button>
              }
            />
          ) : (
            <ul className="mt-2 flex flex-col divide-y divide-hairline">
              {utilisation.accounts.map((account) => (
                <li key={account.card.id} className="py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-[13.5px] font-medium text-ink">
                      <span className="truncate">{account.card.name}</span>
                      <Badge tone="neutral">{account.card.kind ?? 'Credit Card'}</Badge>
                    </span>
                    <span className="tabular shrink-0 text-[12.5px] text-ink-secondary">
                      {formatCurrency(account.balance)} / {formatCurrency(account.limit)}
                    </span>
                  </div>
                  <ProgressBar
                    className="mt-2"
                    value={account.percent}
                    tone={account.tone}
                    markers={[UTILISATION_IDEAL, UTILISATION_HEALTHY]}
                    label={`${account.card.name} utilization`}
                  />
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12px]">
                    <span className={cn('font-medium', account.tone === 'good' ? 'text-ink-secondary' : 'text-negative')}>
                      {formatPercent(account.percent, 0)} used
                    </span>
                    <span className="text-muted">
                      Statement closes {formatDateShort(account.statementDate)} ·{' '}
                      {account.daysToStatement === 0 ? 'today' : `in ${account.daysToStatement} day${account.daysToStatement === 1 ? '' : 's'}`}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-secondary">
                    {account.toHealthy > 0 ? (
                      <>
                        Pay <strong className="font-semibold text-ink">{formatCurrency(account.toHealthy)}</strong> before
                        then to report under 30%
                        {account.toIdeal > account.toHealthy ? `, or ${formatCurrency(account.toIdeal)} for under 10%` : ''}.
                      </>
                    ) : account.toIdeal > 0 ? (
                      <>Under 30% already — {formatCurrency(account.toIdeal)} more reports you under 10%.</>
                    ) : (
                      <>Under 10% — as low as it needs to be.</>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-auto pt-3 text-[11.5px] leading-relaxed text-muted">
            The two ticks are the 10% and 30% lines bureaus reward. What gets reported is the balance on the
            statement date, not what you pay by the due date.
          </p>
        </Card>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Factors                                                           */}
      {/* ---------------------------------------------------------------- */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">What the score is made of</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Five factors, weighted roughly the way the bureaus describe them. Fix the top of the list first.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {factors.map((factor) => (
            <FactorCard key={factor.key} factor={factor} />
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Inquiries & timeline                                              */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="flex flex-col lg:col-span-5">
          <CardHeader
            title="Hard inquiries"
            subtitle={
              inquiries.weighing.length
                ? `${inquiries.weighing.length} still counting against your score`
                : 'None counting in the last 12 months'
            }
            icon={<Search className="h-4 w-4" />}
            action={
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setInquiryOpen(true)}>
                Add
              </Button>
            }
          />
          {inquiries.all.length === 0 ? (
            <EmptyState
              className="mt-4 flex-1"
              compact
              icon={<Search className="h-5 w-5" />}
              title="No inquiries logged"
              message="Add one whenever a lender pulls your file — each weighs on the score for about a year and stays visible for three."
            />
          ) : (
            <ul className="mt-2 flex flex-col divide-y divide-hairline">
              {inquiries.all.map((status) => (
                <li key={status.inquiry.id} className="flex items-start gap-3 py-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-secondary">
                    <Search className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-ink">{status.inquiry.lender}</p>
                    <p className="truncate text-[12px] text-muted">
                      {status.inquiry.purpose} · {formatDate(status.inquiry.date)}
                      {status.inquiry.bureau ? ` · ${status.inquiry.bureau}` : ''}
                    </p>
                    <div className="mt-1.5">
                      {status.weighing ? (
                        <StatusBadge status="warning">Counts until {formatDate(status.impactEnds)}</StatusBadge>
                      ) : status.onReport ? (
                        <Badge tone="neutral">Visible until {formatDate(status.dropsOff)}</Badge>
                      ) : (
                        <Badge tone="neutral">Off the report</Badge>
                      )}
                    </div>
                  </div>
                  <IconButton
                    label={`Remove ${status.inquiry.lender} inquiry`}
                    size="sm"
                    onClick={() =>
                      setPendingDelete({ kind: 'inquiry', id: status.inquiry.id, label: `${status.inquiry.lender} inquiry` })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader
            title="Timeline"
            subtitle="Every reading, inquiry and account opening — the story behind the line"
            icon={<History className="h-4 w-4" />}
          />
          {timeline.length === 0 ? (
            <EmptyState
              className="mt-4"
              compact
              icon={<History className="h-5 w-5" />}
              title="Nothing on the timeline yet"
              message="Score readings, inquiries and the accounts you add all show up here in date order."
            />
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
                      {event.kind === 'score' || event.kind === 'inquiry' ? (
                        <IconButton
                          label={`Remove ${event.title}`}
                          size="sm"
                          onClick={() => setPendingDelete({ kind: event.kind as 'score' | 'inquiry', id: event.id, label: event.title })}
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
              {timeline.length > 10 ? (
                <div className="mt-3 flex justify-center">
                  <Button size="sm" variant="ghost" onClick={() => setShowAllEvents((v) => !v)}>
                    {showAllEvents ? 'Show recent only' : `Show all ${timeline.length} events`}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </Card>
      </div>

      {logOpen ? <LogScoreModal onClose={() => setLogOpen(false)} onSave={saveScore} /> : null}
      {inquiryOpen ? <AddInquiryModal onClose={() => setInquiryOpen(false)} onSave={saveInquiry} /> : null}

      <ConfirmDialog
        open={pendingDelete != null}
        title={`Remove ${pendingDelete?.label ?? 'this entry'}?`}
        message={
          pendingDelete?.kind === 'inquiry'
            ? 'Only remove an inquiry that was recorded by mistake — a real one stays on your bureau file whether it is listed here or not.'
            : 'The reading is deleted from your history. Nothing else changes.'
        }
        confirmLabel="Remove"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
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
      <p className="text-[13px] font-medium leading-snug text-ink">{factor.headline}</p>
      <p className="text-[12.5px] leading-relaxed text-ink-secondary">{factor.detail}</p>
      {factor.href ? (
        <a
          href={factor.href}
          className="mt-auto inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline"
        >
          Open <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      ) : null}
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Log a score                                                                */
/* -------------------------------------------------------------------------- */

function LogScoreModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (entry: Omit<CreditScoreEntry, 'id'>) => void
}) {
  const [date, setDate] = useState(todayISO())
  const [score, setScore] = useState('')
  const [bureau, setBureau] = useState<CreditBureau>('Equifax')
  const [source, setSource] = useState<string>('Borrowell')
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const value = Number(score)
  const scoreError =
    score.trim() === '' || !Number.isFinite(value) || value < 300 || value > 900
      ? 'Canadian scores run from 300 to 900.'
      : undefined
  const dateError = !date ? 'Pick a date.' : date > todayISO() ? 'Pick today or an earlier date.' : undefined

  function submit() {
    setSubmitted(true)
    if (scoreError || dateError) return
    onSave({ date, score: Math.round(value), bureau, source: source || undefined, note: note.trim() || undefined })
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Log a credit score"
      description="One reading a month is plenty. Note which bureau it came from — the two are not comparable."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            Save reading
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Bureau" required hint="Borrowell and the CIBC app show Equifax; Credit Karma shows TransUnion.">
          {() => (
            <Segmented
              ariaLabel="Credit bureau"
              value={bureau}
              onChange={(next) => {
                setBureau(next)
                if (source === 'Borrowell' && next === 'TransUnion') setSource('Credit Karma')
                if (source === 'Credit Karma' && next === 'Equifax') setSource('Borrowell')
              }}
              options={CREDIT_BUREAUS.map((option) => ({ value: option, label: option }))}
            />
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Score" required error={submitted ? scoreError : undefined}>
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
                placeholder="700"
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

        <Field label="Source" hint="Where you saw the number.">
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

        <Field label="Note" hint="Optional — “after paying the Visa down”, “new card reported”, and so on.">
          {(id) => (
            <TextInput
              id={id}
              value={note}
              maxLength={80}
              placeholder="e.g. First reading after the auto loan"
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------------------- */
/* Add an inquiry                                                             */
/* -------------------------------------------------------------------------- */

const INQUIRY_BUREAUS = ['Equifax', 'TransUnion', 'Both'] as const

function AddInquiryModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (inquiry: Omit<CreditInquiry, 'id'>) => void
}) {
  const [date, setDate] = useState(todayISO())
  const [lender, setLender] = useState('')
  const [purpose, setPurpose] = useState('')
  const [bureau, setBureau] = useState<(typeof INQUIRY_BUREAUS)[number]>('Equifax')
  const [submitted, setSubmitted] = useState(false)

  const lenderError = lender.trim() ? undefined : 'Who pulled your file?'
  const purposeError = purpose.trim() ? undefined : 'What was it for — a card, a loan, a phone plan?'
  const dateError = !date ? 'Pick a date.' : date > todayISO() ? 'Pick today or an earlier date.' : undefined

  function submit() {
    setSubmitted(true)
    if (lenderError || purposeError || dateError) return
    onSave({ date, lender: lender.trim(), purpose: purpose.trim(), bureau })
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Add a hard inquiry"
      description="Any credit application — card, loan, mortgage pre-approval, some phone and utility accounts."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            Add inquiry
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Lender" required error={submitted ? lenderError : undefined}>
          {(id) => (
            <TextInput
              id={id}
              autoFocus
              value={lender}
              placeholder="CIBC"
              invalid={submitted && lenderError != null}
              onChange={(event) => setLender(event.target.value)}
            />
          )}
        </Field>
        <Field label="Applied for" required error={submitted ? purposeError : undefined}>
          {(id) => (
            <TextInput
              id={id}
              value={purpose}
              placeholder="Auto loan"
              invalid={submitted && purposeError != null}
              onChange={(event) => setPurpose(event.target.value)}
            />
          )}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <Field label="Bureau" hint="Most lenders pull one; some pull both.">
            {(id) => (
              <SelectInput
                id={id}
                value={bureau}
                onChange={(event) => setBureau(event.target.value as (typeof INQUIRY_BUREAUS)[number])}
              >
                {INQUIRY_BUREAUS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        </div>
      </div>
    </Modal>
  )
}
