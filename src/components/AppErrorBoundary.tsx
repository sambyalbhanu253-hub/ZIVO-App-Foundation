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
        <ZivoErrorState
          title="ZIVO hit a snag."
          description="This section could not be displayed. Reload ZIVO to try again."
          action={{ label: 'Refresh ZIVO', onClick: () => window.location.reload() }}
        />
      </div>
    )
  }
}

export default AppErrorBoundary
