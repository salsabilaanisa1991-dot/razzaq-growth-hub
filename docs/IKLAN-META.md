# Iklan berbayar dari aplikasi · v1.1

Format awal: satu gambar JPG/PNG, tujuan kunjungan website HTTPS, optimasi LINK_CLICKS, tagihan IMPRESSIONS, anggaran sepanjang jadwal (lifetime budget), akun dengan mata uang IDR. Feed Facebook, Instagram, atau keduanya. Bukan format iklan khusus chat WhatsApp. Instagram membutuhkan akun profesional yang terhubung ke Halaman dan dapat dibaca oleh token.

Adapter mengirim HTTP nyata ke `https://graph.facebook.com/v26.0/` ketika koneksi sudah diisi dan operator memilih aksi. **Pengujian pengembangan memakai transport simulasi, bukan akun Meta live.** Parameter, izin akun, resolusi foto, minimum anggaran, kelayakan akun, dan persetujuan iklan tetap perlu diverifikasi dengan akun pemilik sebelum digunakan operasional. Aplikasi menampilkan penolakan Meta dan tidak mencoba mengulang mutasi secara otomatis.

## Yang diperlukan dari pemilik

1. Halaman Facebook yang dikelola dan akun iklan aktif dengan mata uang **IDR**. Aktifkan metode pembayaran melalui antarmuka resmi Meta; aplikasi ini tidak menerima kartu atau data pembayaran.
2. Aplikasi Meta yang dapat memakai Marketing API, serta user/system-user access token yang memiliki `ads_management` dan akses ke akun iklan serta Halaman untuk membuat creative. Akses baca Halaman juga dibutuhkan untuk pemeriksaan identitas dan Instagram terhubung. Izin Page yang dibutuhkan dapat mencakup `pages_read_engagement`, `pages_show_list`, dan `pages_manage_ads`, sesuai penggunaan dan persyaratan Meta.
3. Peran pada aset bisnis yang sesuai. Standard/Advanced Access, App Review atau verifikasi bisnis bergantung siapa yang memakai aplikasi dan aset yang dikelola. Memiliki Halaman Facebook saja tidak otomatis memberi aplikasi izin API.
4. **ID akun iklan**, **ID Halaman**, dan token. Token berbeda dari password Facebook. Token yang expired/dicabut perlu diganti; versi ini belum melakukan OAuth/refresh token otomatis.

