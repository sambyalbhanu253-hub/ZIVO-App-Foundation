import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'

export type LikeContentType = 'post' | 'short'

type LikeTarget = {
  id: string
  contentType: LikeContentType
}

type StoredLike = {
  userId: string
  contentId: string
  contentType: LikeContentType
  createdAt: number
}

type LikeToggleResult = {
  liked: boolean
  requiresAuth: boolean
}

function likePrefix(contentType: LikeContentType, contentId: string) {
  return `zivo:like:public:${contentType}:${contentId}:`
}

function likeKey(contentType: LikeContentType, contentId: string, userId: string) {
  return `${likePrefix(contentType, contentId)}${userId}`
}

function readLike(value: unknown, contentType: LikeContentType, contentId: string): StoredLike | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const like = value as Record<string, unknown>
  if (
    typeof like.userId !== 'string' ||
    typeof like.contentId !== 'string' ||
    like.contentId !== contentId ||
    like.contentType !== contentType ||
    typeof like.createdAt !== 'number'
  ) return null

  return {
    userId: like.userId,
    contentId,
    contentType,
    createdAt: like.createdAt,
  }
}

function uniqueLikes(records: StoredLike[]) {
  return [...new Map(records.map((record) => [record.userId, record])).values()]
}

export default function usePersistentLikes(targets: LikeTarget[]) {
  const { user, loading: isAuthLoading } = useAuth()
  const [likedIds, setLikedIds] = useState<string[]>([])
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const stateRef = useRef({ likedIds: [] as string[], likeCounts: {} as Record<string, number> })
  const targetKey = useMemo(
    () => [...new Map(targets.map((target) => [`${target.contentType}:${target.id}`, target])).values()]
      .map((target) => `${target.contentType}:${target.id}`)
      .join('|'),
    [targets],
  )

  useEffect(() => {
    stateRef.current = { likedIds, likeCounts }
  }, [likedIds, likeCounts])

  useEffect(() => {
    let active = true
    const uniqueTargets = [...new Map(targets.map((target) => [`${target.contentType}:${target.id}`, target])).values()]

    const loadLikes = async () => {
      if (isAuthLoading) return

      setIsLoading(true)
      setError('')
      try {
        const loaded = await Promise.all(uniqueTargets.map(async (target) => {
          const result = await window.genmb.kv.list(likePrefix(target.contentType, target.id))
          const likes = uniqueLikes(
            result.data
              .map((entry) => readLike(entry.value, target.contentType, target.id))
              .filter((like): like is StoredLike => like !== null),
          )
          return { target, likes }
        }))

        if (!active) return
        const nextCounts = Object.fromEntries(loaded.map(({ target, likes }) => [target.id, likes.length])) as Record<string, number>
        const nextLikedIds = user
          ? loaded.filter(({ likes }) => likes.some((like) => like.userId === user.id)).map(({ target }) => target.id)
          : []
        stateRef.current = { likedIds: nextLikedIds, likeCounts: nextCounts }
        setLikedIds(nextLikedIds)
        setLikeCounts(nextCounts)
      } catch (caughtError) {
        if (active) setError(caughtError instanceof Error ? caughtError.message : 'Unable to load likes.')
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void loadLikes()
    return () => {
      active = false
    }
  }, [isAuthLoading, targetKey, user])

  const toggleLike = useCallback(async (target: LikeTarget): Promise<LikeToggleResult | null> => {
    if (!target.id || updatingId) return null
    if (!user) return { liked: false, requiresAuth: true }

    const current = stateRef.current
    const liked = current.likedIds.includes(target.id)
    const nextLikedIds = liked ? current.likedIds.filter((id) => id !== target.id) : [...current.likedIds, target.id]
    const currentCount = current.likeCounts[target.id] ?? 0
    const nextLikeCounts = { ...current.likeCounts, [target.id]: Math.max(0, currentCount + (liked ? -1 : 1)) }

    stateRef.current = { likedIds: nextLikedIds, likeCounts: nextLikeCounts }
    setLikedIds(nextLikedIds)
    setLikeCounts(nextLikeCounts)
    setUpdatingId(target.id)
    setError('')

    try {
      if (liked) {
        await window.genmb.kv.delete(likeKey(target.contentType, target.id, user.id))
      } else {
        const record: StoredLike = {
          userId: user.id,
          contentId: target.id,
          contentType: target.contentType,
          createdAt: Date.now(),
        }
        await window.genmb.kv.set(likeKey(target.contentType, target.id, user.id), record)
      }
      return { liked: !liked, requiresAuth: false }
    } catch (caughtError) {
      stateRef.current = current
      setLikedIds(current.likedIds)
      setLikeCounts(current.likeCounts)
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to update your like.')
      return null
    } finally {
      setUpdatingId(null)
    }
  }, [updatingId, user])

  return {
    likedIds,
    likeCounts,
    isLoading: isAuthLoading || isLoading,
    updatingId,
    error,
    toggleLike,
  }
}
