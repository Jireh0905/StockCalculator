/**
 * recover/index.js — 손실 회복 계산기
 *
 *   template.js ...... 화면 HTML + 오르내림 줄 (한 줄: 기간·단위·방향·비율·결과·복사·삭제)
 *   calculator.js .... 거래일 단위 하루 값 계산, 봉 묶기, 날짜 (화면과 무관)
 *   chart.js ......... 흐름 차트 / 일봉·주봉·월봉·년봉 (SVG)
 *   result-view.js ... 결과 카드 + 그래프 보기 버튼
 *   index.js ......... 위를 연결 + 줄 관리·십자선·봉 누르기·스크롤·입력값 기억·기록 저장 (이 파일)
 *
 * %만 다뤄서 국내/해외 버튼이 없어요 (markets 없음).
 * 저장 모양 (ctx.inputs):
 *   { values: { loss, view, after, afterUnit }, steps: [ { dur, unit, dir, pct }, ... ] }
 *   예전 모양(1년 단위)도 읽어요: steps에 dur·unit이 없으면 1년, values.annual은 매년, view 'line'은 흐름.
 */
import { template, createStepRow, MAX_STEPS } from './template.js';
import { calculateRecovery, autoCandle, candleOk, formatDays } from './calculator.js';
import { renderResult, refRowsHtml } from './result-view.js';
import { longDate } from './chart.js';
import { bindNumberInputs, readValues, fillValues, readNumber, readInt, formatInput } from '../../core/number-input.js';
import { parseNumber } from '../../core/format.js';
import { showReceived } from '../../core/received.js';

/** 처음 열 때: 빈 한 줄 (1달 동안 오름) */
const FIRST_STEPS = [{ dur: '1', unit: 'month', dir: 'up', pct: '' }];

/** 예전 모양으로 저장된 값 바꾸기 (1년마다 → 1년 단위 줄, annual → 매년, 선 → 흐름) */
function normalize(inputs) {
    const values = { ...inputs?.values };
    if (values.after === undefined && values.annual !== undefined) {
        values.after = values.annual;
        values.afterUnit = 'year';
    }
    delete values.annual;
    if (values.view === 'line') values.view = 'flow';
    const steps = inputs?.steps?.length
        ? inputs.steps.slice(0, MAX_STEPS).map(s => ({ dur: s.dur ?? '1', unit: s.unit ?? 'year', dir: s.dir ?? 'up', pct: s.pct ?? '' }))
        : FIRST_STEPS;
    return { values, steps };
}

