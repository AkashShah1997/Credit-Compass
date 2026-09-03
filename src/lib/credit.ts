/**
 * Credit-health derivations.
 *
 * Same contract as `finance.ts`: state in, numbers and plain-English reasons
 * out — no React, no storage. Everything here encodes the publicly documented
 * way Canadian bureau scores (Equifax, TransUnion) weigh a file. It is general
 * guidance about how scoring works, not a model of either bureau's proprietary
 * formula, and the UI says so wherever it shows.
 */

import type {
  AppNotification,
  AppState,
  CreditBureau,
  CreditCard,
  CreditInquiry,
  CreditScoreEntry,
  Loan,
  NotificationSeverity,
} from '../types'
import { CREDIT_BUREAUS } from '../types'
import {
  addMonths,
  addMonthsToDate,
  clampDayToMonth,
  daysUntil,
  formatDate,
  monthKey,
  monthLabel,
  monthsSince,
  nextDueDate,
  todayISO,
} from './date'
import { formatCurrency, formatPercent, formatTenure, ordinal } from './format'
import { amortisationSchedule, buildNotifications, cardIsPaid } from './finance'

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

/** Card spending older than this with nothing since counts as dormant. */
const DORMANT_MONTHS = 6

/** How stale a score reading can get before the app nudges for a new one. */
export const SCORE_STALE_DAYS = 30

export type FactorStatus = 'good' | 'warning' | 'critical' | 'unknown'

/* -------------------------------------------------------------------------- */
/* Score bands                                                                */
/* -------------------------------------------------------------------------- */

export type BandTone = 'good' | 'warning' | 'serious' | 'critical'

export interface ScoreBand {
  label: string
  min: number
  max: number
  tone: BandTone
}

/** Equifax Canada's published bands; TransUnion's sit within a few points. */
export const SCORE_BANDS: readonly ScoreBand[] = [
  { label: 'Excellent', min: 760, max: 900, tone: 'good' },
  { label: 'Very good', min: 725, max: 759, tone: 'good' },
  { label: 'Good', min: 660, max: 724, tone: 'warning' },
  { label: 'Fair', min: 560, max: 659, tone: 'serious' },
  { label: 'Poor', min: 300, max: 559, tone: 'critical' },
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
  changeSinceFirst: number | null
  daysSinceLatest: number | null
  byBureau: Record<CreditBureau, CreditScoreEntry | null>
}

/**
 * Trend of the most recent bureau. Equifax and TransUnion run different
 * models, so deltas are only ever taken within one bureau — comparing a
 * Borrowell reading to a Credit Karma one would invent a change that isn't there.
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
      changeSinceFirst: null,
      daysSinceLatest: null,
      byBureau,
    }
  }

  const same = sorted.filter((entry) => entry.bureau === latest.bureau)
  const previous = same.length > 1 ? same[same.length - 2] : null
  const first = same[0]
  const peak = same.reduce((best, entry) => (entry.score > best.score ? entry : best), same[0])

  return {
    latest,
    previous,
    peak,
    first,
    changeSincePrevious: previous ? latest.score - previous.score : null,
    changeSincePeak: latest.score - peak.score,
    changeSinceFirst: latest.score - first.score,
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

/** Last reading per bureau in each month of `months`; null where nothing was logged. */
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

export interface AccountUtilisation {
  card: CreditCard
  balance: number
  limit: number
  percent: number
  tone: UtilisationTone
  /** Dollars to pay before the statement closes to report under 30%. 0 when already there. */
  toHealthy: number
  /** …and under 10%. */
  toIdeal: number
  /** The next day the balance gets reported. */
  statementDate: string
  daysToStatement: number
}

/** Dollars to pay so the balance lands just under `targetPercent` of the limit. */
function paydownTo(balance: number, limit: number, targetPercent: number): number {
  // Aim a dollar under the line: a balance at exactly 30.0% still rounds up on some reports.
  const ceiling = Math.max(0, Math.floor((limit * targetPercent) / 100) - 1)
  return Math.max(0, Math.round(balance - ceiling))
}

