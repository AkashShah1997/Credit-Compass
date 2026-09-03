/**
 * Date helpers.
 *
 * Dates move through the app as `YYYY-MM-DD` strings and months as `YYYY-MM`
 * keys. Everything here parses those into *local* Date objects on purpose:
 * `new Date('2026-08-07')` is parsed as UTC midnight by the spec, which lands on
 * the previous day for anyone west of Greenwich and quietly files transactions
 * into the wrong month.
 */

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** Parse `YYYY-MM-DD` (or `YYYY-MM`) into a local-midnight Date. */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/** Serialise a Date to `YYYY-MM-DD` using its local calendar day. */
export function toISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayISO(): string {
  return toISO(new Date())
}

/** `YYYY-MM` key for an ISO date string, a Date, or today when omitted. */
export function monthKey(input?: string | Date): string {
  if (!input) return monthKey(new Date())
  if (typeof input === 'string') return input.slice(0, 7)
  const y = input.getFullYear()
  const m = String(input.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function currentMonthKey(): string {
  return monthKey(new Date())
}

/** `2026-08` → `Aug 2026`; pass `long` for `August 2026`. */
export function monthLabel(key: string, long = false): string {
  const [y, m] = key.split('-').map(Number)
  const names = long ? MONTH_LONG : MONTH_SHORT
  return `${names[(m || 1) - 1]} ${y}`
}

/** `2026-08` → `Aug` (used for dense chart axes). */
export function monthShort(key: string): string {
  const m = Number(key.split('-')[1])
  return MONTH_SHORT[(m || 1) - 1]
}

export function addMonths(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const date = new Date(y, m - 1 + delta, 1)
  return monthKey(date)
}

export function addDays(iso: string, delta: number): string {
  const date = parseISO(iso)
  date.setDate(date.getDate() + delta)
  return toISO(date)
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export function startOfMonth(key: string): string {
  return `${key}-01`
}

export function endOfMonth(key: string): string {
  return `${key}-${String(daysInMonth(key)).padStart(2, '0')}`
}

/** The `count` month keys ending at `end` (inclusive), oldest first. */
export function monthRange(count: number, end: string = currentMonthKey()): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(end, i - count + 1))
}

/** Every month key from `from` to `to` inclusive, oldest first. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  let cursor = from
  // Guard against an inverted range producing an unbounded loop.
  for (let i = 0; i < 600 && cursor <= to; i++) {
    out.push(cursor)
    cursor = addMonths(cursor, 1)
  }
  return out
}

/** `2026-08-07` → `7 Aug 2026`. */
export function formatDate(iso: string): string {
  const d = parseISO(iso)
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

/** `2026-08-07` → `7 Aug` (same-year shorthand for tables). */
export function formatDateShort(iso: string): string {
  const d = parseISO(iso)
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`
}

export function formatDateTime(isoTimestamp: string): string {
  const d = new Date(isoTimestamp)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}, ${time}`
}

/** Whole days from today to `iso`. Negative when the date is in the past. */
export function daysUntil(iso: string, from: string = todayISO()): number {
  const a = parseISO(from).getTime()
  const b = parseISO(iso).getTime()
  return Math.round((b - a) / 86_400_000)
}

/** "in 3 days" / "today" / "5 days ago" — for due dates and reminders. */
export function relativeDay(iso: string, from: string = todayISO()): string {
  const diff = daysUntil(iso, from)
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff === -1) return 'yesterday'
  if (diff > 0) return `in ${diff} days`
  return `${Math.abs(diff)} days ago`
}

/**
 * The next occurrence of a monthly `dueDay`, clamped to months that are shorter
 * than the requested day (a 31st due date lands on the 30th in April).
 */
export function nextDueDate(dueDay: number, from: string = todayISO()): string {
  const key = monthKey(from)
  const thisMonth = clampDayToMonth(key, dueDay)
  if (thisMonth >= from) return thisMonth
  return clampDayToMonth(addMonths(key, 1), dueDay)
}

/** The occurrence of `dueDay` inside a specific month, clamped to month length. */
export function clampDayToMonth(key: string, day: number): string {
  const max = daysInMonth(key)
  const d = Math.min(Math.max(1, Math.round(day)), max)
  return `${key}-${String(d).padStart(2, '0')}`
}

export function isSameMonth(iso: string, key: string): boolean {
  return iso.slice(0, 7) === key
}

/** Inclusive containment test for `YYYY-MM-DD` strings (lexicographic works). */
export function isWithin(iso: string, from: string, to: string): boolean {
  return iso >= from && iso <= to
}

export function financialYearKey(iso: string): string {
  // Indian financial year: April → March.
  const d = parseISO(iso)
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
  return `FY ${String(y).slice(2)}-${String(y + 1).slice(2)}`
}

export function yearOf(key: string): number {
  return Number(key.slice(0, 4))
}
