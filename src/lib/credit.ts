/**
 * The credit engine — the whole product, really.
 *
 * State in, numbers and plain-English reasons out. No React, no storage, no
 * side effects, so the same functions serve the UI, the AI briefing and any
 * future export. Everything here encodes the publicly documented way Canadian
 * bureau scores (Equifax, TransUnion) weigh a file. It is general guidance
 * about how scoring works, not a model of either bureau's proprietary formula,
 * and the UI says so wherever it shows.
 */

import type {
  AppNotification,
  AppState,
  CreditAccount,
  CreditBureau,
  CreditInquiry,
  CreditScoreEntry,
  NotificationSeverity,
} from '../types'
import { CREDIT_BUREAUS } from '../types'
import {
  addMonths,
  addMonthsToDate,
  daysUntil,
  formatDate,
  monthKey,
  monthLabel,
  monthsSince,
  nextDueDate,
  todayISO,
} from './date'
import { formatCurrency, formatPercent, formatTenure, ordinal } from './format'

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const SCORE_MIN = 300
export const SCORE_MAX = 900

/** Under 30% is the widely cited "healthy" line; the top scores sit under 10%. */
export const UTILISATION_HEALTHY = 30
export const UTILISATION_IDEAL = 10

/** A hard inquiry weighs on the score for about a year and stays visible for three. */
export const INQUIRY_IMPACT_MONTHS = 12
export const INQUIRY_REPORT_MONTHS = 36

/** A freshly opened account reads as "new credit" and drags average age for about this long. */
export const NEW_ACCOUNT_MONTHS = 12

/** Below this, length of history is itself holding the score back — the newcomer case. */
export const THIN_FILE_YEARS = 4

/** How stale a score reading can get before the app nudges for a new one. */
export const SCORE_STALE_DAYS = 30

export type FactorStatus = 'good' | 'warning' | 'critical' | 'unknown'

/* -------------------------------------------------------------------------- */
/* Score bands                                                                */
/* -------------------------------------------------------------------------- */

/** A rating, not an alarm: "Good" is where most files sit and gets the neutral mark. */
export type BandTone = 'good' | 'info' | 'warning' | 'critical'

export interface ScoreBand {
  label: string
  min: number
  tone: BandTone
}

/** Equifax Canada's published bands; TransUnion's sit within a few points. */
export const SCORE_BANDS: readonly ScoreBand[] = [
  { label: 'Excellent', min: 760, tone: 'good' },
  { label: 'Very good', min: 725, tone: 'good' },
  { label: 'Good', min: 660, tone: 'info' },
  { label: 'Fair', min: 560, tone: 'warning' },
  { label: 'Poor', min: 300, tone: 'critical' },
]

export function scoreBand(score: number): ScoreBand {
  return SCORE_BANDS.find((band) => score >= band.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1]
}

/** The next band up and how many points away it is; null at the top. */
export function pointsToNextBand(score: number): { band: ScoreBand; points: number } | null {
  const index = SCORE_BANDS.findIndex((band) => score >= band.min)
  if (index <= 0) return null
  const next = SCORE_BANDS[index - 1]
  return { band: next, points: next.min - score }
}

/** `+12`, `−65`, `0` — score deltas with a true minus sign. */
export function signedPoints(points: number): string {
  return points > 0 ? `+${points}` : points < 0 ? `−${Math.abs(points)}` : '0'
}

/* -------------------------------------------------------------------------- */
/* Score history                                                              */
/* -------------------------------------------------------------------------- */

export function sortedScores(entries: CreditScoreEntry[]): CreditScoreEntry[] {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.score - b.score)
}

export interface ScoreTrend {
  latest: CreditScoreEntry | null
  /** The reading before `latest` from the same bureau. */
  previous: CreditScoreEntry | null
  /** Highest same-bureau reading on file. */
  peak: CreditScoreEntry | null
  first: CreditScoreEntry | null
  changeSincePrevious: number | null
  changeSincePeak: number | null
  daysSinceLatest: number | null
  byBureau: Record<CreditBureau, CreditScoreEntry | null>
}

/**
 * Trend of the most recent bureau. Equifax and TransUnion run different models,
 * so deltas are only ever taken within one bureau — comparing a Borrowell
 * reading to a Credit Karma one would invent a change that isn't there.
 */
export function scoreTrend(entries: CreditScoreEntry[], today = todayISO()): ScoreTrend {
  const sorted = sortedScores(entries)
  const byBureau = Object.fromEntries(CREDIT_BUREAUS.map((bureau) => [bureau, null])) as Record<
    CreditBureau,
    CreditScoreEntry | null
  >
  for (const entry of sorted) byBureau[entry.bureau] = entry

  const latest = sorted[sorted.length - 1] ?? null
  if (!latest) {
    return {
      latest: null,
      previous: null,
      peak: null,
      first: null,
      changeSincePrevious: null,
      changeSincePeak: null,
      daysSinceLatest: null,
      byBureau,
    }
  }

  const same = sorted.filter((entry) => entry.bureau === latest.bureau)
  const previous = same.length > 1 ? same[same.length - 2] : null
  const peak = same.reduce((best, entry) => (entry.score > best.score ? entry : best), same[0])

  return {
    latest,
    previous,
    peak,
    first: same[0],
    changeSincePrevious: previous ? latest.score - previous.score : null,
    changeSincePeak: latest.score - peak.score,
    daysSinceLatest: Math.max(0, -daysUntil(latest.date, today)),
    byBureau,
  }
}

