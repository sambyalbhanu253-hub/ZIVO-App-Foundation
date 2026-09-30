import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'

export type SavedContentType = 'post' | 'short'

export type SavedContent = {
  id: string
  contentType: SavedContentType
  creator: string
  title: string
  image: string
  imageAlt: string
  duration?: string
  views?: string
}

type SavedRecord = SavedContent & {
  userId: string
  savedAt: number
}

type SaveToggleResult = {
  selected: boolean
  persisted: boolean
  requiresAuth: boolean
}

export function savePrefix(userId: string) {
  return `zivo:save:${userId}:`
}

export function saveKey(userId: string, contentType: SavedContentType, contentId: string) {
  return `${savePrefix(userId)}${contentType}:${contentId}`
}

export function savedContentKey(contentType: SavedContentType, contentId: string) {
  return `${contentType}:${contentId}`
}

export function readSavedRecord(value: unknown): SavedRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (
    typeof record.userId !== 'string' ||
    typeof record.id !== 'string' ||
    (record.contentType !== 'post' && record.contentType !== 'short') ||
    typeof record.creator !== 'string' ||
    typeof record.title !== 'string' ||
    typeof record.image !== 'string' ||
    typeof record.imageAlt !== 'string' ||
    typeof record.savedAt !== 'number'
  ) return null

  return {
    userId: record.userId,
    id: record.id,
    contentType: record.contentType,
    creator: record.creator,
    title: record.title,
    image: record.image,
    imageAlt: record.imageAlt,
    duration: typeof record.duration === 'string' ? record.duration : undefined,
    views: typeof record.views === 'string' ? record.views : undefined,
    savedAt: record.savedAt,
  }
}

export default function useVideoEngagement() {
  const { user, loading: isAuthLoading } = useAuth()
  const [savedItems, setSavedItems] = useState<SavedRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [updatingKey, setUpdatingKey] = useState<string | null>(null)
  const [error, setError] = useState('')
  const savedItemsRef = useRef<SavedRecord[]>([])

  useEffect(() => {
    savedItemsRef.current = savedItems
  }, [savedItems])

  useEffect(() => {
    let active = true

    const loadSavedItems = async () => {
      if (isAuthLoading) return
      setError('')

      if (!user) {
        if (active) {
          savedItemsRef.current = []
          setSavedItems([])
          setIsLoading(false)
        }
        return
      }

      setIsLoading(true)
      try {
        const result = await window.genmb.kv.list(savePrefix(user.id))
        const records = result.data
          .map((entry) => readSavedRecord(entry.value))
          .filter((record): record is SavedRecord => record !== null && record.userId === user.id)
          .sort((a, b) => b.savedAt - a.savedAt)
        if (active) {
          savedItemsRef.current = records
          setSavedItems(records)
        }
      } catch (caughtError) {
        if (active) setError(caughtError instanceof Error ? caughtError.message : 'Unable to load your saved items.')
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void loadSavedItems()
    return () => {
      active = false
    }
  }, [isAuthLoading, user])

  const toggleSave = useCallback(async (content: SavedContent): Promise<SaveToggleResult | null> => {
    if (!content.id || updatingKey) return null
    if (!user) return { selected: false, persisted: false, requiresAuth: true }

    const recordKey = savedContentKey(content.contentType, content.id)
    const currentlySaved = savedItemsRef.current.some((item) => savedContentKey(item.contentType, item.id) === recordKey)
    setUpdatingKey(recordKey)
    setError('')

    try {
      if (currentlySaved) {
        await window.genmb.kv.delete(saveKey(user.id, content.contentType, content.id))
        const nextItems = savedItemsRef.current.filter((item) => savedContentKey(item.contentType, item.id) !== recordKey)
        savedItemsRef.current = nextItems
        setSavedItems(nextItems)
        return { selected: false, persisted: true, requiresAuth: false }
      }

      const record: SavedRecord = { ...content, userId: user.id, savedAt: Date.now() }
      await window.genmb.kv.set(saveKey(user.id, content.contentType, content.id), record)
      const nextItems = [record, ...savedItemsRef.current.filter((item) => savedContentKey(item.contentType, item.id) !== recordKey)]
      savedItemsRef.current = nextItems
      setSavedItems(nextItems)
      return { selected: true, persisted: true, requiresAuth: false }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to update your saved item.')
      return null
    } finally {
      setUpdatingKey(null)
    }
  }, [updatingKey, user])

  return {
    savedIds: savedItems.map((item) => item.id),
    savedItems,
    isLoading: isAuthLoading || isLoading,
    isUpdating: updatingKey !== null,
    updatingKey,
    error,
    toggleSave,
  }
}
