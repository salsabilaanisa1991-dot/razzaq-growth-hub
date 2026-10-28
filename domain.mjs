export const CHANNELS = ['Facebook', 'Instagram', 'TikTok', 'YouTube Shorts', 'Google Business Profile', 'WhatsApp Status'];
export const STAGES = ['Baru', 'Dihubungi', 'Penawaran', 'Booking', 'Batal'];
export const DEFAULT_SETTINGS = { brand: 'Razzaq Transport', website: 'https://rentalmobilyogya.id/', phone: '6281227987886', area: 'Yogyakarta', contactVerified: false };

export function required(value, label, max = 300) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw Error(`${label} wajib diisi, maksimal ${max} karakter.`);
  return value.trim();
}
export function money(value, label) {
  const n = Number(value);
  if (value === '' || value === null || !Number.isSafeInteger(n) || n < 0 || n > 1e12) throw Error(`${label} harus rupiah bulat, minimal 0.`);
  return n;
}
export function validDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || Number.isNaN(Date.parse(value)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw Error(`${label} tidak valid.`);
  return value;
}
export function safeWebsite(value) {
  let u;
  try { u = new URL(value); } catch { throw Error('Alamat website tidak valid.'); }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw Error('Website harus menggunakan HTTP atau HTTPS tanpa kredensial.');
  return u.toString();
}
export function validateSettings(b) {
  const phone = required(b.phone, 'WhatsApp', 16).replace(/[\s+()-]/g, '');
  if (!/^[1-9]\d{8,14}$/.test(phone)) throw Error('WhatsApp menggunakan kode negara, contoh 62812…');
  return { brand: required(b.brand, 'Nama usaha', 80), website: safeWebsite(b.website), phone, area: required(b.area, 'Area', 100), contactVerified: b.contactVerified === true };
}
export function validateCampaign(b) {
  const start = validDate(b.start, 'Tanggal mulai');
  const end = validDate(b.end, 'Tanggal selesai');
  if (end < start) throw Error('Tanggal selesai tidak boleh sebelum tanggal mulai.');
  const channels = [...new Set(b.channels || [])];
  if (!channels.length || channels.some(c => !CHANNELS.includes(c))) throw Error('Pilih minimal satu kanal yang tersedia.');
  return { name: required(b.name, 'Nama kampanye', 100), offer: required(b.offer, 'Penawaran', 800), audience: required(b.audience, 'Sasaran', 200), start, end, budget: money(b.budget, 'Rencana anggaran'), channels, target: b.target === 'whatsapp' ? 'whatsapp' : 'website' };
}
export function validateLead(b) {
  if (!STAGES.includes(b.stage)) throw Error('Status pelanggan tidak valid.');
  return { campaignId: required(b.campaignId, 'Kampanye', 60), name: required(b.name, 'Nama/alias pelanggan', 100), channel: required(b.channel, 'Kanal', 60), stage: b.stage, revenue: money(b.revenue, 'Nilai booking'), notes: String(b.notes || '').slice(0, 1000) };
}
export function trackedDestination(c, p, settings) {
  if (c.target === 'whatsapp') {
    return `https://wa.me/${settings.phone}?text=${encodeURIComponent(`Halo ${settings.brand}, saya ingin cek unit dan tanggal untuk ${c.name}. [${p.channel} | ${p.id}]`)}`;
  }
  const url = new URL(settings.website);
  url.searchParams.set('utm_source', p.channel.toLowerCase().replaceAll(' ', '_'));
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', c.id);
  url.searchParams.set('utm_content', p.id);
  return url.toString();
}
export function createCaption(c, channel, s, link) {
  const hooks = {
    'Facebook': `Ada rencana perjalanan ke ${s.area}?`,
    'Instagram': `Rencana jalan-jalan ke ${s.area} dimulai dari sini.`,
    'TikTok': `Mau ke ${s.area}? Cek kebutuhan transportasimu dulu.`,
    'YouTube Shorts': `Siapkan perjalananmu ke ${s.area}.`,
    'Google Business Profile': `Informasi sewa mobil ${s.area} — ${s.brand}`,
    'WhatsApp Status': `Butuh mobil untuk perjalanan di ${s.area}?`
  };
  const cta = ['TikTok', 'Instagram', 'YouTube Shorts'].includes(channel) ? 'Lihat tautan profil atau hubungi admin untuk cek tanggal dan unit. Tautan kampanye untuk profil/deskripsi:' : 'Cek tanggal, unit, dan rincian paket melalui tautan berikut:';
  return `${hooks[channel]}\n\n${c.offer}\n\n${s.brand} melayani kebutuhan perjalanan di ${s.area}.\n${cta}\n${link}\n\nKetersediaan dan harga dikonfirmasi admin sebelum pemesanan.${channel === 'Google Business Profile' || channel === 'WhatsApp Status' ? '' : '\n\n#RentalMobilJogja #SewaMobilJogja #WisataJogja'}`;
}
export function creativeBrief(channel) {
  return ['TikTok', 'YouTube Shorts', 'Instagram'].includes(channel)
    ? 'Video vertikal 9:16: buka dengan mobil asli (0–3 detik), tunjukkan interior dan ruang bagasi (3–12 detik), tampilkan detail paket yang sudah diverifikasi (12–20 detik), tutup dengan ajakan cek unit. Gunakan rekaman milik sendiri dan musik berizin.'
    : 'Foto mobil asli dari depan dan interior. Tampilkan jenis mobil, durasi, cakupan harga, dan kontak yang sudah diverifikasi. Hindari klaim termurah atau diskon yang tidak dapat dibuktikan.';
}
export function csv(rows) {
  return '\ufeff' + rows.map(row => row.map(v => {
    let s = String(v ?? '');
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return `"${s.replaceAll('"', '""')}"`;
  }).join(',')).join('\r\n');
}