/** Latest same-bureau reading against the last one taken on or before `date`. */
export function changeSinceDate(
  entries: CreditScoreEntry[],
  date: string,
): { before: CreditScoreEntry; latest: CreditScoreEntry; change: number } | null {
  const sorted = sortedScores(entries)
  const latest = sorted[sorted.length - 1]
  if (!latest) return null
  const before = [...sorted].reverse().find((entry) => entry.bureau === latest.bureau && entry.date <= date)
  if (!before || before === latest) return null
  return { before, latest, change: latest.score - before.score }
}

export interface ScorePoint {
  month: string
  label: string
  Equifax: number | null
  TransUnion: number | null
}

/** Last reading per bureau in each month; null where nothing was logged. */
export function scoreByMonth(entries: CreditScoreEntry[], months: string[]): ScorePoint[] {
  const sorted = sortedScores(entries)
  return months.map((month) => {
    const point: ScorePoint = { month, label: monthLabel(month), Equifax: null, TransUnion: null }
    for (const entry of sorted) {
      if (monthKey(entry.date) === month) point[entry.bureau] = entry.score
    }
    return point
  })
}

/* -------------------------------------------------------------------------- */
/* Utilization                                                                */
/* -------------------------------------------------------------------------- */

export type UtilisationTone = 'good' | 'warning' | 'serious' | 'critical'

export function utilisationTone(percent: number): UtilisationTone {
  if (percent < UTILISATION_HEALTHY) return 'good'
  if (percent < 50) return 'warning'
  if (percent < 75) return 'serious'
  return 'critical'
}

/** Dollars to pay so the balance lands just under `targetPercent` of the limit. */
export function paydownTo(balance: number, limit: number, targetPercent: number): number {
  // Aim a dollar under the line: a balance at exactly 30.0% still rounds up on some reports.
  const ceiling = Math.max(0, Math.floor((limit * targetPercent) / 100) - 1)
  return Math.max(0, Math.round(balance - ceiling))
}

export interface AccountUtilisation {
  account: CreditAccount
  balance: number
  limit: number
  percent: number
  tone: UtilisationTone
  /** Dollars to pay before the statement closes to report under 30%. 0 when already there. */
  toHealthy: number
  /** …and under 10%. */
  toIdeal: number
  /** The next day this balance gets reported. */
  statementDate: string
  daysToStatement: number
}

export function accountUtilisation(account: CreditAccount, today = todayISO()): AccountUtilisation {
  const balance = Math.max(0, account.balance)
  const limit = Math.max(0, account.limit)
  const percent = limit > 0 ? (balance / limit) * 100 : 0
  const statementDate = nextDueDate(account.statementDay, today)
  return {
    account,
    balance,
    limit,
    percent,
    tone: utilisationTone(percent),
    toHealthy: paydownTo(balance, limit, UTILISATION_HEALTHY),
    toIdeal: paydownTo(balance, limit, UTILISATION_IDEAL),
    statementDate,
    daysToStatement: daysUntil(statementDate, today),
  }
}

export interface UtilisationSummary {
  /** Highest utilization first. */
  accounts: AccountUtilisation[]
  totalLimit: number
  totalBalance: number
  percent: number
  tone: UtilisationTone
  toHealthy: number
  toIdeal: number
  /** The account furthest over the healthy line, if any. */
  worst: AccountUtilisation | null
  /** The statement that closes soonest — the next reporting event. */
  nextStatement: AccountUtilisation | null
}

export function utilisationSummary(accounts: CreditAccount[], today = todayISO()): UtilisationSummary {
  const rows = accounts.map((account) => accountUtilisation(account, today)).sort((a, b) => b.percent - a.percent)
  const totalLimit = rows.reduce((sum, row) => sum + row.limit, 0)
  const totalBalance = rows.reduce((sum, row) => sum + row.balance, 0)
  const percent = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0
  return {
    accounts: rows,
    totalLimit,
    totalBalance,
    percent,
    tone: utilisationTone(percent),
    toHealthy: paydownTo(totalBalance, totalLimit, UTILISATION_HEALTHY),
    toIdeal: paydownTo(totalBalance, totalLimit, UTILISATION_IDEAL),
    worst: rows[0] && rows[0].percent >= UTILISATION_HEALTHY ? rows[0] : null,
    nextStatement: rows.length ? [...rows].sort((a, b) => a.daysToStatement - b.daysToStatement)[0] : null,
  }
}

