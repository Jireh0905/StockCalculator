/**
 * dividend/index.js — 배당 계산기 (내 배당 · 목표 배당)
 *
 *   template.js ...... 화면 HTML (국내/해외에 따라 단위·세율·환율 칸이 달라요)
 *   calculator.js .... 배당·세금·목표 수량 계산 (화면과 무관)
 *   result-view.js ... 결과 카드
 *   index.js ......... 위 셋을 연결 + 탭·고르기 버튼·입력값 기억·기록 저장 (이 파일)
 *
 * 저장 모양 (ctx.inputs, 시장마다 따로):
 *   { tab: 'mine' | 'goal', values: { price, dps, freq, fx?, taxRate, qty, avgPrice, period, goal, cash } }
 */
import { template } from './template.js';
import { calculateMyDividend, calculateGoalDividend, freqOf } from './calculator.js';
import { renderMineResult, renderGoalResult } from './result-view.js';
import { bindNumberInputs, readValues, fillValues, readNumber, readInt } from '../../core/number-input.js';
import { won } from '../../core/format.js';
import { price, money, inputText, isGlobal, viewMarket } from '../../core/market.js';
import { getFx } from '../../core/session.js';
import { showReceived } from '../../core/received.js';

/** 처음 열 때 배당 주기: 국내는 연 1회가 많고, 미국은 분기가 많아요 */
const DEFAULT_FREQ = { domestic: '1', global: '4' };

