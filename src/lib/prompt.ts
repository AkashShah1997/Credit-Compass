/**
 * "Ask an AI" — turns the workspace into a plain-text briefing you can paste
 * into any assistant for a second opinion.
 *
 * Anonymous by construction: no name, no card numbers, no transaction lines.
 * Just the facts a credit-scoring question needs, in Markdown that every chat
 * assistant renders cleanly. Pure: state in, string out.
 */

import type { AppState, CreditBureau } from '../types'
import { CREDIT_BUREAUS } from '../types'
import { creditOverview, scoreBand, signedPoints, sortedScores, type Impact, type Timing } from './credit'
import {
  cardIsPaid,
  emergencyFund,
  isLiquidAsset,
  monthlySeries,
  salaryDayPlan,
  summariseLoan,
} from './finance'
import { formatDate, monthKey, monthLabel, monthRange, monthsSince, todayISO } from './date'
import { formatCurrency, formatPercent, formatTenure, ordinal } from './format'

export interface PromptOptions {
  /** Income, liquid savings, surplus and commitments — what is actually affordable. */
  includeCashFlow: boolean
  /** The app's own recommendation list, so the assistant can agree, disagree or add. */
  includeAppSuggestions: boolean
  /** Every reading rather than just the latest per bureau. */
  includeScoreHistory: boolean
}

export const DEFAULT_PROMPT_OPTIONS: PromptOptions = {
  includeCashFlow: true,
  includeAppSuggestions: true,
  includeScoreHistory: true,
}

const IMPACT_WORD: Record<Impact, string> = { high: 'High impact', medium: 'Medium impact', low: 'Small gain' }
const TIMING_WORD: Record<Timing, string> = {
  now: 'do today',
  'before-statement': 'before the statement date',
  'this-month': 'this month',
  ongoing: 'ongoing',
  avoid: 'avoid for now',
}

