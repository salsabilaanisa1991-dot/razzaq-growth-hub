import assert from 'node:assert/strict';
export const googleCfg={customerId:'1234567890',loginCustomerId:'',clientId:'dummy-client.apps.googleusercontent.com',clientSecret:'dummy-client-secret',refreshToken:'dummy-refresh-token-12345',version:'v26'};
export function fakeGoogle(){
  const calls=[],records=new Map(),state={currency:'IDR',zone:'Asia/Jakarta',fail:null,throwAfterMutation:null,reverse:false,tokenCalls:0};let seq=1000;
  const wrap={campaignBudgetOperation:['campaignBudgets','campaignBudgetResult','campaignBudget'],campaignOperation:['campaigns','campaignResult','campaign'],campaignCriterionOperation:['campaignCriteria','campaignCriterionResult','campaignCriterion'],adGroupOperation:['adGroups','adGroupResult','adGroup'],adGroupCriterionOperation:['adGroupCriteria','adGroupCriterionResult','adGroupCriterion'],adGroupAdOperation:['adGroupAds','adGroupAdResult','adGroupAd']};
  const fetchImpl=async(url,options)=>{
    const u=new URL(url),body=options.headers['Content-Type']==='application/json'?JSON.parse(options.body):Object.fromEntries(new URLSearchParams(options.body));
    calls.push({url:u.toString(),body:structuredClone(body)});
    if(u.hostname==='oauth2.googleapis.com'){state.tokenCalls++;assert.equal(body.client_secret,googleCfg.clientSecret);assert.equal(body.refresh_token,googleCfg.refreshToken);return {ok:true,json:async()=>({access_token:'google-access-dummy',expires_in:3600})};}
    assert.equal(u.hostname,'googleads.googleapis.com');assert.equal(options.headers.Authorization,'Bearer google-access-dummy');assert.equal(u.search,'');
    if(state.fail?.(u,body))return {ok:false,json:async()=>({error:{message:`Google ditolak ${googleCfg.clientSecret} ${googleCfg.refreshToken} google-access-dummy`}})};
    let value;
    if(u.pathname.endsWith('geoTargetConstants:suggest'))value={geoTargetConstantSuggestions:[{geoTargetConstant:{resourceName:'geoTargetConstants/999',canonicalName:'Yogyakarta, Indonesia',countryCode:'ID',status:'ENABLED'}}]};
    else if(u.pathname.endsWith('googleAds:search')){
      const q=body.query,table=/ FROM (\w+)/.exec(q)?.[1];
      if(table==='customer')value={results:[{customer:{id:googleCfg.customerId,descriptiveName:'Akun Google Uji',currencyCode:state.currency,timeZone:state.zone,status:'ENABLED',manager:false,testAccount:true}}]};
      else if(table==='geo_target_constant')value={results:[{geoTargetConstant:{resourceName:q.includes(' IN ')?'geoTargetConstants/999':'geoTargetConstants/2360',name:q.includes(' IN ')?'Yogyakarta':'Indonesia',canonicalName:q.includes(' IN ')?'Yogyakarta, Indonesia':'Indonesia',countryCode:'ID',status:'ENABLED'}}]};
      else if(q.includes('metrics.cost_micros'))value={results:[{metrics:{costMicros:'12500000000',clicks:'22',impressions:'888'}}]};
      else{
        const key={campaign:'campaign',campaign_budget:'campaignBudget',ad_group:'adGroup',ad_group_ad:'adGroupAd',ad_group_criterion:'adGroupCriterion',campaign_criterion:'campaignCriterion'}[table];
        const filter=/WHERE [\w.]+ = '([^']+)'/.exec(q)?.[1];
        let rows=[...records.values()].filter(x=>x.kind===key).map(x=>structuredClone(x.row));
        if(filter)rows=rows.filter(r=>table==='ad_group'||table==='campaign_criterion'?r.campaign===filter:table==='ad_group_ad'||table==='ad_group_criterion'?r.adGroup===filter:r.resourceName===filter);
        if(q.includes("!= 'REMOVED'"))rows=rows.filter(r=>r.status!=='REMOVED');
        if(state.reverse)rows.reverse();value={results:rows.map(row=>({[key]:row}))};
      }
    }else if(u.pathname.endsWith('googleAds:mutate')){
      assert.equal(body.partialFailure,false);
      if(body.validateOnly)value={};
      else{
        const replacements=new Map(),pending=new Map(),results=[];
        const replace=v=>typeof v==='string'?(replacements.get(v)||v):Array.isArray(v)?v.map(replace):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,replace(x)])):v;
        for(const op of body.mutateOperations){
          const field=Object.keys(op)[0],operation=op[field],meta=wrap[field];assert.ok(meta);
          if(operation.create){
            const old=operation.create.resourceName,row=replace(operation.create),type=meta[0];let suffix=String(++seq);
            if(type==='adGroupAds'||type==='adGroupCriteria')suffix=row.adGroup.split('/').pop()+'~'+suffix;
            if(type==='campaignCriteria')suffix=row.campaign.split('/').pop()+'~'+suffix;
            const resourceName=`customers/${googleCfg.customerId}/${type}/${suffix}`;if(old)replacements.set(old,resourceName);row.resourceName=resourceName;
            if(type==='campaigns')row.biddingStrategyType='MANUAL_CPC';
            if(type==='campaignCriteria'){row.type='LOCATION';row.status='ENABLED';}
            if(type==='adGroupCriteria'){row.type='KEYWORD';row.negative=false;}
            if(type==='adGroupAds')row.policySummary={approvalStatus:'UNDER_REVIEW'};
            pending.set(resourceName,{kind:meta[2],row});results.push({[meta[1]]:{resourceName}});
          }else{
            const row=structuredClone(records.get(operation.update.resourceName));assert.ok(row);Object.assign(row.row,operation.update);pending.set(row.row.resourceName,row);results.push({[meta[1]]:{resourceName:row.row.resourceName}});
          }
        }
        for(const [name,row] of pending)records.set(name,row);
        if(state.throwAfterMutation?.(body))throw Error('network unavailable');
        value={mutateOperationResponses:results};
      }
    }else throw Error('Unexpected Google route '+u.pathname);
    return {ok:true,json:async()=>value};
  };
  return {fetchImpl,calls,records,state};
}
