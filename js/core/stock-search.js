/**
 * stock-search.js — 국내 종목 검색 (종목 정보 화면과 계산기의 [종목] 버튼이 함께 써요)
 *
 * 종목 목록은 data/stocks.json (tools/update-stocks.py로 만든 파일)이에요.
 * 같은 사이트의 파일이라 CORS 문제가 없고, 처음 검색할 때 한 번만 받아서 기억해요.
 *
 * 사용법
 *   createStockSearch(container, { onPick(stock) {...} })
 *   stock = { code: '005930', name: '삼성전자', market: 'K' }   (K 코스피, Q 코스닥, E ETF)
 */
import { getRecentStocks, addRecentStock } from './session.js';

export const MARKET_NAMES = { K: '코스피', Q: '코스닥', E: 'ETF' };
const LIMIT = 20;

/** 목록 받기 (한 번만. 실패하면 다음에 다시 시도할 수 있게 기억을 지워요) */
let listPromise = null;
export function loadStockList() {
    listPromise ??= fetch('data/stocks.json')
        .then(res => {
            if (!res.ok) throw new Error(`목록 응답 ${res.status}`);
            return res.json();
        })
        .then(json => ({
            updated: json.updated,
            // 파일 순서 = 시가총액 큰 순서 (tools/update-stocks.py) → 같은 순위면 큰 회사가 먼저
            items: json.items.map(([code, name, market], order) => ({ code, name, market, order, key: normalize(name) })),
        }))
        .catch(err => {
            listPromise = null;
            throw err;
        });
    return listPromise;
}

/** 비교용 글자: 띄어쓰기 빼고 소문자 ("Kodex 200" → "kodex200") */
const normalize = (s) => s.replace(/\s+/g, '').toLowerCase();

/**
 * 검색: 코드가 같으면 맨 위 → 이름이 같음 → 이름이 그 글자로 시작 → 이름에 들어 있음.
 * 같은 순위끼리는 시가총액이 큰 순서 (목록 파일 순서).
 * @returns {Array} 최대 20개
 */
export function searchStocks(list, query) {
    const q = normalize(query);
    if (!q) return [];
    const upper = q.toUpperCase();
    const scored = [];
    for (const s of list.items) {
        let rank = -1;
        if (s.code === upper) rank = 0;
        else if (s.key === q) rank = 1;
        else if (s.code.startsWith(upper)) rank = 2;
        else if (s.key.startsWith(q)) rank = 3;
        else if (s.key.includes(q)) rank = 4;
        if (rank >= 0) scored.push([rank, s]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1].order - b[1].order);
    return scored.slice(0, LIMIT).map(([, s]) => s);
}

/** HTML에 넣을 글자 (종목 이름의 & < > 가 태그로 읽히지 않게) */
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 이름에서 찾은 글자를 굵게 (띄어쓰기 무시하고 찾은 거라 그대로 못 찾으면 그냥) */
function highlight(name, query) {
    const q = query.trim();
    const at = q ? name.toLowerCase().indexOf(q.toLowerCase()) : -1;
    if (at < 0) return escapeHtml(name);
    return escapeHtml(name.slice(0, at)) + `<b>${escapeHtml(name.slice(at, at + q.length))}</b>` + escapeHtml(name.slice(at + q.length));
}

/**
 * 검색창 + 결과 목록을 만들어요.
 * 글자를 칠 때마다 목록에서 바로 찾고, ↑↓로 고르고 Enter(또는 누르기)로 골라요.
 * 빈 칸이면 최근 본 종목을 보여줘요.
 * @param {HTMLElement} container
 * @param {{ onPick: (stock) => void, autofocus?: boolean, placeholder?: string }} options
 * @returns {{ input: HTMLInputElement, clear: () => void }}
 */
