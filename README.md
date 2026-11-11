# Jireh

주식 손익 계산기를 시작으로, 여러 주식 계산 도구를 한곳에서 쓰는 웹앱이에요.

배포 주소: https://jireh0905.github.io/StockCalculator/

- 첫 화면(홈)에서 기능을 고르고, 왼쪽 메뉴로 언제든 다른 기능으로 바꿀 수 있어요.
- 기능마다 고유 주소가 있어요. 예) `…/StockCalculator/#/average` → 물타기 계산기
- 입력값과 계산 기록은 **창(탭)이 열려 있는 동안만** 남아요. 다른 기능으로 이동하거나 새로고침해도 그대로이고,
  탭을 닫고 다시 접속하면 처음 상태로 시작해요. 메뉴 아래 "지금 모두 초기화"로 바로 지울 수도 있어요.
- 같은 메뉴 그룹(예: 계산기)의 기능끼리는 계산 기록을 함께 봐요. 기록 창 위쪽 칩으로 "이 기능만" 볼 수도 있고,
  다른 계산기의 기록을 누르면 그 계산기로 이동해서 값을 불러와요.
- 계산 결과를 다른 계산기로 바로 넘길 수 있어요. 물타기 결과의 "이 평단으로 이어서 계산"에서
  - **목표가 계산 →** 새 평단이 목표가 계산기의 매수가로 들어가요 (목표 수익률·수수료는 원래 값 유지).
  - **손익 계산 →** 새 평단(소수 둘째 자리까지)과 총 보유 수량이 손익 계산기(국내)로 들어가고,
    커서가 매도가 칸으로 가요. 매도가만 바꿔 보며 예상 순손익과 매도로 받을 돈을 볼 수 있어요.

## 폴더 구조

```
index.html              모든 화면이 함께 쓰는 틀 (왼쪽 메뉴, 상단 바, 기록 시트)
css/
  style.css             화면 꾸미기 (색상·배치·다크 모드)
js/
  app.js                시작점: 라우터(주소 → 화면), 공통 틀 연결
  features.js           기능 목록 (여기에 추가하면 메뉴·홈에 자동 표시)
  home.js               첫 화면: 기능 카드 + 이번 방문 기록
  shell/                공통 틀의 부품
    drawer.js             왼쪽 메뉴
    history-sheet.js      계산 기록 시트
    record-item.js        기록 한 줄 (시트·홈 공용)
  core/                 모든 기능이 함께 쓰는 도구
    session.js            이번 방문 동안의 저장소 (sessionStorage)
    number-input.js       숫자 입력칸: 자동 쉼표, 값 읽기·채우기
    format.js             숫자 포맷 (쉼표, 원화, 퍼센트)
    received.js           다른 기능에서 받은 값 표시 (칸 강조 + 알림)
    icons.js              메뉴·카드 아이콘
    toast.js              하단 알림
  features/             기능 하나 = 폴더 하나
    profit/               손익 계산기 (template·calculator·result-view·index)
    average/              물타기 계산기
    target/               목표가 계산기
serve.py                로컬 개발용 웹 서버 (2단계에서 Vite로 대체 예정)
```

화면이 바뀌는 흐름:

```
메뉴·카드 클릭 → 주소가 #/average로 바뀜 → app.js의 render()
   → features.js에서 'average' 기능을 찾음 → 그 기능의 mount()가 가운데 화면을 그림
```

계산 흐름 (기능 하나 안에서):

```
입력칸 ──(number-input.js)──▶ 입력값 ──(calculator.js)──▶ 결과 ──(화면 그리기)──▶ 화면
   │                                                      │
   └── 글자 입력할 때마다 ──┐            기록에 저장 ───┘
                            ▼                  ▼
                     core/session.js  →  sessionStorage
```

## 새 기능 추가하는 법

1. `js/features/<id>/` 폴더를 만들고 `average/`를 본떠 `index.js`(화면+연결)와 `calculator.js`(계산)를 만들어요.
2. `js/features.js`에서 import하고 `FEATURES` 목록에 넣어요. 끝 — 메뉴와 홈 카드에 저절로 나타나요.

## 기능끼리 값 넘기기

보내는 기능은 받는 기능의 저장 모양을 몰라도 돼요. 받는 기능이 `receive()`로 "무엇을 받을지"를 직접 정해요.

```
보내는 쪽 (average/index.js)        ctx.sendTo('target', { buyPrice: 47333 })
        │
        ▼
app.js sendTo()                     1. target.receive(지금 입력값, 받은 값) → 새 입력값 저장
                                    2. #/target 으로 이동
        │
        ▼
받는 쪽 (target/index.js)            receive(): 매수가만 바꾼 입력값을 돌려줌
                                    mount(): ctx.received가 있으면 매수가 칸 강조 + 알림 (core/received.js)
```

다른 기능도 값을 받게 하려면 그 기능의 `index.js`에 `receive(inputs, payload)`만 추가하면 돼요.
`app.js`는 고칠 필요가 없어요. 손익 계산기(`profit/index.js`)도 이렇게 `receive()`만 더해서 연결했어요.

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
   - ✅ 1.5 여러 기능 앱으로 확장 (SPA 라우터, 왼쪽 메뉴, 세션 저장소)
2. 개발 도구 도입 (Node.js, npm, Vite, 자동 배포)
3. 테스트와 TypeScript
4. React로 전환하고 계산기 늘리기
5. PWA (홈 화면 설치, 오프라인)
6. 서버·API·데이터베이스 (실시간 환율, 기록 동기화)
7. 안드로이드·iOS 앱 (Capacitor)
