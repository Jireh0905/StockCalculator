# 주식 손익 계산기

국내·해외 주식의 수수료와 세금을 반영해서 매매 손익을 계산하는 웹앱이에요.

배포 주소: https://jireh0905.github.io/StockCalculator/

## 폴더 구조

```
index.html          화면의 뼈대 (HTML)
css/
  style.css         화면 꾸미기 (색상·배치·다크 모드)
js/
  main.js           시작점: 상태 관리와 모듈 연결
  calculator.js     계산 공식 (화면과 무관한 순수 함수)
  format.js         숫자 포맷 (쉼표, 원화, 퍼센트)
  form.js           입력칸 읽기·채우기·자동 쉼표
  result-view.js    결과 카드 그리기
  history-view.js   계산 기록 시트 그리기
  storage.js        브라우저(localStorage)에 기록 저장
  toast.js          하단 알림
serve.py            로컬 개발용 웹 서버 (2단계에서 Vite로 대체 예정)
```

데이터 흐름:

```
입력칸 ──(form.js)──▶ 입력값 ──(calculator.js)──▶ 결과 ──(result-view.js)──▶ 화면
                                                    │
                                     기록에 저장 ───┴──(storage.js)──▶ localStorage
```

## 로컬에서 실행하기

JavaScript 모듈(`<script type="module">`)은 보안 규칙 때문에
`index.html`을 **더블클릭해서 열면 동작하지 않아요** (`file://` 주소에서는 모듈을 불러올 수 없음).
아래 방법 중 하나로 간단한 로컬 서버를 띄워서 열어야 해요.

**방법 1. Python** (이 폴더에서 실행)

```bash
py serve.py
```

브라우저에서 http://localhost:8000 접속 (끝내려면 터미널에서 Ctrl+C)

> `py -m http.server`를 그대로 쓰면 Windows에서는 `.js` 파일이 `text/plain` 형식으로 전달돼서
> 모듈이 실행되지 않을 수 있어요. `serve.py`는 이 문제를 바로잡은 버전이에요.

**방법 2. VS Code 확장 "Live Server"**

`index.html`을 연 상태에서 오른쪽 아래 **Go Live** 클릭 → 저장할 때마다 자동 새로고침

## 공부 단계

1. ✅ 파일 분리와 모듈화
2. 개발 도구 도입 (Node.js, npm, Vite, 자동 배포)
3. 테스트와 TypeScript
4. React로 전환하고 계산기 늘리기
5. PWA (홈 화면 설치, 오프라인)
6. 서버·API·데이터베이스 (실시간 환율, 기록 동기화)
7. 안드로이드·iOS 앱 (Capacitor)
