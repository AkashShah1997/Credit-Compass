/**
 * Demo workspace.
 *
 * Built fresh on first run so the app opens with something to look at rather
 * than a wall of empty states. The persona is deliberately the situation this
 * app exists for: a Canadian with CIBC and Wealthsimple accounts, one credit
 * card running hot, and an auto loan opened ten months ago that knocked the
 * credit score down and has not let it recover — so every recommendation on the
 * Credit Health page lights up the moment the demo loads.
 *
 * Randomness is seeded, so the same demo appears every time — reproducible
 * screenshots, and no chart that reshuffles itself between reloads.
 */

import type {
  AppState,
  Asset,
  BudgetsByMonth,
  CreditCard,
  GoalContribution,
  Investment,
  InvestmentSnapshot,
  Liability,
  Loan,
  PaymentMethod,
  SavingsGoal,
  Transaction,
} from '../types'
import { DEFAULT_BUDGET_KEY } from '../types'
import { calculateLoanPayment, defaultSettings } from './finance'
import { addMonths, clampDayToMonth, currentMonthKey, monthKey, monthRange, todayISO } from './date'
import { uid } from './id'

/** Deterministic PRNG so the demo data is identical on every build. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const HISTORY_MONTHS = 13

/** How long ago the auto loan was opened — the event the demo score history pivots on. */
export const DEMO_AUTO_LOAN_MONTHS_AGO = 10