export interface PaydownScenario {
  payment: number
  /** This account's reported utilization after the payment. */
  accountPercent: number
  accountTone: UtilisationTone
  /** Utilization across every account after the payment. */
  overallPercent: number
  overallTone: UtilisationTone
  /** Interest avoided over a month, when the APR is known. */
  interestSaved: number | null
}

/**
 * "If I pay $X before the statement date, what gets reported?" — the whole
 * point of the simulator. Pure arithmetic on the balance that will be read on
 * the statement day, which is the number bureaus actually see.
 */
export function simulatePaydown(
  summary: UtilisationSummary,
  accountId: string,
  payment: number,
): PaydownScenario {
  const target = summary.accounts.find((row) => row.account.id === accountId)
  const paid = Math.max(0, Math.min(payment, target?.balance ?? 0))

  const accountBalance = Math.max(0, (target?.balance ?? 0) - paid)
  const accountPercent = target && target.limit > 0 ? (accountBalance / target.limit) * 100 : 0

  const overallBalance = Math.max(0, summary.totalBalance - paid)
  const overallPercent = summary.totalLimit > 0 ? (overallBalance / summary.totalLimit) * 100 : 0

  const apr = target?.account.apr
  return {
    payment: paid,
    accountPercent,
    accountTone: utilisationTone(accountPercent),
    overallPercent,
    overallTone: utilisationTone(overallPercent),
    interestSaved: apr != null && apr > 0 ? (paid * apr) / 100 / 12 : null,
  }
}

/* -------------------------------------------------------------------------- */
/* Length of history                                                          */
/* -------------------------------------------------------------------------- */

export interface AccountAge {
  id: string
  label: string
  kind: 'revolving' | 'instalment'
  openedDate: string
  months: number
  isNew: boolean
}

export interface AgeSummary {
  /** Oldest first. */
  accounts: AccountAge[]
  averageMonths: number | null
  oldestMonths: number | null
  oldest: AccountAge | null
  newest: AccountAge | null
  newCount: number
  /** Accounts with no opened date cannot be aged — the UI offers to fill them in. */
  unknownCount: number
  /** True when the file is young enough that history itself is a limiting factor. */
  thinFile: boolean
}

export function accountAges(
  state: Pick<AppState, 'accounts' | 'debts' | 'settings'>,
  today = todayISO(),
): AgeSummary {
  const rows: AccountAge[] = []
  let unknownCount = 0

  for (const account of state.accounts) {
    if (!account.openedDate) {
      unknownCount += 1
      continue
    }
    const months = monthsSince(account.openedDate, today)
    rows.push({
      id: account.id,
      label: account.name,
      kind: 'revolving',
      openedDate: account.openedDate,
      months,
      isNew: months < NEW_ACCOUNT_MONTHS,
    })
  }
  for (const debt of state.debts) {
    const months = monthsSince(debt.startDate, today)
    rows.push({
      id: debt.id,
      label: debt.name,
      kind: 'instalment',
      openedDate: debt.startDate,
      months,
      isNew: months < NEW_ACCOUNT_MONTHS,
    })
  }

  rows.sort((a, b) => b.months - a.months)

  // The stated start of your Canadian credit history wins when it predates
  // every account still on file — a closed first card still counts for age.
  const statedMonths = state.settings.creditHistoryStart
    ? monthsSince(state.settings.creditHistoryStart, today)
    : null
  const oldestMonths = Math.max(rows[0]?.months ?? 0, statedMonths ?? 0) || null

  return {
    accounts: rows,
    averageMonths: rows.length ? rows.reduce((sum, row) => sum + row.months, 0) / rows.length : null,
    oldestMonths,
    oldest: rows[0] ?? null,
    newest: rows[rows.length - 1] ?? null,
    newCount: rows.filter((row) => row.isNew).length,
    unknownCount,
    thinFile: oldestMonths != null && oldestMonths < THIN_FILE_YEARS * 12,
  }
}

/* -------------------------------------------------------------------------- */
/* Inquiries                                                                  */
/* -------------------------------------------------------------------------- */

export interface InquiryStatus {
  inquiry: CreditInquiry
  monthsAgo: number
  /** When it stops weighing on the score. */
  impactEnds: string
  /** When it disappears from the report. */
  dropsOff: string
  weighing: boolean
  onReport: boolean
}

export interface InquirySummary {
  /** Newest first. */
  all: InquiryStatus[]
  weighing: InquiryStatus[]
  /** The inquiry whose impact window closes soonest. */
  nextToClear: InquiryStatus | null
}

