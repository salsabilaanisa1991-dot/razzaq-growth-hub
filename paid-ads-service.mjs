import { randomBytes } from 'node:crypto';
import { MetaAdsClient, metaConfig, configStatus, validatePaidAd, imageBytes, hash, ensureFuture } from './meta-ads.mjs';

export function paidAdsService({save,get,list,mustGet,id,now,settings}, options = {}) {
  const config=options.config || metaConfig();
  const client=new MetaAdsClient(config,options.fetchImpl);
  const locks=new Set();
  const clean=d=>{const {image,approval,...rest}=d;return {...rest,hasImage:!!image};};
  const status=()=>{
    const cached=get('meta_connection','meta_connection');
    const matches=cached && String(cached.account?.id).replace(/^act_/,'')===config.accountId && String(cached.page?.id)===config.pageId;
    return {...configStatus(config),lastCheck:matches?cached:null};
  };
  const saveAd=d=>save('paid_ad',{...d,updatedAt:now()});
  function bound(d){client.ready();if(d.accountId!==config.accountId || d.pageId!==config.pageId)throw Error('Koneksi akun Meta berubah. Gunakan akun yang sesuai dengan draf ini.');}
  async function locked(key,fn){if(locks.has(key))throw Error('Operasi iklan ini masih berlangsung. Tunggu hasilnya.');locks.add(key);try{return await fn();}finally{locks.delete(key);}}
  const complete=d=>['campaignId','adsetId','creativeId','adId'].every(k=>d.remote?.[k]);
  async function check(){
    const result=await client.check();
    save('meta_connection',{id:'meta_connection',account:result.account,page:result.page,checkedAt:now()});
    return result;
  }
  return {
    status,
    list:()=>list('paid_ad').map(clean),
    export:()=>list('paid_ad').map(d=>{const {approval,...rest}=d;return rest;}),
    async handle(path,req,res,{body,send}) {
      if(path==='/api/meta/status' && req.method==='GET'){send(res,200,status());return true;}
      if(path==='/api/meta/check' && req.method==='POST'){send(res,200,await check());return true;}
      if(path==='/api/meta/locations' && req.method==='GET'){
        send(res,200,await client.locations(new URL(req.url,'http://localhost').searchParams.get('q') || ''));return true;
      }
      if(path==='/api/paid-ads' && req.method==='POST'){
        const b=await body(req,8*1024*1024), fields=validatePaidAd(b);
        const c=mustGet(fields.campaignId,'campaign');
        if(c.archived)throw Error('Pilih kampanye yang belum diarsipkan.');
        if(!settings().contactVerified)throw Error('Verifikasi identitas usaha dahulu.');
        imageBytes(b.image);
        const d=saveAd({id:id('paid'),...fields,image:b.image,state:'draft',remote:{},createdAt:now()});
        send(res,201,clean(d));return true;
      }
      const match=/^\/api\/paid-ads\/([a-z0-9_]+)(?:\/(image|submit|review|activate|pause|sync))?$/.exec(path);
      if(!match)return false;
      const [,key,action]=match;
      if(action==='image' && req.method==='GET'){
        const d=mustGet(key,'paid_ad'),img=imageBytes(d.image);
        send(res,200,img.bytes,{'Content-Type':img.mime});return true;
      }
      if(!action && req.method==='PATCH'){
        await locked(key,async()=>{
          const d=mustGet(key,'paid_ad');if(d.state!=='draft')throw Error('Materi yang sudah dikirim ke Meta tidak dapat diedit dari sini.');
          const b=await body(req,8*1024*1024),f=validatePaidAd({...d,...b});
          const c=mustGet(f.campaignId,'campaign');if(c.archived)throw Error('Kampanye sudah diarsipkan.');
          const image=b.image || d.image;imageBytes(image);
          send(res,200,clean(saveAd({...d,...f,image})));
        });return true;
      }
      if(req.method!=='POST')return false;
      if(!['submit','review','activate','pause','sync'].includes(action))return false;
      await locked(key,async()=>{
        let d=mustGet(key,'paid_ad');
        if(action==='submit'){
          if(d.state!=='draft')throw Error('Draf sudah dikirim atau memerlukan pemeriksaan. Tidak dikirim ulang untuk mencegah duplikat.');
          const b=await body(req);if(b.confirmed!==true)throw Error('Konfirmasikan pengiriman draf dalam status jeda.');
          ensureFuture(d);const c=mustGet(d.campaignId,'campaign');if(c.archived || !settings().contactVerified)throw Error('Kampanye atau identitas usaha tidak aktif.');
          const credentials=await check();
          if(d.placements.includes('instagram') && !credentials.page.instagram_business_account?.id)throw Error('Halaman belum memiliki Instagram profesional yang terbaca. Pilih Facebook saja atau hubungkan Instagram dahulu.');
          for(const l of d.locations){const found=await client.locations(l.name);if(!found.some(x=>x.key===l.key && x.type===l.type))throw Error(`Lokasi ${l.name} belum dapat diverifikasi sebagai wilayah Indonesia.`);}
          d=saveAd({...d,state:'submitting',accountId:config.accountId,pageId:config.pageId,instagramId:credentials.page.instagram_business_account?.id || '',error:null});
          try{
            await client.createPaused(d,credentials,remote=>{d=saveAd({...d,remote});});
            const snapshot=await client.snapshot(d);client.assertSnapshot(d,snapshot);
            d=saveAd({...d,state:'paused',snapshot,error:null});
          }catch(err){d=saveAd({...d,state:'needs_review',error:err.message});throw err;}
          send(res,200,clean(d));return;
        }
        bound(d);
        if(!complete(d) && action!=='pause')throw Error('ID Meta belum lengkap. Periksa hasil pembuatan di Meta Ads Manager sebelum membuat ulang.');
        if(action==='review'){
          if(!['paused','needs_review'].includes(d.state))throw Error('Iklan harus berstatus jeda untuk diperiksa sebelum aktivasi.');
          ensureFuture(d);await check();
          const snapshot=await client.snapshot(d);client.assertSnapshot(d,snapshot);
          const approvalToken=randomBytes(24).toString('hex');
          d=saveAd({...d,state:'paused',snapshot,error:null,approval:{tokenHash:hash(approvalToken),snapshotHash:hash(snapshot),expires:Date.now()+5*60000}});
          send(res,200,{ad:clean(d),approvalToken,expires:d.approval.expires,account:get('meta_connection','meta_connection')?.account,page:get('meta_connection','meta_connection')?.page});return;
        }
        if(action==='activate'){
          const b=await body(req);
          if(d.state!=='paused' || !d.approval || d.approval.expires<Date.now() || hash(String(b.approvalToken||''))!==d.approval.tokenHash || b.confirmed!==true || b.confirmText!=='AKTIFKAN' || Number(b.budgetTotal)!==d.budgetTotal)throw Error('Persetujuan aktivasi tidak cocok atau kedaluwarsa. Buka pemeriksaan akhir kembali.');
          ensureFuture(d);const c=mustGet(d.campaignId,'campaign');if(c.archived || !settings().contactVerified)throw Error('Kampanye atau identitas usaha tidak aktif.');
          await check();
          const snapshot=await client.snapshot(d);client.assertSnapshot(d,snapshot);
          if(hash(snapshot)!==d.approval.snapshotHash)throw Error('Data Meta berubah sejak pemeriksaan akhir. Tinjau kembali.');
          d=saveAd({...d,state:'activating',approval:null});
          try{await client.activate(d);d=saveAd({...d,state:'activation_requested',activatedAt:now(),error:null});}
          catch(err){
            let paused=false;try{await client.pause(d);paused=true;}catch{}
            d=saveAd({...d,state:paused?'paused':'needs_review',error:paused?`${err.message} Kampanye berhasil dijeda kembali.`:`${err.message} Status aktivasi belum pasti; periksa dan jeda di Ads Manager.`});
            throw Error(d.error);
          }
          send(res,200,clean(d));return;
        }
        if(action==='pause'){
          if(!d.remote?.campaignId)throw Error('ID kampanye Meta belum tersedia.');
          try{await client.pause(d);d=saveAd({...d,state:complete(d)?'paused':'needs_review',approval:null,error:null});}
          catch(err){d=saveAd({...d,state:'needs_review',error:`Jeda belum terkonfirmasi. ${err.message}`});throw Error(d.error);}
          send(res,200,clean(d));return;
        }
        if(action==='sync'){
          const result=await client.sync(d);
          const state=result.snapshot.campaign.status==='PAUSED'?'paused':result.snapshot.campaign.status==='ACTIVE'?'activation_requested':'needs_review';
          d=saveAd({...d,...result,state,syncedAt:now(),approval:null});
          send(res,200,clean(d));return;
        }
      });
      return true;
    }
  };
}
