import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorState } from '@/components/ErrorState'

interface State {
  error: Error | null
}

/** Catches render errors and failed lazy-chunk loads (e.g. after a deploy) per route. */
export class RouteErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Route error', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const isChunk = /dynamically imported module|Loading chunk|Importing a module script failed/i.test(error.message)
    return (
      <ErrorState
        title={isChunk ? 'A new version is available' : 'This page ran into a problem'}
        error={new Error(isChunk ? 'Reload to get the latest version of the app.' : error.message)}
        onRetry={() => (isChunk ? window.location.reload() : this.setState({ error: null }))}
      />
    )
  }
}
