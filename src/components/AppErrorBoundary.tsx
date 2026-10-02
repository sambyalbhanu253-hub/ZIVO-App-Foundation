import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { ZivoErrorState } from './ZivoState'

type AppErrorBoundaryProps = { children?: ReactNode }
type AppErrorBoundaryState = { error: Error | null }

/**
 * Keeps a render crash contained to this subtree instead of blanking the page,
 * and re-reports it through console.error so the preview overlay and the
 * deployed-app error beacon still see the original error.
 */
class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="mx-auto max-w-md px-5 py-8" role="alert">
        <div className="p-4 bg-red-100 text-red-800 rounded-lg border border-red-300">
          <h3 className="font-bold text-lg mb-1">Asli Error mil gaya:</h3>
          <p className="text-sm font-mono break-words">{error.message || String(error)}</p>
        </div>
      </div>
    )
  }
}

export default AppErrorBoundary
