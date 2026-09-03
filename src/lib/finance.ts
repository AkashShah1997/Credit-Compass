/**
 * Pure financial derivations.
 *
 * Nothing here touches React or storage — every function takes state in and
 * returns numbers out, so the same logic can be unit-tested, reused by the
 * export layer, or moved server-side untouched.
 */

import type {
  AppNotification,
  AppState,
  Asset,
  AssetType,
  BudgetLimits,
  BudgetsByMonth,
  Category,
  CreditCard,
  ExpenseCategory,
  Investment,
  Liability,
  Loan,
  SavingsGoal,
  Settings,
  Transaction,
  TransactionFilters,
} from '../types'
import { DEFAULT_BUDGET_KEY, EXPENSE_CATEGORIES } from '../types'
import {
  addMonths,
  clampDayToMonth,
  currentMonthKey,
  daysInMonth,
  daysUntil,
  endOfMonth,
  isSameMonth,
  monthKey,
  monthLabel,
  monthRange,
  nextDueDate,
  parseISO,
  startOfMonth,
  todayISO,
} from './date'

const round = (n: number) => Math.round(n * 100) / 100

/* -------------------------------------------------------------------------- */
/* Assets                                                                     */
/* -------------------------------------------------------------------------- */

/** Money that can be spent this week — what "balance" and "cash" mean everywhere. */
export const LIQUID_ASSET_TYPES: readonly AssetType[] = ['Chequing', 'Savings', 'Cash']

export function isLiquidAsset(asset: Asset): boolean {
  return LIQUID_ASSET_TYPES.includes(asset.type)
}

/* -------------------------------------------------------------------------- */
/* Loans                                                                      */
/* -------------------------------------------------------------------------- */

/** Standard amortized payment: P·r·(1+r)^n / ((1+r)^n − 1). */
export function calculateLoanPayment(principal: number, annualRatePercent: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0
  const r = annualRatePercent / 12 / 100
  if (r === 0) return round(principal / months)
  const factor = Math.pow(1 + r, months)
  return round((principal * r * factor) / (factor - 1))
}

export interface AmortisationRow {
  index: number
  month: string
  dueDate: string
  payment: number
  principalPaid: number
  interestPaid: number
  balance: number
  paid: boolean
}

/**
 * Full amortisation schedule. The final instalment absorbs rounding so the
 * balance lands exactly on zero rather than a few cents either side.
 */
export function amortisationSchedule(loan: Loan): AmortisationRow[] {
  const r = loan.interestRate / 12 / 100
  const rows: AmortisationRow[] = []
  let balance = loan.principal
  const startKey = monthKey(loan.startDate)

  for (let i = 0; i < loan.tenureMonths; i++) {
    const month = addMonths(startKey, i)
    const interest = round(balance * r)
    const isLast = i === loan.tenureMonths - 1
    let payment = loan.paymentAmount
    let principalPaid = round(payment - interest)

    if (isLast || principalPaid >= balance) {
      principalPaid = balance
      payment = round(balance + interest)
    }

    balance = round(Math.max(0, balance - principalPaid))
    rows.push({
      index: i + 1,
      month,
      dueDate: clampDayToMonth(month, loan.dueDay),
      payment,
      principalPaid,
      interestPaid: interest,
      balance,
      paid: i < loan.paidMonths,
    })
    if (balance <= 0 && !isLast) break
  }
  return rows
}

export interface LoanSummary {
  loan: Loan
  outstanding: number
  paidPrincipal: number
  totalInterest: number
  interestPaid: number
  remainingMonths: number
  nextDueDate: string
  progressPercent: number
  totalPayable: number
}

export function summariseLoan(loan: Loan): LoanSummary {
  const schedule = amortisationSchedule(loan)
  const paidRows = schedule.slice(0, Math.min(loan.paidMonths, schedule.length))
  const outstanding = paidRows.length ? paidRows[paidRows.length - 1].balance : loan.principal
  const interestPaid = paidRows.reduce((s, row) => s + row.interestPaid, 0)
  const totalInterest = schedule.reduce((s, row) => s + row.interestPaid, 0)
  const remainingMonths = Math.max(0, schedule.length - loan.paidMonths)

  return {
    loan,
    outstanding: round(outstanding),
    paidPrincipal: round(loan.principal - outstanding),
    totalInterest: round(totalInterest),
    interestPaid: round(interestPaid),
    remainingMonths,
    nextDueDate: nextDueDate(loan.dueDay),
    progressPercent: loan.principal ? ((loan.principal - outstanding) / loan.principal) * 100 : 0,
    totalPayable: round(schedule.reduce((s, row) => s + row.payment, 0)),
  }
}

