export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  runtimeConfig: {
    waApiSecret: process.env.WA_API_SECRET || 'dev_secret_token'
  },
  nitro: {
    ignore: ['auth_sessions/**', 'wa_reports/**']
  }
})
