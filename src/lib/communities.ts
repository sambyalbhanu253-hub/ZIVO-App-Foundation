export type ZivoCommunity = {
  id: string
  slug: string
  name: string
  description: string
  ownerId: string
  createdAt: number
  avatarUrl?: string
}

export type ZivoCommunityMembership = {
  communitySlug: string
  userId: string
  joinedAt: number
}

export const communityPrefix = 'zivo:community:'
export const communityMembershipPrefix = 'zivo:community-member:'

export function normalizeCommunitySlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function isValidCommunitySlug(value: string) {
  return /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9]|[a-z0-9])$/.test(value)
}

export function communityKey(slug: string) {
  return `${communityPrefix}${normalizeCommunitySlug(slug)}`
}

export function membershipKey(slug: string, userId: string) {
  return `${communityMembershipPrefix}${normalizeCommunitySlug(slug)}:${userId}`
}

export function readCommunity(value: unknown): ZivoCommunity | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (
    typeof record.id !== 'string' ||
    typeof record.slug !== 'string' ||
    typeof record.name !== 'string' ||
    typeof record.description !== 'string' ||
    typeof record.ownerId !== 'string' ||
    typeof record.createdAt !== 'number'
  ) return null

  const slug = normalizeCommunitySlug(record.slug)
  const name = record.name.trim()
  const description = record.description.trim()
  if (!isValidCommunitySlug(slug) || record.id !== slug || !name || name.length > 60 || !description || description.length > 500 || !record.ownerId.trim() || !Number.isFinite(record.createdAt)) return null

  return {
    id: slug,
    slug,
    name,
    description,
    ownerId: record.ownerId,
    createdAt: record.createdAt,
    avatarUrl: typeof record.avatarUrl === 'string' && record.avatarUrl.trim() ? record.avatarUrl : undefined,
  }
}

export function readCommunityMembership(value: unknown): ZivoCommunityMembership | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.communitySlug !== 'string' || typeof record.userId !== 'string' || typeof record.joinedAt !== 'number') return null
  const communitySlug = normalizeCommunitySlug(record.communitySlug)
  if (!isValidCommunitySlug(communitySlug) || !record.userId.trim() || !Number.isFinite(record.joinedAt)) return null
  return { communitySlug, userId: record.userId, joinedAt: record.joinedAt }
}

export async function loadCommunities() {
  const result = await window.genmb.kv.list(communityPrefix)
  return result.data
    .map((entry) => readCommunity(entry.value))
    .filter((community): community is ZivoCommunity => Boolean(community))
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function loadCommunity(slug: string) {
  const normalizedSlug = normalizeCommunitySlug(slug)
  if (!isValidCommunitySlug(normalizedSlug)) return null
  return readCommunity(await window.genmb.kv.get(communityKey(normalizedSlug)))
}

export async function loadCommunityMemberships(slug: string) {
  const normalizedSlug = normalizeCommunitySlug(slug)
  if (!isValidCommunitySlug(normalizedSlug)) return []
  const result = await window.genmb.kv.list(`${communityMembershipPrefix}${normalizedSlug}:`)
  const members = new Map<string, ZivoCommunityMembership>()
  result.data.map((entry) => readCommunityMembership(entry.value)).forEach((membership) => {
    if (membership && membership.communitySlug === normalizedSlug) members.set(membership.userId, membership)
  })
  return [...members.values()]
}

export async function createCommunity(input: { name: string; slug: string; description: string; ownerId: string; avatarUrl?: string }) {
  const slug = normalizeCommunitySlug(input.slug)
  const name = input.name.trim()
  const description = input.description.trim()
  if (!isValidCommunitySlug(slug)) throw new Error('Use a unique slug with 3–40 lowercase letters, numbers, or hyphens.')
  if (name.length < 3 || name.length > 60) throw new Error('Use a community name between 3 and 60 characters.')
  if (description.length < 10 || description.length > 500) throw new Error('Use a description between 10 and 500 characters.')
  if (!input.ownerId.trim()) throw new Error('You need to be signed in to create a community.')

  const key = communityKey(slug)
  if (await window.genmb.kv.get(key)) throw new Error('That community identifier is already in use.')

  const community: ZivoCommunity = {
    id: slug,
    slug,
    name,
    description,
    ownerId: input.ownerId,
    createdAt: Date.now(),
    avatarUrl: input.avatarUrl?.trim() || undefined,
  }
  await window.genmb.kv.set(key, community)
  await window.genmb.kv.set(membershipKey(slug, input.ownerId), { communitySlug: slug, userId: input.ownerId, joinedAt: community.createdAt } satisfies ZivoCommunityMembership)
  return community
}

export async function joinCommunity(slug: string, userId: string) {
  const community = await loadCommunity(slug)
  if (!community) throw new Error('This community is unavailable.')
  if (!userId.trim()) throw new Error('You need to be signed in to join a community.')
  const key = membershipKey(community.slug, userId)
  const existing = await window.genmb.kv.get(key)
  const membership = readCommunityMembership(existing)
  if (membership && membership.userId === userId && membership.communitySlug === community.slug) return { joined: false, community }
  if (existing) throw new Error('This membership record is invalid and cannot be replaced automatically.')
  await window.genmb.kv.set(key, { communitySlug: community.slug, userId, joinedAt: Date.now() } satisfies ZivoCommunityMembership)
  return { joined: true, community }
}

export async function leaveCommunity(slug: string, userId: string) {
  const community = await loadCommunity(slug)
  if (!community) throw new Error('This community is unavailable.')
  if (community.ownerId === userId) throw new Error('Community owners stay members of their own community.')
  const key = membershipKey(community.slug, userId)
  const membership = readCommunityMembership(await window.genmb.kv.get(key))
  if (!membership || membership.userId !== userId || membership.communitySlug !== community.slug) return { left: false, community }
  await window.genmb.kv.delete(key)
  return { left: true, community }
}
