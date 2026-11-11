/**
 * target/index.js — 목표가 계산기 (본전·목표 수익률이 되는 매도가)
 *
 * 국내: 수수료 + 거래세. 해외: 수수료 + 양도소득세(공제 안 / 공제를 다 썼을 때 두 가지 목표가)
 */
import { calculateTarget, calculateTargetGlobal } from './calculator.js';
import { bindNumberInputs, readValues, fillValues, readNumber } from '../../core/number-input.js';
import { showReceived } from '../../core/received.js';
import { MARKETS, isGlobal, moneyInput, ex, price, money, bigMoney, inputText } from '../../core/market.js';

function template(market) {
    const m = MARKETS[market];
    const taxLabel = isGlobal(market) ? '양도소득세' : '거래세';
    const taxHint = isGlobal(market) ? '지방소득세 포함' : '매도할 때만';
    return `
<div class="layout">
    <div class="input-col">
        <section class="card">
            <label class="field">
                <span class="field-label">매수가</span>
                ${moneyInput('buyPrice', market, { placeholder: ex(market, '44,000', '120') })}
            </label>
            <label class="field">
                <span class="field-label">목표 수익률</span>
                <span class="input-wrap"><input name="goalRate" inputmode="decimal" value="10" autocomplete="off"><span class="unit">%</span></span>
                <span class="hint">수수료·세금을 모두 빼고 남길 수익률</span>
            </label>

            <details class="settings">
                <summary>수수료·세금 (${m.short}) <span class="chip" data-chip></span></summary>
                <div class="settings-body grid-2">
                    <label class="field">
                        <span class="field-label">증권사 수수료</span>
                        <span class="input-wrap"><input name="commRate" inputmode="decimal" value="${m.commRate}" autocomplete="off"><span class="unit">%</span></span>
                        <span class="hint">매수·매도 각각</span>
                    </label>
                    <label class="field">
                        <span class="field-label">${taxLabel}</span>
                        <span class="input-wrap"><input name="taxRate" inputmode="decimal" value="${m.taxRate}" autocomplete="off"><span class="unit">%</span></span>
                        <span class="hint">${taxHint}</span>
                    </label>
                </div>
            </details>
        </section>
    </div>
    <div class="result-col">
        <section class="card result-card" data-result aria-live="polite"></section>
    </div>
</div>`;
}

function readInput(view) {
    return {
        buyPrice: readNumber(view, 'buyPrice'),
        goalRate: readNumber(view, 'goalRate'),
        commRate: readNumber(view, 'commRate'),
        taxRate: readNumber(view, 'taxRate'),
    };
}

function renderResult(el, r, market, { onSave }) {
    if (!r) {
        el.innerHTML = `<div class="result-empty"><span class="icon">🎯</span>매수가와 목표 수익률을 입력하면<br>팔아야 할 가격이 나와요</div>`;
        return;
    }
    const global = isGlobal(market);
    // 해외: 양도세가 붙는지는 1년 수익 합계에 달려 있어서 두 가지 목표가를 함께 보여줘요
    const taxedRows = global ? `
            <li class="divider"><span>공제 250만 원을 다 썼다면</span><span>${money(r.targetTaxed, market)}</span></li>
            <li class="sub"><span>양도소득세까지 빼고 목표 수익률이 되는 가격</span><span>+${r.targetTaxedRise.toFixed(2)}%</span></li>` : '';
    const taxNote = global
        ? `<p class="note">해외 주식 양도소득세는 1년 수익 합계에서 기본 공제 250만 원을 뺀 만큼에 붙어요.
              올해 수익이 공제 안이면 위의 목표가, 이미 공제를 다 썼다면 아래 가격을 보세요.</p>`
        : `<p class="note">실제 주문은 호가 단위(가격 단계)에 맞춰야 해서, 위 가격보다 한 단계 높은 호가로 내면 돼요.</p>`;

    el.innerHTML = `
        <div class="result-label">목표 매도가 <span class="result-label-sub">(${global ? '수수료 반영, 양도세 공제 안' : '수수료·세금 반영'})</span></div>
        <div class="result-amount" style="color:var(--up)">${bigMoney(r.target, market)}</div>
        <span class="rate-pill pill-up">▲ ${r.targetRise.toFixed(2)}% 올라야 해요</span>
        <ul class="rows">
            <li><span>본전 매도가</span><span>${money(r.breakEven, market)}</span></li>
            <li class="sub"><span>매수가보다</span><span>+${r.breakEvenRise.toFixed(2)}%</span></li>
            <li><span>목표가에 팔면 1주당 순이익</span><span>${money(r.profitPerShare, market)}</span></li>
            ${taxedRows}
        </ul>
        ${taxNote}
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
    markets: true,

    /**
     * 다른 기능이 값을 넘겨줄 때 app.js가 불러요. (예: 분할 매수 → "목표가 계산")
     * 매수가만 바꾸고, 목표 수익률·수수료·세금은 원래 넣어둔 값을 그대로 둬요.
     *
     * @param {object | null} inputs - 지금 시장의 저장된 입력값 (처음이면 null)
     * @param {{ buyPrice: number }} payload - 넘겨받은 값
     * @returns 새 입력값 (ctx.inputs와 같은 모양)
     */
    receive(inputs, { buyPrice }) {
        return { ...inputs, values: { ...inputs?.values, buyPrice: inputText(buyPrice) } };
    },

    mount(view, ctx) {
        const market = ctx.market;
        view.innerHTML = template(market);
        const resultEl = view.querySelector('[data-result]');
        const chip = view.querySelector('[data-chip]');
        const calculate = isGlobal(market) ? calculateTargetGlobal : calculateTarget;
        let result = null;

        if (ctx.inputs?.values) fillValues(view, ctx.inputs.values);

        // 다른 기능에서 값을 받아 들어왔으면: 매수가 칸을 잠깐 강조하고 어디서 왔는지 알려줘요
        if (ctx.received) {
            const { from, payload } = ctx.received;
            showReceived(view, ['buyPrice'], `${from?.shortName ?? '다른 계산기'} 평단 ${price(payload.buyPrice, market)}을 매수가로 넣었어요`);
        }

        function refresh() {
            const v = (name) => view.querySelector(`input[name="${name}"]`).value || 0;
            chip.textContent = `수수료 ${v('commRate')}% · ${isGlobal(market) ? '양도세' : '거래세'} ${v('taxRate')}%`;

            result = calculate(readInput(view));
            renderResult(resultEl, result, market, {
                onSave: () => {
                    const input = readInput(view);
                    ctx.addRecord({
                        title: `매수 ${price(input.buyPrice, market)} · 목표 ${input.goalRate}%`,
                        data: { values: readValues(view) },
                        result: { text: money(result.target, market), sub: `본전 ${money(result.breakEven, market)}` },
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
