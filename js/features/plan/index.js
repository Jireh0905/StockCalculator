/**
 * plan/index.js — 하락 대응 계산기 (물타기할까, 손절할까 계획 세우기)
 *
 *   template.js ...... 화면 HTML + 분할 매수 단계 줄 (국내/해외에 따라 단위·수수료 칸이 달라요)
 *   calculator.js .... 물타기 분할 매수·손절 후 재매수 계산 (화면과 무관)
 *   result-view.js ... 결과 카드 + 세 가지 선택 비교표
 *   index.js ......... 위 셋을 연결 + 탭·단계 줄 관리·입력값 기억·기록 저장 (이 파일)
 *
 * 저장 모양 (ctx.inputs):
 *   { tab: 'avg' | 'stop', values: { avgPrice, holdQty, curPrice, commRate, taxRate, stopLine, budget,
 *     stopPrice, rebuyPrice, rebuyAmount }, steps: [ { stepPrice, stepGoal }, ... ] }   ← 값은 화면 글자 그대로
 */
import { template, createStepRow } from './template.js';
import { planAveraging, planStopRebuy } from './calculator.js';
import { renderAvgResult, renderStopResult, stepMessage, signedPercent } from './result-view.js';
import { bindNumberInputs, readValues, fillValues, readNumber, readInt } from '../../core/number-input.js';
import { won } from '../../core/format.js';
import { price, money, signedMoney, isGlobal, inputText, viewMarket } from '../../core/market.js';
import { showReceived } from '../../core/received.js';

const MAX_STEPS = 10;

