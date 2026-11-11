/**
 * average/index.js — 물타기 계산기 (추가 매수 후 평균 단가)
 *
 * 기능 하나를 만드는 가장 작은 예시예요. 새 계산기를 만들 때 이 파일을 본떠서 시작하면 돼요.
 */
import { calculateAverage } from './calculator.js';
import { bindNumberInputs, readValues, fillValues, readNumber, readInt } from '../../core/number-input.js';
import { won, signedWon } from '../../core/format.js';

const template = `
<div class="layout">
    <div class="input-col">
        <section class="card">
            <h2 class="card-title">지금 갖고 있는 주식</h2>
            <div class="grid-2">
                <label class="field">
                    <span class="field-label">평균 단가</span>
                    <span class="input-wrap"><input name="avgPrice" inputmode="decimal" placeholder="52,000" autocomplete="off"><span class="unit">원</span></span>
                </label>
                <label class="field">
                    <span class="field-label">보유 수량</span>
                    <span class="input-wrap"><input name="holdQty" inputmode="numeric" data-int placeholder="30" autocomplete="off"><span class="unit">주</span></span>
                </label>
            </div>
            <h2 class="card-title">추가로 살 주식</h2>
            <div class="grid-2">
                <label class="field">
                    <span class="field-label">매수가</span>
                    <span class="input-wrap"><input name="buyPrice" inputmode="decimal" placeholder="44,000" autocomplete="off"><span class="unit">원</span></span>
                </label>
                <label class="field">
                    <span class="field-label">매수 수량</span>
                    <span class="input-wrap"><input name="buyQty" inputmode="numeric" data-int placeholder="20" autocomplete="off"><span class="unit">주</span></span>
                </label>
            </div>
        </section>
    </div>
    <div class="result-col">
        <section class="card result-card" data-result aria-live="polite"></section>
    </div>
</div>`;

function readInput(view) {
    return {
        avgPrice: readNumber(view, 'avgPrice'),
        holdQty: readInt(view, 'holdQty'),
        buyPrice: readNumber(view, 'buyPrice'),
        buyQty: readInt(view, 'buyQty'),
    };
}

function renderResult(el, r, { onSave }) {
    if (!r) {
        el.innerHTML = `<div class="result-empty"><span class="icon">📊</span>네 칸을 모두 입력하면<br>새 평균 단가가 나와요</div>`;
        return;
    }
    // 평단이 내려가면 파랑(▼), 올라가면 빨강(▲) — 가격 방향 색 규칙과 같게
    const dir = Math.round(r.change) > 0 ? 'up' : Math.round(r.change) < 0 ? 'down' : 'flat';
    const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '';
    el.innerHTML = `
        <div class="result-label">새 평균 단가</div>
        <div class="result-amount">${won(r.newAvg)}<small>원</small></div>
        <span class="rate-pill pill-${dir}">${arrow} ${won(Math.abs(r.change))}원 (${Math.abs(r.changeRate).toFixed(2)}%)</span>
        <ul class="rows">
            <li><span>총 보유 수량</span><span>${won(r.totalQty)}주</span></li>
            <li><span>추가 매수 금액</span><span>${won(r.addCost)}원</span></li>
            <li><span>총 매수 금액</span><span>${won(r.totalCost)}원</span></li>
        </ul>
        <p class="note">수수료는 빼고 계산한 단순 평균이에요. 증권사 앱의 평단과 몇 원 다를 수 있어요.</p>
        <button type="button" class="save-btn">기록에 저장</button>`;
    el.querySelector('.save-btn').addEventListener('click', onSave);
}

export default {
    id: 'average',
    name: '물타기 계산기',
    desc: '추가로 사면 평균 단가가 얼마가 될까',
    group: '계산기',
    icon: 'average',
    color: 'c2',

    mount(view, ctx) {
        view.innerHTML = template;
        const resultEl = view.querySelector('[data-result]');
        let result = null;

        if (ctx.inputs?.values) fillValues(view, ctx.inputs.values);

        function refresh() {
            result = calculateAverage(readInput(view));
            renderResult(resultEl, result, {
                onSave: () => {
                    const input = readInput(view);
                    ctx.addRecord({
                        title: `평단 ${won(input.avgPrice)}원에 ${won(input.buyPrice)}원 × ${won(input.buyQty)}주`,
                        data: { values: readValues(view) },
                        result: { text: `${won(result.newAvg)}원`, sub: `${signedWon(result.change)}원` },
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
