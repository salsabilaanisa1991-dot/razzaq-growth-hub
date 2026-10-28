import { renderPaidAds } from './paid-ads.js';
const $ = s => document.querySelector(s);
const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rupiah = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n || 0);
const date = value => new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(`${value}T12:00:00+07:00`));
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const statusName = {draft:'Draf',ready:'Siap dipublikasikan',published:'Tayang · catatan manual'};
const initial = channel => ({Facebook:'FB',Instagram:'IG',TikTok:'TT','YouTube Shorts':'YT','Google Business Profile':'GB','WhatsApp Status':'WA'}[channel]);
let data = null;
let activePage = 'overview';
let modalSave;
let toastTimer;
async function api(path, method = 'GET', payload) {
  const response = await fetch(`/api/${path}`,{method,headers:{'Content-Type':'application/json','X-Growth-Request':'1'},...(payload ? {body:JSON.stringify(payload)} : {})});
  const result = await response.json();
  if (response.status === 401) showLogin();
  if (!response.ok) throw Error(result.error || 'Permintaan gagal.');
  return result;
}
function showLogin(){ $('#shell').hidden=true; $('#login').hidden=false; }
function toast(message){ $('#toast').textContent=message; $('#toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').hidden=true,3500); }
function empty(title, text, action=''){ return `<div class="empty"><h3>${e(title)}</h3><p>${e(text)}</p>${action}</div>`; }
function button(action,label,attr='',primary=false){return `<button class="${primary?'primary':'secondary'}" data-action="${action}" ${attr}>${label}</button>`;}
function activeCampaigns(){return data.campaigns.filter(c=>!c.archived);}
function campaign(id){return data.campaigns.find(c=>c.id===id);}
function channelOptions(selected){return data.channels.map(c=>`<option ${c===selected?'selected':''}>${e(c)}</option>`).join('');}
function metrics(){
  const spend=data.campaigns.reduce((n,c)=>n+c.spend,0);
  const booked=data.leads.filter(l=>l.stage==='Booking');
  const income=booked.reduce((n,l)=>n+l.revenue,0);
  return {spend,booked,income,cost:booked.length ? spend/booked.length : null};
}
function settingNotice(){return !data.settings.contactVerified ? '<div class="notice">Sebelum membuat materi, periksa nomor WhatsApp dan alamat website. <a href="#settings">Verifikasi pengaturan usaha →</a></div>' : '';}
function render(){
  if(!data)return;
  activePage=location.hash.slice(1)||'overview';
  if(!['overview','campaigns','ads','content','leads','settings'].includes(activePage)) activePage='overview';
  const names={overview:'Ringkasan',campaigns:'Kampanye',ads:'Iklan berbayar',content:'Studio konten',leads:'Pelanggan',settings:'Pengaturan usaha'};
  $('#page-title').textContent=names[activePage];
  document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.dataset.page===activePage));
  $('#app-error').hidden=true;
  ({overview:renderOverview,campaigns:renderCampaigns,ads:()=>renderPaidAds({data,api,refresh,showModal,toast}),content:renderContent,leads:renderLeads,settings:renderSettings}[activePage])();
}
async function refresh(){data=await api('data');$('#shell').hidden=false;$('#login').hidden=true;render();}
function renderOverview(){
  const m=metrics();
  const planned=data.posts.filter(p=>p.status!=='published'&&!campaign(p.campaignId)?.archived).sort((a,b)=>a.plannedDate.localeCompare(b.plannedDate));
  const active=activeCampaigns();
  $('#view').innerHTML=`${settingNotice()}<section class="hero"><div><p class="eyebrow">LEBIH TERATUR, LEBIH TERUKUR</p><h2>Bawa usaha Anda ke<br>lebih banyak perjalanan.</h2><p>Siapkan satu kampanye untuk beberapa kanal. Pantau materi yang perlu tayang dan pemesanan yang berhasil masuk.</p>${button('new-campaign','+ Buat kampanye pertama','',true)}</div><div class="hero-mark" aria-hidden="true">go.</div></section>
  <section class="metrics" aria-label="Ringkasan seluruh periode"><div class="metric"><p>Kampanye aktif</p><strong>${active.length}</strong><small>${data.posts.length} materi tersimpan</small></div><div class="metric"><p>Pengeluaran iklan</p><strong>${rupiah(m.spend)}</strong><small>Akumulasi yang Anda catat</small></div><div class="metric"><p>Booking tercatat</p><strong>${m.booked.length}</strong><small>Dari ${data.leads.length} calon pelanggan</small></div><div class="metric"><p>Biaya per booking</p><strong>${m.cost===null?'—':rupiah(m.cost)}</strong><small>Seluruh biaya ÷ booking tercatat</small></div></section>
  <div class="panels"><section class="panel"><div class="panel-title"><h2>Agenda publikasi</h2><a href="#content">Buka studio →</a></div>${planned.length?planned.slice(0,5).map(p=>`<div class="channel-row"><span class="channel-icon">${initial(p.channel)}</span><div><strong>${e(campaign(p.campaignId)?.name)}</strong><small>${e(p.channel)} · ${date(p.plannedDate)}</small></div><span class="pill ${p.status==='draft'?'orange':''}">${p.plannedDate<today()?'Perlu ditinjau':statusName[p.status]}</span></div>`).join(''):empty('Agenda masih kosong','Buat kampanye, lalu siapkan materi untuk mengisi agenda publikasi.',button('new-campaign','Buat kampanye'))}<p class="subtitle">Jadwal adalah pengingat kerja. Aplikasi tidak memposting otomatis.</p></section>
  <section class="panel"><div class="panel-title"><h2>Jangkauan kanal</h2><span class="pill gray">Materi siap pakai</span></div>${data.channels.map(ch=>`<div class="channel-row"><span class="channel-icon">${initial(ch)}</span><div><strong>${e(ch)}</strong><small>${data.posts.filter(p=>p.channel===ch).length} materi</small></div><span class="pill gray">Manual</span></div>`).join('')}</section></div>
  <section class="panel"><div class="panel-title"><h2>Hasil yang tercatat</h2><span class="subtitle">Seluruh periode · input manual</span></div><div class="value-row"><span>Nilai booking berstatus Booking</span><strong>${rupiah(m.income)}</strong></div><div class="value-row"><span>Permintaan ke tautan pelacakan</span><strong>${data.clicks.reduce((n,c)=>n+c.count,0)}</strong></div><p class="subtitle">Nilai booking bukan laba atau kas diterima. Hitungan tautan dapat mencakup pratinjau dan bot; bukan jumlah orang unik.</p></section>`;
}
function renderCampaigns(){
  $('#view').innerHTML=`${settingNotice()}<div class="section-head"><div><h2>Satu rencana, banyak kanal.</h2><p>Atur penawaran, sasaran, dan anggaran sebelum publikasi.</p></div>${button('new-campaign','+ Kampanye baru','',true)}</div><div class="toolbar"><input id="campaign-search" type="search" placeholder="Cari kampanye…" aria-label="Cari kampanye"><select id="campaign-status" aria-label="Status kampanye"><option value="active">Aktif</option><option value="archived">Diarsipkan</option><option value="all">Semua kampanye</option></select></div><div id="campaign-results"></div>`;
  $('#campaign-search').addEventListener('input',campaignResults);$('#campaign-status').addEventListener('change',campaignResults);campaignResults();
}
function campaignResults(){
  const q=$('#campaign-search').value.toLowerCase();const filter=$('#campaign-status').value;
  const rows=data.campaigns.filter(c=>c.name.toLowerCase().includes(q)&&(filter==='all'||c.archived===(filter==='archived')));
  $('#campaign-results').innerHTML=rows.length?`<div class="campaign-grid">${rows.map(c=>{
    const count=data.posts.filter(p=>p.campaignId===c.id).length;
    return `<article class="campaign-card"><div class="card-head"><h3>${e(c.name)}</h3><span class="pill ${c.archived?'gray':''}">${c.archived?'Arsip':'Aktif'}</span></div><div class="chips">${c.channels.map(ch=>`<span class="pill gray">${e(ch)}</span>`).join('')}</div><p class="offer">${e(c.offer)}</p><p class="subtitle">Sasaran: ${e(c.audience)}</p><div class="campaign-meta"><div><span>Periode rencana</span>${date(c.start)} – ${date(c.end)}</div><div><span>Tujuan tautan</span>${c.target==='website'?'Website + UTM':'Chat WhatsApp'}</div><div><span>Anggaran total rencana</span>${rupiah(c.budget)}</div><div><span>Pengeluaran aktual</span>${rupiah(c.spend)}</div></div><div class="card-actions">${!c.archived?`${count?'<a class="button" href="#content">Buka studio →</a>':button('generate','Siapkan materi',`data-id="${c.id}"`,true)}${button('spend','Catat biaya',`data-id="${c.id}"`)}`:''}${button('archive',c.archived?'Aktifkan kembali':'Arsipkan',`data-id="${c.id}"`)}</div></article>`;
  }).join('')}</div>`:empty('Belum ada kampanye di daftar ini','Buat kampanye baru atau ubah pencarian.');
}
function renderContent(){
  $('#view').innerHTML=`<div class="section-head"><div><h2>Materi untuk setiap kanal.</h2><p>Draf berbasis template; tinjau harga dan klaim sebelum dipakai.</p></div><a class="button" href="/api/export/posts.csv">Unduh CSV ↓</a></div><div class="notice">Publikasi dilakukan sendiri di akun medsos. Tombol “Tandai tayang” hanya memperbarui catatan. Tautan dalam caption Instagram/TikTok mungkin perlu dipasang pada profil.</div><div class="toolbar"><input id="post-search" type="search" placeholder="Cari kampanye atau caption…" aria-label="Cari materi"><select id="post-channel" aria-label="Filter kanal"><option value="">Semua kanal</option>${channelOptions()}</select><select id="post-status" aria-label="Filter status"><option value="">Semua status</option><option value="draft">Draf</option><option value="ready">Siap</option><option value="published">Tayang tercatat</option></select></div><div id="post-results" class="content-list"></div>`;
  ['post-search','post-channel','post-status'].forEach(k=>$('#'+k).addEventListener(k==='post-search'?'input':'change',postResults));postResults();
}
function postResults(){
  const q=$('#post-search').value.toLowerCase(), ch=$('#post-channel').value, status=$('#post-status').value;
  const rows=data.posts.filter(p=>(!ch||p.channel===ch)&&(!status||p.status===status)&&`${p.caption} ${campaign(p.campaignId)?.name}`.toLowerCase().includes(q));
  $('#post-results').innerHTML=rows.length?rows.map(p=>{
    const archived=campaign(p.campaignId)?.archived;
    const clicks=data.clicks.find(c=>c.post_id===p.id)?.count||0;
    return `<article class="post" data-post="${p.id}"><div class="post-main"><div class="card-head"><div class="post-title"><span class="channel-icon">${initial(p.channel)}</span><div><h3>${e(p.channel)}</h3><small>${e(campaign(p.campaignId)?.name)}</small></div></div><span class="pill ${p.status==='draft'?'orange':''}">${statusName[p.status]}</span></div><label for="caption-${p.id}" class="muted">Caption siap ditinjau</label><textarea id="caption-${p.id}" ${archived?'disabled':''}>${e(p.caption)}</textarea><div class="card-actions">${button('copy-caption','Salin caption',`data-id="${p.id}"`)}${!archived?button('save-post','Simpan perubahan',`data-id="${p.id}"`):'<span class="pill gray">Kampanye diarsipkan</span>'}</div></div><div class="post-side"><h3>Arahan visual</h3><p>${e(p.brief)}</p><label>Tanggal rencana (WIB)<input type="date" id="date-${p.id}" value="${e(p.plannedDate)}" ${archived?'disabled':''}></label><p>${clicks} permintaan tautan tercatat</p>${button('copy-link','Salin tautan sumber',`data-id="${p.id}"`)}<p>${data.publicOrigin?'Tautan pelacakan aktif saat server dapat diakses publik.':'Mode lokal: tautan yang disalin langsung menuju website/WhatsApp. Hitungan hanya aktif melalui /go saat di-host publik.'}</p><div class="card-actions">${!archived?(p.status==='draft'?button('post-status','Tandai siap',`data-id="${p.id}" data-status="ready"`,true):p.status==='ready'?button('post-status','Tandai sudah tayang',`data-id="${p.id}" data-status="published"`,true):button('post-status','Kembalikan ke draf',`data-id="${p.id}" data-status="draft"`)):''}</div></div></article>`;
  }).join(''):empty('Belum ada materi yang cocok','Pada Kampanye, pilih “Siapkan materi” untuk membuat draf per kanal.','<a class="button" href="#campaigns">Buka kampanye →</a>');
}
function renderLeads(){
  $('#view').innerHTML=`<div class="section-head"><div><h2>Dari percakapan ke booking.</h2><p>Catat pelanggan yang masuk dan sumber promosinya.</p></div>${button('new-lead','+ Catat pelanggan','',true)}</div><div class="toolbar"><input id="lead-search" type="search" placeholder="Cari nama atau kampanye…" aria-label="Cari pelanggan"><select id="lead-status" aria-label="Filter status pelanggan"><option value="">Semua status</option>${data.stages.map(s=>`<option>${e(s)}</option>`).join('')}</select></div><div class="panel" id="lead-results"></div>`;
  $('#lead-search').addEventListener('input',leadResults);$('#lead-status').addEventListener('change',leadResults);leadResults();
}
function leadResults(){
  const q=$('#lead-search').value.toLowerCase(), stage=$('#lead-status').value;
  const rows=data.leads.filter(l=>(!stage||l.stage===stage)&&`${l.name} ${campaign(l.campaignId)?.name}`.toLowerCase().includes(q));
  $('#lead-results').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Pelanggan</th><th>Sumber</th><th>Status</th><th>Nilai booking</th><th>Aksi</th></tr></thead><tbody>${rows.map(l=>`<tr><td><strong>${e(l.name)}</strong><small>${e(campaign(l.campaignId)?.name)}</small></td><td>${e(l.channel)}</td><td><span class="pill ${l.stage==='Booking'?'':'gray'}">${e(l.stage)}</span></td><td>${rupiah(l.revenue)}</td><td>${button('edit-lead','Edit',`data-id="${l.id}"`)}</td></tr>`).join('')}</tbody></table></div>`:empty('Belum ada pelanggan di daftar ini','Catat setiap chat yang relevan agar hasil promosi dapat dievaluasi.');
}
function renderSettings(){
  const s=data.settings;
  $('#view').innerHTML=`<div class="settings-grid"><form id="settings-form" class="panel"><div class="panel-title"><h2>Identitas usaha</h2><span class="pill ${s.contactVerified?'':'orange'}">${s.contactVerified?'Terverifikasi oleh Anda':'Perlu diperiksa'}</span></div><label>Nama usaha<input name="brand" value="${e(s.brand)}" required maxlength="80"></label><label>Website<input name="website" type="url" value="${e(s.website)}" required></label><label>WhatsApp dengan kode negara<input name="phone" value="${e(s.phone)}" required inputmode="tel"><small>Contoh: 62812… tanpa angka 0 di awal.</small></label><label>Area layanan<input name="area" value="${e(s.area)}" required maxlength="100"></label><label class="check-label"><input name="contactVerified" type="checkbox" ${s.contactVerified?'checked':''}>Saya sudah memeriksa nomor, website, dan berwenang mempromosikan usaha ini.</label><p class="subtitle">Identitas awal diambil dari halaman depan website dan perlu Anda konfirmasi. Perubahan identitas memerlukan pemeriksaan ulang caption yang sudah dibuat.</p><p id="settings-error" class="error" role="alert"></p><button class="primary">Simpan pengaturan</button></form><div><section class="panel"><h2>Kesiapan kanal</h2><div class="steps"><div class="step"><div><strong>Siapkan profil usaha</strong><p>Facebook Page, Instagram profesional, WhatsApp Business, serta akun kanal lain yang ingin dipakai.</p></div></div><div class="step"><div><strong>Gunakan materi yang sudah ditinjau</strong><p>Salin caption dan gunakan foto atau video milik sendiri. Unduh CSV untuk dibagikan kepada operator.</p></div></div><div class="step"><div><strong>Atur iklan di platform</strong><p>Untuk Meta, gunakan menu Iklan berbayar setelah koneksi disiapkan. Aktivasi memerlukan pemeriksaan akhir dan persetujuan anggaran.</p></div></div><div class="step"><div><strong>Catat hasil aktual</strong><p>Catat booking. Status dan metrik iklan Meta dapat disinkronkan di menu Iklan berbayar; posting organik masih manual.</p></div></div></div><a class="button" href="https://adsmanager.facebook.com/" target="_blank" rel="noopener noreferrer">Buka Meta Ads Manager ↗</a></section><section class="panel"><h3>Cadangan data</h3><p class="subtitle">Unduhan berisi data bisnis dan pelanggan. Simpan di tempat pribadi. Pemulihan dilakukan dari salinan database server sesuai README.</p><a class="button" href="/api/export/backup.json">Unduh data JSON ↓</a></section><button class="secondary" data-action="logout">Keluar dari akun</button></div></div>`;
  $('#settings-form').addEventListener('submit',async event=>{
    event.preventDefault();const f=new FormData(event.target);const btn=event.submitter;btn.disabled=true;
    try{await api('settings','PUT',{...Object.fromEntries(f),contactVerified:f.has('contactVerified')});await refresh();toast('Pengaturan tersimpan.');}catch(err){$('#settings-error').textContent=err.message;}finally{btn.disabled=false;}
  });
}
function showModal(title,fields,save,label='Simpan'){
  $('#modal-title').textContent=title;$('#modal-fields').innerHTML=fields;$('#modal-error').textContent='';$('#modal-submit').textContent=label;modalSave=save;$('#modal').showModal();
}
function newCampaign(){
  const start=today();const end=new Date(Date.parse(start)+6*86400000).toISOString().slice(0,10);
  showModal('Buat kampanye',`<label>Nama kampanye<input name="name" placeholder="Contoh: Liburan keluarga di Jogja" required maxlength="100"></label><label>Penawaran yang sudah diverifikasi<textarea name="offer" required maxlength="800" placeholder="Jenis mobil, harga, durasi, termasuk/tidak termasuk sopir dan BBM. Jangan isi harga perkiraan."></textarea></label><label>Sasaran pelanggan<input name="audience" placeholder="Contoh: Keluarga yang merencanakan liburan ke Jogja" required maxlength="200"></label><div class="field-grid"><label>Tanggal mulai (WIB)<input type="date" name="start" value="${start}" required></label><label>Tanggal selesai (WIB)<input type="date" name="end" value="${end}" required></label></div><div class="field-grid"><label>Total anggaran rencana (Rp)<input type="number" min="0" max="1000000000000" step="1" name="budget" value="0" required><small>Isi 0 untuk promosi organik. Bukan pembelian iklan.</small></label><label>Tujuan tautan<select name="target"><option value="website">Website + UTM</option><option value="whatsapp">Chat WhatsApp</option></select></label></div><fieldset><legend>Kanal yang ingin dipakai</legend><div class="check-grid">${data.channels.map(c=>`<label><input name="channels" type="checkbox" value="${e(c)}" ${['Facebook','Instagram','WhatsApp Status'].includes(c)?'checked':''}>${e(c)}</label>`).join('')}</div></fieldset>`, async f=>{
    await api('campaigns','POST',{...Object.fromEntries(f),channels:f.getAll('channels')});location.hash='campaigns';
  },'Buat kampanye');
}
function leadModal(id){
  if(!data.campaigns.length){toast('Buat kampanye dahulu agar sumber pelanggan bisa dicatat.');return;}
  const l=data.leads.find(v=>v.id===id)||{name:'',campaignId:activeCampaigns()[0]?.id||data.campaigns[0].id,channel:'Facebook',stage:'Baru',revenue:0,notes:''};
  showModal(id?'Perbarui pelanggan':'Catat pelanggan',`<label>Nama atau alias<input name="name" value="${e(l.name)}" required maxlength="100"><small>Tidak perlu menyimpan KTP, alamat, atau nomor pribadi.</small></label><label>Kampanye<select name="campaignId">${data.campaigns.map(c=>`<option value="${c.id}" ${c.id===l.campaignId?'selected':''}>${e(c.name)}${c.archived?' (arsip)':''}</option>`).join('')}</select></label><div class="field-grid"><label>Kanal sumber<select name="channel">${channelOptions(l.channel)}</select></label><label>Status<select name="stage">${data.stages.map(s=>`<option ${s===l.stage?'selected':''}>${e(s)}</option>`).join('')}</select></label></div><label>Nilai booking (Rp)<input name="revenue" type="number" min="0" max="1000000000000" step="1" required value="${l.revenue}"><small>Hanya status Booking yang masuk ringkasan nilai booking.</small></label><label>Catatan singkat<textarea name="notes" maxlength="1000">${e(l.notes)}</textarea></label>`,async f=>api(id?`leads/${id}`:'leads',id?'PATCH':'POST',Object.fromEntries(f)));
}
async function copy(text){try{await navigator.clipboard.writeText(text);toast('Tersalin.');}catch{showModal('Salin teks berikut',`<label>Pilih teks lalu salin<textarea readonly>${e(text)}</textarea></label>`,async()=>{},'Tutup');}}
document.addEventListener('click',async event=>{
  const btn=event.target.closest('[data-action]');if(!btn)return;
  const {action,id}=btn.dataset;
  $('#app-error').hidden=true;btn.disabled=true;
  try{
    if(action==='new-campaign')newCampaign();
    else if(action==='new-lead')leadModal();
    else if(action==='edit-lead')leadModal(id);
    else if(action==='generate'){await api(`campaigns/${id}/generate`,'POST',{});await refresh();location.hash='content';toast('Draf materi berhasil disiapkan.');}
    else if(action==='archive'){await api(`campaigns/${id}`,'PATCH',{archived:!campaign(id).archived});await refresh();toast('Status kampanye diperbarui.');}
    else if(action==='spend')showModal('Catat pengeluaran aktual',`<p class="subtitle">${e(campaign(id).name)} — isi total pengeluaran kampanye hingga saat ini, bukan tambahan biaya. Angka ini tidak melakukan pembayaran.</p><label>Total pengeluaran (Rp)<input type="number" min="0" max="1000000000000" step="1" name="spend" required value="${campaign(id).spend}"></label>`,async f=>api(`campaigns/${id}`,'PATCH',Object.fromEntries(f)));
    else if(action==='copy-caption')await copy($(`#caption-${id}`).value);
    else if(action==='copy-link'){const p=data.posts.find(p=>p.id===id);await copy(data.publicOrigin?p.trackingUrl:p.destination);}
    else if(action==='save-post'){await api(`posts/${id}`,'PATCH',{caption:$(`#caption-${id}`).value,plannedDate:$(`#date-${id}`).value});await refresh();toast('Materi tersimpan.');}
    else if(action==='post-status'){
      if(btn.dataset.status==='published'&&!confirm('Apakah materi ini sudah benar-benar Anda publikasikan di platform? Aplikasi hanya menyimpan catatan.'))return;
      await api(`posts/${id}`,'PATCH',{caption:$(`#caption-${id}`).value,plannedDate:$(`#date-${id}`).value,status:btn.dataset.status});await refresh();toast('Status materi diperbarui.');
    }else if(action==='logout'){await api('logout','POST',{});data=null;showLogin();}
  }catch(err){$('#app-error').textContent=err.message;$('#app-error').hidden=false;$('#app-error').scrollIntoView({behavior:'smooth',block:'nearest'});}finally{btn.disabled=false;}
});
$('#modal-form').addEventListener('submit',async event=>{
  event.preventDefault();const btn=$('#modal-submit');btn.disabled=true;$('#modal-error').textContent='';
  try{await modalSave(new FormData(event.target));$('#modal').close();await refresh();toast('Data tersimpan.');}catch(err){$('#modal-error').textContent=err.message;}finally{btn.disabled=false;}
});
$('#close-modal').addEventListener('click',()=>$('#modal').close());
$('#login-form').addEventListener('submit',async event=>{
  event.preventDefault();const btn=event.submitter;btn.disabled=true;$('#login-error').textContent='';
  try{await api('login','POST',{password:new FormData(event.target).get('password')});event.target.reset();await refresh();}catch(err){$('#login-error').textContent=err.message;}finally{btn.disabled=false;}
});
$('#logout').addEventListener('click',async()=>{try{await api('logout','POST',{});data=null;showLogin();}catch(err){toast(err.message);}});
$('#today').textContent=new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date());
window.addEventListener('hashchange',render);
refresh().catch(err=>{showLogin();if(err.message!=='Silakan masuk.')$('#login-error').textContent=err.message;});
