/**
 * saving/index.js — 적립식 계산기 (얼마가 될까 · 목표 금액)
 *
 *   template.js ...... 화면 HTML (국내/해외에 따라 단위·세금·환율 칸이 달라요)
 *   calculator.js .... 매달 복리 계산·재투자 비교·목표 역산 (화면과 무관)
 *   chart.js ......... SVG 막대그래프·연도별 표
 *   result-view.js ... 결과 카드
 *   index.js ......... 위를 연결 + 그래프 누르기·표 펼치기·입력값 기억·기록 저장 (이 파일)
 *
 * 저장 모양 (ctx.inputs, 시장마다 따로):
 *   { tab: 'grow' | 'goal', values: { growth, divYield, reinvest, divTax, inflation, capTax?, taxBase?, fx?,
 *     initial, years, monthly, goal } }
 */
import { template } from './template.js';
import { calculateSaving, calculateGoal, MAX_YEARS } from './calculator.js';
import { renderGrowResult, renderGoalResult } from './result-view.js';
import { caption } from './chart.js';
import { bindNumberInputs, readValues, fillValues, readNumber, readInt } from '../../core/number-input.js';
import { won, wonPrecise } from '../../core/format.js';
import { money, inputText, isGlobal, viewMarket } from '../../core/market.js';
import { getFx } from '../../core/session.js';
import { showReceived } from '../../core/received.js';

