/**
 * Demo workspace.
 *
 * Built fresh on first run so the app opens with something to look at rather
 * than a wall of empty states. Figures follow the brief: ₹80,000 salary,
 * ₹25,000 rent, three SIPs (₹2,500 / ₹2,000 / ₹1,500), a ₹15,000 gold holding,
 * and an emergency fund at ₹40,000 of a ₹1,50,000 target.
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
import { calculateEmi, defaultSettings } from './finance'
import {
  addMonths,
  clampDayToMonth,
  currentMonthKey,
  monthKey,
  monthRange,
  todayISO,
} from './date'
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

export function buildSeedState(): AppState {
  const rand = mulberry32(20260807)
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]
  const between = (min: number, max: number) => Math.round(min + rand() * (max - min))
  const today = todayISO()
  const thisMonth = currentMonthKey()
  const months = monthRange(HISTORY_MONTHS, thisMonth)

  /* ---------------------------------------------------------------------- */
  /* Loans                                                                   */
  /* ---------------------------------------------------------------------- */

  const carStart = addMonths(thisMonth, -17)
  const gadgetStart = addMonths(thisMonth, -6)

  const loans: Loan[] = [
    {
      id: 'loan_car',
      name: 'Car Loan',
      lender: 'HDFC Bank',
      type: 'Car Loan',
      principal: 550000,
      interestRate: 9.5,
      emiAmount: calculateEmi(550000, 9.5, 48),
      tenureMonths: 48,
      paidMonths: 17,
      startDate: `${carStart}-07`,
      dueDay: 7,
      active: true,
    },
    {
      id: 'loan_gadget',
      name: 'MacBook Loan',
      lender: 'Bajaj Finserv',
      type: 'Consumer Durable',
      principal: 42000,
      interestRate: 13,
      emiAmount: calculateEmi(42000, 13, 12),
      tenureMonths: 12,
      paidMonths: 6,
      startDate: `${gadgetStart}-12`,
      dueDay: 12,
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
    sipDay?: number
    lumpSum?: number
    startMonthsAgo: number
    growth: number
    units?: number
  }[] = [
    { id: 'inv_sip1', name: 'Axis Bluechip Fund', type: 'SIP', monthly: 2500, sipDay: 5, startMonthsAgo: 40, growth: 1.19 },
    { id: 'inv_sip2', name: 'Parag Parikh Flexi Cap', type: 'SIP', monthly: 2000, sipDay: 10, startMonthsAgo: 34, growth: 1.22 },
    { id: 'inv_sip3', name: 'Nippon India Small Cap', type: 'SIP', monthly: 1500, sipDay: 15, startMonthsAgo: 26, growth: 1.28 },
    { id: 'inv_gold', name: 'Digital Gold (SGB)', type: 'Gold', lumpSum: 15000, startMonthsAgo: 19, growth: 1.19, units: 2.1 },
    { id: 'inv_mf', name: 'HDFC Balanced Advantage', type: 'Mutual Fund', lumpSum: 60000, startMonthsAgo: 24, growth: 1.185 },
    { id: 'inv_stock', name: 'Direct Equity Basket', type: 'Stock', lumpSum: 85000, startMonthsAgo: 30, growth: 0.94 },
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
      sipDay: spec.sipDay,
      units: spec.units,
      startDate: `${startMonth}-${String(spec.sipDay ?? 15).padStart(2, '0')}`,
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

  const FOOD_NOTES = ['Groceries — BigBasket', 'Swiggy order', 'Weekend dinner', 'Zomato lunch', 'Milk & vegetables', 'Office canteen', 'Coffee run', 'Bakery']
  const TRAVEL_NOTES = ['Uber to office', 'Metro recharge', 'Petrol', 'Ola airport drop', 'Weekend road trip', 'Train ticket']
  const SHOPPING_NOTES = ['Amazon order', 'Myntra — clothes', 'Home essentials', 'Electronics accessory', 'Gift for family', 'Footwear']
  const ENTERTAINMENT_NOTES = ['Netflix', 'Spotify Premium', 'Movie tickets', 'Concert tickets', 'Gaming subscription']
  const MEDICAL_NOTES = ['Pharmacy', 'Doctor consultation', 'Lab tests', 'Dental checkup']
  const OTHER_NOTES = ['Electricity bill', 'Mobile recharge', 'Broadband bill', 'Gas cylinder', 'Household help', 'Water bill']
  const METHODS: PaymentMethod[] = ['UPI', 'Credit Card', 'Debit Card', 'Cash', 'Bank Transfer']

  for (const month of months) {
    // Salary
    add('income', 80000, 'Salary', clampDayToMonth(month, 1), 'Monthly salary credit', 'Bank Transfer')

    // Occasional extra income
    const m = Number(month.slice(5))
    if (m === 3) add('income', 65000, 'Bonus', clampDayToMonth(month, 28), 'Annual performance bonus', 'Bank Transfer')
    if (m === 10) add('income', 25000, 'Bonus', clampDayToMonth(month, 18), 'Festive bonus', 'Bank Transfer')
    if (m % 3 === 0) add('income', between(600, 1400), 'Interest', clampDayToMonth(month, 26), 'Savings account interest', 'Bank Transfer')
    if (m === 6) add('income', 12000, 'Freelance', clampDayToMonth(month, 21), 'Weekend design project', 'UPI')

    // Rent
    add('expense', 25000, 'Rent', clampDayToMonth(month, 3), 'Apartment rent', 'Bank Transfer')

    // EMIs
    for (const loan of loans) {
      const loanStart = monthKey(loan.startDate)
      const paidThrough = addMonths(loanStart, loan.paidMonths - 1)
      if (month >= loanStart && month <= paidThrough) {
        add('expense', loan.emiAmount, 'EMI', clampDayToMonth(month, loan.dueDay), `${loan.name} instalment`, 'Auto-debit', {
          linkedType: 'loan',
          linkedId: loan.id,
        })
      }
    }

    // SIP debits
    for (const inv of investments) {
      if (!inv.monthlyAmount) continue
      if (month >= monthKey(inv.startDate)) {
        add('expense', inv.monthlyAmount, 'Investments', clampDayToMonth(month, inv.sipDay ?? 5), `${inv.name} SIP`, 'Auto-debit', {
          linkedType: 'investment',
          linkedId: inv.id,
        })
      }
    }

    // Gold purchase, once
    const goldMonth = monthKey(investments.find((i) => i.id === 'inv_gold')!.startDate)
    if (month === goldMonth) {
      add('expense', 15000, 'Investments', clampDayToMonth(month, 15), 'Sovereign Gold Bond purchase', 'Bank Transfer', {
        linkedType: 'investment',
        linkedId: 'inv_gold',
      })
    }

    // Variable spend
    for (let i = 0; i < between(6, 8); i++) {
      add('expense', between(180, 2400), 'Food', clampDayToMonth(month, between(1, 28)), pick(FOOD_NOTES), pick(METHODS))
    }
    for (let i = 0; i < between(2, 4); i++) {
      add('expense', between(160, 1800), 'Travel', clampDayToMonth(month, between(1, 28)), pick(TRAVEL_NOTES), pick(METHODS))
    }
    for (let i = 0; i < between(1, 3); i++) {
      add('expense', between(700, 3800), 'Shopping', clampDayToMonth(month, between(1, 28)), pick(SHOPPING_NOTES), 'Credit Card')
    }
    for (let i = 0; i < between(1, 3); i++) {
      add('expense', between(119, 1400), 'Entertainment', clampDayToMonth(month, between(1, 28)), pick(ENTERTAINMENT_NOTES), pick(METHODS))
    }
    if (rand() > 0.45) {
      add('expense', between(400, 2600), 'Medical', clampDayToMonth(month, between(1, 28)), pick(MEDICAL_NOTES), pick(METHODS))
    }
    for (let i = 0; i < 3; i++) {
      add('expense', between(400, 2400), 'Other', clampDayToMonth(month, between(2, 26)), pick(OTHER_NOTES), pick(METHODS))
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Savings goals                                                           */
  /* ---------------------------------------------------------------------- */

  const goals: SavingsGoal[] = [
    makeGoal('goal_emergency', 'Emergency Fund', 150000, 40000, 'shield', 5000, addMonths(thisMonth, 22), true),
    makeGoal('goal_vacation', 'Vacation — Bali', 120000, 34000, 'plane', 2500, addMonths(thisMonth, 10)),
    makeGoal('goal_laptop', 'New Laptop', 140000, 52000, 'laptop', 3000, addMonths(thisMonth, 15)),
    makeGoal('goal_house', 'House Down Payment', 1500000, 210000, 'home', 5000, addMonths(thisMonth, 48)),
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

  const cards: CreditCard[] = [
    {
      id: 'card_hdfc',
      name: 'HDFC Millennia',
      issuer: 'HDFC Bank',
      last4: '4821',
      creditLimit: 300000,
      outstanding: 18420,
      minimumDue: 921,
      statementDay: 25,
      billDueDay: 15,
    },
    {
      id: 'card_axis',
      name: 'Axis Ace',
      issuer: 'Axis Bank',
      last4: '7734',
      creditLimit: 150000,
      outstanding: 6280,
      minimumDue: 314,
      statementDay: 20,
      billDueDay: 8,
    },
  ]

  const assets: Asset[] = [
    { id: 'asset_bank', name: 'HDFC Savings Account', type: 'Bank Balance', value: 185000, updatedAt: today },
    { id: 'asset_cash', name: 'Cash in hand', type: 'Cash', value: 8500, updatedAt: today },
    { id: 'asset_car', name: 'Hyundai i20 (resale)', type: 'Vehicle', value: 620000, updatedAt: today },
    { id: 'asset_jewel', name: 'Family jewellery', type: 'Gold & Jewellery', value: 240000, updatedAt: today },
  ]

  const liabilities: Liability[] = [
    { id: 'liab_family', name: 'Borrowed from family', type: 'Personal Debt', value: 30000, updatedAt: today },
  ]

  /* ---------------------------------------------------------------------- */
  /* Budgets                                                                 */
  /* ---------------------------------------------------------------------- */

  const budgets: BudgetsByMonth = {
    [DEFAULT_BUDGET_KEY]: {
      Rent: 25000,
      Food: 12000,
      Travel: 4000,
      Shopping: 5000,
      EMI: 18000,
      Investments: 6000,
      Medical: 3000,
      Entertainment: 3000,
      Other: 3000,
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
