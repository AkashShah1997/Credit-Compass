/**
 * Application store.
 *
 * A reducer behind two contexts: one for state, one for the (stable) action
 * bag. Splitting them means components that only dispatch never re-render when
 * unrelated state changes. Persistence is a debounced write through
 * `repository`, so the whole app stays unaware of where data lives.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AppState, CreditAccount, CreditInquiry, CreditScoreEntry, Debt, Settings } from '../types'
import { emptyState, repository } from '../lib/storage'
import { uid } from '../lib/id'

type Action =
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'account/add'; account: CreditAccount }
  | { type: 'account/update'; id: string; patch: Partial<CreditAccount> }
  | { type: 'account/remove'; id: string }
  | { type: 'debt/add'; debt: Debt }
  | { type: 'debt/update'; id: string; patch: Partial<Debt> }
  | { type: 'debt/remove'; id: string }
  | { type: 'score/add'; entry: CreditScoreEntry }
  | { type: 'score/update'; id: string; patch: Partial<CreditScoreEntry> }
  | { type: 'score/remove'; id: string }
  | { type: 'inquiry/add'; inquiry: CreditInquiry }
  | { type: 'inquiry/remove'; id: string }
  | { type: 'alert/dismiss'; id: string }
  | { type: 'alert/restoreAll' }
  | { type: 'system/replace'; state: AppState }

const patchById = <T extends { id: string }>(list: T[], id: string, patch: Partial<T>): T[] =>
  list.map((item) => (item.id === id ? { ...item, ...patch } : item))

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'system/replace':
      return action.state

    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.patch } }

    case 'account/add':
      return { ...state, accounts: [...state.accounts, action.account] }
    case 'account/update':
      return { ...state, accounts: patchById(state.accounts, action.id, action.patch) }
    case 'account/remove':
      return { ...state, accounts: state.accounts.filter((a) => a.id !== action.id) }

    case 'debt/add':
      return { ...state, debts: [...state.debts, action.debt] }
    case 'debt/update':
      return { ...state, debts: patchById(state.debts, action.id, action.patch) }
    case 'debt/remove':
      return { ...state, debts: state.debts.filter((d) => d.id !== action.id) }

    case 'score/add':
      return { ...state, creditScores: [...state.creditScores, action.entry] }
    case 'score/update':
      return { ...state, creditScores: patchById(state.creditScores, action.id, action.patch) }
    case 'score/remove':
      return { ...state, creditScores: state.creditScores.filter((s) => s.id !== action.id) }

    case 'inquiry/add':
      return { ...state, inquiries: [...state.inquiries, action.inquiry] }
    case 'inquiry/remove':
      return { ...state, inquiries: state.inquiries.filter((i) => i.id !== action.id) }

    case 'alert/dismiss':
      return state.dismissedAlerts.includes(action.id)
        ? state
        : { ...state, dismissedAlerts: [...state.dismissedAlerts, action.id] }
    case 'alert/restoreAll':
      return { ...state, dismissedAlerts: [] }

    default:
      return state
  }
}

export interface AppActions {
  updateSettings: (patch: Partial<Settings>) => void

  addAccount: (input: Omit<CreditAccount, 'id'>) => void
  updateAccount: (id: string, patch: Partial<CreditAccount>) => void
  removeAccount: (id: string) => void

  addDebt: (input: Omit<Debt, 'id'>) => void
  updateDebt: (id: string, patch: Partial<Debt>) => void
  removeDebt: (id: string) => void

  addScore: (input: Omit<CreditScoreEntry, 'id'>) => void
  updateScore: (id: string, patch: Partial<CreditScoreEntry>) => void
  removeScore: (id: string) => void

  addInquiry: (input: Omit<CreditInquiry, 'id'>) => void
  removeInquiry: (id: string) => void

  dismissAlert: (id: string) => void
  restoreAlerts: () => void

  /** Used by the backup restore and the "load example" button. */
  replaceState: (state: AppState) => void
  resetAll: () => void
}

const StateContext = createContext<AppState | null>(null)
const ActionsContext = createContext<AppActions | null>(null)

export function AppStoreProvider({ children }: { children: ReactNode }) {
  // Local storage is synchronous, so hydrate during the first render and skip
  // the loading flash entirely.
  const [initial] = useState<AppState>(() => repository.loadSync?.() ?? emptyState())
  const [state, dispatch] = useReducer(reducer, initial)
  const [ready, setReady] = useState(() => Boolean(repository.loadSync))

  useEffect(() => {
    if (ready) return
    let cancelled = false
    repository.load().then((loaded) => {
      if (cancelled) return
      if (loaded) dispatch({ type: 'system/replace', state: loaded })
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [ready])

  // Debounced persistence — typing in a form shouldn't hit storage per keystroke.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    if (!ready) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void repository.save(state), 250)
    return () => clearTimeout(timer.current)
  }, [state, ready])

  const actions = useMemo<AppActions>(
    () => ({
      updateSettings: (patch) => dispatch({ type: 'settings/update', patch }),

      addAccount: (input) => dispatch({ type: 'account/add', account: { ...input, id: uid('acct') } }),
      updateAccount: (id, patch) => dispatch({ type: 'account/update', id, patch }),
      removeAccount: (id) => dispatch({ type: 'account/remove', id }),

      addDebt: (input) => dispatch({ type: 'debt/add', debt: { ...input, id: uid('debt') } }),
      updateDebt: (id, patch) => dispatch({ type: 'debt/update', id, patch }),
      removeDebt: (id) => dispatch({ type: 'debt/remove', id }),

      addScore: (input) => dispatch({ type: 'score/add', entry: { ...input, id: uid('score') } }),
      updateScore: (id, patch) => dispatch({ type: 'score/update', id, patch }),
      removeScore: (id) => dispatch({ type: 'score/remove', id }),

      addInquiry: (input) => dispatch({ type: 'inquiry/add', inquiry: { ...input, id: uid('inq') } }),
      removeInquiry: (id) => dispatch({ type: 'inquiry/remove', id }),

      dismissAlert: (id) => dispatch({ type: 'alert/dismiss', id }),
      restoreAlerts: () => dispatch({ type: 'alert/restoreAll' }),

      replaceState: (next) => dispatch({ type: 'system/replace', state: next }),
      resetAll: () => dispatch({ type: 'system/replace', state: emptyState() }),
    }),
    [],
  )

  return (
    <StateContext.Provider value={state}>
      <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
    </StateContext.Provider>
  )
}

export function useAppState(): AppState {
  const state = useContext(StateContext)
  if (!state) throw new Error('useAppState must be used inside <AppStoreProvider>')
  return state
}

export function useActions(): AppActions {
  const actions = useContext(ActionsContext)
  if (!actions) throw new Error('useActions must be used inside <AppStoreProvider>')
  return actions
}
