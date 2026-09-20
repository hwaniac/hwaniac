HWANIAC v3
- 기존 NIFS GitHub Actions는 그대로 유지하세요.
- 이번 패키지에서 교체할 파일: index.html, js/app.js, css/app.css
- 기존 data/licenses.json, data/temperature-limits.json, data/risa-latest.json은 그대로 사용합니다.
- risa-latest.json의 현재 observations 스키마에 맞게 수정했습니다.
- 양식장별 가장 가까운 NIFS 관측소, 거리, 표층수온, 한계수온, 신호등을 표시합니다.
- 3시간 이상 오래된 관측자료는 '관측 지연'(회색) 처리합니다.
- 노란색 주의(한계까지 2℃ 이내)는 공식 경보 기준이 아닌 임시 UI 규칙입니다.
