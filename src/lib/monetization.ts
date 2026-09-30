export type MonetizationStatus = 'not-eligible' | 'eligible' | 'enabled' | 'disabled'
export type MonetizationFeature = 'advertising' | 'live-gifts' | 'memberships' | 'promotions'
export type EarningType = 'advertising' | 'live-gift' | 'membership' | 'promotion' | 'sponsorship'
export type EarningStatus = 'estimated' | 'pending' | 'available' | 'paid' | 'reversed'

export type CreatorMonetizationSettings = {
  creatorId: string
  status: MonetizationStatus
  features: Record<MonetizationFeature, boolean>
  updatedAt: number
}

export type CreatorEarningRecord = {
  earningId: string
  creatorId: string
  contentId?: string
  liveSessionId?: string
  type: EarningType
  amount: number
  currency: string
  status: EarningStatus
  timestamp: number
  metadata: Record<string, string | number | boolean | null>
}

// Published targets are informational until verified view, watch-time and engagement tracking exists.
export const monetizationTargets = {
  followers: 500,
  longVideoWatchHours: 300,
  standardShortViews: 100000,
  communityShortViews: 50000,
  communityEngagementPercent: 10,
} as const

/** Server-owned foundation for future admin/owner monetization controls. */
  
export type MonetizationPolicy = {
  policyId: string
  minimumRequirements: { followerCount?: number; contentCount?: number; reviewRequired: boolean }
  platformCommissionPercent: number
  enabledRevenueSources: EarningType[]
  updatedAt: number
}

/** Server-owned foundation for payout reconciliation; never exposed on public profiles. */
export type CreatorPayoutStatus = {
  creatorId: string
  status: 'not-configured' | 'review-required' | 'ready' | 'on-hold' | 'paid'
  updatedAt: number
}

const settingsPrefix = 'zivo:monetization:creator:'
const earningPrefix = 'zivo:monetization:earning:'

export function monetizationSettingsKey(creatorId: string) {
  return `${settingsPrefix}${creatorId}:settings`
}

function earningKey(creatorId: string, earningId: string) {
  return `${earningPrefix}${creatorId}:${earningId}`
}

function defaultSettings(creatorId: string): CreatorMonetizationSettings {
  return {
    creatorId,
    // Eligibility must be granted by future server-owned review/rules, never inferred in the client.
    status: 'not-eligible',
    features: { advertising: false, 'live-gifts': false, memberships: false, promotions: false },
    updatedAt: Date.now(),
  }
}

export function readCreatorMonetizationSettings(value: unknown, creatorId: string): CreatorMonetizationSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const settings = value as Record<string, unknown>
  if (settings.creatorId !== creatorId || !['not-eligible', 'eligible', 'enabled', 'disabled'].includes(String(settings.status))) return null
  const rawFeatures = settings.features
  if (!rawFeatures || typeof rawFeatures !== 'object' || Array.isArray(rawFeatures)) return null
  const features = rawFeatures as Record<string, unknown>
  return {
    creatorId,
    status: settings.status as MonetizationStatus,
    features: {
      advertising: features.advertising === true,
      'live-gifts': features['live-gifts'] === true,
      memberships: features.memberships === true,
      promotions: features.promotions === true,
    },
    updatedAt: typeof settings.updatedAt === 'number' ? settings.updatedAt : 0,
  }
}

export function readCreatorEarningRecord(value: unknown): CreatorEarningRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (
    typeof record.earningId !== 'string' || typeof record.creatorId !== 'string' ||
    !['advertising', 'live-gift', 'membership', 'promotion', 'sponsorship'].includes(String(record.type)) ||
    typeof record.amount !== 'number' || !Number.isFinite(record.amount) || record.amount < 0 ||
    typeof record.currency !== 'string' || !record.currency.trim() ||
    !['estimated', 'pending', 'available', 'paid', 'reversed'].includes(String(record.status)) ||
    typeof record.timestamp !== 'number'
  ) return null
  const metadata = record.metadata
  return {
    earningId: record.earningId,
    creatorId: record.creatorId,
    contentId: typeof record.contentId === 'string' ? record.contentId : undefined,
    liveSessionId: typeof record.liveSessionId === 'string' ? record.liveSessionId : undefined,
    type: record.type as EarningType,
    amount: record.amount,
    currency: record.currency.trim().toUpperCase(),
    status: record.status as EarningStatus,
    timestamp: record.timestamp,
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? Object.fromEntries(Object.entries(metadata as Record<string, unknown>).filter(([, item]) => ['string', 'number', 'boolean'].includes(typeof item) || item === null)) as CreatorEarningRecord['metadata']
      : {},
  }
}

async function requireCreatorSession(creatorId: string) {
  await window.genmb.auth.ready()
  const sessionUser = window.genmb.auth.getUser()
  if (!sessionUser) throw new Error('Sign in to view creator monetization.')
  if (sessionUser.id !== creatorId) throw new Error('Private creator earnings are only available to the account that owns them.')
  return sessionUser
}

export async function loadCreatorMonetizationSettings(creatorId: string): Promise<CreatorMonetizationSettings> {
  await requireCreatorSession(creatorId)
  const stored = readCreatorMonetizationSettings(await window.genmb.kv.get(monetizationSettingsKey(creatorId)), creatorId)
  if (stored) return stored
  const seeded = defaultSettings(creatorId)
  await window.genmb.kv.set(monetizationSettingsKey(creatorId), seeded)
  return seeded
}

export async function updateCreatorMonetizationSettings({ creatorId, enabled }: { creatorId: string; enabled: boolean }): Promise<CreatorMonetizationSettings> {
  await requireCreatorSession(creatorId)
  const current = await loadCreatorMonetizationSettings(creatorId)
  if (enabled && current.status !== 'eligible') throw new Error('Monetization can only be enabled after ZIVO eligibility review is complete.')
  if (!enabled && current.status !== 'enabled') throw new Error('There is no active monetization program to disable.')
  const next: CreatorMonetizationSettings = {
    ...current,
    status: enabled ? 'enabled' : 'disabled',
    features: enabled
      ? { advertising: true, 'live-gifts': false, memberships: false, promotions: false }
      : { advertising: false, 'live-gifts': false, memberships: false, promotions: false },
    updatedAt: Date.now(),
  }
  await window.genmb.kv.set(monetizationSettingsKey(creatorId), next)
  return next
}

export async function loadCreatorEarningRecords(creatorId: string): Promise<CreatorEarningRecord[]> {
  await requireCreatorSession(creatorId)
  const result = await window.genmb.kv.list(`${earningPrefix}${creatorId}:`)
  return result.data
    .map((entry) => readCreatorEarningRecord(entry.value))
    .filter((record): record is CreatorEarningRecord => Boolean(record) && record.creatorId === creatorId)
    .sort((first, second) => second.timestamp - first.timestamp)
}

// Earning records intentionally have no creator-side write API. Future provider/webhook or owner functions
// must validate the source and write earningKey(creatorId, earningId) server-side.
export const creatorEarningStorageKey = earningKey
