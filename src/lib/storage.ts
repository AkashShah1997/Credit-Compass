/**
 * Persistence layer.
 *
 * Feature code never touches `localStorage` directly — it goes through
 * `FinanceRepository`. The interface is async so that swapping in an HTTP or
 * IndexedDB implementation later is a one-line change in `repository`, with no
 * edits anywhere else. `loadSync` is an optional fast path that local storage
 * can honour (and a network backend simply won't), letting the app hydrate
 * without a loading flash today while staying correct tomorrow.
 */

import type { AppState } from '../types'
import { buildSeedState } from './seed'
import { APP_NAME, STORAGE_NAMESPACE } from './brand'

export const STORAGE_KEY = `${STORAGE_NAMESPACE}.state.v1`
export const THEME_KEY = `${STORAGE_NAMESPACE}.theme`
export const STATE_VERSION = 1

/** The key used before the rename — read as a fallback so nobody loses a workspace. */
const LEGACY_STORAGE_KEY = 'moneyflow.state.v1'

export interface FinanceRepository {
  /** Immediate read, when the backing store supports it. */
  loadSync?(): AppState | null
  load(): Promise<AppState | null>
  save(state: AppState): Promise<void>
  clear(): Promise<void>
}

function isStorageAvailable(): boolean {
  try {
    const probe = '__mf_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/**
 * Fill in anything a stored payload is missing. Older snapshots (and hand-edited
 * imports) shouldn't crash the app just because a field was added since.
 */
export function migrate(raw: unknown): AppState | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Partial<AppState>
  const base = buildSeedState()

  const state: AppState = {
    version: STATE_VERSION,
    settings: { ...base.settings, ...(input.settings ?? {}) },
    transactions: Array.isArray(input.transactions) ? input.transactions : [],
    budgets: input.budgets && typeof input.budgets === 'object' ? input.budgets : {},
    goals: Array.isArray(input.goals) ? input.goals : [],
    investments: Array.isArray(input.investments) ? input.investments : [],
    loans: Array.isArray(input.loans) ? input.loans : [],
    cards: Array.isArray(input.cards) ? input.cards : [],
    assets: Array.isArray(input.assets) ? input.assets : [],
    liabilities: Array.isArray(input.liabilities) ? input.liabilities : [],
    creditScores: Array.isArray(input.creditScores) ? input.creditScores : [],
    inquiries: Array.isArray(input.inquiries) ? input.inquiries : [],
    dismissedAlerts: Array.isArray(input.dismissedAlerts) ? input.dismissedAlerts : [],
  }

  // Goals gained a contributions log after v0; backfill so the UI can map it.
  state.goals = state.goals.map((g) => ({ ...g, contributions: g.contributions ?? [] }))
  state.investments = state.investments.map((i) => ({ ...i, history: i.history ?? [] }))

  return state
}

class LocalStorageRepository implements FinanceRepository {
  private memory: AppState | null = null
  private available = isStorageAvailable()

  loadSync(): AppState | null {
    if (!this.available) return this.memory
    try {
      const raw =
        window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY)
      if (!raw) return null
      return migrate(JSON.parse(raw))
    } catch {
      // Corrupt payload — better to start clean than to wedge the app.
      return null
    }
  }

  async load(): Promise<AppState | null> {
    return this.loadSync()
  }

  async save(state: AppState): Promise<void> {
    this.memory = state
    if (!this.available) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Quota exceeded or private-mode write block: keep running in memory.
      this.available = false
    }
  }

  async clear(): Promise<void> {
    this.memory = null
    if (!this.available) return
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* nothing useful to do */
    }
  }
}

export const repository: FinanceRepository = new LocalStorageRepository()

/* -------------------------------------------------------------------------- */
/* Import / export of the whole workspace                                     */
/* -------------------------------------------------------------------------- */

export function serializeState(state: AppState): string {
  return JSON.stringify(state, null, 2)
}

export function deserializeState(json: string): AppState {
  const parsed = migrate(JSON.parse(json))
  if (!parsed) throw new Error(`That file does not look like a ${APP_NAME} backup.`)
  return parsed
}
