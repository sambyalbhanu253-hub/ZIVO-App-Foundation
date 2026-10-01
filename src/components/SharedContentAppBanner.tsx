import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function SharedContentAppBanner() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [message, setMessage] = useState('')
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent) }
    const onInstalled = () => { setInstalled(true); setPrompt(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])

  if (installed) return null

  const install = async () => {
    setMessage('')
    if (!prompt) {
      setMessage(/Android/i.test(navigator.userAgent) ? 'To install ZIVO, open your browser menu and select Install app or Add to Home screen.' : /iPhone|iPad/i.test(navigator.userAgent) ? 'To add ZIVO, open this page in Safari, tap Share, then Add to Home Screen.' : 'Open this page in a browser that supports installing web apps, then choose Install from its menu.')
      return
    }
    try {
      await prompt.prompt()
      const choice = await prompt.userChoice
      setPrompt(null)
      if (choice.outcome === 'dismissed') setMessage('Installation cancelled. You can still install ZIVO from your browser menu.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to open the install prompt. Try your browser menu.')
    }
  }

  return <aside aria-label="Get the ZIVO app" className="relative z-20 border-b border-border bg-card px-4 py-3 text-card-foreground shadow-premium">
    <div className="mx-auto flex max-w-md items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground font-extrabold" aria-hidden="true">Z</div>
      <div className="min-w-0 flex-1"><p className="text-sm font-extrabold">Take ZIVO with you</p><p className="text-xs text-muted-foreground">Watch more videos right from your home screen.</p></div>
      <button type="button" onClick={() => void install()} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-extrabold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"><Download size={15} aria-hidden="true" /> Get ZIVO App</button>
    </div>
    {message && <p role="status" className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">{message}</p>}
  </aside>
}
