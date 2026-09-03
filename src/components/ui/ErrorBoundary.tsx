import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from './Button'
import { EmptyState } from './EmptyState'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches a render error inside one page so the shell around it survives.
 * Without a boundary React unmounts the entire tree and the app goes blank —
 * the sidebar, the header and every other route with it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[page] render failed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <EmptyState
        icon={<AlertTriangle className="h-5 w-5" />}
        title="This page hit an error"
        message={this.state.error.message}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
            <Button onClick={() => (window.location.hash = '#/')}>Go to credit health</Button>
          </div>
        }
      />
    )
  }
}
