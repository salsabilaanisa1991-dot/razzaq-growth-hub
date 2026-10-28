import { createHash, createHmac } from 'node:crypto';
import { required, money, safeWebsite } from './domain.mjs';

export function metaConfig(env = process.env) {
  return { accessToken: env.META_ACCESS_TOKEN || '', accountId: (env.META_AD_ACCOUNT_ID || '').replace(/^act_/, ''), pageId: env.META_PAGE_ID || '', appSecret: env.META_APP_SECRET || '', version: env.META_API_VERSION || 'v26.0' };
}
export function configStatus(c) {
  const missing = ['accessToken', 'accountId', 'pageId'].filter(k => !c[k]);
  return { configured: !missing.length, missing, accountId: c.accountId, pageId: c.pageId, version: c.version };
}
export function hash(value) { return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex'); }
export function imageBytes(value) {
  if (typeof value !== 'string') throw Error('Pilih foto JPG atau PNG.');
  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw Error('Format foto harus JPG atau PNG.');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length < 20 || bytes.length > 5 * 1024 * 1024) throw Error('Foto maksimal 5 MB.');
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if ((match[1] === 'png' && !png) || (match[1] === 'jpeg' && !jpg)) throw Error('Isi foto tidak cocok dengan formatnya.');
  return { bytes, base64: match[2], mime: `image/${match[1]}` };
}
export function validatePaidAd(b) {
  const startTime = required(b.startTime, 'Waktu mulai', 40);
  const endTime = required(b.endTime, 'Waktu selesai', 40);
  const parse = value => {
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) throw Error('Jadwal menggunakan tanggal dan jam WIB.');
    const d = new Date(`${value}:00+07:00`);
    if (Number.isNaN(d.getTime()) || new Date(d.getTime() + 7 * 3600000).toISOString().slice(0,16) !== value) throw Error('Jadwal tidak valid.');
    return d;
  };
  if (parse(endTime) - parse(startTime) < 3600000) throw Error('Jadwal minimal satu jam dan waktu selesai harus setelah mulai.');
  if (parse(endTime) - parse(startTime) > 90 * 86400000) throw Error('Periode maksimal 90 hari.');
  const budgetTotal = money(b.budgetTotal, 'Total anggaran iklan');
  if (!budgetTotal || budgetTotal > 1000000000) throw Error('Isi total anggaran antara Rp1 dan Rp1 miliar. Minimum sebenarnya ditentukan Meta.');
  if (!Array.isArray(b.placements) || !b.placements.length || b.placements.some(p => !['facebook', 'instagram'].includes(p))) throw Error('Pilih penempatan Facebook atau Instagram.');
  if (!Number.isInteger(Number(b.ageMin)) || !Number.isInteger(Number(b.ageMax)) || Number(b.ageMin) < 18 || Number(b.ageMax) > 65 || Number(b.ageMax) < Number(b.ageMin)) throw Error('Usia harus 18–65 dan batas atas tidak kurang dari batas bawah.');
  const locations = Array.isArray(b.locations) ? b.locations : [];
  if (locations.length > 10) throw Error('Pilih maksimal 10 lokasi.');
  for (const l of locations) if (!l || !['city','region'].includes(l.type) || !/^\d{1,20}$/.test(l.key) || typeof l.name !== 'string') throw Error('Lokasi tidak valid.');
  const website = safeWebsite(b.website);
  const u = new URL(website);
  if (u.protocol !== 'https:' || u.hostname === 'localhost' || u.hostname.endsWith('.local') || !u.hostname.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) || u.hostname.includes(':') || u.hostname === 'wa.me' || u.hostname.endsWith('.whatsapp.com')) throw Error('Versi ini memakai website HTTPS publik. Iklan khusus chat WhatsApp belum tersedia.');
  return { campaignId: required(b.campaignId, 'Kampanye', 60), name: required(b.name, 'Nama iklan', 100), title: required(b.title, 'Judul', 80), message: required(b.message, 'Isi iklan', 2000), website, budgetTotal, startTime, endTime, ageMin: Number(b.ageMin), ageMax: Number(b.ageMax), placements: [...new Set(b.placements)].sort(), locations: locations.map(l => ({key:l.key,type:l.type,name:l.name.slice(0,120)})) };
}
export function adsetTargeting(draft) {
  const geo = draft.locations.length ? {} : { countries: ['ID'] };
  for (const type of ['city','region']) {
    const rows = draft.locations.filter(l => l.type === type);
    if (rows.length) geo[type === 'city' ? 'cities' : 'regions'] = rows.map(l => ({key:l.key}));
  }
  return { geo_locations: geo, age_min: draft.ageMin, age_max: draft.ageMax, publisher_platforms: draft.placements, facebook_positions: draft.placements.includes('facebook') ? ['feed'] : undefined, instagram_positions: draft.placements.includes('instagram') ? ['stream'] : undefined, device_platforms: ['mobile','desktop'], targeting_automation: { advantage_audience: 0 } };
}
export function ensureFuture(draft) {
  if (Date.parse(`${draft.startTime}:00+07:00`) < Date.now() + 5 * 60000) throw Error('Waktu mulai harus minimal 5 menit dari sekarang. Buat draf dengan jadwal baru jika sudah terlewat.');
}