export function accountUtilisation(card: CreditCard, today = todayISO()): AccountUtilisation {
  const balance = Math.max(0, card.outstanding)
  const limit = Math.max(0, card.creditLimit)
  const percent = limit > 0 ? (balance / limit) * 100 : 0
  const statementDate = nextDueDate(card.statementDay, today)
  return {
    card,
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

export function utilisationSummary(cards: CreditCard[], today = todayISO()): UtilisationSummary {
  const accounts = cards.map((card) => accountUtilisation(card, today)).sort((a, b) => b.percent - a.percent)
  const totalLimit = accounts.reduce((sum, account) => sum + account.limit, 0)
  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0)
  const percent = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0
  const nextStatement = accounts.length
    ? [...accounts].sort((a, b) => a.daysToStatement - b.daysToStatement)[0]
    : null
  return {
    accounts,
    totalLimit,
    totalBalance,
    percent,
    tone: utilisationTone(percent),
    toHealthy: paydownTo(totalBalance, totalLimit, UTILISATION_HEALTHY),
    toIdeal: paydownTo(totalBalance, totalLimit, UTILISATION_IDEAL),
    worst: accounts[0] && accounts[0].percent >= UTILISATION_HEALTHY ? accounts[0] : null,
    nextStatement,
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
  oldest: AccountAge | null
  newest: AccountAge | null
  newCount: number
  /** Cards with no opened date cannot be aged — the UI asks for it. */
  unknownCount: number
}

export function accountAges(state: Pick<AppState, 'cards' | 'loans'>, today = todayISO()): AgeSummary {
  const accounts: AccountAge[] = []
  let unknownCount = 0

  for (const card of state.cards) {
    if (!card.openedDate) {
      unknownCount += 1
      continue
    }
    const months = monthsSince(card.openedDate, today)
    accounts.push({ id: card.id, label: card.name, kind: 'revolving', openedDate: card.openedDate, months, isNew: months < NEW_ACCOUNT_MONTHS })
  }
  // Closed loans still count: a paid-off account stays on the report for years.
  for (const loan of state.loans) {
    const months = monthsSince(loan.startDate, today)
    accounts.push({ id: loan.id, label: loan.name, kind: 'instalment', openedDate: loan.startDate, months, isNew: months < NEW_ACCOUNT_MONTHS })
  }

  accounts.sort((a, b) => b.months - a.months)
  return {
    accounts,
    averageMonths: accounts.length ? accounts.reduce((sum, account) => sum + account.months, 0) / accounts.length : null,
    oldest: accounts[0] ?? null,
    newest: accounts[accounts.length - 1] ?? null,
    newCount: accounts.filter((account) => account.isNew).length,
    unknownCount,
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
  const nextToClear = weighing.length
    ? [...weighing].sort((a, b) => a.impactEnds.localeCompare(b.impactEnds))[0]
    : null
  return { all, weighing, nextToClear }
}

/* -------------------------------------------------------------------------- */
/* Payment history                                                            */
/* -------------------------------------------------------------------------- */

export interface PaymentHistory {
  overdueCards: { card: CreditCard; dueDate: string; daysLate: number }[]
  loansBehind: { loan: Loan; missed: number }[]
  /** Loan instalments recorded on or before their due date, across every loan. */
  onTimeLoanPayments: number
  cardsPaidThisCycle: number
  status: FactorStatus
}

export function paymentHistory(state: Pick<AppState, 'cards' | 'loans'>, today = todayISO()): PaymentHistory {
  const month = monthKey(today)

  const overdueCards: PaymentHistory['overdueCards'] = []
  for (const card of state.cards) {
    if (card.outstanding <= 0 || cardIsPaid(card, month)) continue
    // An unpaid bill whose date has passed stays pinned to this cycle — the
    // same rule the Cards page uses, so the two never disagree.
    const cycleDue = clampDayToMonth(month, card.billDueDay)
    if (cycleDue < today) overdueCards.push({ card, dueDate: cycleDue, daysLate: -daysUntil(cycleDue, today) })
  }

  const loansBehind: PaymentHistory['loansBehind'] = []
  let onTimeLoanPayments = 0
  for (const loan of state.loans) {
    const dueSoFar = amortisationSchedule(loan).filter((row) => row.dueDate <= today).length
    const missed = Math.max(0, dueSoFar - loan.paidMonths)
    if (loan.active && missed > 0) loansBehind.push({ loan, missed })
    onTimeLoanPayments += Math.min(loan.paidMonths, dueSoFar)
  }

  const tracked = state.cards.length + state.loans.length
  return {
    overdueCards,
    loansBehind,
    onTimeLoanPayments,
    cardsPaidThisCycle: state.cards.filter((card) => cardIsPaid(card, month)).length,
    status: overdueCards.length || loansBehind.length ? 'critical' : tracked === 0 ? 'unknown' : 'good',
  }
}

/* -------------------------------------------------------------------------- */
/* The five factors                                                           */
/* -------------------------------------------------------------------------- */

export type FactorKey = 'payments' | 'utilisation' | 'age' | 'mix' | 'newCredit'

export interface CreditFactor {
  key: FactorKey
  label: string
  /** Rough share of the score this factor drives, percent — the commonly published weights. */
  weight: number
  status: FactorStatus
  /** One line: the number that matters. */
  headline: string
  /** Why it is where it is, and what moves it. */
  detail: string
  href?: string
}

export function creditFactors(state: AppState, today = todayISO()): CreditFactor[] {
  const payments = paymentHistory(state, today)
  const utilisation = utilisationSummary(state.cards, today)
  const ages = accountAges(state, today)
  const inquiries = inquirySummary(state.inquiries, today)
  const revolving = state.cards.length
  const instalment = state.loans.filter((loan) => loan.active).length

  /* Payment history ------------------------------------------------------- */
  const paymentsFactor: CreditFactor = {
    key: 'payments',
    label: 'Payment history',
    weight: 35,
    status: payments.status,
    href: '#/cards',
    headline:
      payments.overdueCards.length || payments.loansBehind.length
        ? `${payments.overdueCards.length + payments.loansBehind.length} account${payments.overdueCards.length + payments.loansBehind.length === 1 ? '' : 's'} behind`
        : payments.status === 'unknown'
          ? 'Nothing tracked yet'
          : `Everything paid on time · ${payments.onTimeLoanPayments} loan payment${payments.onTimeLoanPayments === 1 ? '' : 's'} recorded`,
    detail:
      payments.status === 'critical'
        ? 'The single largest factor. A payment reported 30 or more days late stays on the file for six years and costs more than anything else here can earn back — bring every account current first.'
        : 'The single largest factor, and the one you control most directly. Every on-time month adds to the record; nothing else needs to happen.',
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
    href: '#/cards',
    headline:
      revolving === 0
        ? 'No revolving credit on file'
        : `${formatPercent(utilisation.percent, 0)} of ${formatCurrency(utilisation.totalLimit)} in use${utilisation.worst && utilisation.accounts.length > 1 ? ` · ${utilisation.worst.card.name} at ${formatPercent(utilisation.worst.percent, 0)}` : ''}`,
    detail:
      utilisationStatus === 'good'
        ? 'Under the 30% line the bureaus treat as healthy. The very top scores sit under 10%, so there is a little left to gain by trimming further before each statement date.'
        : utilisationStatus === 'unknown'
          ? 'Utilization is the share of your revolving limits you are using. With no card or line of credit on file there is nothing to measure — and nothing building history.'
          : `Bureaus record the balance on your statement date, not what you pay by the due date. Paying ${formatCurrency(utilisation.toHealthy)} before the next statement closes reports you under 30%; this is the fastest lever on the page.`,
  }

  /* Length of history ----------------------------------------------------- */
  const averageYears = ages.averageMonths == null ? null : ages.averageMonths / 12
  const ageStatus: FactorStatus =
    ages.accounts.length === 0
      ? 'unknown'
      : averageYears != null && averageYears < 2
        ? 'warning'
        : 'good'
  const ageFactor: CreditFactor = {
    key: 'age',
    label: 'Length of history',
    weight: 15,
    status: ageStatus,
    href: '#/cards',
    headline:
      ages.accounts.length === 0
        ? ages.unknownCount > 0
          ? 'Add opened dates to your cards to measure this'
          : 'No accounts on file'
        : `Average age ${formatTenure(ages.averageMonths ?? 0)} · oldest ${ages.oldest ? formatTenure(ages.oldest.months) : '—'}`,
    detail:
      ages.newCount > 0
        ? `${ages.newCount} account${ages.newCount === 1 ? ' is' : 's are'} under a year old, which pulls the average down. Only time fixes this — keep the old accounts open and let the new one age.${ages.unknownCount ? ` ${ages.unknownCount} card${ages.unknownCount === 1 ? ' has' : 's have'} no opened date yet.` : ''}`
        : 'Longer is better, and the average matters as much as the oldest. Closing an old card shortens both — leave dormant ones open with a small charge on them.',
  }

  /* Credit mix ------------------------------------------------------------ */
  const mixStatus: FactorStatus =
    revolving + instalment === 0 ? 'unknown' : revolving >= 1 && instalment >= 1 ? 'good' : 'warning'
  const mixFactor: CreditFactor = {
    key: 'mix',
    label: 'Credit mix',
    weight: 10,
    status: mixStatus,
    href: revolving === 0 ? '#/cards' : '#/loans',
    headline:
      revolving + instalment === 0
        ? 'Nothing on file'
        : `${revolving} revolving · ${instalment} instalment`,
    detail:
      mixStatus === 'good'
        ? 'Both kinds of credit are reporting — a card or line of credit alongside a loan. That is all this factor asks for; more accounts do not help it.'
        : revolving === 0
          ? 'Only instalment credit is reporting. One card or line of credit, used lightly and paid in full, completes the mix — but wait until any recent inquiry has aged.'
          : 'Only revolving credit is reporting. This is a small factor; never take a loan you do not need to satisfy it.',
  }

  /* New credit & inquiries ------------------------------------------------ */
  const weighing = inquiries.weighing.length
  const newCreditStatus: FactorStatus =
    weighing >= 3 || ages.newCount >= 2 ? 'critical' : weighing >= 1 || ages.newCount >= 1 ? 'warning' : 'good'
  const newCreditFactor: CreditFactor = {
    key: 'newCredit',
    label: 'New credit & inquiries',
    weight: 10,
    status: newCreditStatus,
    href: '#/',
    headline:
      weighing === 0 && ages.newCount === 0
        ? 'No recent applications or new accounts'
        : `${weighing} hard inquir${weighing === 1 ? 'y' : 'ies'} in the last 12 months · ${ages.newCount} new account${ages.newCount === 1 ? '' : 's'}`,
    detail:
      inquiries.nextToClear
        ? `Each hard pull weighs on the score for about a year. The most recent one stops counting on ${formatDate(inquiries.nextToClear.impactEnds)} — apply for nothing before then, including pre-approved offers that run a hard check.`
        : 'Nothing recent is dragging here. When you do apply for something, do it once, deliberately, rather than shopping several lenders in a row.',
  }

  return [paymentsFactor, utilisationFactor, ageFactor, mixFactor, newCreditFactor]
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
  href?: string
}

const IMPACT_RANK: Record<Impact, number> = { high: 0, medium: 1, low: 2 }
const TIMING_RANK: Record<Timing, number> = { now: 0, 'before-statement': 1, 'this-month': 2, ongoing: 3, avoid: 4 }

/** Whether any card spending has been recorded recently — dormancy check. */
function lastCardSpend(state: Pick<AppState, 'transactions'>): string | null {
  let latest: string | null = null
  for (const transaction of state.transactions) {
    if (transaction.method !== 'Credit Card') continue
    if (!latest || transaction.date > latest) latest = transaction.date
  }
  return latest
}

/**
 * The ordered to-do list. Every rule is guarded by the data that triggers it,
 * so an account in good shape gets one line, not a lecture.
 */
export function creditRecommendations(state: AppState, today = todayISO()): Recommendation[] {
  const out: Recommendation[] = []
  const payments = paymentHistory(state, today)
  const utilisation = utilisationSummary(state.cards, today)
  const ages = accountAges(state, today)
  const inquiries = inquirySummary(state.inquiries, today)
  const trend = scoreTrend(state.creditScores, today)

  /* 1 · Anything late comes first ---------------------------------------- */
  for (const { card, daysLate } of payments.overdueCards) {
    out.push({
      id: `overdue:${card.id}`,
      impact: 'high',
      timing: 'now',
      title: `Pay ${card.name} today — ${daysLate} day${daysLate === 1 ? '' : 's'} past due`,
      detail: `Payment history is the largest single factor. A payment reported 30 or more days late stays on your file for six years and outweighs everything else on this page. Pay at least the ${formatCurrency(card.minimumDue)} minimum now; the full ${formatCurrency(card.outstanding)} clears the utilization too.`,
      href: '#/cards',
    })
  }
  for (const { loan, missed } of payments.loansBehind) {
    out.push({
      id: `behind:${loan.id}`,
      impact: 'high',
      timing: 'now',
      title: `Catch up ${loan.name} — ${missed} payment${missed === 1 ? '' : 's'} behind`,
      detail: `Lenders report an instalment as missed once it is 30 days late. Bring the loan current before the next due date on ${formatDate(nextDueDate(loan.dueDay, today))}.`,
      href: '#/loans',
    })
  }

  /* 2 · Utilization, account by account ---------------------------------- */
  for (const account of utilisation.accounts) {
    const { card } = account
    if (account.percent >= UTILISATION_HEALTHY) {
      const soon = account.daysToStatement <= 7
      out.push({
        id: `util:${card.id}`,
        impact: 'high',
        timing: 'before-statement',
        title: `Pay ${formatCurrency(account.toHealthy)} on ${card.name} before the ${ordinal(card.statementDay)}`,
        detail: `Bureaus see the balance on your statement date, not what you pay by the due date. ${card.name} closes on ${formatDate(account.statementDate)}${soon ? ` — ${account.daysToStatement === 0 ? 'today' : `in ${account.daysToStatement} day${account.daysToStatement === 1 ? '' : 's'}`}` : ''}. Paying before then is what changes the number that gets reported.`,
        effect: `Reported utilization ${formatPercent(account.percent, 0)} → under 30%. Getting under 10% takes ${formatCurrency(account.toIdeal)}.`,
        href: '#/cards',
      })
    } else if (account.percent >= UTILISATION_IDEAL) {
      out.push({
        id: `trim:${card.id}`,
        impact: 'medium',
        timing: 'before-statement',
        title: `Trim ${card.name} under 10% for the last few points`,
        detail: `${formatPercent(account.percent, 0)} is already healthy. The highest scores report single-digit utilization, so paying ${formatCurrency(account.toIdeal)} before the ${ordinal(card.statementDay)} is a small, optional gain.`,
        href: '#/cards',
      })
    }
  }
  if (utilisation.accounts.length > 1 && utilisation.percent >= UTILISATION_HEALTHY) {
    out.push({
      id: 'util:total',
      impact: 'medium',
      timing: 'before-statement',
      title: `Bring total utilization under 30% — ${formatCurrency(utilisation.toHealthy)} across all cards`,
      detail: `Bureaus look at each card and at the total. Spreading a balance across cards does not hide it; the combined figure is ${formatPercent(utilisation.percent, 0)} of ${formatCurrency(utilisation.totalLimit)}.`,
      href: '#/cards',
    })
  }

  /* 3 · Interest is the cost of waiting ---------------------------------- */
  for (const account of utilisation.accounts) {
    const apr = account.card.apr ?? 0
    if (account.balance <= 0 || apr <= 0) continue
    const monthly = (account.balance * apr) / 100 / 12
    if (monthly < 10) continue
    out.push({
      id: `interest:${account.card.id}`,
      impact: 'medium',
      timing: 'this-month',
      title: `Carrying ${formatCurrency(account.balance)} at ${formatPercent(apr, 2)} costs about ${formatCurrency(monthly)} a month`,
      detail: 'That interest is money that could be clearing the balance instead. Paying in full every month costs nothing extra and is what brings utilization down for good. If you cannot clear it at once, pay twice a month: once before the statement date, once before the due date.',
      href: '#/cards',
    })
  }

  /* 4 · Thin file: raise the limit, don't add a card yet ------------------- */
  const revolving = state.cards.length
  if (revolving === 1) {
    const only = utilisation.accounts[0]
    const raised = Math.round(only.limit * 1.5)
    const afterPercent = raised > 0 ? (only.balance / raised) * 100 : 0
    out.push({
      id: 'thin:limit',
      impact: 'medium',
      timing: 'ongoing',
      title: `Ask ${only.card.issuer} for a credit-limit increase — not a new card`,
      detail: `With one revolving account, every dollar on it moves your utilization. Most issuers will review a limit increase in the app or by phone, often without a hard inquiry — ask whether it is a soft check before agreeing.${inquiries.weighing.length ? ' A second card would help the file too, but not while the recent inquiry is still counting.' : ' A second card, used lightly, is the other route once you are ready for one inquiry.'}`,
      effect: `From ${formatCurrency(only.limit)} to ${formatCurrency(raised)} would take today's balance from ${formatPercent(only.percent, 0)} to ${formatPercent(afterPercent, 0)}.`,
      href: '#/cards',
    })
  } else if (revolving === 0 && state.loans.length > 0) {
    out.push({
      id: 'thin:none',
      impact: 'medium',
      timing: inquiries.weighing.length ? 'avoid' : 'this-month',
      title: 'Add one revolving account when the timing is right',
      detail: `Scores need a card or line of credit reporting on-time payments, and you have none on file.${inquiries.weighing.length ? ` Wait until ${formatDate(inquiries.nextToClear?.impactEnds ?? today)} so the recent inquiry has aged, then` : ' With no recent inquiries,'} a low-limit card from your own bank is the usual first step — use it for one bill and pay it in full.`,
      href: '#/cards',
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
      detail: `Opening it added a hard inquiry, a brand-new account and a lower average age all at once; a 40–80 point drop is normal${since ? ` (yours: ${since.change > 0 ? '+' : ''}${since.change} since ${monthLabel(monthKey(since.before.date))})` : ''}. Those effects fade on their own: the inquiry stops counting at twelve months and the account stops reading as "new" around the same time. ${payments.onTimeLoanPayments > 0 ? `${payments.onTimeLoanPayments} on-time payment${payments.onTimeLoanPayments === 1 ? '' : 's'} so far ${payments.onTimeLoanPayments === 1 ? 'is' : 'are'} doing the repair` : 'On-time payments do the repair'} — what would set it back is opening or closing another account.`,
      effect: `Expect most of the recovery between month 12 and 18 — roughly ${monthLabel(addMonths(openedMonth, 12))} to ${monthLabel(addMonths(openedMonth, 18))}.`,
      href: newest.kind === 'instalment' ? '#/loans' : '#/cards',
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
      title: `Hold off on applications until ${formatDate(impactEnds)}`,
      detail: `${inquiry.lender} pulled your file on ${formatDate(inquiry.date)} for ${inquiry.purpose.toLowerCase()}${count > 1 ? `, one of ${count} hard inquiries still counting` : ''}. Hard inquiries weigh on the score for about a year and stay visible until ${formatDate(dropsOff)}. Each new one restarts that clock — including "pre-approved" offers that run a hard check.`,
      href: '#/',
    })
  }

  /* 7 · Dormant card ------------------------------------------------------ */
  if (revolving > 0) {
    const last = lastCardSpend(state)
    if (!last || monthsSince(last, today) >= DORMANT_MONTHS) {
      const target = utilisation.accounts[utilisation.accounts.length - 1]?.card
      if (target) {
        out.push({
          id: 'dormant',
          impact: 'low',
          timing: 'ongoing',
          title: `Keep ${target.name} active with a small recurring charge`,
          detail: `No card spending has been recorded in ${last ? `the last ${DORMANT_MONTHS} months` : 'the ledger'}. Issuers can lower a limit or close a dormant card — which raises utilization and shortens your history in one move. Put a single subscription on it and set autopay to pay in full.`,
          href: '#/cards',
        })
      }
    }
  }

  /* 8 · Log the score ----------------------------------------------------- */
  if (trend.daysSinceLatest == null || trend.daysSinceLatest > SCORE_STALE_DAYS) {
    out.push({
      id: 'score:log',
      impact: 'low',
      timing: 'now',
      title: trend.latest ? `Log a fresh score — your last reading is ${trend.daysSinceLatest} days old` : 'Log your first credit score',
      detail: 'Borrowell shows your Equifax score free, Credit Karma shows TransUnion, and the CIBC app shows Equifax as well. One reading a month is enough to see the trend — the advice above works off your accounts, not the number.',
      href: '#/',
    })
  }

  /* 9 · Protect the oldest account ---------------------------------------- */
  if (ages.oldest && ages.oldest.kind === 'revolving' && ages.oldest.months >= 24) {
    out.push({
      id: `anchor:${ages.oldest.id}`,
      impact: 'low',
      timing: 'ongoing',
      title: `Keep ${ages.oldest.label} open — it is your oldest account (${formatTenure(ages.oldest.months)})`,
      detail: 'Length of history is about 15% of the score and the one factor only time can improve. Closing your oldest card would shorten it and cut your total limit at the same time.',
      href: '#/cards',
    })
  }

  /* 10 · Nothing to fix ---------------------------------------------------- */
  if (!out.some((item) => item.impact !== 'low')) {
    out.unshift({
      id: 'all-clear',
      impact: 'low',
      timing: 'ongoing',
      title: 'Nothing to fix — keep paying in full and on time',
      detail: 'The score lags the behaviour by a statement cycle or two. Log a reading each month and watch it catch up.',
    })
  }

  return out.sort(
    (a, b) => IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact] || TIMING_RANK[a.timing] - TIMING_RANK[b.timing],
  )
}

/* -------------------------------------------------------------------------- */
/* Timeline                                                                   */
/* -------------------------------------------------------------------------- */

export type CreditEventKind = 'score' | 'inquiry' | 'account' | 'loan'

export interface CreditEvent {
  id: string
  date: string
  kind: CreditEventKind
  title: string
  detail: string
  score?: number
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
      score: entry.score,
      bureau: entry.bureau,
    })
  }
  for (const inquiry of state.inquiries) {
    events.push({
      id: inquiry.id,
      date: inquiry.date,
      kind: 'inquiry',
      title: `Hard inquiry — ${inquiry.lender}`,
      detail: inquiry.purpose,
    })
  }
  for (const card of state.cards) {
    if (!card.openedDate) continue
    events.push({
      id: `open:${card.id}`,
      date: card.openedDate,
      kind: 'account',
      title: `${card.name} opened`,
      detail: `${card.kind ?? 'Credit Card'} · ${formatCurrency(card.creditLimit)} limit`,
    })
  }
  for (const loan of state.loans) {
    events.push({
      id: `open:${loan.id}`,
      date: loan.startDate,
      kind: 'loan',
      title: `${loan.name} opened`,
      detail: `${loan.lender} · ${formatCurrency(loan.principal)} over ${formatTenure(loan.tenureMonths)}`,
    })
  }

  return events.sort((a, b) => b.date.localeCompare(a.date))
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

