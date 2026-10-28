# Google Search Ads · v1.2

Menu **Google Ads** menyiapkan iklan teks responsif (Responsive Search Ad) untuk pencarian Google, tujuan website HTTPS. Satu draf membuat satu campaign, budget total tersendiri, satu ad group, kata kunci, kriteria lokasi, dan satu RSA. Tidak membuat iklan Display, YouTube, Shopping, Performance Max, atau iklan khusus chat WhatsApp.

**Integrasi belum diuji dengan akun Google Ads nyata.** Pengembangan memakai API simulasi dan browser dengan data uji. Kelayakan akun, akses produksi proyek, persetujuan OAuth, penerimaan iklan/budget, readback field dan penayangan memerlukan pengujian pemilik akun. Tidak ada biaya iklan yang dikeluarkan pada pengembangan.

## Akun dan akses yang diperlukan

1. Akun Google Ads **pengiklan**, aktif, mata uang **IDR**, zona waktu **Asia/Jakarta**. Versi ini menolak mata uang atau zona lain agar rupiah dan jadwal WIB tidak dikonversi secara tebakan. Akun manager/MCC tidak dapat dipakai sebagai target kampanye; jika melewati MCC, isi login-customer-id tambahan. Akun uji ditandai jelas dan tidak menayangkan iklan berbayar sungguhan.
2. Metode pembayaran dan persyaratan/verifikasi pengiklan ditangani di Google Ads. Aplikasi ini tidak meminta data kartu atau password Google.
3. Proyek Google Cloud dengan **Google Ads API** diaktifkan dan tingkat akses yang mengizinkan akun produksi, misalnya Explorer atau tingkat lebih tinggi sesuai kebutuhan. Izin pada akun Google Ads dan izin API proyek adalah dua hal berbeda.
4. OAuth Client **Desktop app** dari proyek Cloud tersebut, beserta client ID, client secret, dan otorisasi pengguna yang mempunyai akses akun Ads. Scope yang digunakan: `https://www.googleapis.com/auth/adwords`.

Dokumentasi Google pada saat implementasi menjelaskan bahwa developer token telah dihentikan sejak **9 September 2026**, dan API access level kini mengikuti proyek Cloud pemilik OAuth client. Karena itu setup baru ini tidak meminta developer token atau mewajibkan akun manager. Beberapa ringkasan/contoh lama Google masih menyebut developer token; ikuti halaman kebijakan onboarding terbaru dan error akun yang sebenarnya.

