# Verifikasi versi 1.1

Lingkungan Node.js 24.22.1. Pengujian integrasi Meta menggunakan transport simulasi, tanpa token/akun nyata.

## Pemeriksaan yang dilakukan

- `npm install --ignore-scripts`: berhasil; aplikasi tidak menambah dependensi runtime.
- `npm run build`: pemeriksaan sintaks server, domain, adapter Meta, service iklan berbayar, script setup, dan dua modul browser lulus.
- `npm test`: **11 kelompok pengujian lulus**. Alur lama tetap diuji: autentikasi, CSRF, kampanye, enam kanal materi, pelanggan, biaya, ekspor dan persistensi setelah restart. Alur baru diuji melalui HTTP nyata dengan API Meta simulasi: validasi foto/URL/budget/jadwal, koneksi kosong, draf, upload paused, jumlah budget IDR persis, urutan aktivasi, konfirmasi budget, perubahan eksternal, permintaan ganda, kegagalan parsial, currency yang tidak didukung, jeda pemulihan, sinkron metrik, serta penyaringan rahasia.
- `test/browser-smoke.mjs` dengan Playwright dan Chromium 153: **lulus**. Menggunakan server sementara dan Meta simulasi. Login melalui UI, membuat draf/foto, mengedit dan mencari lokasi, mengirim paused, penolakan angka anggaran yang salah, aktivasi, sinkron status, dan jeda berhasil. Tampilan diperiksa pada desktop 1440×1000 dan HP 390×844. Tidak ada JavaScript page error atau halaman melebar keluar viewport; screenshot desktop, HP, formulir, dan persetujuan diperiksa.
- Token tidak muncul pada daftar data, respons status, pesan error yang diuji, atau ekspor. Data gambar diambil dari endpoint admin tersendiri, bukan dikirim pada daftar data.

Pengujian browser opsional untuk pengembang, terpisah dari runtime aplikasi:

```bash
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run test:browser
```

Atau tentukan `PLAYWRIGHT_MODULE` dan `BROWSER_EXECUTABLE` bila binary/module dikelola lingkungan. Script selalu menyuntikkan API Meta palsu dan tidak menjalankan iklan sungguhan. Screenshot QA disimpan pada folder temporary kecuali `QA_SCREENSHOT_DIR` diisi; bukan berkas pengguna.

## Batas verifikasi

- Belum ada token Meta, akun iklan/pembayaran live, atau pengiriman iklan nyata. Kelayakan akun, izin API, App Review, format creative, minimum budget, respons readback, dan penayangan perlu diverifikasi dengan akun pemilik. Lulus simulasi tidak membuktikan integrasi live siap pada setiap akun/versi API.
- Belum dilakukan deployment VPS, DNS atau HTTPS. Pengguna sudah memperlihatkan aplikasi versi sebelumnya berjalan pada perangkat lokal; server pengujian versi ini dijalankan sementara untuk pengujian browser.
- Workflow GitHub menjalankan build dan pengujian backend pada push/PR. Periksa tab Actions untuk hasil commit terbaru. Pemeriksaan browser pengembangan tidak menjadi bagian workflow standar.
- Posting organik dan kanal selain iklan Facebook/Instagram masih manual. Iklan khusus chat WhatsApp belum diimplementasikan.

Sebelum penggunaan live: hubungkan akun pemilik dari terminal pribadi, periksa koneksi, siapkan draf foto dan website yang valid, kirim ke Meta dalam status jeda, periksa hasil melalui aplikasi dan Ads Manager, lalu setujui akun/materi/target/jadwal/budget yang konkret. Mematikan aplikasi tidak menghentikan iklan yang sudah diaktifkan pada Meta.