export function inquirySummary(inquiries: CreditInquiry[], today = todayISO()): InquirySummary {
  const all = inquiries
    .map((inquiry) => {
      const impactEnds = addMonthsToDate(inquiry.date, INQUIRY_IMPACT_MONTHS)
      const dropsOff = addMonthsToDate(inquiry.date, INQUIRY_REPORT_MONTHS)
      return {
        inquiry,
        monthsAgo: monthsSince(inquiry.date, today),
        impactEnds,
        dropsOff,
        weighing: impactEnds > today,
        onReport: dropsOff > today,
      }
    })
    .sort((a, b) => b.inquiry.date.localeCompare(a.inquiry.date))
  const weighing = all.filter((status) => status.weighing)
  return {
    all,
    weighing,
    nextToClear: weighing.length ? [...weighing].sort((a, b) => a.impactEnds.localeCompare(b.impactEnds))[0] : null,
  }
}

/* -------------------------------------------------------------------------- */
/* The five factors                                                           */
/* -------------------------------------------------------------------------- */

export type FactorKey = 'payments' | 'utilisation' | 'age' | 'mix' | 'newCredit'

export interface CreditFactor {
  key: FactorKey
  label: string
  /** Rough share of the score this factor drives — the commonly published weights. */
  weight: number
  status: FactorStatus
  /** One line: the number that matters. */
  headline: string
  /** Why it is where it is, and what moves it. */
  detail: string
}

export function creditFactors(state: AppState, today = todayISO()): CreditFactor[] {
  const utilisation = utilisationSummary(state.accounts, today)
  const ages = accountAges(state, today)
  const inquiries = inquirySummary(state.inquiries, today)
  const revolving = state.accounts.length
  const instalment = state.debts.length
  const missed = state.settings.missedPaymentLast2Years

  /* Payment history ------------------------------------------------------- */
  const payments: CreditFactor = {
    key: 'payments',
    label: 'Payment history',
    weight: 35,
    status: revolving + instalment === 0 ? 'unknown' : missed ? 'critical' : 'good',
    headline: missed ? 'A missed payment in the last 2 years' : 'No missed payments',
    detail: missed
      ? 'The largest single factor. A payment reported 30 or more days late stays on the file for six years and outweighs everything else here. Nothing recovers it but time and an unbroken run of on-time payments from now on — set every account to autopay the minimum as a floor.'
      : 'The largest single factor, and the one you control most directly. Every on-time month adds to the record; nothing else needs to happen. Autopay the minimum on every account so a busy month can never cost you this.',
  }

  /* Utilization ----------------------------------------------------------- */
  const utilisationStatus: FactorStatus =
    revolving === 0
      ? 'unknown'
      : utilisation.percent >= 50
        ? 'critical'
        : utilisation.percent >= UTILISATION_HEALTHY
          ? 'warning'
          : 'good'
  const utilisationFactor: CreditFactor = {
    key: 'utilisation',
    label: 'Credit utilization',
    weight: 30,
    status: utilisationStatus,
    headline:
      revolving === 0
        ? 'No revolving credit on file'
        : `${formatPercent(utilisation.percent, 0)} of ${formatCurrency(utilisation.totalLimit)} in use`,
    detail:
      utilisationStatus === 'good'
        ? 'Under the 30% line the bureaus treat as healthy. The very top scores report under 10%, so there is a little left to gain by trimming further before each statement date.'
        : utilisationStatus === 'unknown'
          ? 'Utilization is the share of your revolving limits you are using. With no card or line of credit on file there is nothing to measure — and nothing building history.'
          : `Bureaus record the balance on your statement date, not what you pay by the due date. Paying ${formatCurrency(utilisation.toHealthy)} before the next statement closes reports you under 30%. This is the fastest lever you have — it can move within one cycle.`,
  }

  /* Length of history ----------------------------------------------------- */
  const ageStatus: FactorStatus =
    ages.oldestMonths == null ? 'unknown' : ages.thinFile ? 'warning' : 'good'
  const ageFactor: CreditFactor = {
    key: 'age',
    label: 'Length of history',
    weight: 15,
    status: ageStatus,
    headline:
      ages.oldestMonths == null
        ? 'Add an opening date to measure this'
        : `${formatTenure(ages.oldestMonths)} of credit history`,
    detail:
      ages.oldestMonths == null
        ? 'Length of history is about 15% of the score. Tell the app when you opened your oldest account, or when you started building credit in Canada, and it can factor this in.'
        : ages.thinFile
          ? `A file under ${THIN_FILE_YEARS} years is still young, and that alone caps how high the score can sit no matter how well you handle everything else. There is no shortcut — it heals at exactly one month per month. What you can do is protect it: never close your oldest account, and avoid adding new ones that drag the average down.`
          : 'Long enough that this is no longer holding you back. Keep the oldest account open and lightly used — closing it would shorten your history and cut your total limit in one move.',
  }

  /* Credit mix ------------------------------------------------------------ */
  const mixStatus: FactorStatus =
    revolving + instalment === 0 ? 'unknown' : revolving >= 1 && instalment >= 1 ? 'good' : 'warning'
  const mixFactor: CreditFactor = {
    key: 'mix',
    label: 'Credit mix',
    weight: 10,
    status: mixStatus,
    headline:
      revolving + instalment === 0
        ? 'Nothing on file'
        : `${revolving} revolving · ${instalment} instalment`,
    detail:
      mixStatus === 'good'
        ? 'Both kinds of credit are reporting — revolving alongside instalment. That is all this factor asks for; more accounts do not improve it.'
        : revolving === 0
          ? 'Only instalment credit is reporting. One card, used lightly and paid in full, completes the mix.'
          : 'Only revolving credit is reporting. This is a small factor — never take on a loan you do not need just to satisfy it. It fills itself in naturally the first time you finance something.',
  }

  /* New credit & inquiries ------------------------------------------------ */
  const weighing = inquiries.weighing.length
  const newCreditStatus: FactorStatus =
    weighing >= 3 || ages.newCount >= 2 ? 'critical' : weighing >= 1 || ages.newCount >= 1 ? 'warning' : 'good'
  const newCreditFactor: CreditFactor = {
    key: 'newCredit',
    label: 'New credit',
    weight: 10,
    status: newCreditStatus,
    headline:
      weighing === 0 && ages.newCount === 0
        ? 'Nothing recent'
        : `${weighing} inquir${weighing === 1 ? 'y' : 'ies'} counting · ${ages.newCount} new account${ages.newCount === 1 ? '' : 's'}`,
    detail: inquiries.nextToClear
      ? `Each hard pull weighs on the score for about a year. The most recent stops counting on ${formatDate(inquiries.nextToClear.impactEnds)} — apply for nothing before then, including "pre-approved" offers that run a hard check.`
      : 'Nothing recent is dragging here. When you do apply for something, do it once and deliberately rather than shopping several lenders in a row.',
  }

  return [payments, utilisationFactor, ageFactor, mixFactor, newCreditFactor]
}

