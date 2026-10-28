import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
import {DEFAULT_SETTINGS} from '../domain.mjs';
import {validatePaidAd,imageBytes,MetaAdsClient} from '../meta-ads.mjs';

const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
import {fakeMeta,cfg} from './fake-meta.mjs';
const time=ms=>new Date(ms+7*3600000).toISOString().slice(0,16);
const draft=()=>({campaignId:'cmp_test',name:'Iklan keluarga',title:'Sewa mobil Jogja',message:'Cek paket dan ketersediaan melalui website.',website:'https://rentalmobilyogya.id/',budgetTotal:125000,startTime:time(Date.now()+2*3600000),endTime:time(Date.now()+7*86400000),ageMin:18,ageMax:65,placements:['facebook'],locations:[],image});

async function fixture(t,{configured=true}={}){
  const dir=mkdtempSync(join(tmpdir(),'paid-ads-test-')),meta=fakeMeta();
  const server=createApp({dataDir:dir,password:'paid-test-password-123',meta:{config:configured?{...cfg}:{...cfg,accessToken:''},fetchImpl:meta.fetchImpl}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;let cookie='';
  const req=async(path,method='GET',body,headers={})=>{
    const response=await fetch(base+'/api/'+path,{method,headers:{'Content-Type':'application/json','X-Growth-Request':'1',Cookie:cookie,...headers},...(body?{body:JSON.stringify(body)}:{})});
    const text=await response.text();let json;try{json=JSON.parse(text);}catch{}return {status:response.status,json,text,response};
  };
  t.after(async()=>{await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});});
  const login=await req('login','POST',{password:'paid-test-password-123'});cookie=login.response.headers.get('set-cookie').split(';')[0];
  await req('settings','PUT',{...DEFAULT_SETTINGS,contactVerified:true});
  const c=await req('campaigns','POST',{name:'Promosi uji',offer:'Paket dikonfirmasi admin',audience:'Wisatawan',start:'2026-11-01',end:'2026-11-07',budget:0,channels:['Facebook'],target:'website'});
  const create=async(extra={})=>req('paid-ads','POST',{...draft(),campaignId:c.json.id,...extra});
  const all=async()=>(await req('data')).json.paidAds;
  return {req,create,all,meta,campaign:c.json};
}

