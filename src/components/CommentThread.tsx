import { LoaderCircle, MessageCircle, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import usePersistentComments from '../hooks/usePersistentComments'
import { actorFromUser, createNotification } from '../lib/notifications'
import { canInteractBetween } from '../lib/safety'

type CommentThreadProps = {
  contentId: string
  contentType: 'post' | 'short'
  onCountChange?: (count: number) => void
  compact?: boolean
  samplePreview?: string
  contentOwnerId: string
  contentPreview?: string
}

function relativeTime(timestamp: number) {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (elapsedSeconds < 60) return 'now'
  if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)}m`
  if (elapsedSeconds < 86400) return `${Math.floor(elapsedSeconds / 3600)}h`
  return `${Math.floor(elapsedSeconds / 86400)}d`
}

export default function CommentThread({ contentId, contentType, onCountChange, compact = false, samplePreview, contentOwnerId, contentPreview }: CommentThreadProps) {
  const [draft, setDraft] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const { comments, user, isAuthLoading, isLoading, isSubmitting, error, loadComments, addComment } = usePersistentComments(
    contentType,
    contentId,
    true,
  )

  useEffect(() => {
    onCountChange?.(comments.length)
  }, [comments.length, onCountChange])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (user && !(await canInteractBetween(user.id, contentOwnerId))) {
      setSuccessMessage('Comments are unavailable because one of you has blocked the other.')
      return
    }
    const comment = await addComment(draft)
    if (!comment) return
    setDraft('')
    if (user && contentOwnerId) {
      try {
        await createNotification({
          dedupeId: `comment:${comment.id}`,
          kind: 'comment',
          recipientId: contentOwnerId,
          actor: await actorFromUser(user),
          contentId,
          contentType,
          contentPreview,
          message: `commented: “${comment.text}”`,
        })
        setSuccessMessage('Comment posted and notification sent.')
      } catch (caughtError) {
        setSuccessMessage(caughtError instanceof Error ? `Comment posted, but the notification could not be sent: ${caughtError.message}` : 'Comment posted, but the notification could not be sent.')
      }
      return
    }
    setSuccessMessage('Comment posted.')
  }

  return (
    <section className={compact ? 'mt-3 rounded-2xl border border-border/70 bg-card/95 p-3 shadow-premium backdrop-blur-xl' : 'mt-3 rounded-2xl bg-muted px-3 py-3'} aria-label="Comments">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageCircle size={16} className="text-primary" aria-hidden="true" />
          <p className="text-xs font-extrabold text-card-foreground">Comments</p>
        </div>
        {isLoading && <LoaderCircle size={15} className="zivo-loader text-primary" aria-label="Loading comments" />}
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-primary/45 bg-accent px-3 py-2.5" role="alert">
          <p className="text-xs font-semibold text-card-foreground">{error}</p>
          <button type="button" onClick={() => void loadComments()} disabled={isLoading || isSubmitting} className="mt-2 min-h-8 rounded-lg bg-primary px-2.5 text-xs font-extrabold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Try again
          </button>
        </div>
      )}

      {samplePreview && (
        <p className="mt-3 text-xs font-medium leading-5 text-muted-foreground">
          <span className="font-extrabold text-card-foreground">@zivo.community</span> {samplePreview}
        </p>
      )}

      {!isLoading && !error && comments.length === 0 && !samplePreview && (
        <p className="mt-3 text-xs font-medium leading-5 text-muted-foreground">Be the first to share what you think.</p>
      )}

      {comments.length > 0 && (
        <div className="mt-3 max-h-40 space-y-3 overflow-y-auto pr-1 [scrollbar-width:thin]">
          {comments.map((comment) => (
            <article key={comment.id} className="flex gap-2.5">
              {comment.author.picture ? (
                <img
                  data-genmb-img={`${comment.author.name} comment profile`}
                  src={comment.author.picture}
                  alt=""
                  className="size-7 shrink-0 rounded-full border border-border object-cover"
                  onError={(event) => {
                    event.currentTarget.src = `https://picsum.photos/seed/zivo-comment-${comment.id}/64/64`
                  }}
                />
              ) : (
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-extrabold text-primary">{comment.author.name.charAt(0).toUpperCase()}</span>
              )}
              <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
                <span className="mr-1 font-extrabold text-card-foreground">{comment.author.name}</span>
                {comment.text}
                <span className="ml-1.5 text-[10px] font-bold text-muted-foreground">{relativeTime(comment.createdAt)}</span>
              </p>
            </article>
          ))}
        </div>
      )}

      {isAuthLoading ? (
        <p className="mt-3 text-xs font-semibold text-muted-foreground">Checking your account…</p>
      ) : user ? (
        <form className="mt-3 flex items-center gap-2" onSubmit={(event) => void handleSubmit(event)}>
          <label htmlFor={`comment-${contentType}-${contentId}`} className="sr-only">Add a comment</label>
          <input
            id={`comment-${contentType}-${contentId}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={500}
            disabled={isSubmitting}
            placeholder="Add a comment"
            className="min-h-10 min-w-0 flex-1 rounded-xl border border-border bg-background/55 px-3 text-xs font-medium text-card-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isSubmitting || !draft.trim()}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-premium transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Post comment"
          >
            {isSubmitting ? <LoaderCircle size={16} className="zivo-loader" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
          </button>
        </form>
      ) : (
        <p className="mt-3 text-xs font-semibold text-muted-foreground">
          <Link to="/sign-in" className="text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Sign in</Link> to post a comment. Comments are visible to the ZIVO community.
        </p>
      )}
      {successMessage && <p className="mt-2 text-xs font-semibold text-muted-foreground" role="status">{successMessage}</p>}
    </section>
  )
}