export function createStockSearch(container, { onPick, autofocus = false, placeholder = '종목 이름이나 코드 (예: 삼성전자)' }) {
    container.innerHTML = `
        <div class="ss">
            <span class="input-wrap ss-input">
                <svg class="ss-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
                <input type="search" enterkeyhint="search" autocomplete="off" spellcheck="false"
                       placeholder="${placeholder}" aria-label="종목 검색" role="combobox" aria-expanded="false" aria-controls="ssList">
            </span>
            <ul class="ss-list" id="ssList" role="listbox"></ul>
            <p class="ss-foot" data-foot></p>
        </div>`;
    const input = container.querySelector('input');
    const listEl = container.querySelector('.ss-list');
    const foot = container.querySelector('[data-foot]');
    let shown = [];       // 지금 목록에 보이는 종목
    let active = -1;      // ↑↓로 고른 줄

    const itemHtml = (s, i, query) => `
        <li role="option" id="ss-opt-${i}" class="ss-item" data-index="${i}" aria-selected="${i === active}">
            <span class="ss-name">${highlight(s.name, query)}</span>
            <span class="ss-meta">${s.code} · ${MARKET_NAMES[s.market] ?? ''}</span>
        </li>`;

    function render(items, query, title) {
        shown = items;
        active = items.length && query ? 0 : -1;
        listEl.innerHTML = (title && items.length ? `<li class="ss-title" role="presentation">${title}</li>` : '')
            + items.map((s, i) => itemHtml(s, i, query)).join('');
        input.setAttribute('aria-expanded', String(items.length > 0));
        markActive();
    }

    function markActive() {
        listEl.querySelectorAll('.ss-item').forEach(li => {
            const on = Number(li.dataset.index) === active;
            li.setAttribute('aria-selected', String(on));
            if (on) li.scrollIntoView({ block: 'nearest' });
        });
        if (active >= 0) input.setAttribute('aria-activedescendant', `ss-opt-${active}`);
        else input.removeAttribute('aria-activedescendant');
    }

    async function update() {
        const query = input.value;
        if (!query.trim()) {
            render(getRecentStocks(), '', '최근 본 종목');
            return;
        }
        try {
            const list = await loadStockList();
            if (input.value !== query) return;   // 기다리는 동안 글자가 바뀌었으면 버려요
            const found = searchStocks(list, query);
            render(found, query);
            if (!found.length) listEl.innerHTML = '<li class="ss-empty">찾는 종목이 없어요</li>';
        } catch {
            listEl.innerHTML = '<li class="ss-empty is-error">종목 목록을 불러오지 못했어요</li>';
        }
    }

    function pick(i) {
        const s = shown[i];
        if (!s) return;
        const stock = { code: s.code, name: s.name, market: s.market };
        addRecentStock(stock);
        input.value = '';
        input.blur();
        render([], '');
        onPick(stock);
    }

    input.addEventListener('input', update);
    input.addEventListener('focus', update);
    // 칸을 벗어나면 목록을 접어요 (목록을 누를 때는 mousedown에서 막아서 포커스가 안 빠져요)
    input.addEventListener('blur', () => render([], ''));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (!shown.length) return;
            e.preventDefault();
            active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
            markActive();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(active >= 0 ? active : 0);
        } else if (e.key === 'Escape') {
            input.value = '';
            render([], '');
        }
    });
    // mousedown: 클릭으로 입력칸 포커스가 빠지기 전에 골라요
    listEl.addEventListener('mousedown', (e) => {
        const li = e.target.closest('.ss-item');
        if (!li) return;
        e.preventDefault();
        pick(Number(li.dataset.index));
    });

    // 목록 기준일 (목록을 미리 받아서 보여줘요. 실패해도 검색할 때 다시 시도)
    loadStockList().then(list => {
        foot.textContent = `목록 기준 ${+list.updated.slice(5, 7)}/${+list.updated.slice(8, 10)} · ${list.items.length.toLocaleString('ko-KR')}개 (코스피·코스닥·ETF)`;
    }).catch(() => {});

    if (autofocus) input.focus();
    return {
        input,
        clear: () => { input.value = ''; render([], ''); },
    };
}
