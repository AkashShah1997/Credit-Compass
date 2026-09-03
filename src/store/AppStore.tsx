/**
 * Application store.
 *
 * A reducer behind two contexts: one for state, one for the (stable) action
 * bag. Splitting them means components that only dispatch never re-render when
 * unrelated state changes. Persistence is a debounced write through
 * `repository`, so swapping local storage for an API touches one file.
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
import type {
  AppState,
  Asset,
  BudgetLimits,
  CreditCard,
  ExpenseCategory,
  Investment,
  Liability,
  Loan,
  SavingsGoal,
  Settings,
  Transaction,
} from '../types'
import { repository } from '../lib/storage'
import { buildEmptyState, buildSeedState } from '../lib/seed'
import { uid } from '../lib/id'
import { currentMonthKey, monthKey, todayISO } from '../lib/date'
import { amortisationSchedule } from '../lib/finance'

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

type Action =
  | { type: 'hydrate'; state: AppState }
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'txn/add'; transaction: Transaction }
  | { type: 'txn/update'; id: string; patch: Partial<Transaction> }
  | { type: 'txn/remove'; ids: string[] }
  | { type: 'budget/set'; month: string; category: ExpenseCategory; limit: number }
  | { type: 'budget/setMany'; month: string; limits: BudgetLimits }
  | { type: 'budget/clearMonth'; month: string }
  | { type: 'goal/add'; goal: SavingsGoal }
  | { type: 'goal/update'; id: string; patch: Partial<SavingsGoal> }
  | { type: 'goal/remove'; id: string }
  | { type: 'goal/contribute'; id: string; amount: number; date: string; note?: string }
  | { type: 'goal/removeContribution'; goalId: string; contributionId: string }
  | { type: 'investment/add'; investment: Investment }
  | { type: 'investment/update'; id: string; patch: Partial<Investment> }
  | { type: 'investment/remove'; id: string }
  | { type: 'loan/add'; loan: Loan }
  | { type: 'loan/update'; id: string; patch: Partial<Loan> }
  | { type: 'loan/remove'; id: string }
  | { type: 'loan/payEmi'; id: string }
  | { type: 'card/add'; card: CreditCard }
  | { type: 'card/update'; id: string; patch: Partial<CreditCard> }
  | { type: 'card/remove'; id: string }
  | { type: 'card/markPaid'; id: string; month: string }
  | { type: 'asset/add'; asset: Asset }
  | { type: 'asset/update'; id: string; patch: Partial<Asset> }
  | { type: 'asset/remove'; id: string }
  | { type: 'liability/add'; liability: Liability }
  | { type: 'liability/update'; id: string; patch: Partial<Liability> }
  | { type: 'liability/remove'; id: string }
  | { type: 'alert/dismiss'; id: string }
  | { type: 'alert/restoreAll' }
  | { type: 'system/replace'; state: AppState }

const patchById = <T extends { id: string }>(list: T[], id: string, patch: Partial<T>): T[] =>
  list.map((item) => (item.id === id ? { ...item, ...patch } : item))

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
    case 'system/replace':
      return action.state

    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.patch } }

    case 'txn/add':
      return { ...state, transactions: [action.transaction, ...state.transactions] }

    case 'txn/update':
      return { ...state, transactions: patchById(state.transactions, action.id, action.patch) }

    case 'txn/remove': {
      const ids = new Set(action.ids)
      return { ...state, transactions: state.transactions.filter((t) => !ids.has(t.id)) }
    }

    case 'budget/set': {
      const existing = state.budgets[action.month] ?? {}
      const next: BudgetLimits = { ...existing }
      if (action.limit > 0) next[action.category] = action.limit
      else delete next[action.category]
      return { ...state, budgets: { ...state.budgets, [action.month]: next } }
    }

    case 'budget/setMany':
      return { ...state, budgets: { ...state.budgets, [action.month]: { ...action.limits } } }

    case 'budget/clearMonth': {
      // Removing a month override falls the month back to the default plan.
      const next = { ...state.budgets }
      delete next[action.month]
      return { ...state, budgets: next }
    }

    case 'goal/add':
      return { ...state, goals: [...state.goals, action.goal] }

    case 'goal/update': {
      // Only one goal can be the emergency fund; promoting one demotes the rest.
      const clearsOthers = action.patch.isEmergencyFund === true
      const goals = state.goals.map((g) => {
        if (g.id === action.id) return { ...g, ...action.patch }
        return clearsOthers && g.isEmergencyFund ? { ...g, isEmergencyFund: false } : g
      })
      return { ...state, goals }
    }

    case 'goal/remove':
      return { ...state, goals: state.goals.filter((g) => g.id !== action.id) }

    case 'goal/contribute':
      return {
        ...state,
        goals: state.goals.map((g) =>
          g.id === action.id
            ? {
                ...g,
                // Withdrawals are negative contributions; never go below zero.
                saved: Math.max(0, g.saved + action.amount),
                contributions: [
                  ...g.contributions,
                  { id: uid('con'), date: action.date, amount: action.amount, note: action.note },
                ],
              }
            : g,
        ),
      }

    case 'goal/removeContribution':
      return {
        ...state,
        goals: state.goals.map((g) => {
          if (g.id !== action.goalId) return g
          const target = g.contributions.find((c) => c.id === action.contributionId)
          if (!target) return g
          return {
            ...g,
            saved: Math.max(0, g.saved - target.amount),
            contributions: g.contributions.filter((c) => c.id !== action.contributionId),
          }
        }),
      }

    case 'investment/add':
      return { ...state, investments: [...state.investments, action.investment] }

    case 'investment/update':
      return { ...state, investments: patchById(state.investments, action.id, action.patch) }

    case 'investment/remove':
      return { ...state, investments: state.investments.filter((i) => i.id !== action.id) }

    case 'loan/add':
      return { ...state, loans: [...state.loans, action.loan] }

    case 'loan/update':
      return { ...state, loans: patchById(state.loans, action.id, action.patch) }

    case 'loan/remove':
      return { ...state, loans: state.loans.filter((l) => l.id !== action.id) }

    case 'loan/payEmi': {
      const loan = state.loans.find((l) => l.id === action.id)
      if (!loan || loan.paidMonths >= loan.tenureMonths) return state
      const schedule = amortisationSchedule(loan)
      const row = schedule[loan.paidMonths]
      const paidMonths = loan.paidMonths + 1
      const transaction: Transaction = {
        id: uid('txn'),
        type: 'expense',
        amount: row?.emi ?? loan.emiAmount,
        category: 'EMI',
        date: todayISO(),
        note: `${loan.name} instalment ${paidMonths}/${loan.tenureMonths}`,
        method: 'Auto-debit',
        linkedType: 'loan',
        linkedId: loan.id,
        createdAt: new Date().toISOString(),
      }
      return {
        ...state,
        loans: patchById(state.loans, action.id, {
          paidMonths,
          active: paidMonths < loan.tenureMonths,
        }),
        transactions: [transaction, ...state.transactions],
      }
    }

    case 'card/add':
      return { ...state, cards: [...state.cards, action.card] }

    case 'card/update':
      return { ...state, cards: patchById(state.cards, action.id, action.patch) }

    case 'card/remove':
      return { ...state, cards: state.cards.filter((c) => c.id !== action.id) }

    case 'card/markPaid': {
      const card = state.cards.find((c) => c.id === action.id)
      if (!card) return state
      const transaction: Transaction = {
        id: uid('txn'),
        type: 'expense',
        amount: card.outstanding,
        category: 'Other',
        date: todayISO(),
        note: `${card.name} bill payment`,
        method: 'Bank Transfer',
        linkedType: 'card',
        linkedId: card.id,
        createdAt: new Date().toISOString(),
      }
      return {
        ...state,
        cards: patchById(state.cards, action.id, {
          lastPaidMonth: action.month,
          outstanding: 0,
          minimumDue: 0,
        }),
        transactions: card.outstanding > 0 ? [transaction, ...state.transactions] : state.transactions,
      }
    }

    case 'asset/add':
      return { ...state, assets: [...state.assets, action.asset] }

    case 'asset/update':
      return { ...state, assets: patchById(state.assets, action.id, action.patch) }

    case 'asset/remove':
      return { ...state, assets: state.assets.filter((a) => a.id !== action.id) }

    case 'liability/add':
      return { ...state, liabilities: [...state.liabilities, action.liability] }

    case 'liability/update':
      return { ...state, liabilities: patchById(state.liabilities, action.id, action.patch) }

    case 'liability/remove':
      return { ...state, liabilities: state.liabilities.filter((l) => l.id !== action.id) }

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

/* -------------------------------------------------------------------------- */
/* Action creators                                                            */
/* -------------------------------------------------------------------------- */

