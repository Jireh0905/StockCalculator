/**
 * split/template.js — 분할 매매 계산기 화면의 HTML
 *
 * 국내/해외에 따라 단위(원/$)와 수수료·세금 칸이 달라서, 시장을 받아 HTML을 만들어요.
 * data-values: 이 안의 입력칸은 values 하나로 묶어서 저장 (매수·매도 단계 줄은 따로 buys·sells로)
 */
import { MARKETS, isGlobal, moneyInput, ex } from '../../core/market.js';

/** 수수료·세금 설정 (분할 매도에서만 써요. 분할 매수 평단은 수수료를 빼고 계산) */
function settings(market) {
    const m = MARKETS[market];
    const field = (label, name, value, hint, attrs = 'inputmode="decimal"', unit = '%') => `
        <label class="field">
            <span class="field-label">${label}</span>
            <span class="input-wrap"><input name="${name}" ${attrs} value="${value}" autocomplete="off"><span class="unit">${unit}</span></span>
            ${hint ? `<span class="hint">${hint}</span>` : ''}
        </label>`;
    const body = isGlobal(market)
        ? `<div class="grid-2">
               ${field('증권사 수수료', 'commRate', m.commRate, '매수·매도 각각')}
               ${field('양도소득세', 'taxRate', m.taxRate, '지방소득세 포함')}
           </div>
           ${field('양도소득세 기본 공제', 'taxBase', m.taxBase, '1년에 한 번 적용돼요', 'inputmode="numeric" data-int', '원')}`
        : `<div class="grid-2">
               ${field('증권사 수수료', 'commRate', m.commRate, '매수·매도 각각')}
               ${field('거래세', 'taxRate', m.taxRate, '매도할 때만')}
           </div>`;
    return `
        <details class="settings" data-values>
            <summary>수수료·세금 (${m.short}) <span class="chip" data-chip></span></summary>
            <div class="settings-body">${body}</div>
        </details>`;
}

/** 해외 분할 매도: 양도소득세를 원화로 계산하려면 환율이 필요해요 (손익 계산기 해외와 같은 칸) */
function fxFields(market) {
    if (!isGlobal(market)) return '';
    return `
        <div class="grid-2" data-values>
            <label class="field">
                <span class="field-label">매수 시 환율</span>
                <span class="input-wrap"><input name="fxBuy" inputmode="decimal" placeholder="매도와 동일" autocomplete="off"><span class="unit">원</span></span>
            </label>
            <label class="field">
                <span class="field-label">매도 시 환율</span>
                <span class="input-wrap"><input name="fxSell" inputmode="decimal" value="${MARKETS.global.fxRate}" autocomplete="off"><span class="unit">원</span></span>
            </label>
        </div>`;
}

export function template(market) {
    return `
<div class="layout">
    <div class="input-col">
        <section class="card" data-values>
            <h2 class="card-title">지금 갖고 있는 주식</h2>
            <div class="grid-2">
                <label class="field">
                    <span class="field-label">평균 단가</span>
                    ${moneyInput('avgPrice', market, { placeholder: ex(market, '52,000', '120') })}
                </label>
                <label class="field">
                    <span class="field-label">보유 수량</span>
                    <span class="input-wrap"><input name="holdQty" inputmode="numeric" data-int placeholder="${ex(market, '30', '20')}" autocomplete="off"><span class="unit">주</span></span>
                </label>
            </div>
        </section>

        <div class="segmented" role="tablist" aria-label="매수/매도">
            <button type="button" role="tab" id="tab-buy" aria-controls="panel-buy" aria-selected="true" data-tab="buy">분할 매수</button>
            <button type="button" role="tab" id="tab-sell" aria-controls="panel-sell" aria-selected="false" data-tab="sell">분할 매도</button>
        </div>

        <section class="card panel" id="panel-buy" role="tabpanel" aria-labelledby="tab-buy">
            <h2 class="card-title">추가로 살 주식</h2>
            <div class="buy-list" data-buys></div>
            <button type="button" class="add-row-btn" data-add-buy>+ 분할 매수 늘리기</button>
        </section>

        <section class="card panel" id="panel-sell" role="tabpanel" aria-labelledby="tab-sell" hidden>
            <h2 class="card-title">나눠서 팔 계획</h2>
            <div class="buy-list" data-sells></div>
            <button type="button" class="add-row-btn" data-add-sell>+ 분할 매도 늘리기</button>
            <div class="panel-extra">${fxFields(market)}</div>
            ${settings(market)}
        </section>
    </div>
    <div class="result-col">
        <section class="card result-card" data-result aria-live="polite"></section>
    </div>
</div>`;
}

/** 분할 매수 한 건의 입력 줄 */
export function createBuyRow(market) {
    const row = document.createElement('div');
    row.className = 'buy-row';
    row.innerHTML = `
        <div class="buy-row-head">
            <span class="buy-row-title"></span>
            <button type="button" class="text-btn" data-remove>삭제</button>
        </div>
        <div class="grid-2">
            <label class="field">
                <span class="field-label">매수가</span>
                ${moneyInput('buyPrice', market, { placeholder: ex(market, '44,000', '100') })}
            </label>
            <label class="field">
                <span class="field-label">매수 수량</span>
                <span class="input-wrap"><input name="buyQty" inputmode="numeric" data-int placeholder="${ex(market, '20', '10')}" autocomplete="off"><span class="unit">주</span></span>
            </label>
        </div>`;
    return row;
}

/** 분할 매도 한 건의 입력 줄 */
export function createSellRow(market) {
    const row = document.createElement('div');
    row.className = 'buy-row sell-row';
    row.innerHTML = `
        <div class="buy-row-head">
            <span class="buy-row-title"></span>
            <button type="button" class="text-btn" data-remove>삭제</button>
        </div>
        <div class="grid-2">
            <label class="field">
                <span class="field-label">매도가</span>
                ${moneyInput('sellPrice', market, { placeholder: ex(market, '55,000', '130') })}
                <span class="hint" data-price-hint></span>
            </label>
            <div class="field">
                <span class="field-label">매도 수량</span>
                <span class="input-wrap"><input name="sellQty" inputmode="numeric" data-int placeholder="${ex(market, '10', '5')}" autocomplete="off"><span class="unit">주</span></span>
                <span class="hint hint-row"><span data-qty-hint></span><button type="button" class="mini-btn" data-fill-rest>남은 수량 전부</button></span>
            </div>
        </div>
        <p class="step-result" data-step-result></p>`;
    return row;
}
