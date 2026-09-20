import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# ============================================================
# HWANIAC - NIFS 통합 수온관측망 수집기
#
# 1순위:
# NIFS 실시간 해양수산환경 관측시스템 통합 지도
# selectMainMiniMap.do
#
# 실패 시:
# 기존 NIFS OpenAPI(risaCode / risaList)를 fallback으로 사용
# ============================================================

INTEGRATED_URL = (
    "https://www.nifs.go.kr/"
    "risa/risa/risaE/selectMainMiniMap.do"
)

OPENAPI_URL = "https://www.nifs.go.kr/OpenAPI_json"

KEY = os.environ.get("NIFS_API_KEY", "").strip()

OUT = Path("data")
OUT.mkdir(exist_ok=True)


def fnum(value):
    """문자열 숫자를 float로 변환. 빈 값은 None."""
    try:
        if value is None:
            return None
        value = str(value).strip()
        if value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


# ------------------------------------------------------------
# 통합 관측망 호출
# ------------------------------------------------------------

def fetch_integrated():
    print("Trying NIFS integrated observation network...")

    # 개발자도구에서 확인한 요청은
    # POST + Content-Length 0 형태였습니다.
    req = urllib.request.Request(
        INTEGRATED_URL,
        data=b"",
        method="POST",
        headers={
            "User-Agent": (
                "Mozilla/5.0 (compatible; "
                "HWANIAC-WaterTemperature/1.0)"
            ),
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": (
                "https://www.nifs.go.kr/"
                "risa/risa/risaE/actionRisaMap.do"
            ),
        },
    )

    with urllib.request.urlopen(req, timeout=60) as response:
        raw = response.read().decode("utf-8-sig")

    try:
        obj = json.loads(raw)
    except Exception:
        print("Integrated response was not valid JSON.", file=sys.stderr)
        print(raw[:1500], file=sys.stderr)
        raise

    observation_list = obj.get("obsvtrList")

    if not isinstance(observation_list, list):
        raise RuntimeError(
            "Integrated response does not contain obsvtrList."
        )

    print(
        f"Integrated raw observation count = "
        f"{len(observation_list)}"
    )

    if len(observation_list) == 0:
        raise RuntimeError("Integrated observation list is empty.")

    return observation_list


def convert_integrated(rows):
    """
    NIFS 통합지도 형식을 HWANIAC 형식으로 변환.
    수온이 없는 관측소도 stations에는 보존.
    """

    stations = []
    observations = []

    seen_codes = set()

    for x in rows:

        code = str(x.get("obsvtrCd") or "").strip()

        if not code:
            continue

        # 같은 코드가 혹시 중복될 경우 한 번만 처리
        if code in seen_codes:
            continue

        seen_codes.add(code)

        name = str(x.get("obsvtrKornNm") or "").strip()

        lat = fnum(x.get("lat"))
        lon = fnum(x.get("lot"))

        sea_area = str(x.get("obsrvnGroupNm") or "").strip()

        organization = str(
            x.get("otsdInstOgdp") or ""
        ).strip()

        surface = fnum(x.get("sTmp"))
        middle = fnum(x.get("mTmp"))
        bottom = fnum(x.get("dTmp"))

        observed_at = str(
            x.get("obsrvnDt") or ""
        ).strip()

        repair = str(
            x.get("rprYn") or ""
        ).strip()

        data_type = str(
            x.get("datSe") or ""
        ).strip()

        salinity = fnum(x.get("slnty"))
        dissolved_oxygen = fnum(x.get("doxn"))
        air_temp = fnum(x.get("atem"))

        # ------------------------------
        # 전체 관측소 정보
        # ------------------------------

        station = {
            "stationCode": code,
            "stationName": name,
            "seaArea": sea_area,
            "organization": organization,
            "lat": lat,
            "lon": lon,

            "surfaceTempAvailable": surface is not None,
            "middleTempAvailable": middle is not None,
            "bottomTempAvailable": bottom is not None,

            "underInspection": repair,
            "dataType": data_type,
        }

        stations.append(station)

        # ------------------------------
        # 최신 관측자료
        #
        # 사용자가 요청한 정책:
        # 3시간 이상 지연되어도 값이 있으면 사용.
        #
        # 따라서 시간 기준으로 제거하지 않음.
        # ------------------------------

        if surface is not None:

            observations.append({
                "stationCode": code,
                "stationName": name,

                "waterTempC": surface,
                "surfaceTempC": surface,
                "middleTempC": middle,
                "bottomTempC": bottom,

                "observedAt": observed_at,

                # 기존 대시보드와의 호환을 위해
                # obsDate / obsTime도 생성
                "obsDate": (
                    observed_at[:10].replace("/", "-")
                    if len(observed_at) >= 10
                    else ""
                ),
                "obsTime": (
                    observed_at[11:16]
                    if len(observed_at) >= 16
                    else ""
                ),

                "seaArea": sea_area,
                "organization": organization,

                "lat": lat,
                "lon": lon,

                "salinity": salinity,
                "dissolvedOxygen": dissolved_oxygen,
                "airTempC": air_temp,

                "underInspection": repair,
                "dataType": data_type,
            })

    stations.sort(
        key=lambda x: (
            x.get("stationName") or "",
            x.get("stationCode") or "",
        )
    )

    observations.sort(
        key=lambda x: (
            x.get("stationName") or "",
            x.get("stationCode") or "",
        )
    )

    return stations, observations


