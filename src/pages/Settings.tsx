/**
 * Settings — your goal, your data, and the truth about where it lives.
 *
 * The backup card is first and largest on purpose. Everything is held in this
 * browser's local storage and nowhere else, which is what makes it safe to put
 * real figures in; the cost is that clearing site data wipes it. A file you own
 * is the answer to that, so it is the most important control on the page.
 */

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  AlertTriangle,
  BookOpen,
  Database,
  Download,
  FileJson,
  Gauge,
  HardDriveDownload,
  Lock,
  Monitor,
  Moon,
  Sparkles,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react'
import type { AppState, ThemePreference } from '../types'
import { useActions, useAppState } from '../store/AppStore'
import { useTheme } from '../store/ThemeProvider'
import { BackupError, backupFilename, describeState, downloadBackup, readBackupFile, serializeBackup } from '../lib/backup'
import { buildExampleState } from '../lib/seed'
import { storageWorks } from '../lib/storage'
import { monthStartISO, todayISO } from '../lib/date'
import { APP_NAME } from '../lib/brand'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Field, Switch, TextInput } from '../components/ui/Field'
import { Segmented } from '../components/ui/Tabs'
import { Badge, StatusBadge } from '../components/ui/Badge'
import { ConfirmDialog } from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'

type Dialog =
  | { kind: 'restore'; state: AppState; filename: string }
  | { kind: 'example' }
  | { kind: 'reset' }

