export type StoredProfile = {
  username: string
  displayName: string
  channelName?: string
  channelAvatarUrl?: string
  email: string
  bio: string
  avatarUrl?: string
}

export const profilePrefix = 'zivo:profile:'
export const profileUpdatedEvent = 'zivo:profile-updated'

export function profileKey(userId: string) {
  return `${profilePrefix}${userId}`
}

export function normalizeUsername(value: string) {
  return value.trim().replace(/^@+/, '').toLowerCase()
}

export function isValidUsername(value: string) {
  return /^[a-z0-9._-]{3,30}$/.test(normalizeUsername(value))
}

export function readStoredProfile(value: unknown): StoredProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const profile = value as Record<string, unknown>
  if (typeof profile.username !== 'string' || typeof profile.displayName !== 'string' || typeof profile.email !== 'string') return null

  return {
    username: profile.username.startsWith('@') ? profile.username : `@${profile.username}`,
    displayName: profile.displayName,
    channelName: typeof profile.channelName === 'string' && profile.channelName.trim() ? profile.channelName : undefined,
    channelAvatarUrl: typeof profile.channelAvatarUrl === 'string' && profile.channelAvatarUrl.trim() ? profile.channelAvatarUrl : undefined,
    email: profile.email,
    bio: typeof profile.bio === 'string' ? profile.bio : '',
    avatarUrl: typeof profile.avatarUrl === 'string' && profile.avatarUrl.trim() ? profile.avatarUrl : undefined,
  }
}

export function fallbackProfile(user: GenMBUser): StoredProfile {
  const localPart = normalizeUsername(user.email.split('@')[0]) || 'zivo.member'
  return {
    username: `@${localPart}`,
    displayName: user.name.trim() || localPart,
    email: user.email,
    bio: 'Share the moments that move you.',
    avatarUrl: user.picture || undefined,
  }
}

export async function isUsernameTaken(username: string, exceptUserId?: string) {
  const normalized = normalizeUsername(username)
  const result = await window.genmb.kv.list(profilePrefix)
  return result.data.some((entry) => {
    const userId = entry.key.slice(profilePrefix.length)
    const profile = readStoredProfile(entry.value)
    return userId !== exceptUserId && profile !== null && normalizeUsername(profile.username) === normalized
  })
}
