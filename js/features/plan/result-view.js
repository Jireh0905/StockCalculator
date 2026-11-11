/**
 * plan/result-view.js — 하락 대응 계산기의 결과 카드 그리기 (계산은 하지 않고 보여주기만)
 */
import { won, wonPrecise, signedWon } from '../../core/format.js';

/** 등락률 글자: 12.345 → "+12.35%", −4.3 → "−4.30%" */
export function signedPercent(n, digits = 2) {
    const sign = n > 0 ? '+' : n < 0 ? '−' : '';
    return `${sign}${Math.abs(n).toFixed(digits)}%`;
}

/** 손익 색: 이익 빨강, 손실 파랑 (한국 증시 색 규칙) */
const toneOf = (n) => (Math.round(n) > 0 ? 'tone-up' : Math.round(n) < 0 ? 'tone-down' : '');

/* ---------- 세 가지 선택 비교 (두 탭 공통) ---------- */

/**
 * @param {object | null} avg - planAveraging() 결과 (ready일 때만 비교에 넣어요)
 * @param {object | null} stop - planStopRebuy() 결과 (status 'ok'일 때만)
 * @param {'avg' | 'stop'} tab - 지금 보고 있는 탭 (그 열을 강조)
 */
function compareBlock(avg, stop, tab) {
    const avgOk = avg?.ready;
    const stopOk = stop?.status === 'ok';
    if (!(avgOk && stopOk)) {
        const other = tab === 'avg' ? '손절 후 재매수' : '물타기 계획';
        return `<p class="note">"${other}" 탭도 입력하면 그대로 보유·물타기·손절 후 재매수를 한 표로 비교해 드려요.</p>`;
    }
    const col = (name) => (name === tab ? ' class="is-current"' : '');
    const risks = [
        `<li><b>그대로 보유</b> 더 떨어지면 손실이 계속 커져요.</li>`,
        `<li><b>물타기</b> 돈을 더 넣는 만큼 위험도 커져요.${avg.stop
            ? ` 손절선 ${wonPrecise(avg.stop.price)}원까지 가면 ${signedWon(avg.stop.pl)}원이에요.` : ''}</li>`,
        `<li><b>재매수</b> 재매수가까지 안 떨어지고 바로 오르면 다시 살 기회를 놓칠 수 있어요.</li>`,
    ].join('');
    return `
        <h3 class="sub-title">세 가지 선택 비교</h3>
        <table class="compare-table">
            <thead><tr><th></th><th>그대로 보유</th><th${col('avg')}>물타기</th><th${col('stop')}>손절 후 재매수</th></tr></thead>
            <tbody>
                <tr><th>본전 가격</th><td>${won(avg.holdBreakEven)}원</td><td${col('avg')}>${won(avg.breakEven)}원</td><td${col('stop')}>${won(stop.breakEven)}원</td></tr>
                <tr><th>추가로 넣는 돈</th><td>0원</td><td${col('avg')}>${won(avg.extra)}원</td><td${col('stop')}>${won(stop.extra)}원</td></tr>
                <tr><th>보유 수량</th><td>${won(avg.holdQty)}주</td><td${col('avg')}>${won(avg.totalQty)}주</td><td${col('stop')}>${won(stop.qty)}주</td></tr>
            </tbody>
        </table>
        <ul class="risk-list">${risks}</ul>
        <p class="note">본전 가격은 그 가격에 모두 팔면 넣은 돈을 그대로 돌려받는 가격이에요 (수수료·세금 포함).
            어느 쪽이 나은지는 앞으로의 주가에 달려 있어서, 이 표는 숫자만 나란히 보여줘요.</p>`;
}

/* ---------- 물타기 계획 ---------- */

/** 조건이 맞지 않는 단계의 이유 (입력 줄 아래에도 같은 문구가 나와요) */
export function stepMessage(r, avgPrice) {
    const which = r.prevAvg === avgPrice ? '지금' : '직전';
    switch (r.status) {
        case 'price-high': return `매수가가 ${which} 평단 ${won(r.prevAvg)}원보다 낮아야 평단이 내려가요`;
        case 'goal-high': return `목표 평단은 ${which} 평단 ${won(r.prevAvg)}원보다 낮아야 해요`;
        case 'goal-low': return '목표 평단은 매수가보다 높아야 해요 (평단은 매수가 아래로 안 내려가요)';
        default: return '';
    }
}

/**
 * @param {HTMLElement} el
 * @param {object | null} r - planAveraging() 결과
 * @param {object | null} stop - planStopRebuy() 결과 (비교표용)
 */