test('draf: format foto, anggaran, URL, usia dan jadwal divalidasi',()=>{
  assert.equal(validatePaidAd(draft()).budgetTotal,125000);
  for(const changes of [{budgetTotal:0},{budgetTotal:1.5},{website:'http://127.0.0.1/'},{website:'https://wa.me/62812'},{ageMin:17},{ageMax:17},{placements:['tiktok']},{startTime:'2026-02-30T10:00'}])assert.throws(()=>validatePaidAd({...draft(),...changes}));
  assert.equal(imageBytes(image).mime,'image/png');assert.throws(()=>imageBytes('data:image/png;base64,PGh0bWw+'));
});
test('koneksi kosong: draf tetap dapat disimpan, tidak ada panggilan Meta dan tidak ada kebocoran token',async t=>{
  const f=await fixture(t,{configured:false});const created=await f.create();assert.equal(created.status,201);
  assert.equal((await f.req(`paid-ads/${created.json.id}/submit`,'POST',{confirmed:true})).status,400);
  assert.equal(f.meta.calls.length,0);assert.equal((await f.all())[0].state,'draft');
  assert.equal((await f.req('data')).text.includes('dummy-test-token'),false);
  assert.equal((await f.req('data')).text.includes('iVBORw0'),false);
});
test('alur iklan: draf, upload paused, tinjauan, aktivasi beranggaran tepat, sinkron, pause',async t=>{
  const f=await fixture(t);
  assert.equal((await f.req('meta/check','POST',{})).status,200);
  assert.equal((await f.req('meta/locations?q=Yogya')).json[0].country_code,undefined);
  const created=await f.create({locations:[{key:'1143',name:'Yogyakarta',type:'region'}]});assert.equal(created.status,201);const key=created.json.id;
  const imageResponse=await f.req(`paid-ads/${key}/image`);assert.equal(imageResponse.response.headers.get('content-type'),'image/png');
  assert.equal((await f.req(`paid-ads/${key}`,'PATCH',{title:'Judul disetujui'})).status,200);
  assert.equal((await f.req(`paid-ads/${key}/submit`,'POST',{confirmed:true})).status,200);
  const d=(await f.all())[0];assert.equal(d.state,'paused');assert.ok(d.remote.adId);
  const writes=f.meta.calls.filter(c=>c.method==='POST');assert.equal(writes.length,5);
  assert.equal(writes.find(c=>c.path.endsWith('/adsets')).params.lifetime_budget,'125000');
  assert.equal(writes.some(c=>c.params.status==='ACTIVE'),false);
  assert.equal((await f.req(`paid-ads/${key}/submit`,'POST',{confirmed:true})).status,400);
  assert.equal((await f.req(`paid-ads/${key}`,'PATCH',{budgetTotal:1})).status,400);
  const review=(await f.req(`paid-ads/${key}/review`,'POST',{})).json;assert.ok(review.approvalToken);
  const approval={approvalToken:review.approvalToken,confirmed:true,budgetTotal:125000,confirmText:'AKTIFKAN'};
  assert.equal((await f.req(`paid-ads/${key}/activate`,'POST',{...approval,budgetTotal:12500})).status,400);
  assert.equal((await f.req(`paid-ads/${key}/activate`,'POST',{...approval,confirmed:false})).status,400);
  assert.equal(f.meta.calls.some(c=>c.params.status==='ACTIVE'),false);
  assert.equal((await f.req(`paid-ads/${key}/activate`,'POST',approval)).status,200);
  assert.deepEqual(f.meta.calls.filter(c=>c.method==='POST'&&c.params.status==='ACTIVE').map(c=>c.path),[d.remote.adsetId,d.remote.adId,d.remote.campaignId]);
  assert.equal((await f.req(`paid-ads/${key}/activate`,'POST',approval)).status,400);
  const sync=await f.req(`paid-ads/${key}/sync`,'POST',{});assert.equal(sync.status,200);assert.equal(sync.json.insights.spend,'12500');assert.equal(sync.json.snapshot.ad.effective_status,'PENDING_REVIEW');
  const paused=await f.req(`paid-ads/${key}/pause`,'POST',{});assert.equal(paused.json.state,'paused');assert.equal(f.meta.objects.get(d.remote.campaignId).status,'PAUSED');
  const serialized=(await f.req('data')).text;assert.equal(serialized.includes(cfg.accessToken),false);assert.equal(serialized.includes(review.approvalToken),false);assert.equal(serialized.includes('iVBORw0'),false);
  const backup=(await f.req('export/backup.json')).json;assert.equal(backup.paidAds.length,1);assert.equal('approval' in backup.paidAds[0],false);
});
test('perubahan budget atau materi di Meta membatalkan aktivasi sebelum ada pengeluaran',async t=>{
  const f=await fixture(t);const d=(await f.create()).json;await f.req(`paid-ads/${d.id}/submit`,'POST',{confirmed:true});
  const stored=(await f.all())[0];const review=(await f.req(`paid-ads/${d.id}/review`,'POST',{})).json;
  f.meta.objects.get(stored.remote.adsetId).lifetime_budget='999999';
  const approval={approvalToken:review.approvalToken,confirmed:true,budgetTotal:125000,confirmText:'AKTIFKAN'};
  assert.equal((await f.req(`paid-ads/${d.id}/activate`,'POST',approval)).status,400);
  assert.equal(f.meta.calls.some(c=>c.params.status==='ACTIVE'),false);
  f.meta.objects.get(stored.remote.adsetId).lifetime_budget='125000';
  f.meta.objects.get(stored.remote.creativeId).object_story_spec.link_data.link='https://other.example/';
  assert.equal((await f.req(`paid-ads/${d.id}/review`,'POST',{})).status,400);
});
test('submit bersamaan tidak membuat duplikat dan kegagalan parsial tidak diulang otomatis',async t=>{
  const f=await fixture(t);const d=(await f.create()).json;
  const results=await Promise.all([f.req(`paid-ads/${d.id}/submit`,'POST',{confirmed:true}),f.req(`paid-ads/${d.id}/submit`,'POST',{confirmed:true})]);
  assert.deepEqual(results.map(x=>x.status).sort(),[200,400]);assert.equal(f.meta.calls.filter(c=>c.path.endsWith('/campaigns')).length,1);
  const second=(await f.create()).json;f.meta.state.fail=(path,method)=>method==='POST'&&path.endsWith('/adsets');
  const failure=await f.req(`paid-ads/${second.id}/submit`,'POST',{confirmed:true});assert.equal(failure.status,400);assert.equal(failure.text.includes(cfg.accessToken),false);
  const count=f.meta.calls.length;assert.equal((await f.req(`paid-ads/${second.id}/submit`,'POST',{confirmed:true})).status,400);assert.equal(f.meta.calls.length,count);
  assert.equal((await f.all()).find(d=>d.id===second.id).state,'needs_review');
});
test('mata uang bukan IDR ditolak sebelum mutasi dan kegagalan aktivasi menjeda kampanye',async t=>{
  const f=await fixture(t);const d=(await f.create()).json;f.meta.state.currency='USD';
  assert.equal((await f.req(`paid-ads/${d.id}/submit`,'POST',{confirmed:true})).status,400);assert.equal(f.meta.calls.some(c=>c.method==='POST'),false);
  f.meta.state.currency='IDR';await f.req(`paid-ads/${d.id}/submit`,'POST',{confirmed:true});const stored=(await f.all())[0];
  const review=(await f.req(`paid-ads/${d.id}/review`,'POST',{})).json;
  f.meta.state.fail=(path,method,p)=>method==='POST'&&path===stored.remote.campaignId&&p.status==='ACTIVE';
  const r=await f.req(`paid-ads/${d.id}/activate`,'POST',{approvalToken:review.approvalToken,confirmed:true,budgetTotal:125000,confirmText:'AKTIFKAN'});
  assert.equal(r.status,400);assert.equal(f.meta.objects.get(stored.remote.campaignId).status,'PAUSED');assert.equal((await f.all())[0].state,'paused');assert.equal(r.text.includes(cfg.accessToken),false);
});
test('token tidak masuk URL dan pesan error disaring',async()=>{
  const c=new MetaAdsClient(cfg,async()=>({ok:false,json:async()=>({error:{code:190,message:`expired ${cfg.accessToken}`}})}));
  await assert.rejects(c.check(),err=>!err.message.includes(cfg.accessToken)&&err.message.includes('[rahasia]'));
});
test('jeda tidak boleh dinyatakan berhasil jika respons Meta tidak mengonfirmasi success',async()=>{
  const c=new MetaAdsClient(cfg,async()=>({ok:true,json:async()=>({success:false})}));
  await assert.rejects(c.pause({remote:{campaignId:'1001'}}),/belum mengonfirmasi/);
});