# ------------------------------------------------------------
# 기존 NIFS OpenAPI
# 통합망 호출 실패 시에만 사용
# ------------------------------------------------------------

def get_openapi_json(params):

    url = OPENAPI_URL + "?" + urllib.parse.urlencode(params)

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "hwaniac-github-actions/3.0"
        },
    )

    with urllib.request.urlopen(req, timeout=60) as response:
        raw = response.read().decode("utf-8-sig")

    return json.loads(raw)


def find_items(obj):

    found = []

    def walk(x):

        if isinstance(x, dict):

            for key, value in x.items():

                if key.lower() == "item":

                    if isinstance(value, list):
                        found.extend(value)

                    elif isinstance(value, dict):
                        found.append(value)

                else:
                    walk(value)

        elif isinstance(x, list):

            for value in x:
                walk(value)

    walk(obj)

    return found


def fetch_openapi_fallback():

    if not KEY:
        raise RuntimeError(
            "Integrated network failed and "
            "NIFS_API_KEY is unavailable."
        )

    print("Using NIFS OpenAPI fallback...")

    stations_raw = get_openapi_json({
        "id": "risaCode",
        "key": KEY,
        "use_yn": "Y",
    })

    obs_raw = get_openapi_json({
        "id": "risaList",
        "key": KEY,
    })

    station_items = find_items(stations_raw)
    observation_items = find_items(obs_raw)

    print(
        f"Fallback risaCode count = "
        f"{len(station_items)}"
    )

    print(
        f"Fallback risaList count = "
        f"{len(observation_items)}"
    )

    stations = []

    for x in station_items:

        code = str(
            x.get("sta_cde") or ""
        ).strip()

        lat = fnum(x.get("lat"))
        lon = fnum(x.get("lon"))

        if not code:
            continue

        stations.append({
            "stationCode": code,
            "stationName": x.get("sta_nam_kor"),
            "seaArea": x.get("gru_nam"),
            "organization": "국립수산과학원",
            "lat": lat,
            "lon": lon,
            "surfaceTempAvailable": (
                x.get("sur_tmp_yn") == "Y"
            ),
            "middleTempAvailable": None,
            "bottomTempAvailable": None,
            "underInspection": None,
            "dataType": "OpenAPI",
        })

    station_map = {
        s["stationCode"]: s
        for s in stations
    }

    latest_by_station = {}

    for x in observation_items:

        # 표층만 사용
        if str(x.get("obs_lay") or "").strip() != "1":
            continue

        code = str(
            x.get("sta_cde") or ""
        ).strip()

        temp = fnum(x.get("wtr_tmp"))

        if not code or temp is None:
            continue

        row = {
            "stationCode": code,
            "stationName": x.get("sta_nam_kor"),

            "waterTempC": temp,
            "surfaceTempC": temp,
            "middleTempC": None,
            "bottomTempC": None,

            "obsDate": x.get("obs_dat"),
            "obsTime": x.get("obs_tim"),

            "observedAt": (
                f"{x.get('obs_dat') or ''} "
                f"{x.get('obs_tim') or ''}"
            ).strip(),

            "organization": "국립수산과학원",

            "underInspection": x.get("rpr_yn"),
            "statusCode": x.get("repaire_gbn"),

            "salinity": None,
            "dissolvedOxygen": None,
            "airTempC": None,
            "dataType": "OpenAPI",
        }

        stamp = (
            str(row.get("obsDate") or ""),
            str(row.get("obsTime") or ""),
        )

        old = latest_by_station.get(code)

        if old:
            old_stamp = (
                str(old.get("obsDate") or ""),
                str(old.get("obsTime") or ""),
            )
        else:
            old_stamp = ("", "")

        if old is None or stamp >= old_stamp:
            latest_by_station[code] = row

    observations = []

    for code, row in latest_by_station.items():

        station = station_map.get(code, {})

        row.update({
            "lat": station.get("lat"),
            "lon": station.get("lon"),
            "seaArea": station.get("seaArea"),
        })

        observations.append(row)

    return stations, observations


