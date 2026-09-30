import { Route, Routes, useLocation } from 'react-router-dom'
import AppErrorBoundary from './components/AppErrorBoundary'
import AppShell from './components/AppShell'
import NotFoundPage from './pages/NotFoundPage'
import CreatePage from './pages/CreatePage'
import DiscoverPage from './pages/DiscoverPage'
import CommunitiesPage from './pages/CommunitiesPage'
import HomePage from './pages/HomePage'
import MessagesPage from './pages/MessagesPage'
import NotificationsPage from './pages/NotificationsPage'
import ProfilePage from './pages/ProfilePage'
import ShortsPage from './pages/ShortsPage'
import AuthPage from './pages/AuthPage'
import ContentPage from './pages/ContentPage'
import LivePage from './pages/LivePage'
import CreatorMonetizationPage from './pages/CreatorMonetizationPage'
import CreatorAnalyticsPage from './pages/CreatorAnalyticsPage'
import CreatorStudioPage from './pages/CreatorStudioPage'

export default function App() {
  const location = useLocation()
  return (
    <AppErrorBoundary key={location.pathname}>
    <Routes>
      <Route path="/sign-in" element={<AuthPage />} />
      <Route path="/sign-up" element={<AuthPage />} />
      <Route path="/forgot-password" element={<AuthPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/shorts" element={<ShortsPage />} />
        <Route path="/shorts/:contentId" element={<ShortsPage />} />
        <Route path="/content/:contentId" element={<ContentPage />} />
        <Route path="/live/:liveSessionId" element={<LivePage />} />
        <Route path="/create" element={<CreatePage />} />
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/communities" element={<CommunitiesPage />} />
        <Route path="/communities/create" element={<CommunitiesPage />} />
        <Route path="/communities/:slug" element={<CommunitiesPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/:userId" element={<ProfilePage />} />
        <Route path="/creator/monetization" element={<CreatorMonetizationPage />} />
        <Route path="/creator/analytics" element={<CreatorAnalyticsPage />} />
        <Route path="/creator/studio" element={<CreatorStudioPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
    </AppErrorBoundary>
  )
}
