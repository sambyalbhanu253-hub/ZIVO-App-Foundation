import { fallbackProfile, readStoredProfile } from './profiles'

export type LiveStatus = 'scheduled' | 'live' | 'ended'

export type ZivoLiveSession = {
  liveSessionId: string
  creatorId: string
  creatorProfile: { userId: string; displayName: string; username: string; avatarUrl: string }
  title: string
  category: string | null
  status: LiveStatus
  createdAt: number
  startedAt: number | null
  endedAt: number | null
  currentViewerCount?: number
  streamSource: { provider: string | null; playbackUrl: string | null; streamKeyRef: string | null }
  replay: { status: 'not-recorded' | 'processing' | 'ready'; recordingRef: string | null; playbackUrl: string | null }
}

export type ZivoLiveChatMessage = {
  id: string
  liveSessionId: string
  senderId: string
  senderProfile: { userId: string; displayName: string; username: string; avatarUrl: string }
  message: string
  createdAt: number
}

export type ZivoLiveReaction = {
  id: string
  liveSessionId: string
  senderId: string
  reaction: 'heart' | 'fire' | 'clap'
  createdAt: number
}

export const liveSessionPrefix = 'zivo:live:session:'
const liveChatPrefix = 'zivo:live:chat:'
const liveReactionPrefix = 'zivo:live:reaction:'

export function readLiveSession(value: unknown): ZivoLiveSession | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const session = value as Record<string, unknown>
  const profile = session.creatorProfile
  const source = session.streamSource
  const replay = session.replay
  if (typeof session.liveSessionId !== 'string' || typeof session.creatorId !== 'string' || typeof session.title !== 'string' || !['scheduled', 'live', 'ended'].includes(String(session.status)) || typeof session.createdAt !== 'number') return null
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null
  const creator = profile as Record<string, unknown>
  if (typeof creator.displayName !== 'string' || typeof creator.username !== 'string' || typeof creator.avatarUrl !== 'string') return null
  return {
    liveSessionId: session.liveSessionId,
    creatorId: session.creatorId,
    creatorProfile: { userId: typeof creator.userId === 'string' ? creator.userId : session.creatorId, displayName: creator.displayName, username: creator.username, avatarUrl: creator.avatarUrl },
    title: session.title,
    category: typeof session.category === 'string' && session.category.trim() ? session.category : null,
    status: session.status as LiveStatus,
    createdAt: session.createdAt,
    startedAt: typeof session.startedAt === 'number' ? session.startedAt : null,
    endedAt: typeof session.endedAt === 'number' ? session.endedAt : null,
    currentViewerCount: typeof session.currentViewerCount === 'number' && session.currentViewerCount >= 0 ? session.currentViewerCount : undefined,
    streamSource: source && typeof source === 'object' && !Array.isArray(source) ? {
      provider: typeof (source as Record<string, unknown>).provider === 'string' ? (source as Record<string, unknown>).provider as string : null,
      playbackUrl: typeof (source as Record<string, unknown>).playbackUrl === 'string' ? (source as Record<string, unknown>).playbackUrl as string : null,
      streamKeyRef: typeof (source as Record<string, unknown>).streamKeyRef === 'string' ? (source as Record<string, unknown>).streamKeyRef as string : null,
    } : { provider: null, playbackUrl: null, streamKeyRef: null },
    replay: replay && typeof replay === 'object' && !Array.isArray(replay) ? {
      status: ['not-recorded', 'processing', 'ready'].includes(String((replay as Record<string, unknown>).status)) ? (replay as Record<string, unknown>).status as ZivoLiveSession['replay']['status'] : 'not-recorded',
      recordingRef: typeof (replay as Record<string, unknown>).recordingRef === 'string' ? (replay as Record<string, unknown>).recordingRef as string : null,
      playbackUrl: typeof (replay as Record<string, unknown>).playbackUrl === 'string' ? (replay as Record<string, unknown>).playbackUrl as string : null,
    } : { status: 'not-recorded', recordingRef: null, playbackUrl: null },
  }
}

export function readLiveChatMessage(value: unknown): ZivoLiveChatMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as Record<string, unknown>
  const profile = item.senderProfile
  if (typeof item.id !== 'string' || typeof item.liveSessionId !== 'string' || typeof item.senderId !== 'string' || typeof item.message !== 'string' || typeof item.createdAt !== 'number' || !profile || typeof profile !== 'object' || Array.isArray(profile)) return null
  const sender = profile as Record<string, unknown>
  if (typeof sender.displayName !== 'string' || typeof sender.username !== 'string' || typeof sender.avatarUrl !== 'string') return null
  return { id: item.id, liveSessionId: item.liveSessionId, senderId: item.senderId, senderProfile: { userId: typeof sender.userId === 'string' ? sender.userId : item.senderId, displayName: sender.displayName, username: sender.username, avatarUrl: sender.avatarUrl }, message: item.message, createdAt: item.createdAt }
}

async function requireSessionUser(user: GenMBUser) {
  await window.genmb.auth.ready()
  const sessionUser = window.genmb.auth.getUser()
  if (!sessionUser || sessionUser.id !== user.id) throw new Error('Sign in to use ZIVO Live.')
  return sessionUser
}

