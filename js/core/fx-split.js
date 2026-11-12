/**
 * fx-split.js — 해외 주식 손익을 "주가로 번 돈"과 "환율로 번 돈"으로 나누기 (여러 계산기가 함께 써요)
 *
 * 달러로 사서 달러로 팔아도, 원화로 보면 산 날과 판 날의 환율이 달라서 손익이 하나 더 생겨요.
 *   매수가 B$, 매도가 S$, 수량 q, 매수 시 환율 r1, 매도 시 환율 r2
 *   주가로 번 돈 = (S − B) × q × r1        ← 주가 변화를 산 날 환율로
 *   환율로 번 돈 = S × q × (r2 − r1)       ← 판 금액에 환율 변화를 곱해서
 *   두 개를 더하면 S × q × r2 − B × q × r1 = 원화 매매 차익 (정확히 같아요)
 * 우리나라 해외주식 양도소득세는 원화로 계산해서, 환율로 번 돈에도 세금이 붙어요.
 *
 * 손익 계산기(해외)와 분할 매매 계산기(분할 매도, 해외)가 같이 써서, 같은 거래면 숫자가 똑같이 나와요.
 */
import { won, usd } from './format.js';

/**
 * 한 번의 거래를 나눠요.
 * @param {{ buyPrice: number, sellPrice: number, qty: number, rateBuy: number, rateSell: number }} t ($, 주, 원)
 * @returns 입력이 덜 됐으면 null
 */
export function splitFx({ buyPrice, sellPrice, qty, rateBuy, rateSell }) {
    if (!(buyPrice > 0 && sellPrice >= 0 && qty > 0 && rateBuy > 0 && rateSell > 0)) return null;
    return {
        buyPrice, sellPrice, qty, rateBuy, rateSell,
        usdPl: (sellPrice - buyPrice) * qty,                 // 달러로 본 손익
        pricePart: (sellPrice - buyPrice) * qty * rateBuy,   // 주가로 번 돈 (원)
        fxPart: sellPrice * qty * (rateSell - rateBuy),      // 환율로 번 돈 (원)
        priceRate: (sellPrice / buyPrice - 1) * 100,         // 주가 등락률 (%)
        fxRate: (rateSell / rateBuy - 1) * 100,              // 환율 등락률 (%)
        sameRate: Math.abs(rateSell - rateBuy) < 1e-9,
    };
}

/**
 * 여러 번 나눠 판 거래(분할 매도)를 합쳐요. 환율은 모든 단계가 같아요.
 * @param {Array} parts - splitFx() 결과들
 */
export function combineFx(parts) {
    const ok = parts.filter(Boolean);
    if (!ok.length) return null;
    const sum = (k) => ok.reduce((a, p) => a + p[k], 0);
    const qty = sum('qty');
    const buy = ok.reduce((a, p) => a + p.buyPrice * p.qty, 0);
    const sell = ok.reduce((a, p) => a + p.sellPrice * p.qty, 0);
    const { rateBuy, rateSell } = ok[0];
    return {
        buyPrice: buy / qty, sellPrice: sell / qty, qty, rateBuy, rateSell,
        usdPl: sum('usdPl'),
        pricePart: sum('pricePart'),
        fxPart: sum('fxPart'),
        priceRate: (sell / buy - 1) * 100,
        fxRate: (rateSell / rateBuy - 1) * 100,
        sameRate: ok[0].sameRate,
    };
}

/* ---------- 보여주기 ---------- */

