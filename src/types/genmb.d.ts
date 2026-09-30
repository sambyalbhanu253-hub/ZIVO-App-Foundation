import type { DetailedHTMLProps, HTMLAttributes } from 'react'

export {}

declare global {
  type GenMBUser = {
    id: string
    email: string
    name: string
    picture: string
  }

  interface Window {
    genmb: {
      auth: {
        ready: () => Promise<void>
        signIn: () => Promise<GenMBUser | null>
        sendMagicLink: (email: string) => Promise<{ success: boolean; data?: unknown }>
        signUp: (email: string, password: string, name?: string) => Promise<{ success: boolean; data?: unknown }>
        verifySignUp: (email: string, code: string) => Promise<GenMBUser | null>
        signInWithPassword: (email: string, password: string) => Promise<GenMBUser | null>
        requestPasswordReset: (email: string) => Promise<void>
        confirmPasswordReset: (email: string, code: string, newPassword: string) => Promise<{ success: boolean; data?: unknown }>
        signOut: () => Promise<void>
        getUser: () => GenMBUser | null
        isAuthenticated: () => boolean
        onAuthStateChange: (callback: (user: GenMBUser | null) => void) => () => void
      }
      storage: {
        validate: (file: File, options?: { accept?: string; maxSize?: number }) => { ok: boolean; reason?: 'type' | 'size'; message?: string }
        previewFor: (file: File) => { kind: 'image' | 'video' | 'pdf' | 'file'; url: string | null; name: string; size: number; contentType: string; revoke: () => void }
        upload: (file: File, options?: { folder?: string; onProgress?: (percent: number) => void; signal?: AbortSignal }) => Promise<{ filename: string; url: string; size: number; contentType: string }>
        delete: (filename: string) => Promise<{ success: boolean }>
      }
      db: {
        profiles: {
          list: (params?: { limit?: number }) => Promise<{ data: Array<{ id: string; userId: string; displayName: string; bio: string | null; avatarUrl: string | null }> }>
          create: (data: { displayName: string; bio?: string | null; avatarUrl?: string | null }) => Promise<{ id: string }>
          update: (id: string, data: { displayName?: string; bio?: string | null; avatarUrl?: string | null }) => Promise<unknown>
        }
      }
      social: {
        createPost: (input: { content: string; imageUrl?: string }) => Promise<{ id: string }>
        deletePost: (postId: string) => Promise<{ deleted: boolean }>
        getFeed: (options?: { limit?: number; before?: string }) => Promise<{ posts: unknown[]; hasMore: boolean }>
        getProfile: (userId: string) => Promise<{ user: unknown; posts: unknown[]; followerCount: number; followingCount: number; viewerFollows: boolean }>
        follow: (userId: string) => Promise<{ following: boolean }>
        unfollow: (userId: string) => Promise<{ following: boolean }>
        like: (postId: string) => Promise<{ liked: boolean; likeCount: number }>
        unlike: (postId: string) => Promise<{ liked: boolean; likeCount: number }>
        comment: (postId: string, text: string) => Promise<unknown>
        getComments: (postId: string, options?: { limit?: number }) => Promise<{ comments: unknown[] }>
      }
      fn: {
        invoke: <T = unknown>(name: string, payload?: unknown) => Promise<T>
      }
      rbac: {
        setRoleLoader: (loader: (user: GenMBUser) => Promise<{ role: string; permissions: string[] } | null>) => void
        ready: () => Promise<unknown>
        clearRole: () => void
        getRole: () => string | null
        getRolePermissions: () => string[]
        hasRole: (role: string) => boolean
        hasPermission: (permission: string) => boolean
        isAdmin: () => boolean
        onRoleChange: (callback: (role: string | null, permissions: string[]) => void) => () => void
      }
      realtime: {
        subscribe: (channel: string, onMessage: (message: unknown) => void) => () => void
        publish: (channel: string, payload: unknown) => Promise<{ sent: boolean }>
      }
      ai: {
        complete: (prompt: string, options?: { maxTokens?: number; enableSearch?: boolean }) => Promise<string>
      }
      translate: {
        text: (input: string, targetLang: string, sourceLang?: string) => Promise<{ translated: string; detectedSourceLang?: string }>
        batch: (inputs: string[], targetLang: string) => Promise<string[]>
        detect: (text: string) => Promise<{ language: string; confidence: number }>
        languages: () => Promise<string[]>
      }
      kv: {
        get: (key: string, options?: { scope: 'user' }) => Promise<unknown | null>
        set: (key: string, value: unknown, options?: { scope: 'user' }) => Promise<void>
        delete: (key: string, options?: { scope: 'user' }) => Promise<{ deleted: boolean }>
        list: (prefix: string, options?: { scope: 'user' }) => Promise<{ data: Array<{ key: string; value: unknown }>; total: number }>
        increment: (key: string, by?: number, options?: { scope: 'user' }) => Promise<number>
      }
    }
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'genmb-uploader': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        accept?: string
        multiple?: boolean
        folder?: string
        'max-size'?: string
        theme?: 'light' | 'dark' | 'auto'
        label?: string
      }
      'genmb-image': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        width?: string
        alt?: string
      }
      'genmb-video': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        controls?: boolean
      }
    }
  }
}
