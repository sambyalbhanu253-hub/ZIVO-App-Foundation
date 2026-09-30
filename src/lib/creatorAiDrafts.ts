export type ZivoShortIdea = {
  hook: string
  title: string
  concept: string
  duration: string
  keyMoment: string
}

export type ZivoCreatorAiDraft = {
  version: 1
  creatorId: string
  topic: string
  title: string
  caption: string
  description: string
  hashtags: string
  captionSuggestions: string[]
  titleSuggestions: string[]
  descriptionSuggestions: string[]
  hashtagSuggestions: string[]
  shortIdeas: ZivoShortIdea[]
  assistantQuestion: string
  assistantResponse: string
  translationFoundation: {
    primaryLanguageCode: string
    translations: Array<{ languageCode: string; title: string; caption: string; description: string; createdAt: number }>
    dubbingVersions: Array<{ targetLanguageCode: string; status: 'unavailable' | 'processing' | 'ready' | 'failed'; mediaRef?: string; updatedAt: number }>
  }
  updatedAt: number
}

export const creatorAiDraftKey = (creatorId: string) => `zivo:creator-ai-draft:${creatorId}:current`

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : []
}

function readShortIdeas(value: unknown): ZivoShortIdea[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const idea = item as Record<string, unknown>
    if (typeof idea.hook !== 'string' || typeof idea.title !== 'string' || typeof idea.concept !== 'string' || typeof idea.duration !== 'string' || typeof idea.keyMoment !== 'string') return []
    return [{ hook: idea.hook, title: idea.title, concept: idea.concept, duration: idea.duration, keyMoment: idea.keyMoment }]
  })
}

export function readCreatorAiDraft(value: unknown): ZivoCreatorAiDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const draft = value as Record<string, unknown>
  if (draft.version !== 1 || typeof draft.creatorId !== 'string' || typeof draft.updatedAt !== 'number') return null
  const updatedAt = draft.updatedAt
  const translation = draft.translationFoundation && typeof draft.translationFoundation === 'object' && !Array.isArray(draft.translationFoundation)
    ? draft.translationFoundation as Record<string, unknown>
    : {}
  const translations = Array.isArray(translation.translations)
    ? translation.translations.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        const record = item as Record<string, unknown>
        if (typeof record.languageCode !== 'string' || typeof record.createdAt !== 'number') return []
        return [{ languageCode: record.languageCode, title: typeof record.title === 'string' ? record.title : '', caption: typeof record.caption === 'string' ? record.caption : '', description: typeof record.description === 'string' ? record.description : '', createdAt: record.createdAt }]
      })
    : []
  const legacyCaptionTranslations = Array.isArray(translation.captionTranslations) ? translation.captionTranslations : []
  const legacyDescriptionTranslations = Array.isArray(translation.descriptionTranslations) ? translation.descriptionTranslations : []
  const legacyTranslations = legacyCaptionTranslations.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    if (typeof record.language !== 'string' || typeof record.text !== 'string') return []
    const description = legacyDescriptionTranslations.find((candidate) => candidate && typeof candidate === 'object' && !Array.isArray(candidate) && (candidate as Record<string, unknown>).language === record.language) as Record<string, unknown> | undefined
    return [{ languageCode: record.language, title: '', caption: record.text, description: typeof description?.text === 'string' ? description.text : '', createdAt: updatedAt }]
  })
  const dubbingVersions = Array.isArray(translation.dubbingVersions) ? translation.dubbingVersions.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const status = record.status
    if (typeof record.targetLanguageCode !== 'string' || !['unavailable', 'processing', 'ready', 'failed'].includes(String(status)) || typeof record.updatedAt !== 'number') return []
    return [{ targetLanguageCode: record.targetLanguageCode, status: status as 'unavailable' | 'processing' | 'ready' | 'failed', mediaRef: typeof record.mediaRef === 'string' ? record.mediaRef : undefined, updatedAt: record.updatedAt }]
  }) : []

  return {
    version: 1,
    creatorId: draft.creatorId,
    topic: typeof draft.topic === 'string' ? draft.topic : '',
    title: typeof draft.title === 'string' ? draft.title : '',
    caption: typeof draft.caption === 'string' ? draft.caption : '',
    description: typeof draft.description === 'string' ? draft.description : '',
    hashtags: typeof draft.hashtags === 'string' ? draft.hashtags : '',
    captionSuggestions: readStringArray(draft.captionSuggestions),
    titleSuggestions: readStringArray(draft.titleSuggestions),
    descriptionSuggestions: readStringArray(draft.descriptionSuggestions),
    hashtagSuggestions: readStringArray(draft.hashtagSuggestions),
    shortIdeas: readShortIdeas(draft.shortIdeas),
    assistantQuestion: typeof draft.assistantQuestion === 'string' ? draft.assistantQuestion : '',
    assistantResponse: typeof draft.assistantResponse === 'string' ? draft.assistantResponse : '',
    translationFoundation: {
      primaryLanguageCode: typeof translation.primaryLanguageCode === 'string' ? translation.primaryLanguageCode : typeof translation.primaryLanguage === 'string' ? translation.primaryLanguage : 'en',
      translations: translations.length ? translations : legacyTranslations,
      dubbingVersions,
    },
    updatedAt,
  }
}

export async function loadCreatorAiDraft(creatorId: string) {
  if (!creatorId.trim()) return null
  const draft = readCreatorAiDraft(await window.genmb.kv.get(creatorAiDraftKey(creatorId)))
  return draft?.creatorId === creatorId ? draft : null
}

export async function saveCreatorAiDraft(draft: ZivoCreatorAiDraft) {
  await window.genmb.auth.ready()
  const sessionUser = window.genmb.auth.getUser()
  if (!sessionUser || sessionUser.id !== draft.creatorId) throw new Error('Sign in to save this private creator draft.')
  await window.genmb.kv.set(creatorAiDraftKey(sessionUser.id), draft)
}
