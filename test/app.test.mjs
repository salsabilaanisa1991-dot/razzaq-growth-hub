import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server.mjs';
import { csv, validateCampaign, safeWebsite, DEFAULT_SETTINGS } from '../domain.mjs';

const sample = {name:'Liburan keluarga',offer:'Paket 12 jam, mobil + sopir. Harga dikonfirmasi admin.',audience:'Wisatawan keluarga',start:'2026-11-01',end:'2026-11-07',budget:210000,channels:['Facebook','Instagram','TikTok','YouTube Shorts','Google Business Profile','WhatsApp Status'],target:'website'};
test('validasi harga, tanggal, URL dan CSV tidak mengizinkan data berbahaya',()=>{
  assert.throws(()=>validateCampaign({...sample,budget:-1}));
  assert.throws(()=>validateCampaign({...sample,start:'2026-02-30'}));
  assert.throws(()=>validateCampaign({...sample,end:'2026-10-31'}));
  assert.throws(()=>validateCampaign({...sample,channels:['unknown']}));
  assert.throws(()=>safeWebsite('javascript:alert(1)'));
  assert.throws(()=>safeWebsite('https://secret:password@example.com/'));
  assert.match(csv([['=SUM(1,1)','normal','a"b']]),/"'=SUM\(1,1\)"/);
  assert.match(csv([['a"b']]),/a""b/);
});

test('alur HTTP: autentikasi, kampanye, materi, tautan, booking, arsip dan persistensi', async t=>{
  const dir=mkdtempSync(join(tmpdir(),'growth-test-'));
  let server=createApp({dataDir:dir,password:'test-password-123456'});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  let base=`http://127.0.0.1:${server.address().port}`;
  let cookie='';
  const req=async(path,method='GET',body,extra={})=>{
    const r=await fetch(base+path,{method,redirect:'manual',headers:{'Content-Type':'application/json','X-Growth-Request':'1',Cookie:cookie,...extra},...(body?{body:JSON.stringify(body)}:{})});
    const text=await r.text(); let json;try{json=JSON.parse(text);}catch{}
    return {r,text,json};
  };
  t.after(async()=>{if(server.listening)await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});});
  assert.equal((await req('/api/data')).r.status,401);
  assert.equal((await req('/api/login','POST',{password:'wrong'})).r.status,401);
  const login=await req('/api/login','POST',{password:'test-password-123456'});assert.equal(login.r.status,200);
  assert.match(login.r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  cookie=login.r.headers.get('set-cookie').split(';')[0];
  assert.equal((await req('/api/campaigns','POST',sample,{Origin:'https://evil.example'})).r.status,403);
  assert.equal((await req('/api/campaigns','POST',{...sample,budget:-1})).r.status,400);
  const c=(await req('/api/campaigns','POST',sample)).json;assert.ok(c.id);
  assert.equal((await req(`/api/campaigns/${c.id}/generate`,'POST',{})).r.status,400);
  assert.equal((await req('/api/settings','PUT',{...DEFAULT_SETTINGS,contactVerified:true})).r.status,200);
  const generated=await req(`/api/campaigns/${c.id}/generate`,'POST',{});assert.equal(generated.r.status,201);assert.equal(generated.json.length,6);
  const p=generated.json[0];
  assert.match(p.destination,/utm_source=facebook/);assert.match(p.caption,/Liburan|keluarga|Paket/);
  assert.equal((await req(`/api/campaigns/${c.id}/generate`,'POST',{})).r.status,400);
  assert.equal((await req(`/api/posts/${p.id}`,'PATCH',{status:'published'})).r.status,400);
  assert.equal((await req(`/api/posts/${p.id}`,'PATCH',{caption:'Draf sudah diperiksa',status:'ready',plannedDate:'2026-11-03'})).r.status,200);
  assert.equal((await req(`/api/posts/${p.id}`,'PATCH',{status:'published'})).r.status,200);
  const redirect=await req(`/go/${p.id}`);assert.equal(redirect.r.status,302);assert.equal(new URL(redirect.r.headers.get('location')).hostname,'rentalmobilyogya.id');
  assert.equal((await req('/api/data')).json.clicks[0].count,1);
  const lead=(await req('/api/leads','POST',{name:'Pelanggan Uji',campaignId:c.id,channel:'Facebook',stage:'Booking',revenue:600000,notes:'Data pengujian'})).json;
  assert.ok(lead.id);
  assert.equal((await req(`/api/leads/${lead.id}`,'PATCH',{stage:'Batal'})).json.stage,'Batal');
  assert.equal((await req(`/api/campaigns/${c.id}`,'PATCH',{spend:50000})).json.spend,50000);
  assert.match((await req('/api/export/posts.csv')).text,/Brief visual/);
  assert.equal((await req('/api/export/backup.json')).json.version,2);
  const wa=(await req('/api/campaigns','POST',{...sample,name:'Penjemputan',channels:['WhatsApp Status'],target:'whatsapp'})).json;
  const waPost=(await req(`/api/campaigns/${wa.id}/generate`,'POST',{})).json[0];assert.match(waPost.destination,/https:\/\/wa.me\//);
  await req('/api/settings','PUT',{...DEFAULT_SETTINGS,phone:'6281234567890',contactVerified:true});
  const updated=(await req('/api/data')).json.posts.find(row=>row.id===waPost.id);assert.match(updated.destination,/6281234567890/);assert.match(updated.caption,/6281234567890/);
  await req(`/api/campaigns/${c.id}`,'PATCH',{archived:true});
  assert.equal((await req(`/go/${p.id}`)).r.status,410);
  assert.equal((await req(`/api/posts/${p.id}`,'PATCH',{caption:'edit'})).r.status,400);
  assert.equal((await req('/server.mjs')).r.status,404);
  assert.equal((await req('/.env')).r.status,404);
  await req('/api/logout','POST',{});assert.equal((await req('/api/data')).r.status,401);
  await new Promise(r=>server.close(r));
  server=createApp({dataDir:dir,password:'test-password-123456'});server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;
  const next=await req('/api/login','POST',{password:'test-password-123456'});cookie=next.r.headers.get('set-cookie').split(';')[0];
  const persisted=(await req('/api/data')).json;assert.equal(persisted.campaigns.length,2);assert.equal(persisted.posts.length,7);assert.equal(persisted.leads.length,1);assert.equal(persisted.clicks[0].count,1);
});

test('password dan pengaturan publik tidak bisa kosong',()=>{
  assert.throws(()=>createApp({password:'short'}));
  assert.throws(()=>createApp({password:'a-long-password',publicOrigin:'http://public.example'}));
});
