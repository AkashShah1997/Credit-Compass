/**
 * CreditCompass domain model.
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

/**
 * Exactly eight hued categories plus a neutral `Other`. The chart palette has
 * eight validated slots and never cycles, so adding a ninth category here means
 * taking a slot from another — see `EXPENSE_SLOT` in `lib/palette.ts`.
 */
export const EXPENSE_CATEGORIES = [
  'Rent',
  'Food & Dining',
  'Transport',
  'Shopping',
  'Loan Payment',
  'Investments',
  'Bills & Utilities',
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
  'Government Benefit',
  'Other',
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number]
export type Category = ExpenseCategory | IncomeCategory

export const PAYMENT_METHODS = [
  'Debit',
  'Credit Card',
  'Interac e-Transfer',
  'Pre-authorized Debit',
  'Bank Transfer',
  'Cash',
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

/** Registered and non-registered account wrappers, the way Canadians think about holdings. */
export const INVESTMENT_TYPES = [
  'TFSA',
  'RRSP',
  'FHSA',
  'Non-registered',
  'GIC',
  'Crypto',
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
  /** Recurring contribution, when the account is topped up every month. */
  monthlyAmount?: number
  /** Day of the month the contribution is debited (1–28). */
  contributionDay?: number
  units?: number
  startDate: string
  active: boolean
  notes?: string
  /** Month-by-month invested/value pairs powering the growth chart. */
  history: InvestmentSnapshot[]
}

/* -------------------------------------------------------------------------- */
/* Loans                                                                      */
/* -------------------------------------------------------------------------- */

export const LOAN_TYPES = [
  'Mortgage',
  'Auto Loan',
  'Personal Loan',
  'Student Loan',
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
  /** The fixed monthly instalment. */
  paymentAmount: number
  tenureMonths: number
  paidMonths: number
  startDate: string
  /** Day of the month the payment is debited (1–28). */
  dueDay: number
  active: boolean
}

/* -------------------------------------------------------------------------- */
/* Credit cards & lines of credit                                             */
/* -------------------------------------------------------------------------- */

/** Both are revolving credit, and both count toward utilization. */
export const CREDIT_ACCOUNT_KINDS = ['Credit Card', 'Line of Credit'] as const
export type CreditAccountKind = (typeof CREDIT_ACCOUNT_KINDS)[number]

export interface CreditCard {
  id: string
  name: string
  issuer: string
  last4: string
  /** Defaults to a credit card when absent (older saves). */
  kind?: CreditAccountKind
  creditLimit: number
  /** Amount owed on the current statement — what the bureaus see. */
  outstanding: number
  minimumDue: number
  /** Annual interest rate on carried balances, percent. */
  apr?: number
  statementDay: number
  billDueDay: number
  /** When the account was opened; feeds the length-of-history factor. */
  openedDate?: string
  /** `YYYY-MM` of the last cycle the user marked as paid. */
  lastPaidMonth?: string
}

/* -------------------------------------------------------------------------- */
/* Credit score & inquiries                                                   */
/* -------------------------------------------------------------------------- */

export const CREDIT_BUREAUS = ['Equifax', 'TransUnion'] as const
export type CreditBureau = (typeof CREDIT_BUREAUS)[number]

/** Where a free reading usually comes from in Canada. Free text is accepted too. */
export const SCORE_SOURCES = ['Borrowell', 'Credit Karma', 'CIBC', 'Mogo', 'Bank app', 'Bureau report', 'Other'] as const

/**
 * A score reading, logged by hand. No Canadian bureau exposes a consumer API,
 * so one entry a month from a free provider is the honest way to track it.
 */
export interface CreditScoreEntry {
  id: string
  date: string
  /** 300–900 on the Canadian scale. */
  score: number
  bureau: CreditBureau
  source?: string
  note?: string
}

/** A hard pull on the file — an application for credit. */
export interface CreditInquiry {
  id: string
  date: string
  lender: string
  /** What was applied for — shown on the timeline. */
  purpose: string
  bureau?: CreditBureau | 'Both'
}

/* -------------------------------------------------------------------------- */
/* Net worth: manual assets & liabilities                                     */
/* -------------------------------------------------------------------------- */

export const ASSET_TYPES = [
  'Chequing',
  'Savings',
  'Cash',
  'Property',
  'Vehicle',
  'Other',
] as const

export const LIABILITY_TYPES = [
  'Personal Debt',
  'Tax Owing',
  'Other',
] as const

export type AssetType = (typeof ASSET_TYPES)[number]
export type LiabilityType = (typeof LIABILITY_TYPES)[number]

export interface Asset {
  id: string
  name: string
  type: AssetType
  /** Who holds it — CIBC, Wealthsimple, … Free text so any bank works. */
  institution?: string
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
  /** Days of notice for loan-payment and card-bill reminders. */
  reminderLeadDays: number
  /** Expected annual return used for FI and forecast projections, percent. */
  expectedReturnRate: number
  /** Annual inflation assumption, percent. */
  inflationRate: number
  /** Safe withdrawal rate used to derive the FI number, percent. */
  safeWithdrawalRate: number
  /** Monthly spend the FI corpus must cover; blank means "use actual spend". */
  fiMonthlyExpenses: number
  /** The score being worked toward. 760+ is "excellent" at both Canadian bureaus. */
  creditScoreGoal: number
  theme: ThemePreference
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

export type NotificationSeverity = 'info' | 'warning' | 'serious' | 'critical'
export type NotificationKind = 'loan' | 'card' | 'budget' | 'goal' | 'salary' | 'investment' | 'credit'

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
  creditScores: CreditScoreEntry[]
  inquiries: CreditInquiry[]
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
