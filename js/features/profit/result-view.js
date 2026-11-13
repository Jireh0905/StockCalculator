/**
 * result-view.js — 계산 결과 카드 그리기
 *
 * 계산 결과 객체(calculator.js가 만든 것)를 받아서 HTML로 보여주기만 해요.
 * 계산은 하지 않아요. "계산"과 "보여주기"를 나누는 게 이번 단계의 핵심이에요.
 */
import { won, signedWon, percent } from '../../core/format.js';
import { fxSplitHtml, fxHintHtml } from '../../core/fx-split.js';

/**
 * @param {HTMLElement} container - 결과를 그릴 영역
 * @param {object | null} r - calculateProfit()의 결과 (입력이 덜 됐으면 null)
 * @param {{ onSave: () => void, onSendToRecover: () => void, onSendToPlan: () => void,
 *           onSendToTarget: () => void, onSendToSplit: () => void, fx?: object | null }} handlers
 *   onSave "기록에 저장"
 *   손실일 때: onSendToRecover "손실 회복 계산", onSendToPlan "하락 대응 계산"
 *   이익일 때: onSendToTarget "목표가 계산", onSendToSplit "분할 매매 계산"
 *   fx: 해외일 때 주가·환율 몫으로 나눈 손익 (core/fx-split.js의 splitFx 결과)
 */
export function renderResult(container, r, { onSave, onSendToRecover, onSendToPlan, onSendToTarget, onSendToSplit, fx = null }) {
    if (!r) {
        container.className = 'card result-card';
        container.innerHTML = `
            <div class="result-empty">
                <span class="icon">🧮</span>
                매수가·매도가·수량을 입력하면<br>바로 계산돼요
            </div>`;
        return;
    }

    // 이익이면 빨강(is-up), 손실이면 파랑(is-down)
    const dir = Math.round(r.net) > 0 ? 'is-up' : Math.round(r.net) < 0 ? 'is-down' : 'is-flat';
    const arrow = dir === 'is-up' ? '▲' : dir === 'is-down' ? '▼' : '';

    let fxRow = '';
    let note = '';
    if (r.type === 'global') {
        const fx = r.rateBuy === r.rateSell
            ? `${won(r.rateSell)}원`
            : `${won(r.rateBuy)} → ${won(r.rateSell)}원`;
        fxRow = `<li><span>적용 환율 (USD)</span><span>${fx}</span></li>`;
        note = `<p class="note">기본 공제 ${won(r.taxBase)}원을 이 거래에 모두 적용한 금액이에요.
                기본 공제는 1년에 한 번이라, 올해 다른 해외주식 손익이 있으면 실제 세금은 달라질 수 있어요.</p>`;
    }

    container.className = `card result-card ${dir}`;
    container.innerHTML = `
        <div class="result-label">예상 순손익 <span style="font-weight:400;color:var(--text-3)">(수수료·세금 차감)</span></div>
        <div class="result-amount">${signedWon(r.net)}<small>원</small></div>
        <span class="rate-pill">${arrow} ${Math.abs(r.rate).toFixed(2)}%</span>

        <!-- 두 줄 구성: 위는 이름·금액, 아래는 어떻게 나온 금액인지 (물타기 "매수 내역"과 같은 모양) -->
        <ul class="buy-lines money-lines">
            <li class="buy-line">
                <div class="buy-line-top"><span>매수에 쓴 돈</span><b>${won(r.payIn)}원</b></div>
                <div class="buy-line-sub"><span>매수 ${won(r.totalBuy)} + 수수료 ${won(r.buyComm)}</span></div>
            </li>
            <li class="buy-line">
                <div class="buy-line-top"><span>매도로 받을 돈</span><b>${won(r.payOut)}원</b></div>
                <div class="buy-line-sub"><span>매도 ${won(r.totalSell)} − 수수료 ${won(r.sellComm)} − ${r.taxName} ${won(r.tax)}</span></div>
            </li>
        </ul>
        <ul class="rows">
            <li class="divider"><span>수수료·세금 합계</span><span>${won(r.buyComm + r.sellComm + r.tax)}원</span></li>
        </ul>

        ${r.type === 'global' ? fxBlock(r, fx) : ''}

        <details class="breakdown">
            <summary>계산 내역 자세히 보기</summary>
            <ul class="rows">
                <li><span>매수 금액</span><span>${won(r.totalBuy)}원</span></li>
                <li class="sub"><span>매수 수수료 (${percent(r.commRate)})</span><span>${won(r.buyComm)}원</span></li>
                <li><span>매도 금액</span><span>${won(r.totalSell)}원</span></li>
                <li class="sub"><span>매도 수수료 (${percent(r.commRate)})</span><span>${won(r.sellComm)}원</span></li>
                <li class="sub"><span>${r.taxName} (${percent(r.taxRate)})</span><span>${won(r.tax)}원</span></li>
                ${fxRow}
                <li class="divider"><span>세전 손익</span><span>${signedWon(r.beforeTax)}원</span></li>
                <li><span>순손익</span><span>${signedWon(r.net)}원</span></li>
                <li><span>수익률</span><span>${r.rate.toFixed(3)}%</span></li>
            </ul>
            ${note}
        </details>

        ${nextStep(r, dir)}
        <button type="button" class="save-btn">기록에 저장</button>`;

    container.querySelector('[data-send-recover]')?.addEventListener('click', onSendToRecover);
    container.querySelector('[data-send-target]')?.addEventListener('click', onSendToTarget);
    container.querySelector('[data-send-plan]')?.addEventListener('click', onSendToPlan);
    container.querySelector('[data-send-split]')?.addEventListener('click', onSendToSplit);
    container.querySelector('.save-btn').addEventListener('click', onSave);
}

