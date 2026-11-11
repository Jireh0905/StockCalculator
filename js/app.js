/**
 * app.js — 앱의 시작점 (MFC의 CMainFrame 역할)
 *
 * 하는 일:
 *  1. 라우터: 주소 뒤의 #/average 같은 부분을 보고 어떤 화면을 그릴지 정해요.
 *     → 페이지는 index.html 하나뿐이고, 가운데 <main>의 내용만 바꿔 끼워요 (SPA).
 *  2. 공통 틀 연결: 왼쪽 메뉴, 상단 바, 기록 시트
 *  3. 각 기능에 저장 도구(ctx)를 넘겨주기 → 기능은 저장 방식(sessionStorage)을 몰라도 돼요.
 *
 * 파일 관계:
 *   app.js ─┬─ features.js ........ 기능 목록 → features/<id>/index.js
 *           ├─ home.js ............ 첫 화면
 *           ├─ shell/drawer.js .... 왼쪽 메뉴
 *           ├─ shell/history-sheet.js  기록 시트
 *           └─ core/ .............. 저장소(session), 숫자 포맷, 알림 등 공통 도구
 */
import { FEATURES } from './features.js';
import { renderHome } from './home.js';
import { setupDrawer, renderNav, closeDrawer } from './shell/drawer.js';
import { setupHistorySheet, renderHistory, closeSheet } from './shell/history-sheet.js';
import * as session from './core/session.js';
import { showToast } from './core/toast.js';

const APP_NAME = 'Jireh';
const $ = (id) => document.getElementById(id);

/** 지금 보고 있는 기능 (홈이면 null) */
let current = null;
/** 지금 화면을 그리고 있는 요소 (<main> 안에 하나) */
let page = null;

function showHome() {
    renderHome(page, { features: FEATURES, records: session.getRecords(), onSelect: openRecord });
}

/* ---------- 라우터 ---------- */

/** 주소의 #/ 뒤 글자로 기능을 찾아요. 없거나 준비 중이면 null(홈) */
function findRoute() {
    const id = location.hash.replace(/^#\/?/, '');
    return FEATURES.find(f => f.id === id && f.mount) ?? null;
}

/** 주소에 맞는 화면을 그려요 */
function render() {
    current = findRoute();
    if (!current && location.hash && location.hash !== '#/') {
        history.replaceState(null, '', '#/'); // 잘못된 주소는 홈 주소로 바로잡기
    }

    // 화면마다 새 <div>를 만들어 통째로 갈아 끼워요.
    // 예전 화면의 요소와 거기 연결된 이벤트는 함께 버려져서, 이벤트가 쌓이지 않아요.
    // (MFC에서 뷰를 바꿀 때 이전 뷰 창을 DestroyWindow 하는 것과 같아요)
    page = document.createElement('div');
    page.className = 'page';
    $('view').replaceChildren(page);

    if (current) {
        $('pageTitle').textContent = current.name;
        document.title = `${current.name} · ${APP_NAME}`;
        current.mount(page, createContext(current.id));
    } else {
        $('pageTitle').textContent = APP_NAME;
        document.title = APP_NAME;
        showHome();
    }

    document.body.dataset.page = current ? 'feature' : 'home'; // 상단 바 버튼 전환용 (CSS)
    renderNav(FEATURES, current ? current.id : 'home');
    refreshHistory();
    closeDrawer();
    closeSheet();
    window.scrollTo(0, 0);
}

/** 기능에게 넘겨줄 저장 도구 */
function createContext(featureId) {
    return {
        inputs: session.getInputs(featureId),
        saveInputs: (value) => session.setInputs(featureId, value),
        addRecord: (record) => {
            session.addRecord(featureId, record);
            showToast('기록에 저장했어요');
        },
    };
}

/* ---------- 기록 ---------- */

/** 기록을 누르면: 그 기능의 입력값을 기록 당시로 되돌리고 그 화면으로 이동 */
function openRecord(record) {
    session.setInputs(record.feature, structuredClone(record.data));
    const hash = `#/${record.feature}`;
    if (location.hash === hash) render();   // 이미 그 화면이면 다시 그리기
    else location.hash = hash;              // 주소가 바뀌면 hashchange → render()
}

/**
 * 기록 시트의 보기 범위: 'group' = 같은 그룹(예: 계산기) 전체, 'feature' = 지금 기능만
 * 기능을 옮겨 다녀도 고른 범위는 유지돼요.
 */
let historyScope = 'group';

/** 지금 기능과 같은 그룹의 기능 id 목록 */
function groupFeatureIds() {
    return FEATURES.filter(f => f.group === current.group && f.mount).map(f => f.id);
}

/** 지금 범위에 해당하는 기능 id 목록 */
function scopeFeatureIds() {
    return historyScope === 'group' ? groupFeatureIds() : [current.id];
}

/** 기록 왼쪽 위 글씨: "손익 · 국내 · 09:41"의 앞부분 */
function recordLabel(record) {
    const feature = FEATURES.find(f => f.id === record.feature);
    return [feature?.shortName ?? record.feature, record.sub].filter(Boolean).join(' · ');
}

/** 상단 기록 버튼의 숫자와 시트(칩·목록) 갱신 */
function refreshHistory() {
    if (!current) {
        renderHistory({ scopes: [], scope: '', records: [], labelOf: recordLabel, onScope() {}, onSelect: openRecord, onDelete() {} });
        return;
    }
    renderHistory({
        scopes: [
            { id: 'group', label: `${current.group} 전체`, count: session.getRecords(groupFeatureIds()).length },
            { id: 'feature', label: '이 기능만', count: session.getRecords(current.id).length },
        ],
        scope: historyScope,
        records: session.getRecords(scopeFeatureIds()),
        labelOf: recordLabel,
        onScope: (id) => {
            historyScope = id;
            refreshHistory();
        },
        // 다른 기능의 기록이면 그 계산기로 이동해서 불러와요
        onSelect: openRecord,
        onDelete: (record) => session.removeRecord(record.id),
    });
}

/** "전체 삭제": 지금 보이는 범위만 지워요 */
function clearVisibleRecords() {
    const ids = scopeFeatureIds();
    const count = session.getRecords(ids).length;
    const what = historyScope === 'group' ? `${current.group} 기록` : `${current.name} 기록`;
    if (confirm(`${what} ${count}개를 모두 지울까요?`)) session.clearRecords(ids);
}

/* ---------- 시작 ---------- */
setupDrawer({
    onReset: () => {
        session.resetAll();
        render();
        showToast('모두 초기화했어요');
    },
});
setupHistorySheet({ onClear: clearVisibleRecords });

// 기록이 바뀔 때마다: 기록 버튼·시트 갱신, 홈이면 목록도 다시 그리기
session.subscribe(() => {
    refreshHistory();
    if (!current) showHome();
});

window.addEventListener('hashchange', render); // 메뉴·카드·뒤로가기 → 주소 변경 → 화면 교체
render();
