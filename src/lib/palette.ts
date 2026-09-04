/**
 * Chart palette.
 *
 * The validated categorical slots from the data-viz method, stepped once for
 * the light surface (#ffffff) and once for the dark surface (#12151c). Both
 * sets pass the lightness band, chroma floor, colour-blind separation and
 * normal-vision floor checks.
 *
 * This app plots very little — a score line per bureau — so only the first few
 * slots see use, but the set stays intact so anything added later inherits the
 * same guarantees.
 */

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

/** Fixed per bureau, so a line never changes colour between renders. */
export const BUREAU_SLOT = { Equifax: 0, TransUnion: 6 } as const

/** Status palette — fixed across themes, always shipped with an icon + label. */
export const STATUS_COLORS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const

export type StatusTone = keyof typeof STATUS_COLORS

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
  /** Gap/ring colour used to separate touching marks — always the surface. */
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