export interface AppActions {
  updateSettings: (patch: Partial<Settings>) => void

  addTransaction: (input: Omit<Transaction, 'id' | 'createdAt'>) => Transaction
  updateTransaction: (id: string, patch: Partial<Transaction>) => void
  removeTransactions: (ids: string[]) => void

  setBudget: (month: string, category: ExpenseCategory, limit: number) => void
  setBudgets: (month: string, limits: BudgetLimits) => void
  clearMonthBudget: (month: string) => void

  addGoal: (input: Omit<SavingsGoal, 'id' | 'createdAt' | 'contributions' | 'saved'> & { saved?: number }) => void
  updateGoal: (id: string, patch: Partial<SavingsGoal>) => void
  removeGoal: (id: string) => void
  contributeToGoal: (id: string, amount: number, date?: string, note?: string) => void
  removeContribution: (goalId: string, contributionId: string) => void

  addInvestment: (input: Omit<Investment, 'id' | 'history'> & { history?: Investment['history'] }) => void
  updateInvestment: (id: string, patch: Partial<Investment>) => void
  removeInvestment: (id: string) => void

  addLoan: (input: Omit<Loan, 'id'>) => void
  updateLoan: (id: string, patch: Partial<Loan>) => void
  removeLoan: (id: string) => void
  payEmi: (id: string) => void

