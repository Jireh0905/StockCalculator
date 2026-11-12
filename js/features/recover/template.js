/**
 * recover/template.js — 손실 회복 계산기 화면의 HTML
 *
 * %만 다루는 계산이라 국내/해외 구분이 없어요.
 *   1. 지금 손실률
 *   2. 앞으로 오르고 내리는 줄 (한 줄에 모두): [기간][단위▾] [▲/▼] [%]  결과  ⧉ ✕   (최대 50줄)
 *   3. 그 뒤로 [매일|매주|매달|매년] [%] (선택) → 본전까지 걸리는 기간
 * 단위는 작은 선택 상자, 오름/내림은 누를 때마다 바뀌는 버튼이에요. 고른 값은 숨은 입력칸에 넣어 다른 칸과 같이 저장해요.
 */

/** 몇 개 중 하나 고르기 버튼 + 바로 뒤에 값을 담는 숨은 입력칸 */
export function choice(name, options, label, cls = '') {
    return `
        <div class="segmented small ${cls}" role="radiogroup" aria-label="${label}" data-choice="${name}">
            ${options.map(o => `<button type="button" role="radio" aria-checked="false" data-value="${o.value}">${o.label}</button>`).join('')}
        </div>
        <input type="hidden" name="${name}">`;
}

export const MAX_STEPS = 50;

const UNIT_OPTIONS = [
    { value: 'day', label: '일' }, { value: 'week', label: '주' },
    { value: 'month', label: '달' }, { value: 'year', label: '년' },
];

export const template = `
<div class="layout">
    <div class="input-col">
        <section class="card" data-values>
            <h2 class="card-title">지금 상황</h2>
            <label class="field">
                <span class="field-label">지금 손실률</span>
                <span class="input-wrap"><input name="loss" inputmode="decimal" placeholder="30" autocomplete="off"><span class="unit">%</span></span>
                <span class="hint">산 가격보다 몇 % 떨어졌는지 (본전에서 시작하려면 비워두세요)</span>
            </label>
            <input type="hidden" name="view">
        </section>

        <section class="card">
            <h2 class="card-title">앞으로 오르고 내리면 <span class="card-title-note" data-step-count></span></h2>
            <div class="seq-head" aria-hidden="true">
                <span>번</span><span>기간</span><span>방향</span><span>비율</span><span class="seq-col-out">산 가격 대비</span><span></span>
            </div>
            <div class="seq-list" data-steps></div>
            <div class="seq-add">
                <button type="button" class="add-row-btn" data-add="1">+ 1줄</button>
                <button type="button" class="add-row-btn" data-add="5">+ 5줄</button>
            </div>
            <p class="hint seq-add-hint">새 줄은 마지막 줄과 같은 값으로 추가돼요 (최대 ${MAX_STEPS}줄). ⧉는 그 줄 복사</p>
            <div class="panel-extra" data-values>
                <div class="field">
                    <span class="field-label">그 뒤로 <span class="field-optional">선택</span></span>
                    <div class="seq-fields seq-after">
                        ${choice('afterUnit', UNIT_OPTIONS.map(o => ({ value: o.value, label: `매${o.label}` })), '그 뒤 기간 단위', 'cols-4')}
                        <span class="input-wrap"><input name="after" inputmode="decimal" placeholder="2" autocomplete="off"><span class="unit">%</span></span>
                    </div>
                    <span class="hint">넣으면 본전까지 걸리는 기간을 계산하고 그래프에 점선으로 이어요</span>
                </div>
            </div>
        </section>
    </div>
    <div class="result-col">
        <section class="card result-card" data-result aria-live="polite"></section>
    </div>
</div>`;

/** 오르내림 한 줄: 번호 | [기간][단위▾] | [▲/▼] | [%] | 결과 | ⧉ ✕ */
export function createStepRow() {
    const row = document.createElement('div');
    row.className = 'seq-row';
    row.innerHTML = `
        <span class="seq-no" data-no></span>
        <span class="seq-period">
            <input name="dur" inputmode="numeric" data-int placeholder="1" autocomplete="off" aria-label="기간">
            <select data-unit aria-label="기간 단위">
                ${UNIT_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
            </select>
            <input type="hidden" name="unit">
        </span>
        <button type="button" class="dir-btn" data-dir aria-label="오름/내림 바꾸기"></button>
        <input type="hidden" name="dir">
        <span class="seq-pct"><input name="pct" inputmode="decimal" placeholder="5" autocomplete="off" aria-label="비율"><span class="unit">%</span></span>
        <span class="seq-out" data-step-result></span>
        <span class="seq-actions">
            <button type="button" class="icon-mini" data-copy aria-label="이 줄 복사" title="이 줄 복사">⧉</button>
            <button type="button" class="icon-mini" data-remove aria-label="이 줄 삭제" title="삭제">✕</button>
        </span>`;
    return row;
}
