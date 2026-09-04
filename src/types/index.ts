/**
 * CreditCompass domain model.
 *
 * Deliberately small. Every field here has to earn its place by changing the
 * credit advice — if knowing it would not change what the app tells you to do,
 * it is not in the model and you are not asked for it.
 *
 * Dates are `YYYY-MM-DD` strings and months `YYYY-MM` keys, so the whole state
 * tree survives a JSON round-trip unchanged. That is what makes the backup file
 * work: export is `JSON.stringify(state)` and import is the reverse.
 */

/* -------------------------------------------------------------------------- */
/* Revolving accounts — cards and lines of credit                             */
/* -------------------------------------------------------------------------- */

/** Both revolve, and both count toward utilization the same way. */
export const ACCOUNT_KINDS = ['Credit Card', 'Line of Credit'] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]

export interface CreditAccount {
  id: string
  /** Whatever you call it — "CIBC Visa" is plenty. */
  name: string
  kind: AccountKind
  /** The approved limit. */
  limit: number
  /** What is on it right now. This is the one number worth keeping current. */
  balance: number
  /** Day of the month the statement closes — the balance on this day is what gets reported. */
  statementDay: number
  /** Optional: unlocks the cost-of-carrying-a-balance tip. */
  apr?: number
  /** Optional: unlocks the length-of-history factor. */
  openedDate?: string
}

/* -------------------------------------------------------------------------- */
/* Instalment debts — loans of any kind                                       */
/* -------------------------------------------------------------------------- */

export const DEBT_KINDS = ['Auto Loan', 'Student Loan', 'Mortgage', 'Personal Loan', 'Other'] as const
export type DebtKind = (typeof DEBT_KINDS)[number]

/**
 * Three fields, because three fields is all credit scoring cares about: that it
 * exists (credit mix), when it started (age, and the "new account" drag), and
 * roughly what it costs you (affordability context for advice).
 *
 * No principal, no interest rate, no amortisation schedule — none of it would
 * change a single recommendation.
 */
export interface Debt {
  id: string
  name: string
  kind: DebtKind
  monthlyPayment: number
  startDate: string
}

/* -------------------------------------------------------------------------- */
/* Credit score & inquiries                                                   */
/* -------------------------------------------------------------------------- */

export const CREDIT_BUREAUS = ['Equifax', 'TransUnion'] as const
export type CreditBureau = (typeof CREDIT_BUREAUS)[number]

/** Where a free reading usually comes from in Canada. Free text is accepted too. */
export const SCORE_SOURCES = ['Borrowell', 'Credit Karma', 'CIBC', 'Wealthsimple', 'Mogo', 'Bank app', 'Bureau report', 'Other'] as const

/**
 * A score reading, logged by hand. No Canadian bureau exposes a consumer API,
 * so this is the honest way in — and the app is built to work off exactly one.
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
  /** What was applied for. Optional: "a hard pull happened" is the part that matters. */
  purpose?: string
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

export type ThemePreference = 'light' | 'dark' | 'system'

export interface Settings {
  /** The score being worked toward. 760+ is "excellent" at both Canadian bureaus. */
  scoreGoal: number
  /**
   * Asked once instead of derived from a payment ledger you would have to keep.
   * A payment reported 30+ days late is the single most damaging thing on a file,
   * so the app needs to know — but it does not need to know when you bought coffee.
   */
  missedPaymentLast2Years: boolean
  /** Roughly when you started building credit in Canada — drives thin-file guidance. */
  creditHistoryStart?: string
  /** Days of notice for statement-date reminders. */
  reminderLeadDays: number
  theme: ThemePreference
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

export type NotificationSeverity = 'info' | 'warning' | 'serious' | 'critical'
export type NotificationKind = 'statement' | 'score' | 'inquiry' | 'utilisation'

export interface AppNotification {
  /** Stable across renders so dismissals persist — kind + entity + period. */
  id: string
  kind: NotificationKind
  severity: NotificationSeverity
  title: string
  detail: string
  date?: string
  amount?: number
}

/* -------------------------------------------------------------------------- */
/* Root state                                                                 */
/* -------------------------------------------------------------------------- */

export interface AppState {
  version: number
  settings: Settings
  accounts: CreditAccount[]
  debts: Debt[]
  creditScores: CreditScoreEntry[]
  inquiries: CreditInquiry[]
  /** Notification ids the user has dismissed. */
  dismissedAlerts: string[]
}

/** The shape a backup file carries — state plus a little provenance. */
export interface BackupFile {
  app: string
  version: number
  exportedAt: string
  state: AppState
}
