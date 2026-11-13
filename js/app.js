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
import { renderMarketBar, MARKETS, isGlobal, useRate } from './core/market.js';
import { setupMoneyInputs } from './core/money-input.js';

const APP_NAME = 'Jireh';

/** 이름이 바뀐 기능의 예전 id → 지금 id (예전 주소·기록도 열리게) */
const ALIASES = { average: 'split' };
const featureById = (id) => FEATURES.find(f => f.id === (ALIASES[id] ?? id) && f.mount) ?? null;
const $ = (id) => document.getElementById(id);

/** 지금 보고 있는 기능 (홈이면 null) */
let current = null;
/** 지금 화면을 그리고 있는 요소 (<main> 안에 하나) */
let page = null;
/** 다른 기능이 방금 넘겨준 값 (도착한 화면이 그려질 때 한 번만 쓰고 비워요) */
let pendingReceived = null;

function showHome() {
    renderHome(page, {
        features: FEATURES,
        records: session.getRecords(),
        labelOf: (record) => recordLabel(record, 'name'), // 홈에서는 "손익 계산기 · 해외"처럼 전체 이름
        onSelect: openRecord,
    });
}

/* ---------- 라우터 ---------- */

/** 주소의 #/ 뒤 글자로 기능을 찾아요. 없거나 준비 중이면 null(홈) */
function findRoute() {
    const id = location.hash.replace(/^#\/?/, '');
    if (ALIASES[id]) history.replaceState(null, '', `#/${ALIASES[id]}`); // 예: #/average → #/split
    return featureById(id);
}

/**
 * 주소에 맞는 화면을 그려요
 * @param {{ keepScroll?: boolean }} [options] - keepScroll: 같은 화면을 다시 그릴 때 스크롤 위치 유지 ([$ | 원], 기준 환율)
 */
function render({ keepScroll = false } = {}) {
    const scrollY = window.scrollY;
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

    // 넘겨받은 값은 그 기능 화면에 도착했을 때 한 번만 알려줘요
    const received = pendingReceived && current && pendingReceived.to === current.id ? pendingReceived : null;
    pendingReceived = null;

    if (current) {
        $('pageTitle').textContent = current.name;
        document.title = `${current.name} · ${APP_NAME}`;
        let root = page;
        // 국내/해외를 쓰는 기능: 맨 위에 선택 버튼, 그 아래에 기능 화면
        if (current.markets) {
            const bar = document.createElement('div');
            root = document.createElement('div');
            page.append(bar, root);
            renderMarketBar(bar, session.getMarket(), (market) => {
                session.setMarket(market);
                render(); // 같은 기능을 새 시장으로 다시 그려요 (입력값은 시장마다 따로 기억)
            }, (rate, date) => {
                session.setFx(rate, date);
                render({ keepScroll: true }); // 새 기준 환율로 입력 안내·결과를 다시
                showToast(date
                    ? `${date.slice(5).replace('-', '/')} 환율 ${rate.toLocaleString('ko-KR')}원을 넣었어요`
                    : '기준 환율을 바꿨어요');
            });
        }
        useRate(null); // 원화 환산 환율은 기준 환율에서 시작 (기능이 자기 환율을 정하면 바꿔요)
        current.mount(root, createContext(current, received));
        // 해외 달러 칸에 $/₩ 버튼 (원화로 넣으면 기준 환율로 나눠 달러로 넣어요)
        if (current.fx && isGlobal(session.getMarket())) setupMoneyInputs(root, current.id);
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
    window.scrollTo(0, keepScroll ? scrollY : 0);
}

/* ---------- 입력값 (국내/해외를 쓰는 기능은 시장별로 나눠 저장) ---------- */

/** 기능이 쓰는 시장: 국내/해외를 쓰는 기능이면 지금 고른 시장, 아니면 null */
const marketFor = (feature) => (feature.markets ? session.getMarket() : null);

function getFeatureInputs(feature, market) {
    const all = session.getInputs(feature.id);
    return market ? (all?.[market] ?? null) : all;
}

function setFeatureInputs(feature, market, value) {
    session.setInputs(feature.id, market ? { ...session.getInputs(feature.id), [market]: value } : value);
}

/**
 * 기능에게 넘겨줄 도구
 * 기능은 시장별 저장을 몰라도 돼요. ctx.inputs는 이미 지금 시장의 입력값이에요.
 * @param {object} feature
 * @param {{ from: object, payload: object } | null} received - 다른 기능이 방금 넘겨준 값 (없으면 null)
 */
function createContext(feature, received = null) {
    const market = marketFor(feature);
    return {
        market,
        inputs: getFeatureInputs(feature, market),
        saveInputs: (value) => setFeatureInputs(feature, market, value),
        addRecord: (record) => {
            session.addRecord(feature.id, { ...record, market });
            showToast('기록에 저장했어요');
        },
        sendTo: (targetId, payload) => sendTo(feature.id, targetId, payload),
        received,
    };
}

/* ---------- 기능끼리 값 넘기기 ---------- */

/**
 * fromId 기능이 targetId 기능에게 값을 넘기고, 그 화면으로 이동해요.
 *
 * 보내는 쪽은 받는 쪽의 저장 모양을 몰라요. 받는 기능의 receive()가
 * "지금 입력값 + 받은 값 → 새 입력값"을 직접 만들어요.
 * (MFC에서 다른 뷰의 멤버를 직접 고치지 않고 SendMessage로 부탁하는 것과 같아요)
 *
 * @param {string} fromId - 보내는 기능 id
 * @param {string} targetId - 받는 기능 id
 * @param {object} payload - 넘길 값 (예: { buyPrice: 47333 })
 *
 * 국내/해외 선택은 모든 기능이 함께 쓰니까, 받는 기능도 보내는 기능과 같은 시장으로 열려요.
 * receive(지금 입력값, 받은 값, 시장)의 세 번째 값으로 시장을 알려줘요 (단위·칸 이름이 달라서).
 */
function sendTo(fromId, targetId, payload) {
    const target = featureById(targetId);
    if (!target?.receive) return;

    const market = marketFor(target);
    setFeatureInputs(target, market, target.receive(getFeatureInputs(target, market), payload, market));
    pendingReceived = { to: targetId, from: FEATURES.find(f => f.id === fromId), payload };

    const hash = `#/${targetId}`;
    if (location.hash === hash) render();
    else location.hash = hash;              // hashchange → render() → 받는 기능의 mount(ctx.received)
}

/* ---------- 기록 ---------- */

/** 기록을 누르면: 그 기능의 입력값을 기록 당시로 되돌리고 그 화면으로 이동 */
function openRecord(record) {
    const feature = featureById(record.feature);
    if (!feature) return;
    let market = null;
    if (feature.markets) {
        // 기록한 시장으로 바꿔서 열어요. (예전 손익 기록은 data.tab에 국내/해외가 있어요)
        market = record.market ?? (record.data?.tab === 'global' ? 'global' : 'domestic');
        session.setMarket(market);
    }
    setFeatureInputs(feature, market, structuredClone(record.data));
    const hash = `#/${feature.id}`;
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

/** 기록 왼쪽 위 글씨: "손익 · 해외 · 09:41"의 앞부분 (국내는 기본이라 생략) */
function recordLabel(record, nameKey = 'shortName') {
    const feature = featureById(record.feature);
    const market = record.market === 'global' ? MARKETS.global.short : '';
    return [feature?.[nameKey] ?? record.feature, market, record.sub].filter(Boolean).join(' · ');
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

// 해외 결과 카드의 [$ | 원] 버튼: 고른 단위를 기억하고 같은 화면을 다시 그려요 (모든 계산기가 함께 따라가요)
document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-fx-view]');
    if (!btn || btn.getAttribute('aria-pressed') === 'true') return;
    session.setFxView(btn.dataset.fxView);
    render({ keepScroll: true });
});

window.addEventListener('hashchange', () => render()); // 메뉴·카드·뒤로가기 → 주소 변경 → 화면 교체
render();
