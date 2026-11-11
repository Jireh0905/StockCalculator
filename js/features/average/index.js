/**
 * average/index.js — 물타기 계산기 (추가 매수 후 평균 단가)
 *
 * "추가로 살 주식"은 여러 건을 넣을 수 있어요. (+ 버튼으로 늘리고, 삭제로 줄이기)
 * 매수가와 수량이 둘 다 입력된 건만 새 평균 단가에 반영돼요.
 *
 * 저장 모양 (ctx.inputs):
 *   { values: { avgPrice, holdQty }, buys: [ { buyPrice, buyQty }, ... ] }   ← 값은 화면 글자 그대로
 */
import { calculateAverage } from './calculator.js';
import { bindNumberInputs, readValues, fillValues, readNumber, readInt } from '../../core/number-input.js';
import { won, signedWon } from '../../core/format.js';

const MAX_BUYS = 10;

const template = `
<div class="layout">
    <div class="input-col">
        <section class="card">
            <h2 class="card-title">지금 갖고 있는 주식</h2>
            <div class="grid-2" data-hold>
                <label class="field">
                    <span class="field-label">평균 단가</span>
                    <span class="input-wrap"><input name="avgPrice" inputmode="decimal" placeholder="52,000" autocomplete="off"><span class="unit">원</span></span>
                </label>
                <label class="field">
                    <span class="field-label">보유 수량</span>
                    <span class="input-wrap"><input name="holdQty" inputmode="numeric" data-int placeholder="30" autocomplete="off"><span class="unit">주</span></span>
                </label>
            </div>
        </section>

        <section class="card">
            <h2 class="card-title">추가로 살 주식</h2>
            <div class="buy-list" data-buys></div>
            <button type="button" class="add-row-btn" data-add>+ 추가 매수 늘리기</button>
        </section>
    </div>
    <div class="result-col">
        <section class="card result-card" data-result aria-live="polite"></section>
    </div>
</div>`;

/** 추가 매수 한 건의 입력 줄 */
function createBuyRow() {
    const row = document.createElement('div');
    row.className = 'buy-row';
    row.innerHTML = `
        <div class="buy-row-head">
            <span class="buy-row-title"></span>
            <button type="button" class="text-btn" data-remove>삭제</button>
        </div>
        <div class="grid-2">
            <label class="field">
                <span class="field-label">매수가</span>
                <span class="input-wrap"><input name="buyPrice" inputmode="decimal" placeholder="44,000" autocomplete="off"><span class="unit">원</span></span>
            </label>
            <label class="field">
                <span class="field-label">매수 수량</span>
                <span class="input-wrap"><input name="buyQty" inputmode="numeric" data-int placeholder="20" autocomplete="off"><span class="unit">주</span></span>
            </label>
        </div>`;
    return row;
}

function renderResult(el, r, { onSave }) {
    if (!r) {
        el.innerHTML = `<div class="result-empty"><span class="icon">📊</span>보유 주식과 추가 매수(매수가·수량)를<br>입력하면 새 평균 단가가 나와요</div>`;
        return;
    }
    // 평단이 내려가면 파랑(▼), 올라가면 빨강(▲) — 가격 방향 색 규칙과 같게
    const dir = Math.round(r.change) > 0 ? 'up' : Math.round(r.change) < 0 ? 'down' : 'flat';
    const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '';
    const skipped = r.skippedCount
        ? `<p class="note">매수가나 수량이 비어 있는 ${r.skippedCount}건은 빼고 계산했어요.</p>` : '';

    // 매수 내역 한 줄: 이름·금액 / 단가×수량·비중 / 비중 막대
    const line = ({ name, price, qty, cost, share, after, tone }) => `
        <li class="buy-line">
            <div class="buy-line-top"><span>${name}</span><b>${won(cost)}원</b></div>
            <div class="buy-line-sub">
                <span>${won(price)}원 × ${won(qty)}주 · ${share.toFixed(1)}%</span>
                ${after ? `<span>${after}</span>` : ''}
            </div>
            <span class="share-bar ${tone}"><i style="width:${Math.max(share, 0.5).toFixed(2)}%"></i></span>
        </li>`;
    // 여러 건이면 차수마다 "그때까지 산 평단"을 함께 보여줘요 (한 건이면 위의 새 평단과 같아서 생략)
    const showAfter = r.steps.length > 1;
    const lines = [
        line({ name: '기존 보유', price: r.avgPrice, qty: r.holdQty, cost: r.holdCost, share: r.holdShare, tone: 'hold' }),
        ...r.steps.map(s => line({
            name: `${s.no}차 추가 매수`, price: s.price, qty: s.qty, cost: s.cost, share: s.share, tone: 'add',
            after: showAfter ? `평단 ${won(s.avgAfter)}원` : '',
        })),
    ].join('');

    el.innerHTML = `
        <div class="result-label">새 평균 단가</div>
        <div class="result-amount">${won(r.newAvg)}<small>원</small></div>
        <span class="rate-pill pill-${dir}">${arrow} ${won(Math.abs(r.change))}원 (${Math.abs(r.changeRate).toFixed(2)}%)</span>

        <h3 class="sub-title">매수 내역</h3>
        <ul class="buy-lines">${lines}</ul>
        <ul class="rows">
            <li><span>추가 매수 합계 (${r.usedCount}건)</span><span>${won(r.addQty)}주 · ${won(r.addCost)}원</span></li>
            <li class="divider"><span>총 매수 금액</span><span>${won(r.totalCost)}원</span></li>
            <li><span>총 보유 수량</span><span>${won(r.totalQty)}주</span></li>
        </ul>
        ${skipped}
        <p class="note">수수료는 빼고 계산한 단순 평균이에요. 증권사 앱의 평단과 몇 원 다를 수 있어요.</p>
        <button type="button" class="save-btn">기록에 저장</button>`;
    el.querySelector('.save-btn').addEventListener('click', onSave);
}

