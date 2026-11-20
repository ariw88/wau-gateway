# Nuxt 3 WhatsApp Gateway (Baileys)

Folder proyek Nuxt 3 siap pakai untuk menjalankan WhatsApp Gateway multi-session di server.

## Struktur Folder
- `nuxt.config.ts` — Konfigurasi runtime config & ignore folder sesi/report.
- `server/utils/waAuth.ts` — Validasi header `Authorization: Bearer <token>`.
- `server/utils/waManager.ts` — Manajemen multi-session Baileys, QR code, koneksi, dan report log per nomor pengirim.
- `server/plugins/waBoot.ts` — Auto-load sesi tersimpan saat server menyala.
- `server/api/wa/status.get.ts` — Cek status koneksi & daftar sesi.
- `server/api/wa/qr.post.ts` — Memulai sesi dan menghasilkan QR code (`data:image/png;base64,...`).
- `server/api/wa/send-bulk.post.ts` — Mengirim pesan bulk di latar belakang dengan delay.
- `server/api/wa/report.get.ts` — Mengambil riwayat pengiriman per nomor pengirim.
- `server/api/wa/logout.post.ts` — Logout & hapus kredensial sesi tertentu.

## Menjalankan
1. Salin `.env.example` menjadi `.env` dan isi `WA_API_SECRET`.
2. Jalankan `npm install`.
3. Build & jalankan: `npm run build && node .output/server/index.mjs` (atau gunakan PM2).