export class MetaAdsClient {
  constructor(config, fetchImpl = fetch) { this.config = config; this.fetch = fetchImpl; }
  ready() {
    const c = this.config;
    if (!configStatus(c).configured) throw Error('Koneksi Meta belum diisi. Jalankan npm run meta:setup di terminal aplikasi.');
    if (!/^\d{1,30}$/.test(c.accountId) || !/^\d{1,30}$/.test(c.pageId) || !/^v\d{2}\.0$/.test(c.version)) throw Error('ID akun, ID Halaman, atau versi API Meta tidak valid.');
  }
  async request(path, method = 'GET', params = {}) {
    this.ready();
    const fields = new URLSearchParams();
    for (const [key,value] of Object.entries(params)) if (value !== undefined) fields.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    if (this.config.appSecret) fields.set('appsecret_proof', createHmac('sha256',this.config.appSecret).update(this.config.accessToken).digest('hex'));
    const url = new URL(`https://graph.facebook.com/${this.config.version}/${path}`);
    if (method === 'GET') url.search = fields.toString();
    let response;
    try { response = await this.fetch(url, { method, headers: { Authorization: `Bearer ${this.config.accessToken}`, ...(method !== 'GET' ? {'Content-Type':'application/x-www-form-urlencoded'} : {}) }, ...(method !== 'GET' ? {body:fields.toString()} : {}), signal: AbortSignal.timeout(25000), redirect:'error' }); }
    catch { throw Error('Koneksi Meta terputus atau melewati batas waktu. Periksa status di Ads Manager sebelum membuat ulang.'); }
    let value;
    try { value = await response.json(); } catch { throw Error('Respons Meta tidak terbaca. Periksa Ads Manager.'); }
    if (!response.ok || value.error) {
      let message = value.error?.error_user_msg || value.error?.message || 'Permintaan ditolak Meta.';
      for (const secret of [this.config.accessToken,this.config.appSecret].filter(Boolean)) message=message.replaceAll(secret,'[rahasia]');
      throw Error(`Meta${value.error?.code ? ` (${value.error.code})` : ''}: ${message.slice(0,500)}`);
    }
    return value;
  }
  accountPath(suffix='') { return `act_${this.config.accountId}${suffix}`; }
  async check() {
    const account = await this.request(this.accountPath(),'GET',{fields:'id,name,currency,account_status,timezone_name'});
    const page = await this.request(this.config.pageId,'GET',{fields:'id,name,instagram_business_account{id,username}'});
    if (account.currency !== 'IDR') throw Error('Versi ini hanya mendukung akun iklan dengan mata uang IDR.');
    if (Number(account.account_status) !== 1) throw Error('Akun iklan belum aktif. Periksa pembayaran dan pembatasan di Meta Ads Manager.');
    return { account, page };
  }
  async locations(q) {
    if (q.trim().length < 2) throw Error('Masukkan minimal dua huruf untuk mencari lokasi.');
    const result = await this.request('search','GET',{type:'adgeolocation',q:q.slice(0,80),location_types:['city','region'],country_code:'ID',limit:15});
    return (result.data || []).filter(l => l.country_code === 'ID' && ['city','region'].includes(l.type)).map(l => ({key:l.key,name:l.name,type:l.type,region:l.region || ''}));
  }
  async createPaused(d, credentials, checkpoint) {
    const uploaded = await this.request(this.accountPath('/adimages'),'POST',{bytes:imageBytes(d.image).base64});
    const imageHash = Object.values(uploaded.images || {})[0]?.hash;
    if (!imageHash) throw Error('Meta tidak mengembalikan identitas foto.');
    let ids = { imageHash }; checkpoint(ids);
    const camp = await this.request(this.accountPath('/campaigns'),'POST',{name:d.name,objective:'OUTCOME_TRAFFIC',special_ad_categories:[],status:'PAUSED',is_adset_budget_sharing_enabled:false});
    if (!camp.id) throw Error('Meta tidak mengembalikan ID kampanye.');
    ids={...ids,campaignId:camp.id}; checkpoint(ids);
    const set = await this.request(this.accountPath('/adsets'),'POST',{name:d.name,campaign_id:camp.id,lifetime_budget:d.budgetTotal,start_time:`${d.startTime}:00+07:00`,end_time:`${d.endTime}:00+07:00`,billing_event:'IMPRESSIONS',optimization_goal:'LINK_CLICKS',destination_type:'WEBSITE',bid_strategy:'LOWEST_COST_WITHOUT_CAP',targeting:adsetTargeting(d),status:'PAUSED'});
    if (!set.id) throw Error('Meta tidak mengembalikan ID set iklan.');
    ids={...ids,adsetId:set.id}; checkpoint(ids);
    const spec = {page_id:this.config.pageId,link_data:{message:d.message,link:d.website,name:d.title,image_hash:imageHash,call_to_action:{type:'LEARN_MORE',value:{link:d.website}}},...(d.placements.includes('instagram') ? {instagram_user_id:credentials.page.instagram_business_account.id} : {})};
    const creative = await this.request(this.accountPath('/adcreatives'),'POST',{name:d.name,object_story_spec:spec});
    if (!creative.id) throw Error('Meta tidak mengembalikan ID materi.');
    ids={...ids,creativeId:creative.id}; checkpoint(ids);
    const ad=await this.request(this.accountPath('/ads'),'POST',{name:d.name,adset_id:set.id,creative:{creative_id:creative.id},status:'PAUSED'});
    if (!ad.id) throw Error('Meta tidak mengembalikan ID iklan.');
    ids={...ids,adId:ad.id}; checkpoint(ids); return ids;
  }
  async snapshot(d) {
    const ids=d.remote;
    const campaign=await this.request(ids.campaignId,'GET',{fields:'id,name,status,objective,daily_budget,lifetime_budget'});
    const adset=await this.request(ids.adsetId,'GET',{fields:'id,campaign_id,name,status,lifetime_budget,daily_budget,start_time,end_time,billing_event,optimization_goal,destination_type,targeting'});
    const creative=await this.request(ids.creativeId,'GET',{fields:'id,object_story_spec'});
    const ad=await this.request(ids.adId,'GET',{fields:'id,name,adset_id,status,effective_status,creative{id},ad_review_feedback'});
    return {campaign,adset,creative,ad};
  }
  assertSnapshot(d,s) {
    const same=(a,b)=>String(a)===String(b);
    if (!same(s.campaign.id,d.remote.campaignId) || s.campaign.objective!=='OUTCOME_TRAFFIC' || s.campaign.status!=='PAUSED' || Number(s.campaign.daily_budget || 0) || Number(s.campaign.lifetime_budget || 0)) throw Error('Kampanye Meta berubah atau belum dijeda. Periksa di Ads Manager.');
    if (!same(s.adset.campaign_id,d.remote.campaignId) || !same(s.ad.adset_id,d.remote.adsetId) || !same(s.ad.creative?.id,d.remote.creativeId) || !same(s.adset.lifetime_budget,d.budgetTotal) || Number(s.adset.daily_budget || 0) || s.adset.optimization_goal!=='LINK_CLICKS' || s.adset.billing_event!=='IMPRESSIONS' || s.adset.destination_type!=='WEBSITE') throw Error('Anggaran, tujuan, atau hubungan iklan Meta berubah. Aktivasi dihentikan.');
    if (Date.parse(s.adset.start_time)!==Date.parse(`${d.startTime}:00+07:00`) || Date.parse(s.adset.end_time)!==Date.parse(`${d.endTime}:00+07:00`)) throw Error('Jadwal Meta berbeda dari draf.');
    const t=s.adset.targeting || {}, expected=adsetTargeting(d);
    const sorted=v=>JSON.stringify((v||[]).map(String).sort());
    if (!same(t.age_min,d.ageMin) || !same(t.age_max,d.ageMax) || sorted(t.publisher_platforms)!==sorted(d.placements) || sorted(t.geo_locations?.countries)!==sorted(expected.geo_locations.countries)) throw Error('Audiens atau penempatan Meta berbeda dari draf.');
    for (const key of ['cities','regions']) if (sorted(t.geo_locations?.[key]?.map(l=>l.key))!==sorted(expected.geo_locations[key]?.map(l=>l.key))) throw Error('Lokasi Meta berbeda dari draf.');
    for (const key of ['facebook_positions','instagram_positions','device_platforms']) if(sorted(t[key])!==sorted(expected[key])) throw Error('Penempatan perangkat atau feed Meta berbeda dari draf.');
    if(Number(t.targeting_automation?.advantage_audience || 0)!==0 || t.excluded_geo_locations || t.custom_audiences || t.flexible_spec || t.interests || t.genders) throw Error('Audiens Meta memiliki perubahan tambahan. Periksa Ads Manager.');
    const spec=s.creative.object_story_spec || {}, link=spec.link_data || {};
    if (!same(spec.page_id,d.pageId) || link.link!==d.website || link.message!==d.message || link.name!==d.title || link.image_hash!==d.remote.imageHash || link.call_to_action?.type!=='LEARN_MORE' || link.call_to_action?.value?.link!==d.website || (d.placements.includes('instagram') && !same(spec.instagram_user_id,d.instagramId))) throw Error('Identitas, foto, atau isi iklan Meta berbeda dari draf.');
  }
  async activate(d) {
    await this.changeStatus(d.remote.adsetId,'ACTIVE');
    await this.changeStatus(d.remote.adId,'ACTIVE');
    await this.changeStatus(d.remote.campaignId,'ACTIVE');
  }
  async changeStatus(id,status) {
    const response=await this.request(id,'POST',{status});
    if(response.success!==true)throw Error('Meta belum mengonfirmasi perubahan status. Periksa Ads Manager.');
    return response;
  }
  async pause(d) { return this.changeStatus(d.remote.campaignId,'PAUSED'); }
  async sync(d) {
    const snapshot=await this.snapshot(d);
    const result=await this.request(`${d.remote.adId}/insights`,'GET',{fields:'spend,impressions,clicks,reach',date_preset:'maximum'});
    return { snapshot, insights:result.data?.[0] || {spend:'0',impressions:'0',clicks:'0',reach:'0'} };
  }
}
