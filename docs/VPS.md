# Menjalankan di VPS

Persiapan: Linux dengan Node.js 24+, domain/subdomain yang diarahkan ke IP VPS, reverse proxy HTTPS seperti Caddy, dan disk yang persisten. Contoh memakai folder `/opt/razzaq-growth-hub` dan pengguna service `growth` yang dibuat administrator. Perintah sistem mengikuti distro masing-masing.

1. Clone repo ke `/opt/razzaq-growth-hub`, pasang dependency dengan `npm ci --ignore-scripts`, jalankan `npm run setup` sebagai pemilik folder.
2. Edit `.env`: tetap gunakan `HOST=127.0.0.1`, `PORT=3080`, ganti `PUBLIC_ORIGIN=https://promosi.domain-anda.id` dengan subdomain sebenarnya. Gunakan password acak hasil setup. Pastikan `.env` hanya bisa dibaca operator/service (`chmod 600 .env`).
3. Pastikan user `growth` dapat membaca kode dan menulis ke folder `data/`. Buat folder data sebelum mengaktifkan batas `ReadWritePaths` di bawah.
4. Pasang systemd unit `/etc/systemd/system/razzaq-growth.service`:

```ini
[Unit]
Description=Razzaq Growth Hub
After=network.target

[Service]
User=growth
Group=growth
WorkingDirectory=/opt/razzaq-growth-hub
EnvironmentFile=/opt/razzaq-growth-hub/.env
ExecStart=/usr/bin/node /opt/razzaq-growth-hub/server.mjs
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/razzaq-growth-hub/data

[Install]
WantedBy=multi-user.target
```

Sesuaikan `ExecStart` dengan lokasi `node` sebenarnya (`command -v node`). Muat ulang unit, lalu aktifkan service memakai `sudo systemctl daemon-reload` dan `sudo systemctl enable --now razzaq-growth`.

5. Contoh Caddyfile:

```caddyfile
promosi.domain-anda.id {
    reverse_proxy 127.0.0.1:3080
}
```

Ganti host contoh, validasi konfigurasi Caddy, lalu reload. Izinkan port HTTPS/HTTP untuk Caddy; jangan buka port 3080 ke internet. PUBLIC_ORIGIN harus persis sama dengan origin browser tanpa garis miring penutup. Cookie login menggunakan Secure pada mode ini.

6. Buka subdomain, login, buat materi baru setelah PUBLIC_ORIGIN diset. Materi yang dibuat saat mode lokal menggunakan tautan langsung dalam caption; ganti caption dan tautan profil secara manual agar memakai `/go/ID` publik bila ingin penghitung permintaan. URL pelacakan masing-masing tersedia pada ekspor CSV. Mengubah domain/subdomain setelah membuat materi memerlukan pembaruan tautan pada posting lama.

7. Periksa login, alur simpan, ekspor, redirect, serta persistence setelah restart sebelum menjalankan promosi nyata. Setup VPS dan DNS belum dilakukan dari proyek ini.

Tidak menjalankan pembayaran atau penerbitan iklan otomatis. Untuk akses operator tambahan, bagikan kata sandi hanya pada pihak berwenang; versi ini memakai satu akun admin bersama, tanpa audit per pengguna.