# ------------------------------------------------------------
# 실행
# ------------------------------------------------------------

source_mode = "NIFS integrated observation network"

try:

    integrated_rows = fetch_integrated()

    stations, observations = convert_integrated(
        integrated_rows
    )

except Exception as exc:

    print(
        f"Integrated network failed: {exc}",
        file=sys.stderr,
    )

    print(
        "Falling back to NIFS OpenAPI...",
        file=sys.stderr,
    )

    source_mode = "NIFS OpenAPI fallback"

    stations, observations = fetch_openapi_fallback()


# ------------------------------------------------------------
# 결과 검사
# ------------------------------------------------------------

stations_with_coordinates = sum(
    1
    for x in stations
    if x.get("lat") is not None
    and x.get("lon") is not None
)

stations_with_surface_temp = len(observations)


meta = {
    "source": source_mode,

    "generatedAtUTC": (
        datetime.now(timezone.utc).isoformat()
    ),

    "layer": "surface",

    "stationCount": len(stations),

    "stationsWithCoordinates": (
        stations_with_coordinates
    ),

    "stationsWithSurfaceTemperature": (
        stations_with_surface_temp
    ),

    "stalePolicy": (
        "Available temperature values are retained "
        "regardless of observation age. "
        "The actual observation time must be displayed."
    ),

    "qualityNotice": (
        "Real-time observation data may not have "
        "undergone final quality control."
    ),
}


# ------------------------------------------------------------
# JSON 저장
# ------------------------------------------------------------

stations_output = {
    "meta": meta,
    "count": len(stations),
    "stations": stations,
}

latest_output = {
    "meta": meta,
    "count": len(observations),
    "observations": observations,
}


(OUT / "risa-stations.json").write_text(
    json.dumps(
        stations_output,
        ensure_ascii=False,
        indent=2,
    ),
    encoding="utf-8",
)


(OUT / "risa-latest.json").write_text(
    json.dumps(
        latest_output,
        ensure_ascii=False,
        indent=2,
    ),
    encoding="utf-8",
)


print("")
print("========================================")
print("HWANIAC NIFS collection completed")
print("========================================")
print(f"Source = {source_mode}")
print(f"Stations = {len(stations)}")
print(
    f"Stations with coordinates = "
    f"{stations_with_coordinates}"
)
print(
    f"Stations with surface temperature = "
    f"{stations_with_surface_temp}"
)
print("========================================")