export function renderAvgResult(el, r, stop, { onSave, onSendToAverage, onSendToProfit }) {
    if (!r) {
        el.innerHTML = `<div class="result-empty"><span class="icon">🪜</span>지금 갖고 있는 주식(평단·수량)과<br>분할 매수 계획을 입력해 주세요</div>`;
        return;
    }
    if (!r.ready) {
        el.innerHTML = `<div class="result-empty"><span class="icon">🪜</span>단계마다 매수가와 목표 평단을 넣으면<br>몇 주를 사야 하는지 계산해요</div>`;
        return;
    }

    const lines = [
        `<li class="buy-line">
            <div class="buy-line-top"><span>기존 보유</span><b>${won(r.holdCost)}원</b></div>
            <div class="buy-line-sub"><span>${wonPrecise(r.avgPrice)}원 × ${won(r.holdQty)}주</span></div>
        </li>`,
        ...r.valid.map(s => `
        <li class="buy-line">
            <div class="buy-line-top"><span>${s.no}차 매수</span><b>${won(s.cost)}원</b></div>
            <div class="buy-line-sub">
                <span>${wonPrecise(s.price)}원 × ${won(s.qty)}주</span><span>평단 ${won(s.avgAfter)}원</span>
            </div>
            <div class="buy-line-sub">
                <span>여기까지 추가로 쓴 돈 ${won(s.spendSoFar)}원</span>${s.overBudget ? '<span class="tag-warn">예산 초과</span>' : ''}
            </div>
        </li>`),
    ].join('');

    const skipped = r.rows.filter(s => s.status !== 'ok' && s.status !== 'empty').map(s => `${s.no}차`);
    const skippedNote = skipped.length
        ? `<p class="note">${skipped.join('·')}는 조건이 맞지 않아 빼고 계산했어요. 이유는 입력 줄 아래에 있어요.</p>` : '';

    const budgetRow = r.budget
        ? `<li><span>쓸 수 있는 돈 ${won(r.budget.budget)}원</span>${r.budget.left >= 0
            ? `<span class="tone-ok">${won(r.budget.left)}원 남아요</span>`
            : `<span class="tone-warn">${won(-r.budget.left)}원 모자라요</span>`}</li>` : '';

    let stopBlock = '';
    if (r.stop) {
        const s = r.stop;
        const early = s.aboveSteps.length
            ? `<p class="note">손절선이 ${s.aboveSteps.map(n => `${n}차`).join('·')} 매수가 이상이라, 그 단계를 사기 전에 손절선에 먼저 닿아요.</p>` : '';
        stopBlock = `
            <h3 class="sub-title">손절선 ${wonPrecise(s.price)}원에서 모두 팔면</h3>
            <ul class="rows rows-tight">
                <li><span>받는 돈 (수수료·세금 뺌)</span><span>${won(s.proceeds)}원</span></li>
                <li><span>손익</span><span class="${toneOf(s.pl)}">${signedWon(s.pl)}원 (${signedPercent(s.plRate, 1)})</span></li>
            </ul>
            ${early}`;
    }

    el.innerHTML = `
        <div class="result-label">물타기 후 최종 평단</div>
        <div class="result-amount">${won(r.finalAvg)}<small>원</small></div>
        <span class="rate-pill pill-down">추가 매수 ${won(r.extra)}원</span>

        <h3 class="sub-title">단계별 매수</h3>
        <ul class="buy-lines">${lines}</ul>
        <ul class="rows">
            <li><span>추가 매수 금액 (${r.valid.length}단계)</span><span>${won(r.addCost)}원</span></li>
            <li class="sub"><span>매수 수수료</span><span>${won(r.addFee)}원</span></li>
            ${budgetRow}
            <li class="divider"><span>넣은 돈 전체</span><span>${won(r.moneyIn)}원</span></li>
            <li><span>총 보유 수량</span><span>${won(r.totalQty)}주</span></li>
        </ul>
        ${skippedNote}

        <h3 class="sub-title">본전까지</h3>
        <ul class="rows rows-tight">
            <li><span>본전 가격</span><span>${won(r.breakEven)}원</span></li>
            <li class="sub"><span>가장 낮은 매수가 ${wonPrecise(r.lowest)}원에서</span><span>${signedPercent(r.riseFromLowest)}</span></li>
            <li><span>물타기 안 했다면</span><span>${won(r.holdBreakEven)}원</span></li>
            <li class="sub"><span>같은 가격에서</span><span>${signedPercent(r.holdRiseFromLowest)}</span></li>
        </ul>
        ${stopBlock}
        ${compareBlock(r, stop, 'avg')}
        <p class="note">평단은 물타기 계산기와 같이 수수료를 뺀 단순 평균이에요.</p>

        <div class="link-group" role="group" aria-label="이 계획으로 이어서 계산">
            <div class="link-group-title">이 계획으로 이어서 계산</div>
            <div class="link-row">
                <button type="button" class="link-btn" data-send-average>
                    <span>물타기 계산 <span aria-hidden="true">→</span></span><small>단계별 매수를 넘겨요</small>
                </button>
                <button type="button" class="link-btn" data-send-profit>
                    <span>손익 계산 <span aria-hidden="true">→</span></span><small>최종 평단·수량을 넘겨요</small>
                </button>
            </div>
        </div>
        <button type="button" class="save-btn">기록에 저장</button>`;
    el.querySelector('[data-send-average]').addEventListener('click', onSendToAverage);
    el.querySelector('[data-send-profit]').addEventListener('click', onSendToProfit);
    el.querySelector('.save-btn').addEventListener('click', onSave);
}

