import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {createApp} from '../server.mjs';
import {DEFAULT_SETTINGS} from '../domain.mjs';
import {validateGoogleAd,micros,GoogleAdsClient} from '../google-ads.mjs';
import {authorizeGoogleLoopback,googleAuthorizationUrl} from '../google-oauth.mjs';
import {fakeGoogle,googleCfg} from './fake-google.mjs';
const tLocal=ms=>new Date(ms+7*3600000).toISOString().slice(0,16);
const draft=()=>({campaignId:'cmp_test',name:'Google keluarga',website:'https://rentalmobilyogya.id/',headlines:['Rental Mobil Jogja','Razzaq Transport','Cek Pilihan Mobil'],descriptions:['Cek pilihan dan ketersediaan mobil melalui website.','Tanyakan harga dan rincian paket kepada admin.'],keywords:['rental mobil jogja','sewa mobil jogja'],matchType:'PHRASE',budgetTotal:250000,maxCpc:5000,startTime:tLocal(Date.now()+2*86400000).slice(0,10)+'T00:00',endTime:tLocal(Date.now()+9*86400000).slice(0,10)+'T23:59',locations:[]});
async function fixture(t,{configured=true}={}){
  const dir=mkdtempSync(join(tmpdir(),'google-test-')),mock=fakeGoogle();
  const server=createApp({dataDir:dir,password:'google-test-password',google:{config:configured?googleCfg:{...googleCfg,refreshToken:''},fetchImpl:mock.fetchImpl}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;let cookie='';
  const req=async(path,method='GET',payload,headers={})=>{const r=await fetch(base+'/api/'+path,{method,headers:{'Content-Type':'application/json','X-Growth-Request':'1',Cookie:cookie,...headers},...(payload?{body:JSON.stringify(payload)}:{})});const text=await r.text();let json;try{json=JSON.parse(text);}catch{}return {status:r.status,json,text,r};};
  t.after(async()=>{await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});});
  const login=await req('login','POST',{password:'google-test-password'});cookie=login.r.headers.get('set-cookie').split(';')[0];await req('settings','PUT',{...DEFAULT_SETTINGS,contactVerified:true});
  const campaign=(await req('campaigns','POST',{name:'Promosi Google',offer:'Cek paket dengan admin',audience:'Wisatawan',start:'2026-11-01',end:'2026-11-07',budget:0,channels:['Facebook'],target:'website'})).json;
  return {req,mock,create:async(extra={})=>req('google/ads','POST',{...draft(),campaignId:campaign.id,...extra}),all:async()=>(await req('data')).json.googleAds};
}
test('Google: validasi asset, jadwal WIB, keyword dan konversi rupiah ke micros tepat',()=>{
  assert.equal(micros(999999999),'999999999000000');assert.equal(validateGoogleAd(draft()).budgetTotal,250000);
  for(const change of [{headlines:['Hanya satu']},{headlines:['sama','SAMA','lain']},{descriptions:['satu']},{budgetTotal:0},{maxCpc:300000},{matchType:'BROAD'},{website:'https://127.0.0.1/'},{endTime:draft().startTime},{startTime:'2026-02-30T10:00'}])assert.throws(()=>validateGoogleAd({...draft(),...change}));
});
test('Google: tanpa kredensial draf lokal bekerja dan tidak ada panggilan eksternal',async t=>{
  const f=await fixture(t,{configured:false}),d=(await f.create()).json;
  assert.equal((await f.req(`google/ads/${d.id}/submit`,'POST',{confirmed:true})).status,400);assert.equal(f.mock.calls.length,0);assert.equal((await f.all())[0].state,'draft');
  assert.equal((await f.req('google/status','GET',undefined,{Cookie:''})).status,401);
});
test('Google: create atomic paused, validasi dulu, review budget, aktivasi, metrik, jeda',async t=>{
  const f=await fixture(t);assert.equal((await f.req('google/check','POST',{})).status,200);assert.equal((await f.req('google/locations?q=Yogya')).json.length,1);
  const d=(await f.create()).json;assert.equal((await f.req(`google/ads/${d.id}`,'PATCH',{name:'Nama diperiksa'})).status,200);
  assert.equal((await f.req(`google/ads/${d.id}/submit`,'POST',{confirmed:true})).status,200);
  const stored=(await f.all())[0];assert.equal(stored.state,'paused');assert.equal(stored.locations[0].name,'Indonesia');
  const mutates=f.mock.calls.filter(x=>x.url.endsWith('googleAds:mutate'));assert.equal(mutates.length,2);assert.equal(mutates[0].body.validateOnly,true);assert.equal(mutates[1].body.validateOnly,false);
  const ops=mutates[1].body.mutateOperations;assert.equal(ops[0].campaignBudgetOperation.create.period,'CUSTOM_PERIOD');assert.equal(ops[0].campaignBudgetOperation.create.totalAmountMicros,'250000000000');assert.equal(ops[0].campaignBudgetOperation.create.amountMicros,undefined);assert.equal(ops[1].campaignOperation.create.status,'PAUSED');assert.equal(ops[1].campaignOperation.create.networkSettings.targetContentNetwork,false);
  assert.equal((await f.req(`google/ads/${d.id}/submit`,'POST',{confirmed:true})).status,400);assert.equal((await f.req(`google/ads/${d.id}`,'PATCH',{budgetTotal:1})).status,400);
  const review=(await f.req(`google/ads/${d.id}/review`,'POST',{})).json;assert.ok(review.approvalToken);
  const approval={approvalToken:review.approvalToken,budgetTotal:250000,confirmed:true,confirmText:'AKTIFKAN'};
  assert.equal((await f.req(`google/ads/${d.id}/activate`,'POST',{...approval,budgetTotal:2500})).status,400);
  assert.equal((await f.req(`google/ads/${d.id}/activate`,'POST',{...approval,confirmed:false})).status,400);
  f.mock.state.reverse=true;
  assert.equal((await f.req(`google/ads/${d.id}/activate`,'POST',approval)).status,200);
  assert.equal(f.mock.records.get(stored.remote.campaign).row.status,'ENABLED');assert.equal((await f.req(`google/ads/${d.id}/activate`,'POST',approval)).status,400);
  const synced=(await f.req(`google/ads/${d.id}/sync`,'POST',{})).json;assert.equal(synced.insights.costMicros,'12500000000');assert.equal(synced.snapshot.ads[0].policySummary.approvalStatus,'UNDER_REVIEW');
  assert.equal((await f.req(`google/ads/${d.id}/pause`,'POST',{})).json.state,'paused');
  const output=(await f.req('data')).text;for(const value of [googleCfg.clientSecret,googleCfg.refreshToken,'google-access-dummy',review.approvalToken])assert.equal(output.includes(value),false);
  const backup=(await f.req('export/backup.json')).json;assert.equal(backup.version,3);assert.equal(backup.googleAds.length,1);assert.equal('approval' in backup.googleAds[0],false);
  assert.equal(f.mock.state.tokenCalls,1);
});
test('Google: perubahan budget, keyword, dan isi iklan menolak aktivasi',async t=>{
  const f=await fixture(t),d=(await f.create()).json;await f.req(`google/ads/${d.id}/submit`,'POST',{confirmed:true});const saved=(await f.all())[0],review=(await f.req(`google/ads/${d.id}/review`,'POST',{})).json;
  const budget=f.mock.records.get(saved.remote.budget).row;budget.period='DAILY';budget.amountMicros='1000000000';
  assert.equal((await f.req(`google/ads/${d.id}/activate`,'POST',{approvalToken:review.approvalToken,budgetTotal:250000,confirmed:true,confirmText:'AKTIFKAN'})).status,400);assert.equal(f.mock.records.get(saved.remote.campaign).row.status,'PAUSED');
  budget.period='CUSTOM_PERIOD';delete budget.amountMicros;const ad=f.mock.records.get(saved.remote.ad).row;ad.ad.finalUrls=['https://other.example/'];
  assert.equal((await f.req(`google/ads/${d.id}/review`,'POST',{})).status,400);
  ad.ad.finalUrls=[draft().website];
  [...f.mock.records.values()].find(x=>x.kind==='adGroupCriterion').row.keyword.matchType='BROAD';
  assert.equal((await f.req(`google/ads/${d.id}/review`,'POST',{})).status,400);
});
test('Google: duplicate submit, validation failure, dan status tidak pasti tidak diulang',async t=>{
  const f=await fixture(t),d=(await f.create()).json;
  const results=await Promise.all([f.req(`google/ads/${d.id}/submit`,'POST',{confirmed:true}),f.req(`google/ads/${d.id}/submit`,'POST',{confirmed:true})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
  const second=(await f.create()).json;f.mock.state.fail=(u,b)=>u.pathname.endsWith('googleAds:mutate')&&b.validateOnly;
  const count=f.mock.records.size;assert.equal((await f.req(`google/ads/${second.id}/submit`,'POST',{confirmed:true})).status,400);assert.equal(f.mock.records.size,count);assert.equal((await f.all()).find(x=>x.id===second.id).state,'draft');
  f.mock.state.fail=null;f.mock.state.throwAfterMutation=b=>b.mutateOperations.some(op=>op.campaignOperation?.create);
  assert.equal((await f.req(`google/ads/${second.id}/submit`,'POST',{confirmed:true})).status,400);const after=f.mock.records.size;
  assert.equal((await f.req(`google/ads/${second.id}/submit`,'POST',{confirmed:true})).status,400);assert.equal(f.mock.records.size,after);assert.equal((await f.all()).find(x=>x.id===second.id).state,'needs_review');
});
test('Google: IDR/WIB diperiksa sebelum mutasi, timeout aktivasi memicu jeda dan needs_review',async t=>{
  const f=await fixture(t),d=(await f.create()).json;f.mock.state.currency='USD';assert.equal((await f.req(`google/ads/${d.id}/submit`,'POST',{confirmed:true})).status,400);
  f.mock.state.currency='IDR';f.mock.state.zone='Asia/Makassar';assert.equal((await f.req(`google/ads/${d.id}/submit`,'POST',{confirmed:true})).status,400);assert.equal(f.mock.records.size,0);
  f.mock.state.zone='Asia/Jakarta';await f.req(`google/ads/${d.id}/submit`,'POST',{confirmed:true});const stored=(await f.all())[0],review=(await f.req(`google/ads/${d.id}/review`,'POST',{})).json;
  f.mock.state.throwAfterMutation=b=>b.mutateOperations.some(op=>op.campaignOperation?.update?.status==='ENABLED');
  assert.equal((await f.req(`google/ads/${d.id}/activate`,'POST',{approvalToken:review.approvalToken,budgetTotal:250000,confirmed:true,confirmText:'AKTIFKAN'})).status,400);assert.equal(f.mock.records.get(stored.remote.campaign).row.status,'PAUSED');assert.equal((await f.all())[0].state,'needs_review');
});
test('Google: error disaring, token tidak masuk URL, refresh paralel hanya sekali',async()=>{
  const mock=fakeGoogle(),client=new GoogleAdsClient(googleCfg,mock.fetchImpl);await Promise.all([client.check(),client.check()]);assert.equal(mock.state.tokenCalls,1);mock.state.fail=()=>true;
  await assert.rejects(client.check(),err=>![googleCfg.clientSecret,googleCfg.refreshToken,'google-access-dummy'].some(s=>err.message.includes(s)));
  const message=client.safeError({error:{message:'Invalid argument',details:[{errors:[{message:`Rincian ${googleCfg.refreshToken}`}]}]}});assert.match(message,/Rincian/);assert.equal(message.includes(googleCfg.refreshToken),false);
});
test('Google: respons status tanpa resource confirmation harus dianggap tidak pasti',async()=>{
  const client=new GoogleAdsClient(googleCfg,async()=>({ok:true,json:async()=>({mutateOperationResponses:[]})}));client.token={value:'dummy-access',expires:Date.now()+3600000};
  await assert.rejects(client.changeStatus({remote:{campaign:'customers/1234567890/campaigns/123'}},'PAUSED'),err=>err.uncertain===true);
});
test('Google OAuth: loopback PKCE memeriksa state dan menyembunyikan kode dalam respons',async()=>{
  let capture;const urlReady=new Promise(resolve=>capture=resolve);let exchange;
  const promise=authorizeGoogleLoopback({clientId:googleCfg.clientId,clientSecret:googleCfg.clientSecret,onUrl:url=>capture(new URL(url)),fetchImpl:async(url,options)=>{assert.equal(url,'https://oauth2.googleapis.com/token');exchange=Object.fromEntries(new URLSearchParams(options.body));return {ok:true,json:async()=>({refresh_token:'returned-refresh-dummy'})};},timeoutMs:10000});
  const url=await urlReady;assert.equal(url.searchParams.get('scope'),'https://www.googleapis.com/auth/adwords');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  const cb=new URL(url.searchParams.get('redirect_uri'));cb.search=new URLSearchParams({state:'wrong',code:'fake-code'}).toString();assert.equal((await fetch(cb)).status,400);
  cb.search=new URLSearchParams({state:url.searchParams.get('state'),code:'private-auth-code'}).toString();const response=await fetch(cb);assert.equal(response.status,200);assert.equal((await response.text()).includes('private-auth-code'),false);assert.equal(await promise,'returned-refresh-dummy');
  assert.equal(createHash('sha256').update(exchange.code_verifier).digest('base64url'),url.searchParams.get('code_challenge'));assert.equal(exchange.redirect_uri,url.searchParams.get('redirect_uri'));
  const direct=googleAuthorizationUrl({clientId:'id',redirectUri:'http://127.0.0.1:1234/oauth2callback',state:'nonce',verifier:'secret'});assert.equal(new URL(direct).searchParams.get('client_secret'),null);
});
