import fs from 'fs'
import path from 'path'
import pino from 'pino'
import QRCode from 'qrcode'
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys'

export type WaConnectionStatus = 'disconnected' | 'connecting' | 'qr' | 'connected'

export interface WaSessionState {
  sessionId: string
  status: WaConnectionStatus
  connected: boolean
  qrDataUrl: string | null
  phone: string | null
  sock: any | null
  updatedAt: string
}

export interface BulkLogItem {
  timestamp: string
  sessionId: string
  senderPhone: string
  targetPhone: string
  status: 'success' | 'failed'
  message: string
  error?: string
}

const globalForWa = globalThis as unknown as {
  __waSessions?: Record<string, WaSessionState>
  __waLocks?: Record<string, boolean>
  __waReconnectTimers?: Record<string, ReturnType<typeof setTimeout>>
}

export const sessions: Record<string, WaSessionState> =
  globalForWa.__waSessions ?? (globalForWa.__waSessions = {})

const initLocks: Record<string, boolean> =
  globalForWa.__waLocks ?? (globalForWa.__waLocks = {})

const reconnectTimers: Record<string, ReturnType<typeof setTimeout>> =
  globalForWa.__waReconnectTimers ?? (globalForWa.__waReconnectTimers = {})

const logger = pino({ level: process.env.WA_LOG_LEVEL || 'warn' })

export function sanitizeSessionId(raw?: string): string {
  const cleaned = (raw || 'default').replace(/[^a-zA-Z0-9_-]/g, '')
  return cleaned || 'default'
}

export function formatPhoneToJid(phone: string): string {
  let digits = phone.replace(/[^0-9]/g, '')
  if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1)
  }
  return `${digits}@s.whatsapp.net`
}

export function extractPhoneFromJid(jid?: string | null): string | null {
  if (!jid) return null
  const num = jid.split(':')[0].replace(/[^0-9]/g, '')
  return num || null
}

export function getSessionSnapshot(sessionIdInput?: string) {
  const sessionId = sanitizeSessionId(sessionIdInput)
  const s = sessions[sessionId]

  if (!s) {
    return {
      sessionId,
      status: 'disconnected' as WaConnectionStatus,
      connected: false,
      qr: null,
      phone: null,
      updatedAt: null
    }
  }

  const livePhone = extractPhoneFromJid(s.sock?.user?.id) || s.phone

  return {
    sessionId: s.sessionId,
    status: s.status,
    connected: s.status === 'connected' && Boolean(s.sock),
    qr: s.status === 'qr' ? s.qrDataUrl : null,
    phone: livePhone,
    updatedAt: s.updatedAt
  }
}

export function appendReportLog(senderPhone: string, item: BulkLogItem) {
  const safeSender = senderPhone.replace(/[^0-9]/g, '') || 'unknown'
  const dir = path.resolve(process.cwd(), 'wa_reports', safeSender)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const filePath = path.join(dir, 'report_log.json')
  let logs: BulkLogItem[] = []

  if (fs.existsSync(filePath)) {
    try {
      logs = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      if (!Array.isArray(logs)) logs = []
    } catch {
      logs = []
    }
  }

  logs.unshift(item)
  fs.writeFileSync(filePath, JSON.stringify(logs, null, 2), 'utf-8')
}

export function readReportLogs(senderPhone: string): BulkLogItem[] {
  const safeSender = senderPhone.replace(/[^0-9]/g, '')
  if (!safeSender) return []
  const filePath = path.resolve(process.cwd(), 'wa_reports', safeSender, 'report_log.json')
  if (!fs.existsSync(filePath)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function startWaSession(sessionIdInput?: string): Promise<WaSessionState> {
  const sessionId = sanitizeSessionId(sessionIdInput)

  if (reconnectTimers[sessionId]) {
    clearTimeout(reconnectTimers[sessionId])
    delete reconnectTimers[sessionId]
  }

  if (initLocks[sessionId] && sessions[sessionId]) {
    return sessions[sessionId]
  }

  initLocks[sessionId] = true

  try {
    const sessionDir = path.resolve(process.cwd(), 'auth_sessions', sessionId)
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true })
    }

    const current: WaSessionState = sessions[sessionId] || {
      sessionId,
      status: 'connecting',
      connected: false,
      qrDataUrl: null,
      phone: null,
      sock: null,
      updatedAt: new Date().toISOString()
    }

    current.status = 'connecting'
    current.connected = false
    current.qrDataUrl = null
    current.updatedAt = new Date().toISOString()
    sessions[sessionId] = current

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir)
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      browser: ['Ubuntu', 'Chrome', '20.04.0'],
      connectTimeoutMs: 60000
    })

    current.sock = sock
    current.updatedAt = new Date().toISOString()

    sock.ev.on('creds.update', async () => {
      await saveCreds()
    })

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update
      const target = sessions[sessionId]
      if (!target) return

      if (qr) {
        target.status = 'qr'
        target.connected = false
        target.qrDataUrl = await QRCode.toDataURL(qr)
        target.updatedAt = new Date().toISOString()
      }

      if (connection === 'open') {
        target.status = 'connected'
        target.connected = true
        target.qrDataUrl = null
        target.phone = extractPhoneFromJid(sock.user?.id)
        target.updatedAt = new Date().toISOString()
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode
        const isLoggedOut = statusCode === DisconnectReason.loggedOut

        target.sock = null
        target.connected = false
        target.qrDataUrl = null
        target.updatedAt = new Date().toISOString()

        if (isLoggedOut) {
          target.status = 'disconnected'
          await fs.promises.rm(sessionDir, { recursive: true, force: true }).catch(() => {})
          return
        }

        target.status = 'connecting'
        reconnectTimers[sessionId] = setTimeout(() => {
          if (sessions[sessionId] && sessions[sessionId].status !== 'connected') {
            startWaSession(sessionId).catch(() => {})
          }
        }, 4000)
      }
    })

    return current
  } finally {
    initLocks[sessionId] = false
  }
}

export async function logoutWaSession(sessionIdInput?: string) {
  const sessionId = sanitizeSessionId(sessionIdInput)
  if (reconnectTimers[sessionId]) {
    clearTimeout(reconnectTimers[sessionId])
    delete reconnectTimers[sessionId]
  }

  const s = sessions[sessionId]
  if (s?.sock) {
    try {
      await s.sock.logout()
    } catch {}
  }

  const sessionDir = path.resolve(process.cwd(), 'auth_sessions', sessionId)
  await fs.promises.rm(sessionDir, { recursive: true, force: true }).catch(() => {})

  sessions[sessionId] = {
    sessionId,
    status: 'disconnected',
    connected: false,
    qrDataUrl: null,
    phone: null,
    sock: null,
    updatedAt: new Date().toISOString()
  }

  return getSessionSnapshot(sessionId)
}
