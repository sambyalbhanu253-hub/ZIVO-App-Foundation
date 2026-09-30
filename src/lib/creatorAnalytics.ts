import { loadCreatorEarningRecords, type CreatorEarningRecord } from './monetization'
import { loadCreatorPosts, type StoredPost } from './posts'
import { loadLiveSessions, type ZivoLiveSession } from './live'
import { readFollowRelationship } from '../hooks/useFollowedCreators'

type AnalyticsPeriod = '7' | '30' | 'all'
type EngagementEvent = { contentId: string; createdAt: number }

type CreatorContentAnalytics = {
  post: StoredPost
  likes: EngagementEvent[]
  comments: EngagementEvent[]
  saves: EngagementEvent[]
}

export type CreatorAnalyticsSnapshot = {
  posts: CreatorContentAnalytics[]
  followerCount: number
  followerEvents: number[]
  liveSessions: ZivoLiveSession[]
  earnings: CreatorEarningRecord[]
}

export type ContentMetric = {
  id: string
  format: StoredPost['format']
  title: string
  createdAt: number
  likes: number
  comments: number
  saves: number
  views: null
}

function readTimestampedContentEvent(value: unknown, contentId: string, contentTypes: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const event = value as Record<string, unknown>
  if (
    event.contentId !== contentId ||
    !contentTypes.includes(String(event.contentType)) ||
    typeof event.createdAt !== 'number' ||
    !Number.isFinite(event.createdAt)
  ) return null
  return { contentId, createdAt: event.createdAt } satisfies EngagementEvent
}

function readSavedEvent(value: unknown, contentId: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const event = value as Record<string, unknown>
  if (
    event.id !== contentId ||
    !['post', 'short'].includes(String(event.contentType)) ||
    typeof event.savedAt !== 'number' ||
    !Number.isFinite(event.savedAt)
  ) return null
  return { contentId, createdAt: event.savedAt } satisfies EngagementEvent
}

function withinPeriod(timestamp: number, period: AnalyticsPeriod, now = Date.now()) {
  if (period === 'all') return true
  return timestamp >= now - Number(period) * 24 * 60 * 60 * 1000
}

export function analyticsPeriodLabel(period: AnalyticsPeriod) {
  return period === '7' ? 'Last 7 days' : period === '30' ? 'Last 30 days' : 'All time'
}

export function filterCreatorAnalytics(snapshot: CreatorAnalyticsSnapshot, period: AnalyticsPeriod, now = Date.now()) {
  const content = snapshot.posts
    .filter(({ post }) => withinPeriod(post.createdAt, period, now))
    .map(({ post, likes, comments, saves }): ContentMetric => ({
      id: post.id,
      format: post.format,
      title: post.title || post.caption || 'Untitled post',
      createdAt: post.createdAt,
      likes: likes.filter((event) => withinPeriod(event.createdAt, period, now)).length,
      comments: comments.filter((event) => withinPeriod(event.createdAt, period, now)).length,
      saves: saves.filter((event) => withinPeriod(event.createdAt, period, now)).length,
      views: null,
    }))
    .sort((first, second) => second.createdAt - first.createdAt)

  const totalLikes = snapshot.posts.reduce((total, item) => total + item.likes.filter((event) => withinPeriod(event.createdAt, period, now)).length, 0)
  const totalComments = snapshot.posts.reduce((total, item) => total + item.comments.filter((event) => withinPeriod(event.createdAt, period, now)).length, 0)
  const totalSaves = snapshot.posts.reduce((total, item) => total + item.saves.filter((event) => withinPeriod(event.createdAt, period, now)).length, 0)
  const followersGained = snapshot.followerEvents.filter((timestamp) => withinPeriod(timestamp, period, now)).length
  const liveSessions = snapshot.liveSessions.filter((session) => withinPeriod(session.createdAt, period, now))
  const sessionsWithViewerData = liveSessions.filter((session) => typeof session.currentViewerCount === 'number')
  const earnings = snapshot.earnings.filter((record) => withinPeriod(record.timestamp, period, now) && record.status !== 'reversed')
  const topContent = [...content]
    .filter((item) => item.likes + item.comments + item.saves > 0)
    .sort((first, second) => {
      const firstScore = first.likes + first.comments + first.saves
      const secondScore = second.likes + second.comments + second.saves
      return secondScore - firstScore || second.createdAt - first.createdAt
    })
    .slice(0, 3)

  return {
    content,
    topContent,
    totalLikes,
    totalComments,
    totalSaves,
    followerCount: snapshot.followerCount,
    followersGained,
    liveSessions,
    viewerDataAvailable: sessionsWithViewerData.length > 0,
    recordedViewerCount: sessionsWithViewerData.reduce((total, session) => total + (session.currentViewerCount ?? 0), 0),
    earnings,
  }
}

export async function loadCreatorAnalytics(creatorId: string): Promise<CreatorAnalyticsSnapshot> {
  await window.genmb.auth.ready()
  const sessionUser = window.genmb.auth.getUser()
  if (!sessionUser) throw new Error('Sign in to view your private creator analytics.')
  if (sessionUser.id !== creatorId) throw new Error('Creator analytics are only available to the account that owns them.')

  const [posts, follows, saves, liveSessions, earnings] = await Promise.all([
    loadCreatorPosts(creatorId),
    window.genmb.kv.list('zivo:follow:'),
    window.genmb.kv.list('zivo:save:'),
    loadLiveSessions(),
    loadCreatorEarningRecords(creatorId),
  ])

  const followers = new Map<string, number>()
  follows.data
    .map((entry) => readFollowRelationship(entry.value))
    .filter((relationship) => relationship?.targetId === creatorId)
    .forEach((relationship) => {
      if (relationship) followers.set(relationship.followerId, relationship.createdAt)
    })

  const contentAnalytics = await Promise.all(posts.map(async (post) => {
    const [postLikes, shortLikes, postComments, shortComments] = await Promise.all([
      window.genmb.kv.list(`zivo:like:public:post:${post.id}:`),
      window.genmb.kv.list(`zivo:like:public:short:${post.id}:`),
      window.genmb.kv.list(`zivo:comment:public:post:${post.id}:`),
      window.genmb.kv.list(`zivo:comment:public:short:${post.id}:`),
    ])
    const likes = [...postLikes.data, ...shortLikes.data]
      .map((entry) => readTimestampedContentEvent(entry.value, post.id, ['post', 'short']))
      .filter((event): event is EngagementEvent => Boolean(event))
    const comments = [...postComments.data, ...shortComments.data]
      .map((entry) => readTimestampedContentEvent(entry.value, post.id, ['post', 'short']))
      .filter((event): event is EngagementEvent => Boolean(event))
    const savesForContent = saves.data
      .map((entry) => readSavedEvent(entry.value, post.id))
      .filter((event): event is EngagementEvent => Boolean(event))
    return { post, likes, comments, saves: savesForContent }
  }))

  return {
    posts: contentAnalytics,
    followerCount: followers.size,
    followerEvents: [...followers.values()],
    liveSessions: liveSessions.filter((session) => session.creatorId === creatorId),
    earnings,
  }
}

export type { AnalyticsPeriod }