export function buildSeedState(): AppState {
  const rand = mulberry32(20260903)
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]
  const between = (min: number, max: number) => Math.round(min + rand() * (max - min))
  const today = todayISO()
  const thisMonth = currentMonthKey()
  const months = monthRange(HISTORY_MONTHS, thisMonth)

  /* ---------------------------------------------------------------------- */
  /* Loans                                                                   */
  /* ---------------------------------------------------------------------- */

  const autoStart = addMonths(thisMonth, -DEMO_AUTO_LOAN_MONTHS_AGO)

  const loans: Loan[] = [
    {
      id: 'loan_auto',
      name: 'Auto Loan',
      lender: 'CIBC',
      type: 'Auto Loan',
      principal: 28000,
      interestRate: 7.49,
      paymentAmount: calculateLoanPayment(28000, 7.49, 72),
      tenureMonths: 72,
      paidMonths: DEMO_AUTO_LOAN_MONTHS_AGO,
      startDate: `${autoStart}-15`,
      dueDay: 15,
      active: true,
    },
  ]

  /* ---------------------------------------------------------------------- */
  /* Investments                                                             */
  /* ---------------------------------------------------------------------- */

  const investmentSpecs: {
    id: string
    name: string
    type: Investment['type']
    monthly?: number
    day?: number
    lumpSum?: number
    startMonthsAgo: number
    growth: number
  }[] = [
    { id: 'inv_tfsa', name: 'Wealthsimple TFSA', type: 'TFSA', monthly: 300, day: 2, startMonthsAgo: 30, growth: 1.14 },
    { id: 'inv_rrsp', name: 'Wealthsimple RRSP', type: 'RRSP', monthly: 200, day: 2, startMonthsAgo: 24, growth: 1.11 },
    { id: 'inv_gic', name: 'CIBC 1-Year GIC', type: 'GIC', lumpSum: 5000, startMonthsAgo: 8, growth: 1.03 },
  ]

  const investments: Investment[] = investmentSpecs.map((spec) => {
    const startMonth = addMonths(thisMonth, -spec.startMonthsAgo)
    const investedAt = (month: string) => {
      if (spec.lumpSum) return month >= startMonth ? spec.lumpSum : 0
      const elapsed = monthsBetween(startMonth, month) + 1
      return elapsed > 0 ? (spec.monthly ?? 0) * elapsed : 0
    }

    const invested = investedAt(thisMonth)
    const currentValue = Math.round(invested * spec.growth)

    // Walk the growth factor from ~1 at inception to today's factor, with a
    // little seeded wobble so the line reads like a market, not a ruler.
    const history: InvestmentSnapshot[] = months.map((month, i) => {
      const inv = investedAt(month)
      if (inv === 0) return { month, invested: 0, value: 0 }
      const t = months.length > 1 ? i / (months.length - 1) : 1
      const startFactor = 1 + (spec.growth - 1) * Math.max(0, 1 - spec.startMonthsAgo / 12) * 0.4
      const base = startFactor + (spec.growth - startFactor) * t
      const wobble = i === months.length - 1 ? 0 : (rand() - 0.5) * 0.045
      return { month, invested: Math.round(inv), value: Math.round(inv * (base + wobble)) }
    })

    return {
      id: spec.id,
      name: spec.name,
      type: spec.type,
      invested,
      currentValue,
      monthlyAmount: spec.monthly,
      contributionDay: spec.day,
      startDate: `${startMonth}-${String(spec.day ?? 15).padStart(2, '0')}`,
      active: true,
      history,
    }
  })

  /* ---------------------------------------------------------------------- */
  /* Transactions                                                            */
  /* ---------------------------------------------------------------------- */

  const transactions: Transaction[] = []
  let sequence = 0

  const add = (
    type: Transaction['type'],
    amount: number,
    category: Transaction['category'],
    date: string,
    note: string,
    method: PaymentMethod,
    link?: { linkedType: Transaction['linkedType']; linkedId: string },
  ) => {
    if (date > today) return // never seed the future
    transactions.push({
      id: uid('txn'),
      type,
      amount,
      category,
      date,
      note,
      method,
      createdAt: new Date(`${date}T09:${String(sequence++ % 60).padStart(2, '0')}:00`).toISOString(),
      ...link,
    })
  }

  const FOOD_NOTES = ['No Frills groceries', 'Loblaws', 'Costco run', 'Tim Hortons', 'Uber Eats', 'Skip the Dishes', 'Dinner out', 'Farm Boy', 'Starbucks', 'Lunch near work']
  const TRANSPORT_NOTES = ['Petro-Canada fuel', 'Shell fuel', 'PRESTO top-up', 'Parking downtown', 'Uber ride', 'Car wash']
  const SHOPPING_NOTES = ['Amazon.ca order', 'Canadian Tire', 'Winners', 'Best Buy', 'Uniqlo', 'IKEA']
  const ENTERTAINMENT_NOTES = ['Netflix', 'Spotify Premium', 'Cineplex tickets', 'Steam game', 'Crave', 'Concert tickets']
  const OTHER_NOTES = ['Shoppers Drug Mart', 'Haircut', 'Gift', 'Dentist copay', 'Dry cleaning']
  // Weighted towards the card on purpose — that is how the balance got to 61%.
  const METHODS: PaymentMethod[] = ['Debit', 'Credit Card', 'Credit Card', 'Interac e-Transfer', 'Cash']

  for (const month of months) {
    // Pay
    add('income', 5200, 'Salary', clampDayToMonth(month, 1), 'Paycheque', 'Bank Transfer')

    // Occasional extra income
    const m = Number(month.slice(5))
    if (m === 4) add('income', 1150, 'Refund', clampDayToMonth(month, 22), 'CRA tax refund', 'Bank Transfer')
    if (m === 12) add('income', 2000, 'Bonus', clampDayToMonth(month, 20), 'Year-end bonus', 'Bank Transfer')
    if ([1, 4, 7, 10].includes(m)) add('income', 122, 'Government Benefit', clampDayToMonth(month, 5), 'GST/HST credit', 'Bank Transfer')
    if (m % 3 === 0) add('income', between(6, 24), 'Interest', clampDayToMonth(month, 28), 'Savings interest', 'Bank Transfer')

    // Rent
    add('expense', 1850, 'Rent', clampDayToMonth(month, 1), 'Rent', 'Pre-authorized Debit')

    // Loan payments
    for (const loan of loans) {
      const loanStart = monthKey(loan.startDate)
      const paidThrough = addMonths(loanStart, loan.paidMonths - 1)
      if (month >= loanStart && month <= paidThrough) {
        add('expense', loan.paymentAmount, 'Loan Payment', clampDayToMonth(month, loan.dueDay), `${loan.name} payment`, 'Pre-authorized Debit', {
          linkedType: 'loan',
          linkedId: loan.id,
        })
      }
    }

    // Recurring contributions
    for (const inv of investments) {
      if (!inv.monthlyAmount) continue
      if (month >= monthKey(inv.startDate)) {
        add('expense', inv.monthlyAmount, 'Investments', clampDayToMonth(month, inv.contributionDay ?? 1), `${inv.name} contribution`, 'Pre-authorized Debit', {
          linkedType: 'investment',
          linkedId: inv.id,
        })
      }
    }

    // GIC purchase, once
    const gicMonth = monthKey(investments.find((i) => i.id === 'inv_gic')!.startDate)
    if (month === gicMonth) {
      add('expense', 5000, 'Investments', clampDayToMonth(month, 15), 'CIBC GIC purchase', 'Bank Transfer', {
        linkedType: 'investment',
        linkedId: 'inv_gic',
      })
    }

    // Fixed bills
    add('expense', 75, 'Bills & Utilities', clampDayToMonth(month, 8), 'Rogers mobile', 'Pre-authorized Debit')
    add('expense', 70, 'Bills & Utilities', clampDayToMonth(month, 20), 'Bell internet', 'Pre-authorized Debit')
    add('expense', between(55, 115), 'Bills & Utilities', clampDayToMonth(month, 22), 'Toronto Hydro', 'Pre-authorized Debit')
    add('expense', 165, 'Bills & Utilities', clampDayToMonth(month, 12), 'Intact car insurance', 'Pre-authorized Debit')

    // Variable spend
    for (let i = 0; i < between(8, 12); i++) {
      add('expense', between(12, 140), 'Food & Dining', clampDayToMonth(month, between(1, 28)), pick(FOOD_NOTES), pick(METHODS))
    }
    for (let i = 0; i < between(3, 5); i++) {
      add('expense', between(35, 95), 'Transport', clampDayToMonth(month, between(1, 28)), pick(TRANSPORT_NOTES), pick(METHODS))
    }
    for (let i = 0; i < between(1, 3); i++) {
      add('expense', between(30, 220), 'Shopping', clampDayToMonth(month, between(1, 28)), pick(SHOPPING_NOTES), 'Credit Card')
    }
    for (let i = 0; i < between(1, 3); i++) {
      add('expense', between(12, 80), 'Entertainment', clampDayToMonth(month, between(1, 28)), pick(ENTERTAINMENT_NOTES), pick(METHODS))
    }
    for (let i = 0; i < between(0, 2); i++) {
      add('expense', between(20, 150), 'Other', clampDayToMonth(month, between(2, 26)), pick(OTHER_NOTES), pick(METHODS))
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Savings goals                                                           */
  /* ---------------------------------------------------------------------- */

  const goals: SavingsGoal[] = [
    makeGoal('goal_emergency', 'Emergency Fund', 15000, 4200, 'shield', 300, addMonths(thisMonth, 36), true),
    makeGoal('goal_vacation', 'Vancouver trip', 3000, 900, 'plane', 150, addMonths(thisMonth, 10)),
    makeGoal('goal_laptop', 'New laptop', 2500, 1100, 'laptop', 100, addMonths(thisMonth, 12)),
  ]

  function makeGoal(
    id: string,
    name: string,
    target: number,
    saved: number,
    icon: SavingsGoal['icon'],
    monthly: number,
    deadlineMonth: string,
    isEmergencyFund = false,
  ): SavingsGoal {
    const contributions: GoalContribution[] = []
    let remaining = saved
    let offset = 0
    // Lay the balance down as monthly deposits walking backwards from today.
    while (remaining > 0 && offset < 120) {
      const amount = Math.min(monthly, remaining)
      const month = addMonths(thisMonth, -offset)
      contributions.unshift({
        id: uid('con'),
        date: clampDayToMonth(month, 2),
        amount,
        note: 'Monthly transfer',
      })
      remaining -= amount
      offset += 1
    }
    return {
      id,
      name,
      target,
      saved,
      icon,
      deadline: `${deadlineMonth}-01`,
      monthlyContribution: monthly,
      isEmergencyFund,
      contributions,
      createdAt: new Date(`${addMonths(thisMonth, -offset)}-01T08:00:00`).toISOString(),
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Cards, assets, liabilities                                              */
  /* ---------------------------------------------------------------------- */

  // One card, running at 61% of its limit — the single biggest thing holding
  // the demo score down, and the first recommendation the app will make.
  const cards: CreditCard[] = [
    {
      id: 'card_cibc',
      name: 'CIBC Dividend Visa',
      issuer: 'CIBC',
      last4: '4821',
      creditLimit: 8000,
      outstanding: 4880,
      minimumDue: 120,
      statementDay: 25,
      billDueDay: 18,
    },
  ]

  const assets: Asset[] = [
    { id: 'asset_cibc_chq', name: 'CIBC Smart Account', type: 'Chequing', institution: 'CIBC', value: 3240, updatedAt: today },
    { id: 'asset_cibc_sav', name: 'CIBC eAdvantage Savings', type: 'Savings', institution: 'CIBC', value: 6500, updatedAt: today },
    { id: 'asset_ws_cash', name: 'Wealthsimple Cash', type: 'Chequing', institution: 'Wealthsimple', value: 2150, updatedAt: today },
    { id: 'asset_car', name: 'Honda Civic (resale)', type: 'Vehicle', value: 24000, updatedAt: today },
  ]

  const liabilities: Liability[] = []

  /* ---------------------------------------------------------------------- */
  /* Budgets                                                                 */
  /* ---------------------------------------------------------------------- */

  const budgets: BudgetsByMonth = {
    [DEFAULT_BUDGET_KEY]: {
      Rent: 1850,
      'Food & Dining': 700,
      Transport: 420,
      Shopping: 250,
      'Loan Payment': 500,
      Investments: 500,
      'Bills & Utilities': 400,
      Entertainment: 120,
      Other: 150,
    },
  }

  return {
    version: 1,
    settings: defaultSettings(),
    transactions,
    budgets,
    goals,
    investments,
    loans,
    cards,
    assets,
    liabilities,
    dismissedAlerts: [],
  }
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

/** An empty workspace, for "start fresh" in Settings. */
export function buildEmptyState(): AppState {
  return {
    version: 1,
    settings: defaultSettings(),
    transactions: [],
    budgets: { [DEFAULT_BUDGET_KEY]: {} },
    goals: [],
    investments: [],
    loans: [],
    cards: [],
    assets: [],
    liabilities: [],
    dismissedAlerts: [],
  }
}
