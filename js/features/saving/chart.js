/**
 * saving/chart.js — 연도별 막대그래프(SVG)와 연도별 표
 *
 * 그래프 라이브러리 없이 SVG를 직접 그려요.
 * 숫자로 막대의 좌표(x, y, 너비, 높이)를 계산해서 <rect>를 만드는 방식이라,
 * MFC의 OnPaint에서 CDC::Rectangle로 그리는 것과 같아요. 다른 점은 한 번 그려두면
 * 창 크기가 바뀌어도 브라우저가 알아서 다시 그려준다는 것 (viewBox로 비율만 정해요).
 *
 * 색은 CSS(.bar-principal, .bar-gain)에서 정해서 다크 모드에서도 자동으로 바뀌어요.
 */
import { won } from '../../core/format.js';
import { isGlobal, money, isKrwView, fxRate } from '../../core/market.js';

/**
 * 해외 결과를 [원]으로 볼 때: 금액을 원화로 바꾼 줄과 '국내' 시장을 돌려줘요.
 * 그러면 눈금·표가 국내처럼 "2.7억", "만 원 단위"로 나와요.
 */
function forView(rows, market) {
    if (!isKrwView(market)) return { rows, market };
    const k = fxRate();
    return {
        rows: rows.map(r => ({ ...r, principal: r.principal * k, value: r.value * k, gain: r.gain * k, cashDiv: r.cashDiv * k })),
        market: 'domestic',
    };
}

/* ---------- 짧은 금액 (그래프 눈금·표용) ---------- */

/** 큰 금액을 짧게: 271,523,000 → "2.7억", 3,500,000 → "350만" / $208,861 → "$209K" */
export function compact(n, market) {
    const a = Math.abs(n);
    const sign = n < 0 ? '−' : '';
    const short = (v, digits) => v.toFixed(digits).replace(/\.0$/, ''); // "1.0" → "1"
    if (isGlobal(market)) {
        if (a >= 1e6) return `${sign}$${short(a / 1e6, a >= 1e7 ? 0 : 1)}M`;
        if (a >= 1e3) return `${sign}$${short(a / 1e3, a >= 1e4 ? 0 : 1)}K`;
        return `${sign}$${Math.round(a)}`;
    }
    if (a >= 1e8) return `${sign}${short(a / 1e8, a >= 1e9 ? 0 : 1)}억`;
    if (a >= 1e4) return `${sign}${won(a / 1e4)}만`;
    return `${sign}${won(a)}`;
}

