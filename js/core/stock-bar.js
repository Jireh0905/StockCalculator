/**
 * stock-bar.js — 계산기 맨 위 [국내 | 해외] 줄 아래의 "종목 검색 줄" (국내 계산기 공통)
 *
 * 종목을 고르면 네이버 실시간 시세를 받아, 계산기가 정한 칸을 한 번에 채워요.
 *   - 무엇을 어디에 넣을지는 계산기가 정해요: stockFill({ view, data }) → { fields: [{ input, value, label }], focus?, note? }
 *   - 이 파일은 그 칸에 값을 넣고 input 이벤트를 보내요 → 계산기는 사람이 직접 친 것처럼 다시 계산·저장
 *     (core/money-input.js의 원화로 넣기와 같은 방식이라, 계산기는 이 파일을 몰라도 돼요)
 *
 * 칸은 "고를 때"와 "[다시 넣기]를 누를 때"만 채워요. 다른 화면에 갔다 와도 내가 고친 값을 덮어쓰지 않게,
 * 고른 종목과 마지막 시세는 기억해서 줄에만 다시 보여줘요 (session.stockOf).
 */
import { createStockSearch, escapeHtml } from './stock-search.js';
import { loadItems } from './naver.js';
import { isOnline } from './network.js';
import { getStockOf, setStockOf } from './session.js';
import { won, clockTime } from './format.js';
import { showToast } from './toast.js';

/** 값이 들어간 칸을 잠깐 강조 (core/received.js와 같은 .flash) */
function flash(input) {
    input.classList.add('flash');
    input.addEventListener('animationend', () => input.classList.remove('flash'), { once: true });
}

/** 받침이 있으면 '을', 없으면 '를' ("2.75%"는 "퍼센트"로 읽어서 '를') */
function eulReul(text) {
    if (text.endsWith('%')) return '를';
    const code = text.charCodeAt(text.length - 1) - 0xAC00;
    return code >= 0 && code < 11172 && code % 28 === 0 ? '를' : '을';
}

const fixed = (n, d = 2) => n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** 고른 뒤 한 줄 요약: "삼성전자 005930 · 207,000원 ▼0.48% · 15:20  [↻ 다시 넣기] [✕]" */
function pickedHtml(s) {
    const tone = s.change > 0 ? 'tone-up' : s.change < 0 ? 'tone-down' : '';
    const arrow = s.change > 0 ? '▲' : s.change < 0 ? '▼' : '–';
    return `
        <div class="sb-picked">
            <div class="sb-info">
                <span class="sb-name"><b>${escapeHtml(s.name)}</b><small>${s.code}</small></span>
                <span class="sb-price">${won(s.price)}원 <span class="${tone}">${arrow}${fixed(Math.abs(s.rate))}%</span>
                    <small>${clockTime(new Date(s.time))}</small></span>
            </div>
            <button type="button" class="mini-btn sb-refresh" data-sb-refresh data-needs-net ${isOnline() ? '' : 'disabled'}
                    title="지금 가격을 다시 받아 칸을 채워요">↻ 다시 넣기</button>
            <button type="button" class="icon-mini" data-sb-clear aria-label="종목 지우고 다시 검색">✕</button>
        </div>
        <p class="sb-msg" data-sb-msg role="status"></p>`;
}

/**
 * 검색 줄을 그려요.
 * @param {HTMLElement} container - 국내/해외 줄 아래 자리
 * @param {{ featureId: string, getView: () => HTMLElement, fill: Function }} options
 *   fill: 계산기의 stockFill({ view, data })
 */
export function renderStockBar(container, { featureId, getView, fill }) {
    container.className = 'stock-bar';

    function showSearch(autofocus = false) {
        container.innerHTML = '<div class="sb-search" data-sb-search></div><p class="sb-msg" data-sb-msg role="status"></p>';
        const { input } = createStockSearch(container.querySelector('[data-sb-search]'), {
            onPick: (stock) => load(stock),
            autofocus,
            placeholder: '종목을 고르면 지금 가격을 칸에 넣어요 (예: 삼성전자)',
        });
        container.querySelector('.ss-foot')?.remove();   // 목록 기준일은 종목 정보 화면에서만
        input.setAttribute('data-needs-net', '');        // 오프라인이면 app.js가 꺼요
        input.disabled = !isOnline();
    }

    function showPicked(s) {
        container.innerHTML = pickedHtml(s);
    }

    const message = (text, isError = false) => {
        const msg = container.querySelector('[data-sb-msg]');
        if (!msg) return;
        msg.textContent = text;
        msg.classList.toggle('is-error', isError);
    };

    /** 시세 받기 → 기억 → 칸 채우기 */
    async function load(stock) {
        if (!isOnline()) return message('인터넷 연결이 없어서 가격을 받을 수 없어요', true);
        message(`${stock.name} 지금 가격을 받는 중…`);
        const refresh = container.querySelector('[data-sb-refresh]');
        refresh?.setAttribute('data-busy', '');
        if (refresh) refresh.disabled = true;
        try {
            const { items, time } = await loadItems([stock.code]);
            const data = items.find(it => it.code === stock.code);
            if (!data) throw new Error('시세가 없어요');
            const saved = {
                code: stock.code, name: stock.name, market: stock.market,
                price: data.price, change: data.change, rate: data.rate, time,
            };
            setStockOf(featureId, saved);
            if (!container.isConnected) return;   // 기다리는 동안 다른 화면으로 갔으면 칸은 건드리지 않아요
            showPicked(saved);
            apply(stock, data);
        } catch (err) {
            message(`${stock.name} 시세를 받지 못했어요. 다시 해 주세요`, true);
            refresh?.removeAttribute('data-busy');
            if (refresh) refresh.disabled = !isOnline();
        }
    }

    /** 계산기가 정한 칸에 값 넣기 */
    function apply(stock, data) {
        const view = getView();
        const plan = fill({ view, data }) ?? {};
        const done = [];
        (plan.fields ?? []).forEach(({ input, value, label }) => {
            if (!input) return;
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));   // 계산기가 다시 계산·저장
            flash(input);
            done.push(label);
        });
        if (plan.focus) {
            plan.focus.focus({ preventScroll: true });
            plan.focus.select?.();
        }
        const list = done.join(', ');
        const text = done.length ? `${stock.name} · ${list}${eulReul(list)} 넣었어요` : `${stock.name} · 넣을 칸이 없어요`;
        showToast(plan.note ? `${text} (${plan.note})` : text);
    }

    container.addEventListener('click', (e) => {
        const current = getStockOf(featureId);
        if (e.target.closest('[data-sb-refresh]') && current) load(current);
        if (e.target.closest('[data-sb-clear]')) {
            setStockOf(featureId, null);
            showSearch(true);
        }
    });

    const remembered = getStockOf(featureId);
    if (remembered) showPicked(remembered);   // 기억한 종목은 줄에만 보여주고 칸은 그대로
    else showSearch();
}

/** 해외일 때: 검색 줄 자리에 안내 한 줄 (줄이 사라지면 국내/해외를 바꿀 때 화면이 흔들려서) */
export function renderStockBarNote(container) {
    container.className = 'stock-bar';
    container.innerHTML = '<p class="sb-note">해외 종목 검색은 아직 준비 중이에요. 지금은 국내 종목만 가격을 가져올 수 있어요.</p>';
}