export function totalMonthlyLoanPayments(loans: Loan[]): number {
  return loans.filter((l) => l.active && l.paidMonths < l.tenureMonths).reduce((s, l) => s + l.paymentAmount, 0)
}

export function totalLoanOutstanding(loans: Loan[]): number {
  return loans.filter((l) => l.active).reduce((s, l) => s + summariseLoan(l).outstanding, 0)
}

/* -------------------------------------------------------------------------- */
/* Transactions                                                               */
/* -------------------------------------------------------------------------- */

export function sortByDateDesc(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))
}

export function filterTransactions(
  transactions: Transaction[],
  filters: Partial<TransactionFilters>,
): Transaction[] {
  const search = filters.search?.trim().toLowerCase() ?? ''
  return transactions.filter((t) => {
    if (filters.type && filters.type !== 'all' && t.type !== filters.type) return false
    if (filters.categories?.length && !filters.categories.includes(t.category)) return false
    if (filters.methods?.length && !filters.methods.includes(t.method)) return false
    if (filters.range && (t.date < filters.range.from || t.date > filters.range.to)) return false
    if (filters.minAmount != null && t.amount < filters.minAmount) return false
    if (filters.maxAmount != null && t.amount > filters.maxAmount) return false
    if (search) {
      const haystack = `${t.note} ${t.category} ${t.method} ${t.amount}`.toLowerCase()
      if (!haystack.includes(search)) return false
    }
    return true
  })
}

export function sumBy(transactions: Transaction[], type?: 'income' | 'expense'): number {
  return transactions.reduce((s, t) => (!type || t.type === type ? s + t.amount : s), 0)
}

export function transactionsInMonth(transactions: Transaction[], month: string): Transaction[] {
  return transactions.filter((t) => isSameMonth(t.date, month))
}

export interface MonthTotals {
  month: string
  label: string
  income: number
  expense: number
  net: number
  savingsRate: number
}

export function monthTotals(transactions: Transaction[], month: string): MonthTotals {
  const rows = transactionsInMonth(transactions, month)
  const income = sumBy(rows, 'income')
  const expense = sumBy(rows, 'expense')
  return {
    month,
    label: monthLabel(month),
    income,
    expense,
    net: income - expense,
    savingsRate: income > 0 ? ((income - expense) / income) * 100 : 0,
  }
}

export function monthlySeries(transactions: Transaction[], months: string[]): MonthTotals[] {
  return months.map((m) => monthTotals(transactions, m))
}

export interface CategoryTotal {
  category: Category
  amount: number
  share: number
  count: number
}

