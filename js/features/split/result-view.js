/**
 * split/result-view.js — 분할 매매 결과 카드 그리기 (계산은 하지 않고 보여주기만)
 */
import { won, signedWon } from '../../core/format.js';
import { price, money, signedMoney, bigMoney, isGlobal } from '../../core/market.js';
import { fxSplitHtml, fxHintHtml } from '../../core/fx-split.js';

/** 등락률 글자: 10 → "+10.0%" */
export function signedPercent(n, digits = 1) {
    const sign = n > 0 ? '+' : n < 0 ? '−' : '';
    return `${sign}${Math.abs(n).toFixed(digits)}%`;
}

/** 손익 방향: 결과 카드 색(is-up/is-down)과 화살표 */
function direction(n) {
    const r = Math.round(n);
    return r > 0 ? { dir: 'is-up', arrow: '▲' } : r < 0 ? { dir: 'is-down', arrow: '▼' } : { dir: 'is-flat', arrow: '' };
}
const toneOf = (n) => (Math.round(n) > 0 ? 'tone-up' : Math.round(n) < 0 ? 'tone-down' : '');

/* ---------- 분할 매수 ---------- */

export function renderBuyResult(el, r, market, { onSave, onSendToTarget, onSendToProfit, onSendToDividend }) {
    el.className = 'card result-card';
    if (!r) {
        el.innerHTML = `<div class="result-empty"><span class="icon">📊</span>보유 주식과 추가 매수(매수가·수량)를<br>입력하면 새 평균 단가가 나와요</div>`;
        return;
    }
    // 평단이 내려가면 파랑(▼), 올라가면 빨강(▲) — 가격 방향 색 규칙과 같게
    const step = isGlobal(market) ? Math.round(r.change * 100) : Math.round(r.change);
    const dir = step > 0 ? 'up' : step < 0 ? 'down' : 'flat';
    const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '';
    const skipped = r.skippedCount
        ? `<p class="note">매수가나 수량이 비어 있는 ${r.skippedCount}건은 빼고 계산했어요.</p>` : '';

    // 매수 내역 한 줄: 이름·금액 / 단가×수량·비중 / 비중 막대
    const line = ({ name, p, qty, cost, share, after, tone }) => `
        <li class="buy-line">
            <div class="buy-line-top"><span>${name}</span><b>${money(cost, market)}</b></div>
            <div class="buy-line-sub">
                <span>${price(p, market)} × ${won(qty)}주 · ${share.toFixed(1)}%</span>
                ${after ? `<span>${after}</span>` : ''}
            </div>
            <span class="share-bar ${tone}"><i style="width:${Math.max(share, 0.5).toFixed(2)}%"></i></span>
        </li>`;
    // 여러 건이면 차수마다 "그때까지 산 평단"을 함께 보여줘요 (한 건이면 위의 새 평단과 같아서 생략)
    const showAfter = r.steps.length > 1;
    const lines = [
        line({ name: '기존 보유', p: r.avgPrice, qty: r.holdQty, cost: r.holdCost, share: r.holdShare, tone: 'hold' }),
        ...r.steps.map(s => line({
            name: `${s.no}차 추가 매수`, p: s.price, qty: s.qty, cost: s.cost, share: s.share, tone: 'add',
            after: showAfter ? `평단 ${price(s.avgAfter, market)}` : '',
        })),
    ].join('');

    el.innerHTML = `
        <div class="result-label">새 평균 단가</div>
        <div class="result-amount">${bigMoney(r.newAvg, market)}</div>
        <span class="rate-pill pill-${dir}">${arrow} ${money(Math.abs(r.change), market)} (${Math.abs(r.changeRate).toFixed(2)}%)</span>

        <h3 class="sub-title">매수 내역</h3>
        <ul class="buy-lines">${lines}</ul>
        <ul class="rows">
            <li><span>추가 매수 합계 (${r.usedCount}건)</span><span>${won(r.addQty)}주 · ${money(r.addCost, market)}</span></li>
            <li class="divider"><span>총 매수 금액</span><span>${money(r.totalCost, market)}</span></li>
            <li><span>총 보유 수량</span><span>${won(r.totalQty)}주</span></li>
        </ul>
        ${skipped}
        <p class="note">수수료는 빼고 계산한 단순 평균이에요. 증권사 앱의 평단과 조금 다를 수 있어요.</p>
        <div class="link-group" role="group" aria-label="이 평단으로 이어서 계산">
            <div class="link-group-title">이 평단으로 이어서 계산</div>
            <div class="link-row three">
                <button type="button" class="link-btn" data-send-target>
                    <span>목표가 <span aria-hidden="true">→</span></span><small>매수가</small>
                </button>
                <button type="button" class="link-btn" data-send-profit>
                    <span>손익 <span aria-hidden="true">→</span></span><small>매수가·수량</small>
                </button>
                <button type="button" class="link-btn" data-send-dividend>
                    <span>배당 <span aria-hidden="true">→</span></span><small>평단·수량</small>
                </button>
            </div>
        </div>
        <button type="button" class="save-btn">기록에 저장</button>`;
    el.querySelector('[data-send-target]').addEventListener('click', onSendToTarget);
    el.querySelector('[data-send-profit]').addEventListener('click', onSendToProfit);
    el.querySelector('[data-send-dividend]').addEventListener('click', onSendToDividend);
    el.querySelector('.save-btn').addEventListener('click', onSave);
}

