import type { H3Event } from 'h3'

export function requireWaAuth(event: H3Event) {
  const config = useRuntimeConfig(event)
  const secret = config.waApiSecret || process.env.WA_API_SECRET
  if (!secret) return

  const authHeader = getHeader(event, 'authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized: Bearer token wajib disertakan.'
    })
  }

  const token = authHeader.slice(7).trim()
  if (!token || token !== secret) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden: Token tidak valid.'
    })
  }
}
