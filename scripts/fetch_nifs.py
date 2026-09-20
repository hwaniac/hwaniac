import json, os, sys, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = 'https://www.nifs.go.kr/OpenAPI_json'
KEY = os.environ.get('NIFS_API_KEY','').strip()
if not KEY:
    raise SystemExit('NIFS_API_KEY secret is missing')

OUT = Path('data')
OUT.mkdir(exist_ok=True)

def get_json(params):
    url = BASE + '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent':'hwaniac-github-actions/2.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read().decode('utf-8-sig')
    try:
        return json.loads(raw)
    except Exception:
        print(raw[:1000], file=sys.stderr)
        raise

def items(obj):
    # NIFS responses can vary in wrapper naming; recursively locate Item arrays/objects.
    found=[]
    def walk(x):
        if isinstance(x, dict):
            for k,v in x.items():
                if k.lower() == 'item':
                    if isinstance(v,list): found.extend(v)
                    elif isinstance(v,dict): found.append(v)
                else: walk(v)
        elif isinstance(x,list):
            for v in x: walk(v)
    walk(obj)
    return found

def fnum(v):
    try: return float(v)
    except (TypeError,ValueError): return None

stations_raw = get_json({'id':'risaCode','key':KEY,'use_yn':'Y'})
obs_raw = get_json({'id':'risaList','key':KEY})

stations=[]
for x in items(stations_raw):
    code=str(x.get('sta_cde','')).strip()
    lat=fnum(x.get('lat')); lon=fnum(x.get('lon'))
    if not code or lat is None or lon is None: continue
    stations.append({
        'stationCode':code, 'stationName':x.get('sta_nam_kor'), 'seaArea':x.get('gru_nam'),
        'lat':lat, 'lon':lon, 'surfaceDepthM':fnum(x.get('sur_dep')),
        'surfaceTempAvailable':x.get('sur_tmp_yn'), 'description':x.get('sta_des')
    })

latest_by_station={}
for x in items(obs_raw):
    if str(x.get('obs_lay','')).strip() != '1': continue
    code=str(x.get('sta_cde','')).strip()
    temp=fnum(x.get('wtr_tmp'))
    if not code or temp is None: continue
    row={
        'stationCode':code, 'stationName':x.get('sta_nam_kor'), 'waterTempC':temp,
        'obsDate':x.get('obs_dat'), 'obsTime':x.get('obs_tim'),
        'statusCode':x.get('repaire_gbn'), 'underInspection':x.get('rpr_yn')
    }
    stamp=(str(row['obsDate'] or ''), str(row['obsTime'] or ''))
    old=latest_by_station.get(code)
    oldstamp=(str(old.get('obsDate') or ''), str(old.get('obsTime') or '')) if old else ('','')
    if old is None or stamp >= oldstamp: latest_by_station[code]=row

station_map={s['stationCode']:s for s in stations}
latest=[]
for code,row in latest_by_station.items():
    s=station_map.get(code,{})
    row.update({'lat':s.get('lat'),'lon':s.get('lon'),'seaArea':s.get('seaArea'),'surfaceDepthM':s.get('surfaceDepthM')})
    latest.append(row)
latest.sort(key=lambda x:(x.get('stationName') or '',x['stationCode']))
stations.sort(key=lambda x:(x.get('stationName') or '',x['stationCode']))

meta={'source':'NIFS Real-time Marine Fisheries Environment Observation System','generatedAtUTC':datetime.now(timezone.utc).isoformat(),'layer':'surface (obs_lay=1)','qualityNotice':'Real-time observation data may not have undergone final quality control.'}
(OUT/'risa-stations.json').write_text(json.dumps({'meta':meta,'count':len(stations),'stations':stations},ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'risa-latest.json').write_text(json.dumps({'meta':meta,'count':len(latest),'observations':latest},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'risaCode raw Item count = {len(items(stations_raw))}')
print(f'risaList raw Item count = {len(items(obs_raw))}')
print(f'Wrote {len(stations)} stations and {len(latest)} latest surface observations')
