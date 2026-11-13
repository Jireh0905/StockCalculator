/**
 * dividend/template.js — 배당 계산기 화면의 HTML
 *
 * 국내/해외에 따라 단위(원/$)와 세금 칸이 달라서, 시장을 받아 HTML을 만들어요.
 * data-values: 이 안의 입력칸은 values 하나로 묶어서 저장해요.
 * 배당 주기·목표 기간처럼 버튼으로 고르는 값은 숨은 입력칸(type="hidden")에 넣어 같이 저장해요.
 */
import { isGlobal, moneyInput, ex } from '../../core/market.js';
import { FREQS } from './calculator.js';

/** 해외 배당 기본 세율: 미국 원천징수 15% */
const TAX = { domestic: '15.4', global: '15' };

/**
 * 버튼 몇 개 중 하나를 고르는 줄 (값은 숨은 입력칸에)
 * @param {string} name - 숨은 입력칸 이름
 * @param {Array<{ value: string, label: string }>} options
 */
function choice(name, options, label) {
    return `
        <div class="segmented small cols-${options.length}" role="radiogroup" aria-label="${label}" data-choice="${name}">
            ${options.map(o => `<button type="button" role="radio" aria-checked="false" data-value="${o.value}">${o.label}</button>`).join('')}
        </div>
        <input type="hidden" name="${name}">`;
}

export function template(market) {
    const global = isGlobal(market);
    // 해외 환율은 맨 위 "기준 환율"을 함께 써요 (core/market.js)

    return `
<div class="layout">
    <div class="input-col">
        <section class="card" data-values>
            <h2 class="card-title">종목</h2>
            <div class="grid-2">
                <label class="field">
                    <span class="field-label">주가</span>
                    ${moneyInput('price', market, { placeholder: ex(market, '50,000', '50') })}
                </label>
                <label class="field">
                    <span class="field-label">주당 배당금 <span class="field-optional">1회</span></span>
                    ${moneyInput('dps', market, { placeholder: ex(market, '500', '0.5') })}
                </label>
            </div>
            <div class="field">
                <span class="field-label">배당 주기</span>
                ${choice('freq', FREQS.map(f => ({ value: String(f.n), label: f.label })), '배당 주기')}
                <span class="hint" data-hint="annual">1년에 몇 번 받는지 골라주세요</span>
            </div>

            <details class="settings">
                <summary>세금 <span class="chip" data-chip></span></summary>
                <div class="settings-body">
                    <label class="field">
                        <span class="field-label">${global ? '현지 원천징수' : '배당소득세'}</span>
                        <span class="input-wrap"><input name="taxRate" inputmode="decimal" value="${TAX[market]}" autocomplete="off"><span class="unit">%</span></span>
                        <span class="hint">${global
                            ? '미국 15% 기준이에요. 나라마다 달라서 바꿀 수 있어요.'
                            : '소득세 14% + 지방소득세 1.4%. 받을 때 떼고 들어와요.'}</span>
                    </label>
                </div>
            </details>
        </section>

        <div class="segmented" role="tablist" aria-label="계산 방법">
            <button type="button" role="tab" id="tab-mine" aria-controls="panel-mine" aria-selected="true" data-tab="mine">내 배당</button>
            <button type="button" role="tab" id="tab-goal" aria-controls="panel-goal" aria-selected="false" data-tab="goal">목표 배당</button>
        </div>

        <section class="card panel" id="panel-mine" role="tabpanel" aria-labelledby="tab-mine" data-values>
            <h2 class="card-title">갖고 있는 주식</h2>
            <div class="grid-2">
                <label class="field">
                    <span class="field-label">보유 수량</span>
                    <span class="input-wrap"><input name="qty" inputmode="numeric" data-int placeholder="${ex(market, '200', '100')}" autocomplete="off"><span class="unit">주</span></span>
                </label>
                <label class="field">
                    <span class="field-label">내 평단 <span class="field-optional">선택</span></span>
                    ${moneyInput('avgPrice', market, { placeholder: ex(market, '45,000', '45') })}
                    <span class="hint">넣으면 내 평단 기준 수익률도</span>
                </label>
            </div>
        </section>

        <section class="card panel" id="panel-goal" role="tabpanel" aria-labelledby="tab-goal" hidden data-values>
            <h2 class="card-title">받고 싶은 배당 (세후)</h2>
            <div class="field">
                ${choice('period', [{ value: 'month', label: '한 달에' }, { value: 'year', label: '1년에' }], '목표 기간')}
            </div>
            <label class="field">
                <span class="field-label">목표 배당</span>
                ${moneyInput('goal', market, { placeholder: ex(market, '500,000', '400'), int: true })}
                <span class="hint" data-hint="goal">세금을 떼고 손에 들어오는 금액이에요</span>
            </label>
            <label class="field">
                <span class="field-label">가진 돈 <span class="field-optional">선택</span></span>
                ${moneyInput('cash', market, { placeholder: ex(market, '30,000,000', '20,000'), int: true })}
                <span class="hint">넣으면 이 돈으로 받을 수 있는 배당과 모자란 돈을 보여줘요</span>
            </label>
        </section>
    </div>
    <div class="result-col">
        <section class="card result-card" data-result aria-live="polite"></section>
    </div>
</div>`;
}
