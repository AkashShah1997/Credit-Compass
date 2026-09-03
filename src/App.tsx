import { Suspense, lazy } from 'react'
import { Compass } from 'lucide-react'
import { AppStoreProvider } from './store/AppStore'
import { ThemeProvider } from './store/ThemeProvider'
import { ToastProvider } from './components/ui/Toast'
import { AppShell } from './components/layout/AppShell'
import { useRouter } from './hooks/useRouter'
import { Button } from './components/ui/Button'
import { EmptyState } from './components/ui/EmptyState'

// The dashboard is the landing route, so it ships in the main bundle. Every
// other page is fetched on first visit — the chunk lands well inside the
// navigation, and the initial parse stays small.
import Dashboard from './pages/Dashboard'

const Transactions = lazy(() => import('./pages/Transactions'))
const Budget = lazy(() => import('./pages/Budget'))
const Savings = lazy(() => import('./pages/Savings'))
const Investments = lazy(() => import('./pages/Investments'))
const Loans = lazy(() => import('./pages/Loans'))
const Cards = lazy(() => import('./pages/Cards'))
const NetWorth = lazy(() => import('./pages/NetWorth'))
const Planning = lazy(() => import('./pages/Planning'))
const Reports = lazy(() => import('./pages/Reports'))
const SettingsPage = lazy(() => import('./pages/Settings'))

/** Layout-shaped placeholder, so a lazy page doesn't collapse the scroll position. */
function PageFallback() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-surface-2" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-card bg-surface-2" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-card bg-surface-2" />
    </div>
  )
}

function Routes() {
  const router = useRouter()

  const page = (() => {
    switch (router.path) {
      case '/':
        return <Dashboard />
      case '/transactions':
        return <Transactions query={router.query} />
      case '/budget':
        return <Budget />
      case '/savings':
        return <Savings />
      case '/investments':
        return <Investments />
      case '/loans':
        return <Loans />
      case '/cards':
        return <Cards />
      case '/net-worth':
        return <NetWorth />
      case '/planning':
        return <Planning />
      case '/reports':
        return <Reports />
      case '/settings':
        return <SettingsPage />
      default:
        return (
          <EmptyState
            icon={<Compass className="h-5 w-5" />}
            title="Page not found"
            message={`Nothing lives at “${router.path}”.`}
            action={
              <Button variant="primary" onClick={() => router.navigate('/')}>
                Back to dashboard
              </Button>
            }
          />
        )
    }
  })()

  return (
    <AppShell currentPath={router.path}>
      {/* Keying on the path replays the entry animation and resets page state. */}
      <div key={router.path} className="animate-fade-in">
        <Suspense fallback={<PageFallback />}>{page}</Suspense>
      </div>
    </AppShell>
  )
}

export default function App() {
  return (
    <AppStoreProvider>
      <ThemeProvider>
        <ToastProvider>
          <Routes />
        </ToastProvider>
      </ThemeProvider>
    </AppStoreProvider>
  )
}
