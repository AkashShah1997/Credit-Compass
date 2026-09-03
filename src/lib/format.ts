/**
 * Number and currency formatting.
 *
 * The app is rupee-denominated, so grouping follows the Indian system
 * (₹1,50,000 — not ₹150,000) and compact figures use lakh/crore rather than
 * K/M. `Intl` handles both once you ask it for the `en-IN` locale.
 */

const inr0 = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const inr2 = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const plain0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const plain2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

export const CURRENCY_SYMBOL = '₹'

/** `80000` → `₹80,000`. Pass `decimals` for paise. */
export function formatCurrency(value: number, decimals = false): string {
  if (!Number.isFinite(value)) return '—'
  return (decimals ? inr2 : inr0).format(value)
}

/** Signed for deltas: `+₹12,000` / `−₹3,400`. Uses a true minus sign. */
export function formatSignedCurrency(value: number, decimals = false): string {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${(decimals ? inr2 : inr0).format(Math.abs(value))}`
}

/**
 * Compact rupees on the Indian scale: `₹1.5L`, `₹2.4Cr`, `₹80K`.
 * Used for axis ticks and stat tiles where the exact figure lives in a tooltip.
 */
export function formatCompactCurrency(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const sign = value < 0 ? '−' : ''
  const abs = Math.abs(value)
  if (abs >= 1_00_00_000) return `${sign}${CURRENCY_SYMBOL}${trim(abs / 1_00_00_000)}Cr`
  if (abs >= 1_00_000) return `${sign}${CURRENCY_SYMBOL}${trim(abs / 1_00_000)}L`
  if (abs >= 1_000) return `${sign}${CURRENCY_SYMBOL}${trim(abs / 1_000)}K`
  return `${sign}${CURRENCY_SYMBOL}${plain0.format(abs)}`
}

/** Compact without the currency mark — for axis ticks that carry a unit label. */
export function formatCompact(value: number): string {
  return formatCompactCurrency(value).replace(CURRENCY_SYMBOL, '')
}

function trim(n: number): string {
  // 1.0 → "1", 1.25 → "1.3": one decimal is enough at compact sizes.
  const rounded = n >= 100 ? Math.round(n) : Math.round(n * 10) / 10
  return String(rounded)
}

export function formatNumber(value: number, decimals = false): string {
  if (!Number.isFinite(value)) return '—'
  return (decimals ? plain2 : plain0).format(value)
}

/** `0.4231` is *not* a percent here — pass `42.31`. */
export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(decimals).replace(/\.0+$/, '')}%`
}

export function formatSignedPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(decimals).replace(/\.0+$/, '')}%`
}

/** Safe percentage change; returns null when there is no meaningful base. */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

/** Clamped 0–100 progress ratio, in percent. */
export function progressPercent(current: number, target: number): number {
  if (!target || target <= 0) return 0
  return Math.max(0, Math.min(100, (current / target) * 100))
}

/** `18` → `18 months`, `26` → `2 yrs 2 mo`. */
export function formatTenure(months: number): string {
  if (!Number.isFinite(months) || months <= 0) return '—'
  const m = Math.round(months)
  if (m < 12) return `${m} ${m === 1 ? 'month' : 'months'}`
  const years = Math.floor(m / 12)
  const rest = m % 12
  return rest ? `${years} yr${years > 1 ? 's' : ''} ${rest} mo` : `${years} yr${years > 1 ? 's' : ''}`
}

/** `•••• 4821` masked card display. */
export function maskCard(last4: string): string {
  return `•••• ${last4}`
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

/** Parse loosely-typed user input ("₹1,20,000" / "1.2k") into a number. */
export function parseAmount(input: string): number {
  const cleaned = input.replace(/[^\d.kKlLcC]/g, '')
  const match = /^([\d.]+)\s*([klc]{0,2})$/i.exec(cleaned)
  if (!match) return Number(input.replace(/[^\d.-]/g, '')) || 0
  const base = Number(match[1]) || 0
  const suffix = match[2].toLowerCase()
  if (suffix === 'k') return base * 1_000
  if (suffix === 'l') return base * 1_00_000
  if (suffix === 'c' || suffix === 'cr') return base * 1_00_00_000
  return base
}
