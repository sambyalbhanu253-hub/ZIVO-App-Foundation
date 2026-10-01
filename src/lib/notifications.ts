import { shouldSuppressNotification } from './safety'

export type ZivoNotificationKind = 'follow' | 'like' | 'comment'

export type ZivoNotification = {
  id: string
  kind: ZivoNotificationKind
  recipientId: string
  actor: {
    id: string
    name: string
    handle: string
    avatar: string
  }
  contentId?: string
  contentType?: 'post' | 'short'
  contentPreview?: string
  message: string
  createdAt: number
  read: boolean
}

type CreateNotificationInput = Omit<ZivoNotification, 'id' | 'createdAt' | 'read'> & {
  dedupeId: string
}

type StoredProfile = {
  username: string
  displayName: string
  email: string
}

export function notificationPrefix(recipientId: string) {
  return `zivo:notification:${recipientId}:`
}

export function notificationKey(recipientId: string, notificationId: string) {
  return `${notificationPrefix(recipientId)}${notificationId}`
}

export function readNotification(value: unknown): ZivoNotification | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const notification = value as Record<string, unknown>
  const actor = notification.actor
  if (!actor || typeof actor !== 'object' || Array.isArray(actor)) return null
  const storedActor = actor as Record<string, unknown>

  if (
    typeof notification.id !== 'string' ||
    (notification.kind !== 'follow' && notification.kind !== 'like' && notification.kind !== 'comment') ||
    typeof notification.recipientId !== 'string' ||
    typeof storedActor.id !== 'string' ||
    typeof storedActor.name !== 'string' ||
    typeof storedActor.handle !== 'string' ||
    typeof storedActor.avatar !== 'string' ||
    typeof notification.message !== 'string' ||
    typeof notification.createdAt !== 'number' ||
    typeof notification.read !== 'boolean'
  ) return null

  return {
    id: notification.id,
    kind: notification.kind,
    recipientId: notification.recipientId,
    actor: { id: storedActor.id, name: storedActor.name, handle: storedActor.handle, avatar: storedActor.avatar },
    contentId: typeof notification.contentId === 'string' ? notification.contentId : undefined,
    contentType: notification.contentType === 'post' || notification.contentType === 'short' ? notification.contentType : undefined,
    contentPreview: typeof notification.contentPreview === 'string' ? notification.contentPreview : undefined,
    message: notification.message,
    createdAt: notification.createdAt,
    read: notification.read,
  }
}

export async function loadNotifications(recipientId: string): Promise<ZivoNotification[]> {
  const result = await window.genmb.kv.list(notificationPrefix(recipientId))
  return result.data
    .map((entry) => readNotification(entry.value))
    .filter((notification): notification is ZivoNotification => notification !== null && notification.recipientId === recipientId)
    .sort((first, second) => second.createdAt - first.createdAt)
}

function announceNotificationsChanged(recipientId: string) {
  window.dispatchEvent(new CustomEvent('zivo:notifications-changed', { detail: { recipientId } }))
}

export async function createNotification(input: CreateNotificationInput): Promise<ZivoNotification | null> {
  if (!input.recipientId || input.recipientId === input.actor.id) return null
  if (await shouldSuppressNotification(input.recipientId, input.actor.id)) return null

  const key = notificationKey(input.recipientId, input.dedupeId)
  const existing = readNotification(await window.genmb.kv.get(key))
  if (existing) return existing

  const notification: ZivoNotification = {
    ...input,
    id: input.dedupeId,
    createdAt: Date.now(),
    read: false,
  }
  await window.genmb.kv.set(key, notification)
  announceNotificationsChanged(notification.recipientId)
  try {
    await window.genmb.realtime.publish(`zivo:notifications:${notification.recipientId}`, { id: notification.id })
  } catch {
    // The notification is stored; recipients will still see it when they open activity.
  }
  return notification
}

export async function updateNotification(notification: ZivoNotification) {
  await window.genmb.kv.set(notificationKey(notification.recipientId, notification.id), notification)
  announceNotificationsChanged(notification.recipientId)
}

function readStoredProfile(value: unknown): StoredProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const profile = value as Record<string, unknown>
  if (typeof profile.username !== 'string' || typeof profile.displayName !== 'string' || typeof profile.email !== 'string') return null
  return { username: profile.username, displayName: profile.displayName, email: profile.email }
}

export async function actorFromUser(user: GenMBUser) {
  const profile = readStoredProfile(await window.genmb.kv.get(`zivo:profile:${user.id}`))
  const fallbackHandle = user.email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '') || 'zivo.member'
  const name = profile?.displayName.trim() || user.name.trim() || fallbackHandle || 'ZIVO member'
  const username = profile?.username.trim().replace(/^@/, '') || fallbackHandle
  return {
    id: user.id,
    name,
    handle: `@${username || 'zivo.member'}`,
    avatar: user.picture || `https://picsum.photos/seed/zivo-notification-${encodeURIComponent(user.id)}/96/96`,
  }
}
