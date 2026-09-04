/**
 * The example workspace.
 *
 * Loaded only when you explicitly ask for it, never on first run — data that
 * pretends to be yours is worse than an empty screen. It exists so the app can
 * be understood before you have typed anything, and so every panel has
 * something to show in a screenshot.
 *
 * The persona is the situation this app was built for: a newcomer to Canada
 * four years in, one card running hot, and a car loan opened ten months ago
 * that knocked the score down and has not let it recover.
 */

import type { AppState, CreditInquiry, CreditScoreEntry } from '../types'
import { STATE_VERSION, defaultSettings } from './storage'
import { addMonths, clampDayToMonth, currentMonthKey, monthRange, todayISO } from './date'
import { uid } from './id'

/** How long ago the example car loan was opened — the event the history pivots on. */
const LOAN_MONTHS_AGO = 10

export function buildExampleState(): AppState {
  const today = todayISO()
  const thisMonth = currentMonthKey()
  const loanStart = addMonths(thisMonth, -LOAN_MONTHS_AGO)

  /* Score history: steady in the low 740s, a two-step drop once the loan and
     its inquiry reached the file, then flat in the high 660s. Bureau updates
     lag the event, so the first reading after the loan is still the old number. */
  const creditScores: CreditScoreEntry[] = []
  const months = monthRange(14, thisMonth)
  months.forEach((month, index) => {
    const monthsAgo = months.length - 1 - index
    const score =
      monthsAgo >= LOAN_MONTHS_AGO
        ? 741
        : monthsAgo === LOAN_MONTHS_AGO - 1
          ? 712
          : monthsAgo === LOAN_MONTHS_AGO - 2
            ? 678
            : 668 + ((monthsAgo * 7) % 9)
    const date = clampDayToMonth(month, 6)
    if (date <= today) {
      creditScores.push({ id: uid('score'), date, score, bureau: 'Equifax', source: 'Borrowell' })
    }
  })

  const inquiries: CreditInquiry[] = [
    { id: uid('inq'), date: `${loanStart}-12`, lender: 'CIBC', purpose: 'Auto loan application' },
  ]

  return {
    version: STATE_VERSION,
    settings: {
      ...defaultSettings(),
      // Four years in Canada — a young file, which is its own score factor.
      creditHistoryStart: `${addMonths(thisMonth, -48)}-01`,
    },
    accounts: [
      {
        id: uid('acct'),
        name: 'CIBC Dividend Visa',
        kind: 'Credit Card',
        limit: 8000,
        balance: 4880,
        statementDay: 25,
        apr: 20.99,
        openedDate: `${addMonths(thisMonth, -46)}-10`,
      },
    ],
    debts: [
      {
        id: uid('debt'),
        name: 'Car loan',
        kind: 'Auto Loan',
        monthlyPayment: 484,
        startDate: `${loanStart}-15`,
      },
    ],
    creditScores,
    inquiries,
    dismissedAlerts: [],
  }
}
