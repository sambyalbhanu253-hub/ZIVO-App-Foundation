import { CircleAlert } from 'lucide-react'
import PlaceholderScreen from '../components/PlaceholderScreen'
import usePageMeta from '../hooks/usePageMeta'

export default function NotFoundPage() {
  usePageMeta('Page Not Found — ZIVO', 'The requested ZIVO page could not be found.')

  return (
    <PlaceholderScreen
      eyebrow="Not found"
      title="This ZIVO screen does not exist."
      description="The link may be out of date, or this part of ZIVO has not been built yet."
      icon={CircleAlert}
      actionLabel="Go to ZIVO home"
      actionTo="/"
    />
  )
}
