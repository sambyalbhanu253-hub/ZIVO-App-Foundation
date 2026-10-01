import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { validateText } from '../lib/textSafety'

export type ZivoComment = {
  id: string
  contentId: string
  contentType: 'post' | 'short'
  text: string
  createdAt: number
  author: {
    id: string
    name: string
    username: string
    picture: string
  }
}

type StoredComment = ZivoComment

type CommentContentType = ZivoComment['contentType']

type StoredProfile = {
  username: string
  displayName: string
  email: string
}

export function commentPrefix(contentType: CommentContentType, contentId: string) {
  return `zivo:comment:public:${contentType}:${contentId}:`
}

function readStoredProfile(value: unknown): StoredProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const profile = value as Record<string, unknown>
  if (typeof profile.username !== 'string' || typeof profile.displayName !== 'string' || typeof profile.email !== 'string') return null
  return { username: profile.username, displayName: profile.displayName, email: profile.email }
}

export async function loadCommentCount(contentType: CommentContentType, contentId: string) {
  const result = await window.genmb.kv.list(commentPrefix(contentType, contentId))
  return result.data
    .map((entry) => readComment(entry.value, contentType, contentId))
    .filter((comment): comment is ZivoComment => comment !== null)
    .length
}

export function readComment(value: unknown, contentType: CommentContentType, contentId: string): StoredComment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const comment = value as Record<string, unknown>
  const author = comment.author
  if (!author || typeof author !== 'object' || Array.isArray(author)) return null

  const storedAuthor = author as Record<string, unknown>
  if (
    typeof comment.id !== 'string' ||
    typeof comment.contentId !== 'string' ||
    typeof comment.contentType !== 'string' ||
    comment.contentId !== contentId ||
    comment.contentType !== contentType ||
    typeof comment.text !== 'string' ||
    typeof comment.createdAt !== 'number' ||
    typeof storedAuthor.id !== 'string' ||
    typeof storedAuthor.name !== 'string' ||
    typeof storedAuthor.picture !== 'string'
  ) {
    return null
  }

  return {
    id: comment.id,
    contentId: comment.contentId,
    contentType,
    text: comment.text,
    createdAt: comment.createdAt,
    author: {
      id: storedAuthor.id,
      name: storedAuthor.name,
      username: typeof storedAuthor.username === 'string' ? storedAuthor.username : '',
      picture: storedAuthor.picture,
    },
  }
}

function createCommentId() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function deleteCommentForContentOwner({ creatorId, contentId, contentType, commentId }: {
  creatorId: string
  contentId: string
  contentType: CommentContentType
  commentId: string
}) {
  await window.genmb.auth.ready()
  const sessionUser = window.genmb.auth.getUser()
  if (!sessionUser || sessionUser.id !== creatorId) throw new Error('Sign in to manage comments on your content.')
  const { loadPost } = await import('../lib/posts')
  const post = await loadPost(contentId)
  if (!post || post.creatorId !== sessionUser.id) throw new Error('You can only manage comments on content you own.')
  const key = `${commentPrefix(contentType, contentId)}${commentId}`
  const comment = readComment(await window.genmb.kv.get(key), contentType, contentId)
  if (!comment) throw new Error('This comment is no longer available.')
  await window.genmb.kv.delete(key)
  try {
    await window.genmb.realtime.publish(`zivo:comments:${contentType}:${contentId}`, { changed: true })
  } catch {
    // Deletion is durable; other viewers can refresh if the live event fails.
  }
}

export default function usePersistentComments(contentType: CommentContentType, contentId: string, enabled: boolean) {
  const { user, loading: isAuthLoading } = useAuth()
  const [comments, setComments] = useState<ZivoComment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const loadComments = useCallback(async () => {
    if (!contentId) return

    setIsLoading(true)
    setError('')
    try {
      const result = await window.genmb.kv.list(commentPrefix(contentType, contentId))
      const nextComments = result.data
        .map((entry) => readComment(entry.value, contentType, contentId))
        .filter((comment): comment is ZivoComment => comment !== null)
        .sort((first, second) => first.createdAt - second.createdAt)
      setComments(nextComments)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load comments.')
    } finally {
      setIsLoading(false)
    }
  }, [contentId, contentType])

  useEffect(() => {
    if (!enabled || !contentId) return
    void loadComments()
    const unsubscribe = window.genmb.realtime.subscribe(`zivo:comments:${contentType}:${contentId}`, () => { void loadComments() })
    return unsubscribe
  }, [enabled, contentId, contentType, loadComments])

  useEffect(() => {
    if (!enabled) {
      setComments([])
      setError('')
    }
  }, [enabled])

  const addComment = useCallback(async (text: string) => {
    if (!user || isSubmitting) return null
    setIsSubmitting(true)
    setError('')
    try {
      const trimmedText = validateText(text, 'Comment', 500, true)
      const storedProfile = readStoredProfile(await window.genmb.kv.get(`zivo:profile:${user.id}`))
      const authorName = storedProfile?.displayName.trim() || user.name.trim() || user.email.split('@')[0] || 'ZIVO member'
      const username = storedProfile?.username.trim() || user.email.split('@')[0] || 'zivo.member'
      const comment: ZivoComment = {
        id: createCommentId(),
        contentId,
        contentType,
        text: trimmedText,
        createdAt: Date.now(),
        author: {
          id: user.id,
          name: authorName,
          username,
          picture: user.picture,
        },
      }

      await window.genmb.kv.set(`${commentPrefix(contentType, contentId)}${comment.id}`, comment)
      setComments((current) => [...current, comment])
      try {
        await window.genmb.realtime.publish(`zivo:comments:${contentType}:${contentId}`, { changed: true })
      } catch (publishError) {
        setError(`Comment saved, but live updates failed: ${publishError instanceof Error ? publishError.message : String(publishError)}. Other viewers can refresh.`)
      }
      return comment
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to post your comment.')
      return null
    } finally {
      setIsSubmitting(false)
    }
  }, [contentId, contentType, isSubmitting, user])

  return {
    comments,
    user,
    isAuthLoading,
    isLoading,
    isSubmitting,
    error,
    loadComments,
    addComment,
  }
}