export default function Settings() {
  const state = useAppState()
  const { updateSettings, replaceState, resetAll } = useActions()
  const toast = useToast()

  const [dialog, setDialog] = useState<Dialog | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const storageAvailable = useMemo(() => storageWorks(), [])
  const backupSize = useMemo(() => new Blob([serializeBackup(state)]).size, [state])

  function handleDownload() {
    const filename = downloadBackup(state)
    toast.success(`Saved ${filename} to your downloads.`)
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Clearing the value lets the same file be picked twice; otherwise the
    // input keeps its value and `change` never fires again.
    event.target.value = ''
    if (!file) return
    try {
      const restored = await readBackupFile(file)
      setDialog({ kind: 'restore', state: restored, filename: file.name })
    } catch (error) {
      toast.warn(error instanceof BackupError ? error.message : `Could not read “${file.name}”.`)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" subtitle="Your goal, your data, and how this app handles it." />

      {/* Backup ------------------------------------------------------------ */}
      <Card>
        <CardHeader
          title="Your data file"
          subtitle="Download it to keep, upload it to load it back. Nothing is ever sent anywhere."
          icon={<HardDriveDownload className="h-4 w-4" />}
          action={<Badge tone="neutral">{formatBytes(backupSize)}</Badge>}
        />

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface-2 p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
              <Download className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[13.5px] font-semibold text-ink">Download a copy</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                Writes <span className="font-medium text-ink-secondary">{backupFilename()}</span> straight to your
                downloads folder. It holds {describeState(state)} — plain, readable JSON you can open in any text
                editor.
              </p>
            </div>
            <Button className="mt-auto" variant="primary" icon={<Download className="h-4 w-4" />} onClick={handleDownload}>
              Download my data
            </Button>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface-2 p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
              <Upload className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[13.5px] font-semibold text-ink">Load a file back</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                Pick a file you downloaded before. It replaces whatever is in the app right now — you get a summary
                and a confirm step first, so nothing happens by accident.
              </p>
            </div>
            <Button className="mt-auto" icon={<Upload className="h-4 w-4" />} onClick={() => fileInput.current?.click()}>
              Choose a file
            </Button>
            {/* Hidden on purpose — the native file button cannot be styled to match. */}
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => void handleFile(event)}
            />
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-hairline px-3.5 py-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          <p className="text-[12.5px] leading-relaxed text-ink-secondary">
            <strong className="font-medium text-ink">Nothing leaves this browser.</strong> There is no account, no
            server and no analytics — the app makes no network call with your data at any point. Download and upload
            move the file between this page and your own disk, nowhere else. The flip side: clearing site data,
            using a private window, or opening the app on another device gives you an empty workspace. The file is
            how you move between them.
          </p>
        </div>

        {!storageAvailable ? (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-critical/30 bg-critical-soft px-3.5 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-critical" aria-hidden="true" />
            <p className="text-[12.5px] leading-relaxed text-ink-secondary">
              <strong className="font-medium text-ink">This browser is not saving anything.</strong> Local storage is
              blocked — likely a private window or a privacy setting. The app works, but everything disappears when
              you close the tab. Download your file before you do.
            </p>
          </div>
        ) : null}
      </Card>

      {/* Goal & profile ---------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Your target"
            subtitle="What the credit page measures you against"
            icon={<Gauge className="h-4 w-4" />}
          />
          <div className="mt-4 flex flex-col gap-4">
            <NumberSetting
              label="Score goal"
              min={300}
              max={900}
              step={5}
              value={state.settings.scoreGoal}
              hint="760 and up is “excellent” at both Equifax and TransUnion, and where the best lending rates start."
              onCommit={(next) => {
                updateSettings({ scoreGoal: next })
                toast.success(`Goal set to ${next}.`)
              }}
            />

            <Field
              label="When did you start building credit in Canada?"
              hint="Your first card or loan here. Length of history is about 15% of the score — this is how the app knows whether that is what is holding you back."
            >
              {(id) => (
                <TextInput
                  id={id}
                  type="month"
                  max={todayISO().slice(0, 7)}
                  value={state.settings.creditHistoryStart?.slice(0, 7) ?? ''}
                  onChange={(event) =>
                    updateSettings({
                      creditHistoryStart: event.target.value ? monthStartISO(event.target.value) : undefined,
                    })
                  }
                />
              )}
            </Field>

            <div className="rounded-xl border border-hairline bg-surface-2 px-3.5 py-3">
              <Switch
                checked={state.settings.missedPaymentLast2Years}
                onChange={(next) => {
                  updateSettings({ missedPaymentLast2Years: next })
                  toast.success(next ? 'Noted — the advice accounts for it.' : 'Good. Payment history stays clean.')
                }}
                label="I have missed a payment in the last 2 years"
                description="Asked once instead of tracking every bill. A payment reported 30+ days late is the most damaging single thing on a file."
              />
            </div>

            <NumberSetting
              label="Remind me this many days before a statement closes"
              min={1}
              max={15}
              step={1}
              value={state.settings.reminderLeadDays}
              hint="How early the bell icon warns you that a balance is about to be reported."
              onCommit={(next) => {
                updateSettings({ reminderLeadDays: next })
                toast.success(`Reminders now start ${next} day${next === 1 ? '' : 's'} ahead.`)
              }}
            />
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <AppearanceCard />

          <Card>
            <CardHeader
              title="Start over"
              subtitle="Load the example, or clear everything out"
              icon={<Database className="h-4 w-4" />}
            />
            <div className="mt-4 flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-2 px-3.5 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink">Load the example</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                    A worked-through file — one card at 61%, a car loan ten months old — so you can see every panel
                    populated.
                  </p>
                </div>
                <Button size="sm" icon={<Sparkles className="h-4 w-4" />} onClick={() => setDialog({ kind: 'example' })}>
                  Load
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-2 px-3.5 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink">Clear everything</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                    Wipes the workspace and starts fresh. Download your file first if you might want it back.
                  </p>
                </div>
                <Button size="sm" variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDialog({ kind: 'reset' })}>
                  Clear
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <AboutCard />

      {/* Dialogs ----------------------------------------------------------- */}
      <ConfirmDialog
        open={dialog?.kind === 'restore'}
        title="Load this file?"
        confirmLabel="Load it"
        message={
          dialog?.kind === 'restore' ? (
            <>
              <strong className="font-medium text-ink">{dialog.filename}</strong> holds{' '}
              {describeState(dialog.state)}. Loading it replaces what is in the app right now —{' '}
              {describeState(state)} — and that cannot be undone.
            </>
          ) : (
            ''
          )
        }
        onConfirm={() => {
          if (dialog?.kind !== 'restore') return
          replaceState(dialog.state)
          toast.success(`Loaded ${describeState(dialog.state)}.`)
          setDialog(null)
        }}
        onCancel={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog?.kind === 'example'}
        title="Load the example workspace?"
        confirmLabel="Load example"
        message="Your current workspace is replaced with a worked-through example. Download your own file first if you want to keep it."
        onConfirm={() => {
          replaceState(buildExampleState())
          toast.success('Example loaded.')
          setDialog(null)
        }}
        onCancel={() => setDialog(null)}
      />

      <ConfirmDialog
        open={dialog?.kind === 'reset'}
        title="Clear everything?"
        confirmLabel="Clear it all"
        message="Every account, loan, score reading and inquiry is erased and you start from an empty setup. This cannot be undone."
        onConfirm={() => {
          resetAll()
          toast.success('Cleared. Set up again whenever you like.')
          setDialog(null)
        }}
        onCancel={() => setDialog(null)}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Appearance                                                                 */
/* -------------------------------------------------------------------------- */

function AppearanceCard() {
  const { preference, mode, setPreference } = useTheme()
  const toast = useToast()

  const options: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: 'Light', icon: <Sun className="h-4 w-4" /> },
    { value: 'dark', label: 'Dark', icon: <Moon className="h-4 w-4" /> },
    { value: 'system', label: 'System', icon: <Monitor className="h-4 w-4" /> },
  ]

  return (
    <Card>
      <CardHeader title="Appearance" subtitle="Light, dark, or whatever your device is doing" icon={<Sun className="h-4 w-4" />} />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Segmented
          ariaLabel="Theme"
          options={options}
          value={preference}
          onChange={(next) => {
            if (next === preference) return
            setPreference(next)
            toast.success(next === 'system' ? 'Following your device.' : `Switched to ${next}.`)
          }}
        />
        <Badge tone="neutral" icon={mode === 'dark' ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}>
          Showing {mode}
        </Badge>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* About                                                                      */
/* -------------------------------------------------------------------------- */

function AboutCard() {
  return (
    <Card>
      <CardHeader title={`About ${APP_NAME}`} subtitle="What it does and what it does not" icon={<BookOpen className="h-4 w-4" />} />
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
            <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
            What it does
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-secondary">
            Tracks your credit score over time, works out utilization on every card against the 30% and 10% lines
            bureaus reward, counts down hard inquiries, and turns all of it into an ordered list of what to actually
            do — with the dollar figures and dates from your own accounts.
          </p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
            <FileJson className="h-3.5 w-3.5" aria-hidden="true" />
            What it is not
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-secondary">
            It does not connect to a bureau — no Canadian bureau offers a consumer API, so you type in the score you
            already see free on Borrowell, Credit Karma or your bank app. It is general information about how
            scoring works, not either bureau’s formula, and not financial advice.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusBadge status="good">No account needed</StatusBadge>
        <StatusBadge status="good">No data leaves your browser</StatusBadge>
        <StatusBadge status="good">No tracking</StatusBadge>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Shared                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Number field that commits on blur. Out-of-range input is shown as an error
 * and never written — clamping silently would hide a typo rather than flag it.
 */
function NumberSetting({
  label,
  hint,
  min,
  max,
  step,
  value,
  onCommit,
}: {
  label: string
  hint: string
  min: number
  max: number
  step: number
  value: number
  onCommit: (next: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  const parsed = Number(draft)
  const invalid = draft.trim() === '' || !Number.isFinite(parsed) || parsed < min || parsed > max

  return (
    <Field
      label={label}
      hint={hint}
      error={invalid ? `Enter a number between ${min} and ${max}.` : undefined}
    >
      {(id) => (
        <TextInput
          id={id}
          type="number"
          inputMode="numeric"
          className="tabular"
          min={min}
          max={max}
          step={step}
          value={draft}
          invalid={invalid}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (!invalid && parsed !== value) onCommit(parsed)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
      )}
    </Field>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
