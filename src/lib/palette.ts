/**
 * Chart palette.
 *
 * These are the eight validated categorical slots from the data-viz method,
 * stepped once for the light surface (#ffffff) and once for the dark surface
 * (#12151c). Both sets pass the lightness band, chroma floor, adjacent-pair CVD
 * separation and normal-vision floor checks. Three light slots (aqua, yellow,
 * magenta) sit under 3:1 against white, so every chart that uses them also
 * ships direct labels, a legend and a table view — that is the relief rule, not
 * an optional nicety.
 *
 * Slots are assigned in fixed order and never cycled. A ninth series folds into
 * "Other", which is why `Other` here is deliberately a neutral, not a hue.
 */

import type { ExpenseCategory, InvestmentType } from '../types'

export type Mode = 'light' | 'dark'

export const SERIES_LIGHT = [
  '#2a78d6', // 1 blue
  '#eb6834', // 2 orange
  '#1baf7a', // 3 aqua
  '#eda100', // 4 yellow
  '#e87ba4', // 5 magenta
  '#008300', // 6 green
  '#4a3aa7', // 7 violet
  '#e34948', // 8 red
] as const

export const SERIES_DARK = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
] as const

/**
 * The first three slots are the only ones that clear the all-pairs floors, so
 * scatter/bubble-style charts (where every pair is adjacent) cap here.
 */
export const ALL_PAIRS_SAFE_COUNT = 3

export const NEUTRAL_SERIES: Record<Mode, string> = {
  light: '#98a1b0',
  dark: '#5e6675',
}

export function series(mode: Mode): readonly string[] {
  return mode === 'dark' ? SERIES_DARK : SERIES_LIGHT
}

/** Slot lookup that never wraps: past slot 8 you get the neutral. */
export function seriesColor(index: number, mode: Mode): string {
  const list = series(mode)
  return index >= 0 && index < list.length ? list[index] : NEUTRAL_SERIES[mode]
}

/* -------------------------------------------------------------------------- */
/* Fixed entity → slot assignments                                            */
/* -------------------------------------------------------------------------- */

/**
 * Color follows the entity, never its rank — so a filter that drops a category
 * must not repaint the survivors. These maps are the single source of truth.
 */
const EXPENSE_SLOT: Record<ExpenseCategory, number> = {
  Rent: 0,
  Food: 1,
  Travel: 2,
  Shopping: 3,
  EMI: 4,
  Investments: 5,
  Medical: 6,
  Entertainment: 7,
  Other: -1, // neutral by design — the documented ninth-series fold
}

export function categoryColor(category: string, mode: Mode): string {
  const slot = EXPENSE_SLOT[category as ExpenseCategory]
  return slot === undefined ? NEUTRAL_SERIES[mode] : seriesColor(slot, mode)
}

const INVESTMENT_SLOT: Record<InvestmentType, number> = {
  SIP: 0,
  'Mutual Fund': 2,
  Stock: 6,
  Gold: 3,
  'Fixed Deposit': 1,
  PPF: 5,
  NPS: 4,
  Other: -1,
}

export function investmentColor(type: string, mode: Mode): string {
  const slot = INVESTMENT_SLOT[type as InvestmentType]
  return slot === undefined ? NEUTRAL_SERIES[mode] : seriesColor(slot, mode)
}

/* -------------------------------------------------------------------------- */
/* Semantic roles                                                             */
/* -------------------------------------------------------------------------- */

/** Income vs expense: blue (slot 1) vs orange (slot 2) — never green/red, which
 *  are reserved for status. Direction is carried by the axis and the label. */
export const FLOW_COLORS: Record<Mode, { income: string; expense: string; net: string }> = {
  light: { income: '#2a78d6', expense: '#eb6834', net: '#4a3aa7' },
  dark: { income: '#3987e5', expense: '#d95926', net: '#9085e9' },
}

/** Status palette — fixed across themes, always shipped with an icon + label. */
export const STATUS_COLORS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const

export type StatusTone = keyof typeof STATUS_COLORS

/** Sequential blue ramp (light → dark), for magnitude encodings. */
export const SEQUENTIAL_BLUE = [
  '#cde2fb',
  '#b7d3f6',
  '#9ec5f4',
  '#86b6ef',
  '#6da7ec',
  '#5598e7',
  '#3987e5',
  '#2a78d6',
  '#256abf',
  '#1c5cab',
  '#184f95',
  '#104281',
  '#0d366b',
] as const

/* -------------------------------------------------------------------------- */
/* Chart chrome                                                               */
/* -------------------------------------------------------------------------- */

export interface ChartTheme {
  mode: Mode
  surface: string
  grid: string
  axis: string
  tick: string
  label: string
  ink: string
  /** Gap/ring color used to separate touching marks — always the surface. */
  gap: string
}

export function chartTheme(mode: Mode): ChartTheme {
  return mode === 'dark'
    ? {
        mode,
        surface: '#12151c',
        grid: '#222733',
        axis: '#2e3440',
        tick: '#78818f',
        label: '#a8b1c1',
        ink: '#f5f7fa',
        gap: '#12151c',
      }
    : {
        mode,
        surface: '#ffffff',
        grid: '#e8eaee',
        axis: '#c9cdd6',
        tick: '#7d8695',
        label: '#4a5261',
        ink: '#0b0f19',
        gap: '#ffffff',
      }
}