/* -------------------------------------------------------------------------- */
/* Recommendations                                                            */
/* -------------------------------------------------------------------------- */

export type Impact = 'high' | 'medium' | 'low'
export type Timing = 'now' | 'before-statement' | 'this-month' | 'ongoing' | 'avoid'

export interface Recommendation {
  id: string
  impact: Impact
  timing: Timing
  title: string
  detail: string
  /** The change it makes, in numbers where possible. */
  effect?: string
}

const IMPACT_RANK: Record<Impact, number> = { high: 0, medium: 1, low: 2 }
const TIMING_RANK: Record<Timing, number> = { now: 0, 'before-statement': 1, 'this-month': 2, ongoing: 3, avoid: 4 }

/**
 * The ordered to-do list. Every rule is guarded by the data that triggers it,
 * so a file in good shape gets one line, not a lecture.
 */
export function creditRecommendations(state: AppState, today = todayISO()): Recommendation[] {
  const out: Recommendation[] = []
  const utilisation = utilisationSummary(state.accounts, today)
  const ages = accountAges(state, today)
  const inquiries = inquirySummary(state.inquiries, today)
  const trend = scoreTrend(state.creditScores, today)

  /* 1 · Missed payments come first --------------------------------------- */
  if (state.settings.missedPaymentLast2Years) {
    out.push({
      id: 'payments:missed',
      impact: 'high',
      timing: 'now',
      title: 'Put every account on autopay for at least the minimum',
      detail:
        'You have a missed payment in the last two years, and payment history is roughly 35% of the score — more than anything else on this page. The mark itself cannot be removed early, but a second one would set you back years. Autopay the minimum on every card and loan today; pay more by hand whenever you can.',
    })
  }

  /* 2 · Utilization, account by account ---------------------------------- */
  for (const row of utilisation.accounts) {
    const { account } = row
    if (row.percent >= UTILISATION_HEALTHY) {
      const soon = row.daysToStatement <= 7
      out.push({
        id: `util:${account.id}`,
        impact: 'high',
        timing: 'before-statement',
        title: `Pay ${formatCurrency(row.toHealthy)} on ${account.name} before the ${ordinal(account.statementDay)}`,
        detail: `Bureaus see the balance on your statement date, not what you pay by the due date. ${account.name} closes on ${formatDate(row.statementDate)}${soon ? ` — ${row.daysToStatement === 0 ? 'today' : `in ${row.daysToStatement} day${row.daysToStatement === 1 ? '' : 's'}`}` : ''}. Paying before then is what changes the number that gets reported, and it can show up on your next reading.`,
        effect: `Reported utilization ${formatPercent(row.percent, 0)} → under 30%. Under 10% takes ${formatCurrency(row.toIdeal)}.`,
      })
    } else if (row.percent >= UTILISATION_IDEAL) {
      out.push({
        id: `trim:${account.id}`,
        impact: 'medium',
        timing: 'before-statement',
        title: `Trim ${account.name} under 10% for the last few points`,
        detail: `${formatPercent(row.percent, 0)} is already healthy. The highest scores report single-digit utilization, so paying ${formatCurrency(row.toIdeal)} before the ${ordinal(account.statementDay)} is a small, optional gain.`,
      })
    }
  }
  if (utilisation.accounts.length > 1 && utilisation.percent >= UTILISATION_HEALTHY) {
    out.push({
      id: 'util:total',
      impact: 'medium',
      timing: 'before-statement',
      title: `Bring total utilization under 30% — ${formatCurrency(utilisation.toHealthy)} across all accounts`,
      detail: `Bureaus look at each account and at the total. Moving a balance between cards does not hide it; the combined figure is ${formatPercent(utilisation.percent, 0)} of ${formatCurrency(utilisation.totalLimit)}.`,
    })
  }

  /* 3 · Interest is the cost of waiting ---------------------------------- */
  for (const row of utilisation.accounts) {
    const apr = row.account.apr ?? 0
    if (row.balance <= 0 || apr <= 0) continue
    const monthly = (row.balance * apr) / 100 / 12
    if (monthly < 10) continue
    out.push({
      id: `interest:${row.account.id}`,
      impact: 'medium',
      timing: 'this-month',
      title: `Carrying ${formatCurrency(row.balance)} at ${formatPercent(apr, 2)} costs about ${formatCurrency(monthly)} a month`,
      detail:
        'That interest is money that could be clearing the balance instead. If you cannot pay it off at once, pay twice a month — once before the statement date to fix what gets reported, once before the due date to avoid interest.',
    })
  }

  /* 4 · One card: raise the limit rather than add an account -------------- */
  if (state.accounts.length === 1) {
    const only = utilisation.accounts[0]
    const raised = Math.round(only.limit * 1.5)
    const after = raised > 0 ? (only.balance / raised) * 100 : 0
    out.push({
      id: 'thin:limit',
      impact: 'medium',
      timing: 'ongoing',
      title: `Ask for a credit-limit increase on ${only.account.name} — not a new card`,
      detail: `With one revolving account, every dollar on it moves your utilization. Most issuers will review a limit increase in the app or by phone — ask whether it is a soft check first, and decline if they insist on a hard pull${inquiries.weighing.length ? ' while your recent inquiry is still counting' : ''}. A higher limit lowers utilization without you paying anything.`,
      effect: `${formatCurrency(only.limit)} → ${formatCurrency(raised)} would take today's balance from ${formatPercent(only.percent, 0)} to ${formatPercent(after, 0)}.`,
    })
  } else if (state.accounts.length === 0) {
    out.push({
      id: 'thin:none',
      impact: 'high',
      timing: inquiries.weighing.length ? 'avoid' : 'this-month',
      title: 'Get one credit card reporting',
      detail: `Scores need revolving credit reporting on-time payments, and you have none on file.${inquiries.weighing.length ? ` Wait until ${formatDate(inquiries.nextToClear?.impactEnds ?? today)} so the recent inquiry has aged, then a` : ' A'} low-limit card from your own bank is the usual first step — put one subscription on it and set autopay to pay in full.`,
    })
  }

  /* 5 · The new account is the reason — and time is the fix --------------- */
  if (ages.newest?.isNew) {
    const newest = ages.newest
    const openedMonth = monthKey(newest.openedDate)
    const since = changeSinceDate(state.creditScores, newest.openedDate)
    out.push({
      id: `new:${newest.id}`,
      impact: 'medium',
      timing: 'ongoing',
      title: `Your ${newest.label} is ${formatTenure(newest.months)} old — the dip is expected`,
      detail: `Opening it added a hard inquiry, a brand-new account and a lower average age all at once; a 40–80 point drop is normal${since ? ` (yours: ${signedPoints(since.change)} since ${monthLabel(monthKey(since.before.date))})` : ''}. Those effects fade on their own — the inquiry stops counting at twelve months and the account stops reading as "new" around the same time. What would set it back is opening or closing another account now.`,
      effect: `Expect most of the recovery between month 12 and 18 — roughly ${monthLabel(addMonths(openedMonth, 12))} to ${monthLabel(addMonths(openedMonth, 18))}.`,
    })
  }

  /* 6 · Inquiries: don't restart the clock -------------------------------- */
  if (inquiries.nextToClear) {
    const { inquiry, impactEnds, dropsOff } = inquiries.nextToClear
    const count = inquiries.weighing.length
    out.push({
      id: 'inquiries:hold',
      impact: 'medium',
      timing: 'avoid',
      title: `Apply for nothing until ${formatDate(impactEnds)}`,
      detail: `${inquiry.lender} pulled your file on ${formatDate(inquiry.date)}${count > 1 ? `, one of ${count} hard inquiries still counting` : ''}. Hard inquiries weigh on the score for about a year and stay visible until ${formatDate(dropsOff)}. Each new one restarts that clock — including store cards, phone plans and "pre-approved" offers that run a hard check.`,
    })
  }

  /* 7 · Thin file — the newcomer case ------------------------------------- */
  if (ages.thinFile && ages.oldestMonths != null) {
    out.push({
      id: 'thin:file',
      impact: 'medium',
      timing: 'ongoing',
      title: `Your file is ${formatTenure(ages.oldestMonths)} old — protect it and let it age`,
      detail: `Length of history is about 15% of the score, and a file under ${THIN_FILE_YEARS} years is still young by the bureaus' reckoning. This is the one factor that cannot be rushed. Never close your oldest account — even if you stop using it, keep it open with a small recurring charge and autopay, because closing it shortens your history and cuts your total limit at the same time.`,
    })
  }

  /* 8 · Log a score ------------------------------------------------------- */
  if (trend.daysSinceLatest == null || trend.daysSinceLatest > SCORE_STALE_DAYS) {
    out.push({
      id: 'score:log',
      impact: 'low',
      timing: 'now',
      title: trend.latest ? `Update your score — the last reading is ${trend.daysSinceLatest} days old` : 'Log your credit score',
      detail:
        'Borrowell shows your Equifax score free, Credit Karma shows TransUnion, and most bank apps show one too. One reading a month is enough to see the trend — everything above works off your accounts, not the number.',
    })
  }

  /* 9 · Protect the oldest account ---------------------------------------- */
  if (ages.oldest && ages.oldest.kind === 'revolving' && ages.oldest.months >= 24 && !ages.thinFile) {
    out.push({
      id: `anchor:${ages.oldest.id}`,
      impact: 'low',
      timing: 'ongoing',
      title: `Keep ${ages.oldest.label} open — it is your oldest account`,
      detail: `At ${formatTenure(ages.oldest.months)} it is the anchor of your credit history. Closing it would shorten your history and cut your total limit in one move.`,
    })
  }

  /* 10 · Nothing to fix ---------------------------------------------------- */
  if (!out.some((item) => item.impact !== 'low')) {
    out.unshift({
      id: 'all-clear',
      impact: 'low',
      timing: 'ongoing',
      title: 'Nothing to fix — keep paying in full and on time',
      detail: 'The score lags the behaviour by a statement cycle or two. Update your reading each month and watch it catch up.',
    })
  }

  return out.sort(
    (a, b) => IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact] || TIMING_RANK[a.timing] - TIMING_RANK[b.timing],
  )
}