  addCard: (input: Omit<CreditCard, 'id'>) => void
  updateCard: (id: string, patch: Partial<CreditCard>) => void
  removeCard: (id: string) => void
  markCardPaid: (id: string, month?: string) => void

  addAsset: (input: Omit<Asset, 'id' | 'updatedAt'>) => void
  updateAsset: (id: string, patch: Partial<Asset>) => void
  removeAsset: (id: string) => void

  addLiability: (input: Omit<Liability, 'id' | 'updatedAt'>) => void
  updateLiability: (id: string, patch: Partial<Liability>) => void
  removeLiability: (id: string) => void

  dismissAlert: (id: string) => void
  restoreAlerts: () => void

  replaceState: (state: AppState) => void
  resetToDemo: () => void
  resetToEmpty: () => void
}

const StateContext = createContext<AppState | null>(null)
const ActionsContext = createContext<AppActions | null>(null)

export function AppStoreProvider({ children }: { children: ReactNode }) {
  // Local storage is synchronous, so hydrate during the first render and skip
  // the loading flash entirely. A network repository would resolve in the
  // effect below instead.
  const [initial] = useState<AppState>(() => repository.loadSync?.() ?? buildSeedState())
  const [state, dispatch] = useReducer(reducer, initial)
  const [ready, setReady] = useState(() => Boolean(repository.loadSync))

  useEffect(() => {
    if (ready) return
    let cancelled = false
    repository.load().then((loaded) => {
      if (cancelled) return
      if (loaded) dispatch({ type: 'hydrate', state: loaded })
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

      addTransaction: (input) => {
        const transaction: Transaction = { ...input, id: uid('txn'), createdAt: new Date().toISOString() }
        dispatch({ type: 'txn/add', transaction })
        return transaction
      },
      updateTransaction: (id, patch) => dispatch({ type: 'txn/update', id, patch }),
      removeTransactions: (ids) => dispatch({ type: 'txn/remove', ids }),

      setBudget: (month, category, limit) => dispatch({ type: 'budget/set', month, category, limit }),
      setBudgets: (month, limits) => dispatch({ type: 'budget/setMany', month, limits }),
      clearMonthBudget: (month) => dispatch({ type: 'budget/clearMonth', month }),

      addGoal: (input) =>
        dispatch({
          type: 'goal/add',
          goal: {
            ...input,
            saved: input.saved ?? 0,
            id: uid('goal'),
            createdAt: new Date().toISOString(),
            contributions: input.saved
              ? [{ id: uid('con'), date: todayISO(), amount: input.saved, note: 'Opening balance' }]
              : [],
          },
        }),
      updateGoal: (id, patch) => dispatch({ type: 'goal/update', id, patch }),
      removeGoal: (id) => dispatch({ type: 'goal/remove', id }),
      contributeToGoal: (id, amount, date = todayISO(), note) =>
        dispatch({ type: 'goal/contribute', id, amount, date, note }),
      removeContribution: (goalId, contributionId) =>
        dispatch({ type: 'goal/removeContribution', goalId, contributionId }),

      addInvestment: (input) =>
        dispatch({
          type: 'investment/add',
          investment: {
            ...input,
            id: uid('inv'),
            history: input.history ?? [
              { month: monthKey(input.startDate), invested: input.invested, value: input.currentValue },
            ],
          },
        }),
      updateInvestment: (id, patch) => dispatch({ type: 'investment/update', id, patch }),
      removeInvestment: (id) => dispatch({ type: 'investment/remove', id }),

      addLoan: (input) => dispatch({ type: 'loan/add', loan: { ...input, id: uid('loan') } }),
      updateLoan: (id, patch) => dispatch({ type: 'loan/update', id, patch }),
      removeLoan: (id) => dispatch({ type: 'loan/remove', id }),
      payEmi: (id) => dispatch({ type: 'loan/payEmi', id }),

      addCard: (input) => dispatch({ type: 'card/add', card: { ...input, id: uid('card') } }),
      updateCard: (id, patch) => dispatch({ type: 'card/update', id, patch }),
      removeCard: (id) => dispatch({ type: 'card/remove', id }),
      markCardPaid: (id, month = currentMonthKey()) => dispatch({ type: 'card/markPaid', id, month }),

      addAsset: (input) =>
        dispatch({ type: 'asset/add', asset: { ...input, id: uid('ast'), updatedAt: todayISO() } }),
      updateAsset: (id, patch) =>
        dispatch({ type: 'asset/update', id, patch: { ...patch, updatedAt: todayISO() } }),
      removeAsset: (id) => dispatch({ type: 'asset/remove', id }),

      addLiability: (input) =>
        dispatch({ type: 'liability/add', liability: { ...input, id: uid('lia'), updatedAt: todayISO() } }),
      updateLiability: (id, patch) =>
        dispatch({ type: 'liability/update', id, patch: { ...patch, updatedAt: todayISO() } }),
      removeLiability: (id) => dispatch({ type: 'liability/remove', id }),

      dismissAlert: (id) => dispatch({ type: 'alert/dismiss', id }),
      restoreAlerts: () => dispatch({ type: 'alert/restoreAll' }),

      replaceState: (next) => dispatch({ type: 'system/replace', state: next }),
      resetToDemo: () => dispatch({ type: 'system/replace', state: buildSeedState() }),
      resetToEmpty: () => dispatch({ type: 'system/replace', state: buildEmptyState() }),
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

/**
 * Convenience selector hook. Deliberately not memoised: an inline selector is a
 * new function every render, so a `useMemo` keyed on it would never hit anyway.
 * Callers that need memoisation should wrap their own derivation.
 */
export function useSelector<T>(selector: (state: AppState) => T): T {
  return selector(useAppState())
}
