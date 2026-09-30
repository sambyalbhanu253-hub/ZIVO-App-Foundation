import { loadPost } from './posts'

export type ZivoLanguage = { code: string; label: string }

export const zivoLanguages: ZivoLanguage[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'pa', label: 'Punjabi' },
  { code: 'bn', label: 'Bengali' },
  { code: 'mr', label: 'Marathi' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'kn', label: 'Kannada' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'ur', label: 'Urdu' },
]

export type ZivoTimedCaption = { startMs: number; endMs: number; text: string }
export type ZivoContentTranslation = {
  languageCode: string
  title: string
  description: string
  caption: string
  timedCaptions?: ZivoTimedCaption[]
  status: 'translated'
  createdAt: number
}
export type ZivoDubbingVersion = {
  targetLanguageCode: string
  status: 'unavailable' | 'processing' | 'ready' | 'failed'
  mediaRef?: string
  provider?: string
  updatedAt: number
}
export type ZivoContentLanguageSettings = {
  version: 1
  contentId: string
  creatorId: string
  originalLanguageCode: string
  originalAudioLanguageCode?: string
  translations: ZivoContentTranslation[]
  dubbingVersions: ZivoDubbingVersion[]
  updatedAt: number
}

export const contentLanguageKey = (contentId: string) => `zivo:content-language:${contentId}`

const knownCodes = new Set(zivoLanguages.map((language) => language.code))
export const languageLabel = (code: string) => zivoLanguages.find((language) => language.code === code)?.label || code
export const isSupportedLanguageCode = (code: string) => knownCodes.has(code)

function readText(value: unknown) { return typeof value === 'string' ? value : '' }
function readTimedCaptions(value: unknown): ZivoTimedCaption[] | undefined {
  if (!Array.isArray(value)) return undefined
  const cues = value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const cue = item as Record<string, unknown>
    if (typeof cue.startMs !== 'number' || typeof cue.endMs !== 'number' || typeof cue.text !== 'string' || cue.startMs < 0 || cue.endMs < cue.startMs || !cue.text.trim()) return []
    return [{ startMs: Math.floor(cue.startMs), endMs: Math.floor(cue.endMs), text: cue.text.trim() }]
  })
  return cues.length ? cues : undefined
}

export function readContentLanguageSettings(value: unknown): ZivoContentLanguageSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  if (source.version !== 1 || typeof source.contentId !== 'string' || typeof source.creatorId !== 'string' || !isSupportedLanguageCode(readText(source.originalLanguageCode)) || typeof source.updatedAt !== 'number') return null
  const translations = Array.isArray(source.translations) ? source.translations.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const translation = item as Record<string, unknown>
    if (!isSupportedLanguageCode(readText(translation.languageCode)) || translation.status !== 'translated' || typeof translation.createdAt !== 'number') return []
    return [{ languageCode: readText(translation.languageCode), title: readText(translation.title), description: readText(translation.description), caption: readText(translation.caption), timedCaptions: readTimedCaptions(translation.timedCaptions), status: 'translated' as const, createdAt: translation.createdAt }]
  }) : []
  const dubbingVersions = Array.isArray(source.dubbingVersions) ? source.dubbingVersions.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const dubbing = item as Record<string, unknown>
    const status = dubbing.status
    if (!isSupportedLanguageCode(readText(dubbing.targetLanguageCode)) || !['unavailable', 'processing', 'ready', 'failed'].includes(String(status)) || typeof dubbing.updatedAt !== 'number') return []
    const mediaRef = readText(dubbing.mediaRef).trim() || undefined
    if (status === 'ready' && !mediaRef) return []
    return [{ targetLanguageCode: readText(dubbing.targetLanguageCode), status: status as ZivoDubbingVersion['status'], mediaRef, provider: readText(dubbing.provider).trim() || undefined, updatedAt: dubbing.updatedAt }]
  }) : []
  return { version: 1, contentId: source.contentId, creatorId: source.creatorId, originalLanguageCode: readText(source.originalLanguageCode), originalAudioLanguageCode: isSupportedLanguageCode(readText(source.originalAudioLanguageCode)) ? readText(source.originalAudioLanguageCode) : undefined, translations, dubbingVersions, updatedAt: source.updatedAt }
}

export function defaultContentLanguageSettings(contentId: string, creatorId: string, originalLanguageCode = 'en'): ZivoContentLanguageSettings {
  return { version: 1, contentId, creatorId, originalLanguageCode: isSupportedLanguageCode(originalLanguageCode) ? originalLanguageCode : 'en', originalAudioLanguageCode: undefined, translations: [], dubbingVersions: [], updatedAt: Date.now() }
}

export async function loadContentLanguageSettings(contentId: string, creatorId?: string) {
  const saved = readContentLanguageSettings(await window.genmb.kv.get(contentLanguageKey(contentId)))
  if (saved && saved.contentId === contentId) return saved
  return creatorId ? defaultContentLanguageSettings(contentId, creatorId) : null
}

export async function saveContentLanguageSettings(settings: ZivoContentLanguageSettings) {
  await window.genmb.auth.ready()
  const user = window.genmb.auth.getUser()
  if (!user || user.id !== settings.creatorId) throw new Error('Sign in as the creator to update language versions.')
  const post = await loadPost(settings.contentId)
  if (!post || post.creatorId !== user.id) throw new Error('Only this content’s creator can update language versions.')
  const safe = readContentLanguageSettings({ ...settings, version: 1, updatedAt: Date.now() })
  if (!safe) throw new Error('Choose supported languages before saving.')
  await window.genmb.kv.set(contentLanguageKey(settings.contentId), safe)
  return safe
}
