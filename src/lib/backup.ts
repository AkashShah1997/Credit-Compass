/**
 * Backup files — the only way data moves in or out of this app.
 *
 * Nothing is uploaded anywhere. "Download" writes a JSON file straight from
 * memory to your disk with the browser's own save dialog; "Restore" reads a
 * file you pick with `FileReader`. Both are entirely local: no network call is
 * involved at any point, which is what makes it safe to keep real figures here.
 *
 * The format is deliberately plain and readable — you can open the file in any
 * text editor, see exactly what is in it, and hand-edit it if you ever want to.
 */

import type { AppState, BackupFile } from '../types'
import { APP_NAME, FILE_PREFIX } from './brand'
import { STATE_VERSION, migrate } from './storage'
import { todayISO } from './date'

/** What a fresh export looks like. */
export function toBackup(state: AppState): BackupFile {
  return {
    app: APP_NAME,
    version: STATE_VERSION,
    exportedAt: new Date().toISOString(),
    state,
  }
}

export function serializeBackup(state: AppState): string {
  return JSON.stringify(toBackup(state), null, 2)
}

/** `CreditCompass-backup-2026-09-03.json` — dated so successive backups sort. */
export function backupFilename(today = todayISO()): string {
  return `${FILE_PREFIX}-backup-${today}.json`
}

/**
 * Save the workspace to a file. Uses an object URL and a synthetic click, which
 * is the one approach every browser honours without a permission prompt.
 */
export function downloadBackup(state: AppState): string {
  const filename = backupFilename()
  const blob = new Blob([serializeBackup(state)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoked on a later tick, not synchronously: Safari cancels an in-flight
  // download the moment its object URL disappears.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return filename
}

export class BackupError extends Error {}

/**
 * Read a backup back in.
 *
 * Accepts both the wrapped `{ app, version, exportedAt, state }` shape and a
 * bare `AppState`, so a file hand-edited down to just the state still loads.
 * Everything then passes through `migrate()`, which fills in anything a older
 * or hand-written file is missing rather than letting a half-formed object
 * reach the pages.
 */
export function parseBackup(text: string): AppState {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('That file is not valid JSON. Pick the .json file this app exported.')
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BackupError('That file does not contain a workspace.')
  }

  const wrapper = raw as Partial<BackupFile>
  const candidate = wrapper.state && typeof wrapper.state === 'object' ? wrapper.state : (raw as AppState)

  const migrated = migrate(candidate)
  if (!migrated) {
    throw new BackupError(`That does not look like a ${APP_NAME} backup.`)
  }
  return migrated
}

/** Read a `File` from an `<input type="file">` and parse it. */
export async function readBackupFile(file: File): Promise<AppState> {
  let text: string
  try {
    text = await file.text()
  } catch {
    throw new BackupError(`Could not read “${file.name}”.`)
  }
  return parseBackup(text)
}

/** A one-line summary of what a file holds, for the confirm-before-replace step. */
export function describeState(state: AppState): string {
  const parts: string[] = []
  if (state.accounts.length) parts.push(`${state.accounts.length} account${state.accounts.length === 1 ? '' : 's'}`)
  if (state.debts.length) parts.push(`${state.debts.length} loan${state.debts.length === 1 ? '' : 's'}`)
  if (state.creditScores.length) parts.push(`${state.creditScores.length} score reading${state.creditScores.length === 1 ? '' : 's'}`)
  if (state.inquiries.length) parts.push(`${state.inquiries.length} inquir${state.inquiries.length === 1 ? 'y' : 'ies'}`)
  if (!parts.length) return 'no records'
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}
