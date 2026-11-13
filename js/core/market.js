/**
 * market.js — 국내/해외 주식 구분 (여러 계산기가 함께 쓰는 부품)
 *
 * 국내/해외 선택은 모든 계산기가 함께 따라가요. 한 곳에서 해외로 바꾸면 다른 계산기도 해외로 열려요.
 * 입력값은 시장마다 따로 기억해요 (app.js가 ctx.inputs를 지금 시장 것으로 골라서 넘겨줘요).
 *
 * 해외일 때는 "기준 환율" 하나를 모든 계산기가 함께 써서 원화↔달러를 바꿔 보여줘요.
 *   - 결과 맨 위 큰 숫자: 달러와 원화를 함께 (krwLine / usdLine)
 *   - 결과 세부 금액: [$ | 원] 버튼으로 바꿔 봐요 (money·price가 알아서 바꿔요)
 *   - 계산에 자기 환율을 쓰는 계산기(분할 매도의 매도 시 환율 등)는 useRate()로 그 환율을 쓰게 해요
 *
 * MFC로 치면 여러 뷰가 함께 쓰는 공통 컨트롤 + 단위 변환 도우미 클래스예요.
 */
import { won, wonPrecise, usd } from './format.js';
import { getFx, getFxSource, getFxView } from './session.js';

export const MARKETS = {
    domestic: {
        id: 'domestic',
        label: '국내 주식',
        short: '국내',
        commRate: '0.015',  // 증권사 수수료 기본값 (%)
        taxRate: '0.20',    // 거래세 (%) — 매도 금액에
        taxName: '거래세',
    },
    global: {
        id: 'global',
        label: '해외 주식',
        short: '해외',
        commRate: '0.10',
        taxRate: '22.0',    // 양도소득세 (%) — 1년 수익에서 기본 공제 뒤
        taxBase: '2,500,000',
        /** 환율 칸의 처음 값 = 지금 기준 환율 (읽을 때마다 새로) */
        get fxRate() { return wonPrecise(getFx()); },
        taxName: '양도소득세',
    },
};

/**
 * 해외 결과를 원화로 볼 때 결과 그리기에 넘기는 "보기용 시장" 이름.
 * 결과 화면은 market 대신 viewMarket(market)을 받아서, money()·price()가 알아서 원화로 써요.
 * 기록 저장·입력칸 안내처럼 원래 단위가 필요한 곳은 그대로 market을 써요.
 */
const KRW_VIEW = 'global-krw';

export const isGlobal = (market) => market === 'global' || market === KRW_VIEW;

/** 결과 그리기에 넘길 시장: 해외 + [원] 보기면 'global-krw', 아니면 그대로 */
export const viewMarket = (market) => (market === 'global' && getFxView() === 'krw' ? KRW_VIEW : market);

/* ---------- 환율 ---------- */

/** 결과를 원화로 바꿀 때 쓸 환율. 계산기가 자기 환율을 정했으면(useRate) 그것, 아니면 기준 환율 */
let rateOverride = null;

/**
 * 이번 결과를 그리는 동안 원화 환산에 쓸 환율을 정해요. (예: 분할 매도는 매도 시 환율)
 * null이면 기준 환율. app.js가 화면을 새로 그릴 때마다 null로 되돌려요.
 */
export function useRate(rate) {
    rateOverride = rate > 0 ? rate : null;
}

/** 지금 원화 환산에 쓰는 환율 */
export const fxRate = () => rateOverride ?? getFx();

/** 결과 세부를 원화로 보는 중인지 (viewMarket이 돌려준 시장) */
export const isKrwView = (market) => market === KRW_VIEW;

/* ---------- 금액 글자 ---------- */

