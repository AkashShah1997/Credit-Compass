import { Suspense, lazy } from 'react'
import { Compass } from 'lucide-react'
import { AppStoreProvider } from './store/AppStore'
import { ThemeProvider } from './store/ThemeProvider'
import { ToastProvider } from './components/ui/Toast'
import { AppShell } from './components/layout/AppShell'
import { useRouter } from './hooks/useRouter'
import { Button } from './components/ui/Button'
import { EmptyState } from './components/ui/EmptyState'
import { ErrorBoundary } from './components/ui/ErrorBoundary'

// Credit health is the landing route and the reason the app exists, so it ships
// in the main bundle. The other two are fetched on first visit.
import Home from './pages/Home'

const Accounts = lazy(() => import('./pages/Accounts'))
const SettingsPage = lazy(() => import('./pages/Settings'))

/** Layout-shaped placeholder, so a lazy page doesn't collapse the scroll position. */
function PageFallback() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-surface-2" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
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
        return <Home />
      case '/accounts':
        return <Accounts />
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
                Back to credit health
              </Button>
            }
          />
        )
    }
  })()

  return (
    <AppShell currentPath={router.path}>
      {/* Keying on the path replays the entry animation, resets page state and
          gives the error boundary a clean slate on every navigation. */}
      <div key={router.path} className="animate-fade-in">
        <ErrorBoundary>
          <Suspense fallback={<PageFallback />}>{page}</Suspense>
        </ErrorBoundary>
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
