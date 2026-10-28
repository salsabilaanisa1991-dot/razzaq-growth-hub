import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, timingSafeEqual, scryptSync } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANNELS, DEFAULT_SETTINGS, STAGES, validateSettings, validateCampaign, validateLead, required, money, validDate, trackedDestination, createCaption, creativeBrief, csv } from './domain.mjs';

export function createApp({ dataDir = './data', password, publicOrigin = '' } = {}) {
  if (!password || password.length < 12) throw Error('APP_PASSWORD minimal 12 karakter. Jalankan npm run setup dahulu.');
  if (publicOrigin && new URL(publicOrigin).protocol !== 'https:') throw Error('PUBLIC_ORIGIN harus HTTPS.');
  const origin = publicOrigin.replace(/\/$/, '');
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'growth.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, type TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS clicks (post_id TEXT NOT NULL, at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS clicks_post ON clicks(post_id);`);
  const salt = randomBytes(16);
  const passHash = scryptSync(password, salt, 64);
  const sessions = new Map();
  const attempts = new Map();
  const root = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
  const save = (type, obj) => { db.prepare('INSERT INTO records VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(obj.id, type, JSON.stringify(obj)); return obj; };
  const get = (id, type) => { const row = db.prepare('SELECT data FROM records WHERE id=? AND type=?').get(id, type); return row ? JSON.parse(row.data) : null; };
  const list = type => db.prepare('SELECT data FROM records WHERE type=? ORDER BY rowid DESC').all(type).map(r => JSON.parse(r.data));
  const settings = () => get('settings', 'settings') || { id: 'settings', ...DEFAULT_SETTINGS };
  const now = () => new Date().toISOString();
  const id = prefix => `${prefix}_${randomBytes(9).toString('hex')}`;
  function mustGet(key, type) { const obj = get(key, type); if (!obj) { const e = Error('Data tidak ditemukan.'); e.status = 404; throw e; } return obj; }
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };
  const send = (res, status, value, extra = {}) => { res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', ...extra }); res.end(typeof value === 'string' ? value : JSON.stringify(value)); };
  async function body(req) {
    if (!req.headers['content-type']?.startsWith('application/json')) throw Error('Gunakan JSON.');
    let value = '';
    for await (const chunk of req) { value += chunk; if (Buffer.byteLength(value) > 64000) throw Error('Data terlalu besar.'); }
    try { const b = JSON.parse(value); if (!b || typeof b !== 'object' || Array.isArray(b)) throw Error(); return b; } catch { throw Error('JSON tidak valid.'); }
  }
  function authorized(req) {
    const token = /(?:^|;\s*)growth_session=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
    if (!token) return false;
    if ((sessions.get(token) || 0) < Date.now()) { sessions.delete(token); return false; }
    return token;
  }
  const server = createServer(async (req, res) => {
    try {
      const base = origin || `http://${req.headers.host}`;
      const url = new URL(req.url, base);
      const path = url.pathname;
      if (req.method === 'OPTIONS') return send(res, 403, { error: 'Akses lintas situs tidak diizinkan.' });
      if (!['GET', 'HEAD'].includes(req.method)) {
        if (req.headers['x-growth-request'] !== '1' || (req.headers.origin && req.headers.origin !== base)) return send(res, 403, { error: 'Permintaan lintas situs ditolak.' });
      }
      if (path === '/api/login' && req.method === 'POST') {
        const key = req.socket.remoteAddress;
        const attempt = attempts.get(key) || { count: 0, until: Date.now() + 60000 };
        if (attempt.until < Date.now()) { attempt.count = 0; attempt.until = Date.now() + 60000; }
        attempts.set(key, attempt);
        if (++attempt.count > 12) return send(res, 429, { error: 'Terlalu banyak percobaan. Coba satu menit lagi.' });
        const b = await body(req);
        if (typeof b.password !== 'string' || b.password.length > 1000 || !timingSafeEqual(scryptSync(b.password, salt, 64), passHash)) return send(res, 401, { error: 'Kata sandi tidak sesuai.' });
        for (const [token, expiry] of sessions) if (expiry < Date.now()) sessions.delete(token);
        const token = randomBytes(32).toString('hex');
        sessions.set(token, Date.now() + 12 * 3600000);
        return send(res, 200, { ok: true }, { 'Set-Cookie': `growth_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${origin ? '; Secure' : ''}` });
      }
      if (path.startsWith('/go/') && req.method === 'GET') {
        const post = mustGet(path.slice(4), 'post');
        const c = mustGet(post.campaignId, 'campaign');
        const s = settings();
        if (c.archived || !s.contactVerified) return send(res, 410, { error: 'Tautan kampanye tidak aktif.' });
        db.prepare('INSERT INTO clicks VALUES (?, ?)').run(post.id, now());
        res.writeHead(302, { ...headers, Location: trackedDestination(c, post, s) });
        return res.end();
      }
      if (path.startsWith('/api/')) {
        const token = authorized(req);
        if (!token) return send(res, 401, { error: 'Silakan masuk.' });
        if (path === '/api/logout' && req.method === 'POST') {
          sessions.delete(token);
          return send(res, 200, { ok: true }, { 'Set-Cookie': `growth_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${origin ? '; Secure' : ''}` });
        }
        if (path === '/api/data' && req.method === 'GET') return send(res, 200, {
          settings: settings(), campaigns: list('campaign'), posts: list('post'), leads: list('lead'), channels: CHANNELS, stages: STAGES,
          clicks: db.prepare('SELECT post_id, COUNT(*) AS count FROM clicks GROUP BY post_id').all(), publicOrigin: origin
        });
        if (path === '/api/settings' && req.method === 'PUT') {
          const b = validateSettings(await body(req));
          const s = { id: 'settings', ...b, updatedAt: now() };
          db.exec('BEGIN');
          try {
            save('settings', s);
            for (const p of list('post')) {
              const destination = trackedDestination(mustGet(p.campaignId, 'campaign'), p, s);
              p.caption = p.caption.replaceAll(p.destination, destination);
              p.destination = destination;
              save('post', { ...p, updatedAt: now() });
            }
            db.exec('COMMIT');
          } catch (err) { db.exec('ROLLBACK'); throw err; }
          return send(res, 200, s);
        }
        if (path === '/api/campaigns' && req.method === 'POST') {
          const b = validateCampaign(await body(req));
          return send(res, 201, save('campaign', { id: id('cmp'), ...b, spend: 0, archived: false, createdAt: now(), updatedAt: now() }));
        }
        const cm = /^\/api\/campaigns\/([a-z0-9_]+)$/.exec(path);
        if (cm && req.method === 'PATCH') {
          const c = mustGet(cm[1], 'campaign');
          const b = await body(req);
          if ('archived' in b) c.archived = b.archived === true;
          if ('spend' in b) c.spend = money(b.spend, 'Pengeluaran aktual');
          c.updatedAt = now();
          return send(res, 200, save('campaign', c));
        }
        const gen = /^\/api\/campaigns\/([a-z0-9_]+)\/generate$/.exec(path);
        if (gen && req.method === 'POST') {
          const c = mustGet(gen[1], 'campaign');
          const s = settings();
          if (!s.contactVerified) throw Error('Verifikasi nomor dan website pada Pengaturan sebelum membuat materi.');
          if (c.archived) throw Error('Kampanye sudah diarsipkan.');
          if (list('post').some(p => p.campaignId === c.id)) throw Error('Materi sudah dibuat. Edit materi yang ada agar tidak duplikat.');
          const days = Math.round((Date.parse(c.end) - Date.parse(c.start)) / 86400000) + 1;
          const posts = c.channels.map((channel, i) => {
            const p = { id: id('post'), campaignId: c.id, channel, status: 'draft', plannedDate: new Date(Date.parse(c.start) + (i % days) * 86400000).toISOString().slice(0, 10), brief: creativeBrief(channel), createdAt: now(), updatedAt: now() };
            p.destination = trackedDestination(c, p, s);
            p.trackingUrl = `${origin || base}/go/${p.id}`;
            p.caption = createCaption(c, channel, s, origin ? p.trackingUrl : p.destination);
            return p;
          });
          db.exec('BEGIN');
          try { posts.forEach(p => save('post', p)); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
          return send(res, 201, posts);
        }
        const pm = /^\/api\/posts\/([a-z0-9_]+)$/.exec(path);
        if (pm && req.method === 'PATCH') {
          const p = mustGet(pm[1], 'post');
          const b = await body(req);
          const c = mustGet(p.campaignId, 'campaign');
          if (c.archived) throw Error('Aktifkan kembali kampanye untuk mengedit materi.');
          if ('caption' in b) p.caption = required(b.caption, 'Caption', 6000);
          if ('plannedDate' in b) p.plannedDate = validDate(b.plannedDate, 'Tanggal rencana');
          if ('status' in b) {
            if (!['draft', 'ready', 'published'].includes(b.status)) throw Error('Status materi tidak valid.');
            if (b.status === 'published' && p.status !== 'ready' && p.status !== 'published') throw Error('Tinjau dan tandai siap sebelum menandai sudah tayang.');
            p.status = b.status;
            p.publishedAt = p.status === 'published' ? now() : null;
          }
          p.updatedAt = now();
          return send(res, 200, save('post', p));
        }
        if (path === '/api/leads' && req.method === 'POST') {
          const b = validateLead(await body(req));
          mustGet(b.campaignId, 'campaign');
          if (!CHANNELS.includes(b.channel)) throw Error('Kanal tidak valid.');
          return send(res, 201, save('lead', { id: id('lead'), ...b, createdAt: now(), updatedAt: now() }));
        }
        const lm = /^\/api\/leads\/([a-z0-9_]+)$/.exec(path);
        if (lm && req.method === 'PATCH') {
          const l = mustGet(lm[1], 'lead');
          const b = validateLead({ ...l, ...await body(req) });
          mustGet(b.campaignId, 'campaign');
          if (!CHANNELS.includes(b.channel)) throw Error('Kanal tidak valid.');
          return send(res, 200, save('lead', { ...l, ...b, updatedAt: now() }));
        }
        if (path === '/api/export/posts.csv' && req.method === 'GET') {
          const rows = [['ID', 'Kampanye', 'Kanal', 'Tanggal WIB', 'Status manual', 'Caption', 'Brief visual', 'Tujuan', 'Tautan hitung permintaan']];
          list('post').forEach(p => rows.push([p.id, get(p.campaignId, 'campaign')?.name, p.channel, p.plannedDate, p.status, p.caption, p.brief, p.destination, p.trackingUrl]));
          return send(res, 200, csv(rows), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="materi-promosi.csv"' });
        }
        if (path === '/api/export/backup.json' && req.method === 'GET') return send(res, 200, { version: 1, exportedAt: now(), settings: settings(), campaigns: list('campaign'), posts: list('post'), leads: list('lead'), clicks: db.prepare('SELECT * FROM clicks').all() }, { 'Content-Disposition': 'attachment; filename="razzaq-backup.json"' });
        return send(res, 404, { error: 'Endpoint tidak tersedia.' });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Metode tidak diizinkan.' });
      const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
      if (!files[path]) return send(res, 404, { error: 'Halaman tidak ditemukan.' });
      const [file, mime] = files[path];
      res.writeHead(200, { ...headers, 'Content-Type': `${mime}; charset=utf-8` });
      res.end(req.method === 'HEAD' ? '' : readFileSync(join(root, file)));
    } catch (e) {
      if (res.headersSent) return res.end();
      send(res, e.status || 400, { error: e.message || 'Permintaan tidak berhasil.' });
    }
  });
  server.on('close', () => db.close());
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || '127.0.0.1';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !process.env.PUBLIC_ORIGIN) throw Error('Untuk akses publik, isi PUBLIC_ORIGIN HTTPS dan gunakan reverse proxy.');
  createApp({ dataDir: process.env.DATA_DIR || './data', password: process.env.APP_PASSWORD, publicOrigin: process.env.PUBLIC_ORIGIN }).listen(Number(process.env.PORT || 3080), host, () => console.log(`Razzaq Growth Hub siap di ${host}:${process.env.PORT || 3080}`));
}
