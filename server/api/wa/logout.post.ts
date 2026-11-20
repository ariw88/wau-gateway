import { requireWaAuth } from '~/server/utils/waAuth'
import { logoutWaSession, sanitizeSessionId } from '~/server/utils/waManager'

export default defineEventHandler(async (event) => {
  requireWaAuth(event)

  const body = await readBody<{ session?: string }>(event).catch(() => ({}))
  const sessionId = sanitizeSessionId(body?.session)

  const snapshot = await logoutWaSession(sessionId)
  return {
    success: true,
    ...snapshot
  }
})
