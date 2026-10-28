import {createServer} from 'node:http';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {once} from 'node:events';
import {GOOGLE_SCOPE} from './google-ads.mjs';

export function googleAuthorizationUrl({clientId,redirectUri,state,verifier}){
  const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:GOOGLE_SCOPE,access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();return u.toString();
}
export async function exchangeGoogleCode({clientId,clientSecret,redirectUri,verifier,code},fetchImpl=fetch){
  const response=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,grant_type:'authorization_code',code_verifier:verifier,code}).toString(),signal:AbortSignal.timeout(25000),redirect:'error'});
  const data=await response.json();if(!response.ok||!data.refresh_token)throw Error('Otorisasi tidak menghasilkan refresh token. Pastikan client OAuth bertipe Desktop dan izin offline diberikan.');return data.refresh_token;
}
export async function authorizeGoogleLoopback({clientId,clientSecret,onUrl,fetchImpl=fetch,timeoutMs=300000}){
  const state=randomBytes(24).toString('hex'),verifier=randomBytes(48).toString('base64url');
  let redirectUri,used=false,finish,reject,timer;
  const result=new Promise((resolve,rej)=>{finish=resolve;reject=rej;});
  const server=createServer(async(req,res)=>{
    const u=new URL(req.url,'http://127.0.0.1');
    const received=Buffer.from(u.searchParams.get('state')||''),expected=Buffer.from(state);
    if(used||u.pathname!=='/oauth2callback'||received.length!==expected.length||!timingSafeEqual(received,expected)){res.writeHead(400,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('Permintaan otorisasi tidak cocok.');return;}
    used=true;
    if(u.searchParams.has('error')||!u.searchParams.get('code')){res.end('Otorisasi dibatalkan.');reject(Error('Otorisasi Google dibatalkan.'));return;}
    try{const token=await exchangeGoogleCode({clientId,clientSecret,redirectUri,verifier,code:u.searchParams.get('code')},fetchImpl);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'"});res.end('<h1>Koneksi Google selesai</h1><p>Kembali ke terminal aplikasi untuk menyelesaikan penyimpanan.</p>');finish(token);}
    catch{res.writeHead(400,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('Otorisasi gagal. Kembali ke terminal.');reject(Error('Pertukaran otorisasi Google gagal. Tidak ada token yang disimpan.'));}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');redirectUri=`http://127.0.0.1:${server.address().port}/oauth2callback`;
  timer=setTimeout(()=>reject(Error('Otorisasi melewati lima menit. Jalankan setup kembali.')),timeoutMs);
  try{onUrl(googleAuthorizationUrl({clientId,redirectUri,state,verifier}));return await result;}
  finally{clearTimeout(timer);server.close();server.closeIdleConnections();}
}
