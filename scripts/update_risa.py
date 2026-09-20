import json, os, math, urllib.request
from datetime import datetime, timezone

KEY=os.environ.get("NIFS_API_KEY")
if not KEY:
    raise SystemExit("NIFS_API_KEY secret is not set")

BASE="https://www.nifs.go.kr/OpenAPI_json"
def get_json(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))

def items(obj):
    if isinstance(obj, dict):
        # Common OpenAPI shapes: response.body.items.item / body.items / items / item
        for k in ("item","items","Item","data","result"):
            if k in obj:
                x=obj[k]
                if isinstance(x,list): return x
                if isinstance(x,dict): return items(x)
        for v in obj.values():
            x=items(v)
            if x: return x
    elif isinstance(obj,list):
        return obj
    return []

code=get_json(f"{BASE}?id=risaCode&key={KEY}&use_yn=Y")
obs=get_json(f"{BASE}?id=risaList&key={KEY}")
code_items=items(code); obs_items=items(obs)

stations={}
for x in code_items:
    code=str(x.get("sta_cde","")).strip()
    if not code: continue
    try: lat=float(x.get("lat")); lon=float(x.get("lon"))
    except: continue
    stations[code]={
        "code":code,
        "name":x.get("sta_nam_kor") or code,
        "region":x.get("gru_nam"),
        "lat":lat,"lon":lon
    }

# Keep latest surface observation per station.
latest={}
for x in obs_items:
    code=str(x.get("sta_cde","")).strip()
    if not code or code not in stations: continue
    if str(x.get("obs_lay","")).strip() not in ("1","1.0"): continue
    try: temp=float(x.get("wtr_tmp"))
    except: continue
    obs_at=f'{x.get("obs_dat","")} {x.get("obs_tim","")}'.strip()
    prev=latest.get(code)
    if prev is None or obs_at > prev["obsAt"]:
        latest[code]={"surfaceTemp":temp,"obsAt":obs_at,"rprYn":x.get("rpr_yn"),"status":x.get("repaire_gbn")}

out=[]
for code, st in stations.items():
    row=dict(st); row.update(latest.get(code,{"surfaceTemp":None,"obsAt":None,"rprYn":None,"status":None}))
    out.append(row)

payload={
    "updatedAt":datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M"),
    "source":"국립수산과학원 실시간 해양수산환경 관측시스템",
    "stations":out
}
with open("data/risa-latest.json","w",encoding="utf-8") as f:
    json.dump(payload,f,ensure_ascii=False,separators=(",",":"))
print(f"wrote {len(out)} stations")
