/**
 * MoneyFlow domain model.
 *
 * Every entity carries a string `id` and ISO-8601 date strings (`YYYY-MM-DD`)
 * rather than Date objects, so the whole state tree survives a JSON round-trip
 * unchanged — that is what keeps the local-storage repository swappable for a
 * REST/GraphQL backend later without touching feature code.
 */

/* -------------------------------------------------------------------------- */
/* Transactions                                                               */
/* -------------------------------------------------------------------------- */

export type TransactionType = 'income' | 'expense'

export const EXPENSE_CATEGORIES = [
  'Rent',
  'Food',
  'Travel',
  'Shopping',
  'EMI',
  'Investments',
  'Medical',
  'Entertainment',
  'Other',
] as const

export const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Bonus',
  'Interest',
  'Dividend',
  'Rental Income',
  'Refund',
  'Other',
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number]
export type Category = ExpenseCategory | IncomeCategory

export const PAYMENT_METHODS = [
  'UPI',
  'Bank Transfer',
  'Credit Card',
  'Debit Card',
  'Cash',
  'Auto-debit',
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export interface Transaction {
  id: string
  type: TransactionType
  amount: number
  category: Category
  date: string // YYYY-MM-DD
  note: string
  method: PaymentMethod
  /** Set when the row was generated from a loan, goal, investment or card. */
  linkedType?: 'loan' | 'goal' | 'investment' | 'card'
  linkedId?: string
  createdAt: string // ISO timestamp
}

/* -------------------------------------------------------------------------- */
/* Budgets                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Budgets are keyed by month (`YYYY-MM`) with a `default` plan used for any
 * month the user has not explicitly customised. That makes "set it once" the
 * common path while still allowing a one-off month to differ.
 */
export const DEFAULT_BUDGET_KEY = 'default'

export type BudgetLimits = Partial<Record<ExpenseCategory, number>>
export type BudgetsByMonth = Record<string, BudgetLimits>

/* -------------------------------------------------------------------------- */
/* Savings goals                                                              */
/* -------------------------------------------------------------------------- */

export const GOAL_ICONS = [
  'shield',
  'palm',
  'laptop',
  'home',
  'car',
  'graduation',
  'gift',
  'heart',
  'plane',
  'piggy',
] as const

export type GoalIcon = (typeof GOAL_ICONS)[number]

export interface GoalContribution {
  id: string
  date: string
  amount: number
  note?: string
}

export interface SavingsGoal {
  id: string
  name: string
  target: number
  saved: number
  icon: GoalIcon
  /** Target date, optional — goals without a deadline just track progress. */
  deadline?: string
  monthlyContribution?: number
  /** Exactly one goal may be the emergency fund; the dashboard features it. */
  isEmergencyFund?: boolean
  contributions: GoalContribution[]
  createdAt: string
}

/* -------------------------------------------------------------------------- */
/* Investments                                                                */
/* -------------------------------------------------------------------------- */

export const INVESTMENT_TYPES = [
  'SIP',
  'Mutual Fund',
  'Stock',
  'Gold',
  'Fixed Deposit',
  'PPF',
  'NPS',
  'Other',
] as const

export type InvestmentType = (typeof INVESTMENT_TYPES)[number]

export interface InvestmentSnapshot {
  /** Month key, YYYY-MM. */
  month: string
  invested: number
  value: number
}

export interface Investment {
  id: string
  name: string
  type: InvestmentType
  /** Total capital put in so far. */
  invested: number
  /** Latest market value. */
  currentValue: number
  /** Recurring instalment — only meaningful for SIP-style holdings. */
  monthlyAmount?: number
  /** Day of month the SIP debits. */
  sipDay?: number
  units?: number
  startDate: string
  active: boolean
  notes?: string
  /** Month-by-month invested/value pairs powering the growth chart. */
  history: InvestmentSnapshot[]
}

/* -------------------------------------------------------------------------- */
/* Loans & EMIs                                                               */
/* -------------------------------------------------------------------------- */

export const LOAN_TYPES = [
  'Home Loan',
  'Car Loan',
  'Personal Loan',
  'Education Loan',
  'Gold Loan',
  'Consumer Durable',
  'Other',
] as const

export type LoanType = (typeof LOAN_TYPES)[number]

export interface Loan {
  id: string
  name: string
  lender: string
  type: LoanType
  principal: number
  /** Annual nominal rate, in percent. */
  interestRate: number
  emiAmount: number
  tenureMonths: number
  paidMonths: number
  startDate: string
  /** Day of the month the EMI is debited (1–28). */
  dueDay: number
  active: boolean
}

/* -------------------------------------------------------------------------- */
/* Credit cards                                                               */
/* -------------------------------------------------------------------------- */

export interface CreditCard {
  id: string
  name: string
  issuer: string
  last4: string
  creditLimit: number
  /** Amount owed on the current statement. */
  outstanding: number
  minimumDue: number
  statementDay: number
  billDueDay: number
  /** `YYYY-MM` of the last cycle the user marked as paid. */
  lastPaidMonth?: string
}

/* -------------------------------------------------------------------------- */
/* Net worth: manual assets & liabilities                                     */
/* -------------------------------------------------------------------------- */

export const ASSET_TYPES = [
  'Bank Balance',
  'Cash',
  'Property',
  'Vehicle',
  'Gold & Jewellery',
  'Receivable',
  'Other',
] as const

export const LIABILITY_TYPES = [
  'Personal Debt',
  'Tax Payable',
  'Rent Deposit Due',
  'Other',
] as const

export type AssetType = (typeof ASSET_TYPES)[number]
export type LiabilityType = (typeof LIABILITY_TYPES)[number]

export interface Asset {
  id: string
  name: string
  type: AssetType
  value: number
  updatedAt: string
}

export interface Liability {
  id: string
  name: string
  type: LiabilityType
  value: number
  updatedAt: string
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

export type ThemePreference = 'light' | 'dark' | 'system'

export interface Settings {
  name: string
  /** Take-home pay credited on `salaryDay`; drives cash-flow forecasting. */
  monthlySalary: number
  salaryDay: number
  /** Percent of a category budget at which a warning fires (before 100%). */
  budgetAlertThreshold: number
  /** Days of notice for EMI and card-bill reminders. */
  reminderLeadDays: number
  /** Expected annual return used for FI and forecast projections, percent. */
  expectedReturnRate: number
  /** Annual inflation assumption, percent. */
  inflationRate: number
  /** Safe withdrawal rate used to derive the FI number, percent. */
  safeWithdrawalRate: number
  /** Monthly spend the FI corpus must cover; blank means "use actual spend". */
  fiMonthlyExpenses: number
  theme: ThemePreference
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

export type NotificationSeverity = 'info' | 'warning' | 'serious' | 'critical'
export type NotificationKind = 'emi' | 'card' | 'budget' | 'goal' | 'salary' | 'investment'

export interface AppNotification {
  /** Stable across renders so dismissals persist — kind + entity + period. */
  id: string
  kind: NotificationKind
  severity: NotificationSeverity
  title: string
  detail: string
  /** Relevant date (due date, month end…) as YYYY-MM-DD. */
  date?: string
  amount?: number
  /** Route to open when the notification is clicked. */
  href?: string
}

/* -------------------------------------------------------------------------- */
/* Root state                                                                 */
/* -------------------------------------------------------------------------- */

export interface AppState {
  version: number
  settings: Settings
  transactions: Transaction[]
  budgets: BudgetsByMonth
  goals: SavingsGoal[]
  investments: Investment[]
  loans: Loan[]
  cards: CreditCard[]
  assets: Asset[]
  liabilities: Liability[]
  /** Notification ids the user has dismissed. */
  dismissedAlerts: string[]
}

/* -------------------------------------------------------------------------- */
/* Shared view helpers                                                        */
/* -------------------------------------------------------------------------- */

export interface DateRange {
  /** Inclusive, YYYY-MM-DD. */
  from: string
  /** Inclusive, YYYY-MM-DD. */
  to: string
}

export interface TransactionFilters {
  search: string
  type: TransactionType | 'all'
  categories: Category[]
  methods: PaymentMethod[]
  range: DateRange | null
  minAmount?: number
  maxAmount?: number
}
