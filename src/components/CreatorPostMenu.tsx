import { MoreHorizontal, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { deleteCreatorPost } from '../lib/posts'

type Props = { postId: string; creatorId: string; title: string; className?: string; onDeleted?: () => void }

export default function CreatorPostMenu({ postId, creatorId, title, className, onDeleted }: Props) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState('')
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!confirming) return
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deleting) {
        setConfirming(false)
        trigger.current?.focus()
      }
      if (event.key !== 'Tab' || !dialog.current) return
      const buttons = [...dialog.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
      if (!buttons.length) return
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      event.preventDefault()
      buttons[event.shiftKey ? (index <= 0 ? buttons.length - 1 : index - 1) : (index + 1) % buttons.length].focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [confirming, deleting])

  if (!user || user.id !== creatorId) return null

  const remove = async () => {
    if (deleting) return
    setDeleting(true)
    setMessage('')
    try {
      await deleteCreatorPost({ creatorId, postId })
      setConfirming(false)
      setOpen(false)
      setMessage('Post deleted.')
      onDeleted?.()
      trigger.current?.focus()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to delete this post.')
    } finally {
      setDeleting(false)
    }
  }

  return <div className={`relative ${className ?? ''}`}>
    <button ref={trigger} type="button" aria-label={`Manage ${title}`} aria-expanded={open} onClick={() => setOpen(!open)} className="flex size-10 items-center justify-center rounded-xl bg-background/65 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <MoreHorizontal size={20} aria-hidden="true" />
    </button>
    {open && <div className="absolute right-0 top-11 z-30 min-w-36 rounded-xl border border-border bg-card p-1 shadow-float">
      <button type="button" onClick={() => { setOpen(false); setConfirming(true); setMessage('') }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-bold text-card-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><Trash2 size={16} aria-hidden="true" /> Delete post</button>
    </div>}
    {message && <p role={confirming ? 'alert' : 'status'} className="text-xs text-primary">{message}</p>}
    {confirming && <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-4 backdrop-blur-sm sm:items-center" role="presentation">
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={`delete-${postId}`} className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-float">
        <h2 id={`delete-${postId}`} className="text-lg font-extrabold text-card-foreground">Delete post?</h2>
        <p className="mt-2 text-sm text-muted-foreground">Delete “{title}”? This cannot be undone.</p>
        {message && <p role="alert" className="mt-2 text-sm text-primary">{message}</p>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" disabled={deleting} onClick={() => { setConfirming(false); trigger.current?.focus() }} className="min-h-11 rounded-xl border border-border text-sm font-bold text-card-foreground disabled:opacity-60">Cancel</button>
          <button type="button" disabled={deleting} onClick={() => void remove()} className="min-h-11 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60">{deleting ? 'Deleting…' : 'Delete post'}</button>
        </div>
      </div>
    </div>}
  </div>
}