/**
 * 해외: 손익을 "주가로 번 돈"과 "환율로 번 돈"으로 나눠 보여줘요.
 * 매매 차익 − 수수료 − 양도소득세 = 위의 예상 순손익과 1원까지 같아요.
 * 매수 시 환율을 비워 두면(매도 환율과 같다고 봐서) 나눌 게 없어 안내만 보여줘요.
 */
function fxBlock(r, fx) {
    if (!fx || fx.sameRate) return fxHintHtml;
    return fxSplitHtml(fx, [
        { label: `수수료 (매수 ${won(r.buyComm)} + 매도 ${won(r.sellComm)})`, value: -(r.buyComm + r.sellComm) },
        { label: '양도소득세', value: -r.tax },
        { label: '순손익', value: r.net, divider: true, strong: true },
    ]);
}

/**
 * 결과에 따라 다음에 볼 계산기로 가는 버튼 하나
 *   손실이면 → 손실 회복 계산기 (손실률을 넘겨요: 본전까지 몇 % 올라야 하나)
 *   이익이면 → 목표가 계산기 (매수가를 넘겨요: 목표 수익률이 되려면 얼마에 팔아야 하나)
 */
function nextStep(r, dir) {
    if (dir === 'is-down') {
        return `
        <div class="link-group" role="group" aria-label="이어서 계산">
            <div class="link-group-title">손실이 났다면</div>
            <div class="link-row">
                <button type="button" class="link-btn" data-send-recover>
                    <span>손실 회복 계산 <span aria-hidden="true">→</span></span><small>손실률 ${Math.abs(r.rate).toFixed(2)}% · 본전까지 몇 %?</small>
                </button>
                <button type="button" class="link-btn" data-send-plan>
                    <span>하락 대응 계산 <span aria-hidden="true">→</span></span><small>매수가·수량·매도가 · 물타기? 손절?</small>
                </button>
            </div>
        </div>`;
    }
    if (dir === 'is-up') {
        return `
        <div class="link-group" role="group" aria-label="이어서 계산">
            <div class="link-group-title">이익이 났다면</div>
            <div class="link-row">
                <button type="button" class="link-btn" data-send-target>
                    <span>목표가 계산 <span aria-hidden="true">→</span></span><small>매수가 · 목표 수익률의 매도가는?</small>
                </button>
                <button type="button" class="link-btn" data-send-split>
                    <span>분할 매매 계산 <span aria-hidden="true">→</span></span><small>매수가·수량·매도가 · 나눠 팔면?</small>
                </button>
            </div>
        </div>`;
    }
    return '';
}