const pctText = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`;

export default {
    id: 'recover',
    name: '손실 회복 계산기',
    shortName: '손실 회복',
    desc: '−30%면 몇 % 올라야 본전? 언제쯤?',
    group: '계산기',
    icon: 'recover',
    color: 'c8',

    /**
     * 다른 기능이 값을 넘겨줄 때 app.js가 불러요. (예: 손익 계산기에서 손실 → "손실 회복 계산")
     * 지금 손실률만 바꾸고, 앞으로의 오르내림 계획은 그대로 둬요.
     * @param {object | null} inputs - 지금 저장된 입력값
     * @param {{ loss: number }} payload - 손실률 (%)
     */
    receive(inputs, { loss }) {
        return { ...inputs, values: { ...inputs?.values, loss: String(loss) } };
    },

    mount(view, ctx) {
        view.innerHTML = template;
        const resultEl = view.querySelector('[data-result]');
        const listEl = view.querySelector('[data-steps]');
        const addBtns = [...view.querySelectorAll('[data-add]')];
        const countEl = view.querySelector('[data-step-count]');
        const valueBoxes = [...view.querySelectorAll('[data-values]')];
        const viewInput = view.querySelector('input[name="view"]');
        const today = new Date();    // "지금" = 오늘. 그래프 날짜·본전 회복 날짜의 기준

        let result = null;
        let chart = null;            // 지금 그래프 (흐름: 십자선 / 봉: 스크롤·봉 누르기)
        let selected = null;         // 누른 봉 번호 (스크롤로 다시 그려도 유지)
        let focusDay = 0;            // 봉 차트에서 화면 가운데의 거래일 → 보기를 바꿔도 같은 날짜를 보여줘요
        // 손실률별 표: 직접 넣은 손실률(없으면 지금 손실률)과 펼침 상태. 결과를 다시 그려도 유지해요
        const ref = { value: null, open: false };

        /* ---------- "그 뒤로" 단위 고르기 버튼 ---------- */
        const afterUnit = view.querySelector('input[name="afterUnit"]');
        const syncAfter = () => view.querySelectorAll('[data-choice="afterUnit"] button')
            .forEach(b => b.setAttribute('aria-checked', String(b.dataset.value === afterUnit.value)));

        /* ---------- 오르내림 줄 (한 줄짜리) ---------- */
        const rows = () => [...listEl.querySelectorAll('.seq-row')];
        const field = (row, name) => row.querySelector(`input[name="${name}"]`);

        /** 줄의 숨은 값(단위·방향)을 화면(선택 상자·버튼)에 반영 */
        function syncRow(row) {
            row.querySelector('[data-unit]').value = field(row, 'unit').value || 'month';
            const up = field(row, 'dir').value !== 'down';
            const btn = row.querySelector('[data-dir]');
            btn.textContent = up ? '▲' : '▼';
            btn.className = `dir-btn ${up ? 'is-up' : 'is-down'}`;
            btn.setAttribute('aria-label', up ? '오름 (누르면 내림)' : '내림 (누르면 오름)');
        }
        function updateRows() {
            const all = rows();
            all.forEach((row, i) => {
                row.querySelector('[data-no]').textContent = i + 1;
                row.querySelector('[data-remove]').hidden = all.length <= 1;
            });
            const left = MAX_STEPS - all.length;
            addBtns.forEach(b => { b.disabled = left < 1; b.textContent = `+ ${Math.min(Number(b.dataset.add), Math.max(left, 1))}줄`; });
            addBtns[1].hidden = left < 2;
        }
        /** 줄 추가. values가 없으면 기준 줄(마지막 줄)과 같은 값으로 */
        function addRow(values, after = null) {
            const ref = after ?? rows().at(-1);
            const base = values ?? (ref ? readValues(ref) : FIRST_STEPS[0]);
            const row = createStepRow();
            if (after) after.after(row); else listEl.append(row);
            fillValues(row, base);
            if (!field(row, 'unit').value) field(row, 'unit').value = 'month';
            if (!field(row, 'dir').value) field(row, 'dir').value = 'up';
            syncRow(row);
            return row;
        }

        /* ---------- 읽기·저장 ---------- */
        const n = (name) => readNumber(view, name);
        const snapshot = () => ({
            values: Object.assign({}, ...valueBoxes.map(box => readValues(box))),
            steps: rows().map(row => readValues(row)),
        });
        const remember = () => ctx.saveInputs(snapshot());

        /** 줄 끝 결과 "−24.0%"와 위쪽 "8줄 · 지금부터 5개월" */
        function updateStepResults() {
            rows().forEach((row, i) => {
                const s = result?.status === 'ok' ? result.rows[i] : null;
                const out = row.querySelector('[data-step-result]');
                out.className = 'seq-out';
                out.title = '';
                if (!s || s.status === 'empty') {
                    out.textContent = '';
                } else if (s.status === 'over' || s.status === 'cut') {
                    out.textContent = '제외';
                    out.title = s.status === 'over' ? '100%보다 많이 내릴 수는 없어요' : '50년을 넘어서 계산에서 뺐어요';
                    out.classList.add('is-warn');
                } else {
                    out.textContent = s.needMore === null ? '0' : pctText(s.fromCost);
                    out.title = `지금부터 ${formatDays(s.endDay)} · ${s.needMore === null ? '다 잃었어요' : s.needMore > 0 ? `본전까지 +${s.needMore.toFixed(1)}%` : '본전 회복'}`;
                    out.classList.add(s.fromCost >= -1e-9 ? 'is-up' : 'is-down');
                }
            });
            const total = rows().length;
            countEl.textContent = result?.scenarioDays > 0 ? `${total}줄 · 지금부터 ${formatDays(result.scenarioDays)}` : `${total}줄`;
        }

        /** 지금 보여줄 그래프: 기본은 흐름. 고른 봉 단위를 쓸 수 없으면(너무 많거나 적으면) 맞는 단위로 */
        function currentView(r) {
            const days = r?.series ? r.series.length - 1 : 0;
            const chosen = viewInput.value || 'flow';
            if (chosen === 'flow' || days === 0) return 'flow';
            if (candleOk(days, chosen)) return chosen;
            return autoCandle(r.scenarioDays, days) ?? 'flow';
        }

        /* ---------- 계산 + 그리기 ---------- */
        function refresh() {
            result = calculateRecovery({
                loss: n('loss'),
                steps: rows().map(row => ({
                    dur: readInt(row, 'dur'),
                    unit: field(row, 'unit').value,
                    dir: field(row, 'dir').value,
                    pct: readNumber(row, 'pct'),
                })),
                after: n('after'),
                afterUnit: afterUnit.value,
            });
            const r = result;
            selected = null;
            chart = renderResult(resultEl, r, currentView(r), {
                today,
                ref,
                onSave: () => {
                    const moves = r.valid.map(s => `${s.dur}${s.unitLabel} ${s.signed > 0 ? '+' : '−'}${Math.abs(s.signed)}%`);
                    ctx.addRecord({
                        title: [r.loss > 0 ? `손실 ${r.loss}%` : '본전에서',
                            moves.length > 3 ? `${moves.slice(0, 3).join(' → ')} 외 ${moves.length - 3}줄` : moves.join(' → '),
                            r.projection ? `${r.projection.every} ${r.projection.after}%` : '']
                            .filter(Boolean).join(' · '),
                        data: snapshot(),
                        result: r.loss > 0
                            ? { text: `+${r.need.toFixed(2)}%`, sub: r.recoveredDay > 0 ? `약 ${formatDays(r.recoveredDay)}` : '', tone: 'up' }
                            : { text: `${r.final >= 100 ? '+' : '−'}${Math.abs(r.final - 100).toFixed(2)}%`, tone: r.final >= 100 ? 'up' : 'down' },
                    });
                },
            });
            updateStepResults();
            if (chart?.kind === 'candle') bindCandleScroll();
        }

        const changed = () => {
            remember();
            refresh();
        };

        /* ---------- 봉 차트: 스크롤 + 같은 날짜 유지 ---------- */
        /**
         * 봉 차트를 옆으로 밀면: 보이는 봉에 맞춰 세로 눈금을 다시 잡아 그려요.
         * 스크롤 이벤트는 아주 자주 와서, 화면을 다시 그리는 때(requestAnimationFrame)에 한 번만 그려요.
         * 처음에는 직전에 보던 날짜(focusDay)가 화면 가운데 오도록 스크롤해요.
         */
        function bindCandleScroll() {
            const box = resultEl.querySelector('[data-candle-scroll]');
            if (!box) return;
            const plot = resultEl.querySelector('[data-candle-plot]');
            const axis = resultEl.querySelector('[data-candle-axis]');
            // 이 스크롤 상자의 봉 차트를 붙잡아 둬요. 스크롤 직후 보기를 바꾸면 chart가 다른 그래프로 바뀌어서,
            // 늦게 도착한 다시 그리기가 엉뚱한 그래프를 건드리지 않게 (그리고 화면에서 빠진 상자는 무시)
            const candle = chart;
            const paint = () => {
                if (!box.isConnected) return;
                const { plot: p, axis: a } = candle.redraw(box.scrollLeft, box.clientWidth);
                plot.innerHTML = p;
                axis.innerHTML = a;
                if (selected !== null) markSelected(selected);
            };
            // 직전에 보던 날짜로 (가운데 정렬). 처음(지금)이면 왼쪽 끝 그대로
            if (focusDay > 0 && candle.scrollable) {
                box.scrollLeft = Math.max(0, (focusDay / candle.size) * candle.slot - box.clientWidth / 2);
                paint();
            }
            let pending = false;
            box.addEventListener('scroll', () => {
                if (!box.isConnected) return;
                focusDay = ((box.scrollLeft + box.clientWidth / 2) / candle.slot) * candle.size;
                if (box.scrollLeft < 2) focusDay = 0;
                if (pending) return;
                pending = true;
                requestAnimationFrame(() => { pending = false; paint(); });
            }, { passive: true });
        }

        /** 누른 봉 강조 */
        function markSelected(i) {
            resultEl.querySelectorAll('.candle').forEach(g => g.classList.toggle('is-selected', Number(g.dataset.candle) === i));
        }
        /** 봉을 누르면: 위 설명 줄에 그 봉의 날짜와 시가·종가·고가·저가 (산 가격 대비 %) */
        function selectCandle(i) {
            const c = chart?.candles?.[i];
            if (!c) return;
            selected = i;
            const need = c.close >= 100 ? '본전 위' : c.close <= 0 ? '회복 불가' : `본전까지 +${((100 / c.close - 1) * 100).toFixed(1)}%`;
            resultEl.querySelector('[data-caption]').innerHTML =
                `<b>${chart.period(c)}</b> 시가 ${pctText(c.open - 100)} → 종가 ${pctText(c.close - 100)}
                 <span>고가 ${pctText(c.high - 100)} · 저가 ${pctText(c.low - 100)} · ${need}${c.projected ? ' · 가정 구간' : ''}</span>`;
            markSelected(i);
        }

        /* ---------- 흐름 차트: 십자선 ---------- */
        /** 그래프 위 x(px)의 날짜로 세로선·점·설명 줄을 옮겨요 (증권사 앱의 십자선) */
        function moveCross(clientX) {
            const svg = resultEl.querySelector('.flow-chart');
            if (!svg || chart?.kind !== 'flow') return;
            const p = chart.pick(clientX - svg.getBoundingClientRect().left);
            const g = svg.querySelector('[data-cross]');
            g.style.display = '';
            g.querySelector('line').setAttribute('x1', p.x);
            g.querySelector('line').setAttribute('x2', p.x);
            const dot = g.querySelector('circle');
            dot.setAttribute('cx', p.x);
            dot.setAttribute('cy', p.y);
            dot.setAttribute('class', `cross-dot ${p.value >= 100 ? 'is-up' : 'is-down'}`);
            const need = p.value >= 100 ? '본전 위' : p.value <= 0 ? '회복 불가' : `본전까지 +${((100 / p.value - 1) * 100).toFixed(1)}%`;
            resultEl.querySelector('[data-caption]').innerHTML =
                `<b>${p.day === 0 ? '지금 · ' : ''}${longDate(p.date)}</b> 산 가격 대비 ${pctText(p.value - 100)}
                 <span>${p.day > 0 ? `지금부터 ${formatDays(p.day)} · ` : ''}${need}${p.projected ? ' · 가정 구간' : ''}</span>`;
        }
        function hideCross() {
            const g = resultEl.querySelector('[data-cross]');
            if (g) g.style.display = 'none';
            const cap = resultEl.querySelector('[data-caption]');
            if (cap && chart?.kind === 'flow') cap.innerHTML = chart.defaultCaption;
        }
        resultEl.addEventListener('pointermove', (e) => {
            if (e.target.closest('[data-cross-area]')) moveCross(e.clientX);
        });
        resultEl.addEventListener('pointerdown', (e) => {
            if (e.target.closest('[data-cross-area]')) moveCross(e.clientX);
        });
        resultEl.addEventListener('pointerleave', hideCross);
        resultEl.addEventListener('pointerout', (e) => {
            if (e.target.closest?.('[data-cross-area]') && !e.relatedTarget?.closest?.('[data-cross-area]')) hideCross();
        });

        /* ---------- 손실률별 표: 입력칸에 넣으면 표만 바꿔요 ---------- */
        // 결과 전체를 다시 그리면 입력칸이 새로 만들어져 커서가 사라지니까, 표 줄(tbody)만 갈아 끼워요
        resultEl.addEventListener('input', (e) => {
            const input = e.target.closest('[data-ref-loss]');
            if (!input) return;
            formatInput(input);                                   // 쉼표·소수점 정리 (다른 칸과 같은 규칙)
            const v = parseNumber(input.value);
            ref.value = Number.isFinite(v) ? v : null;
            resultEl.querySelector('[data-ref-rows]').innerHTML = refRowsHtml(v);
        });
        // <details>를 펼치고 접는 toggle 이벤트는 위로 전달(bubble)되지 않아서, 잡는 단계(capture)에서 들어요
        resultEl.addEventListener('toggle', (e) => {
            if (e.target.matches?.('[data-ref-fold]')) ref.open = e.target.open;
        }, true);

        /* ---------- 결과 카드 클릭: 보기 바꾸기, 봉 누르기 ---------- */
        resultEl.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-view]');
            if (btn && !btn.disabled) {
                viewInput.value = btn.dataset.view;
                changed();
                return;
            }
            const candle = e.target.closest('.candle');
            if (candle) selectCandle(Number(candle.dataset.candle));
        });
        resultEl.addEventListener('mouseover', (e) => {
            const candle = e.target.closest('.candle');
            if (candle) selectCandle(Number(candle.dataset.candle));
        });

        // 그래프는 카드 폭에 맞춰 그려서, 폭이 바뀌면(창 크기·화면 회전) 다시 그려요.
        // ResizeObserver는 요소 크기가 바뀔 때 알려줘요 (MFC의 WM_SIZE 같은 것). 높이 변화는 무시해요.
        let lastWidth = resultEl.clientWidth;
        let resizeTimer = null;
        new ResizeObserver(() => {
            if (resultEl.clientWidth === lastWidth) return;
            lastWidth = resultEl.clientWidth;
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => { if (chart) refresh(); }, 150);
        }).observe(resultEl);

        /* ---------- 시작 ---------- */
        const saved = normalize(ctx.inputs);
        afterUnit.value = 'month';
        valueBoxes.forEach(box => fillValues(box, saved.values));
        saved.steps.forEach(v => addRow(v));
        updateRows();
        syncAfter();

        // 입력 쪽 클릭: 줄 추가·복사·삭제, 오름/내림 바꾸기, "그 뒤로" 단위
        view.querySelector('.input-col').addEventListener('click', (e) => {
            const t = e.target;
            const row = t.closest('.seq-row');
            if (t.closest('[data-add]')) {
                const count = Math.min(Number(t.closest('[data-add]').dataset.add), MAX_STEPS - rows().length);
                let added = null;
                for (let i = 0; i < count; i++) added = addRow();
                updateRows();
                changed();
                added?.querySelector('input[name="pct"]').focus({ preventScroll: true });
                listEl.scrollTop = listEl.scrollHeight;          // 목록 맨 아래(새 줄)가 보이게
            } else if (t.closest('[data-copy]') && rows().length < MAX_STEPS) {
                addRow(null, row);
                updateRows();
                changed();
            } else if (t.closest('[data-remove]')) {
                row.remove();
                updateRows();
                changed();
            } else if (t.closest('[data-dir]')) {
                field(row, 'dir').value = field(row, 'dir').value === 'down' ? 'up' : 'down';
                syncRow(row);
                changed();
            } else if (t.closest('[data-choice="afterUnit"] button')) {
                afterUnit.value = t.closest('button').dataset.value;
                syncAfter();
                changed();
            }
        });
        // 단위 선택 상자: 고르면 숨은 입력칸에 넣고 다시 계산
        listEl.addEventListener('change', (e) => {
            const select = e.target.closest('[data-unit]');
            if (!select) return;
            field(select.closest('.seq-row'), 'unit').value = select.value;
            changed();
        });
        // "지금 손실률"을 바꾸면 손실률별 표도 그 값으로 다시 맞춰요
        bindNumberInputs(view, (input) => {
            if (input.name === 'loss') ref.value = null;
            changed();
        });
        refresh();

        // 다른 기능에서 손실률을 받아 들어왔으면: 강조 + 알림
        if (ctx.received) {
            const { from, payload } = ctx.received;
            showReceived(view, ['loss'], `${from?.shortName ?? '다른 계산기'}에서 손실률 ${payload.loss}%를 넣었어요`);
        }
    },
};
