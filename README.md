# Razzaq Growth Hub · v1.1

Ruang kerja promosi rentalmobilyogya.id untuk **menyiapkan dan mengevaluasi promosi di banyak kanal**. Bahasa Indonesia, tampilan HP/desktop, Node.js 24 dan SQLite. Tidak membutuhkan layanan AI atau paket npm eksternal.

## Yang sudah berfungsi

- Login admin dengan kata sandi; session cookie HttpOnly, pembatasan percobaan login, penolakan permintaan lintas situs.
- Kampanye: penawaran, sasaran, tanggal, anggaran total rencana, kanal, tujuan website atau WhatsApp, serta arsip/aktifkan kembali.
- Draf caption dan arahan foto/video untuk Facebook, Instagram, TikTok, YouTube Shorts, Google Business Profile, WhatsApp Status. Draf menggunakan template, bukan AI.
- Edit caption, ubah tanggal rencana, tandai siap dan catat sudah tayang secara manual. Tidak membuat materi duplikat ketika tombol ditekan ulang.
- Tautan website dengan UTM; tautan WhatsApp dengan kode sumber. Saat di-host publik, endpoint `/go/ID` menghitung permintaan lalu mengarahkan ke tujuan kampanye.
- Pencatatan pelanggan: Baru → Dihubungi → Penawaran → Booking atau Batal, dapat diperbarui sesuai kondisi sebenarnya.
- Input pengeluaran total aktual per kampanye, ringkasan nilai booking dan biaya per booking, ekspor caption CSV dan data JSON.
- Data tersimpan di SQLite, tetap ada setelah server dimulai ulang. Tidak menyimpan kata sandi admin dalam database.
- **Iklan berbayar Meta:** simpan draf bergambar, pilih feed Facebook/Instagram, lokasi Indonesia (negara/kota/provinsi), usia, jadwal WIB dan anggaran total. Adapter Marketing API mengirim objek dalam status PAUSED, membaca kembali konfigurasi, menyediakan pemeriksaan akhir/aktivasi, jeda, serta sinkronisasi status dan metrik. Memerlukan koneksi akun Meta sendiri; belum diuji dengan akun live pada sesi pengembangan ini.

## Batas versi 1.1

**Posting organik masih manual.** Belum ada AI generatif atau sinkronisasi chat WhatsApp. Menu **Iklan berbayar** berbeda dari status materi organik: status iklan/metrik dapat dibaca melalui API Meta setelah koneksi disiapkan. Format awal hanya iklan gambar untuk klik website HTTPS, akun IDR, feed Facebook/Instagram. Belum mendukung iklan khusus percakapan WhatsApp, video/Reels, atau pembelian iklan di TikTok/Google/kanal lain. Tidak menjamin persetujuan, penayangan, jangkauan, atau pemesanan. GitHub menyimpan kode.

Tidak ada pesan massal, scraping grup, atau pengiriman ke kontak. Tautan pelacakan menghitung *permintaan HTTP*, termasuk kemungkinan bot/pratinjau, bukan jumlah orang unik. Klik tidak membuktikan chat atau booking. Tidak mencatat alamat IP atau user agent untuk analitik.

## Mulai di laptop atau VPS

Pasang **Node.js 24 atau lebih baru** dan Git, lalu buka terminal di folder proyek:

```bash
git clone https://github.com/salsabilaanisa1991-dot/razzaq-growth-hub.git
cd razzaq-growth-hub
npm ci --ignore-scripts
npm run setup
npm start
```

Buka **http://127.0.0.1:3080**. Lihat `APP_PASSWORD` pada file `.env` lokal untuk login. Setup membuat kata sandi acak; menjalankan setup lagi tidak menimpa konfigurasi. Jangan unggah `.env` atau folder `data` ke GitHub.

Tidak ada bundling: `npm run build` memeriksa sintaks server, domain, dan JavaScript browser. Berkas `public/` langsung disajikan server. `npm test` menjalankan pengujian domain serta alur HTTP dengan database sementara.

## Alur pemakaian pertama

