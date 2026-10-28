# Verifikasi versi 1

Dilakukan pada lingkungan Node.js 24.22.1:

- `npm install --ignore-scripts`: berhasil; tidak ada dependensi eksternal.
- `npm run build`: pemeriksaan sintaks server, domain, dan JavaScript browser lulus.
- `npm test`: 3 kelompok pengujian lulus. Termasuk permintaan HTTP nyata ke server sementara: login/logout, cookie, CSRF, harga/tanggal/URL tidak valid, pembuatan kampanye, verifikasi kontak, enam kanal materi, pencegahan duplikat, edit materi dan transisi status, redirect/UTM, penghitung permintaan, pelanggan/booking, biaya, ekspor, perubahan nomor kontak, pengarsipan, serta database setelah restart.
- Server aplikasi berhasil dimulai pada loopback. Endpoint static membatasi file yang dapat dibaca; `.env` dan sumber server tidak disajikan.

Belum diverifikasi:

- Tampilan desktop/HP, interaksi browser, console dan overflow. Playwright tersedia, tetapi binary browser tidak terpasang; unduhan Chromium gagal sehingga pemeriksaan visual tidak dapat dijalankan pada lingkungan ini. CSS responsif sudah ditulis tetapi perlu diperiksa pada perangkat sebenarnya.
- DNS, HTTPS, VPS, dan akses publik tautan; panduan hosting disertakan, belum dilakukan deployment.
- GitHub Actions: tes lokal lulus. Periksa hasil workflow di tab Actions repo untuk mengetahui hasil pada lingkungan GitHub.
- Akun medsos, API publikasi, akun iklan, pembayaran, dan sinkronisasi data platform tidak dihubungkan. Tidak ada posting, pesan, atau iklan yang diterbitkan oleh proyek ini.

Sebelum penggunaan operasional: jalankan dari README, periksa form pada HP, simpan kampanye, tinjau draf, coba salin/ekspor, serta verifikasi nomor WhatsApp dan rincian penawaran. Jangan memasukkan pengeluaran/booking uji seolah hasil promosi nyata.
