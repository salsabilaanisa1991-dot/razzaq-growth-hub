import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

if(!existsSync('.env'))throw Error('Jalankan npm run setup dahulu.');
if(!process.stdin.isTTY)throw Error('Jalankan pengaturan Meta melalui terminal pribadi yang interaktif.');
let muted=false;
const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk,encoding);callback();}});
const rl=createInterface({input:process.stdin,output,terminal:true,historySize:0});
try{
  console.log('Koneksi Meta disimpan hanya di .env lokal. Kredensial lama tetap dipertahankan sampai seluruh input valid.');
  const account=(await rl.question('ID akun iklan (boleh diawali act_): ')).trim().replace(/^act_/,'');
  const page=(await rl.question('ID Halaman Facebook: ')).trim();
  if(!/^\d{1,30}$/.test(account)||!/^\d{1,30}$/.test(page))throw Error('ID akun dan Halaman harus angka.');
  const tokenPromise=rl.question('Access token Meta (input disembunyikan): ');muted=true;
  const accessToken=(await tokenPromise).trim();muted=false;process.stdout.write('\n');
  if(!/^[A-Za-z0-9_|.\-]{20,4096}$/.test(accessToken))throw Error('Format access token tidak valid.');
  const secretPromise=rl.question('App Secret, opsional (Enter untuk kosong; input disembunyikan): ');muted=true;
  const appSecret=(await secretPromise).trim();muted=false;process.stdout.write('\n');
  if(appSecret && !/^[a-fA-F0-9]{32,128}$/.test(appSecret))throw Error('Format App Secret tidak valid.');
  let text=readFileSync('.env','utf8');
  const values={META_AD_ACCOUNT_ID:account,META_PAGE_ID:page,META_ACCESS_TOKEN:accessToken,META_APP_SECRET:appSecret,META_API_VERSION:'v26.0'};
  for(const [key,value] of Object.entries(values)){
    const line=`${key}=${value}`;const re=new RegExp(`^${key}=.*$`,'m');
    text=re.test(text)?text.replace(re,()=>line):text.replace(/\n?$/,'\n')+line+'\n';
  }
  writeFileSync('.env',text,{mode:0o600});
  chmodSync('.env',0o600);
  console.log('Koneksi tersimpan. Jalankan npm start, lalu Iklan berbayar → Periksa koneksi. Token tidak ditampilkan.');
}finally{muted=false;rl.close();}
