import {randomBytes} from 'node:crypto';
import {googleConfig,googleStatus,GoogleAdsClient,validateGoogleAd,googleFuture} from './google-ads.mjs';
import {hash} from './meta-ads.mjs';
const canonical=v=>Array.isArray(v)?v.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const fingerprint=v=>hash(canonical(v));

export function googleAdsService({save,get,list,mustGet,id,now,settings},options={}){
  const config=options.config||googleConfig(),client=new GoogleAdsClient(config,options.fetchImpl),locks=new Set();
  const clean=d=>{const {approval,...rest}=d;return rest;};
  const persist=d=>save('google_ad',{...d,updatedAt:now()});
  const status=()=>{const cached=get('google_connection','google_connection');return {...googleStatus(config),lastCheck:String(cached?.account?.id)===config.customerId?cached:null};};
  const bound=d=>{client.ready();if(d.customerId!==config.customerId||d.loginCustomerId!==config.loginCustomerId)throw Error('Akun Google Ads berubah. Gunakan akun yang sesuai dengan draf.');};
  const complete=d=>['budget','campaign','adGroup','ad'].every(k=>!!d.remote?.[k]);
  async function lock(key,fn){if(locks.has(key))throw Error('Operasi Google Ads ini masih berlangsung.');locks.add(key);try{return await fn();}finally{locks.delete(key);}}
  async function check(){const account=await client.check();save('google_connection',{id:'google_connection',account,checkedAt:now()});return account;}
  function usable(d){const c=mustGet(d.campaignId,'campaign');if(c.archived||!settings().contactVerified)throw Error('Kampanye atau identitas usaha belum aktif.');googleFuture(d);}
  return {
    status,list:()=>list('google_ad').map(clean),export:()=>list('google_ad').map(clean),
    async handle(path,req,res,{body,send}){
      if(path==='/api/google/status'&&req.method==='GET'){send(res,200,status());return true;}
      if(path==='/api/google/check'&&req.method==='POST'){send(res,200,await check());return true;}
      if(path==='/api/google/locations'&&req.method==='GET'){send(res,200,await client.locations(new URL(req.url,'http://localhost').searchParams.get('q')||''));return true;}
      if(path==='/api/google/ads'&&req.method==='POST'){
        const fields=validateGoogleAd(await body(req));const c=mustGet(fields.campaignId,'campaign');
        if(c.archived||!settings().contactVerified)throw Error('Verifikasi usaha dan pilih kampanye yang aktif.');
        send(res,201,clean(persist({id:id('gads'),...fields,state:'draft',remote:{},createdAt:now()})));return true;
      }
      const m=/^\/api\/google\/ads\/([a-z0-9_]+)(?:\/(submit|review|activate|pause|sync))?$/.exec(path);if(!m)return false;
      const [,key,action]=m;
      if(!action&&req.method==='PATCH'){
        await lock(key,async()=>{const d=mustGet(key,'google_ad');if(d.state!=='draft')throw Error('Draf yang sudah dikirim ke Google tidak dapat diedit di sini.');const f=validateGoogleAd({...d,...await body(req)});const c=mustGet(f.campaignId,'campaign');if(c.archived)throw Error('Kampanye sudah diarsipkan.');send(res,200,clean(persist({...d,...f})));});return true;
      }
      if(!action||req.method!=='POST')return false;
      await lock(key,async()=>{
        let d=mustGet(key,'google_ad');
        if(action==='submit'){
          if(d.state!=='draft')throw Error('Draf sudah dikirim atau perlu diperiksa. Tidak dikirim ulang agar tidak duplikat.');
          if((await body(req)).confirmed!==true)throw Error('Konfirmasikan pengiriman dalam status jeda.');
          usable(d);await check();const locations=await client.resolveLocations(d.locations);
          d={...d,locations};await client.validate(d);
          d=persist({...d,state:'submitting',customerId:config.customerId,loginCustomerId:config.loginCustomerId,error:null});
          try{const remote=await client.createPaused(d);d=persist({...d,remote});const snapshot=await client.snapshot(d);client.assertSnapshot(d,snapshot);d=persist({...d,state:'paused',snapshot});}
          catch(err){persist({...d,state:'needs_review',error:err.message});throw err;}
          send(res,200,clean(d));return;
        }
        bound(d);if(!complete(d))throw Error('Identitas Google belum lengkap. Periksa kampanye dengan kode draf di Google Ads sebelum membuat ulang.');
        if(action==='review'){
          if(!['paused','needs_review'].includes(d.state))throw Error('Jeda kampanye Google sebelum pemeriksaan aktivasi.');
          usable(d);const account=await check(),snapshot=await client.snapshot(d);client.assertSnapshot(d,snapshot);
          const approvalToken=randomBytes(24).toString('hex');d=persist({...d,state:'paused',snapshot,error:null,approval:{tokenHash:hash(approvalToken),snapshotHash:fingerprint(snapshot),expires:Date.now()+5*60000}});
          send(res,200,{ad:clean(d),account,approvalToken,expires:d.approval.expires});return;
        }
        if(action==='activate'){
          const b=await body(req);if(d.state!=='paused'||!d.approval||d.approval.expires<Date.now()||hash(String(b.approvalToken||''))!==d.approval.tokenHash||b.confirmed!==true||b.confirmText!=='AKTIFKAN'||Number(b.budgetTotal)!==d.budgetTotal)throw Error('Persetujuan aktivasi Google tidak cocok atau kedaluwarsa. Tinjau kembali.');
          usable(d);await check();const snapshot=await client.snapshot(d);client.assertSnapshot(d,snapshot);if(fingerprint(snapshot)!==d.approval.snapshotHash)throw Error('Snapshot Google berubah sejak pemeriksaan akhir.');
          if(d.approval.expires<Date.now())throw Error('Persetujuan kedaluwarsa selama pemeriksaan Google. Tinjau kembali.');
          usable(d);
          d=persist({...d,state:'activating',approval:null});
          try{await client.changeStatus(d,'ENABLED');d=persist({...d,state:'activation_requested',snapshot:null,activatedAt:now(),error:null});}
          catch(err){let paused=false;try{await client.changeStatus(d,'PAUSED');paused=true;}catch{}d=persist({...d,state:paused&&!err.uncertain?'paused':'needs_review',error:`${err.message} ${paused?'Permintaan jeda dikonfirmasi Google.':'Jeda belum terkonfirmasi.'} Periksa status nyata di Google Ads.`});throw Error(d.error);}
          send(res,200,clean(d));return;
        }
        if(action==='pause'){
          try{await client.changeStatus(d,'PAUSED');d=persist({...d,state:'paused',snapshot:d.snapshot?{...d.snapshot,campaign:{...d.snapshot.campaign,status:'PAUSED'}}:null,approval:null,error:null});}
          catch(err){persist({...d,state:'needs_review',error:`Jeda belum terkonfirmasi. ${err.message}`});throw err;}
          send(res,200,clean(d));return;
        }
        if(action==='sync'){
          const result=await client.sync(d);const state=result.snapshot.campaign?.status==='PAUSED'?'paused':result.snapshot.campaign?.status==='ENABLED'?'activation_requested':'needs_review';
          d=persist({...d,...result,state,syncedAt:now(),approval:null});send(res,200,clean(d));return;
        }
      });return true;
    }
  };
}
