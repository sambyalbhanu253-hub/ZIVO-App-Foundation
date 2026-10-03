import { profileKey, readStoredProfile } from './profiles'
import { validateHashtags, validateText } from './textSafety'

export type PostFormat = 'photo' | 'short' | 'video'
export type PostVisibility = 'Public' | 'Unlisted' | 'Followers' | 'Private'

export type StoredPost = {
  id: string
  contentType: 'post'
  creatorId: string
  channelId?: string
  post_type: 'personal' | 'channel'
  creatorName: string
  creatorHandle: string
  creatorAvatar: string
  creatorProfile: { userId: string; displayName: string; username: string; avatarUrl: string }
  mediaType: 'photo' | 'video'
  format: PostFormat
  mediaRef: string
  mediaUrl: string
  mediaAlt: string
  thumbnailUrl?: string
  duration: string
  videoDurationSeconds?: number
  category: string
  title?: string
  caption: string
  description?: string
  hashtags: string[]
  sound: string
  visibility: PostVisibility
  featured?: boolean
  engagement: { likeCount: number; commentCount: number; saveCount: number }
  createdAt: number
  sourceVideoId?: string
  socialPostId?: string
}

export const postPrefix = 'zivo:post:'
const publishRequestPrefix = 'zivo:publish-request:'
export const localPostPublishedEvent = 'zivo:post-published'
export const localPostUpdatedEvent = 'zivo:post-updated'
export const localPostDeletedEvent = 'zivo:post-deleted'

const isVisibility = (value: unknown): value is PostVisibility => value === 'Public' || value === 'Unlisted' || value === 'Followers' || value === 'Private'
const postStorageOptions = (visibility: PostVisibility) => visibility === 'Public' || visibility === 'Unlisted' ? undefined : { scope: 'user' as const }

