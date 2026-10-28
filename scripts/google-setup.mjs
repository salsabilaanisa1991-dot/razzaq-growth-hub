import {existsSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {authorizeGoogleLoopback} from '../google-oauth.mjs';

if(!existsSync('.env'))throw Error('Jalankan npm run setup dahulu.');
if(!process.stdin.isTTY)throw Error('Jalankan pengaturan Google melalui terminal pribadi yang interaktif.');
let muted=false;
const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk,encoding);callback();}});
const rl=createInterface({input:process.stdin,output,terminal:true,historySize:0});
async function hidden(prompt){const p=rl.question(prompt);muted=true;const v=(await p).trim();muted=false;process.stdout.write('\n');return v;}
try{
  console.log('Google Ads: siapkan proyek Google Cloud dengan Google Ads API dan OAuth Client Desktop. Akses API untuk akun produksi harus disetujui pada proyek Cloud.');
  const customer=(await rl.question('Customer ID akun pengiklan (10 angka, boleh dengan tanda hubung): ')).replace(/[\s-]/g,'');
  const manager=(await rl.question('Customer ID manager/MCC, opsional (Enter bila langsung): ')).replace(/[\s-]/g,'');
  if(!/^\d{10}$/.test(customer)||(manager&&!/^\d{10}$/.test(manager)))throw Error('Customer ID harus 10 angka.');
  const clientId=(await rl.question('OAuth Client ID bertipe Desktop: ')).trim();
  if(!/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId))throw Error('OAuth Client ID tidak valid.');
  const clientSecret=await hidden('OAuth Client Secret (disembunyikan): ');
  if(!/^[A-Za-z0-9_.\/-]{8,512}$/.test(clientSecret))throw Error('Client Secret tidak valid.');
  let refreshToken=await hidden('Refresh token yang sudah ada, atau Enter untuk login Google (disembunyikan): ');
  if(!refreshToken){
    console.log('Buka tautan berikut pada browser di perangkat yang menjalankan aplikasi. Untuk VPS, gunakan browser dengan akses loopback/SSH forwarding yang sesuai.');
    refreshToken=await authorizeGoogleLoopback({clientId,clientSecret,onUrl:url=>console.log(url)});
  }
  if(!/^[A-Za-z0-9_./+\-=]{10,8192}$/.test(refreshToken))throw Error('Format refresh token tidak valid.');
  let text=readFileSync('.env','utf8');
  for(const [key,value] of Object.entries({GOOGLE_ADS_CUSTOMER_ID:customer,GOOGLE_ADS_LOGIN_CUSTOMER_ID:manager,GOOGLE_ADS_CLIENT_ID:clientId,GOOGLE_ADS_CLIENT_SECRET:clientSecret,GOOGLE_ADS_REFRESH_TOKEN:refreshToken,GOOGLE_ADS_API_VERSION:'v26'})){
    const re=new RegExp(`^${key}=.*$`,'m'),line=`${key}=${value}`;text=re.test(text)?text.replace(re,()=>line):text.replace(/\n?$/,'\n')+line+'\n';
  }
  writeFileSync('.env',text,{mode:0o600});chmodSync('.env',0o600);console.log('Koneksi Google tersimpan tanpa menampilkan token. Jalankan npm start, lalu Google Ads → Periksa koneksi.');
}finally{muted=false;rl.close();}
