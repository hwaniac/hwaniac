const state={licenses:[],limits:[],risa:{observations:[],meta:{}},map:null,markers:null,filtered:[]};
const LIMITS_URL='data/temperature-limits.json', LICENSE_URL='data/licenses.json', RISA_URL='data/risa-latest.json';
const STALE_HOURS=3;

function parseObsTime(st){
  if(!st?.obsDate||!st?.obsTime) return null;
  const d=new Date(`${st.obsDate}T${st.obsTime}+09:00`);
  return Number.isNaN(d.getTime())?null:d;
}
function isStale(st){
  const d=parseObsTime(st); if(!d) return true;
  return (Date.now()-d.getTime())/36e5 > STALE_HOURS;
}
function tempStatus(temp,lim,st){
  if(!st||temp==null||isStale(st)) return {key:'gray',label:st&&isStale(st)?'관측 지연':'수온자료 없음'};
  if(!lim) return {key:'gray',label:'한계수온 없음'};
  const low=lim.low, high=lim.high;
  if((low!=null&&temp<low)||(high!=null&&temp>high)) return {key:'red',label:'위험'};
  const margin=2;
  if((low!=null&&temp<=low+margin)||(high!=null&&temp>=high-margin)) return {key:'yellow',label:'주의'};
  return {key:'green',label:'안전'};
}
function matchLimit(f){
  const preferred=String(f.limit_species||'').trim();
  if(preferred){const m=state.limits.find(x=>x.species===preferred);if(m)return m;}
  let s=String(f['양식물']||'').replace(/\s+/g,'');
  if(s.includes('우렁쉥이')) s='멍게'; else if(s.includes('전복')) s='참전복';
  return state.limits.find(x=>s.includes(x.species))||null;
}
function haversine(lat1,lon1,lat2,lon2){const p=Math.PI/180,dLat=(lat2-lat1)*p,dLon=(lon2-lon1)*p;const a=Math.sin(dLat/2)**2+Math.cos(lat1*p)*Math.cos(lat2*p)*Math.sin(dLon/2)**2;return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
function nearestStation(lat,lon){
  if(lat==null||lon==null||!state.risa.observations?.length)return null;
  let best=null,bestD=Infinity;
  for(const st of state.risa.observations){if(st.lat==null||st.lon==null)continue;const d=haversine(lat,lon,st.lat,st.lon);if(d<bestD){bestD=d;best=st;}}
  return best?{...best,distanceKm:bestD}:null;
}
function farmWeather(f){const station=nearestStation(f.lat,f.lon),limit=matchLimit(f),temp=station?.waterTempC??null;return {station,limit,temp,status:tempStatus(temp,limit,station)};}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function badge(s){return `<span class="badge ${s.key}">${s.label}</span>`;}
function initMap(){state.map=L.map('map',{zoomControl:true}).setView([35.6,128.0],7);L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{attribution:'© OpenStreetMap © CARTO',maxZoom:19}).addTo(state.map);state.markers=L.markerClusterGroup({chunkedLoading:true,showCoverageOnHover:false});state.map.addLayer(state.markers);}
function markerIcon(status){return L.divIcon({className:'',html:`<div class="marker-wrap"><div class="marker-dot ${status.key}"></div></div>`,iconSize:[18,18],iconAnchor:[9,9]});}
function addMarker(f){if(f.lat==null||f.lon==null)return;const wx=farmWeather(f);const m=L.marker([f.lat,f.lon],{icon:markerIcon(wx.status)});m.bindPopup(`<b>${escapeHtml(f['양식물']||'양식물 미기재')}</b><br>면허 ${escapeHtml(f['면허번호'])}<br>${wx.station?escapeHtml(wx.station.stationName):'관측소 없음'} · ${wx.temp==null?'자료없음':wx.temp+'℃'}<br>${wx.status.label}`);m.on('click',()=>showDetail(f));state.markers.addLayer(m);}
function showDetail(f){
  const wx=farmWeather(f),lim=wx.limit,st=wx.station,s=wx.status;
  const remain=wx.temp!=null&&lim?.high!=null?(lim.high-wx.temp).toFixed(1):null;
  document.getElementById('detail').innerHTML=`<div class="detail"><div class="panel-head" style="padding:0 0 12px"><div><h2>${escapeHtml(f['양식물']||'양식물 미기재')}</h2><div class="sub">면허 ${escapeHtml(f['면허번호'])}</div></div>${badge(s)}</div>
  <div class="kpi"><div class="box"><div class="label">현재 수온</div><div class="value">${wx.temp==null?'-':wx.temp+'℃'}</div></div><div class="box"><div class="label">고온 한계</div><div class="value">${lim?.high==null?'-':lim.high+'℃'}</div></div><div class="box"><div class="label">한계까지</div><div class="value">${remain==null?'-':remain+'℃'}</div></div><div class="box"><div class="label">관측소 거리</div><div class="value">${st?st.distanceKm.toFixed(1)+' km':'-'}</div></div></div>
  <div class="status ${s.key}">${s.label}${lim?` · ${escapeHtml(lim.species)} 한계수온과 비교`:''}</div>
  <table class="meta"><tr><th>시·도</th><td>${escapeHtml(f['시도'])}</td></tr><tr><th>시·군·구</th><td>${escapeHtml(f['시군구'])}</td></tr><tr><th>양식업종류</th><td>${escapeHtml(f['양식업종류'])}</td></tr><tr><th>양식물</th><td><b>${escapeHtml(f['양식물'])}</b></td></tr><tr><th>총면적</th><td>${escapeHtml(f['총면적']||'-')}</td></tr><tr><th>어장위치</th><td>${escapeHtml(f['어장위치'])}</td></tr><tr><th>도로명주소</th><td>${escapeHtml(f['도로명주소'])}</td></tr><tr><th>어업권자</th><td>${escapeHtml(f['어업권자'])}</td></tr><tr><th>면허기간</th><td>${escapeHtml(f['현재면허시작일'])} ~ ${escapeHtml(f['현재면허종료일'])}</td></tr><tr><th>NIFS 관측소</th><td>${st?escapeHtml(st.stationName):'매칭 없음'}</td></tr><tr><th>관측거리</th><td>${st?st.distanceKm.toFixed(2)+' km':'-'}</td></tr><tr><th>관측시각</th><td>${st?`${escapeHtml(st.obsDate)} ${escapeHtml(st.obsTime)}`:'-'}</td></tr><tr><th>관측수심</th><td>${st?.surfaceDepthM==null?'-':st.surfaceDepthM+' m'}</td></tr></table>
  ${st&&isStale(st)?'<p class="note warn">⚠ 이 관측소 자료는 3시간 이상 갱신되지 않아 안전판정에 사용하지 않았습니다.</p>':''}</div>`;
  document.getElementById('detail').classList.add('open');
}
function renderSummary(){let c={green:0,yellow:0,red:0,gray:0};for(const f of state.licenses)c[farmWeather(f).status.key]++;document.getElementById('summary').innerHTML=`<span>🟢 ${c.green.toLocaleString()}</span><span>🟡 ${c.yellow.toLocaleString()}</span><span>🔴 ${c.red.toLocaleString()}</span><span>⚪ ${c.gray.toLocaleString()}</span>`;}
function renderList(){const q=document.getElementById('search').value.trim().toLowerCase(),p=document.getElementById('province').value,sp=document.getElementById('species').value;state.filtered=state.licenses.filter(f=>{const text=[f['면허번호'],f['양식물'],f['시도'],f['시군구'],f['도로명주소'],f['어업권자']].filter(Boolean).join(' ').toLowerCase();return(!q||text.includes(q))&&(!p||f['시도']===p)&&(!sp||String(f['양식물']||'').includes(sp));});const box=document.getElementById('list');box.innerHTML='';state.filtered.slice(0,200).forEach(f=>{const wx=farmWeather(f),d=document.createElement('div');d.className='item';d.innerHTML=`<div class="row"><div class="name">${escapeHtml(f['양식물']||'미기재')}</div>${badge(wx.status)}</div><div class="sub">면허 ${escapeHtml(f['면허번호'])} · ${escapeHtml(f['시군구']||'')}</div><div class="sub">${wx.station?escapeHtml(wx.station.stationName):'관측소 없음'} · ${wx.temp==null?'-':wx.temp+'℃'} · ${wx.station?wx.station.distanceKm.toFixed(1)+'km':''}</div>`;d.onclick=()=>{if(f.lat!=null)state.map.setView([f.lat,f.lon],Math.max(state.map.getZoom(),11));showDetail(f);};box.appendChild(d);});document.getElementById('farmCount').textContent=`${state.filtered.length.toLocaleString()}건`;}
function buildFilters(){[...new Set(state.licenses.map(x=>x['시도']).filter(Boolean))].sort().forEach(v=>document.getElementById('province').add(new Option(v,v)));[...new Set(state.licenses.map(x=>x['양식물']).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'ko')).forEach(v=>{if(v!=='0')document.getElementById('species').add(new Option(v,v));});}
function renderLimits(){const q=document.getElementById('limitSearch').value.trim();document.getElementById('limitsTable').innerHTML=state.limits.filter(x=>!q||x.species.includes(q)).map(x=>`<tr><td>${x.species}</td><td>${x.habitat}</td><td>${x.optimal}</td><td>${x.low==null?'-':x.low+'℃'}</td><td>${x.high==null?'-':x.high+'℃'}</td></tr>`).join('');}
async function load(){const [lic,lim,risa]=await Promise.all([fetch(LICENSE_URL).then(r=>r.json()),fetch(LIMITS_URL).then(r=>r.json()),fetch(RISA_URL+'?v='+Date.now()).then(r=>r.json())]);state.licenses=lic;state.limits=lim;state.risa=risa||{observations:[],meta:{}};initMap();buildFilters();renderLimits();renderList();renderSummary();state.licenses.forEach(addMarker);const newest=[...(state.risa.observations||[])].filter(x=>x.obsDate&&x.obsTime).sort((a,b)=>`${b.obsDate} ${b.obsTime}`.localeCompare(`${a.obsDate} ${a.obsTime}`))[0];document.getElementById('updated').textContent=newest?`NIFS 표층수온 ${newest.obsDate} ${newest.obsTime} 기준 · ${state.risa.count||state.risa.observations.length}개소`:'실시간 수온 데이터 없음';}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');const tab=b.dataset.tab;document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));document.getElementById(tab==='map'?'mapView':tab==='limits'?'limitsView':'aboutView').classList.add('active');setTimeout(()=>state.map?.invalidateSize(),50);});
['search','province','species'].forEach(id=>document.getElementById(id).addEventListener(id==='search'?'input':'change',renderList));document.getElementById('searchBtn').onclick=renderList;document.getElementById('limitSearch').addEventListener('input',renderLimits);
load().catch(err=>{console.error(err);document.getElementById('updated').textContent='데이터 로드 오류';});