/* ---------- 분할 매도 ---------- */

/** 남은 주식 블록: 증권사 평단(그대로) vs 실질 단가 */
function remainBlock(r, market) {
    if (r.remainQty === 0) return ''; // 다 팔면 손익 합계가 전부라 따로 보여줄 게 없어요
    const taxNote = isGlobal(market) ? ' (양도세 전)' : '';
    const value = r.recovered
        ? `<li><span>실질 단가</span><span class="tone-ok">원금 회수 완료</span></li>`
        : `<li><span>실질 단가${taxNote}</span><span>${money(r.effective, market)}</span></li>
           <li class="sub"><span>(넣은 돈 − 받은 돈) ÷ ${won(r.remainQty)}주</span><span>${signedPercent((r.effective / r.avgPrice - 1) * 100)}</span></li>`;
    const note = r.recovered
        ? `<p class="note">받은 돈이 처음 넣은 돈보다 ${money(r.surplus, market)} 많아요. 남은 ${won(r.remainQty)}주는 모두 수익이에요.</p>`
        : `<p class="note">증권사 앱의 평단은 팔아도 그대로예요. 하지만 판 돈만큼 원금을 회수했으니,
              남은 주식에 실제로 묶인 돈은 1주에 ${money(r.effective, market)}이에요.</p>`;
    return `
        <h3 class="sub-title">남은 ${won(r.remainQty)}주</h3>
        <ul class="rows rows-tight">
            <li><span>증권사 평단 (그대로)</span><span>${price(r.avgPrice, market)}</span></li>
            ${value}
        </ul>
        ${note}`;
}

/** 해외: 양도소득세 블록 (원화) */
/**
 * 해외: 판 주식들의 손익을 주가로 번 돈 / 환율로 번 돈으로 (손익 계산기와 같은 모듈)
 * 매매 차익 − 원화 수수료 = 아래 양도소득세 블록의 양도차익과 1원까지 같아요.
 */
function fxBlock(r) {
    if (!r.fx || r.fx.sameRate) return fxHintHtml;
    return fxSplitHtml(r.fx, [
        { label: '수수료 (원화, 매수 + 매도)', value: -r.feesKrw },
        { label: '양도차익 (원화)', value: r.gainKrw, divider: true, strong: true },
    ]);
}

function taxBlock(r) {
    if (!r.taxReady) {
        return `<p class="note">매도 시 환율을 넣으면 양도소득세와 세후 순이익(원화)을 계산해요.</p>`;
    }
    const fx = r.rateBuy === r.rateSell ? `${won(r.rateSell)}원` : `${won(r.rateBuy)} → ${won(r.rateSell)}원`;
    return `
        <h3 class="sub-title">양도소득세 (원화, 환율 ${fx})</h3>
        <ul class="rows rows-tight">
            <li><span>양도차익</span><span>${signedWon(r.gainKrw)}원</span></li>
            <li class="sub"><span>기본 공제</span><span>−${won(r.deduct)}원</span></li>
            <li class="sub"><span>양도소득세</span><span>−${won(r.taxKrw)}원</span></li>
            <li class="divider"><span>세후 순이익</span><span class="${toneOf(r.net)}">${signedWon(r.net)}원</span></li>
        </ul>
        <p class="note">기본 공제(1년에 한 번)를 이 매도에 모두 적용한 금액이에요.
            올해 다른 해외주식 손익이 있으면 실제 세금은 달라질 수 있어요.</p>`;
}