/** 눈금 간격: 최댓값을 3~5칸으로 나누는 "보기 좋은" 숫자 (1, 2, 5 × 10^n) */
function niceStep(max) {
    const rough = max / 4;
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const n = rough / pow;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/* ---------- 막대그래프 ---------- */

const W = 320;          // viewBox 너비 (실제 크기는 CSS가 화면에 맞춰 늘려요)
const H = 180;          // viewBox 높이
const PAD = { left: 36, right: 6, top: 8, bottom: 20 };

/**
 * @param {Array<{ year, principal, value }>} rows
 * @param {string} market
 * @returns {string} SVG 문자열
 */
export function chartSvg(viewRows, viewMarket) {
    const { rows, market } = forView(viewRows, viewMarket);
    const max = Math.max(...rows.map(r => Math.max(r.value, r.principal)), 1);
    const step = niceStep(max);
    const top = Math.ceil(max / step) * step;
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const y = (v) => PAD.top + plotH - (v / top) * plotH;   // 금액 → 세로 좌표 (위가 0)
    const slot = plotW / rows.length;                       // 막대 하나가 쓰는 칸
    const barW = Math.max(slot * 0.68, 1.5);
    const labelEvery = rows.length <= 10 ? 1 : rows.length <= 30 ? 5 : 10;

    // 가로 눈금선 + 왼쪽 금액
    let grid = '';
    for (let v = 0; v <= top + 1e-6; v += step) {
        grid += `<line class="grid-line" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(v)}" y2="${y(v)}"/>
                 <text class="axis-label" x="${PAD.left - 4}" y="${y(v) + 3}" text-anchor="end">${v === 0 ? '0' : compact(v, market)}</text>`;
    }

    // 막대: 원금(아래, 회색) + 수익(위, 파랑). 손실이면 평가 금액까지만 회색, 원금까지는 점선 테두리
    const bars = rows.map((r, i) => {
        const x = PAD.left + slot * i + (slot - barW) / 2;
        const base = Math.min(r.principal, r.value);
        const gain = Math.max(r.value - r.principal, 0);
        const loss = r.value < r.principal
            ? `<rect class="bar-loss" x="${x}" y="${y(r.principal)}" width="${barW}" height="${y(r.value) - y(r.principal)}"/>` : '';
        const label = (r.year % labelEvery === 0 || rows.length === 1)
            ? `<text class="axis-label" x="${x + barW / 2}" y="${H - 6}" text-anchor="middle">${r.year}년</text>` : '';
        return `
            <g class="bar" data-year="${r.year}">
                <rect class="bar-hit" x="${PAD.left + slot * i}" y="${PAD.top}" width="${slot}" height="${plotH}"/>
                <rect class="bar-principal" x="${x}" y="${y(base)}" width="${barW}" height="${Math.max(y(0) - y(base), 0)}"/>
                ${gain > 0 ? `<rect class="bar-gain" x="${x}" y="${y(base + gain)}" width="${barW}" height="${y(base) - y(base + gain)}"/>` : ''}
                ${loss}
                ${label}
            </g>`;
    }).join('');

    return `
        <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="연도별 원금과 수익 막대그래프">
            ${grid}
            ${bars}
        </svg>`;
}

/** 그래프 위 설명 한 줄: "10년차 · 평가 X = 원금 Y + 수익 Z" */
export function caption(r, market) {
    const sign = r.gain >= 0 ? '+' : '−';
    return `<b>${r.year}년차</b> 평가 ${money(r.value, market)}
        <span>= 원금 ${money(r.principal, market)} ${sign} 수익 ${money(Math.abs(r.gain), market)}</span>`;
}

/* ---------- 연도별 표 ---------- */

/** 표 숫자: 국내는 만 원 단위, 해외는 달러 정수 (좁은 화면에 5칸이 들어가게) */
function cell(n, market) {
    return isGlobal(market) ? `$${Math.round(n).toLocaleString('en-US')}` : won(n / 1e4);
}

/**
 * @param {Array} rows
 * @param {string} market
 * @param {boolean} showCash - 받아서 쓴 배당 칸을 보여줄지
 */
export function tableHtml(viewRows, viewMarket, showCash) {
    const krwView = isKrwView(viewMarket);
    const { rows, market } = forView(viewRows, viewMarket);
    const last = rows[rows.length - 1].year;
    // 처음에는 1년차, 5년마다, 마지막 해만 보여주고 "전체 보기"로 펼쳐요
    const key = (y) => y === 1 || y % 5 === 0 || y === last;
    const body = rows.map(r => `
        <tr data-year="${r.year}" class="${key(r.year) ? '' : 'minor'}">
            <th>${r.year}년</th>
            <td>${cell(r.principal, market)}</td>
            <td>${cell(r.value, market)}</td>
            <td class="${r.gain < 0 ? 'tone-down' : 'tone-up'}">${cell(r.gain, market)}</td>
            ${showCash ? `<td>${cell(r.cashDiv, market)}</td>` : ''}
        </tr>`).join('');
    const hasMinor = rows.some(r => !key(r.year));
    return `
        <div class="year-table-wrap" data-collapsed="true">
            <table class="year-table">
                <thead><tr>
                    <th>연차</th><th>넣은 원금</th><th>평가 금액</th><th>수익</th>${showCash ? '<th>받은 배당</th>' : ''}
                </tr></thead>
                <tbody>${body}</tbody>
            </table>
            <p class="table-unit">${isGlobal(market) ? '단위: 달러' : krwView ? `단위: 만 원 (환율 ${won(fxRate())}원)` : '단위: 만 원'}${showCash ? ' · 받은 배당은 세후 누적' : ''}</p>
            ${hasMinor ? '<button type="button" class="text-btn table-toggle" data-table-toggle>전체 보기 ▾</button>' : ''}
        </div>`;
}