export default {
    id: 'plan',
    name: '하락 대응 계산기',
    shortName: '하락 대응',
    desc: '물타기할까, 손절할까 계획 세우기',
    group: '계산기',
    icon: 'plan',
    color: 'c6',
    markets: true,
    fx: true,        // 해외: 달러 칸 $/₩ 넣기 + 결과 [$ | 원] 보기 (app.js·core/money-input.js)

    /**
     * 다른 기능이 값을 넘겨줄 때 app.js가 불러요. (예: 손익 계산기에서 손실 → "하락 대응 계산")
     * 평단·보유 수량·현재가만 바꾸고, 물타기 단계·손절 계획·수수료는 그대로 둬요.
     *
     * @param {object | null} inputs - 지금 시장의 저장된 입력값
     * @param {{ avgPrice: number, holdQty: number, curPrice: number }} payload - 손익 계산기의 매수가·수량·매도가
     */
    receive(inputs, { avgPrice, holdQty, curPrice }) {
        return {
            ...inputs,
            values: { ...inputs?.values, avgPrice: inputText(avgPrice), holdQty: won(holdQty), curPrice: inputText(curPrice) },
        };
    },

    mount(view, ctx) {
        const market = ctx.market;
        view.innerHTML = template(market);
        const resultEl = view.querySelector('[data-result]');
        const listEl = view.querySelector('[data-steps]');
        const addBtn = view.querySelector('[data-add]');
        const tabButtons = view.querySelectorAll('.segmented button');
        const valueBoxes = [...view.querySelectorAll('[data-values]')];
        const chip = view.querySelector('[data-chip]');

        // 이 기능의 상태 (MFC의 Document 멤버 변수 같은 것)
        let tab = ctx.inputs?.tab ?? 'avg';
        let avgResult = null;
        let stopResult = null;

        /* ---------- 분할 매수 단계 줄 ---------- */
        const rows = () => [...listEl.querySelectorAll('.step-row')];

        function updateRows() {
            const all = rows();
            all.forEach((row, i) => {
                row.querySelector('.buy-row-title').textContent = `${i + 1}차 매수`;
                row.querySelector('[data-remove]').hidden = all.length === 1; // 한 줄은 꼭 남김
            });
            addBtn.hidden = all.length >= MAX_STEPS;
        }

        function addRow(values) {
            const row = createStepRow(market);
            listEl.append(row);
            if (values) fillValues(row, values);
            updateRows();
            return row;
        }

        /* ---------- 읽기·저장 ---------- */
        const n = (name) => readNumber(view, name);
        const values = () => Object.assign({}, ...valueBoxes.map(box => readValues(box)));
        const snapshot = () => ({ tab, values: values(), steps: rows().map(row => readValues(row)) });
        const remember = () => ctx.saveInputs(snapshot());

        const common = () => ({
            avgPrice: n('avgPrice'),
            holdQty: readInt(view, 'holdQty'),
            commRate: n('commRate'),
            taxRate: isGlobal(market) ? 0 : n('taxRate'), // 해외: 본전·손실 구간이라 양도세 없음
        });

        /* ---------- 입력칸 아래 안내 (몇 % 아래인지, 단계별 결과) ---------- */
        const hints = [...view.querySelectorAll('[data-hint]')];
        hints.forEach(h => { h.dataset.default = h.textContent; });

        /** price가 ref보다 몇 % 위/아래인지 "현재가 −4.30%" 모양으로. 계산할 수 없으면 '' */
        const vs = (price, ref, label) => (price > 0 && ref > 0 ? `${label} ${signedPercent((price / ref - 1) * 100, 1)}` : '');

        function updateHints() {
            const avg = n('avgPrice');
            const cur = n('curPrice');
            // 계획 가격은 현재가가 있으면 현재가 기준, 없으면 평단 기준
            const ref = cur > 0 ? [cur, '현재가'] : [avg, '평단'];
            const text = {
                curPrice: vs(cur, avg, '평단 대비'),
                stopLine: vs(n('stopLine'), ...ref),
                stopPrice: vs(n('stopPrice'), avg, '평단'),
                rebuyPrice: n('stopPrice') > 0 ? vs(n('rebuyPrice'), n('stopPrice'), '손절가') : vs(n('rebuyPrice'), ...ref),
            };
            hints.forEach(h => { h.textContent = text[h.dataset.hint] || h.dataset.default; });

            rows().forEach((row, i) => {
                row.querySelector('[data-step-hint]').textContent = vs(readNumber(row, 'stepPrice'), ...ref);
                const out = row.querySelector('[data-step-result]');
                const r = avgResult?.rows[i];
                out.className = 'step-result';
                if (!r || r.status === 'empty') {
                    out.textContent = '';
                } else if (r.status === 'ok') {
                    out.textContent = `→ ${won(r.qty)}주 · ${money(r.cost, market)} · 평단 ${money(r.avgAfter, market)}${r.overBudget ? ' · 예산 초과' : ''}`;
                    if (r.overBudget) out.classList.add('is-warn');
                } else {
                    out.textContent = stepMessage(r, avgResult.avgPrice, market);
                    out.classList.add('is-warn');
                }
            });

            const v = (name) => view.querySelector(`input[name="${name}"]`).value || 0;
            chip.textContent = isGlobal(market) ? `수수료 ${v('commRate')}%` : `수수료 ${v('commRate')}% · 거래세 ${v('taxRate')}%`;
        }

        /* ---------- 계산 + 그리기 ---------- */
        function refresh() {
            avgResult = planAveraging({
                ...common(),
                steps: rows().map(row => ({ price: readNumber(row, 'stepPrice'), goal: readNumber(row, 'stepGoal') })),
                stopLine: n('stopLine'),
                budget: n('budget'),
            });
            stopResult = planStopRebuy({
                ...common(),
                stopPrice: n('stopPrice'),
                rebuyPrice: n('rebuyPrice'),
                rebuyAmount: n('rebuyAmount'),
            });
            updateHints();

            if (tab === 'avg') {
                const r = avgResult;
                renderAvgResult(resultEl, r, stopResult, viewMarket(market), {
                    onSave: () => ctx.addRecord({
                        title: `평단 ${price(r.avgPrice, market)} × ${won(r.holdQty)}주 · ${r.valid.length}단계 물타기`,
                        sub: '물타기 계획',
                        data: snapshot(),
                        result: { text: money(r.finalAvg, market), sub: `+${money(r.extra, market)}` },
                    }),
                    // 분할 매매 계산기(분할 매수 탭)로 단계별 매수를 그대로 넘겨요 → 거기서 차수별 평단·비중을 다시 확인
                    onSendToSplit: () => ctx.sendTo('split', {
                        avgPrice: r.avgPrice,
                        holdQty: r.holdQty,
                        buys: r.valid.map(s => ({ price: s.price, qty: s.qty })),
                    }),
                    // 손익 계산기에는 최종 평단(소수 둘째 자리)과 총 수량 (물타기 → 손익과 같은 방식)
                    onSendToProfit: () => ctx.sendTo('profit', {
                        buyPrice: Math.round(r.finalAvg * 100) / 100,
                        quantity: r.totalQty,
                    }),
                });
            } else {
                const r = stopResult;
                renderStopResult(resultEl, r, avgResult, viewMarket(market), {
                    onSave: () => ctx.addRecord({
                        title: `평단 ${price(r.avgPrice, market)} × ${won(r.holdQty)}주 · 손절 ${price(r.stopPrice, market)} → 재매수 ${price(r.rebuyPrice, market)}`,
                        sub: '손절 후 재매수',
                        data: snapshot(),
                        result: {
                            text: `본전 ${money(r.breakEven, market)}`,
                            sub: `확정 ${signedMoney(r.realized, market)}`,
                            tone: Math.round(r.realized) < 0 ? 'down' : Math.round(r.realized) > 0 ? 'up' : '',
                        },
                    }),
                    onSendToProfit: () => ctx.sendTo('profit', { buyPrice: r.rebuyPrice, quantity: r.qty }),
                });
            }
        }

        function showTab(next) {
            tab = next;
            tabButtons.forEach(btn => btn.setAttribute('aria-selected', String(btn.dataset.tab === tab)));
            view.querySelector('#panel-avg').hidden = tab !== 'avg';
            view.querySelector('#panel-stop').hidden = tab !== 'stop';
            refresh();
        }

        const changed = () => {
            remember();
            refresh();
        };

        /* ---------- 시작 ---------- */
        if (ctx.inputs?.values) fillValues(view, ctx.inputs.values);
        const savedSteps = ctx.inputs?.steps?.length ? ctx.inputs.steps : [{}];
        savedSteps.forEach(v => addRow(v));

        addBtn.addEventListener('click', () => {
            addRow().querySelector('input').focus();
            changed();
        });
        // 삭제 버튼은 줄마다 연결하지 않고 목록 한 곳에서 받아요 (이벤트 위임)
        listEl.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-remove]');
            if (!btn) return;
            btn.closest('.step-row').remove();
            updateRows();
            changed();
        });
        tabButtons.forEach(btn => btn.addEventListener('click', () => {
            showTab(btn.dataset.tab);
            remember();
        }));
        bindNumberInputs(view, changed);
        showTab(tab);

        // 다른 기능에서 평단·수량·현재가를 받아 들어왔으면: 강조 + 알림
        if (ctx.received) {
            const { from, payload } = ctx.received;
            showReceived(view, ['avgPrice', 'holdQty', 'curPrice'],
                `${from?.shortName ?? '다른 계산기'}에서 평단·수량·현재가를 넣었어요 (${price(payload.avgPrice, market)} × ${won(payload.holdQty)}주 → ${price(payload.curPrice, market)})`);
        }
    },
};