function formatVideoDuration(seconds: number | undefined) {
  if (seconds === undefined) return 'Video'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`
}

function readHashtags(value: unknown) {
  return Array.isArray(value) && value.every((tag) => typeof tag === 'string')
    ? [...new Set(value.map((tag) => tag.trim()).filter(Boolean))]
    : []
}

function readEngagement(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { likeCount: 0, commentCount: 0, saveCount: 0 }
  const engagement = value as Record<string, unknown>
  return {
    likeCount: typeof engagement.likeCount === 'number' ? engagement.likeCount : 0,
    commentCount: typeof engagement.commentCount === 'number' ? engagement.commentCount : 0,
    saveCount: typeof engagement.saveCount === 'number' ? engagement.saveCount : 0,
  }
}

export function readStoredPost(value: unknown): StoredPost | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const post = value as Record<string, unknown>
  const legacyMediaType = post.mediaType === 'short' ? 'video' : post.mediaType
  const format: PostFormat = post.format === 'photo' || post.format === 'short' || post.format === 'video'
    ? post.format
    : post.mediaType === 'short' ? 'short' : legacyMediaType === 'photo' ? 'photo' : 'video'
  if (
    typeof post.id !== 'string' || typeof post.creatorId !== 'string' || typeof post.creatorName !== 'string' ||
    typeof post.creatorHandle !== 'string' || typeof post.creatorAvatar !== 'string' || typeof post.mediaRef !== 'string' ||
    typeof post.mediaAlt !== 'string' || (legacyMediaType !== 'photo' && legacyMediaType !== 'video') ||
    typeof post.duration !== 'string' || typeof post.category !== 'string' || typeof post.caption !== 'string' ||
    !isVisibility(post.visibility) || typeof post.createdAt !== 'number'
  ) return null
  const profile = post.creatorProfile && typeof post.creatorProfile === 'object' && !Array.isArray(post.creatorProfile)
    ? post.creatorProfile as Record<string, unknown>
    : null
  const videoCandidates = [post.videoUrl, post.video, post.mediaUrl, post.media, post.fileUrl, post.url, post.mediaRef]
  const videoUrl = videoCandidates.map((candidate) => {
    if (typeof candidate === 'string') return candidate.trim()
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate) && typeof (candidate as Record<string, unknown>).url === 'string')
      return ((candidate as Record<string, unknown>).url as string).trim()
    return ''
  }).find((url) => /^https?:\/\//i.test(url) || /^blob:/i.test(url) || url.startsWith('/api/apps/'))
  return {
    id: post.id, contentType: 'post', creatorId: post.creatorId,
    channelId: typeof post.channelId === 'string' && post.channelId === post.creatorId ? post.channelId : undefined,
    post_type: post.post_type === 'channel' ? 'channel' : post.post_type === 'personal' ? 'personal' : post.channelId === post.creatorId ? 'channel' : 'personal',
    creatorName: post.creatorName,
    creatorHandle: post.creatorHandle, creatorAvatar: post.creatorAvatar,
    creatorProfile: {
      userId: typeof profile?.userId === 'string' ? profile.userId : post.creatorId,
      displayName: typeof profile?.displayName === 'string' ? profile.displayName : post.creatorName,
      username: typeof profile?.username === 'string' ? profile.username : post.creatorHandle,
      avatarUrl: typeof profile?.avatarUrl === 'string' ? profile.avatarUrl : post.creatorAvatar,
    },
    mediaType: legacyMediaType, format, mediaRef: post.mediaRef,
    mediaUrl: legacyMediaType === 'video' ? videoUrl || post.mediaRef : typeof post.mediaUrl === 'string' ? post.mediaUrl : post.mediaRef, mediaAlt: post.mediaAlt,
    thumbnailUrl: typeof post.thumbnailUrl === 'string' && (/^data:image\/jpeg;base64,/.test(post.thumbnailUrl) || /^https?:\/\//i.test(post.thumbnailUrl) || post.thumbnailUrl.startsWith('/api/apps/')) ? post.thumbnailUrl : undefined,
    duration: post.duration,
    videoDurationSeconds: typeof post.videoDurationSeconds === 'number' && Number.isFinite(post.videoDurationSeconds) && post.videoDurationSeconds >= 0 ? post.videoDurationSeconds : undefined,
    category: post.category, title: typeof post.title === 'string' && post.title.trim() ? post.title.trim() : undefined,
    caption: post.caption, description: typeof post.description === 'string' && post.description.trim() ? post.description.trim() : undefined,
    hashtags: readHashtags(post.hashtags), sound: typeof post.sound === 'string' && post.sound.trim() ? post.sound : `Original sound · ${post.creatorName}`,
    visibility: post.visibility, featured: post.featured === true, engagement: readEngagement(post.engagement), createdAt: post.createdAt,
    sourceVideoId: typeof post.sourceVideoId === 'string' && post.sourceVideoId.trim() ? post.sourceVideoId : undefined,
    socialPostId: typeof post.socialPostId === 'string' && post.socialPostId.trim() ? post.socialPostId : undefined,
  }
}

async function loadRecords(scope?: { scope: 'user' }) {
  const result = scope ? await window.genmb.kv.list(postPrefix, scope) : await window.genmb.kv.list(postPrefix)
  return result.data.map((entry) => readStoredPost(entry.value)).filter((post): post is StoredPost => Boolean(post))
}

// Resolve creator branding at read time so older posts reflect later profile edits.
export async function withCurrentCreatorProfiles(posts: StoredPost[]): Promise<StoredPost[]> {
  const ids = [...new Set(posts.map((post) => post.creatorId))]
  const profiles = new Map(await Promise.all(ids.map(async (id) => [id, readStoredProfile(await window.genmb.kv.get(profileKey(id)))] as const)))
  return posts.map((post) => {
    const profile = profiles.get(post.creatorId)
    if (!profile) return post
    const isChannel = post.post_type === 'channel'
    const avatar = isChannel
      ? profile.channelAvatarUrl || `https://picsum.photos/seed/zivo-channel-${post.creatorId}/96/96`
      : profile.avatarUrl || post.creatorAvatar
    const name = (isChannel ? profile.channelName : profile.displayName) || post.creatorName
    return { ...post, creatorName: name, creatorHandle: profile.username || post.creatorHandle, creatorAvatar: avatar,
      creatorProfile: { userId: post.creatorId, displayName: name, username: profile.username || post.creatorHandle, avatarUrl: avatar } }
  })
}

export async function loadPosts(): Promise<StoredPost[]> {
  return (await withCurrentCreatorProfiles((await loadRecords()).filter((post) => post.visibility === 'Public'))).sort((a, b) => b.createdAt - a.createdAt)
}

export async function loadPost(id: string): Promise<StoredPost | null> {
  if (!id.trim()) return null
  const publicPost = readStoredPost(await window.genmb.kv.get(`${postPrefix}${id}`))
  if (publicPost) return (await withCurrentCreatorProfiles([publicPost]))[0]
  await window.genmb.auth.ready()
  if (!window.genmb.auth.getUser()) return null
  const privatePost = readStoredPost(await window.genmb.kv.get(`${postPrefix}${id}`, { scope: 'user' }))
  return privatePost ? (await withCurrentCreatorProfiles([privatePost]))[0] : null
}

