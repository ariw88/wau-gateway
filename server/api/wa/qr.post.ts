import { requireWaAuth } from '~/server/utils/waAuth'
import { startWaSession, getSessionSnapshot, sanitizeSessionId } from '~/server/utils/waManager'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export default defineEventHandler(async (event) => {
  requireWaAuth(event)

  const body = await readBody<{ session?: string }>(event).catch(() => ({}))
  const sessionId = sanitizeSessionId(body?.session)

  await startWaSession(sessionId)

  for (let i = 0; i < 10; i++) {
    const snap = getSessionSnapshot(sessionId)
    if (snap.status === 'qr' || snap.status === 'connected') {
      return snap
    }
    await wait(500)
  }

  return getSessionSnapshot(sessionId)
})
