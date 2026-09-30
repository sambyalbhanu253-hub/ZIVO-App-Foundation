import { Outlet, useLocation } from 'react-router-dom'
import BottomNavigation from './BottomNavigation'
import ZivoHeader from './ZivoHeader'
import BackgroundUpload from './BackgroundUpload'
import AppErrorBoundary from './AppErrorBoundary'

export default function AppShell() {
  const pathname = useLocation().pathname
  const isHome = pathname === '/'
  const isShorts = pathname === '/shorts' || pathname.startsWith('/shorts/')
  return (
    <BackgroundUpload><div className={isShorts ? 'app-frame shorts-frame' : isHome ? 'app-frame home-frame' : 'app-frame'}>
      {!isShorts && <AppErrorBoundary><ZivoHeader /></AppErrorBoundary>}
      <main id="main-content" className={pathname === '/create' ? 'page-content create-page-content' : 'page-content'} tabIndex={-1}>
        <AppErrorBoundary><Outlet /></AppErrorBoundary>
      </main>
      {/* Shorts owns the entire viewport; never mount the primary navigation over its feed. */}
      {!isShorts && <AppErrorBoundary><BottomNavigation /></AppErrorBoundary>}
    </div></BackgroundUpload>
  )
}
