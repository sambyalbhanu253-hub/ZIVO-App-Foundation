import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true

export default function InstallZivoButton() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(() => isStandalone())
  const [status, setStatus] = useState('')

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    const handleInstalled = () => {
      setIsInstalled(true)
      setInstallPrompt(null)
      setStatus('ZIVO is installed.')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const handleInstall = async () => {
    setStatus('')
    if (!installPrompt) {
      setStatus(/Android/i.test(window.navigator.userAgent) ? 'In Chrome, open the menu and choose “Install app”.' : 'Open ZIVO in Chrome on Android to install the app.')
      return
    }

    try {
      await installPrompt.prompt()
      const choice = await installPrompt.userChoice
      setInstallPrompt(null)
      if (choice.outcome === 'dismissed') setStatus('Install was cancelled.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'ZIVO could not open the install prompt.')
    }
  }

  if (isInstalled) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void handleInstall()}
        className="home-header-action zivo-icon-button flex size-10 items-center justify-center rounded-xl border border-border/80 bg-card/80 text-card-foreground shadow-premium hover:-translate-y-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97]"
        aria-label="Install ZIVO on this device"
      >
        <Download size={18} strokeWidth={2.2} aria-hidden="true" />
      </button>
      {status ? (
        <p
          role="status"
          className="pointer-events-none absolute right-0 top-12 z-30 w-56 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium leading-5 text-card-foreground shadow-premium"
        >
          {status}
        </p>
      ) : null}
    </div>
  )
}
