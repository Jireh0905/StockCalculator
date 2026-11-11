/**
 * market.js — 국내/해외 주식 구분 (여러 계산기가 함께 쓰는 부품)
 *
 * 국내/해외 선택은 모든 계산기가 함께 따라가요. 한 곳에서 해외로 바꾸면 다른 계산기도 해외로 열려요.
 * 입력값은 시장마다 따로 기억해요 (app.js가 ctx.inputs를 지금 시장 것으로 골라서 넘겨줘요).
 *
 * MFC로 치면 여러 뷰가 함께 쓰는 공통 컨트롤 + 단위 변환 도우미 클래스예요.
 */
import { won, wonPrecise, usd } from './format.js';

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
        fxRate: '1,300',    // 환율 기본값 (원)
        taxName: '양도소득세',
    },
};

export const isGlobal = (market) => market === 'global';

/* ---------- 금액 글자 ---------- */

/** 달러 글자: 센트가 있으면 항상 두 자리 ($5,605.60), 딱 떨어지면 그대로 ($2,000) */
function dollars(n) {
    const cents = Math.round(n * 100);
    return cents % 100 === 0
        ? usd(cents / 100)
        : (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 가격 (원 아래·센트까지): 47,333.33원 / $123.45 */
export function price(n, market) {
    return isGlobal(market) ? `$${dollars(n)}` : `${wonPrecise(n)}원`;
}

/** 금액 (국내는 원 단위 반올림): 1,320,000원 / $1,234.56 */
export function money(n, market) {
    return isGlobal(market) ? `$${dollars(n)}` : `${won(n)}원`;
}

/** 부호 붙인 금액: +146,453원 / −$12.34 */
export function signedMoney(n, market) {
    const r = isGlobal(market) ? Math.round(n * 100) / 100 : Math.round(n);
    const sign = r > 0 ? '+' : r < 0 ? '−' : '';
    return sign + money(Math.abs(n), market);
}

/** 결과 카드의 큰 금액: 45,000<small>원</small> / <small>$</small>123.45 */
export function bigMoney(n, market) {
    return isGlobal(market) ? `<small class="pre">$</small>${dollars(n)}` : `${won(n)}<small>원</small>`;
}

/** 입력칸에 채울 글자 (다른 기능에서 값을 넘겨받을 때): 47333.333 → "47,333.33" */
export function inputText(n) {
    return wonPrecise(Math.round(n * 100) / 100);
}

/* ---------- 입력칸 ---------- */

/**
 * 금액 입력칸 HTML. 국내는 오른쪽에 "원", 해외는 왼쪽에 "$"
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

/* ---------- 국내/해외 선택 버튼 ---------- */

/**
 * 계산기 맨 위의 [국내 주식 | 해외 주식] 버튼 줄
 * @param {HTMLElement} container
 * @param {string} market - 지금 시장
 * @param {(market: string) => void} onChange
 */
export function renderMarketBar(container, market, onChange) {
    container.className = 'market-bar';
    container.innerHTML = `
        <div class="segmented" role="tablist" aria-label="주식 종류">
            ${Object.values(MARKETS).map(m => `
                <button type="button" role="tab" aria-selected="${m.id === market}" data-market="${m.id}">${m.label}</button>`).join('')}
        </div>`;
    container.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-market]');
        if (btn && btn.dataset.market !== market) onChange(btn.dataset.market);
    });
}
