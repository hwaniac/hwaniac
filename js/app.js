const state={licenses:[],limits:[],risa:{stations:[],updatedAt:null},map:null,markers:null,markerById:new Map(),filtered:[]};
const LIMITS_URL='data/temperature-limits.json', LICENSE_URL='data/licenses.json', RISA_URL='data/risa-latest.json';

function tempStatus(temp, lim){
  if(temp==null || !lim) return {key:'gray',label:'수온자료 없음'};
  const low=lim.low, high=lim.high;
  const danger=(low!=null && temp<low)||(high!=null && temp>high);
  if(danger) return {key:'red',label:'위험'};
  const margin=2; // 운영 화면용 주의구간: 한계수온 ±2℃
  const near=(low!=null && temp<=low+margin)||(high!=null && temp>=high-margin);
  return near?{key:'yellow',label:'주의'}:{key:'green',label:'안전'};
}
function matchLimit(species){
  if(!species) return null;
  const s=species.replace(/\s+/g,'');
  if(s.includes('우렁쉥이')) species='멍게';
  else if(s.includes('전복')) species='참전복';
  const exact=state.limits.find(x=>s.includes(x.species));
  return exact||null;
}
function nearestStation(lat,lon){
  if(lat==null||lon==null||!state.risa.stations.length) return null;
  let best=null,bestD=Infinity;
  for(const st of state.risa.stations){
    if(st.lat==null||st.lon==null) continue;
    const p=Math.PI/180, dLat=(st.lat-lat)*p, dLon=(st.lon-lon)*p;
    const a=Math.sin(dLat/2)**2+Math.cos(lat*p)*Math.cos(st.lat*p)*Math.sin(dLon/2)**2;
    const d=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
    if(d<bestD){bestD=d;best=st;}
  }
  return best?{...best,distanceKm:bestD}:null;
}
function farmWeather(f){
  const st=nearestStation(f.lat,f.lon);
  const lim=matchLimit(String(f['양식물']||''));
  const temp=st?.surfaceTemp ?? null;
  return {station:st,limit:lim,temp,status:tempStatus(temp,lim)};
}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function badge(s){return `<span class="badge ${s.key}">${s.label}</span>`}
function initMap(){
  state.map=L.map('map',{zoomControl:true}).setView([35.6,128.0],6);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{attribution:'© OpenStreetMap © CARTO',maxZoom:19}).addTo(state.map);
  state.markers=L.markerClusterGroup({chunkedLoading:true,showCoverageOnHover:false});
  state.map.addLayer(state.markers);
}
function markerIcon(status){
  const cls=status.key;
  return L.divIcon({className:'',html:`<div class="marker-wrap"><div class="marker-dot ${cls}"></div></div>`,iconSize:[18,18],iconAnchor:[9,9]});
}
function addMarker(f,wx){
  if(f.lat==null||f.lon==null) return;
  const st=wx.status;
  const m=L.marker([f.lat,f.lon],{icon:markerIcon(st)});
  m.bindPopup(`<b>${escapeHtml(f['양식물']||'양식물 미기재')}</b><br>면허 ${escapeHtml(f['면허번호'])}<br>수온 ${wx.temp==null?'자료없음':wx.temp+'℃'} · ${st.label}`);
  m.on('click',()=>showDetail(f));
  state.markers.addLayer(m); state.markerById.set(String(f['면허번호']),m);
}
function showDetail(f){
  const wx=farmWeather(f); const lim=wx.limit; const st=wx.status;
  document.getElementById('detail').innerHTML=`<div class="detail">
    <div class="panel-head" style="padding:0 0 12px"><div><h2>${escapeHtml(f['양식물']||'양식물 미기재')}</h2><div class="sub">면허 ${escapeHtml(f['면허번호'])}</div></div>${badge(st)}</div>
    <div class="kpi">
      <div class="box"><div class="label">현재 실시간 수온</div><div class="value">${wx.temp==null?'-':wx.temp+'℃'}</div></div>
      <div class="box"><div class="label">고온 한계</div><div class="value">${lim?.high==null?'-':lim.high+'℃'}</div></div>
      <div class="box"><div class="label">저온 한계</div><div class="value">${lim?.low==null?'-':lim.low+'℃'}</div></div>
      <div class="box"><div class="label">관측소 거리</div><div class="value">${wx.station?wx.station.distanceKm.toFixed(1)+' km':'-'}</div></div>
    </div>
    <div class="status ${st.key}">${st.label}${lim?` · ${lim.species} 한계수온과 비교`:''}</div>
    <table class="meta">
      <tr><th>시·도</th><td>${escapeHtml(f['시도'])}</td></tr>
      <tr><th>시·군·구</th><td>${escapeHtml(f['시군구'])}</td></tr>
      <tr><th>양식업종류</th><td>${escapeHtml(f['양식업종류'])}</td></tr>
      <tr><th>총면적</th><td>${f['총면적']==null?'-':escapeHtml(f['총면적'])+' ha'}</td></tr>
      <tr><th>어장위치</th><td>${escapeHtml(f['어장위치'])}</td></tr>
      <tr><th>도로명주소</th><td>${escapeHtml(f['도로명주소'])}</td></tr>
      <tr><th>어업권자</th><td>${escapeHtml(f['어업권자'])}</td></tr>
      <tr><th>소유형태</th><td>${escapeHtml(f['소유형태'])}</td></tr>
      <tr><th>면허기간</th><td>${escapeHtml(f['현재면허시작일'])} ~ ${escapeHtml(f['현재면허종료일'])}</td></tr>
      <tr><th>NIFS 관측소</th><td>${wx.station?escapeHtml(wx.station.name):'매칭 없음'}</td></tr>
      <tr><th>관측시각</th><td>${wx.station?escapeHtml(wx.station.obsAt):'-'}</td></tr>
    </table>
  </div>`;
  document.getElementById('detail').classList.add('open');
}
function renderList(){
  const q=document.getElementById('search').value.trim().toLowerCase();
  const p=document.getElementById('province').value;
  const s=document.getElementById('species').value;
  state.filtered=state.licenses.filter(f=>{
    const text=[f['면허번호'],f['양식물'],f['시도'],f['시군구'],f['도로명주소'],f['어업권자']].filter(Boolean).join(' ').toLowerCase();
    return (!q||text.includes(q))&&(!p||f['시도']===p)&&(!s||String(f['양식물']||'').includes(s));
  });
  const box=document.getElementById('list');
  box.innerHTML='';
  state.filtered.slice(0,200).forEach(f=>{
    const wx=farmWeather(f); const d=document.createElement('div'); d.className='item';
    d.innerHTML=`<div class="row"><div class="name">${escapeHtml(f['양식물']||'미기재')}</div>${badge(wx.status)}</div><div class="sub">면허 ${escapeHtml(f['면허번호'])} · ${escapeHtml(f['시군구']||'')}</div><div class="sub">현재 수온 ${wx.temp==null?'-':wx.temp+'℃'} · 한계 ${wx.limit?(wx.limit.low??'-')+' / '+(wx.limit.high??'-'):'-'}</div>`;
    d.onclick=()=>{if(f.lat!=null){state.map.setView([f.lat,f.lon],Math.max(state.map.getZoom(),11));} showDetail(f);}
    box.appendChild(d);
  });
  document.getElementById('farmCount').textContent=`${state.filtered.length.toLocaleString()}건`;
}
function buildFilters(){
  const p=[...new Set(state.licenses.map(x=>x['시도']).filter(Boolean))].sort();
  const sel=document.getElementById('province'); p.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;sel.appendChild(o)});
  const sp=[...new Set(state.licenses.map(x=>x['양식물']).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'ko'));
  const ss=document.getElementById('species'); sp.forEach(v=>{if(v==='0')return;const o=document.createElement('option');o.value=v;o.textContent=v;ss.appendChild(o)});
}
function renderLimits(){
  const q=document.getElementById('limitSearch').value.trim();
  document.getElementById('limitsTable').innerHTML=state.limits.filter(x=>!q||x.species.includes(q)).map(x=>`<tr><td>${x.species}</td><td>${x.habitat}</td><td>${x.optimal}</td><td>${x.low==null?'-':x.low+'℃'}</td><td>${x.high==null?'-':x.high+'℃'}</td></tr>`).join('');
}
async function load(){
  const [lic,lim,risa]=await Promise.all([fetch(LICENSE_URL).then(r=>r.json()),fetch(LIMITS_URL).then(r=>r.json()),fetch(RISA_URL).then(r=>r.json()).catch(()=>({stations:[],updatedAt:null}))]);
  state.licenses=lic; state.limits=lim; state.risa=risa||{stations:[],updatedAt:null};
  initMap(); buildFilters(); renderLimits(); renderList();
  state.licenses.forEach(f=>addMarker(f,farmWeather(f)));
  document.getElementById('updated').textContent=state.risa.updatedAt?`수온 ${state.risa.updatedAt} 기준`:'실시간 수온 데이터 준비 중';
}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');const tab=b.dataset.tab;document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));document.getElementById(tab==='map'?'mapView':tab==='limits'?'limitsView':'aboutView').classList.add('active');});
document.getElementById('search').addEventListener('input',renderList);document.getElementById('province').addEventListener('change',renderList);document.getElementById('species').addEventListener('change',renderList);document.getElementById('searchBtn').onclick=renderList;document.getElementById('limitSearch').addEventListener('input',renderLimits);
load().catch(err=>{console.error(err);document.getElementById('updated').textContent='데이터 로드 오류';});
