import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { uid } from '../../lib/id'

type ToastTone = 'success' | 'info' | 'warning'

interface Toast {
  id: string
  tone: ToastTone
  message: string
  action?: { label: string; onClick: () => void }
}

interface ToastApi {
  show: (message: string, options?: { tone?: ToastTone; action?: Toast['action'] }) => void
  success: (message: string, action?: Toast['action']) => void
  warn: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const ICONS = { success: CheckCircle2, info: Info, warning: AlertTriangle } as const
const TONE_CLASS: Record<ToastTone, string> = {
  success: 'text-good',
  info: 'text-brand',
  warning: 'text-warning',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const show = useCallback<ToastApi['show']>(
    (message, options) => {
      const toast: Toast = { id: uid('toast'), tone: options?.tone ?? 'info', message, action: options?.action }
      setToasts((list) => [...list.slice(-2), toast])
      timers.current.set(
        toast.id,
        setTimeout(() => dismiss(toast.id), toast.action ? 7000 : 4000),
      )
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message, action) => show(message, { tone: 'success', action }),
      warn: (message) => show(message, { tone: 'warning' }),
    }),
    [show],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:items-end"
          role="status"
          aria-live="polite"
        >
          {toasts.map((toast) => {
            const Icon = ICONS[toast.tone]
            return (
              <div
                key={toast.id}
                className="pointer-events-auto flex w-full max-w-sm animate-pop-in items-start gap-3 rounded-xl border border-hairline bg-surface px-3.5 py-3 shadow-pop"
              >
                <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', TONE_CLASS[toast.tone])} aria-hidden="true" />
                <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink">{toast.message}</p>
                {toast.action ? (
                  <button
                    type="button"
                    onClick={() => {
                      toast.action?.onClick()
                      dismiss(toast.id)
                    }}
                    className="shrink-0 text-[13px] font-medium text-brand hover:underline"
                  >
                    {toast.action.label}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  aria-label="Dismiss"
                  className="-mr-1 shrink-0 rounded p-0.5 text-muted transition-colors hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside <ToastProvider>')
  return api
}
