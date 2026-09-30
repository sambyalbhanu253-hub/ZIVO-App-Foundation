import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { loadSafetyRelationships } from '../lib/safety'

export default function useSafetyRelationships() {
  const { user, loading: isAuthLoading } = useAuth()
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([])
  const [mutedUserIds, setMutedUserIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (isAuthLoading) return
    if (!user) { setBlockedUserIds([]); setMutedUserIds([]); setIsLoading(false); return }
    setIsLoading(true); setError('')
    try {
      const relationships = await loadSafetyRelationships(user.id)
      setBlockedUserIds(relationships.blockedUserIds)
      setMutedUserIds(relationships.mutedUserIds)
    } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : 'Unable to load your safety preferences.') }
    finally { setIsLoading(false) }
  }, [isAuthLoading, user])

  useEffect(() => { void reload() }, [reload])
  const hiddenUserIds = [...new Set([...blockedUserIds, ...mutedUserIds])]
  return { blockedUserIds, mutedUserIds, hiddenUserIds, isLoading, error, reload }
}
