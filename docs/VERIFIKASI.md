# Verifikasi versi 1.2

Lingkungan Node.js 24.22.1. Pengujian integrasi Meta dan Google menggunakan transport simulasi, tanpa token/akun nyata.

## Pemeriksaan yang dilakukan

- `npm install --ignore-scripts`: berhasil; aplikasi tidak menambah dependensi runtime.
- `npm run build`: pemeriksaan sintaks server, domain, adapter Meta, service iklan berbayar, script setup, dan tiga modul browser lulus.
- `npm test`: **20 kelompok pengujian lulus**. Alur lama tetap diuji: autentikasi, CSRF, kampanye, enam kanal materi, pelanggan, biaya, ekspor dan persistensi setelah restart. Alur baru diuji melalui HTTP nyata dengan API Meta simulasi: validasi foto/URL/budget/jadwal, koneksi kosong, draf, upload paused, jumlah budget IDR persis, urutan aktivasi, konfirmasi budget, perubahan eksternal, permintaan ganda, kegagalan parsial, currency yang tidak didukung, jeda pemulihan, sinkron metrik, serta penyaringan rahasia.
- `test/browser-smoke.mjs` dengan Playwright dan Chromium 153: **lulus**. Menggunakan server sementara dan Meta simulasi. Login melalui UI, membuat draf/foto, mengedit dan mencari lokasi, mengirim paused, penolakan angka anggaran yang salah, aktivasi, sinkron status, dan jeda berhasil. Tampilan diperiksa pada desktop 1440×1000 dan HP 390×844. Tidak ada JavaScript page error atau halaman melebar keluar viewport; screenshot desktop, HP, formulir, dan persetujuan diperiksa.
- Token tidak muncul pada daftar data, respons status, pesan error yang diuji, atau ekspor. Data gambar diambil dari endpoint admin tersendiri, bukan dikirim pada daftar data.

Pengujian browser opsional untuk pengembang, terpisah dari runtime aplikasi:

```bash
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run test:browser
```

Atau tentukan `PLAYWRIGHT_MODULE` dan `BROWSER_EXECUTABLE` bila binary/module dikelola lingkungan. Script selalu menyuntikkan API Meta/Google palsu dan tidak menjalankan iklan sungguhan. Screenshot QA disimpan pada folder temporary kecuali `QA_SCREENSHOT_DIR` diisi; bukan berkas pengguna.

## Pemeriksaan Google tambahan

- Google Ads memakai simulasi OAuth/REST, total budget dalam micros, atomic create dengan validateOnly, frasa/tepat, lokasi Indonesia, serta validasi IDR/WIB. Diuji penolakan perubahan budget/kata kunci/tujuan, pengiriman ganda, kegagalan validasi, timeout sesudah mutasi, persetujuan yang salah, respons status tanpa konfirmasi dan redaksi secret.
- Flow OAuth loopback diuji dengan callback HTTP lokal: state yang salah ditolak, PKCE dicocokkan saat pertukaran kode, respons browser tidak mengungkap kode/token. Tidak memakai login Google nyata.
- Script google:setup dijalankan interaktif dengan kredensial dummy: secret/refresh token tidak terlihat pada terminal, Customer ID dinormalisasi, pengaturan Meta/password tetap dipertahankan dan file berizin 600.
- Browser desktop/HP menguji draf Google, edit/cari lokasi, submit jeda, anggaran salah, aktivasi, sinkron dan jeda; tidak ada page error/overflow. Modal HP juga dicek berada di dalam viewport. Screenshot desktop dan HP diperiksa. Alur Meta tetap ikut diperiksa.

## Batas verifikasi

- Belum ada token Meta/Google, akun iklan/pembayaran live, atau pengiriman iklan nyata. Kelayakan akun, izin API, App Review/Google Cloud access/OAuth, format creative, minimum budget, respons readback, dan penayangan perlu diverifikasi dengan akun pemilik. Lulus simulasi tidak membuktikan integrasi live siap pada setiap akun/versi API.
- Belum dilakukan deployment VPS, DNS atau HTTPS. Pengguna sudah memperlihatkan aplikasi versi sebelumnya berjalan pada perangkat lokal; server pengujian versi ini dijalankan sementara untuk pengujian browser.
- Workflow GitHub menjalankan build dan pengujian backend pada push/PR. Periksa tab Actions untuk hasil commit terbaru. Pemeriksaan browser pengembangan tidak menjadi bagian workflow standar.
- Posting organik serta kanal di luar iklan Meta/Google Search masih manual. Iklan khusus chat WhatsApp belum diimplementasikan. Google Search Ads ditambahkan; format Google lain belum tersedia.

Sebelum penggunaan live: hubungkan akun pemilik dari terminal pribadi, periksa koneksi, siapkan draf foto/teks dan website yang valid, kirim ke Meta/Google dalam status jeda, periksa hasil melalui aplikasi dan pengelola iklan resmi, lalu setujui akun/materi/target/jadwal/budget yang konkret. Mematikan aplikasi tidak menghentikan iklan yang sudah diaktifkan pada Meta/Google.
