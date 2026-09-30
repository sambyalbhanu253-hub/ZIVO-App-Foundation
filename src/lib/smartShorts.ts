import { loadPost } from './posts'

export type ZivoSmartShortIdea = {
  id: string
  hook: string
  title: string
  caption: string
  hashtags: string[]
  suggestedDuration: string
  suggestedClip: string
}

export type ZivoSmartShortPlan = {
  version: 1
  id: string
  sourceVideoId: string
  creatorId: string
  selectedIdeaId: string
  title: string
  caption: string
  hashtags: string[]
  suggestedDuration: string
  suggestedClip: string
  creationTimestamp: number
  status: 'ready-for-publish' | 'published'
  shortContentId?: string
  publishedAt?: number
}

export const smartShortPlanPrefix = 'zivo:smart-short-plan:'
export const smartShortPlanKey = (creatorId: string, planId: string) => `${smartShortPlanPrefix}${creatorId}:${planId}`

function readHashtags(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean))]
    : []
}

export function readSmartShortPlan(value: unknown): ZivoSmartShortPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const plan = value as Record<string, unknown>
  if (
    plan.version !== 1 ||
    typeof plan.id !== 'string' ||
    typeof plan.sourceVideoId !== 'string' ||
    typeof plan.creatorId !== 'string' ||
    typeof plan.selectedIdeaId !== 'string' ||
    typeof plan.title !== 'string' ||
    typeof plan.caption !== 'string' ||
    typeof plan.suggestedDuration !== 'string' ||
    typeof plan.suggestedClip !== 'string' ||
    typeof plan.creationTimestamp !== 'number' ||
    (plan.status !== 'ready-for-publish' && plan.status !== 'published')
  ) return null

  return {
    version: 1,
    id: plan.id,
    sourceVideoId: plan.sourceVideoId,
    creatorId: plan.creatorId,
    selectedIdeaId: plan.selectedIdeaId,
    title: plan.title,
    caption: plan.caption,
    hashtags: readHashtags(plan.hashtags),
    suggestedDuration: plan.suggestedDuration,
    suggestedClip: plan.suggestedClip,
    creationTimestamp: plan.creationTimestamp,
    status: plan.status,
    shortContentId: typeof plan.shortContentId === 'string' ? plan.shortContentId : undefined,
    publishedAt: typeof plan.publishedAt === 'number' ? plan.publishedAt : undefined,
  }
}

export async function createSmartShortPlan({
  creatorId,
  sourceVideoId,
  idea,
}: {
  creatorId: string
  sourceVideoId: string
  idea: ZivoSmartShortIdea
}): Promise<ZivoSmartShortPlan> {
  await window.genmb.auth.ready()
  const user = window.genmb.auth.getUser()
  if (!user || user.id !== creatorId) throw new Error('Sign in to prepare a Short from your video.')
  if (!sourceVideoId.trim()) throw new Error('This source video is unavailable.')
  const source = await loadPost(sourceVideoId)
  if (!source || source.creatorId !== user.id || source.format !== 'video' || source.mediaType !== 'video') {
    throw new Error('Only the creator of an existing long-form video can make a Short from it.')
  }
  const plan: ZivoSmartShortPlan = {
    version: 1,
    id: crypto.randomUUID(),
    sourceVideoId,
    creatorId,
    selectedIdeaId: idea.id,
    title: idea.title.trim(),
    caption: idea.caption.trim(),
    hashtags: readHashtags(idea.hashtags),
    suggestedDuration: idea.suggestedDuration.trim(),
    suggestedClip: idea.suggestedClip.trim(),
    creationTimestamp: Date.now(),
    status: 'ready-for-publish',
  }
  await window.genmb.kv.set(smartShortPlanKey(creatorId, plan.id), plan)
  return plan
}

export async function loadSmartShortPlan(creatorId: string, planId: string) {
  if (!creatorId.trim() || !planId.trim()) return null
  const plan = readSmartShortPlan(await window.genmb.kv.get(smartShortPlanKey(creatorId, planId)))
  return plan?.creatorId === creatorId ? plan : null
}

export async function markSmartShortPlanPublished({ creatorId, planId, shortContentId }: { creatorId: string; planId: string; shortContentId: string }) {
  await window.genmb.auth.ready()
  const user = window.genmb.auth.getUser()
  if (!user || user.id !== creatorId) throw new Error('Sign in to finish creating this Short.')
  const plan = await loadSmartShortPlan(creatorId, planId)
  if (!plan) throw new Error('This Short plan is no longer available.')
  if (plan.status === 'published') return plan
  const nextPlan: ZivoSmartShortPlan = { ...plan, status: 'published', shortContentId, publishedAt: Date.now() }
  await window.genmb.kv.set(smartShortPlanKey(creatorId, planId), nextPlan)
  return nextPlan
}