/* -------------------------------------------------------------------------- */
/* Why the score moved                                                        */
/* -------------------------------------------------------------------------- */

export interface DropExplanation {
  /** The account that most likely caused it. */
  cause: AccountAge
  points: number | null
  from: CreditScoreEntry | null
  /** When the inquiry stops counting. */
  inquiryClears: string | null
  recoveryFrom: string
  recoveryTo: string
  monthsIn: number
}

/**
 * The "why did this happen" readout. Only returns something when there is a
 * recent account to blame and a score drop to explain — an invented narrative
 * is worse than none.
 */
export function explainDrop(state: AppState, today = todayISO()): DropExplanation | null {
  const ages = accountAges(state, today)
  const trend = scoreTrend(state.creditScores, today)

  // The newest account inside the window where its effects are still fading.
  const cause = [...ages.accounts]
    .filter((row) => row.months <= 24)
    .sort((a, b) => b.openedDate.localeCompare(a.openedDate))[0]
  if (!cause) return null

  const since = changeSinceDate(state.creditScores, cause.openedDate)
  const dropped = since ? since.change < 0 : false
  const stillNew = cause.months < 18
  if (!dropped && !stillNew) return null

  const openedMonth = monthKey(cause.openedDate)
  const inquiries = inquirySummary(state.inquiries, today)
  // The inquiry closest to the account opening is the one that came with it.
  const related = inquiries.all
    .filter((status) => Math.abs(monthsSince(status.inquiry.date, today) - cause.months) <= 2)
    .sort((a, b) => a.inquiry.date.localeCompare(b.inquiry.date))[0]

  return {
    cause,
    points: since ? since.change : null,
    from: since ? since.before : trend.peak,
    inquiryClears: related?.weighing ? related.impactEnds : null,
    recoveryFrom: monthLabel(addMonths(openedMonth, 12)),
    recoveryTo: monthLabel(addMonths(openedMonth, 18)),
    monthsIn: cause.months,
  }
}