async function profileFor(user: GenMBUser) {
  const saved = readStoredProfile(await window.genmb.kv.get(`zivo:profile:${user.id}`))
  const profile = saved ?? fallbackProfile(user)
  return { ...profile, avatarUrl: profile.avatarUrl || user.picture || `https://picsum.photos/seed/zivo-live-${user.id}/96/96` }
}

export async function loadLiveSessions(): Promise<ZivoLiveSession[]> {
  const result = await window.genmb.kv.list(liveSessionPrefix)
  return result.data.map((entry) => readLiveSession(entry.value)).filter((item): item is ZivoLiveSession => Boolean(item)).sort((a, b) => b.createdAt - a.createdAt)
}

export async function loadLiveSession(id: string): Promise<ZivoLiveSession | null> {
  if (!id.trim()) return null
  return readLiveSession(await window.genmb.kv.get(`${liveSessionPrefix}${id}`))
}

export async function startLiveSession({ user, title, category }: { user: GenMBUser; title: string; category?: string }): Promise<ZivoLiveSession> {
  const sessionUser = await requireSessionUser(user)
  if (!title.trim()) throw new Error('Add a title before going live.')
  const existing = (await loadLiveSessions()).find((item) => item.creatorId === sessionUser.id && item.status === 'live')
  if (existing) return existing
  const profile = await profileFor(sessionUser)
  const now = Date.now()
  const session: ZivoLiveSession = {
    liveSessionId: crypto.randomUUID(), creatorId: sessionUser.id,
    creatorProfile: { userId: sessionUser.id, displayName: profile.displayName, username: profile.username, avatarUrl: profile.avatarUrl },
    title: title.trim().slice(0, 140), category: category?.trim().slice(0, 64) || null, status: 'live', createdAt: now, startedAt: now, endedAt: null,
    streamSource: { provider: null, playbackUrl: null, streamKeyRef: null },
    replay: { status: 'not-recorded', recordingRef: null, playbackUrl: null },
  }
  await window.genmb.kv.set(`${liveSessionPrefix}${session.liveSessionId}`, session)
  return session
}

export async function endLiveSession({ user, liveSessionId }: { user: GenMBUser; liveSessionId: string }): Promise<ZivoLiveSession> {
  const sessionUser = await requireSessionUser(user)
  const current = await loadLiveSession(liveSessionId)
  if (!current) throw new Error('This Live session could not be found.')
  if (current.creatorId !== sessionUser.id) throw new Error('Only this Live creator can end the session.')
  if (current.status === 'ended') return current
  const ended = { ...current, status: 'ended' as const, endedAt: Date.now(), currentViewerCount: undefined }
  await window.genmb.kv.set(`${liveSessionPrefix}${liveSessionId}`, ended)
  return ended
}

export async function loadLiveChat(liveSessionId: string): Promise<ZivoLiveChatMessage[]> {
  const result = await window.genmb.kv.list(`${liveChatPrefix}${liveSessionId}:`)
  return result.data.map((entry) => readLiveChatMessage(entry.value)).filter((item): item is ZivoLiveChatMessage => Boolean(item) && item.liveSessionId === liveSessionId).sort((a, b) => a.createdAt - b.createdAt)
}

export async function sendLiveChatMessage({ user, liveSessionId, message }: { user: GenMBUser; liveSessionId: string; message: string }): Promise<ZivoLiveChatMessage> {
  const sessionUser = await requireSessionUser(user)
  const live = await loadLiveSession(liveSessionId)
  if (!live || live.status !== 'live') throw new Error('This Live has ended. Chat is closed.')
  const text = message.trim()
  if (!text || text.length > 280) throw new Error('Live chat messages must be between 1 and 280 characters.')
  const profile = await profileFor(sessionUser)
  const chat: ZivoLiveChatMessage = { id: crypto.randomUUID(), liveSessionId, senderId: sessionUser.id, senderProfile: { userId: sessionUser.id, displayName: profile.displayName, username: profile.username, avatarUrl: profile.avatarUrl }, message: text, createdAt: Date.now() }
  await window.genmb.kv.set(`${liveChatPrefix}${liveSessionId}:${chat.id}`, chat)
  return chat
}

export async function recordLiveReaction({ user, liveSessionId, reaction }: { user: GenMBUser; liveSessionId: string; reaction: ZivoLiveReaction['reaction'] }): Promise<ZivoLiveReaction> {
  const sessionUser = await requireSessionUser(user)
  const live = await loadLiveSession(liveSessionId)
  if (!live || live.status !== 'live') throw new Error('This Live has ended.')
  if (!['heart', 'fire', 'clap'].includes(reaction)) throw new Error('That reaction is not supported.')
  const throttleKey = `${liveReactionPrefix}${liveSessionId}:throttle:${sessionUser.id}:${reaction}`
  const previous = await window.genmb.kv.get(throttleKey)
  if (typeof previous === 'number' && Date.now() - previous < 1200) throw new Error('Please wait a moment before reacting again.')
  const event: ZivoLiveReaction = { id: crypto.randomUUID(), liveSessionId, senderId: sessionUser.id, reaction, createdAt: Date.now() }
  await window.genmb.kv.set(`${liveReactionPrefix}${liveSessionId}:${event.id}`, event)
  await window.genmb.kv.set(throttleKey, event.createdAt)
  return event
}
