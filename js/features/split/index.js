/**
 * split/index.js — 분할 매매 계산기 (예전 물타기 계산기)
 *
 *   template.js ...... 화면 HTML + 매수·매도 단계 줄 (국내/해외에 따라 단위·세금 칸이 달라요)
 *   calculator.js .... 분할 매수 평단 · 분할 매도 손익 계산 (화면과 무관)
 *   result-view.js ... 결과 카드
 *   index.js ......... 위 셋을 연결 + 탭·단계 줄 관리·입력값 기억·기록 저장 (이 파일)
 *
 * 저장 모양 (ctx.inputs, 시장마다 따로):
 *   { tab: 'buy' | 'sell', values: { avgPrice, holdQty, commRate, taxRate, taxBase?, fxBuy?, fxSell? },
 *     buys: [ { buyPrice, buyQty }, ... ], sells: [ { sellPrice, sellQty }, ... ] }   ← 값은 화면 글자 그대로
 */
import { template, createBuyRow, createSellRow } from './template.js';
import { calculateAverage, calculateSplitSell } from './calculator.js';
import { renderBuyResult, renderSellResult, signedPercent } from './result-view.js';
import { bindNumberInputs, readValues, fillValues, readNumber, readInt } from '../../core/number-input.js';
import { won, signedWon } from '../../core/format.js';
import { price, money, signedMoney, inputText, isGlobal } from '../../core/market.js';
import { showReceived } from '../../core/received.js';

const MAX_ROWS = 10;

/** 예전 모양(물타기 계산기)으로 남은 값도 읽을 수 있게 */
function normalize(inputs) {
    if (!inputs) return { tab: 'buy', values: {}, buys: [{}], sells: [{}] };
    const { buyPrice, buyQty, ...values } = inputs.values ?? {};
    const buys = inputs.buys ?? (buyPrice || buyQty ? [{ buyPrice, buyQty }] : [{}]);
    return {
        tab: inputs.tab === 'sell' ? 'sell' : 'buy',
        values,
        buys: buys.length ? buys : [{}],
        sells: inputs.sells?.length ? inputs.sells : [{}],
    };
}

/**
 * 매수·매도 단계 줄 목록 관리 (두 탭이 같은 방식이라 하나로)
 * @param {HTMLElement} listEl - 줄이 들어갈 자리
 * @param {HTMLElement} addBtn - "+ 늘리기" 버튼
 * @param {() => HTMLElement} create - 줄 하나 만들기
 * @param {string} label - 줄 제목 ("추가 매수" → "1차 추가 매수")
 */
function rowList(listEl, addBtn, create, label) {
    const rows = () => [...listEl.querySelectorAll(':scope > .buy-row')];
    function update() {
        const all = rows();
        all.forEach((row, i) => {
            row.querySelector('.buy-row-title').textContent = `${i + 1}차 ${label}`;
            row.querySelector('[data-remove]').hidden = all.length === 1; // 한 줄은 꼭 남김
        });
        addBtn.hidden = all.length >= MAX_ROWS;
    }
    function add(values) {
        const row = create();
        listEl.append(row);
        if (values) fillValues(row, values);
        update();
        return row;
    }
    return { rows, update, add };
}