/* -------------------------------------------------------------------------- */
/* Timeline                                                                   */
/* -------------------------------------------------------------------------- */

export type CreditEventKind = 'score' | 'inquiry' | 'account' | 'debt'

export interface CreditEvent {
  id: string
  date: string
  kind: CreditEventKind
  title: string
  detail: string
  bureau?: CreditBureau
}

/** Everything that happened to the file, newest first. */
export function creditTimeline(state: AppState): CreditEvent[] {
  const events: CreditEvent[] = []

  for (const entry of state.creditScores) {
    events.push({
      id: entry.id,
      date: entry.date,
      kind: 'score',
      title: `${entry.bureau} ${entry.score}`,
      detail: [entry.source, entry.note].filter(Boolean).join(' · ') || scoreBand(entry.score).label,
      bureau: entry.bureau,
    })
  }
  for (const inquiry of state.inquiries) {
    events.push({
      id: inquiry.id,
      date: inquiry.date,
      kind: 'inquiry',
      title: `Hard inquiry — ${inquiry.lender}`,
      detail: inquiry.purpose || 'Credit application',
    })
  }
  for (const account of state.accounts) {
    if (!account.openedDate) continue
    events.push({
      id: `open:${account.id}`,
      date: account.openedDate,
      kind: 'account',
      title: `${account.name} opened`,
      detail: `${account.kind} · ${formatCurrency(account.limit)} limit`,
    })
  }
  for (const debt of state.debts) {
    events.push({
      id: `open:${debt.id}`,
      date: debt.startDate,
      kind: 'debt',
      title: `${debt.name} started`,
      detail: `${debt.kind} · ${formatCurrency(debt.monthlyPayment)}/month`,
    })
  }

  return events.sort((a, b) => b.date.localeCompare(a.date))
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

const SEVERITY_RANK: Record<NotificationSeverity, number> = { critical: 0, serious: 1, warning: 2, info: 3 }

export function buildNotifications(state: AppState, today = todayISO()): AppNotification[] {
  const out: AppNotification[] = []
  const lead = state.settings.reminderLeadDays || 5

  for (const row of utilisationSummary(state.accounts, today).accounts) {
    if (row.percent < UTILISATION_HEALTHY || row.daysToStatement > lead) continue
    const when = row.daysToStatement === 0 ? 'today' : `in ${row.daysToStatement} day${row.daysToStatement === 1 ? '' : 's'}`
    out.push({
      id: `statement:${row.account.id}:${row.statementDate}`,
      kind: 'statement',
      severity: row.percent >= 50 ? 'serious' : 'warning',
      title: `${row.account.name} statement closes ${when}`,
      detail: `Pay ${formatCurrency(row.toHealthy)} first to report under 30% instead of ${formatPercent(row.percent, 0)}`,
      date: row.statementDate,
      amount: row.toHealthy,
    })
  }

  const trend = scoreTrend(state.creditScores, today)
  if (state.accounts.length > 0 && (trend.daysSinceLatest == null || trend.daysSinceLatest > SCORE_STALE_DAYS)) {
    out.push({
      id: `score:stale:${monthKey(today)}`,
      kind: 'score',
      severity: 'info',
      title: trend.latest ? 'Time to update your score' : 'Log your credit score',
      detail: trend.latest ? `Last reading ${trend.daysSinceLatest} days ago` : 'Borrowell and Credit Karma are both free',
    })
  }

  for (const status of inquirySummary(state.inquiries, today).weighing) {
    const days = daysUntil(status.impactEnds, today)
    if (days < 0 || days > lead) continue
    out.push({
      id: `inquiry:${status.inquiry.id}`,
      kind: 'inquiry',
      severity: 'info',
      title: `${status.inquiry.lender} inquiry stops counting ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}`,
      detail: 'After this it no longer weighs on your score, though it stays visible on the report',
      date: status.impactEnds,
    })
  }

  return out
    .filter((notification) => !state.dismissedAlerts.includes(notification.id))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (a.date ?? '').localeCompare(b.date ?? ''))
}