export async function loadCreatorPosts(creatorId: string): Promise<StoredPost[]> {
  if (!creatorId.trim()) return []
  const publicPosts = (await loadRecords()).filter((post) => post.visibility === 'Public' || post.visibility === 'Unlisted')
  await window.genmb.auth.ready()
  const user = window.genmb.auth.getUser()
  const privatePosts = user?.id === creatorId ? await loadRecords({ scope: 'user' }) : []
  return (await withCurrentCreatorProfiles([...new Map([...publicPosts, ...privatePosts].filter((post) => post.creatorId === creatorId && (user?.id === creatorId || post.visibility === 'Public')).map((post) => [post.id, post])).values()]))
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function loadCreatorLongFormVideos(creatorId: string) {
  return (await loadCreatorPosts(creatorId)).filter((post) => post.format === 'video' && post.mediaType === 'video')
}

export type CreatorPostUpdate = Pick<StoredPost, 'title' | 'description' | 'hashtags' | 'visibility' | 'thumbnailUrl'>

async function requirePostOwner(creatorId: string, postId: string) {
  await window.genmb.auth.ready()
  const user = window.genmb.auth.getUser()
  if (!user) throw new Error('Sign in to manage your content.')
  if (user.id !== creatorId) throw new Error('You can only manage content from your own ZIVO account.')
  const post = await loadPost(postId)
  if (!post || post.creatorId !== user.id) throw new Error('This content is unavailable or does not belong to your account.')
  return post
}

export async function updateCreatorPost({ creatorId, postId, title, description, hashtags, visibility, thumbnailUrl }: {
  creatorId: string; postId: string; title?: string; description?: string; hashtags: string[]; visibility: PostVisibility; thumbnailUrl?: string
}) {
  const post = await requirePostOwner(creatorId, postId)
  if (!isVisibility(visibility)) throw new Error('Choose a valid visibility setting.')
  const updated = { ...post, title: validateText(title || '', 'Video title', 120) || undefined, description: validateText(description || '', 'Description', 2000) || undefined, hashtags: readHashtags(validateHashtags(hashtags)), visibility, thumbnailUrl: thumbnailUrl ?? post.thumbnailUrl, featured: visibility === 'Public' && post.featured === true }
  await window.genmb.kv.set(`${postPrefix}${post.id}`, updated, postStorageOptions(updated.visibility))
  if (Boolean(postStorageOptions(post.visibility)) !== Boolean(postStorageOptions(updated.visibility))) {
    await window.genmb.kv.delete(`${postPrefix}${post.id}`, postStorageOptions(post.visibility))
  }
  window.dispatchEvent(new CustomEvent<StoredPost>(localPostUpdatedEvent, { detail: updated }))
  return updated
}

export async function setCreatorPostVisibility({ creatorId, postId, visibility }: { creatorId: string; postId: string; visibility: 'Public' | 'Unlisted' | 'Private' }) {
  const post = await requirePostOwner(creatorId, postId)
  return updateCreatorPost({ creatorId, postId, title: post.title, description: post.description, hashtags: post.hashtags, visibility })
}

export async function setCreatorPostFeatured({ creatorId, postId, featured }: { creatorId: string; postId: string; featured: boolean }) {
  const post = await requirePostOwner(creatorId, postId)
  if (featured && post.visibility !== 'Public') throw new Error('Only public videos can be featured on your profile.')
  if (post.mediaType !== 'video') throw new Error('Only videos and Shorts can be featured.')
  const previous = (await loadCreatorPosts(creatorId)).find((item) => item.featured && item.id !== postId)
  if (featured && previous) {
    await window.genmb.kv.set(`${postPrefix}${previous.id}`, { ...previous, featured: false }, postStorageOptions(previous.visibility))
  }
  const updated = { ...post, featured }
  await window.genmb.kv.set(`${postPrefix}${post.id}`, updated, postStorageOptions(post.visibility))
  return updated
}

export async function deleteCreatorPost({ creatorId, postId }: { creatorId: string; postId: string }) {
  const post = await requirePostOwner(creatorId, postId)
  const result = await window.genmb.kv.delete(`${postPrefix}${postId}`, postStorageOptions(post.visibility))
  if (!result.deleted) throw new Error('The post could not be deleted. Please refresh and try again.')
  window.dispatchEvent(new CustomEvent(localPostDeletedEvent, { detail: postId }))
}

export async function createPost({ user, mediaType, format, title, caption, description, hashtags, sound, visibility, media, videoDurationSeconds, sourceVideoId, idempotencyKey, thumbnailUrl, channelId, post_type }: {
  user: GenMBUser; mediaType: StoredPost['mediaType']; format: PostFormat; title?: string; caption: string; description?: string; hashtags: string[]; sound?: string; visibility: PostVisibility
  media: { url: string; filename: string; contentType: string; size: number; alt: string }; videoDurationSeconds?: number; sourceVideoId?: string; idempotencyKey: string; thumbnailUrl?: string; channelId?: string; post_type: 'personal' | 'channel'
}): Promise<StoredPost> {
  await window.genmb.auth.ready()
  const sessionUser = window.genmb.auth.getUser()
  if (!sessionUser || sessionUser.id !== user.id) throw new Error('Sign in to publish to your ZIVO account.')
  const safeCaption = validateText(caption, 'Caption', 500, true)
  const safeTitle = validateText(title || '', 'Video title', 120)
  const safeDescription = validateText(description || '', 'Description', 2000)
  const safeHashtags = validateHashtags(hashtags)
  if (!idempotencyKey.trim()) throw new Error('A publish request identifier is required.')
  if (!isVisibility(visibility)) throw new Error('Choose a valid visibility setting.')
  const options = postStorageOptions(visibility)
  const requestKey = `${publishRequestPrefix}${idempotencyKey}`
  const existing = readStoredPost(await window.genmb.kv.get(requestKey, options))
  if (existing) return existing
  if (sourceVideoId?.trim() && (format !== 'short' || mediaType !== 'video')) throw new Error('Only a video Short can be linked to a source video.')
  const profile = readStoredProfile(await window.genmb.kv.get(profileKey(sessionUser.id)))
  if (post_type !== 'personal' && post_type !== 'channel') throw new Error('Choose a publishing identity.')
  if (post_type === 'channel' && (channelId !== sessionUser.id || !profile?.channelName?.trim())) throw new Error('This channel is not available on your account. Update your profile and try again.')
  if (post_type === 'personal' && channelId) throw new Error('Personal posts cannot be linked to a channel.')
  const fallbackName = sessionUser.name.trim() || sessionUser.email.split('@')[0] || 'ZIVO creator'
  const creatorName = (post_type === 'channel' ? profile?.channelName : profile?.displayName)?.trim() || fallbackName
  const username = profile?.username.trim().replace(/^@/, '') || sessionUser.email.split('@')[0].replace(/[^a-zA-Z0-9_.]/g, '') || 'zivo'
  const creatorAvatar = post_type === 'channel' ? profile?.channelAvatarUrl || `https://picsum.photos/seed/zivo-channel-${sessionUser.id}/96/96` : profile?.avatarUrl || sessionUser.picture || `https://picsum.photos/seed/zivo-post-${sessionUser.id}-avatar/96/96`
  const durationSeconds = typeof videoDurationSeconds === 'number' && Number.isFinite(videoDurationSeconds) && videoDurationSeconds >= 0 ? Math.floor(videoDurationSeconds) : undefined
  const details = format === 'photo' ? { duration: 'Photo', category: 'Photo moment' } : format === 'short' ? { duration: formatVideoDuration(durationSeconds) === 'Video' ? 'Short video' : formatVideoDuration(durationSeconds), category: 'Short video' } : { duration: formatVideoDuration(durationSeconds), category: 'Long video' }
  const post: StoredPost = {
    id: crypto.randomUUID(), contentType: 'post', creatorId: sessionUser.id, channelId: post_type === 'channel' ? channelId : undefined, post_type, creatorName, creatorHandle: `@${username}`, creatorAvatar,
    creatorProfile: { userId: sessionUser.id, displayName: creatorName, username: `@${username}`, avatarUrl: creatorAvatar },
    mediaType, format, mediaRef: media.url, mediaUrl: media.url, mediaAlt: media.alt.trim() || `${creatorName}'s post`, thumbnailUrl, duration: details.duration,
    videoDurationSeconds: format === 'photo' ? undefined : durationSeconds, category: details.category, title: safeTitle || undefined,
    caption: safeCaption, description: safeDescription || undefined, hashtags: readHashtags(safeHashtags), sound: sound?.trim() || `Original sound · ${creatorName}`,
    visibility, engagement: { likeCount: 0, commentCount: 0, saveCount: 0 }, createdAt: Date.now(), sourceVideoId: sourceVideoId?.trim() || undefined,
  }
  await window.genmb.kv.set(`${postPrefix}${post.id}`, post, options)
  await window.genmb.kv.set(requestKey, post, options)
  window.dispatchEvent(new CustomEvent<StoredPost>(localPostPublishedEvent, { detail: post }))
  return post
}

export async function loadShorts(): Promise<StoredPost[]> {
  const posts = await loadPosts();
  return posts.filter(p => p.mediaType === "video" || p.format === "video");
}