export default {
    id: 'dividend',
    name: '배당금 계산기',
    shortName: '배당',
    desc: '세금 뺀 실제 배당금, 목표 배당에 필요한 돈',
    group: '계산기',
    icon: 'dividend',
    color: 'c4',
    markets: true,
    fx: true,        // 해외: 달러 칸 $/₩ 넣기 + 결과 [$ | 원] 보기 (app.js·core/money-input.js)

    /**
     * 다른 기능이 값을 넘겨줄 때 app.js가 불러요. (예: 분할 매수 → "배당 계산")
     * 내 배당 탭으로 바꾸고 보유 수량·내 평단만 바꿔요. 주가·배당금·주기는 그대로 둬요.
     *
     * @param {object | null} inputs - 지금 시장의 저장된 입력값
     * @param {{ buyPrice: number, quantity: number }} payload - 평단(소수 둘째 자리까지)과 보유 수량
     */
    receive(inputs, { buyPrice, quantity }) {
        return {
            ...inputs,
            tab: 'mine',
            values: { ...inputs?.values, avgPrice: inputText(buyPrice), qty: won(quantity) },
        };
    },

    mount(view, ctx) {
        const market = ctx.market;
        view.innerHTML = template(market);
        const resultEl = view.querySelector('[data-result]');
        const tabButtons = view.querySelectorAll('[role="tab"]');
        const valueBoxes = [...view.querySelectorAll('[data-values]')];
        const chip = view.querySelector('[data-chip]');
        const annualHint = view.querySelector('[data-hint="annual"]');
        const goalHint = view.querySelector('[data-hint="goal"]');
        const defaults = { annual: annualHint.textContent, goal: goalHint.textContent };

        let tab = ctx.inputs?.tab === 'goal' ? 'goal' : 'mine';
        let result = null;

        /* ---------- 고르기 버튼 (배당 주기, 목표 기간) ---------- */
        // 버튼을 누르면 옆의 숨은 입력칸 값을 바꿔요. 그래서 다른 입력칸과 똑같이 저장·복원돼요.
        const hidden = (name) => view.querySelector(`input[type="hidden"][name="${name}"]`);
        function syncChoices() {
            view.querySelectorAll('[data-choice]').forEach(group => {
                const value = hidden(group.dataset.choice).value;
                group.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.value === value)));
            });
        }

        /* ---------- 읽기·저장 ---------- */
        const n = (name) => readNumber(view, name);
        const snapshot = () => ({ tab, values: Object.assign({}, ...valueBoxes.map(box => readValues(box))) });
        const remember = () => ctx.saveInputs(snapshot());
        const common = () => ({
            price: n('price'),
            dps: n('dps'),
            freq: Number(hidden('freq').value),
            taxRate: n('taxRate'),
            fx: isGlobal(market) ? getFx() : NaN, // 해외: 맨 위 기준 환율
        });

        function updateHints() {
            const dps = n('dps');
            const f = freqOf(Number(hidden('freq').value));
            annualHint.textContent = dps > 0
                ? `1년 주당 배당금 = ${price(dps, market)} × ${f.n}번 = ${price(dps * f.n, market)}`
                : defaults.annual;
            // 해외 목표 배당: 원화로 얼마인지 옆에 보여줘요
            const goal = n('goal');
            const fx = isGlobal(market) ? getFx() : NaN; // 해외: 맨 위 기준 환율
            goalHint.textContent = goal > 0 && fx > 0
                ? `≈ ${won(goal * fx)}원 (세금을 떼고 손에 들어오는 금액)`
                : defaults.goal;
            chip.textContent = `${isGlobal(market) ? '현지 원천징수' : '배당소득세'} ${view.querySelector('input[name="taxRate"]').value || 0}%`;
        }

        /* ---------- 계산 + 그리기 ---------- */
        function refresh() {
            updateHints();
            if (tab === 'mine') {
                result = calculateMyDividend(market, { ...common(), qty: readInt(view, 'qty'), avgPrice: n('avgPrice') });
                const r = result;
                renderMineResult(resultEl, r, viewMarket(market), {
                    onSave: () => ctx.addRecord({
                        title: `주당 ${price(r.dps, market)} × ${freqOf(r.freq).label} · ${won(r.qty)}주`,
                        sub: '내 배당',
                        data: snapshot(),
                        result: { text: `1년 ${money(r.annualNet, market)}`, sub: `한 달 ${money(r.monthlyNet, market)}`, tone: 'up' },
                    }),
                    // 적립식 계산기로: 지금 평가 금액을 처음 넣는 돈으로, 현재가 기준 배당 수익률·세율과 함께
                    onSendToSaving: () => ctx.sendTo('saving', {
                        initial: r.invested,
                        divYield: r.yield,
                        divTax: Math.round(r.taxRate * 1000) / 10,
                    }),
                });
            } else {
                result = calculateGoalDividend(market, {
                    ...common(),
                    goal: n('goal'),
                    period: hidden('period').value,
                    cash: n('cash'),
                });
                const r = result;
                renderGoalResult(resultEl, r, viewMarket(market), {
                    onSave: () => ctx.addRecord({
                        title: `${r.period === 'year' ? '1년' : '한 달'} ${money(r.goal, market)} 목표 · 주가 ${price(r.price, market)}`,
                        sub: '목표 배당',
                        data: snapshot(),
                        result: { text: `${won(r.qty)}주`, sub: money(r.invest, market) },
                    }),
                });
            }
        }

        function showTab(next) {
            tab = next;
            tabButtons.forEach(btn => btn.setAttribute('aria-selected', String(btn.dataset.tab === tab)));
            view.querySelector('#panel-mine').hidden = tab !== 'mine';
            view.querySelector('#panel-goal').hidden = tab !== 'goal';
            refresh();
        }

        const changed = () => {
            remember();
            refresh();
        };

        /* ---------- 시작 ---------- */
        hidden('freq').value = DEFAULT_FREQ[market];
        hidden('period').value = 'month';
        valueBoxes.forEach(box => fillValues(box, ctx.inputs?.values));
        syncChoices();

        view.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-choice] button');
            if (!btn) return;
            hidden(btn.closest('[data-choice]').dataset.choice).value = btn.dataset.value;
            syncChoices();
            changed();
        });
        tabButtons.forEach(btn => btn.addEventListener('click', () => {
            showTab(btn.dataset.tab);
            remember();
        }));
        bindNumberInputs(view, changed);
        showTab(tab);

        // 다른 기능에서 평단·수량을 받아 들어왔으면: 강조 + 알림
        if (ctx.received) {
            const { from, payload } = ctx.received;
            showReceived(view, ['qty', 'avgPrice'],
                `${from?.shortName ?? '다른 계산기'} 평단 ${price(payload.buyPrice, market)} × ${won(payload.quantity)}주를 넣었어요`);
        }
    },
};
