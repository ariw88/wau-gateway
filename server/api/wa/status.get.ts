import { requireWaAuth } from '~/server/utils/waAuth'
import { sessions, getSessionSnapshot, sanitizeSessionId } from '~/server/utils/waManager'

export default defineEventHandler((event) => {
  requireWaAuth(event)

  const query = getQuery(event)
  const sessionId = sanitizeSessionId(query.session as string | undefined)
  const current = getSessionSnapshot(sessionId)
  const allSessions = Object.keys(sessions).map((id) => getSessionSnapshot(id))

  return {
    ...current,
    sessions: allSessions
  }
})
