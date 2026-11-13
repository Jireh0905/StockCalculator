/**
 * saving/template.js — 적립식 계산기 화면의 HTML
 *
 * 국내/해외에 따라 단위(원/$)와 세금·환율 칸이 달라서, 시장을 받아 HTML을 만들어요.
 * data-values: 이 안의 입력칸은 values 하나로 묶어서 저장해요.
 * 배당 재투자처럼 버튼으로 고르는 값은 숨은 입력칸(type="hidden")에 넣어 같이 저장해요.
 */
import { isGlobal, moneyInput, ex, MARKETS } from '../../core/market.js';
import { MAX_YEARS } from './calculator.js';

const pctInput = (name, value = '', placeholder = '') => `
    <span class="input-wrap"><input name="${name}" inputmode="decimal" value="${value}" placeholder="${placeholder}" autocomplete="off"><span class="unit">%</span></span>`;

/** 세금·물가 설정 (해외는 양도소득세·공제·환율 칸이 더 있어요) */
function settings(market) {
    const global = isGlobal(market);
    const g = MARKETS.global;
    return `
        <details class="settings">
            <summary>세금·물가 <span class="chip" data-chip></span></summary>
            <div class="settings-body">
                <div class="grid-2">
                    <label class="field">
                        <span class="field-label">${global ? '배당 원천징수' : '배당소득세'}</span>
                        ${pctInput('divTax', global ? '15' : '15.4')}
                        <span class="hint">배당 받을 때 떼요</span>
                    </label>
                    <label class="field">
                        <span class="field-label">물가 상승률 <span class="field-optional">선택</span></span>
                        ${pctInput('inflation', '', '2.5')}
                        <span class="hint">넣으면 오늘 돈 가치로도</span>
                    </label>
                </div>
                ${global ? `
                <div class="grid-2">
                    <label class="field">
                        <span class="field-label">양도소득세</span>
                        ${pctInput('capTax', g.taxRate)}
                        <span class="hint">다 팔 때 (지방세 포함)</span>
                    </label>
                    <label class="field">
                        <span class="field-label">기본 공제</span>
                        <span class="input-wrap"><input name="taxBase" inputmode="numeric" data-int value="${g.taxBase}" autocomplete="off"><span class="unit">원</span></span>
                    </label>
                </div>
                <p class="hint">양도세는 맨 위 기준 환율이 기간 내내 같다고 보고 원화로 계산해요.</p>` : ''}
            </div>
        </details>`;
}

export function template(market) {
    return `
<div class="layout">
    <div class="input-col">
        <section class="card" data-values>
            <h2 class="card-title">예상 수익률</h2>
            <div class="grid-2">
                <label class="field">
                    <span class="field-label">주가 상승</span>
                    ${pctInput('growth', '5')}
                    <span class="hint">1년 평균</span>
                </label>
                <label class="field">
                    <span class="field-label">배당 <span class="field-optional">선택</span></span>
                    ${pctInput('divYield', '', '3')}
                    <span class="hint">1년 배당 수익률 (세전)</span>
                </label>
            </div>
            <div class="field" data-reinvest-field>
                <span class="field-label">배당은</span>
                <div class="segmented small" role="radiogroup" aria-label="배당 재투자" data-choice="reinvest">
                    <button type="button" role="radio" aria-checked="false" data-value="yes">다시 투자</button>
                    <button type="button" role="radio" aria-checked="false" data-value="no">받아서 쓰기</button>
                </div>
                <input type="hidden" name="reinvest">
            </div>
            ${settings(market)}
        </section>

        <div class="segmented" role="tablist" aria-label="계산 방법">
            <button type="button" role="tab" id="tab-grow" aria-controls="panel-grow" aria-selected="true" data-tab="grow">얼마가 될까</button>
            <button type="button" role="tab" id="tab-goal" aria-controls="panel-goal" aria-selected="false" data-tab="goal">목표 금액</button>
        </div>

        <section class="card" data-values>
            <div class="grid-2">
                <label class="field">
                    <span class="field-label">처음 넣는 돈 <span class="field-optional">선택</span></span>
                    ${moneyInput('initial', market, { placeholder: '0', int: true })}
                </label>
                <label class="field">
                    <span class="field-label">기간</span>
                    <span class="input-wrap"><input name="years" inputmode="numeric" data-int value="20" autocomplete="off"><span class="unit">년</span></span>
                    <span class="hint" data-hint="years">1~${MAX_YEARS}년</span>
                </label>
            </div>
            <div class="panel" id="panel-grow" role="tabpanel" aria-labelledby="tab-grow">
                <label class="field">
                    <span class="field-label">매달 넣는 돈</span>
                    ${moneyInput('monthly', market, { placeholder: ex(market, '500,000', '400'), int: true })}
                </label>
            </div>
            <div class="panel" id="panel-goal" role="tabpanel" aria-labelledby="tab-goal" hidden>
                <label class="field">
                    <span class="field-label">목표 금액</span>
                    ${moneyInput('goal', market, { placeholder: ex(market, '300,000,000', '250,000'), int: true })}
                    <span class="hint">기간이 끝날 때 계좌의 평가 금액 (팔기 전)</span>
                </label>
            </div>
        </section>
    </div>
    <div class="result-col">
        <section class="card result-card" data-result aria-live="polite"></section>
    </div>
</div>`;
}
