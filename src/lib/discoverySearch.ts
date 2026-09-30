import { communityPrefix, readCommunity, type ZivoCommunity } from './communities'
import { postPrefix, readStoredPost, type StoredPost } from './posts'
import { profilePrefix, readStoredProfile, type StoredProfile } from './profiles'

export type SearchCreatorResult = StoredProfile & {
  userId: string
}

export type ZivoSearchResults = {
  content: StoredPost[]
  creators: SearchCreatorResult[]
  communities: ZivoCommunity[]
}

function normalizedSearchTerm(value: string) {
  return value.trim().toLocaleLowerCase()
}

function matchesSearch(value: string, query: string) {
  const haystack = value.toLocaleLowerCase()
  const compactQuery = query.replace(/^[@#]+/, '')
  if (haystack.includes(query)) return true
  if (compactQuery && haystack.includes(compactQuery)) return true

  const terms = compactQuery.split(/\s+/).filter(Boolean)
  return terms.length > 1 && terms.every((term) => haystack.includes(term))
}

function uniqueById<T extends { id: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()]
}

/**
 * Queries persisted ZIVO KV collections only after the caller has debounced input.
 * KV exposes prefix scans rather than a text-query API, so the query is filtered
 * in memory after reading the three relevant, persisted collections in parallel.
 */
export async function searchPersistedZivoData(searchTerm: string): Promise<ZivoSearchResults> {
  const query = normalizedSearchTerm(searchTerm)
  if (!query) return { content: [], creators: [], communities: [] }

  const [postRecords, profileRecords, communityRecords] = await Promise.all([
    window.genmb.kv.list(postPrefix),
    window.genmb.kv.list(profilePrefix),
    window.genmb.kv.list(communityPrefix),
  ])

  const content = uniqueById(
    postRecords.data
      .map((entry) => readStoredPost(entry.value))
      .filter((post): post is StoredPost => Boolean(post))
      .filter((post) => matchesSearch([
        post.caption,
        post.hashtags.join(' '),
        post.category,
        post.creatorName,
        post.creatorHandle,
        post.creatorProfile.displayName,
        post.creatorProfile.username,
      ].join(' '), query))
      .sort((first, second) => second.createdAt - first.createdAt),
  )

  const creators = uniqueById(
    profileRecords.data
      .map((entry) => {
        const profile = readStoredProfile(entry.value)
        const userId = entry.key.slice(profilePrefix.length)
        return profile && userId ? { ...profile, id: userId, userId } : null
      })
      .filter((profile): profile is SearchCreatorResult & { id: string } => Boolean(profile))
      .filter((profile) => matchesSearch(`${profile.displayName} ${profile.username} ${profile.bio}`, query))
      .sort((first, second) => first.displayName.localeCompare(second.displayName)),
  ).map(({ id: _id, ...profile }) => profile)

  const communities = uniqueById(
    communityRecords.data
      .map((entry) => readCommunity(entry.value))
      .filter((community): community is ZivoCommunity => Boolean(community))
      .filter((community) => matchesSearch(`${community.name} ${community.slug} ${community.description}`, query))
      .sort((first, second) => second.createdAt - first.createdAt),
  )

  return { content, creators, communities }
}