/** 달러 글자: 센트가 있으면 항상 두 자리 ($5,605.60), 딱 떨어지면 그대로 ($2,000) */
export function dollars(n) {
    const cents = Math.round(n * 100);
    return cents % 100 === 0
        ? usd(cents / 100)
        : (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * [원] 보기의 원화 환산 글자: "165,600원"
 * ("≈"는 붙이지 않아요. "−≈780원"처럼 부호와 섞이면 읽기 어렵고, 카드 위 [원] 버튼과 큰 숫자 아래 환율 줄이 환산임을 알려줘요)
 */
const krwOf = (n) => `${won(n * fxRate())}원`;

/** 가격 (원 아래·센트까지): 47,333.33원 / $123.45 (원화 보기면 165,600원) */
export function price(n, market) {
    if (!isGlobal(market)) return `${wonPrecise(n)}원`;
    return isKrwView(market) ? krwOf(n) : `$${dollars(n)}`;
}

/** 금액 (국내는 원 단위 반올림): 1,320,000원 / $1,234.56 (원화 보기면 1,703,693원) */
export function money(n, market) {
    if (!isGlobal(market)) return `${won(n)}원`;
    return isKrwView(market) ? krwOf(n) : `$${dollars(n)}`;
}

/** 부호 붙인 금액: +146,453원 / −$12.34 (원화 보기면 −17,029원) */
export function signedMoney(n, market) {
    const r = isGlobal(market) ? Math.round(n * 100) / 100 : Math.round(n);
    const sign = r > 0 ? '+' : r < 0 ? '−' : '';
    return sign + money(Math.abs(n), market);
}

/** 결과 카드의 큰 금액: 45,000<small>원</small> / <small>$</small>123.45 (큰 숫자는 늘 원래 단위) */
export function bigMoney(n, market) {
    return isGlobal(market) ? `<small class="pre">$</small>${dollars(n)}` : `${won(n)}<small>원</small>`;
}

/** 부호 글자: 반올림한 값 기준 "+", "−", "" */
const signOf = (rounded) => (rounded > 0 ? '+' : rounded < 0 ? '−' : '');

/**
 * 해외: 큰 달러 숫자 아래 원화 한 줄 "≈ 165,600원 · 환율 1,380원" (국내는 빈 글자)
 * @param {boolean} [signed] - 손익처럼 +/− 붙이기
 */
export function krwLine(n, market, signed = false) {
    if (!isGlobal(market)) return '';
    const k = n * fxRate();
    const sign = signed ? signOf(Math.round(k)) : '';
    return `<div class="result-krw">≈ ${sign}${won(Math.abs(k))}원 <span>환율 ${won(fxRate())}원</span></div>`;
}

/** 해외: 큰 원화 숫자 아래 달러 한 줄 "≈ $1,234.56 · 환율 1,380원" (손익 계산기처럼 원래 원화인 결과) */
export function usdLine(krw, market, signed = false) {
    if (!isGlobal(market)) return '';
    const d = krw / fxRate();
    const sign = signed ? signOf(Math.round(d * 100)) : '';
    return `<div class="result-krw">≈ ${sign}$${dollars(Math.abs(d))} <span>환율 ${won(fxRate())}원</span></div>`;
}

/**
 * 해외 결과 카드 오른쪽 위 [$ | 원] 버튼 (국내는 빈 글자). 누르면 app.js가 처리해요.
 * 세부 금액을 달러로 볼지 원화(환산)로 볼지 고르고, 고른 쪽은 모든 계산기가 함께 기억해요.
 */
export function fxToggle(market) {
    if (!isGlobal(market)) return '';
    const view = getFxView();
    return `
        <div class="fx-view" role="group" aria-label="금액 단위">
            <button type="button" data-fx-view="usd" aria-pressed="${view === 'usd'}">$</button>
            <button type="button" data-fx-view="krw" aria-pressed="${view === 'krw'}">원</button>
        </div>`;
}

/** 입력칸에 채울 글자 (다른 기능에서 값을 넘겨받을 때): 47333.333 → "47,333.33" */
export function inputText(n) {
    return wonPrecise(Math.round(n * 100) / 100);
}

/* ---------- 입력칸 ---------- */

/**
 * 금액 입력칸 HTML. 국내는 오른쪽에 "원", 해외는 왼쪽에 "$"
 * (해외 달러 칸에는 app.js가 $/₩ 바꿔 넣기 버튼을 자동으로 붙여요 — core/money-input.js)
 * @param {string} name
 * @param {string} market
 * @param {{ placeholder?: string, int?: boolean }} [options]
 *   int: 국내에서는 정수만 (예산·금액 칸). 해외는 센트가 있어서 항상 소수 허용
 */
export function moneyInput(name, market, { placeholder = '', int = false } = {}) {
    if (isGlobal(market)) {
        return `<span class="input-wrap prefix"><span class="prefix-unit">$</span><input name="${name}" inputmode="decimal" placeholder="${placeholder}" autocomplete="off"></span>`;
    }
    const mode = int ? 'inputmode="numeric" data-int' : 'inputmode="decimal"';
    return `<span class="input-wrap"><input name="${name}" ${mode} placeholder="${placeholder}" autocomplete="off"><span class="unit">원</span></span>`;
}

/** 시장별 예시 숫자: ex(market, '52,000', '120') */
export const ex = (market, domestic, global) => (isGlobal(market) ? global : domestic);

/* ---------- 오늘 환율 불러오기 ---------- */

/**
 * 공개 환율 API(Frankfurter, 유럽중앙은행 기준, 하루 한 번 갱신)에서 달러-원 환율을 받아와요.
 * 가입·키가 필요 없고, 보내는 정보는 "달러→원" 뿐이에요. 증권사 실시간 환율과는 조금 달라요.
 * @returns {Promise<{ rate: number, date: string }>}
 */
export async function fetchTodayFx() {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW');
    if (!res.ok) throw new Error(`환율 응답 ${res.status}`);
    const json = await res.json();
    const rate = json?.rates?.KRW;
    if (!(rate > 0)) throw new Error('환율 값이 없어요');
    return { rate, date: json.date };
}

/* ---------- 국내/해외 선택 버튼 + 기준 환율 ---------- */

/**
 * 계산기 맨 위의 [국내 주식 | 해외 주식] 버튼 줄. 해외면 아래에 "기준 환율" 한 줄을 더 그려요.
 * @param {HTMLElement} container
 * @param {string} market - 지금 시장
 * @param {(market: string) => void} onChange - 국내/해외를 바꿨을 때
 * @param {(rate: number, date: string | null) => void} onFx - 기준 환율을 바꿨을 때 (불러왔으면 date)
 */
export function renderMarketBar(container, market, onChange, onFx) {
    const src = getFxSource();
    container.className = 'market-bar';
    container.innerHTML = `
        <div class="segmented" role="tablist" aria-label="주식 종류">
            ${Object.values(MARKETS).map(m => `
                <button type="button" role="tab" aria-selected="${m.id === market}" data-market="${m.id}">${m.label}</button>`).join('')}
        </div>
        ${isGlobal(market) ? `
        <div class="fx-line">
            <span class="fx-line-label">기준 환율</span>
            <span class="input-wrap fx-line-input"><input data-fx-rate inputmode="decimal" value="${wonPrecise(getFx())}" autocomplete="off" aria-label="기준 환율 (원)"><span class="unit">원</span></span>
            <button type="button" class="mini-btn" data-fx-fetch>오늘 환율</button>
            <span class="fx-line-src" data-fx-src>${src ? `${src.date.slice(5).replace('-', '/')} 기준` : '직접 입력'}</span>
        </div>` : ''}`;

    container.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-market]');
        if (btn && btn.dataset.market !== market) onChange(btn.dataset.market);

        const fetchBtn = e.target.closest('[data-fx-fetch]');
        if (fetchBtn) {
            fetchBtn.disabled = true;
            fetchBtn.textContent = '불러오는 중…';
            try {
                const { rate, date } = await fetchTodayFx();
                onFx(Math.round(rate * 100) / 100, date);
            } catch (err) {
                fetchBtn.disabled = false;
                fetchBtn.textContent = '오늘 환율';
                container.querySelector('[data-fx-src]').textContent = '불러오지 못했어요';
            }
        }
    });

    // 기준 환율 칸: 다 쓰고 Enter를 누르거나 칸을 벗어나면 적용 (글자마다 다시 그리면 커서가 사라져서)
    const input = container.querySelector('[data-fx-rate]');
    if (input) {
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
        input.addEventListener('change', () => {
            const rate = parseFloat(input.value.replace(/,/g, ''));
            if (rate > 0 && Math.abs(rate - getFx()) > 1e-9) onFx(rate, null);
            else input.value = wonPrecise(getFx());
        });
    }
}
