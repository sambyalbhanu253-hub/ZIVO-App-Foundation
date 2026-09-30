import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

type AuthContextValue = {
  user: GenMBUser | null
  loading: boolean
  error: string | null
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GenMBUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    let unsubscribe: (() => void) | undefined

    const initializeAuth = async () => {
      try {
        window.genmb.rbac.setRoleLoader(async () => {
          const result = await window.genmb.fn.invoke<{ role?: string; permissions?: string[] }>('resolveRole')
          return result.role && Array.isArray(result.permissions)
            ? { role: result.role, permissions: result.permissions }
            : null
        })
        // A failed redirect/session check must not leave the entire sign-in page
        // waiting forever. Keep the SDK initialization alive for late recovery.
        const ready = window.genmb.auth.ready()
        await Promise.race([
          ready,
          new Promise<never>((_, reject) => {
            const timer = window.setTimeout(() => reject(new Error('Sign-in is taking too long. Check your connection and reload ZIVO to try again.')), 15000)
            void ready.then(() => window.clearTimeout(timer), () => window.clearTimeout(timer))
          }),
        ])
        if (mounted) setUser(window.genmb.auth.getUser())
        unsubscribe = window.genmb.auth.onAuthStateChange((nextUser) => {
          if (!nextUser) window.genmb.rbac.clearRole()
          if (mounted) setUser(nextUser)
        })
        try {
          await window.genmb.rbac.ready()
        } catch (roleError) {
          console.error('ZIVO role initialization failed:', roleError)
        }
      } catch (caughtError) {
        if (mounted) setError(caughtError instanceof Error ? caughtError.message : 'We could not check your ZIVO session. Please try again.')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void initializeAuth()
    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])

  const value = useMemo(() => ({
    user,
    loading,
    error,
    clearError: () => setError(null),
  }), [error, loading, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider.')
  return context
}