/* ---------- 손절 후 재매수 ---------- */

/**
 * @param {HTMLElement} el
 * @param {object | null} r - planStopRebuy() 결과
 * @param {object | null} avg - planAveraging() 결과 (비교표용)
 */
export function renderStopResult(el, r, avg, { onSave, onSendToProfit }) {
    if (!r) {
        el.innerHTML = `<div class="result-empty"><span class="icon">🔁</span>지금 갖고 있는 주식과<br>손절가·재매수가를 입력해 주세요</div>`;
        return;
    }

    const sellBlock = `
        <h3 class="sub-title">손절하면</h3>
        <ul class="rows rows-tight">
            <li><span>매도 금액 (${won(r.holdQty)}주 × ${wonPrecise(r.stopPrice)}원)</span><span>${won(r.gross)}원</span></li>
            <li class="sub"><span>수수료 ${won(r.sellComm)} + 거래세 ${won(r.tax)}</span><span>−${won(Math.round(r.sellComm) + Math.round(r.tax))}원</span></li>
            <li><span>받는 돈</span><span>${won(r.receive)}원</span></li>
            <li><span>확정 손익</span><span class="${toneOf(r.realized)}">${signedWon(r.realized)}원</span></li>
        </ul>`;

    if (r.status === 'no-qty') {
        el.innerHTML = `
            <div class="result-label">손절 후 재매수</div>
            <div class="result-amount result-amount-text">1주도 못 사요</div>
            <p class="note">재매수 금액 ${won(r.amount)}원으로는 ${wonPrecise(r.rebuyPrice)}원짜리 주식을 1주도 살 수 없어요.</p>
            ${sellBlock}`;
        return;
    }

    // 비교표가 나오면 거기 위험 설명에 같은 말이 있으니 여기서는 빼요
    const notes = [
        r.rebuyPrice > r.stopPrice ? '손절가보다 비싸게 다시 사서 수량이 줄어요.' : '',
        avg?.ready ? '' : '재매수가까지 떨어지지 않고 바로 오르면 다시 살 기회를 놓칠 수 있어요.',
    ].filter(Boolean).join(' ');

    el.innerHTML = `
        <div class="result-label">재매수 후 본전 가격 <span style="font-weight:400;color:var(--text-3)">(수수료·세금 포함)</span></div>
        <div class="result-amount">${won(r.breakEven)}<small>원</small></div>
        <span class="rate-pill ${r.extra > 0 ? 'pill-up' : 'pill-flat'}">추가로 넣는 돈 ${won(r.extra)}원</span>

        ${sellBlock}

        <h3 class="sub-title">다시 사면</h3>
        <ul class="rows rows-tight">
            <li><span>재매수</span><span>${wonPrecise(r.rebuyPrice)}원 × ${won(r.qty)}주</span></li>
            <li class="sub"><span>${r.usedAll ? '받은 돈 전부' : `재매수 금액 ${won(r.amount)}원`} · 수수료 ${won(r.buyFee)}원 포함</span><span>${won(r.spend)}원</span></li>
            <li><span>남는 현금</span><span>${won(r.cash)}원</span></li>
        </ul>

        <h3 class="sub-title">본전까지</h3>
        <ul class="rows rows-tight">
            <li><span>재매수가 ${wonPrecise(r.rebuyPrice)}원에서</span><span>${signedPercent(r.rise)}</span></li>
            <li><span>그대로 들고 있었다면 본전</span><span>${won(r.holdBreakEven)}원</span></li>
            <li class="sub"><span>같은 가격에서</span><span>${signedPercent(r.holdRise)}</span></li>
        </ul>
        ${notes ? `<p class="note">${notes}</p>` : ''}
        ${compareBlock(avg, r, 'stop')}

        <div class="link-group" role="group" aria-label="이 계획으로 이어서 계산">
            <div class="link-group-title">이 계획으로 이어서 계산</div>
            <div class="link-row single">
                <button type="button" class="link-btn" data-send-profit>
                    <span>손익 계산 <span aria-hidden="true">→</span></span><small>재매수가·수량을 넘겨요</small>
                </button>
            </div>
        </div>
        <button type="button" class="save-btn">기록에 저장</button>`;
    el.querySelector('[data-send-profit]').addEventListener('click', onSendToProfit);
    el.querySelector('.save-btn').addEventListener('click', onSave);
}
