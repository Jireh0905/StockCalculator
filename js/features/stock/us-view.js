/**
 * stock/us-view.js — 종목 정보 화면의 해외(미국) 카드: 가격·가치·차트 위젯
 *
 * 시세는 트레이딩뷰(core/tradingview.js loadUsQuote, 보통 15분 지연),
 * 차트는 트레이딩뷰 차트 위젯 (iframe으로 끼워 넣어서 보여주기만, 분봉~월봉을 위젯 안에서 골라요).
 */
import { escapeHtml } from '../../core/stock-search.js';
import { isOnline } from '../../core/network.js';
import { getFx } from '../../core/session.js';
import { won, clockTime } from '../../core/format.js';
import { fixed, sign, tone, arrow, row, titleHtml, rangeHtml } from './parts.js';

/** 달러: 354.88 → "$354.88" */
export const usd = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** 큰 달러: 5.16조 달러 / 9,876억 달러 */
function bigUsd(n) {
    if (Math.abs(n) >= 1e12) return `${fixed(n / 1e12, 2)}조 달러`;
    if (Math.abs(n) >= 1e8) return `${won(n / 1e8)}억 달러`;
    return `${won(n)}달러`;
}

/** 큰 원화 (시가총액 환산): 6,880조 원 */
function bigWon(n) {
    if (Math.abs(n) >= 1e12) return `${won(n / 1e12)}조 원`;
    if (Math.abs(n) >= 1e8) return `${won(n / 1e8)}억 원`;
    return `${won(n)}원`;
}

/** 이름 아래 줄: "AAPL · NASDAQ · Apple Inc." */
const codeLine = (stock) => [stock.code, stock.exchange, stock.en && stock.en !== stock.name ? stock.en : '']
    .filter(Boolean).join(' · ');

/** 시세가 없을 때의 제목 */
export const usTitle = (stock) => titleHtml(stock.name, codeLine(stock));

/** 프리마켓·애프터마켓 한 줄 (값이 있을 때만) */
function extraRow(label, x) {
    if (!x) return '';
    return row(label, `${usd(x.price)} <small class="tone-${tone(x.rate)}">${sign(x.rate)}${fixed(Math.abs(x.rate))}%</small>`);
}

export function usPriceCard(stock, q) {
    const d = q.data;
    const stale = q.status === 'error' ? ' · <button type="button" class="mk-stale" data-retry data-needs-net>새 값을 못 받았어요 ↻</button>' : '';
    const badge = d.delay ? `<span class="st-badge">${d.delay}</span>` : '';
    return `
        <section class="card result-card">
            ${titleHtml(stock.name, codeLine(stock), badge)}
            <div class="result-amount"><small class="pre">$</small>${d.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <span class="rate-pill pill-${tone(d.change)}">${arrow(d.change)} ${usd(Math.abs(d.change))} (${sign(d.rate)}${fixed(Math.abs(d.rate))}%)</span>
            <p class="st-time">${clockTime(new Date(q.time))}에 받음 · 트레이딩뷰 · 이 화면을 보고 있으면 1분마다 새로 받아요${stale}</p>
            <ul class="rows rows-tight st-rows">
                ${row('전일 종가', usd(d.prev))}
                ${extraRow('프리마켓', d.pre)}
                ${extraRow('애프터마켓', d.post)}
                ${d.dayOpen != null ? row('시가', usd(d.dayOpen)) : ''}
                ${d.high != null ? row('고가', usd(d.high), 'tone-up') : ''}
                ${d.low != null ? row('저가', usd(d.low), 'tone-down') : ''}
                ${d.volume != null ? row('거래량', `${won(d.volume)}주`) : ''}
                ${d.cap != null ? row('시가총액', `${bigUsd(d.cap)} <small class="st-sub">약 ${bigWon(d.cap * getFx())} · 환율 ${won(getFx())}원</small>`) : ''}
            </ul>
            ${rangeHtml(d, usd)}
        </section>`;
}

/** PER·PBR: 값이 없으면 "—", 마이너스면 "적자" */
const multiple = (v, negative = '적자') => (v == null ? '—' : v <= 0 ? negative : `${fixed(v)}배`);

export function usValueCard(stock, d) {
    if (d.isEtf) {
        const gap = d.nav ? (d.price / d.nav - 1) * 100 : null;
        return `
            <section class="card">
                <h2 class="card-title">ETF 가치</h2>
                <ul class="rows rows-tight st-rows">
                    ${row('NAV (순자산가치)', d.nav != null ? usd(d.nav) : '—')}
                    ${row('괴리율', gap != null ? `${sign(gap)}${fixed(Math.abs(gap))}%` : '—')}
                    ${row('운용 자산', d.aum != null ? bigUsd(d.aum) : '—')}
                    ${row('총보수 (1년)', d.expense != null ? `${fixed(d.expense)}%` : '—')}
                    ${row('배당 수익률', d.yieldPct != null ? `${fixed(d.yieldPct)}%` : '—')}
                </ul>
                <p class="mk-note">ETF는 PER·PBR 대신, 가격이 담고 있는 자산 가치(NAV)보다 비싼지(+) 싼지(−)와 보수를 봐요.</p>
            </section>`;
    }
    return `
        <section class="card">
            <h2 class="card-title">가치 · 배당</h2>
            <ul class="rows rows-tight st-rows">
                ${row('PER', multiple(d.per))}
                ${row('PBR', multiple(d.pbr, '—'))}
                <li class="divider"><span>EPS (주당순이익)</span><span>${d.eps != null ? usd(d.eps) : '—'}</span></li>
                <li class="divider"><span>주당 배당금 (1년)</span><span>${d.dps != null ? usd(d.dps) : '—'}</span></li>
                ${row('배당 수익률', d.yieldPct != null ? `${fixed(d.yieldPct)}%` : '—')}
            </ul>
            <p class="mk-note">트레이딩뷰 기준이에요. PER·EPS는 최근 12개월(TTM) 순이익, 주당 배당금은 최근 회계연도 합계예요.
                미국 배당은 대부분 분기마다 나눠 줘요.</p>
        </section>`;
}

export function usChartCard(stock) {
    return `
        <section class="card">
            <h2 class="card-title">차트</h2>
            <div class="st-tv" data-tv-chart>${isOnline() ? '' : '<p class="mk-msg">인터넷에 연결되면 보여요</p>'}</div>
            <p class="mk-note">트레이딩뷰 차트예요. 위쪽에서 1분·5분·15분·1시간·일·주·월봉을 고를 수 있어요.
                ${escapeHtml(stock.exchange)}:${escapeHtml(stock.code)}</p>
        </section>`;
}

/**
 * 트레이딩뷰 차트 위젯 넣기 (iframe이라 우리 페이지와 분리돼요)
 * @param {HTMLElement} box - [data-tv-chart]
 */
export function mountUsChart(box, stock) {
    if (!box || !isOnline()) return;
    box.innerHTML = '<div class="tradingview-widget-container" style="height:100%"><div class="tradingview-widget-container__widget" style="height:100%"></div></div>';
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    // 위젯 설정은 <script> 안에 JSON으로 넣어요 (트레이딩뷰 위젯 방식)
    script.textContent = JSON.stringify({
        autosize: true,
        symbol: `${stock.exchange}:${stock.code}`,
        interval: 'D',
        timezone: 'Asia/Seoul',
        theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
        style: '1',
        locale: 'kr',
        hide_side_toolbar: true,
        allow_symbol_change: false,
        save_image: false,
        calendar: false,
    });
    box.firstChild.append(script);
}
