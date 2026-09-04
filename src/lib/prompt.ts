/**
 * "Ask an AI" — turns the workspace into a plain-text briefing you can paste
 * into any assistant for a second opinion.
 *
 * Anonymous by construction: no name, no account numbers. Just the facts a
 * credit-scoring question needs, in Markdown that every chat assistant renders
 * cleanly. Pure: state in, string out.
 */

import type { AppState } from '../types'
import { CREDIT_BUREAUS } from '../types'
import {
  UTILISATION_HEALTHY,
  accountAges,
  creditRecommendations,
  inquirySummary,
  scoreBand,
  scoreTrend,
  signedPoints,
  sortedScores,
  utilisationSummary,
  type Impact,
  type Timing,
} from './credit'
import { formatDate, monthKey, monthLabel, monthsSince, todayISO } from './date'
import { formatCurrency, formatPercent, formatTenure, ordinal } from './format'

export interface PromptOptions {
  /** The app's own recommendation list, so the assistant can agree, disagree or add. */
  includeAppSuggestions: boolean
  /** Every reading rather than just the latest per bureau. */
  includeScoreHistory: boolean
}

export const DEFAULT_PROMPT_OPTIONS: PromptOptions = {
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
  const trend = scoreTrend(state.creditScores, today)
  const utilisation = utilisationSummary(state.accounts, today)
  const ages = accountAges(state, today)
  const inquiries = inquirySummary(state.inquiries, today)
  const out: string[] = []

  out.push(
    `I am in Canada and working on my credit score. Below is my full credit picture as of ${formatDate(today)}, exported from a tracking app I use. All amounts are Canadian dollars. Please answer as someone who knows how Equifax Canada and TransUnion Canada weigh a file.`,
    '',
  )

  /* Scores ---------------------------------------------------------------- */
  out.push('## Credit score', bullet(`My goal: ${state.settings.scoreGoal}`))
  if (!trend.latest) {
    out.push(bullet('I have not logged a score reading yet.'))
  } else {
    for (const bureau of CREDIT_BUREAUS) {
      const reading = trend.byBureau[bureau]
      if (!reading) continue
      out.push(
        bullet(
          `Latest ${bureau}: ${reading.score} on ${formatDate(reading.date)}${reading.source ? ` (${reading.source})` : ''} — "${scoreBand(reading.score).label}" band`,
        ),
      )
    }
    if (trend.peak && trend.peak !== trend.latest && trend.changeSincePeak != null) {
      out.push(
        bullet(
          `Highest ${trend.latest.bureau} reading on file: ${trend.peak.score} on ${formatDate(trend.peak.date)} — ${signedPoints(trend.changeSincePeak)} since then`,
        ),
      )
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

  /* History length -------------------------------------------------------- */
  out.push('## How long I have had credit')
  if (ages.oldestMonths != null) {
    out.push(
      bullet(
        `About ${formatTenure(ages.oldestMonths)} of credit history in Canada${ages.thinFile ? ' — still a relatively young file' : ''}.`,
      ),
    )
  } else {
    out.push(bullet('I have not recorded when my credit history started.'))
  }
  if (ages.averageMonths != null) {
    out.push(bullet(`Average age across my open accounts: ${formatTenure(ages.averageMonths)}.`))
  }
  if (ages.newCount) out.push(bullet(`${plural(ages.newCount, 'account')} opened in the last 12 months.`))
  out.push('')

  /* Revolving ------------------------------------------------------------- */
  out.push('## Cards and lines of credit')
  if (utilisation.accounts.length === 0) {
    out.push(bullet('None — I have no credit card or line of credit reporting.'))
  } else {
    for (const row of utilisation.accounts) {
      const { account } = row
      const opened = account.openedDate
        ? `opened ${monthLabel(monthKey(account.openedDate))} (${formatTenure(monthsSince(account.openedDate, today))} ago)`
        : 'opening date not recorded'
      out.push(
        bullet(
          `${account.name} — ${account.kind}. Limit ${formatCurrency(account.limit)}; balance ${formatCurrency(account.balance)} (${formatPercent(row.percent, 0)} utilization); statement closes on the ${ordinal(account.statementDay)} (next ${formatDate(row.statementDate)}, in ${plural(row.daysToStatement, 'day')})${account.apr != null ? `; APR ${formatPercent(account.apr, 2)}` : ''}; ${opened}.`,
        ),
      )
    }
    out.push(
      bullet(
        `Overall: ${formatCurrency(utilisation.totalBalance)} of ${formatCurrency(utilisation.totalLimit)} (${formatPercent(utilisation.percent, 0)}).${
          utilisation.toHealthy > 0
            ? ` Getting under ${UTILISATION_HEALTHY}% before the statement date would take ${formatCurrency(utilisation.toHealthy)}; under 10% would take ${formatCurrency(utilisation.toIdeal)}.`
            : utilisation.toIdeal > 0
              ? ` Already under ${UTILISATION_HEALTHY}%; ${formatCurrency(utilisation.toIdeal)} more would report under 10%.`
              : ' Already under 10%.'
        }`,
      ),
    )
  }
  out.push('')

  /* Loans ----------------------------------------------------------------- */
  out.push('## Loans')
  if (state.debts.length === 0) {
    out.push(bullet('None.'))
  } else {
    for (const debt of state.debts) {
      out.push(
        bullet(
          `${debt.name} — ${debt.kind}, ${formatCurrency(debt.monthlyPayment)}/month, started ${formatDate(debt.startDate)} (${formatTenure(monthsSince(debt.startDate, today))} ago).`,
        ),
      )
    }
  }
  out.push('')

  /* Inquiries ------------------------------------------------------------- */
  out.push('## Hard inquiries')
  if (inquiries.all.length === 0) {
    out.push(bullet('None recorded.'))
  } else {
    for (const status of inquiries.all) {
      out.push(
        bullet(
          `${formatDate(status.inquiry.date)} — ${status.inquiry.lender}${status.inquiry.purpose ? `, ${status.inquiry.purpose.toLowerCase()}` : ''}. ${
            status.weighing
              ? `Still counting against the score until ${formatDate(status.impactEnds)}; visible until ${formatDate(status.dropsOff)}.`
              : status.onReport
                ? `No longer counting; visible until ${formatDate(status.dropsOff)}.`
                : 'Off the report.'
          }`,
        ),
      )
    }
  }
  out.push('')

  /* Payment history ------------------------------------------------------- */
  out.push('## Payment history')
  out.push(
    bullet(
      state.settings.missedPaymentLast2Years
        ? 'I have had at least one missed or late payment in the last 2 years.'
        : 'No missed or late payments in the last 2 years.',
    ),
  )
  out.push(
    bullet(`Credit mix: ${plural(state.accounts.length, 'revolving account')}, ${plural(state.debts.length, 'instalment loan')}.`),
    '',
  )

  /* App suggestions ------------------------------------------------------- */
  const recommendations = creditRecommendations(state, today)
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
    '1. Rank what would raise my score the most over the next 3, 6 and 12 months. For each, give the expected effect, when it would show up, and what it costs me.',
    '2. Explain what most likely caused the drop from my peak, and how long recovery normally takes for a file like this.',
    '3. Tell me what NOT to do — applications, closures, balance transfers — and why.',
  )
  if (options.includeAppSuggestions && recommendations.length) {
    out.push("4. Where the app's suggestions above are wrong, incomplete or badly ordered, say so.")
  }
  out.push(
    '',
    'Be specific to these numbers rather than generic, and say where you are uncertain. I understand this is general information and not professional financial advice.',
  )

  return out.join('\n')
}

/** Rough size check for the copy button — most assistants take far more than this. */
export function promptStats(text: string): { characters: number; words: number } {
  return { characters: text.length, words: text.split(/\s+/).filter(Boolean).length }
}
