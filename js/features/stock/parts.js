/**
 * stock/parts.js — 종목 정보 화면의 국내·해외 공통 조각 (숫자 글자, 줄, 제목, 52주 막대, 계산기로 버튼)
 */
import { escapeHtml } from '../../core/stock-search.js';

export const fixed = (n, d = 2) => n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '');
export const tone = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat');
export const arrow = (n) => (n > 0 ? '▲' : n < 0 ? '▼' : '–');

/** 결과 줄: <li>이름 … 값</li> */
export const row = (label, value, cls = '') => `<li><span>${label}</span><span class="${cls}">${value}</span></li>`;

/** 이름 · 코드 · 시장 + 오른쪽 배지 */
export function titleHtml(name, codeLine, badge = '') {
    return `
        <div class="st-title">
            <h2>${escapeHtml(name)}</h2>
            <span class="st-code">${escapeHtml(codeLine)}</span>
            ${badge}
        </div>`;
}

/**
 * 52주 범위 막대: 최저 ─ ● ─ 최고
 * @param {{ price, high52, low52 }} d
 * @param {(n: number) => string} fmt - 가격 글자 (국내 "94,500", 해외 "$243.42")
 */
export function rangeHtml(d, fmt) {
    if (d.high52 == null || d.low52 == null || d.high52 <= d.low52) return '';
    const at = Math.min(Math.max((d.price - d.low52) / (d.high52 - d.low52), 0), 1) * 100;
    const fromHigh = (d.price / d.high52 - 1) * 100;
    const fromLow = (d.price / d.low52 - 1) * 100;
    return `
        <div class="st-range">
            <div class="st-range-head"><span>52주 최저 <b>${fmt(d.low52)}</b></span><span>최고 <b>${fmt(d.high52)}</b></span></div>
            <div class="st-range-bar" role="img" aria-label="52주 범위 중 ${Math.round(at)}% 위치"><i style="left:${at.toFixed(1)}%"></i></div>
            <p class="st-range-note">최고가보다 ${sign(fromHigh)}${fixed(Math.abs(fromHigh), 1)}% · 최저가보다 ${sign(fromLow)}${fixed(Math.abs(fromLow), 1)}%</p>
        </div>`;
}

/**
 * 계산기로 이어서 (국내·해외 같은 버튼, 가격 글자만 달라요)
 * @param {{ price: number, dps: number | null }} d
 * @param {(n: number) => string} fmt - 가격 글자 ("207,000원" / "$354.88")
 * @param {string} marketName - "국내 주식" / "해외 주식"
 */
export function linksCard(d, fmt, marketName) {
    const btn = (attr, title, sub) => `
        <button type="button" class="link-btn" ${attr}>
            <span>${title} <span aria-hidden="true">→</span></span><small>${sub}</small>
        </button>`;
    return `
        <section class="card">
            <h2 class="card-title">계산기로 이어서</h2>
            <div class="link-row">
                ${btn('data-send="profit"', '손익 계산', `현재가 ${fmt(d.price)} → 매도가`)}
                ${btn('data-send="target"', '목표가 계산', '현재가를 매수가로')}
                ${btn('data-send="split"', '분할 매매 계산', '현재가를 1차 추가 매수가로')}
                ${btn('data-send="plan"', '하락 대응 계산', '현재가 칸에')}
                ${d.dps > 0 ? btn('data-send="dividend"', '배당 계산', `주가·주당 배당금 ${fmt(d.dps)}`) : ''}
            </div>
            <p class="mk-note">${marketName} 계산기로 열려요. 평단·수량처럼 내 정보는 계산기에 있던 값을 그대로 둬요.</p>
        </section>`;
}
