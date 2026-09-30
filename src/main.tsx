import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './styles/main.css'
import AppErrorBoundary from './components/AppErrorBoundary'
import AuthProvider from './auth/AuthProvider'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/zivo-sw.js').catch(() => {
      // Installation remains available when service-worker registration is blocked by the browser.
    })
  })
}

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('ZIVO could not find the application root.')
}

createRoot(rootElement).render(
  <AppErrorBoundary>
    <StrictMode>
      <HashRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </HashRouter>
    </StrictMode>
  </AppErrorBoundary>,
)
