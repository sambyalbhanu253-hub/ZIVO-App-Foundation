export type ZivoPrivateMessage = {
  id: string
  senderId: string
  receiverId: string
  text: string
  createdAt: number
}

export function messagePrefix(userId: string) {
  return `zivo:message:${userId}:`
}

export function conversationIdFor(firstUserId: string, secondUserId: string) {
  return [firstUserId, secondUserId].sort().map(encodeURIComponent).join('--')
}

export function readPrivateMessage(value: unknown): ZivoPrivateMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const message = value as Record<string, unknown>

  if (
    typeof message.id !== 'string' ||
    typeof message.senderId !== 'string' ||
    typeof message.receiverId !== 'string' ||
    typeof message.text !== 'string' ||
    typeof message.createdAt !== 'number'
  ) return null

  return {
    id: message.id,
    senderId: message.senderId,
    receiverId: message.receiverId,
    text: message.text,
    createdAt: message.createdAt,
  }
}

export async function savePrivateMessage(message: ZivoPrivateMessage) {
  const conversationId = conversationIdFor(message.senderId, message.receiverId)
  const keySuffix = `${conversationId}:${message.id}`
  const recipientKeys = Array.from(new Set([
    `${messagePrefix(message.senderId)}${keySuffix}`,
    `${messagePrefix(message.receiverId)}${keySuffix}`,
  ]))

  await Promise.all(recipientKeys.map((key) => window.genmb.kv.set(key, message)))
}
