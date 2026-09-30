export type StoredStory = {
  id: string
  creatorId: string
  creatorName: string
  creatorAvatar: string
  content: string
  mediaRef: string
  mediaAlt: string
  createdAt: number
  expiresAt: number
}

import { readStoredProfile } from './profiles'

export const storyPrefix = 'zivo:story:'
const storyDurationMs = 24 * 60 * 60 * 1000

export function readStoredStory(value: unknown): StoredStory | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const story = value as Record<string, unknown>
  if (
    typeof story.id !== 'string' ||
    typeof story.creatorId !== 'string' ||
    typeof story.creatorName !== 'string' ||
    typeof story.creatorAvatar !== 'string' ||
    typeof story.content !== 'string' ||
    typeof story.mediaRef !== 'string' ||
    story.mediaRef.startsWith('blob:') ||
    typeof story.mediaAlt !== 'string' ||
    typeof story.createdAt !== 'number' ||
    typeof story.expiresAt !== 'number'
  ) return null

  return {
    id: story.id,
    creatorId: story.creatorId,
    creatorName: story.creatorName,
    creatorAvatar: story.creatorAvatar,
    content: story.content,
    mediaRef: story.mediaRef,
    mediaAlt: story.mediaAlt,
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
  }
}

export async function loadActiveStories(now = Date.now()): Promise<StoredStory[]> {
  const result = await window.genmb.kv.list(storyPrefix)
  return result.data
    .map((entry) => readStoredStory(entry.value))
    .filter((story): story is StoredStory => Boolean(story && story.expiresAt > now))
    .sort((first, second) => second.createdAt - first.createdAt)
}

export async function createStory({
  user,
  content,
  media,
}: {
  user: GenMBUser
  content: string
  media: { url: string; filename: string; contentType: string; size: number; alt: string }
}): Promise<StoredStory> {
  if (!content.trim()) throw new Error('Add a caption before publishing.')
  if (!media.url.trim() || media.url.startsWith('blob:') || !media.filename.trim() || !media.contentType.trim() || media.size < 0) {
    throw new Error('Upload your photo or video before publishing.')
  }
  const id = crypto.randomUUID()
  const createdAt = Date.now()
  const storedProfile = readStoredProfile(await window.genmb.kv.get(`zivo:profile:${user.id}`))
  const fallbackName = user.name.trim() || user.email.split('@')[0] || 'ZIVO creator'
  const creatorName = storedProfile?.displayName.trim() || fallbackName
  const creatorAvatar = storedProfile?.avatarUrl || user.picture || `https://picsum.photos/seed/zivo-story-${user.id}-avatar/96/96`
  const story: StoredStory = {
    id,
    creatorId: user.id,
    creatorName,
    creatorAvatar,
    content: content.trim(),
    mediaRef: media.url,
    mediaAlt: media.alt.trim() || `${creatorName}'s story moment`,
    createdAt,
    expiresAt: createdAt + storyDurationMs,
  }

  await window.genmb.kv.set(`${storyPrefix}${id}`, story)
  return story
}
