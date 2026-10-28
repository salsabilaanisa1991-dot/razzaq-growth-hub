import assert from 'node:assert/strict';
export const cfg={accessToken:'dummy-test-token-never-valid',accountId:'12345',pageId:'45678',version:'v26.0',appSecret:''};
export function fakeMeta(){
  const objects=new Map(),calls=[];let seq=1000;
  const state={currency:'IDR',fail:null};
  const fetchImpl=async(url,options)=>{
    assert.equal(url.hostname,'graph.facebook.com');assert.equal(options.headers.Authorization,`Bearer ${cfg.accessToken}`);assert.equal(url.searchParams.has('access_token'),false);
    const path=url.pathname.replace('/v26.0/',''),params=Object.fromEntries(options.method==='GET'?url.searchParams:new URLSearchParams(options.body));
    for(const key of ['targeting','object_story_spec','creative','special_ad_categories'])if(key in params)params[key]=JSON.parse(params[key]);
    calls.push({path,method:options.method,params:structuredClone(params)});
    if(state.fail?.(path,options.method,params))return {ok:false,json:async()=>({error:{code:100,message:`Ditolak ${cfg.accessToken}`}})};
    let value;
    if(path==='act_12345'&&options.method==='GET')value={id:'act_12345',name:'Akun Uji',currency:state.currency,account_status:1,timezone_name:'Asia/Jakarta'};
    else if(path==='45678'&&options.method==='GET')value={id:'45678',name:'Halaman Uji',instagram_business_account:{id:'67890',username:'contohuji'}};
    else if(path==='search')value={data:[{key:'1143',name:'Yogyakarta',country_code:'ID',type:'region'}]};
    else if(path.endsWith('/insights'))value={data:[{spend:'12500',impressions:'1234',clicks:'24',reach:'1000'}]};
    else if(path.endsWith('/adimages'))value={images:{'file.png':{hash:'imagehash123'}}};
    else if(options.method==='POST'&&path.startsWith('act_')){
      const id=String(++seq),row={...params,id};
      if(path.endsWith('/ads'))row.creative={id:params.creative.creative_id};
      objects.set(id,row);value={id};
    }else if(objects.has(path)){
      const row=objects.get(path);
      if(options.method==='POST'){Object.assign(row,params);value={success:true};}
      else{value=structuredClone(row);if(row.creative)value.effective_status=row.status==='ACTIVE'?'PENDING_REVIEW':'PAUSED';}
    }else throw Error(`Unexpected fake route ${path}`);
    return {ok:true,json:async()=>value};
  };
  return {fetchImpl,objects,calls,state};
}
