/**
 * target/index.js — 목표가 계산기 (본전·목표 수익률이 되는 매도가)
 */
import { calculateTarget } from './calculator.js';
import { bindNumberInputs, readValues, fillValues, readNumber } from '../../core/number-input.js';
import { won } from '../../core/format.js';

const template = `
<div class="layout">
    <div class="input-col">
        <section class="card">
            <label class="field">
                <span class="field-label">매수가</span>
                <span class="input-wrap"><input name="buyPrice" inputmode="decimal" placeholder="44,000" autocomplete="off"><span class="unit">원</span></span>
            </label>
            <label class="field">
                <span class="field-label">목표 수익률</span>
                <span class="input-wrap"><input name="goalRate" inputmode="decimal" value="10" autocomplete="off"><span class="unit">%</span></span>
                <span class="hint">수수료·세금을 모두 빼고 남길 수익률</span>
            </label>

            <details class="settings">
                <summary>수수료·세금 (국내) <span class="chip" data-chip></span></summary>
                <div class="settings-body grid-2">
                    <label class="field">
                        <span class="field-label">증권사 수수료</span>
                        <span class="input-wrap"><input name="commRate" inputmode="decimal" value="0.015" autocomplete="off"><span class="unit">%</span></span>
                        <span class="hint">매수·매도 각각</span>
                    </label>
                    <label class="field">
                        <span class="field-label">거래세</span>
                        <span class="input-wrap"><input name="taxRate" inputmode="decimal" value="0.20" autocomplete="off"><span class="unit">%</span></span>
                        <span class="hint">매도할 때만</span>
                    </label>
                </div>
            </details>
        </section>
    </div>
    <div class="result-col">
        <section class="card result-card" data-result aria-live="polite"></section>
    </div>
</div>`;

function readInput(view) {
    return {
        buyPrice: readNumber(view, 'buyPrice'),
        goalRate: readNumber(view, 'goalRate'),
        commRate: readNumber(view, 'commRate'),
        taxRate: readNumber(view, 'taxRate'),
    };
}

function renderResult(el, r, { onSave }) {
    if (!r) {
        el.innerHTML = `<div class="result-empty"><span class="icon">🎯</span>매수가와 목표 수익률을 입력하면<br>팔아야 할 가격이 나와요</div>`;
        return;
    }
    el.innerHTML = `
        <div class="result-label">목표 매도가 <span style="font-weight:400;color:var(--text-3)">(수수료·세금 반영)</span></div>
        <div class="result-amount" style="color:var(--up)">${won(r.target)}<small>원</small></div>
        <span class="rate-pill pill-up">▲ ${r.targetRise.toFixed(2)}% 올라야 해요</span>
        <ul class="rows">
            <li><span>본전 매도가</span><span>${won(r.breakEven)}원</span></li>
            <li class="sub"><span>매수가보다</span><span>+${r.breakEvenRise.toFixed(2)}%</span></li>
            <li><span>목표가에 팔면 1주당 순이익</span><span>${won(r.profitPerShare)}원</span></li>
        </ul>
        <p class="note">실제 주문은 호가 단위(가격 단계)에 맞춰야 해서, 위 가격보다 한 단계 높은 호가로 내면 돼요.</p>
        <button type="button" class="save-btn">기록에 저장</button>`;
    el.querySelector('.save-btn').addEventListener('click', onSave);
}

export default {
    id: 'target',
    name: '목표가 계산기',
    shortName: '목표가',
    desc: '본전·목표 수익률이 되는 매도가',
    group: '계산기',
    icon: 'target',
    color: 'c3',

    mount(view, ctx) {
        view.innerHTML = template;
        const resultEl = view.querySelector('[data-result]');
        const chip = view.querySelector('[data-chip]');
        let result = null;

        if (ctx.inputs?.values) fillValues(view, ctx.inputs.values);

        function refresh() {
            const v = (name) => view.querySelector(`input[name="${name}"]`).value || 0;
            chip.textContent = `수수료 ${v('commRate')}% · 거래세 ${v('taxRate')}%`;

            result = calculateTarget(readInput(view));
            renderResult(resultEl, result, {
                onSave: () => {
                    const input = readInput(view);
                    ctx.addRecord({
                        title: `매수 ${won(input.buyPrice)}원 · 목표 ${input.goalRate}%`,
                        data: { values: readValues(view) },
                        result: { text: `${won(result.target)}원`, sub: `본전 ${won(result.breakEven)}원` },
                    });
                },
            });
        }

        bindNumberInputs(view, () => {
            ctx.saveInputs({ values: readValues(view) });
            refresh();
        });
        refresh();
    },
};