/** 예전 모양(추가 매수 1건을 values에 저장)으로 남은 값도 읽을 수 있게 */
function normalize(inputs) {
    if (!inputs) return { values: {}, buys: [{}] };
    const { avgPrice, holdQty, buyPrice, buyQty } = inputs.values ?? {};
    const buys = inputs.buys ?? [{ buyPrice, buyQty }];
    return { values: { avgPrice, holdQty }, buys: buys.length ? buys : [{}] };
}

export default {
    id: 'average',
    name: '물타기 계산기',
    shortName: '물타기',
    desc: '추가로 사면 평균 단가가 얼마가 될까',
    group: '계산기',
    icon: 'average',
    color: 'c2',

    mount(view, ctx) {
        view.innerHTML = template;
        const holdEl = view.querySelector('[data-hold]');
        const listEl = view.querySelector('[data-buys]');
        const addBtn = view.querySelector('[data-add]');
        const resultEl = view.querySelector('[data-result]');
        let result = null;

        /* ---------- 추가 매수 줄 관리 ---------- */
        const rows = () => [...listEl.querySelectorAll('.buy-row')];

        /** 줄 번호(1차, 2차…)와 버튼 상태를 맞춰요 */
        function updateRows() {
            const all = rows();
            all.forEach((row, i) => {
                row.querySelector('.buy-row-title').textContent = `${i + 1}차 추가 매수`;
                row.querySelector('[data-remove]').hidden = all.length === 1; // 한 줄은 꼭 남김
            });
            addBtn.hidden = all.length >= MAX_BUYS;
        }

        function addRow(values) {
            const row = createBuyRow();
            listEl.append(row);
            if (values) fillValues(row, values);
            updateRows();
            return row;
        }

        /* ---------- 읽기·저장 ---------- */
        const snapshot = () => ({
            values: readValues(holdEl),
            buys: rows().map(row => readValues(row)),
        });

        const readInput = () => ({
            avgPrice: readNumber(holdEl, 'avgPrice'),
            holdQty: readInt(holdEl, 'holdQty'),
            buys: rows().map(row => ({ price: readNumber(row, 'buyPrice'), qty: readInt(row, 'buyQty') })),
        });

        function refresh() {
            result = calculateAverage(readInput());
            renderResult(resultEl, result, {
                onSave: () => {
                    const input = readInput();
                    const extra = result.usedCount > 1 ? `${result.usedCount}건` : `${won(input.buys.find(b => b.price > 0 && b.qty > 0).price)}원`;
                    ctx.addRecord({
                        title: `평단 ${won(input.avgPrice)}원 × ${won(input.holdQty)}주 + ${extra}`,
                        data: snapshot(),
                        result: { text: `${won(result.newAvg)}원`, sub: `${signedWon(result.change)}원` },
                    });
                },
            });
        }

        const changed = () => {
            ctx.saveInputs(snapshot());
            refresh();
        };

        /* ---------- 시작 ---------- */
        const saved = normalize(ctx.inputs);
        fillValues(holdEl, saved.values);
        saved.buys.forEach(values => addRow(values));

        addBtn.addEventListener('click', () => {
            addRow().querySelector('input').focus();
            changed();
        });
        // 삭제 버튼은 줄마다 연결하지 않고 목록 한 곳에서 받아요 (이벤트 위임)
        listEl.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-remove]');
            if (!btn) return;
            btn.closest('.buy-row').remove();
            updateRows();
            changed();
        });
        bindNumberInputs(view, changed);
        refresh();
    },
};