Panduan resmi: [Marketing API workspace Meta](https://www.postman.com/meta/facebook-marketing-api/overview), [dokumentasi Marketing API](https://developers.facebook.com/docs/marketing-apis/), [izin aplikasi Meta](https://developers.facebook.com/docs/permissions/).

## Isi koneksi di perangkat/server aplikasi

Hentikan aplikasi dengan Ctrl+C. Dari folder proyek:

```bash
npm run meta:setup
```

Ikuti pertanyaan pada terminal pribadi. Input token/App Secret disembunyikan. Pengaturan tersimpan pada `.env` lokal; tidak mengubah kata sandi admin atau data kampanye. Script tidak memvalidasi kredensial ke Meta; pemeriksaan dilakukan melalui menu aplikasi.

Variabel yang digunakan:

| Variabel | Fungsi |
|---|---|
| `META_ACCESS_TOKEN` | Token dengan izin akun dan Page yang dibutuhkan |
| `META_AD_ACCOUNT_ID` | ID angka; prefix `act_` boleh dipakai saat setup |
| `META_PAGE_ID` | ID angka Halaman Facebook |
| `META_APP_SECRET` | Opsional; mengaktifkan `appsecret_proof` |
| `META_API_VERSION` | Default `v26.0`; cocokkan versi yang tersedia untuk aplikasi Meta |

Jalankan `npm start`, buka aplikasi, lalu **Iklan berbayar → Periksa koneksi**. Hasil sukses mencakup nama akun, mata uang, status aktif, dan nama Halaman. Pemeriksaan ini belum membuktikan semua izin mutasi tersedia atau pembayaran siap untuk setiap iklan. Respons pembuatan/readback dan status Meta menjadi pemeriksaan berikutnya.

Token hanya dibaca server dari `.env`, dikirim lewat header Authorization ke Graph API, dan tidak dikirim dalam respons browser, database kampanye, ekspor JSON, atau GitHub. Ketika App Secret diisi, HMAC proof juga dikirim. Jangan menempelkan token di screenshot/chat.

## Membuat dan mengaktifkan

1. Verifikasi identitas usaha dan buat kampanye lokal seperti sebelumnya.
2. Menu **Iklan berbayar → Draf iklan**. Pilih kampanye, isi judul dan pesan, pilih foto mobil asli (maksimal 5 MB), website, **total anggaran sepanjang jadwal**, waktu mulai/selesai WIB, usia, serta penempatan feed.
3. Lokasi awal adalah **seluruh Indonesia**. Jika ingin dibatasi, cari kota/provinsi melalui Meta dan pilih hasilnya. Lokasi dipastikan kembali sebelum dikirim. Jangkauan sebenarnya mengikuti definisi wilayah/lokasi Meta. Minimum usia 18; batas atas 65 berarti 65+. Versi ini tidak memakai gender, minat, custom audience atau perluasan Advantage+ Audience.
4. Simpan draf. Tahap ini hanya menyimpan data lokal, belum membuat objek di Meta.
5. Tinjau materi dan tekan **Kirim ke Meta · jeda**. Foto diunggah sebagai bytes. Campaign, ad set, creative, dan ad dibuat melalui Marketing API, dengan parent campaign dan objek delivery dalam status PAUSED. ID yang berhasil dibuat disimpan per tahap.
6. Klik **Periksa & aktifkan**. Aplikasi membaca akun dan objek Meta lagi. Nama akun/Halaman, foto, pesan, URL, lokasi, usia, jadwal dan total anggaran ditampilkan. Tidak menggunakan anggaran harian: angka rupiah dikirim utuh sebagai `lifetime_budget` untuk IDR; akun mata uang lain diblokir agar tidak ada konversi tebakan. Pajak atau biaya pada tagihan Meta mengikuti ketentuan akun, di luar angka anggaran media yang ditampilkan.
7. Operator mengulang angka total anggaran, mengetik **AKTIFKAN**, dan mencentang persetujuan. Persetujuan berlaku lima menit dan hanya untuk snapshot tersebut. Perubahan budget, relasi, creative, jadwal, target/penempatan, akun atau snapshot membatalkan aktivasi.
8. Aplikasi mengaktifkan ad set dan ad terlebih dahulu, lalu campaign terakhir. Setelah sukses, status lokal adalah **Aktivasi dikirim**, bukan klaim sudah tayang. Gunakan **Sinkronkan status** untuk membaca `effective_status` dan metrik dari Meta.
9. Gunakan **Jeda di Meta** untuk menjeda parent campaign. Setelah dijeda, aktivasi ulang tetap melalui pemeriksaan akhir dan persetujuan baru. Jadwal mulai harus masih minimal lima menit ke depan; jika sudah terlewat, buat draf dengan jadwal baru.

Anggaran minimum ditentukan Meta, bukan contoh angka yang dijamin diterima. Aplikasi tidak menghitung prediksi jangkauan. Klik dan tayangan tidak sama dengan booking. Pengeluaran/metrik Meta ditampilkan terpisah dari catatan biaya manual agar tidak dijumlah dua kali.

## Gangguan dan operasi parsial

- Permintaan submit ganda dalam proses yang sama diblokir. State disimpan sebelum mutasi, sehingga restart tidak otomatis mengirim ulang objek.
- Jika sebagian objek berhasil dibuat lalu proses terputus, state menjadi **Perlu diperiksa**. Jangan membuat ulang secara membabi buta: buka Ads Manager dengan akun yang sama dan lihat ID yang sudah tersimpan. Campaign yang dibuat aplikasi tetap dimulai dalam status PAUSED.
- Bila seluruh ID sudah tersimpan, tombol **Periksa & aktifkan** dapat membaca ulang objek dan melanjutkan pemeriksaan; ID yang hilang karena respons timeout tidak direkonstruksi otomatis. Periksa/hapus draf parsial secara manual di Meta sebelum membuat pengganti.
- Jika aktivasi gagal di tengah proses, aplikasi mencoba menjeda parent campaign kembali. Ketika konfirmasi jeda juga gagal, status **Perlu diperiksa** dan pesan menyatakan aktivasi belum pasti. Gunakan Ads Manager untuk memastikan kondisi sebenarnya.
- Jika server mati setelah aktivasi berhasil, Meta tetap menjalankan iklan menurut jadwal/anggaran di Meta. Mematikan Termux/server bukan cara menghentikan iklan; jeda melalui aplikasi yang sudah hidup atau langsung melalui Ads Manager.
- Tidak ada transaksi atomik lintas aplikasi/Meta. Perubahan dari operator lain di Ads Manager setelah pemeriksaan terakhir tetap mungkin; pantau kondisi Meta ketika ada beberapa pengelola.

## Verifikasi pengembangan

`npm test` mencakup alur lama dan simulasi HTTP untuk draf iklan, upload paused, budget IDR tanpa perkalian, pemeriksaan snapshot, persetujuan aktivasi, penolakan perubahan eksternal, duplikat, kegagalan parsial, jeda setelah aktivasi gagal, sinkron metrik, serta tidak bocornya token/foto pada daftar data. Ini membuktikan perilaku kode lokal, bukan keberhasilan API live. Token, payment, App Review, penerimaan format iklan, dan penayangan belum diuji dengan akun nyata.
