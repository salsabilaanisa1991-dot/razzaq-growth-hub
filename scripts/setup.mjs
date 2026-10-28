import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env')) {
  console.log('.env sudah ada; tidak ditimpa. Kata sandi ada pada APP_PASSWORD.');
} else {
  const password = randomBytes(18).toString('base64url');
  writeFileSync('.env', `HOST=127.0.0.1\nPORT=3080\nAPP_PASSWORD=${password}\nDATA_DIR=./data\nPUBLIC_ORIGIN=\n`, {mode: 0o600});
  console.log('Pengaturan tersimpan di .env. Buka file itu untuk melihat APP_PASSWORD. Jalankan npm start.');
}
