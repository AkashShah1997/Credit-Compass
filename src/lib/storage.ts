/**
 * Persistence.
 *
 * The browser's local storage, and nothing else. No account, no sync, no
 * server — which is the point: real credit figures never leave the machine
 * they were typed on. The trade-off is that clearing site data wipes the
 * workspace, so `lib/backup.ts` exists to move it to a file you own.
 */

import type { AppState, Settings } from '../types'
import { STORAGE_NAMESPACE } from './brand'

export const STORAGE_KEY = `${STORAGE_NAMESPACE}.state.v2`
export const THEME_KEY = `${STORAGE_NAMESPACE}.theme`
export const STATE_VERSION = 2

export interface Repository {
  /** Immediate read, when the backing store supports it. */
  loadSync?(): AppState | null
  load(): Promise<AppState | null>
  save(state: AppState): Promise<void>
  clear(): Promise<void>
}

function isStorageAvailable(): boolean {
  try {
    const probe = '__cc_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

export function defaultSettings(): Settings {
  return {
    // The bottom of Equifax Canada's "excellent" band — where the best rates start.
    scoreGoal: 760,
    missedPaymentLast2Years: false,
    reminderLeadDays: 5,
    theme: 'system',
  }
}

export function emptyState(): AppState {
  return {
    version: STATE_VERSION,
    settings: defaultSettings(),
    accounts: [],
    debts: [],
    creditScores: [],
    inquiries: [],
    dismissedAlerts: [],
  }
}

const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

/**
 * Fill in anything a stored or imported payload is missing.
 *
 * Returns null only when the object is not a workspace at all. Anything that
 * has the right shape is accepted and completed from defaults, so a backup
 * written by an older build — or hand-edited — still opens.
 */
export function migrate(raw: unknown): AppState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const input = raw as Partial<AppState>

  // The one structural requirement: it has to carry at least one of the
  // collections this app is built around.
  const looksRight =
    Array.isArray(input.accounts) ||
    Array.isArray(input.debts) ||
    Array.isArray(input.creditScores) ||
    Array.isArray(input.inquiries)
  if (!looksRight) return null

  return {
    version: STATE_VERSION,
    settings: { ...defaultSettings(), ...(input.settings ?? {}) },
    accounts: asArray(input.accounts),
    debts: asArray(input.debts),
    creditScores: asArray(input.creditScores),
    inquiries: asArray(input.inquiries),
    dismissedAlerts: asArray<string>(input.dismissedAlerts),
  }
}

class LocalStorageRepository implements Repository {
  private memory: AppState | null = null
  private available = isStorageAvailable()

  loadSync(): AppState | null {
    if (!this.available) return this.memory
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
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

export const repository: Repository = new LocalStorageRepository()

/** Whether the browser will actually keep what we save — surfaced in Settings. */
export function storageWorks(): boolean {
  return isStorageAvailable()
}