/* -------------------------------------------------------------------------- */
/* One-call overview for the page                                             */
/* -------------------------------------------------------------------------- */

export interface CreditOverview {
  trend: ScoreTrend
  band: ScoreBand | null
  nextBand: { band: ScoreBand; points: number } | null
  utilisation: UtilisationSummary
  factors: CreditFactor[]
  recommendations: Recommendation[]
  inquiries: InquirySummary
  ages: AgeSummary
  drop: DropExplanation | null
  timeline: CreditEvent[]
}

export function creditOverview(state: AppState, today = todayISO()): CreditOverview {
  const trend = scoreTrend(state.creditScores, today)
  return {
    trend,
    band: trend.latest ? scoreBand(trend.latest.score) : null,
    nextBand: trend.latest ? pointsToNextBand(trend.latest.score) : null,
    utilisation: utilisationSummary(state.accounts, today),
    factors: creditFactors(state, today),
    recommendations: creditRecommendations(state, today),
    inquiries: inquirySummary(state.inquiries, today),
    ages: accountAges(state, today),
    drop: explainDrop(state, today),
    timeline: creditTimeline(state),
  }
}

/** True when there is nothing to work with yet — the setup wizard's trigger. */
export function isEmptyWorkspace(state: AppState): boolean {
  return state.accounts.length === 0 && state.debts.length === 0 && state.creditScores.length === 0
}
