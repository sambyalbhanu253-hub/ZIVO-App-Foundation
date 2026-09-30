import {
  isValidCommunitySlug,
  loadCommunity,
  membershipKey,
  normalizeCommunitySlug,
  readCommunityMembership,
} from './communities'
import { profileKey } from './profiles'

export type ZivoCommunityPostMedia = {
  url: string
  contentType: string
  filename?: string
}

export type ZivoCommunityPost = {
  id: string
  communityId: string
  authorUserId: string
  authorProfileRef: string
  text: string
  media?: ZivoCommunityPostMedia
  createdAt: number
}

export const communityPostPrefix = 'zivo:community-post:'

export function communityPostKey(communityId: string, postId: string) {
  return `${communityPostPrefix}${normalizeCommunitySlug(communityId)}:${postId}`
}

export function readCommunityPost(value: unknown, communityId?: string): ZivoCommunityPost | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const normalizedCommunityId = typeof record.communityId === 'string' ? normalizeCommunitySlug(record.communityId) : ''
  const media = record.media

  if (
    typeof record.id !== 'string' ||
    !record.id.trim() ||
    !isValidCommunitySlug(normalizedCommunityId) ||
    (communityId && normalizedCommunityId !== normalizeCommunitySlug(communityId)) ||
    typeof record.authorUserId !== 'string' ||
    !record.authorUserId.trim() ||
    typeof record.authorProfileRef !== 'string' ||
    record.authorProfileRef !== profileKey(record.authorUserId) ||
    typeof record.text !== 'string' ||
    record.text.length > 1000 ||
    typeof record.createdAt !== 'number' ||
    !Number.isFinite(record.createdAt)
  ) return null

  let parsedMedia: ZivoCommunityPostMedia | undefined
  if (media !== undefined) {
    if (!media || typeof media !== 'object' || Array.isArray(media)) return null
    const mediaRecord = media as Record<string, unknown>
    if (
      typeof mediaRecord.url !== 'string' ||
      !mediaRecord.url.trim() ||
      typeof mediaRecord.contentType !== 'string' ||
      !mediaRecord.contentType.trim() ||
      (mediaRecord.filename !== undefined && typeof mediaRecord.filename !== 'string')
    ) return null
    parsedMedia = {
      url: mediaRecord.url,
      contentType: mediaRecord.contentType,
      filename: typeof mediaRecord.filename === 'string' && mediaRecord.filename.trim() ? mediaRecord.filename : undefined,
    }
  }

  if (!record.text.trim() && !parsedMedia) return null

  return {
    id: record.id,
    communityId: normalizedCommunityId,
    authorUserId: record.authorUserId,
    authorProfileRef: record.authorProfileRef,
    text: record.text.trim(),
    media: parsedMedia,
    createdAt: record.createdAt,
  }
}

export async function loadCommunityPosts(communityId: string) {
  const normalizedCommunityId = normalizeCommunitySlug(communityId)
  if (!isValidCommunitySlug(normalizedCommunityId)) return []

  const result = await window.genmb.kv.list(`${communityPostPrefix}${normalizedCommunityId}:`)
  return result.data
    .map((entry) => readCommunityPost(entry.value, normalizedCommunityId))
    .filter((post): post is ZivoCommunityPost => post !== null)
    .sort((first, second) => second.createdAt - first.createdAt)
}

function createPostId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function createCommunityPost(input: {
  communityId: string
  authorUserId: string
  text: string
  media?: ZivoCommunityPostMedia
}) {
  const communityId = normalizeCommunitySlug(input.communityId)
  const authorUserId = input.authorUserId.trim()
  const text = input.text.trim()
  if (!isValidCommunitySlug(communityId)) throw new Error('This community is unavailable.')
  if (!authorUserId) throw new Error('You need to be signed in to post in a community.')
  if (text.length > 1000) throw new Error('Keep your post under 1,000 characters.')
  if (!text && !input.media?.url.trim()) throw new Error('Add a caption or media before posting.')

  const community = await loadCommunity(communityId)
  if (!community) throw new Error('This community is unavailable.')

  const membership = readCommunityMembership(await window.genmb.kv.get(membershipKey(community.slug, authorUserId)))
  const isMember = community.ownerId === authorUserId || (
    membership?.communitySlug === community.slug && membership.userId === authorUserId
  )
  if (!isMember) throw new Error('Join this community before sharing a post.')

  const media = input.media?.url.trim()
    ? {
        url: input.media.url.trim(),
        contentType: input.media.contentType.trim() || 'application/octet-stream',
        filename: input.media.filename?.trim() || undefined,
      }
    : undefined
  const post: ZivoCommunityPost = {
    id: createPostId(),
    communityId: community.slug,
    authorUserId,
    authorProfileRef: profileKey(authorUserId),
    text,
    media,
    createdAt: Date.now(),
  }

  await window.genmb.kv.set(communityPostKey(community.slug, post.id), post)
  return post
}