const sign = (n) => (Math.round(n) > 0 ? '+' : Math.round(n) < 0 ? '−' : '');
const krw = (n) => `${sign(n)}${won(Math.abs(n))}원`;
const pct = (n, d = 2) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(d)}%`;
const tone = (n) => (Math.round(n) > 0 ? 'tone-up' : Math.round(n) < 0 ? 'tone-down' : '');

/** 한 줄 해석: 주가와 환율이 각각 이익인지 손해인지에 따라 */
export function fxMessage(s) {
    const p = Math.round(s.pricePart);
    const f = Math.round(s.fxPart);
    const total = p + f;
    if (f === 0) return '환율이 그대로라 손익이 모두 주가에서 나왔어요.';
    if (p === 0) return '주가는 그대로라 손익이 모두 환율에서 나왔어요.';
    if (p > 0 && f > 0) return '주가와 환율 모두 이익이에요.';
    if (p < 0 && f < 0) return '주가와 환율 모두 손해예요.';
    if (p > 0) {
        return total >= 0
            ? `주가로는 벌었지만 환율이 내려서 원화로는 ${won(-f)}원 덜 벌었어요.`
            : '주가로는 벌었지만 환율이 더 많이 내려서 원화로는 손해예요.';
    }
    return total <= 0
        ? `환율이 올라서 손실이 ${won(f)}원 줄었어요.`
        : '주가는 내렸지만 환율이 더 많이 올라서 원화로는 이익이에요.';
}

/**
 * "손익 쪼개 보기" 블록 HTML
 * @param {object} s - splitFx() / combineFx() 결과
 * @param {Array<{ label: string, value: number, divider?: boolean, strong?: boolean }>} [after]
 *   매매 차익 아래에 이어 붙일 줄 (예: 수수료·세금, 순손익)
 */
export function fxSplitHtml(s, after = []) {
    const priceLabel = Math.round(s.pricePart) >= 0 ? '주가로 번 돈' : '주가로 잃은 돈';
    const fxLabel = Math.round(s.fxPart) >= 0 ? '환율로 번 돈' : '환율로 잃은 돈';
    // 두 몫의 크기 비율 막대 (손해는 파랑, 이익은 빨강)
    const absSum = Math.abs(s.pricePart) + Math.abs(s.fxPart) || 1;
    const pw = Math.abs(s.pricePart) / absSum * 100;
    const fw = 100 - pw;
    const seg = (w, v, name) => w < 0.5 ? '' :
        `<i class="${Math.round(v) >= 0 ? 'is-up' : 'is-down'}${name === 'fx' ? ' is-fx' : ''}" style="width:${w.toFixed(1)}%">${w >= 22 ? `${name === 'fx' ? '환율' : '주가'} ${Math.round(w)}%` : ''}</i>`;

    return `
        <h3 class="sub-title">손익 쪼개 보기 <span class="sub-title-note">주가 ${pct(s.priceRate, 1)} · 환율 ${pct(s.fxRate)}</span></h3>
        <ul class="rows rows-tight fx-rows">
            <li><span>${priceLabel}</span><span class="${tone(s.pricePart)}">${krw(s.pricePart)}</span></li>
            <li class="sub"><span>$${usd(s.buyPrice)} → $${usd(s.sellPrice)} × ${won(s.qty)}주 · 산 날 환율 ${won(s.rateBuy)}원</span><span>${s.usdPl >= 0 ? '+' : '−'}$${usd(Math.abs(s.usdPl))}</span></li>
            <li><span>${fxLabel}</span><span class="${tone(s.fxPart)}">${krw(s.fxPart)}</span></li>
            <li class="sub"><span>판 금액 $${usd(s.sellPrice * s.qty)} × (${won(s.rateSell)} − ${won(s.rateBuy)}원)</span><span></span></li>
            <li class="divider"><span>매매 차익 (원화)</span><span class="${tone(s.pricePart + s.fxPart)}">${krw(s.pricePart + s.fxPart)}</span></li>
            ${after.map(a => `<li class="${a.divider ? 'divider' : 'sub'}"><span>${a.label}</span><span class="${a.strong ? tone(a.value) : ''}">${krw(a.value)}</span></li>`).join('')}
        </ul>
        <div class="fx-bar" aria-hidden="true">${seg(pw, s.pricePart, 'price')}${seg(fw, s.fxPart, 'fx')}</div>
        <p class="note fx-msg">${fxMessage(s)} 우리나라 해외주식 양도소득세는 원화로 계산해서, 환율로 번 돈에도 세금이 붙어요.</p>`;
}

/** 매수 시 환율을 안 넣었을 때 (두 환율이 같아 나눌 게 없을 때) 안내 */
export const fxHintHtml = '<p class="note">매수 시 환율을 넣으면 손익을 "주가로 번 돈"과 "환율로 번 돈"으로 나눠 보여줘요.</p>';