const bullet = (text: string) => `- ${text}`
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function buildCreditPrompt(
  state: AppState,
  options: PromptOptions = DEFAULT_PROMPT_OPTIONS,
  today = todayISO(),
): string {
  const overview = creditOverview(state, today)
  const { trend, utilisation, inquiries, ages, payments, recommendations } = overview
  const goal = state.settings.creditScoreGoal
  const out: string[] = []

  /* Intro ----------------------------------------------------------------- */
  out.push(
    `I am a Canadian consumer working on my credit score. Below is my complete credit picture as of ${formatDate(today)}, exported from a personal tracking app. All amounts are Canadian dollars. Please answer as someone who knows how Equifax Canada and TransUnion Canada weigh a file.`,
    '',
  )

  /* Scores ---------------------------------------------------------------- */
  out.push('## Credit score', bullet(`Goal: ${goal} (Equifax's "Excellent" band starts at 760)`))
  if (!trend.latest) {
    out.push(bullet('I have not logged a score reading yet.'))
  } else {
    for (const bureau of CREDIT_BUREAUS) {
      const reading = trend.byBureau[bureau]
      if (!reading) continue
      out.push(
        bullet(
          `Latest ${bureau} reading: ${reading.score} on ${formatDate(reading.date)}${reading.source ? ` (${reading.source})` : ''} — "${scoreBand(reading.score).label}" band`,
        ),
      )
    }
    if (trend.peak && trend.peak !== trend.latest) {
      out.push(
        bullet(
          `Highest ${trend.latest.bureau} reading on file: ${trend.peak.score} on ${formatDate(trend.peak.date)} (${signedPoints(trend.changeSincePeak ?? 0)} since)`,
        ),
      )
    }
    if (trend.changeSincePrevious != null && trend.previous) {
      out.push(bullet(`Change since the previous ${trend.latest.bureau} reading (${formatDate(trend.previous.date)}): ${signedPoints(trend.changeSincePrevious)}`))
    }
  }

  if (options.includeScoreHistory && state.creditScores.length > 1) {
    out.push('', '### Reading history (oldest first)')
    for (const bureau of CREDIT_BUREAUS) {
      const readings = sortedScores(state.creditScores).filter((entry) => entry.bureau === bureau)
      if (!readings.length) continue
      out.push(`${bureau}: ${readings.map((entry) => `${entry.score} (${formatDate(entry.date)})`).join(', ')}`)
    }
  }
  out.push('')

  /* Revolving ------------------------------------------------------------- */
  out.push('## Revolving credit (cards and lines of credit)')
  if (utilisation.accounts.length === 0) {
    out.push(bullet('None — I have no credit card or line of credit reporting.'))
  } else {
    for (const account of utilisation.accounts) {
      const { card } = account
      const opened = card.openedDate
        ? `opened ${monthLabel(monthKey(card.openedDate))} (${formatTenure(monthsSince(card.openedDate, today))} ago)`
        : 'opening date not recorded'
      const soon = account.daysToStatement === 0 ? 'today' : `in ${plural(account.daysToStatement, 'day')}`
      out.push(
        bullet(
          `${card.name} — ${card.kind ?? 'Credit Card'} from ${card.issuer}. Limit ${formatCurrency(card.creditLimit)}; statement balance ${formatCurrency(card.outstanding)} (${formatPercent(account.percent, 0)} utilization); statement closes on the ${ordinal(card.statementDay)} (next: ${formatDate(account.statementDate)}, ${soon}); payment due on the ${ordinal(card.billDueDay)}${card.apr != null ? `; APR ${formatPercent(card.apr, 2)}` : ''}; ${opened}; this cycle's bill ${cardIsPaid(card, monthKey(today)) ? 'already paid' : 'not yet paid'}.`,
        ),
      )
    }
    out.push(
      bullet(
        `Overall: ${formatCurrency(utilisation.totalBalance)} of ${formatCurrency(utilisation.totalLimit)} in use (${formatPercent(utilisation.percent, 0)}).${
          utilisation.toHealthy > 0
            ? ` Reporting under 30% would take a payment of ${formatCurrency(utilisation.toHealthy)} before the statement date; under 10% would take ${formatCurrency(utilisation.toIdeal)}.`
            : utilisation.toIdeal > 0
              ? ` Already under 30%; ${formatCurrency(utilisation.toIdeal)} more would report under 10%.`
              : ' Already under 10%.'
        }`,
      ),
    )
  }
  out.push('')

  /* Loans ----------------------------------------------------------------- */
  out.push('## Instalment loans')
  if (state.loans.length === 0) {
    out.push(bullet('None.'))
  } else {
    for (const loan of state.loans) {
      const summary = summariseLoan(loan)
      const closed = loan.paidMonths >= loan.tenureMonths
      out.push(
        bullet(
          `${loan.name} — ${loan.type} from ${loan.lender}. Borrowed ${formatCurrency(loan.principal)} at ${formatPercent(loan.interestRate, 2)} over ${plural(loan.tenureMonths, 'month')}; ${formatCurrency(loan.paymentAmount)}/month; ${loan.paidMonths} of ${loan.tenureMonths} payments made; about ${formatCurrency(summary.outstanding)} outstanding; opened ${formatDate(loan.startDate)} (${formatTenure(monthsSince(loan.startDate, today))} ago); status: ${closed ? 'paid off' : loan.active ? 'active' : 'inactive'}.`,
        ),
      )
    }
  }
  out.push('')

  /* Inquiries ------------------------------------------------------------- */
  out.push('## Hard inquiries')
  if (inquiries.all.length === 0) {
    out.push(bullet('None recorded in the last three years.'))
  } else {
    for (const status of inquiries.all) {
      const { inquiry } = status
      const window = status.weighing
        ? `still weighing on the score until ${formatDate(status.impactEnds)}; visible until ${formatDate(status.dropsOff)}`
        : status.onReport
          ? `no longer weighing on the score; visible until ${formatDate(status.dropsOff)}`
          : 'off the report'
      out.push(
        bullet(
          `${formatDate(inquiry.date)} — ${inquiry.lender}, ${inquiry.purpose.toLowerCase()}${inquiry.bureau ? ` (${inquiry.bureau})` : ''}. ${window[0].toUpperCase()}${window.slice(1)}.`,
        ),
      )
    }
  }
  out.push('')

  /* Payment history & age ------------------------------------------------- */
  out.push('## Payment history, account age and mix')
  if (payments.overdueCards.length === 0 && payments.loansBehind.length === 0) {
    out.push(bullet('No late or missed payments recorded on any account in the app.'))
  } else {
    for (const { card, daysLate } of payments.overdueCards) {
      out.push(bullet(`${card.name}: this cycle's bill is ${plural(daysLate, 'day')} past its due date and unpaid.`))
    }
    for (const { loan, missed } of payments.loansBehind) {
      out.push(bullet(`${loan.name}: ${plural(missed, 'scheduled payment')} not recorded.`))
    }
  }
  if (payments.onTimeLoanPayments > 0) out.push(bullet(`${plural(payments.onTimeLoanPayments, 'loan payment')} recorded on time.`))
  if (ages.accounts.length) {
    out.push(
      bullet(
        `Average account age ${formatTenure(ages.averageMonths ?? 0)}; oldest account ${ages.oldest?.label} (${formatTenure(ages.oldest?.months ?? 0)})${
          ages.newCount ? `; ${plural(ages.newCount, 'account')} under a year old` : ''
        }${ages.unknownCount ? `; ${plural(ages.unknownCount, 'card')} without a recorded opening date` : ''}.`,
      ),
    )
  }
  out.push(
    bullet(`Credit mix: ${plural(state.cards.length, 'revolving account')}, ${plural(state.loans.filter((l) => l.active).length, 'active instalment loan')}.`),
    '',
  )

  /* Cash flow ------------------------------------------------------------- */
  if (options.includeCashFlow) {
    const liquid = state.assets.filter(isLiquidAsset).reduce((sum, asset) => sum + asset.value, 0)
    const recent = monthlySeries(state.transactions, monthRange(6, monthKey(today)))
    const withData = recent.filter((row) => row.income > 0 || row.expense > 0)
    const surplus = withData.length ? withData.reduce((sum, row) => sum + row.net, 0) / withData.length : null
    const ef = emergencyFund(state.goals)
    const plan = salaryDayPlan(state)
    const commitments = plan.commitments.filter((c) => c.kind !== 'Card')

    out.push('## Cash-flow context (what I can afford)')
    out.push(bullet(`Monthly take-home pay: ${formatCurrency(state.settings.monthlySalary)}`))
    out.push(bullet(`Liquid savings (chequing, savings, cash): ${formatCurrency(liquid)}`))
    if (surplus != null) {
      out.push(bullet(`Average monthly surplus over the last ${plural(withData.length, 'month')} with activity: ${surplus >= 0 ? '+' : '−'}${formatCurrency(Math.abs(surplus))}`))
    }
    if (ef) out.push(bullet(`Emergency fund: ${formatCurrency(ef.saved)} saved of a ${formatCurrency(ef.target)} target`))
    if (commitments.length) {
      out.push(bullet(`Fixed monthly commitments: ${commitments.map((c) => `${c.label} ${formatCurrency(c.amount)}`).join('; ')}`))
    }
    if (plan.plannedSavings > 0) out.push(bullet(`Planned savings-goal contributions: ${formatCurrency(plan.plannedSavings)}/month`))
    out.push('')
  }

  /* App suggestions ------------------------------------------------------- */
  if (options.includeAppSuggestions && recommendations.length) {
    out.push('## What my tracking app currently suggests')
    recommendations.forEach((rec, index) => {
      out.push(`${index + 1}. [${IMPACT_WORD[rec.impact]} · ${TIMING_WORD[rec.timing]}] ${rec.title}${rec.effect ? ` — ${rec.effect}` : ''}`)
    })
    out.push('')
  }

  /* The ask --------------------------------------------------------------- */
  out.push('## What I would like from you')
  out.push(
    '1. Rank the actions that would raise my score the most over the next 3, 6 and 12 months. For each one, give the expected effect, when it would show up on the report, and what it costs me.',
    '2. Explain what most likely caused the drop from my peak and how long recovery normally takes for a file like this.',
    '3. Tell me what not to do — applications, closures, balance moves — and why.',
  )
  if (options.includeAppSuggestions && recommendations.length) {
    out.push("4. Where the app's suggestions above are wrong, incomplete or badly ordered, say so.")
  }
  out.push(
    '',
    'Be specific to these numbers rather than generic, and say where you are uncertain. This is for my own information; I understand it is not professional financial advice.',
  )

  return out.join('\n')
}

/** Rough size check for the copy button — most assistants take far more than this. */
export function promptStats(text: string): { characters: number; words: number } {
  return { characters: text.length, words: text.split(/\s+/).filter(Boolean).length }
}

/** Which bureau a source usually reports, so the modal can pre-select sensibly. */
export function bureauForSource(source: string): CreditBureau | null {
  if (/borrowell|cibc|equifax/i.test(source)) return 'Equifax'
  if (/credit karma|transunion|mogo/i.test(source)) return 'TransUnion'
  return null
}
