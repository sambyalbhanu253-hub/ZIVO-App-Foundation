import { Link2, Share2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import type { PostFormat } from '../lib/posts'
import { copyZivoContentLink, isValidZivoContentId, shareStatusMessage, shareZivoContent, zivoContentUrl, zivoShareText } from '../lib/contentShare'
import { cn } from '../lib/utils'

type ContentShareActionsProps = {
  contentId: string
  format: PostFormat
  title: string
  creatorName: string
  layout?: 'row' | 'column'
  shareCount?: string
  className?: string
  isPublic: boolean
}

export default function ContentShareActions({
  contentId,
  format,
  title,
  creatorName,
  layout = 'row',
  shareCount,
  className,
  isPublic,
}: ContentShareActionsProps) {
  const [status, setStatus] = useState('')
  const [manualLink, setManualLink] = useState('')
  const [showShareOptions, setShowShareOptions] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [isCopying, setIsCopying] = useState(false)
  const actionLock = useRef(false)
  const link = zivoContentUrl(contentId, format)
  const canShare = isPublic && isValidZivoContentId(contentId) && Boolean(link)

  const unavailableMessage = () => {
    if (!isPublic) return 'Only public ZIVO content can be shared.'
    return 'This ZIVO content has an invalid link and cannot be shared.'
  }

  const copyLink = async () => {
    if (actionLock.current) return
    if (!canShare || !link) {
      setStatus(unavailableMessage())
      return
    }

    actionLock.current = true
    setIsCopying(true)
    setStatus('')
    setManualLink('')
    try {
      const result = await copyZivoContentLink(link)
      setStatus(result === 'copied' ? 'Link copied' : 'Select and copy the public link below.')
      if (result === 'manual') setManualLink(link)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not prepare the ZIVO link for copying.')
    } finally {
      actionLock.current = false
      setIsCopying(false)
    }
  }

  const share = async () => {
    if (actionLock.current) return
    if (!canShare || !link) {
      setStatus(unavailableMessage())
      return
    }

    actionLock.current = true
    setIsSharing(true)
    setStatus('')
    setManualLink('')
    setShowShareOptions(false)
    const nativeTitle = title.trim() || `${creatorName} on ZIVO`
    const shareText = zivoShareText(title, creatorName, link)

    try {
      const result = await shareZivoContent({ title: nativeTitle, text: shareText, url: link })
      setStatus(shareStatusMessage(result))
      if (result === 'options' || result === 'options-after-error') setShowShareOptions(true)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not prepare the public ZIVO link for sharing.')
    } finally {
      // Every completion path—including cancellation, native-sheet launch, and copy fallback—must
      // release the same lock so a later deliberate tap starts a completely new share operation.
      actionLock.current = false
      setIsSharing(false)
    }
  }

  const stacked = layout === 'column'
  const shareText = link ? zivoShareText(title, creatorName, link) : ''
  return (
    <div className={cn(stacked ? 'flex flex-col items-center gap-3' : 'flex items-center gap-0.5', className)}>
      <div className={stacked ? 'flex flex-col items-center gap-1' : undefined}>
        <button
          type="button"
          onClick={() => void share()}
          disabled={isSharing || isCopying}
          aria-label={`Share ${creatorName}'s ZIVO content`}
          className={cn(
            'flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
            stacked
              ? 'size-11 rounded-full border border-border/60 bg-background/55 text-foreground shadow-premium backdrop-blur-md hover:bg-accent'
              : 'min-h-11 gap-1.5 rounded-xl px-2 text-sm font-bold',
          )}
        >
          <Share2 size={stacked ? 22 : 19} aria-hidden="true" />
          {!stacked && shareCount}
        </button>
        {stacked && shareCount ? <span className="text-[11px] font-extrabold text-foreground [text-shadow:0_1px_8px_var(--background)]">{shareCount}</span> : null}
      </div>
      <button
        type="button"
        onClick={() => void copyLink()}
        disabled={isSharing || isCopying}
        aria-label="Copy ZIVO content link"
        className={cn(
          'flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
          stacked
            ? 'size-11 rounded-full border border-border/60 bg-background/55 text-foreground shadow-premium backdrop-blur-md hover:bg-accent'
            : 'size-11 rounded-xl hover:bg-muted',
        )}
      >
        <Link2 size={stacked ? 20 : 19} aria-hidden="true" />
      </button>
      {showShareOptions && link && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 z-[70] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-premium" role="group" aria-label="Share video options">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-extrabold">Share this ZIVO video</p>
            <button type="button" onClick={() => { setShowShareOptions(false); setStatus('') }} aria-label="Close share options" className="flex size-11 items-center justify-center rounded-xl text-card-foreground focus-visible:ring-2 focus-visible:ring-ring"><X size={20} /></button>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">{status}</p>
          <div className="grid grid-cols-2 gap-2 text-center text-sm font-bold">
            <a href={`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-border bg-muted px-3 py-3 text-foreground">WhatsApp</a>
            <a href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(title)}`} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-border bg-muted px-3 py-3 text-foreground">Telegram</a>
            <a href={`sms:?body=${encodeURIComponent(shareText)}`} className="rounded-xl border border-border bg-muted px-3 py-3 text-foreground">Messages</a>
            <a href={`mailto:?subject=${encodeURIComponent(title || 'ZIVO video')}&body=${encodeURIComponent(shareText)}`} className="rounded-xl border border-border bg-muted px-3 py-3 text-foreground">Email</a>
          </div>
          <button type="button" onClick={() => void copyLink()} disabled={isCopying} className="mt-3 min-h-11 w-full rounded-xl border border-border bg-background text-sm font-bold text-foreground disabled:opacity-60">Copy link</button>
        </div>
      )}
      {status && !showShareOptions ? (
        <span
          role="status"
          aria-live="polite"
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-border bg-card px-4 py-3 text-center text-xs font-extrabold text-card-foreground shadow-premium"
        >
          {status}
          {manualLink && (
            <input
              type="text"
              readOnly
              value={manualLink}
              aria-label="Public ZIVO link to copy"
              onFocus={(event) => event.currentTarget.select()}
              onClick={(event) => event.currentTarget.select()}
              className="mt-2 block w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground"
            />
          )}
        </span>
      ) : null}
    </div>
  )
}