Rujukan utama: [perubahan developer token dan akses proyek](https://developers.google.com/google-ads/api/docs/api-policy/developer-token), [access levels](https://developers.google.com/google-ads/api/docs/api-policy/access-levels), [OAuth Desktop](https://developers.google.com/identity/protocols/oauth2/native-app), [versi API](https://developers.google.com/google-ads/api/docs/sunset-dates).

## Setup pada perangkat aplikasi

Hentikan aplikasi dengan Ctrl+C, lalu dari folder proyek:

```bash
npm run google:setup
```

Masukkan Customer ID 10 angka (tanda hubung boleh), manager ID opsional, OAuth Client ID Desktop, serta Client Secret pada terminal pribadi. Secret dan refresh token disembunyikan saat diketik. Bila sudah mempunyai refresh token, masukkan secara lokal; bila kosong, script menampilkan URL login resmi Google.

Buka URL itu pada browser yang dapat mengakses **loopback perangkat tempat terminal berjalan**. Pada instalasi lokal HP, browser dan proses Node harus berjalan pada perangkat/jaringan loopback yang sama seperti aplikasi `127.0.0.1`. Script menggunakan port loopback acak, PKCE S256 dan pemeriksaan state; tidak memakai flow copy-paste kode OAuth yang sudah dihentikan Google. Tidak ada password, authorization code atau refresh token yang dicetak.

Untuk VPS, browser di HP tidak dapat langsung menjangkau callback 127.0.0.1 pada VPS. Siapkan loopback/SSH forwarding yang sesuai, atau otorisasi pada perangkat lokal dan pindahkan refresh token melalui prosedur pribadi yang aman. Script tidak membuka callback publik. Jika pengguna membatalkan/tidak menyelesaikan login dalam lima menit, konfigurasi tidak ditulis. Consent screen/test users/persyaratan verifikasi proyek harus disiapkan sesuai kondisi akun dan aturan Google.

Setelah selesai, koneksi ditulis ke `.env` berizin 600 dan tidak mengubah data kampanye, kredensial Meta, atau kata sandi admin:

| Variabel | Fungsi |
|---|---|
| `GOOGLE_ADS_CUSTOMER_ID` | Akun pengiklan 10 angka |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Akun manager/MCC opsional |
| `GOOGLE_ADS_CLIENT_ID` | OAuth Client Desktop dari proyek berizin API |
| `GOOGLE_ADS_CLIENT_SECRET` | Secret client, hanya server lokal |
| `GOOGLE_ADS_REFRESH_TOKEN` | Otorisasi offline pengguna |
| `GOOGLE_ADS_API_VERSION` | Default `v26` |

Jalankan `npm start`, buka **Google Ads → Periksa koneksi Google**. Aplikasi memeriksa akun, mata uang, zona waktu dan status. Koneksi baca yang berhasil belum membuktikan pembayaran siap atau izin mutasi tersedia. Access token diperbarui dari refresh token pada server dan dicache singkat; token dicabut/expired tetap memerlukan setup ulang. Secret tidak dikirim ke browser, database draf, ekspor atau GitHub.

## Alur draf sampai aktivasi

1. Buat kampanye promosi lokal dan verifikasi identitas usaha seperti sebelumnya.
2. Pada **Google Ads → Draf Google**, pilih website, 3–15 judul unik (maksimal 30 karakter), 2–4 deskripsi unik (90 karakter), dan 1–30 kata kunci. Kata kunci dibatasi 80 karakter/10 kata per baris. Input akan divalidasi ulang oleh Google; batas Google untuk karakter tertentu bisa berbeda dari hitungan Unicode UI.
3. Pilih pencocokan **frasa (PHRASE)** atau **tepat (EXACT)**; versi ini tidak memakai broad match. Kata kunci dapat mencakup variasi pencarian sesuai aturan Google, bukan pencocokan string literal semata.
4. Isi **total anggaran sepanjang jadwal**, bid CPC dasar, serta tanggal mulai/selesai WIB. Jadwal memakai granularitas harian: mulai pukul 00:00:00 dan selesai 23:59:59 pada tanggal akhir, sesuai format tanggal-waktu akun Google. Periode inklusif dibatasi 3–90 hari pada aplikasi. Total budget dikirim sebagai `CUSTOM_PERIOD` dan `totalAmountMicros`, bukan anggaran harian. Satu rupiah = 1.000.000 micros dan dikonversi dengan BigInt. Tidak ada fallback otomatis ke daily budget jika Google menolak total budget. Pajak/biaya pada tagihan mengikuti ketentuan akun dan tidak dihitung aplikasi.
5. Lokasi awal adalah seluruh Indonesia. Cari kota/provinsi melalui Google jika ingin dibatasi. Resource lokasi dipastikan kembali sebagai wilayah Indonesia aktif sebelum pembuatan. Target menggunakan **PRESENCE** (keberadaan pengguna) menurut definisi Google; tidak membatasi bahasa pengguna. Search Partners dan Display dimatikan.
6. Simpan draf, baca semua materi dan parameter, lalu **Kirim ke Google · jeda**. Aplikasi memanggil `validateOnly=true` sebelum mutasi. Pembuatan budget/campaign/lokasi/grup/kata kunci/iklan dikirim sebagai satu operasi gabungan atomik dengan `partialFailure=false`. Campaign, grup, dan iklan dimulai PAUSED; keyword ENABLED tidak menayangkan apa pun selama parent masih jeda.
7. Setelah pembuatan, aplikasi membaca ulang objek dan mencocokkan budget total, jaringan, jadwal, relasi resource, CPC, kata kunci, lokasi, judul, deskripsi dan URL. Ketidaksesuaian mengubah status menjadi **Perlu diperiksa**.
8. Tombol **Periksa & aktifkan Google** membaca ulang akun/snapshot dan menampilkan semua judul/deskripsi serta parameter. Operator mengulang total anggaran, mengetik AKTIFKAN, dan menyetujui materi/akun/target/jadwal/bid. Persetujuan berlaku lima menit. Perubahan konfigurasi akun atau objek Google membatalkan persetujuan; pengurutan hasil query saja tidak dianggap perubahan.
9. Aktivasi mengubah grup, iklan dan campaign ke ENABLED dalam batch atomik. Status lokal **Aktivasi dikirim** tidak menyatakan iklan sudah ditayangkan. **Sinkronkan Google** membaca status campaign, kebijakan materi serta biaya, klik dan tayangan. Angka ini terpisah dari catatan biaya manual.
10. **Jeda di Google** mengubah parent campaign menjadi PAUSED. Mengaktifkan ulang tetap perlu persetujuan baru, serta waktu mulai yang masih memenuhi batas minimal lima menit dari sekarang. Untuk jadwal yang sudah terlewat, buat draf baru.

Rujukan teknis: [Search campaign setup](https://developers.google.com/google-ads/api/docs/campaigns/search-campaigns/getting-started), [campaign total budgets](https://developers.google.com/google-ads/api/docs/campaigns/budgets/create-budgets), [batas RSA](https://developers.google.com/google-ads/api/docs/responsive-search-ads/create-responsive-search-ads), [REST atomic grouped operations](https://developers.google.com/google-ads/api/rest/examples).

## Gangguan dan batas operasi

- Pengiriman ganda diblokir; mutasi tidak diulang otomatis setelah koneksi terputus. Jika respons create tidak terbaca, Google mungkin telah membuat kampanye. Cari nama dengan kode draf `[gads_…]` di Google Ads sebelum membuat pengganti. Kampanye yang dibuat selalu mulai dalam status jeda.
- Pada timeout aktivasi, status bisa tidak pasti. Aplikasi mencoba menjeda parent kembali dan memakai **Perlu diperiksa** untuk respons ambigu. Periksa langsung di Google Ads; tidak ada transaksi atomik antara database lokal dan jaringan Google.
- Mematikan Termux/server bukan cara menghentikan campaign yang sudah diaktifkan. Google tetap menjalankan jadwal/budget di servernya. Jeda melalui aplikasi atau Google Ads.
- Fitur ini belum mengelola pembayaran, conversion tracking/optimasi booking, negative keywords, sitelinks/assets tambahan, shared budgets, auto-apply recommendations, atau format iklan lain. Perubahan dari pengelola lain/fitur otomatis Google perlu ditinjau dalam Google Ads; snapshot tidak menjanjikan audit atas seluruh pengaturan akun.
- Tanpa koneksi API, draf tetap dapat disimpan. Tidak ada mode simulasi yang ditampilkan sebagai akun live di aplikasi; transport palsu hanya disuntikkan oleh script pengujian.