1. Buka **Pengaturan**. Cocokkan nama, nomor WhatsApp, website, area, dan centang verifikasi. Kontak awal berasal dari halaman depan situs, bukan konfirmasi kepemilikan.
2. Buat **Kampanye**. Isi harga/paket yang nyata dan rincian durasi, sopir, BBM, batas wilayah. Isi anggaran 0 untuk promosi organik.
3. Pilih kanal dan tekan **Siapkan materi**. Tinjau caption, harga, ketersediaan, tanggal, dan arahan visual.
4. Siapkan foto/video asli. Tandai siap, salin caption, dan publikasikan melalui akun masing-masing. Pada Instagram/TikTok, tempatkan tautan pada lokasi yang bisa diklik seperti profil jika tersedia.
5. Setelah benar-benar dipublikasikan, **Tandai sudah tayang**. Aplikasi tidak mengirim posting.
6. Untuk iklan berbayar Facebook/Instagram dari aplikasi, ikuti [docs/IKLAN-META.md](docs/IKLAN-META.md). Siapkan pembayaran di Meta dan koneksi Marketing API terlebih dahulu. Iklan kanal lain tetap diatur melalui pengelola iklan masing-masing.
7. Catat biaya total aktual dan setiap calon pelanggan. Ubah ke Booking saat pemesanan benar-benar terkonfirmasi. Nilai booking bukan kas diterima atau laba.

Perubahan identitas memperbarui tujuan tautan. Baca ulang caption lama untuk mengganti nama/area atau teks kontak yang Anda tulis sendiri. Tautan yang telah disalin ke platform tidak otomatis berubah bila merupakan tautan langsung; ganti posting lama secara manual bila perlu.

## Repository dan pemeriksaan kode

Repository proyek: [salsabilaanisa1991-dot/razzaq-growth-hub](https://github.com/salsabilaanisa1991-dot/razzaq-growth-hub).

Kode disimpan sebagai berkas dan folder di akar repo, sehingga dapat di-clone dan diperiksa langsung. Workflow `.github/workflows/ci.yml` memeriksa sintaks dan menjalankan tes pada push/PR. Status hasilnya tersedia pada tab [Actions](https://github.com/salsabilaanisa1991-dot/razzaq-growth-hub/actions).

**GitHub Pages tidak bisa menjalankan server SQLite aplikasi ini.** Untuk akses aplikasi gunakan VPS atau hosting Node dengan disk persisten. GitHub menyimpan kode sumber; login admin, data pelanggan, dan database dibuat hanya pada server tempat aplikasi dijalankan.

## Hosting VPS

Lihat [docs/VPS.md](docs/VPS.md) untuk reverse proxy HTTPS dan service systemd. Set `PUBLIC_ORIGIN` ke subdomain tersendiri, misalnya `https://promosi.domain-anda.id`; ini hanya contoh dan belum dipasang. Tidak perlu mengganti website WordPress utama.

Satu proses Node dan SQLite cocok untuk operator usaha kecil. Belum ada multi-tenant, pembagian peran, audit rinci, atau database terdistribusi. Batasi akses admin melalui jaringan pribadi/VPN bila memungkinkan. Endpoint `/go/` perlu dapat diakses pelanggan bila memakai tautan penghitung publik.

## Cadangan dan pemulihan

- Tombol **Unduh data JSON** adalah ekspor untuk dibaca/dipindahkan; belum ada impor JSON di UI.
- Untuk cadangan yang bisa dipulihkan langsung: hentikan service, salin seluruh folder `data/` ke lokasi pribadi, lalu jalankan service kembali. Jangan menyalin database aktif dengan `cp` tanpa menghentikan service karena menggunakan WAL.
- Untuk pemulihan: hentikan service, simpan salinan database lama, kembalikan folder `data/` dari cadangan, pastikan kepemilikan file benar, lalu mulai service. APP_PASSWORD tetap berasal dari `.env`; session akan berakhir setelah restart.

## Memperbarui aplikasi yang sudah berjalan

Hentikan proses dengan Ctrl+C dari terminalnya, lalu di folder proyek:

```bash
git pull --ff-only
npm ci --ignore-scripts
npm start
```

Pengaturan `.env` dan database di `data/` tetap digunakan. Setup Meta opsional: hentikan proses, jalankan `npm run meta:setup`, isi koneksi di terminal pribadi, lalu `npm start` dan pilih **Iklan berbayar → Periksa koneksi**. Jangan mengirim token ke chat atau menyimpannya di GitHub.

## Rencana pengembangan berikutnya

Setelah pengujian live dengan akun pemilik, pengembangan dapat menambahkan iklan khusus percakapan WhatsApp, OAuth untuk pengelolaan token, publikasi organik otomatis, serta format/kanal tambahan. Persyaratan izin dan peninjauan masing-masing platform perlu dikonfirmasi.

Dokumentasi resmi awal: [Iklan Facebook/Instagram ke WhatsApp](https://whatsappbusiness.com/products/ads-that-click-to-whatsapp/), [YouTube upload API dan OAuth](https://developers.google.com/youtube/data/guides/uploading_a_video), [Node SQLite](https://nodejs.org/api/sqlite.html).
