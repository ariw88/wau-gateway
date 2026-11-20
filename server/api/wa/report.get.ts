import { requireWaAuth } from '~/server/utils/waAuth'
import {
  sessions,
  sanitizeSessionId,
  extractPhoneFromJid,
  readReportLogs
} from '~/server/utils/waManager'

export default defineEventHandler((event) => {
  requireWaAuth(event)

  const query = getQuery(event)
  const sessionId = sanitizeSessionId(query.session as string | undefined)
  const session = sessions[sessionId]
  const status = session?.status || 'disconnected'
  const connected = status === 'connected' && Boolean(session?.sock)
  const phone = extractPhoneFromJid(session?.sock?.user?.id) || session?.phone || null

  const logs = phone ? readReportLogs(phone) : []

  return {
    sessionId,
    status,
    connected,
    phone,
    totalSent: logs.length,
    logs
  }
})
