// @description Resolves the signed-in user's ZIVO role from platform-owned account context.
export default async function handler(_req: Request, ctx: { user?: { isOwner?: boolean } }) {
  if (!ctx.user) return { statusCode: 401, body: { error: 'Sign-in required' } }
  if (ctx.user.isOwner) return { statusCode: 200, body: { role: 'admin', permissions: ['*'] } }
  return { statusCode: 200, body: { role: 'viewer', permissions: [] } }
}
