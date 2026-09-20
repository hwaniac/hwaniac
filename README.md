# HWANIAC 1차 프로토타입

이 프로젝트는 사용자가 제공한 `면허정보.xlsx`와 주요 양식품종 한계수온 자료를 바탕으로,
양식장 위치 + 양식품목 + 국립수산과학원 실시간 수온 + 한계수온 비교 + 신호등 상태를 한 화면에서 확인하기 위한 독립형 GitHub Pages 사이트입니다.

## 1. 포함 데이터
- `data/licenses.json`: Excel `면허정보` + `좌표정보`를 합친 12,312개 레코드
- `data/temperature-limits.json`: 14개 주요 품종의 한계수온
- `data/risa-latest.json`: NIFS 실시간 수온의 저장본(초기에는 비어 있음)

## 2. 실시간 수온 연결
NIFS Open API 키가 필요합니다.
GitHub 저장소의 Settings > Secrets and variables > Actions에서:
- Secret name: `NIFS_API_KEY`
- Secret value: 발급받은 NIFS 인증키

그 다음 Actions에서 `Update NIFS real-time sea temperature`를 수동 실행하면
`data/risa-latest.json`이 생성되고 이후 30분마다 갱신됩니다.

## 3. 현재 신호등 규칙
- 녹색: 한계수온 범위 안쪽
- 노랑: 저온/고온 한계수온까지 2℃ 이내
- 빨강: 한계수온을 벗어남
- 회색: 실시간 수온 또는 매칭되는 한계수온이 없음

노란색 2℃ 구간은 현재 프로토타입용 운영규칙이며 공식 경보 기준을 의미하지 않습니다.

## 4. 양식장-수온 매칭
각 양식장 대표 위치(좌표의 평균 중심점)와 가장 가까운 NIFS 실시간 관측소를 매칭하고,
표층 수온(`obs_lay=1`)을 사용합니다.

## 5. 주의
NIFS 실시간 관측자료는 최종 품질관리가 적용되지 않은 자료입니다. 서비스 화면에도 관측시각과 출처를 표시하는 것을 권장합니다.
