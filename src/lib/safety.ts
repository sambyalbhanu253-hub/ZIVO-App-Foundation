export type ZivoReportTargetType = 'post' | 'short' | 'video' | 'profile'
export type ZivoReportReason = 'Spam' | 'Harassment' | 'Inappropriate content' | 'Misleading/Fake' | 'Other'
export type ZivoReportStatus = 'pending' | 'reviewed' | 'resolved'

export type ZivoSafetyReport = {
  reportId: string
  reporterId: string
  targetType: ZivoReportTargetType
  targetId: string
  reason: ZivoReportReason
  timestamp: number
  status: ZivoReportStatus
}

export type ZivoSafetyRelationship = {
  ownerId: string
  targetUserId: string
  createdAt: number
}

const safetyPrefix = 'zivo:safety:'
const reportPrefix = 'zivo:moderation:report:'

export function blockPrefix(ownerId: string) {
  return `${safetyPrefix}block:${ownerId}:`
}

export function mutePrefix(ownerId: string) {
  return `${safetyPrefix}mute:${ownerId}:`
}

export function reportKey(reporterId: string, targetType: ZivoReportTargetType, targetId: string) {
  return `${reportPrefix}${reporterId}:${targetType}:${targetId}`
}

export function readSafetyRelationship(value: unknown): ZivoSafetyRelationship | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const relationship = value as Record<string, unknown>
  if (typeof relationship.ownerId !== 'string' || typeof relationship.targetUserId !== 'string' || typeof relationship.createdAt !== 'number') return null
  return { ownerId: relationship.ownerId, targetUserId: relationship.targetUserId, createdAt: relationship.createdAt }
}

export function readSafetyReport(value: unknown): ZivoSafetyReport | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const report = value as Record<string, unknown>
  if (
    typeof report.reportId !== 'string' ||
    typeof report.reporterId !== 'string' ||
    (report.targetType !== 'post' && report.targetType !== 'short' && report.targetType !== 'video' && report.targetType !== 'profile') ||
    typeof report.targetId !== 'string' ||
    (report.reason !== 'Spam' && report.reason !== 'Harassment' && report.reason !== 'Inappropriate content' && report.reason !== 'Misleading/Fake' && report.reason !== 'Other') ||
    typeof report.timestamp !== 'number' ||
    (report.status !== 'pending' && report.status !== 'reviewed' && report.status !== 'resolved')
  ) return null
  return report as ZivoSafetyReport
}

export async function loadSafetyRelationships(ownerId: string) {
  if (!ownerId) return { blockedUserIds: [] as string[], mutedUserIds: [] as string[] }
  const [blocks, mutes] = await Promise.all([window.genmb.kv.list(blockPrefix(ownerId)), window.genmb.kv.list(mutePrefix(ownerId))])
  const readTargets = (records: Array<{ value: unknown }>) => [...new Set(records
    .map((record) => readSafetyRelationship(record.value))
    .filter((relationship): relationship is ZivoSafetyRelationship => Boolean(relationship && relationship.ownerId === ownerId))
    .map((relationship) => relationship.targetUserId)
    .filter((targetUserId) => targetUserId !== ownerId))]
  return { blockedUserIds: readTargets(blocks.data), mutedUserIds: readTargets(mutes.data) }
}

export async function setSafetyRelationship(ownerId: string, targetUserId: string, type: 'block' | 'mute') {
  if (!ownerId) throw new Error(`Sign in to ${type} a user.`)
  if (!targetUserId || targetUserId === ownerId) throw new Error(`You cannot ${type} your own profile.`)
  const key = `${type === 'block' ? blockPrefix(ownerId) : mutePrefix(ownerId)}${targetUserId}`
  const existing = readSafetyRelationship(await window.genmb.kv.get(key))
  if (existing) return { changed: false, relationship: existing }
  const relationship: ZivoSafetyRelationship = { ownerId, targetUserId, createdAt: Date.now() }
  await window.genmb.kv.set(key, relationship)
  return { changed: true, relationship }
}

export async function createSafetyReport(input: Omit<ZivoSafetyReport, 'reportId' | 'timestamp' | 'status'> & { targetOwnerId: string }) {
  if (!input.reporterId) throw new Error('Sign in to report content or a profile.')
  if (!input.targetId || !input.targetOwnerId) throw new Error('This item cannot be reported right now.')
  if (input.reporterId === input.targetOwnerId) throw new Error('You cannot report your own content or profile.')
  const key = reportKey(input.reporterId, input.targetType, input.targetId)
  const existing = readSafetyReport(await window.genmb.kv.get(key))
  if (existing) return { report: existing, duplicate: true }
  const report: ZivoSafetyReport = {
    reportId: crypto.randomUUID(),
    reporterId: input.reporterId,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
    timestamp: Date.now(),
    status: 'pending',
  }
  await window.genmb.kv.set(key, report)
  return { report, duplicate: false }
}

export async function canInteractBetween(viewerId: string, targetUserId: string) {
  if (!viewerId || !targetUserId || viewerId === targetUserId) return true
  const [viewerBlock, targetBlock] = await Promise.all([
    window.genmb.kv.get(`${blockPrefix(viewerId)}${targetUserId}`),
    window.genmb.kv.get(`${blockPrefix(targetUserId)}${viewerId}`),
  ])
  return !readSafetyRelationship(viewerBlock) && !readSafetyRelationship(targetBlock)
}

export async function shouldSuppressNotification(recipientId: string, actorId: string) {
  if (!recipientId || !actorId || recipientId === actorId) return true
  const [recipientBlock, actorBlock, recipientMute] = await Promise.all([
    window.genmb.kv.get(`${blockPrefix(recipientId)}${actorId}`),
    window.genmb.kv.get(`${blockPrefix(actorId)}${recipientId}`),
    window.genmb.kv.get(`${mutePrefix(recipientId)}${actorId}`),
  ])
  return Boolean(readSafetyRelationship(recipientBlock) || readSafetyRelationship(actorBlock) || readSafetyRelationship(recipientMute))
}