export default {
    id: 'saving',
    name: '적립식 계산기',
    shortName: '적립식',
    desc: '매달 넣으면 얼마가 될까, 복리 효과',
    group: '계산기',
    icon: 'saving',
    color: 'c7',
    markets: true,
    fx: true,        // 해외: 달러 칸 $/₩ 넣기 + 결과 [$ | 원] 보기 (app.js·core/money-input.js)

    /**
     * 계산기 위 종목 검색 줄에서 종목을 골랐을 때 채울 칸 (core/stock-bar.js가 불러요. 국내는 원화, 해외는 달러)
     * 1년 주당 배당금 ÷ 현재가 → 배당 수익률 (주가 상승률은 예상이라 그대로).
     */
    stockFill({ view, data, market }) {
        if (!(data.dps > 0)) return { fields: [], note: '배당 정보가 없는 종목이에요' };
        // ETF처럼 1년 배당을 수익률로 추정한 종목은 수익률을 그대로, 아니면 1년 배당 ÷ 현재가
        const pct = (data.dpsEstimated ? data.divYield : data.dps / data.price * 100).toFixed(2);
        return {
            fields: [{ input: view.querySelector('input[name="divYield"]'), value: pct, label: `배당 수익률 ${pct}%` }],
            note: data.dpsEstimated ? '최근 12개월 분배율' : `1년 배당 ${money(data.dps, market)} ÷ ${money(data.price, market)}`,
        };
    },

    /**
     * 다른 기능이 값을 넘겨줄 때 app.js가 불러요. (예: 배당 → "적립식으로 보기")
     * 얼마가 될까 탭으로 바꾸고, 처음 넣는 돈·배당 수익률·배당세를 받은 값으로, 배당은 다시 투자로.
     *
     * @param {object | null} inputs - 지금 시장의 저장된 입력값
     * @param {{ initial: number, divYield: number, divTax: number }} payload
     */
    receive(inputs, { initial, divYield, divTax }) {
        return {
            ...inputs,
            tab: 'grow',
            values: {
                ...inputs?.values,
                initial: inputText(initial),
                divYield: wonPrecise(Math.round(divYield * 100) / 100),
                divTax: String(divTax),
                reinvest: 'yes',
            },
        };
    },

    mount(view, ctx) {
        const market = ctx.market;
        view.innerHTML = template(market);
        const resultEl = view.querySelector('[data-result]');
        const tabButtons = view.querySelectorAll('[role="tab"]');
        const valueBoxes = [...view.querySelectorAll('[data-values]')];
        const chip = view.querySelector('[data-chip]');
        const yearsHint = view.querySelector('[data-hint="years"]');
        const yearsDefault = yearsHint.textContent;

        let tab = ctx.inputs?.tab === 'goal' ? 'goal' : 'grow';
        let result = null;

        /* ---------- 배당 재투자 고르기 (숨은 입력칸에 저장) ---------- */
        const reinvestInput = view.querySelector('input[name="reinvest"]');
        const syncChoice = () => view.querySelectorAll('[data-choice="reinvest"] button')
            .forEach(b => b.setAttribute('aria-checked', String(b.dataset.value === reinvestInput.value)));

        /* ---------- 읽기·저장 ---------- */
        const n = (name) => readNumber(view, name);
        const snapshot = () => ({ tab, values: Object.assign({}, ...valueBoxes.map(box => readValues(box))) });
        const remember = () => ctx.saveInputs(snapshot());
        const common = () => ({
            market,
            initial: n('initial'),
            years: readInt(view, 'years'),
            growth: n('growth'),
            divYield: n('divYield'),
            reinvest: reinvestInput.value !== 'no',
            divTax: n('divTax'),
            inflation: n('inflation'),
            ...(isGlobal(market) ? { capTax: n('capTax'), taxBase: readInt(view, 'taxBase'), fx: getFx() } : {}),
        });

        function updateHints() {
            const y = readInt(view, 'years');
            yearsHint.textContent = y > MAX_YEARS ? `${MAX_YEARS}년까지 계산할 수 있어요` : y >= 1 ? `${won(y * 12)}달` : yearsDefault;
            yearsHint.classList.toggle('is-warn', y > MAX_YEARS);
            // 배당이 없으면 "배당은 다시 투자/받아서 쓰기"는 의미가 없어서 흐리게
            view.querySelector('[data-reinvest-field]').classList.toggle('is-muted', !(n('divYield') > 0));
            const v = (name) => view.querySelector(`input[name="${name}"]`)?.value || 0;
            chip.textContent = `배당세 ${v('divTax')}%${n('inflation') > 0 ? ` · 물가 ${v('inflation')}%` : ''}`;
        }

        /* ---------- 계산 + 그리기 ---------- */
        function refresh() {
            updateHints();
            if (tab === 'grow') {
                result = calculateSaving({ ...common(), monthly: n('monthly') });
                const r = result;
                renderGrowResult(resultEl, r, {
                    onSave: () => ctx.addRecord({
                        title: `${r.monthly > 0 ? `매달 ${money(r.monthly, market)}` : `처음 ${money(r.initial, market)}`} · ${r.years}년 · 연 ${r.yearly.toFixed(1)}%`,
                        sub: '얼마가 될까',
                        data: snapshot(),
                        result: { text: money(r.final, market), sub: `원금 ${money(r.principal, market)}`, tone: r.gain >= 0 ? 'up' : 'down' },
                    }),
                });
            } else {
                result = calculateGoal({ ...common(), goal: n('goal') });
                const r = result;
                renderGoalResult(resultEl, r, {
                    onSave: () => ctx.addRecord({
                        title: `${r.years}년 뒤 ${money(r.goal, market)} 목표`,
                        sub: '목표 금액',
                        data: snapshot(),
                        result: { text: `매달 ${money(r.monthly, market)}`, sub: `연 ${r.yearly.toFixed(1)}%` },
                    }),
                });
            }
        }

        function showTab(next) {
            tab = next;
            tabButtons.forEach(btn => btn.setAttribute('aria-selected', String(btn.dataset.tab === tab)));
            view.querySelector('#panel-grow').hidden = tab !== 'grow';
            view.querySelector('#panel-goal').hidden = tab !== 'goal';
            refresh();
        }

        const changed = () => {
            remember();
            refresh();
        };

        /* ---------- 그래프 막대 고르기 ---------- */
        // 막대를 누르거나 마우스를 올리면: 위 설명 줄을 그 해로 바꾸고, 아래 표의 같은 줄을 강조해요
        function selectYear(year) {
            const row = result?.rows.find(r => r.year === year);
            if (!row) return;
            resultEl.querySelector('[data-caption]').innerHTML = caption(row, viewMarket(market));
            resultEl.querySelectorAll('.bar').forEach(g => g.classList.toggle('is-selected', Number(g.dataset.year) === year));
            resultEl.querySelectorAll('.year-table tr[data-year]').forEach(tr => tr.classList.toggle('is-selected', Number(tr.dataset.year) === year));
        }
        resultEl.addEventListener('click', (e) => {
            const bar = e.target.closest('.bar');
            if (bar) selectYear(Number(bar.dataset.year));
            const row = e.target.closest('.year-table tr[data-year]');
            if (row) selectYear(Number(row.dataset.year));
            if (e.target.closest('[data-table-toggle]')) {
                const wrap = resultEl.querySelector('.year-table-wrap');
                const collapsed = wrap.dataset.collapsed === 'true';
                wrap.dataset.collapsed = String(!collapsed);
                e.target.closest('[data-table-toggle]').textContent = collapsed ? '접기 ▴' : '전체 보기 ▾';
            }
        });
        resultEl.addEventListener('mouseover', (e) => {
            const bar = e.target.closest('.bar');
            if (bar) selectYear(Number(bar.dataset.year));
        });

        /* ---------- 시작 ---------- */
        reinvestInput.value = 'yes';
        valueBoxes.forEach(box => fillValues(box, ctx.inputs?.values));
        syncChoice();

        view.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-choice="reinvest"] button');
            if (!btn) return;
            reinvestInput.value = btn.dataset.value;
            syncChoice();
            changed();
        });
        tabButtons.forEach(btn => btn.addEventListener('click', () => {
            showTab(btn.dataset.tab);
            remember();
        }));
        bindNumberInputs(view, changed);
        showTab(tab);

        // 다른 기능에서 값을 받아 들어왔으면: 강조 + 알림
        if (ctx.received) {
            const { from, payload } = ctx.received;
            showReceived(view, ['initial', 'divYield', 'divTax'],
                `${from?.shortName ?? '다른 계산기'}에서 지금 평가 금액 ${money(payload.initial, market)}과 배당 ${payload.divYield.toFixed(2)}%를 넣었어요`);
        }
    },
};
