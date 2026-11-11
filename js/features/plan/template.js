/**
 * plan/template.js — 하락 대응 계산기 화면의 HTML
 *
 * 국내/해외에 따라 단위(원/$)와 수수료·세금 칸이 달라서, 시장을 받아 HTML을 만들어요.
 * data-values: 이 안의 입력칸은 values 하나로 묶어서 저장해요. (분할 매수 단계 줄은 따로 steps로 저장)
 * data-hint="이름": 입력값에 따라 글자가 바뀌는 안내 (예: "현재가 −4.3%")
 */
import { MARKETS, isGlobal, moneyInput, ex } from '../../core/market.js';

/**
 * 수수료·세금 설정
 * 해외는 양도소득세가 "수익"에만 붙어요. 이 계산기는 본전·손실 구간만 다뤄서 수수료만 받아요.
 */
function settings(market) {
    const m = MARKETS[market];
    const comm = `
        <label class="field">
            <span class="field-label">증권사 수수료</span>
            <span class="input-wrap"><input name="commRate" inputmode="decimal" value="${m.commRate}" autocomplete="off"><span class="unit">%</span></span>
            <span class="hint">매수·매도 각각</span>
        </label>`;
    const body = isGlobal(market)
        ? `${comm}<p class="note settings-note">해외 주식의 양도소득세는 수익에만 붙어요. 본전 가격과 손절 손실에는 세금이 없어서 수수료만 넣어 계산해요.</p>`
        : `<div class="grid-2">${comm}
               <label class="field">
                   <span class="field-label">거래세</span>
                   <span class="input-wrap"><input name="taxRate" inputmode="decimal" value="${m.taxRate}" autocomplete="off"><span class="unit">%</span></span>
                   <span class="hint">매도할 때만</span>
               </label>
           </div>`;
    return `
        <details class="settings">
            <summary>수수료${isGlobal(market) ? '' : '·세금'} (${m.short}) <span class="chip" data-chip></span></summary>
            <div class="settings-body">${body}</div>
        </details>`;
}

export function template(market) {
    const money = (name, d, g, opts = {}) => moneyInput(name, market, { placeholder: ex(market, d, g), ...opts });
    return `
<div class="layout">
    <div class="input-col">
        <section class="card" data-values>
            <h2 class="card-title">지금 갖고 있는 주식</h2>
            <div class="grid-2">
                <label class="field">
                    <span class="field-label">평균 단가</span>
                    ${money('avgPrice', '52,000', '120')}
                </label>
                <label class="field">
                    <span class="field-label">보유 수량</span>
                    <span class="input-wrap"><input name="holdQty" inputmode="numeric" data-int placeholder="${ex(market, '30', '20')}" autocomplete="off"><span class="unit">주</span></span>
                </label>
            </div>
            <label class="field">
                <span class="field-label">현재가 <span class="field-optional">선택</span></span>
                ${money('curPrice', '46,000', '105')}
                <span class="hint" data-hint="curPrice">넣으면 계획한 가격이 지금보다 몇 % 아래인지 보여줘요</span>
            </label>
            ${settings(market)}
        </section>

        <div class="segmented" role="tablist" aria-label="대응 방법">
            <button type="button" role="tab" id="tab-avg" aria-controls="panel-avg" aria-selected="true" data-tab="avg">물타기 계획</button>
            <button type="button" role="tab" id="tab-stop" aria-controls="panel-stop" aria-selected="false" data-tab="stop">손절 후 재매수</button>
        </div>

        <!-- 물타기 계획: 매수가 + 목표 평단을 한 세트로 늘리고 줄여요 -->
        <section class="card panel" id="panel-avg" role="tabpanel" aria-labelledby="tab-avg">
            <h2 class="card-title">분할 매수 계획</h2>
            <div class="buy-list" data-steps></div>
            <button type="button" class="add-row-btn" data-add>+ 분할 매수 늘리기</button>

            <div class="grid-2 panel-extra" data-values>
                <label class="field">
                    <span class="field-label">손절선 <span class="field-optional">선택</span></span>
                    ${money('stopLine', '36,000', '85')}
                    <span class="hint" data-hint="stopLine">다 사고도 여기까지 떨어지면 판다</span>
                </label>
                <label class="field">
                    <span class="field-label">쓸 수 있는 돈 <span class="field-optional">선택</span></span>
                    ${money('budget', '3,000,000', '2,500', { int: true })}
                    <span class="hint">넘는 단계를 알려줘요</span>
                </label>
            </div>
        </section>

        <!-- 손절 후 재매수 -->
        <section class="card panel" id="panel-stop" role="tabpanel" aria-labelledby="tab-stop" hidden data-values>
            <h2 class="card-title">손절 후 재매수 계획</h2>
            <div class="grid-2">
                <label class="field">
                    <span class="field-label">손절가</span>
                    ${money('stopPrice', '45,000', '100')}
                    <span class="hint" data-hint="stopPrice">이 가격에 모두 팔아요</span>
                </label>
                <label class="field">
                    <span class="field-label">재매수가</span>
                    ${money('rebuyPrice', '40,000', '90')}
                    <span class="hint" data-hint="rebuyPrice">이 가격에 다시 사요</span>
                </label>
            </div>
            <label class="field">
                <span class="field-label">재매수 금액 <span class="field-optional">선택</span></span>
                ${money('rebuyAmount', '비우면 손절로 받은 돈 전부', '비우면 손절로 받은 돈 전부', { int: true })}
                <span class="hint">받은 돈보다 많이 넣으면 그만큼 돈을 더 넣는 거예요</span>
            </label>
        </section>
    </div>
    <div class="result-col">
        <section class="card result-card" data-result aria-live="polite"></section>
    </div>
</div>`;
}

/** 분할 매수 한 단계의 입력 줄 (매수가 + 목표 평단 세트) */
export function createStepRow(market) {
    const row = document.createElement('div');
    row.className = 'buy-row step-row';
    row.innerHTML = `
        <div class="buy-row-head">
            <span class="buy-row-title"></span>
            <button type="button" class="text-btn" data-remove>삭제</button>
        </div>
        <div class="grid-2">
            <label class="field">
                <span class="field-label">매수가</span>
                ${moneyInput('stepPrice', market, { placeholder: ex(market, '44,000', '100') })}
                <span class="hint" data-step-hint></span>
            </label>
            <label class="field">
                <span class="field-label">목표 평단</span>
                ${moneyInput('stepGoal', market, { placeholder: ex(market, '48,000', '110') })}
            </label>
        </div>
        <p class="step-result" data-step-result></p>`;
    return row;
}