export function renderSellResult(el, r, market, { onSave }) {
    el.className = 'card result-card';
    if (!r) {
        el.innerHTML = `<div class="result-empty"><span class="icon">📤</span>보유 주식과 나눠서 팔 계획(매도가·수량)을<br>입력하면 손익을 계산해요</div>`;
        return;
    }
    if (!r.ready) {
        el.innerHTML = `<div class="result-empty"><span class="icon">📤</span>단계마다 매도가와 수량을 넣으면<br>나눠서 팔 때의 손익이 나와요</div>`;
        return;
    }

    const global = isGlobal(market);
    // 국내는 세후 순이익(원), 해외는 환율이 있으면 세후 순이익(원), 없으면 세금 전 손익($)
    const headline = global && r.taxReady ? r.net : r.pl;
    const headIsKrw = !global || r.taxReady;
    const { dir, arrow } = direction(global && !r.taxReady ? r.pl * 100 : headline);
    const label = global
        ? (r.taxReady ? '세후 순이익 <span class="result-label-sub">(원화, 수수료·양도세 차감)</span>' : '손익 합계 <span class="result-label-sub">(수수료 차감, 세금 전)</span>')
        : '실현 순이익 합계 <span class="result-label-sub">(수수료·세금 차감)</span>';
    const amount = headIsKrw
        ? `${signedWon(headline)}<small>원</small>`
        : `${signedMoney(headline, market)}`;

    const lines = r.valid.map(s => `
        <li class="buy-line">
            <div class="buy-line-top"><span>${s.no}차 매도</span><b>${money(s.received, market)}</b></div>
            <div class="buy-line-sub">
                <span>${price(s.price, market)} × ${won(s.qty)}주 · 평단 ${signedPercent((s.price / r.avgPrice - 1) * 100)}</span>
                <span class="${toneOf(global ? s.pl * 100 : s.pl)}">${global ? '손익' : '순이익'} ${signedMoney(s.pl, market)}</span>
            </div>
            ${s.fx && !s.fx.sameRate ? `
            <div class="buy-line-sub">
                <span>원화로: 주가 <b class="${toneOf(s.fx.pricePart)}">${signedWon(s.fx.pricePart)}원</b> · 환율 <b class="${toneOf(s.fx.fxPart)}">${signedWon(s.fx.fxPart)}원</b></span>
            </div>` : ''}
        </li>`).join('');

    const over = r.rows.filter(s => s.status === 'over').map(s => `${s.no}차`);
    const overNote = over.length
        ? `<p class="note">${over.join('·')}는 남은 수량보다 많아서 빼고 계산했어요.</p>` : '';

    el.className = `card result-card ${dir}`;
    el.innerHTML = `
        <div class="result-label">${label}</div>
        <div class="result-amount">${amount}</div>
        <span class="rate-pill">${arrow} ${Math.abs(r.rate).toFixed(2)}%</span>

        <h3 class="sub-title">단계별 매도 <span class="sub-title-note">받는 돈${global ? ' (세금 전)' : ''}</span></h3>
        <ul class="buy-lines">${lines}</ul>
        <ul class="rows">
            <li><span>매도 수량</span><span>${won(r.soldQty)}주 · 남은 ${won(r.remainQty)}주</span></li>
            <li><span>평균 매도가</span><span>${price(r.avgSell, market)}</span></li>
            <li class="divider"><span>매도 금액</span><span>${money(r.gross, market)}</span></li>
            <li class="sub"><span>매도 수수료</span><span>−${money(r.fee, market)}</span></li>
            ${global ? '' : `<li class="sub"><span>거래세</span><span>−${money(r.tax, market)}</span></li>`}
            <li><span>받는 돈${global ? ' (세금 전)' : ''}</span><span>${money(r.received, market)}</span></li>
            <li class="sub"><span>판 주식의 원가 (매수 수수료 포함)</span><span>${money(r.basis, market)}</span></li>
            ${global ? `<li><span>손익 (세금 전)</span><span class="${toneOf(r.pl * 100)}">${signedMoney(r.pl, market)}</span></li>` : ''}
        </ul>
        ${overNote}
        ${global && r.taxReady ? fxBlock(r) : ''}
        ${global ? taxBlock(r) : ''}
        ${remainBlock(r, market)}
        <p class="note">손익은 매수 수수료까지 원가에 넣어 계산해요. 손익 계산기와 같은 방식이에요.</p>
        <button type="button" class="save-btn">기록에 저장</button>`;
    el.querySelector('.save-btn').addEventListener('click', onSave);
}
