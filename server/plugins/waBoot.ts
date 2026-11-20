import fs from 'fs'
import path from 'path'
import { startWaSession } from '~/server/utils/waManager'

export default defineNitroPlugin(async () => {
  const authRoot = path.resolve(process.cwd(), 'auth_sessions')
  if (!fs.existsSync(authRoot)) return

  const entries = fs.readdirSync(authRoot, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      startWaSession(entry.name).catch((err) => {
        console.error(`[WA Boot] Gagal memuat sesi ${entry.name}:`, err)
      })
    }
  }
})
