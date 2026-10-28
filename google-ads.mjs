import {required,money,safeWebsite} from './domain.mjs';

export const GOOGLE_SCOPE='https://www.googleapis.com/auth/adwords';
export function googleConfig(env=process.env){return {customerId:(env.GOOGLE_ADS_CUSTOMER_ID||'').replace(/[\s-]/g,''),loginCustomerId:(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID||'').replace(/[\s-]/g,''),clientId:env.GOOGLE_ADS_CLIENT_ID||'',clientSecret:env.GOOGLE_ADS_CLIENT_SECRET||'',refreshToken:env.GOOGLE_ADS_REFRESH_TOKEN||'',version:env.GOOGLE_ADS_API_VERSION||'v26'};}
export function googleStatus(c){return {configured:['customerId','clientId','clientSecret','refreshToken'].every(k=>!!c[k]),customerId:c.customerId,loginCustomerId:c.loginCustomerId,version:c.version};}
export const micros=n=>(BigInt(n)*1000000n).toString();
export const googleTime=(t,end=false)=>t.replace('T',' ')+(end?':59':':00');
const count=s=>[...s].length;
function texts(v,label,min,max,length){
  const rows=(Array.isArray(v)?v:String(v||'').split('\n')).map(s=>String(s).trim().replace(/\s+/g,' ')).filter(Boolean);
  if(rows.length<min||rows.length>max||rows.some(s=>count(s)>length)||new Set(rows.map(s=>s.toLocaleLowerCase())).size!==rows.length)throw Error(`${label}: ${min}–${max} baris unik, maksimal ${length} karakter per baris.`);
  return rows;
}
export function validateGoogleAd(b){
  const headlines=texts(b.headlines,'Judul',3,15,30),descriptions=texts(b.descriptions,'Deskripsi',2,4,90);
  const keywords=texts(b.keywords,'Kata kunci',1,30,80);if(keywords.some(k=>k.split(' ').length>10))throw Error('Kata kunci maksimal 10 kata per baris.');
  if(!['PHRASE','EXACT'].includes(b.matchType))throw Error('Pilih pencocokan frasa atau tepat.');
  const startTime=required(b.startTime,'Waktu mulai',16),endTime=required(b.endTime,'Waktu selesai',16);
  for(const t of [startTime,endTime])if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(t)||Number.isNaN(Date.parse(`${t}:00+07:00`))||new Date(Date.parse(`${t}:00+07:00`)+7*3600000).toISOString().slice(0,16)!==t)throw Error('Jadwal tidak valid. Gunakan tanggal dan jam WIB.');
  if(!startTime.endsWith('T00:00')||!endTime.endsWith('T23:59'))throw Error('Jadwal Google memakai tanggal harian: mulai 00:00 dan selesai akhir hari WIB.');
  const days=(Date.parse(`${endTime.slice(0,10)}T00:00:00+07:00`)-Date.parse(`${startTime}:00+07:00`))/86400000+1;if(days<3||days>90)throw Error('Periode kampanye total dibatasi 3–90 hari pada versi ini.');
  const budgetTotal=money(b.budgetTotal,'Total anggaran'),maxCpc=money(b.maxCpc,'Bid CPC');
  if(!budgetTotal||budgetTotal>1000000000||!maxCpc||maxCpc>budgetTotal)throw Error('Anggaran Rp1–Rp1 miliar; bid CPC harus positif dan tidak melebihi total.');
  const website=safeWebsite(b.website),u=new URL(website);
  if(u.protocol!=='https:'||!u.hostname.includes('.')||u.hostname.includes(':')||/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)||u.hostname.endsWith('.local')||u.hostname==='wa.me'||u.hostname.endsWith('.whatsapp.com'))throw Error('Gunakan website HTTPS publik. Format ini untuk kunjungan website.');
  const locations=Array.isArray(b.locations)?b.locations:[];
  if(locations.length>10||locations.some(l=>!/^geoTargetConstants\/\d+$/.test(l.resourceName)||typeof l.name!=='string'))throw Error('Pilih maksimal 10 lokasi valid dari Google.');
  return {campaignId:required(b.campaignId,'Kampanye',60),name:required(b.name,'Nama iklan',100),website,headlines,descriptions,keywords,matchType:b.matchType,startTime,endTime,budgetTotal,maxCpc,locations:locations.map(l=>({resourceName:l.resourceName,name:l.name.slice(0,150)}))};
}
export function googleFuture(d){if(Date.parse(`${d.startTime}:00+07:00`)<Date.now()+5*60000)throw Error('Mulai kampanye harus minimal lima menit dari sekarang. Buat draf jadwal baru bila sudah terlewat.');}
const esc=s=>String(s).replaceAll('\\','\\\\').replaceAll("'","\\'");
export class GoogleAdsClient{
  constructor(config,fetchImpl=fetch){this.config=config;this.fetch=fetchImpl;this.token=null;this.pendingToken=null;}
  ready(){const c=this.config;if(!googleStatus(c).configured)throw Error('Koneksi Google belum diisi. Jalankan npm run google:setup.');if(!/^\d{10}$/.test(c.customerId)||(c.loginCustomerId&&!/^\d{10}$/.test(c.loginCustomerId))||!/^v\d{2}$/.test(c.version))throw Error('Customer ID Google harus 10 angka dan versi API valid.');}
  safeError(value){const details=(value.error?.details||[]).flatMap(d=>(d.errors||[]).map(x=>x.message)).filter(Boolean).slice(0,3);let s=[String(value.error?.message||value.error_description||value.error||'Respons ditolak.'),...details].join(' ');for(const secret of [this.config.clientSecret,this.config.refreshToken,this.token?.value].filter(Boolean))s=s.replaceAll(secret,'[rahasia]');return s.slice(0,700);}
  async accessToken(){
    this.ready();if(this.token&&this.token.expires>Date.now()+60000)return this.token.value;
    if(this.pendingToken)return this.pendingToken;
    this.pendingToken=(async()=>{
      let r;try{r=await this.fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:this.config.clientId,client_secret:this.config.clientSecret,refresh_token:this.config.refreshToken}).toString(),signal:AbortSignal.timeout(25000),redirect:'error'});}catch{throw Error('Koneksi otorisasi Google gagal.');}
      let v;try{v=await r.json();}catch{throw Error('Respons otorisasi Google tidak terbaca.');}
      if(!r.ok||!v.access_token)throw Error(`Google OAuth: ${this.safeError(v)}`);
      this.token={value:v.access_token,expires:Date.now()+Math.min(Number(v.expires_in)||3600,3600)*1000};return this.token.value;
    })();try{return await this.pendingToken;}finally{this.pendingToken=null;}
  }
  async api(path,payload){
    const accessToken=await this.accessToken();let response;
    try{response=await this.fetch(`https://googleads.googleapis.com/${this.config.version}/${path}`,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json',...(this.config.loginCustomerId?{'login-customer-id':this.config.loginCustomerId}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000),redirect:'error'});}catch{const err=Error('Koneksi Google Ads terputus. Periksa Google Ads sebelum mengirim ulang.');err.uncertain=path.endsWith('googleAds:mutate')&&!payload.validateOnly;throw err;}
    let value;try{value=await response.json();}catch{const err=Error('Respons Google Ads tidak terbaca.');err.uncertain=path.endsWith('googleAds:mutate')&&!payload.validateOnly;throw err;}
    if(!response.ok||value.error||value.partialFailureError){const err=Error(`Google Ads: ${this.safeError(value.partialFailureError?{error:value.partialFailureError}:value)}`);err.uncertain=!!value.partialFailureError;throw err;}
    return value;
  }
  customerPath(suffix){return `customers/${this.config.customerId}/${suffix}`;}
  async search(query){let rows=[],pageToken;for(let page=0;page<20;page++){const r=await this.api(this.customerPath('googleAds:search'),{query,...(pageToken?{pageToken}:{})});rows.push(...(r.results||[]));if(!r.nextPageToken)return rows;pageToken=r.nextPageToken;}throw Error('Hasil Google terlalu banyak untuk pemeriksaan aman.');}
  async check(){const rows=await this.search('SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.status, customer.manager, customer.test_account FROM customer LIMIT 1');const c=rows[0]?.customer;if(!c||String(c.id)!==this.config.customerId)throw Error('Akun Google Ads tidak sesuai Customer ID.');if(c.currencyCode!=='IDR')throw Error('Versi ini hanya mendukung mata uang IDR.');if(c.timeZone!=='Asia/Jakarta')throw Error('Versi ini membutuhkan zona waktu akun Asia/Jakarta (WIB).');if(c.manager||c.status!=='ENABLED')throw Error('Pilih akun pengiklan aktif, bukan akun manager.');return c;}
  async locations(q){if(q.trim().length<2)throw Error('Masukkan minimal dua huruf lokasi.');const r=await this.api('geoTargetConstants:suggest',{locale:'id',countryCode:'ID',locationNames:{names:[q.slice(0,80)]}});return (r.geoTargetConstantSuggestions||[]).map(x=>x.geoTargetConstant).filter(x=>x?.countryCode==='ID'&&x.status==='ENABLED').map(x=>({resourceName:x.resourceName,name:x.canonicalName||x.name}));}
  async resolveLocations(locations){
    const clause=locations.length?`geo_target_constant.resource_name IN (${locations.map(l=>`'${esc(l.resourceName)}'`).join(',')})`:"geo_target_constant.country_code = 'ID' AND geo_target_constant.target_type = 'Country'";
    const rows=await this.search(`SELECT geo_target_constant.resource_name, geo_target_constant.name, geo_target_constant.canonical_name, geo_target_constant.country_code, geo_target_constant.status FROM geo_target_constant WHERE ${clause}`);
    const found=rows.map(x=>x.geoTargetConstant).filter(x=>x.countryCode==='ID'&&x.status==='ENABLED');
    if(found.length!==(locations.length||1))throw Error('Lokasi Indonesia belum dapat diverifikasi.');return found.map(x=>({resourceName:x.resourceName,name:x.canonicalName||x.name}));
  }
  operations(d){
    const root=`customers/${this.config.customerId}`,budget=`${root}/campaignBudgets/-1`,campaign=`${root}/campaigns/-2`,group=`${root}/adGroups/-3`;
    return [
      {campaignBudgetOperation:{create:{resourceName:budget,name:`RGH ${d.id}`,period:'CUSTOM_PERIOD',totalAmountMicros:micros(d.budgetTotal),deliveryMethod:'STANDARD',explicitlyShared:false}}},
      {campaignOperation:{create:{resourceName:campaign,name:`${d.name} [${d.id}]`,status:'PAUSED',advertisingChannelType:'SEARCH',campaignBudget:budget,manualCpc:{},startDateTime:googleTime(d.startTime),endDateTime:googleTime(d.endTime,true),networkSettings:{targetGoogleSearch:true,targetSearchNetwork:false,targetContentNetwork:false,targetPartnerSearchNetwork:false},geoTargetTypeSetting:{positiveGeoTargetType:'PRESENCE',negativeGeoTargetType:'PRESENCE'},containsEuPoliticalAdvertising:'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING'}}},
      ...d.locations.map(l=>({campaignCriterionOperation:{create:{campaign,location:{geoTargetConstant:l.resourceName},negative:false}}})),
      {adGroupOperation:{create:{resourceName:group,campaign,name:`RGH ${d.id}`,status:'PAUSED',type:'SEARCH_STANDARD',cpcBidMicros:micros(d.maxCpc)}}},
      ...d.keywords.map(text=>({adGroupCriterionOperation:{create:{adGroup:group,status:'ENABLED',keyword:{text,matchType:d.matchType}}}})),
      {adGroupAdOperation:{create:{adGroup:group,status:'PAUSED',ad:{finalUrls:[d.website],responsiveSearchAd:{headlines:d.headlines.map(text=>({text})),descriptions:d.descriptions.map(text=>({text}))}}}}}
    ];
  }
  async mutate(operations,validateOnly=false){return this.api(this.customerPath('googleAds:mutate'),{mutateOperations:operations,partialFailure:false,validateOnly,responseContentType:'RESOURCE_NAME_ONLY'});}
  async validate(d){await this.mutate(this.operations(d),true);}
  resource(value,type){const pattern=type==='adGroupAds'?'\\d+~\\d+':'\\d+';if(typeof value!=='string'||!new RegExp(`^customers/${this.config.customerId}/${type}/${pattern}$`).test(value))throw Error('Google tidak mengembalikan identitas objek yang sesuai.');return value;}
  async createPaused(d){
    const result=await this.mutate(this.operations(d));const rows=result.mutateOperationResponses||[];
    const find=key=>rows.find(x=>x[key])?.[key]?.resourceName;
    return {budget:this.resource(find('campaignBudgetResult'),'campaignBudgets'),campaign:this.resource(find('campaignResult'),'campaigns'),adGroup:this.resource(find('adGroupResult'),'adGroups'),ad:this.resource(find('adGroupAdResult'),'adGroupAds')};
  }
  async snapshot(d){
    const r=d.remote;for(const [k,t] of Object.entries({budget:'campaignBudgets',campaign:'campaigns',adGroup:'adGroups',ad:'adGroupAds'}))this.resource(r[k],t);
    const campaignRows=await this.search(`SELECT campaign.resource_name, campaign.status, campaign.advertising_channel_type, campaign.campaign_budget, campaign.start_date_time, campaign.end_date_time, campaign.bidding_strategy_type, campaign.network_settings.target_google_search, campaign.network_settings.target_search_network, campaign.network_settings.target_content_network, campaign.network_settings.target_partner_search_network, campaign.geo_target_type_setting.positive_geo_target_type FROM campaign WHERE campaign.resource_name = '${r.campaign}'`);
    const budgetRows=await this.search(`SELECT campaign_budget.resource_name, campaign_budget.total_amount_micros, campaign_budget.amount_micros, campaign_budget.period, campaign_budget.explicitly_shared, campaign_budget.delivery_method FROM campaign_budget WHERE campaign_budget.resource_name = '${r.budget}'`);
    const groups=await this.search(`SELECT ad_group.resource_name, ad_group.campaign, ad_group.status, ad_group.type, ad_group.cpc_bid_micros FROM ad_group WHERE ad_group.campaign = '${r.campaign}' AND ad_group.status != 'REMOVED'`);
    const ads=await this.search(`SELECT ad_group_ad.resource_name, ad_group_ad.ad_group, ad_group_ad.status, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.policy_summary.approval_status FROM ad_group_ad WHERE ad_group_ad.ad_group = '${r.adGroup}' AND ad_group_ad.status != 'REMOVED'`);
    const keywords=await this.search(`SELECT ad_group_criterion.type, ad_group_criterion.status, ad_group_criterion.negative, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.cpc_bid_micros FROM ad_group_criterion WHERE ad_group_criterion.ad_group = '${r.adGroup}' AND ad_group_criterion.status != 'REMOVED'`);
    const locations=await this.search(`SELECT campaign_criterion.type, campaign_criterion.status, campaign_criterion.negative, campaign_criterion.bid_modifier, campaign_criterion.location.geo_target_constant FROM campaign_criterion WHERE campaign_criterion.campaign = '${r.campaign}' AND campaign_criterion.status != 'REMOVED'`);
    return {campaign:campaignRows[0]?.campaign,budget:budgetRows[0]?.campaignBudget,groups:groups.map(x=>x.adGroup),ads:ads.map(x=>x.adGroupAd),keywords:keywords.map(x=>x.adGroupCriterion),locations:locations.map(x=>x.campaignCriterion)};
  }
  assertSnapshot(d,s){
    const c=s.campaign,b=s.budget,g=s.groups[0],a=s.ads[0],equal=(x,y)=>String(x)===String(y),sort=v=>JSON.stringify([...v].sort());
    if(!c||!b||s.groups.length!==1||s.ads.length!==1||c.resourceName!==d.remote.campaign||c.status!=='PAUSED'||c.advertisingChannelType!=='SEARCH'||c.campaignBudget!==d.remote.budget||c.biddingStrategyType!=='MANUAL_CPC')throw Error('Kampanye Google berubah atau belum dijeda.');
    if(b.resourceName!==d.remote.budget||b.period!=='CUSTOM_PERIOD'||!equal(b.totalAmountMicros,micros(d.budgetTotal))||Number(b.amountMicros||0)!==0||b.explicitlyShared||b.deliveryMethod!=='STANDARD')throw Error('Total anggaran Google berbeda atau berubah menjadi anggaran harian.');
    const n=c.networkSettings||{};if(!n.targetGoogleSearch||n.targetSearchNetwork||n.targetContentNetwork||n.targetPartnerSearchNetwork||c.geoTargetTypeSetting?.positiveGeoTargetType!=='PRESENCE'||c.startDateTime!==googleTime(d.startTime)||c.endDateTime!==googleTime(d.endTime,true))throw Error('Jaringan, lokasi, atau jadwal Google berubah.');
    if(g.resourceName!==d.remote.adGroup||g.campaign!==d.remote.campaign||g.type!=='SEARCH_STANDARD'||!equal(g.cpcBidMicros,micros(d.maxCpc))||a.resourceName!==d.remote.ad||a.adGroup!==d.remote.adGroup)throw Error('Grup, identitas iklan, atau bid Google berubah.');
    const rsa=a.ad?.responsiveSearchAd;
    if(sort(a.ad?.finalUrls||[])!==sort([d.website])||sort(rsa?.headlines?.map(x=>x.text)||[])!==sort(d.headlines)||sort(rsa?.descriptions?.map(x=>x.text)||[])!==sort(d.descriptions))throw Error('Judul, deskripsi, atau tujuan Google berubah.');
    if(s.keywords.some(k=>k.type!=='KEYWORD'||k.negative||k.status!=='ENABLED'||Number(k.cpcBidMicros||0)>0)||sort(s.keywords.map(k=>`${k.keyword?.text?.toLowerCase()}|${k.keyword?.matchType}`))!==sort(d.keywords.map(k=>`${k.toLowerCase()}|${d.matchType}`)))throw Error('Kata kunci atau bid khusus kata kunci berubah.');
    if(s.locations.some(l=>l.type!=='LOCATION'||l.negative||l.status!=='ENABLED'||(Number(l.bidModifier||0)!==0&&Number(l.bidModifier)!==1))||sort(s.locations.map(l=>l.location?.geoTargetConstant))!==sort(d.locations.map(l=>l.resourceName)))throw Error('Lokasi atau kriteria Google berubah.');
  }
  async changeStatus(d,status){
    const ops=status==='ENABLED'?[{adGroupOperation:{update:{resourceName:d.remote.adGroup,status},updateMask:'status'}},{adGroupAdOperation:{update:{resourceName:d.remote.ad,status},updateMask:'status'}},{campaignOperation:{update:{resourceName:d.remote.campaign,status},updateMask:'status'}}]:[{campaignOperation:{update:{resourceName:d.remote.campaign,status},updateMask:'status'}}];
    const r=await this.mutate(ops);const resources=(r.mutateOperationResponses||[]).flatMap(x=>Object.values(x).map(y=>y.resourceName));
    if(resources.length!==ops.length||!ops.every(op=>resources.includes(Object.values(op)[0].update.resourceName))){const err=Error('Google belum mengonfirmasi seluruh perubahan status.');err.uncertain=true;throw err;}return r;
  }
  async sync(d){const snapshot=await this.snapshot(d);const rows=await this.search(`SELECT metrics.cost_micros, metrics.clicks, metrics.impressions FROM campaign WHERE campaign.resource_name = '${d.remote.campaign}'`);return {snapshot,insights:rows[0]?.metrics||{costMicros:'0',clicks:'0',impressions:'0'}};}
}