export default {
    id: 'split',
    name: '분할 매매 계산기',
    shortName: '분할 매매',
    desc: '나눠서 사고팔면 평단·손익이 얼마?',
    group: '계산기',
    icon: 'average',
    color: 'c2',
    markets: true,

    /**
     * 다른 기능이 값을 넘겨줄 때 app.js가 불러요. (예: 하락 대응 → "분할 매수 계산")
     * 분할 매수 탭으로 바꾸고, 보유 주식과 추가 매수 줄을 받은 값으로 바꿔요. (분할 매도 계획·수수료는 그대로)
     *
     * @param {object | null} inputs - 지금 시장의 저장된 입력값
     * @param {{ avgPrice: number, holdQty: number, buys: Array<{ price: number, qty: number }> }} payload
     * @returns 새 입력값 (ctx.inputs와 같은 모양)
     */
    receive(inputs, { avgPrice, holdQty, buys }) {
        const saved = normalize(inputs);
        return {
            ...saved,
            tab: 'buy',
            values: { ...saved.values, avgPrice: inputText(avgPrice), holdQty: won(holdQty) },
            buys: buys.slice(0, MAX_ROWS).map(b => ({ buyPrice: inputText(b.price), buyQty: won(b.qty) })),
        };
    },

    mount(view, ctx) {
        const market = ctx.market;
        view.innerHTML = template(market);
        const resultEl = view.querySelector('[data-result]');
        const tabButtons = view.querySelectorAll('.segmented button');
        const valueBoxes = [...view.querySelectorAll('[data-values]')];
        const holdEl = valueBoxes[0];
        const chip = view.querySelector('[data-chip]');
        const buyList = rowList(view.querySelector('[data-buys]'), view.querySelector('[data-add-buy]'), () => createBuyRow(market), '추가 매수');
        const sellList = rowList(view.querySelector('[data-sells]'), view.querySelector('[data-add-sell]'), () => createSellRow(market), '매도');

        const saved = normalize(ctx.inputs);
        let tab = saved.tab;
        let result = null;

        /* ---------- 읽기·저장 ---------- */
        const n = (name) => readNumber(view, name);
        const snapshot = () => ({
            tab,
            values: Object.assign({}, ...valueBoxes.map(box => readValues(box))),
            buys: buyList.rows().map(row => readValues(row)),
            sells: sellList.rows().map(row => readValues(row)),
        });
        const remember = () => ctx.saveInputs(snapshot());

        const readBuy = () => ({
            avgPrice: readNumber(holdEl, 'avgPrice'),
            holdQty: readInt(holdEl, 'holdQty'),
            buys: buyList.rows().map(row => ({ price: readNumber(row, 'buyPrice'), qty: readInt(row, 'buyQty') })),
        });
        const readSell = () => ({
            avgPrice: readNumber(holdEl, 'avgPrice'),
            holdQty: readInt(holdEl, 'holdQty'),
            sells: sellList.rows().map(row => ({ price: readNumber(row, 'sellPrice'), qty: readInt(row, 'sellQty') })),
            commRate: n('commRate'),
            taxRate: n('taxRate'),
            ...(isGlobal(market) ? { taxBase: readInt(view, 'taxBase'), fxBuy: n('fxBuy'), fxSell: n('fxSell') } : {}),
        });

        /* ---------- 분할 매도 줄 아래 안내 ---------- */
        function updateSellHints(r) {
            const avg = readNumber(holdEl, 'avgPrice');
            const hold = readInt(holdEl, 'holdQty');
            sellList.rows().forEach((row, i) => {
                const p = readNumber(row, 'sellPrice');
                const q = readInt(row, 'sellQty');
                row.querySelector('[data-price-hint]').textContent = p > 0 && avg > 0 ? `평단 ${signedPercent((p / avg - 1) * 100)}` : '';
                row.querySelector('[data-qty-hint]').textContent = q > 0 && hold > 0 ? `보유의 ${(q / hold * 100).toFixed(0)}%` : '';
                const out = row.querySelector('[data-step-result]');
                const s = r?.rows[i];
                out.className = 'step-result';
                if (!s || s.status === 'empty') {
                    out.textContent = '';
                } else if (s.status === 'over') {
                    out.textContent = `남은 수량(${won(s.left)}주)보다 ${won(s.qty - s.left)}주 많아요`;
                    out.classList.add('is-warn');
                } else {
                    const word = isGlobal(market) ? '손익(세금 전)' : '순이익';
                    out.textContent = `→ 받는 돈 ${money(s.received, market)} · ${word} ${signedMoney(s.pl, market)} · 남은 ${won(s.left)}주`;
                }
            });
            const v = (name) => view.querySelector(`input[name="${name}"]`)?.value || 0;
            chip.textContent = `수수료 ${v('commRate')}% · ${isGlobal(market) ? '양도세' : '거래세'} ${v('taxRate')}%`;
        }

        /* ---------- 계산 + 그리기 ---------- */
        function refresh() {
            if (tab === 'buy') {
                result = calculateAverage(readBuy());
                const r = result;
                renderBuyResult(resultEl, r, market, {
                    onSave: () => {
                        const extra = r.usedCount > 1 ? `${r.usedCount}건` : price(r.steps[0].price, market);
                        ctx.addRecord({
                            title: `평단 ${price(r.avgPrice, market)} × ${won(r.holdQty)}주 + ${extra}`,
                            sub: '분할 매수',
                            data: snapshot(),
                            result: { text: price(Math.round(r.newAvg * 100) / 100, market), sub: signedMoney(r.change, market) },
                        });
                    },
                    // 새 평단을 목표가 계산기의 매수가로 넘겨요.
                    // 국내는 화면에 보이는 숫자와 같도록 원 단위로 반올림 (예: 47,333.33 → 47,333), 해외는 센트까지
                    onSendToTarget: () => ctx.sendTo('target', {
                        buyPrice: isGlobal(market) ? Math.round(r.newAvg * 100) / 100 : Math.round(r.newAvg),
                    }),
                    // 손익 계산기에는 새 평단(소수 둘째 자리)과 총 보유 수량
                    // (47,333.33 × 60주 = 2,840,000원 → 여기의 총 매수 금액과 맞음)
                    onSendToProfit: () => ctx.sendTo('profit', {
                        buyPrice: Math.round(r.newAvg * 100) / 100,
                        quantity: r.totalQty,
                    }),
                    // 배당 계산기에는 내 평단·보유 수량으로 (내 평단 기준 배당 수익률을 볼 수 있어요)
                    onSendToDividend: () => ctx.sendTo('dividend', {
                        buyPrice: Math.round(r.newAvg * 100) / 100,
                        quantity: r.totalQty,
                    }),
                });
            } else {
                result = calculateSplitSell(market, readSell());
                const r = result;
                updateSellHints(r);
                renderSellResult(resultEl, r, market, {
                    onSave: () => {
                        const krw = !isGlobal(market) || r.taxReady;
                        const net = isGlobal(market) && r.taxReady ? r.net : r.pl;
                        ctx.addRecord({
                            title: `평단 ${price(r.avgPrice, market)} × ${won(r.holdQty)}주 · ${r.valid.length}번에 ${won(r.soldQty)}주 매도`,
                            sub: '분할 매도',
                            data: snapshot(),
                            result: {
                                text: krw ? `${signedWon(net)}원` : signedMoney(net, market),
                                sub: `${r.rate.toFixed(2)}%`,
                                tone: net > 0 ? 'up' : net < 0 ? 'down' : '',
                            },
                        });
                    },
                });
            }
        }

        function showTab(next) {
            tab = next;
            tabButtons.forEach(btn => btn.setAttribute('aria-selected', String(btn.dataset.tab === tab)));
            view.querySelector('#panel-buy').hidden = tab !== 'buy';
            view.querySelector('#panel-sell').hidden = tab !== 'sell';
            refresh();
        }

        const changed = () => {
            remember();
            refresh();
        };

        /* ---------- 시작 ---------- */
        valueBoxes.forEach(box => fillValues(box, saved.values));
        saved.buys.forEach(v => buyList.add(v));
        saved.sells.forEach(v => sellList.add(v));

        // "+ 늘리기", "삭제", "남은 수량 전부"는 화면 한 곳에서 받아요 (이벤트 위임)
        view.addEventListener('click', (e) => {
            const t = e.target;
            if (t.closest('[data-add-buy]')) {
                buyList.add().querySelector('input').focus();
                changed();
            } else if (t.closest('[data-add-sell]')) {
                sellList.add().querySelector('input').focus();
                changed();
            } else if (t.closest('[data-remove]')) {
                const row = t.closest('.buy-row');
                const list = row.classList.contains('sell-row') ? sellList : buyList;
                row.remove();
                list.update();
                changed();
            } else if (t.closest('[data-fill-rest]')) {
                // 이 줄을 뺀 나머지 줄의 수량을 빼고 남은 만큼 채워요
                const row = t.closest('.sell-row');
                const others = sellList.rows().filter(r => r !== row)
                    .reduce((sum, r) => sum + (readInt(r, 'sellQty') || 0), 0);
                const rest = (readInt(holdEl, 'holdQty') || 0) - others;
                if (rest > 0) {
                    fillValues(row, { sellQty: String(rest) });
                    changed();
                }
            }
        });
        tabButtons.forEach(btn => btn.addEventListener('click', () => {
            showTab(btn.dataset.tab);
            remember();
        }));
        bindNumberInputs(view, changed);
        showTab(tab);

        // 다른 기능에서 값을 받아 들어왔으면: 바뀐 칸을 강조하고 무엇이 들어왔는지 알려줘요
        if (ctx.received) {
            const { from, payload } = ctx.received;
            showReceived(view, ['avgPrice', 'holdQty', 'buyPrice', 'buyQty'],
                `${from?.shortName ?? '다른 계산기'} 계획의 추가 매수 ${payload.buys.length}건을 넣었어요`);
        }
    },
};
