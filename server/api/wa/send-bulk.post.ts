// server/api/wa/send-bulk.post.ts
import { requireWaAuth } from '~/server/utils/waAuth'
import {
  sessions,
  sanitizeSessionId,
  formatPhoneToJid,
  extractPhoneFromJid,
  appendReportLog
} from '~/server/utils/waManager'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export default defineEventHandler(async (event) => {
  requireWaAuth(event)

  const body = await readBody<{
    session?: string
    phones?: string[]
    message?: string
    delayMs?: number
  }>(event)

  const sessionId = sanitizeSessionId(body?.session)
  const phones = Array.isArray(body?.phones)
    ? body.phones.map((p) => String(p).trim()).filter(Boolean)
    : []
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  const delayMs =
    typeof body?.delayMs === 'number' && body.delayMs >= 1000 ? body.delayMs : 5000

  if (phones.length === 0 || !message) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Parameter "phones" (array nomor) dan "message" wajib diisi.'
    })
  }

  const isSessionReady = (currentSession: typeof sessions[string] | undefined) => Boolean(
    currentSession &&
    currentSession.status === 'connected' &&
    currentSession.connected &&
    currentSession.sock &&
    currentSession.sock.user
  )

  let session = sessions[sessionId]
  if (session?.status === 'connecting') {
    const connectionDeadline = Date.now() + 60_000
    while (!isSessionReady(session) && session?.status === 'connecting' && Date.now() < connectionDeadline) {
      await delay(500)
      session = sessions[sessionId]
    }
  }

  if (!isSessionReady(session)) {
    throw createError({
      statusCode: session?.status === 'connecting' ? 503 : 400,
      statusMessage: `Sesi '${sessionId}' belum terhubung ke WhatsApp.`,
      data: {
        sessionId,
        status: session?.sock
          ? session.status
          : (session?.status === 'connected' ? 'connecting' : (session?.status || 'disconnected')),
        connected: false
      }
    })
  }

  const sock = session.sock
  const senderPhone = extractPhoneFromJid(sock?.user?.id) || session.phone || 'unknown'

  ;(async () => {
    for (let i = 0; i < phones.length; i++) {
      const targetPhone = phones[i]
      const jid = formatPhoneToJid(targetPhone)
      const timestamp = new Date().toLocaleString('id-ID')

      const activeSock = sessions[sessionId]?.sock
      if (!activeSock || sessions[sessionId]?.status !== 'connected' || !sessions[sessionId]?.connected) {
        appendReportLog(senderPhone, {
          timestamp,
          sessionId,
          senderPhone,
          targetPhone,
          status: 'failed',
          message,
          error: `Sesi '${sessionId}' terputus saat proses bulk.`
        })
        break
      }

      try {
        await activeSock.sendMessage(jid, { text: message })
        appendReportLog(senderPhone, {
          timestamp,
          sessionId,
          senderPhone,
          targetPhone,
          status: 'success',
          message
        })
      } catch (err: any) {
        appendReportLog(senderPhone, {
          timestamp,
          sessionId,
          senderPhone,
          targetPhone,
          status: 'failed',
          message,
          error: err?.message || 'Gagal mengirim pesan'
        })
      }

      if (i < phones.length - 1) {
        await delay(delayMs)
      }
    }
  })()

  return {
    success: true,
    sessionId,
    status: session.status,
    connected: true,
    senderPhone,
    queuedCount: phones.length,
    delayMs,
    message: `Proses pengiriman bulk ke ${phones.length} nomor dijadwalkan di latar belakang.`
  }
})