/** Credit-specific reminders — statement dates, stale readings, inquiries ageing out. */
export function creditNotifications(state: AppState, today = todayISO()): AppNotification[] {
  const out: AppNotification[] = []
  const lead = state.settings.reminderLeadDays || 5

  for (const account of utilisationSummary(state.cards, today).accounts) {
    if (account.percent < UTILISATION_HEALTHY || account.daysToStatement > lead) continue
    const when = account.daysToStatement === 0 ? 'today' : `in ${account.daysToStatement} day${account.daysToStatement === 1 ? '' : 's'}`
    out.push({
      id: `credit:statement:${account.card.id}:${account.statementDate}`,
      kind: 'credit',
      severity: account.percent >= 50 ? 'serious' : 'warning',
      title: `${account.card.name} statement closes ${when}`,
      detail: `Pay ${formatCurrency(account.toHealthy)} first to report under 30% instead of ${formatPercent(account.percent, 0)}`,
      date: account.statementDate,
      amount: account.toHealthy,
      href: '#/',
    })
  }

  const trend = scoreTrend(state.creditScores, today)
  if (trend.daysSinceLatest == null || trend.daysSinceLatest > SCORE_STALE_DAYS) {
    out.push({
      id: `credit:log:${monthKey(today)}`,
      kind: 'credit',
      severity: 'info',
      title: trend.latest ? 'Log this month’s credit score' : 'Log your first credit score',
      detail: trend.latest ? `Last reading ${trend.daysSinceLatest} days ago` : 'Borrowell, Credit Karma and the CIBC app are all free',
      href: '#/',
    })
  }

  for (const status of inquirySummary(state.inquiries, today).weighing) {
    const days = daysUntil(status.impactEnds, today)
    if (days < 0 || days > lead) continue
    out.push({
      id: `credit:inquiry:${status.inquiry.id}`,
      kind: 'credit',
      severity: 'info',
      title: `${status.inquiry.lender} inquiry stops counting ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}`,
      detail: 'After this it no longer weighs on your score, though it stays visible on the report',
      date: status.impactEnds,
      href: '#/',
    })
  }

  return out
}

const SEVERITY_RANK: Record<NotificationSeverity, number> = { critical: 0, serious: 1, warning: 2, info: 3 }

/** Money reminders plus credit reminders, dismissals removed, most urgent first. */
export function buildAllNotifications(state: AppState, today = todayISO()): AppNotification[] {
  const credit = creditNotifications(state, today).filter((n) => !state.dismissedAlerts.includes(n.id))
  return [...buildNotifications(state, today), ...credit].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (a.date ?? '').localeCompare(b.date ?? ''),
  )
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
  payments: PaymentHistory
  timeline: CreditEvent[]
}

export function creditOverview(state: AppState, today = todayISO()): CreditOverview {
  const trend = scoreTrend(state.creditScores, today)
  return {
    trend,
    band: trend.latest ? scoreBand(trend.latest.score) : null,
    nextBand: trend.latest ? pointsToNextBand(trend.latest.score) : null,
    utilisation: utilisationSummary(state.cards, today),
    factors: creditFactors(state, today),
    recommendations: creditRecommendations(state, today),
    inquiries: inquirySummary(state.inquiries, today),
    ages: accountAges(state, today),
    payments: paymentHistory(state, today),
    timeline: creditTimeline(state),
  }
}