export function categoryBreakdown(
  transactions: Transaction[],
  type: 'income' | 'expense' = 'expense',
): CategoryTotal[] {
  const rows = transactions.filter((t) => t.type === type)
  const total = sumBy(rows)
  const map = new Map<Category, { amount: number; count: number }>()
  for (const t of rows) {
    const entry = map.get(t.category) ?? { amount: 0, count: 0 }
    entry.amount += t.amount
    entry.count += 1
    map.set(t.category, entry)
  }
  return [...map.entries()]
    .map(([category, { amount, count }]) => ({
      category,
      amount,
      count,
      share: total ? (amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
}

/** Average monthly spend across the months that actually have data. */
export function averageMonthlyExpense(transactions: Transaction[], months: string[]): number {
  const withData = months
    .map((m) => monthTotals(transactions, m))
    .filter((m) => m.income > 0 || m.expense > 0)
  if (!withData.length) return 0
  return withData.reduce((s, m) => s + m.expense, 0) / withData.length
}

/* -------------------------------------------------------------------------- */
/* Budgets                                                                    */
/* -------------------------------------------------------------------------- */

export function budgetLimitsFor(budgets: BudgetsByMonth, month: string): BudgetLimits {
  return { ...(budgets[DEFAULT_BUDGET_KEY] ?? {}), ...(budgets[month] ?? {}) }
}

export type BudgetTone = 'good' | 'warning' | 'critical'

export interface BudgetRow {
  category: ExpenseCategory
  limit: number
  spent: number
  remaining: number
  usedPercent: number
  tone: BudgetTone
  /** Spend/day needed to finish the month exactly on budget. */
  dailyAllowance: number
}

export function budgetRows(
  state: Pick<AppState, 'budgets' | 'transactions' | 'settings'>,
  month: string,
): BudgetRow[] {
  const limits = budgetLimitsFor(state.budgets, month)
  const rows = transactionsInMonth(state.transactions, month).filter((t) => t.type === 'expense')
  const threshold = state.settings.budgetAlertThreshold || 80
  const today = todayISO()
  const isCurrent = month === currentMonthKey()
  const daysLeft = isCurrent
    ? Math.max(1, daysInMonth(month) - parseISO(today).getDate() + 1)
    : daysInMonth(month)

  return EXPENSE_CATEGORIES.map((category) => {
    const limit = limits[category] ?? 0
    const spent = rows.filter((t) => t.category === category).reduce((s, t) => s + t.amount, 0)
    const remaining = limit - spent
    const usedPercent = limit > 0 ? (spent / limit) * 100 : spent > 0 ? 100 : 0
    const tone: BudgetTone = usedPercent >= 100 ? 'critical' : usedPercent >= threshold ? 'warning' : 'good'
    return {
      category,
      limit,
      spent,
      remaining,
      usedPercent,
      tone,
      dailyAllowance: remaining > 0 ? remaining / daysLeft : 0,
    }
  })
}

export interface BudgetSummary {
  totalLimit: number
  totalSpent: number
  totalRemaining: number
  usedPercent: number
  overspentCount: number
  atRiskCount: number
  rows: BudgetRow[]
}

export function budgetSummary(
  state: Pick<AppState, 'budgets' | 'transactions' | 'settings'>,
  month: string,
): BudgetSummary {
  const rows = budgetRows(state, month)
  const budgeted = rows.filter((r) => r.limit > 0)
  const totalLimit = budgeted.reduce((s, r) => s + r.limit, 0)
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0)
  return {
    rows,
    totalLimit,
    totalSpent,
    totalRemaining: totalLimit - totalSpent,
    usedPercent: totalLimit ? (totalSpent / totalLimit) * 100 : 0,
    overspentCount: budgeted.filter((r) => r.tone === 'critical').length,
    atRiskCount: budgeted.filter((r) => r.tone === 'warning').length,
  }
}

/* -------------------------------------------------------------------------- */
/* Savings goals                                                              */
/* -------------------------------------------------------------------------- */

export interface GoalSummary {
  goal: SavingsGoal
  percent: number
  remaining: number
  /** Months to finish at the planned contribution; null when unknowable. */
  monthsToGoal: number | null
  /** Contribution needed each month to hit the deadline; null without one. */
  requiredMonthly: number | null
  onTrack: boolean
}

export function summariseGoal(goal: SavingsGoal): GoalSummary {
  const remaining = Math.max(0, goal.target - goal.saved)
  const monthly = goal.monthlyContribution ?? 0
  const monthsToGoal = remaining === 0 ? 0 : monthly > 0 ? Math.ceil(remaining / monthly) : null

  let requiredMonthly: number | null = null
  if (goal.deadline) {
    const monthsLeft = Math.max(1, Math.round(daysUntil(goal.deadline) / 30.44))
    requiredMonthly = remaining > 0 ? Math.ceil(remaining / monthsLeft) : 0
  }

  return {
    goal,
    percent: goal.target > 0 ? Math.min(100, (goal.saved / goal.target) * 100) : 0,
    remaining,
    monthsToGoal,
    requiredMonthly,
    onTrack: requiredMonthly == null ? monthly > 0 : monthly >= requiredMonthly,
  }
}

export function totalSaved(goals: SavingsGoal[]): number {
  return goals.reduce((s, g) => s + g.saved, 0)
}

export function emergencyFund(goals: SavingsGoal[]): SavingsGoal | undefined {
  return goals.find((g) => g.isEmergencyFund) ?? goals.find((g) => /emergency/i.test(g.name))
}

/** Cumulative savings balance at the end of each month, from contribution logs. */
export function savingsGrowth(goals: SavingsGoal[], months: string[]): { month: string; label: string; total: number }[] {
  const contributions = goals.flatMap((g) => g.contributions)
  if (!months.length) return []
  const before = contributions
    .filter((c) => monthKey(c.date) < months[0])
    .reduce((s, c) => s + c.amount, 0)

  let running = before
  return months.map((m) => {
    running += contributions.filter((c) => isSameMonth(c.date, m)).reduce((s, c) => s + c.amount, 0)
    return { month: m, label: monthLabel(m), total: round(running) }
  })
}

/* -------------------------------------------------------------------------- */
/* Investments                                                                */
/* -------------------------------------------------------------------------- */

export interface InvestmentSummary {
  invested: number
  currentValue: number
  gain: number
  gainPercent: number
  monthlyContribution: number
  activeCount: number
}

export function summariseInvestments(investments: Investment[]): InvestmentSummary {
  const invested = investments.reduce((s, i) => s + i.invested, 0)
  const currentValue = investments.reduce((s, i) => s + i.currentValue, 0)
  const gain = currentValue - invested
  return {
    invested,
    currentValue,
    gain,
    gainPercent: invested ? (gain / invested) * 100 : 0,
    monthlyContribution: investments
      .filter((i) => i.active && i.monthlyAmount)
      .reduce((s, i) => s + (i.monthlyAmount ?? 0), 0),
    activeCount: investments.filter((i) => i.active).length,
  }
}

export function investmentGain(investment: Investment): { gain: number; percent: number } {
  const gain = investment.currentValue - investment.invested
  return { gain, percent: investment.invested ? (gain / investment.invested) * 100 : 0 }
}

/** Portfolio invested-vs-value by month, summed across every holding. */
export function portfolioGrowth(
  investments: Investment[],
  months: string[],
): { month: string; label: string; invested: number; value: number }[] {
  return months.map((month) => {
    let invested = 0
    let value = 0
    for (const inv of investments) {
      // The nearest snapshot at or before this month is the holding's state then.
      const snapshot = [...inv.history].filter((h) => h.month <= month).pop()
      if (snapshot) {
        invested += snapshot.invested
        value += snapshot.value
      }
    }
    return { month, label: monthLabel(month), invested: round(invested), value: round(value) }
  })
}

export function allocationByType(investments: Investment[]): { type: string; value: number; share: number }[] {
  const total = investments.reduce((s, i) => s + i.currentValue, 0)
  const map = new Map<string, number>()
  for (const i of investments) map.set(i.type, (map.get(i.type) ?? 0) + i.currentValue)
  return [...map.entries()]
    .map(([type, value]) => ({ type, value, share: total ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
}

/* -------------------------------------------------------------------------- */
/* Credit cards                                                               */
/* -------------------------------------------------------------------------- */

export function cardIsPaid(card: CreditCard, month = currentMonthKey()): boolean {
  return card.lastPaidMonth === month
}

export function cardUtilisation(card: CreditCard): number {
  return card.creditLimit ? (card.outstanding / card.creditLimit) * 100 : 0
}

export function totalCardOutstanding(cards: CreditCard[]): number {
  return cards.reduce((s, c) => s + (cardIsPaid(c) ? 0 : c.outstanding), 0)
}

/* -------------------------------------------------------------------------- */
/* Net worth                                                                  */
/* -------------------------------------------------------------------------- */

export interface NetWorthBreakdown {
  assets: { label: string; value: number }[]
  liabilities: { label: string; value: number }[]
  totalAssets: number
  totalLiabilities: number
  netWorth: number
}

export function netWorthBreakdown(state: AppState): NetWorthBreakdown {
  const manualAssets = state.assets.reduce((s, a) => s + a.value, 0)
  const investmentValue = state.investments.reduce((s, i) => s + i.currentValue, 0)
  const savings = totalSaved(state.goals)
  const loanDebt = totalLoanOutstanding(state.loans)
  const cardDebt = totalCardOutstanding(state.cards)
  const manualLiabilities = state.liabilities.reduce((s, l) => s + l.value, 0)

  const assets = [
    { label: 'Bank & cash', value: state.assets.filter(isLiquidAsset).reduce((s, a) => s + a.value, 0) },
    { label: 'Investments', value: investmentValue },
    { label: 'Savings goals', value: savings },
    { label: 'Property & vehicles', value: state.assets.filter((a) => a.type === 'Property' || a.type === 'Vehicle').reduce((s, a) => s + a.value, 0) },
    { label: 'Other assets', value: state.assets.filter((a) => !isLiquidAsset(a) && a.type !== 'Property' && a.type !== 'Vehicle').reduce((s, a) => s + a.value, 0) },
  ].filter((a) => a.value !== 0)

  const liabilities = [
    { label: 'Loans outstanding', value: loanDebt },
    { label: 'Credit card dues', value: cardDebt },
    { label: 'Other liabilities', value: manualLiabilities },
  ].filter((l) => l.value !== 0)

  const totalAssets = manualAssets + investmentValue + savings
  const totalLiabilities = loanDebt + cardDebt + manualLiabilities

  return {
    assets,
    liabilities,
    totalAssets: round(totalAssets),
    totalLiabilities: round(totalLiabilities),
    netWorth: round(totalAssets - totalLiabilities),
  }
}

/**
 * Reconstructed net-worth history. Investments and loans have real month-by-month
 * histories; bank balances do not, so those are back-projected from each month's
 * net cash flow — an estimate, and the UI says so.
 */
export function netWorthHistory(state: AppState, months: string[]): { month: string; label: string; assets: number; liabilities: number; net: number }[] {
  const current = netWorthBreakdown(state)
  const liquidNow = state.assets.reduce((s, a) => s + a.value, 0)
  const growth = portfolioGrowth(state.investments, months)
  const savings = savingsGrowth(state.goals, months)
  const last = months[months.length - 1]

  // Walk cash backwards from today using each month's realised net flow.
  const cashByMonth = new Map<string, number>()
  let cash = liquidNow
  for (let i = months.length - 1; i >= 0; i--) {
    cashByMonth.set(months[i], round(cash))
    cash -= monthTotals(state.transactions, months[i]).net
  }

  const manualLiabilities = state.liabilities.reduce((s, l) => s + l.value, 0)

  return months.map((month, i) => {
    const monthsAgo = monthsBetweenCount(month, last)
    // Outstanding debt was higher in the past by the principal repaid since.
    const debt = state.loans
      .filter((l) => l.active)
      .reduce((s, l) => {
        const schedule = amortisationSchedule(l)
        const idx = Math.max(0, Math.min(schedule.length - 1, l.paidMonths - 1 - monthsAgo))
        const balance = l.paidMonths - monthsAgo <= 0 ? l.principal : schedule[idx].balance
        return s + balance
      }, 0)
    const cardDebt = totalCardOutstanding(state.cards)
    const assets = (cashByMonth.get(month) ?? 0) + (growth[i]?.value ?? 0) + (savings[i]?.total ?? 0)
    const liabilities = debt + cardDebt + manualLiabilities
    return {
      month,
      label: monthLabel(month),
      assets: round(assets),
      liabilities: round(liabilities),
      net: round(assets - liabilities),
    }
  }).map((row, i, all) => (i === all.length - 1 ? { ...row, net: current.netWorth, assets: current.totalAssets, liabilities: current.totalLiabilities } : row))
}

function monthsBetweenCount(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

/* -------------------------------------------------------------------------- */
/* Cash-flow forecast & salary-day planning                                   */
/* -------------------------------------------------------------------------- */

export interface ForecastMonth {
  month: string
  label: string
  income: number
  committed: number
  variable: number
  savings: number
  net: number
  closingBalance: number
}

/**
 * Forward projection. Committed outflows (rent, loan payments, recurring
 * contributions) are known exactly; variable spend is the trailing average of
 * the last six months.
 */
export function cashFlowForecast(state: AppState, monthsAhead = 6): ForecastMonth[] {
  const history = monthRange(6, currentMonthKey())
  const committedCategories: ExpenseCategory[] = ['Rent', 'Loan Payment', 'Investments']
  const variableAvg = averageOf(
    history.map((m) =>
      transactionsInMonth(state.transactions, m)
        .filter((t) => t.type === 'expense' && !committedCategories.includes(t.category as ExpenseCategory))
        .reduce((s, t) => s + t.amount, 0),
    ).filter((v) => v > 0),
  )

  const rent = latestCategoryAmount(state.transactions, 'Rent')
  const loanPayments = totalMonthlyLoanPayments(state.loans)
  const contributions = state.investments.filter((i) => i.active).reduce((s, i) => s + (i.monthlyAmount ?? 0), 0)
  const goalContributions = state.goals.reduce((s, g) => s + (g.monthlyContribution ?? 0), 0)
  const income = state.settings.monthlySalary

  let balance = state.assets
    .filter(isLiquidAsset)
    .reduce((s, a) => s + a.value, 0)

  return Array.from({ length: monthsAhead }, (_, i) => {
    const month = addMonths(currentMonthKey(), i + 1)
    const committed = rent + loanPayments + contributions
    const net = income - committed - variableAvg - goalContributions
    balance = round(balance + net)
    return {
      month,
      label: monthLabel(month),
      income,
      committed: round(committed),
      variable: round(variableAvg),
      savings: goalContributions,
      net: round(net),
      closingBalance: balance,
    }
  })
}

function averageOf(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0
}

function latestCategoryAmount(transactions: Transaction[], category: Category): number {
  const rows = transactions
    .filter((t) => t.category === category && t.type === 'expense')
    .sort((a, b) => b.date.localeCompare(a.date))
  return rows[0]?.amount ?? 0
}

export interface SalaryPlan {
  salaryDate: string
  daysAway: number
  income: number
  commitments: { label: string; amount: number; date: string; kind: string }[]
  totalCommitted: number
  plannedSavings: number
  discretionary: number
}

/** What the next pay-cheque is already spoken for, in due-date order. */
export function salaryDayPlan(state: AppState): SalaryPlan {
  const salaryDate = nextDueDate(state.settings.salaryDay)
  const cycleMonth = monthKey(salaryDate)

  const commitments: SalaryPlan['commitments'] = []

  const rent = latestCategoryAmount(state.transactions, 'Rent')
  if (rent > 0) commitments.push({ label: 'Rent', amount: rent, date: clampDayToMonth(cycleMonth, 3), kind: 'Rent' })

  for (const loan of state.loans.filter((l) => l.active && l.paidMonths < l.tenureMonths)) {
    commitments.push({ label: `${loan.name} payment`, amount: loan.paymentAmount, date: clampDayToMonth(cycleMonth, loan.dueDay), kind: 'Loan' })
  }
  for (const inv of state.investments.filter((i) => i.active && i.monthlyAmount)) {
    commitments.push({ label: inv.name, amount: inv.monthlyAmount ?? 0, date: clampDayToMonth(cycleMonth, inv.contributionDay ?? 1), kind: 'Contribution' })
  }
  for (const card of state.cards) {
    if (card.outstanding > 0) {
      commitments.push({ label: `${card.name} bill`, amount: card.outstanding, date: clampDayToMonth(cycleMonth, card.billDueDay), kind: 'Card' })
    }
  }

  commitments.sort((a, b) => a.date.localeCompare(b.date))
  const totalCommitted = commitments.reduce((s, c) => s + c.amount, 0)
  const plannedSavings = state.goals.reduce((s, g) => s + (g.monthlyContribution ?? 0), 0)

  return {
    salaryDate,
    daysAway: daysUntil(salaryDate),
    income: state.settings.monthlySalary,
    commitments,
    totalCommitted: round(totalCommitted),
    plannedSavings,
    discretionary: round(state.settings.monthlySalary - totalCommitted - plannedSavings),
  }
}

/* -------------------------------------------------------------------------- */
/* Financial independence                                                     */
/* -------------------------------------------------------------------------- */

export interface FiStatus {
  monthlyExpenses: number
  annualExpenses: number
  /** The corpus that sustains `annualExpenses` at the safe withdrawal rate. */
  fiNumber: number
  currentCorpus: number
  percent: number
  /** Years to FI at the current savings rate and expected return. */
  yearsToFi: number | null
  targetYear: number | null
  monthlyInvestment: number
  /** Corpus ÷ monthly expenses — months of freedom already bought. */
  monthsOfFreedom: number
}

export function fiStatus(state: AppState): FiStatus {
  const months = monthRange(6, currentMonthKey())
  const actualMonthly = averageMonthlyExpense(state.transactions, months)
  const monthlyExpenses = state.settings.fiMonthlyExpenses > 0 ? state.settings.fiMonthlyExpenses : actualMonthly
  const annualExpenses = monthlyExpenses * 12
  const swr = state.settings.safeWithdrawalRate > 0 ? state.settings.safeWithdrawalRate : 4
  const fiNumber = annualExpenses > 0 ? (annualExpenses * 100) / swr : 0

  // The FI corpus is what can actually fund retirement: liquid investments and
  // savings, net of debt. Property and vehicles are excluded on purpose.
  const currentCorpus = round(
    state.investments.reduce((s, i) => s + i.currentValue, 0) +
      totalSaved(state.goals) +
      state.assets
        .filter(isLiquidAsset)
        .reduce((s, a) => s + a.value, 0) -
      totalLoanOutstanding(state.loans) -
      totalCardOutstanding(state.cards),
  )

  const monthlyInvestment =
    state.investments.filter((i) => i.active).reduce((s, i) => s + (i.monthlyAmount ?? 0), 0) +
    state.goals.reduce((s, g) => s + (g.monthlyContribution ?? 0), 0)

  const yearsToFi = yearsToTarget(
    Math.max(0, currentCorpus),
    monthlyInvestment,
    state.settings.expectedReturnRate,
    fiNumber,
  )

  return {
    monthlyExpenses: round(monthlyExpenses),
    annualExpenses: round(annualExpenses),
    fiNumber: round(fiNumber),
    currentCorpus,
    percent: fiNumber > 0 ? Math.min(100, (Math.max(0, currentCorpus) / fiNumber) * 100) : 0,
    yearsToFi,
    targetYear: yearsToFi == null ? null : new Date().getFullYear() + Math.ceil(yearsToFi),
    monthlyInvestment,
    monthsOfFreedom: monthlyExpenses > 0 ? Math.max(0, currentCorpus) / monthlyExpenses : 0,
  }
}

/**
 * Months of compounding needed to grow `present` to `target` while adding
 * `monthly`. Returns null when the target is unreachable on these inputs.
 */
export function yearsToTarget(
  present: number,
  monthly: number,
  annualReturnPercent: number,
  target: number,
): number | null {
  if (target <= 0) return null
  if (present >= target) return 0
  if (monthly <= 0 && annualReturnPercent <= 0) return null

  const r = annualReturnPercent / 12 / 100
  let balance = present
  for (let m = 1; m <= 12 * 80; m++) {
    balance = balance * (1 + r) + monthly
    if (balance >= target) return round(m / 12)
  }
  return null
}

/** Compounded projection of the FI corpus, one point per year. */
export function projectCorpus(
  present: number,
  monthly: number,
  annualReturnPercent: number,
  years: number,
): { year: number; value: number; invested: number }[] {
  const r = annualReturnPercent / 12 / 100
  let balance = present
  let invested = present
  const out = [{ year: new Date().getFullYear(), value: round(balance), invested: round(invested) }]
  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) {
      balance = balance * (1 + r) + monthly
      invested += monthly
    }
    out.push({ year: new Date().getFullYear() + y, value: round(balance), invested: round(invested) })
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Derived, never stored — recomputing from state means a reminder can't go
 * stale after the user pays a bill. Only the dismissed ids are persisted.
 */
export function buildNotifications(state: AppState, today = todayISO()): AppNotification[] {
  const out: AppNotification[] = []
  const lead = state.settings.reminderLeadDays || 5
  const month = monthKey(today)

  for (const loan of state.loans) {
    if (!loan.active || loan.paidMonths >= loan.tenureMonths) continue
    const due = nextDueDate(loan.dueDay, today)
    const days = daysUntil(due, today)
    if (days > lead) continue
    out.push({
      id: `loan:${loan.id}:${monthKey(due)}`,
      kind: 'loan',
      severity: days < 0 ? 'critical' : days <= 1 ? 'serious' : 'warning',
      title: days < 0 ? `${loan.name} payment overdue` : `${loan.name} payment due`,
      detail: days < 0 ? `Was due ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago` : days === 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`,
      date: due,
      amount: loan.paymentAmount,
      href: '#/loans',
    })
  }

  for (const card of state.cards) {
    if (card.outstanding <= 0) continue
    const due = nextDueDate(card.billDueDay, today)
    if (cardIsPaid(card, monthKey(due))) continue
    const days = daysUntil(due, today)
    if (days > lead) continue
    out.push({
      id: `card:${card.id}:${monthKey(due)}`,
      kind: 'card',
      severity: days < 0 ? 'critical' : days <= 2 ? 'serious' : 'warning',
      title: days < 0 ? `${card.name} bill overdue` : `${card.name} bill due`,
      detail: days < 0 ? `Was due ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago` : days === 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`,
      date: due,
      amount: card.outstanding,
      href: '#/cards',
    })
  }

  for (const row of budgetRows(state, month)) {
    if (row.limit <= 0) continue
    if (row.tone === 'critical') {
      out.push({
        id: `budget:${row.category}:${month}:over`,
        kind: 'budget',
        severity: 'critical',
        title: `${row.category} budget exceeded`,
        detail: `Over by ${Math.round(row.spent - row.limit).toLocaleString('en-CA')} of ${Math.round(row.limit).toLocaleString('en-CA')}`,
        amount: row.spent - row.limit,
        href: '#/budget',
      })
    } else if (row.tone === 'warning') {
      out.push({
        id: `budget:${row.category}:${month}:near`,
        kind: 'budget',
        severity: 'warning',
        title: `${row.category} budget almost used`,
        detail: `${Math.round(row.usedPercent)}% spent — ${Math.round(row.remaining).toLocaleString('en-CA')} left`,
        amount: row.remaining,
        href: '#/budget',
      })
    }
  }

  const ef = emergencyFund(state.goals)
  if (ef && ef.target > 0 && ef.saved / ef.target < 0.5) {
    out.push({
      id: `goal:${ef.id}:underfunded`,
      kind: 'goal',
      severity: 'warning',
      title: 'Emergency fund below half',
      detail: `${Math.round((ef.saved / ef.target) * 100)}% of target — aim for 6 months of expenses`,
      amount: ef.target - ef.saved,
      href: '#/savings',
    })
  }

  const salary = nextDueDate(state.settings.salaryDay, today)
  const salaryDays = daysUntil(salary, today)
  if (salaryDays >= 0 && salaryDays <= 2) {
    out.push({
      id: `salary:${monthKey(salary)}`,
      kind: 'salary',
      severity: 'info',
      title: salaryDays === 0 ? 'Salary credited today' : `Salary in ${salaryDays} day${salaryDays === 1 ? '' : 's'}`,
      detail: 'Plan this month’s allocations before you spend',
      date: salary,
      amount: state.settings.monthlySalary,
      href: '#/planning',
    })
  }

  const severityRank = { critical: 0, serious: 1, warning: 2, info: 3 } as const
  return out
    .filter((n) => !state.dismissedAlerts.includes(n.id))
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || (a.date ?? '').localeCompare(b.date ?? ''))
}

/* -------------------------------------------------------------------------- */
/* Dashboard roll-up                                                          */
/* -------------------------------------------------------------------------- */

export interface DashboardMetrics {
  month: string
  totalBalance: number
  income: number
  expense: number
  netFlow: number
  savingsRate: number
  totalSavings: number
  investmentValue: number
  investmentGain: number
  investmentGainPercent: number
  netWorth: number
  loanOutflow: number
  previous: MonthTotals
  incomeChange: number | null
  expenseChange: number | null
}

export function dashboardMetrics(state: AppState, month = currentMonthKey()): DashboardMetrics {
  const current = monthTotals(state.transactions, month)
  const previous = monthTotals(state.transactions, addMonths(month, -1))
  const investments = summariseInvestments(state.investments)
  const worth = netWorthBreakdown(state)

  const liquid = state.assets
    .filter(isLiquidAsset)
    .reduce((s, a) => s + a.value, 0)

  return {
    month,
    // "Total balance" is spendable money: bank + cash, less unpaid card bills.
    totalBalance: round(liquid - totalCardOutstanding(state.cards)),
    income: current.income,
    expense: current.expense,
    netFlow: current.net,
    savingsRate: current.savingsRate,
    totalSavings: totalSaved(state.goals),
    investmentValue: investments.currentValue,
    investmentGain: investments.gain,
    investmentGainPercent: investments.gainPercent,
    netWorth: worth.netWorth,
    loanOutflow: totalMonthlyLoanPayments(state.loans),
    previous,
    incomeChange: previous.income ? ((current.income - previous.income) / previous.income) * 100 : null,
    expenseChange: previous.expense ? ((current.expense - previous.expense) / previous.expense) * 100 : null,
  }
}

/* -------------------------------------------------------------------------- */
/* Yearly roll-up                                                             */
/* -------------------------------------------------------------------------- */

export interface YearSummary {
  year: number
  income: number
  expense: number
  net: number
  savingsRate: number
  topCategory: { category: string; amount: number } | null
  bestMonth: MonthTotals | null
  worstMonth: MonthTotals | null
  months: MonthTotals[]
}

export function yearSummary(transactions: Transaction[], year: number): YearSummary {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  const series = monthlySeries(transactions, months)
  const withData = series.filter((m) => m.income > 0 || m.expense > 0)
  const rows = transactions.filter((t) => t.date.startsWith(String(year)))
  const breakdown = categoryBreakdown(rows, 'expense')
  const income = series.reduce((s, m) => s + m.income, 0)
  const expense = series.reduce((s, m) => s + m.expense, 0)

  return {
    year,
    income,
    expense,
    net: income - expense,
    savingsRate: income ? ((income - expense) / income) * 100 : 0,
    topCategory: breakdown[0] ? { category: breakdown[0].category, amount: breakdown[0].amount } : null,
    bestMonth: withData.length ? withData.reduce((a, b) => (b.net > a.net ? b : a)) : null,
    worstMonth: withData.length ? withData.reduce((a, b) => (b.net < a.net ? b : a)) : null,
    months: series,
  }
}

export function availableYears(transactions: Transaction[]): number[] {
  const years = new Set(transactions.map((t) => Number(t.date.slice(0, 4))))
  years.add(new Date().getFullYear())
  return [...years].sort((a, b) => b - a)
}

/* -------------------------------------------------------------------------- */
/* Misc helpers used across pages                                             */
/* -------------------------------------------------------------------------- */

export function monthBounds(month: string): { from: string; to: string } {
  return { from: startOfMonth(month), to: endOfMonth(month) }
}

export function sortAssets(assets: Asset[]): Asset[] {
  return [...assets].sort((a, b) => b.value - a.value)
}

export function sortLiabilities(items: Liability[]): Liability[] {
  return [...items].sort((a, b) => b.value - a.value)
}

export function defaultSettings(): Settings {
  return {
    name: 'Jordan Lee',
    // Monthly take-home, after tax — Canadian pay is often biweekly, but the
    // planning maths works on a monthly figure.
    monthlySalary: 5200,
    salaryDay: 1,
    budgetAlertThreshold: 80,
    reminderLeadDays: 5,
    // Long-run nominal return on a diversified Canadian/global equity mix, and
    // the Bank of Canada's inflation target band midpoint plus a little.
    expectedReturnRate: 7,
    inflationRate: 3,
    safeWithdrawalRate: 4,
    fiMonthlyExpenses: 0,
    theme: 'system',
  }
}
