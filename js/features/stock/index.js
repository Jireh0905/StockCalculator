/**
 * stock/index.js — 종목 정보 (종목 검색 → 시세·가치·배당·차트 → 계산기로)
 *
 * 맨 위 [국내 주식 | 해외 주식]은 계산기와 같은 선택이에요 (markets: true → 고른 종목도 시장마다 따로 기억).
 *
 *              국내                                         해외 (미국)
 *   검색 ...... data/stocks.json                             data/us-stocks.json (+ 트레이딩뷰 검색)
 *   시세 ...... 네이버 증권 실시간 (core/naver.js, JSONP)      트레이딩뷰 15분 지연 (core/tradingview.js, JSON)
 *   차트 ...... 네이버 차트 그림 (<img>)                      트레이딩뷰 차트 위젯 (iframe, 분봉~월봉)
 *   카드 ...... 이 파일                                       us-view.js
 * 둘 다 비공식 경로라 바뀌면 그 카드만 "불러오지 못했어요"가 돼요.
 *
 * 계산기가 아니라서 기록 버튼이 없어요 (records: false). 고른 종목·차트 종류는 입력값처럼 기억해요.
 */
import { createStockSearch, MARKET_NAMES, escapeHtml } from '../../core/stock-search.js';
import { loadItems } from '../../core/naver.js';
import { loadUsQuote, addKrDividend } from '../../core/tradingview.js';
import { isOnline, onNetworkChange } from '../../core/network.js';
import { won, clockTime } from '../../core/format.js';
import { fixed, sign, tone, arrow, row, titleHtml, rangeHtml, linksCard } from './parts.js';
import { usPriceCard, usValueCard, usChartCard, usTitle, mountUsChart, usd } from './us-view.js';

/** 장중에 이 화면을 보고 있으면 이 간격으로 시세를 다시 받아요 */
const AUTO_REFRESH_MS = 30 * 1000;

/** 차트 그림 종류: [주소 조각, 버튼 글자] */
const CHARTS = [
    ['area/day', '오늘'],   // 오늘 장 시작부터 지금까지 분 단위 선 (분봉 그림은 네이버에 없어요)
    ['candle/day', '일봉'], ['candle/week', '주봉'], ['candle/month', '월봉'],
    ['area/month3', '3개월'], ['area/year', '1년'], ['area/year3', '3년'],
];
/** 처음 열 때 차트: 일봉 */
const DEFAULT_CHART = 'candle/day';
const chartUrl = (kind, code) =>
    `https://ssl.pstatic.net/imgfinance/chart/item/${kind}/${code}.png?t=${Math.floor(Date.now() / 60000)}`; // 1분마다 새 그림

/* ---------- 숫자 글자 ---------- */

/** 큰 원화: 1,204조 2,000억 → "1,204.2조", 2,580억 → "2,581억" */
function bigWon(n) {
    if (n == null) return '—';
    if (Math.abs(n) >= 1e12) return `${fixed(n / 1e12, 1)}조 원`;
    if (Math.abs(n) >= 1e8) return `${won(n / 1e8)}억 원`;
    return `${won(n)}원`;
}

/** PER·PBR: 주가 ÷ 주당 값. 주당 값이 0 이하면 "적자"/"—" */
function ratio(price, perShare, negative = '적자') {
    if (perShare == null) return '—';
    if (perShare <= 0) return negative;
    return `${fixed(price / perShare)}배`;
}

/* ---------- 화면 조각 ---------- */

function emptyCard() {
    return `
        <section class="card result-card">
            <p class="result-empty"><span class="icon" aria-hidden="true">🔎</span>
                종목을 검색해 보세요.<br>실시간 가격과 PER·PBR·배당, 차트를 보여줘요.</p>
        </section>`;
}

/** 아직 시세가 없을 때 (불러오는 중 / 오프라인 / 실패) */
function waitingCard(stock, q) {
    let msg = '시세를 불러오는 중…';
    if (!isOnline()) msg = '인터넷에 연결되면 불러올게요';
    else if (q?.status === 'error') {
        msg = `시세를 불러오지 못했어요 <button type="button" class="mini-btn" data-retry data-needs-net>다시 시도</button>
            <small>${escapeHtml(q.error ?? '')}</small>`;
    }
    return `
        <section class="card result-card">
            ${stock.kind === 'us' ? usTitle(stock) : krTitle(stock, null)}
            <p class="mk-msg ${q?.status === 'error' ? 'is-error' : ''}">${msg}</p>
        </section>`;
}

/** 국내 제목: 이름 · 코드 · 시장 + 장중/장 마감 배지 */
function krTitle(stock, d) {
    // 정규장 밖(프리·애프터마켓, NXT)에서도 거래 중이면 그 이름으로
    const live = d?.session && d.session !== '정규장' ? `${d.session} 거래 중` : '장중';
    const badge = d ? (d.open ? `<span class="st-badge is-live">${live}</span>` : '<span class="st-badge">장 마감</span>') : '';
    return titleHtml(stock.name, `${stock.code} · ${MARKET_NAMES[stock.market] ?? ''}`, badge);
}

function priceCard(stock, q) {
    const d = q.data;
    const change = d.price - d.prev;
    const rate = d.prev ? change / d.prev * 100 : 0;
    const stale = q.status === 'error' ? ' · <button type="button" class="mk-stale" data-retry data-needs-net>새 값을 못 받았어요 ↻</button>' : '';
    return `
        <section class="card result-card">
            ${krTitle(stock, d)}
            <div class="result-amount">${won(d.price)}<small>원</small></div>
            <span class="rate-pill pill-${tone(change)}">${arrow(change)} ${won(Math.abs(change))} (${sign(rate)}${fixed(Math.abs(rate))}%)</span>
            <p class="st-time">${clockTime(new Date(q.time))} 기준${d.open ? ' · 거래 중에는 30초마다 새로 받아요' : ''}${stale}</p>
            <ul class="rows rows-tight st-rows">
                ${row('전일 종가', `${won(d.prev)}원`)}
                ${d.dayOpen != null ? row('시가', `${won(d.dayOpen)}원`) : ''}
                ${d.high != null ? row('고가', `${won(d.high)}원`, 'tone-up') : ''}
                ${d.low != null ? row('저가', `${won(d.low)}원`, 'tone-down') : ''}
                ${d.upper != null ? row('상한가 · 하한가', `${won(d.upper)} · ${won(d.lower)}`) : ''}
                ${d.volume != null ? row('거래량', `${won(d.volume)}주`) : ''}
                ${d.amount != null ? row('거래대금', bigWon(d.amount)) : ''}
                ${d.shares != null ? row('시가총액', bigWon(d.price * d.shares)) : ''}
            </ul>
            ${rangeHtml(d, won)}
        </section>`;
}

/** 1년 배당금 글자: 추정값이면 "약 3,154원" + 아래에 근거 */
function krDpsText(d) {
    if (d.dps == null) return '—';
    if (!d.dpsEstimated) return `${won(d.dps)}원`;
    return `약 ${won(d.dps)}원<small class="st-sub">최근 12개월 분배율 ${fixed(d.divYield)}% 기준 · 트레이딩뷰</small>`;
}

function valueCard(stock, d) {
    // ETF: PER·PBR 대신 NAV(순자산가치)와 괴리율, 분배금
    if (stock.market === 'E' || d.nav != null) {
        const gap = d.nav ? (d.price / d.nav - 1) * 100 : null;
        return `
            <section class="card">
                <h2 class="card-title">ETF 가치 · 분배금</h2>
                <ul class="rows rows-tight st-rows">
                    ${row('NAV (순자산가치)', d.nav != null ? `${fixed(d.nav)}원` : '—')}
                    ${row('괴리율', gap != null ? `${sign(gap)}${fixed(Math.abs(gap))}%` : '—')}
                    <li class="divider"><span>분배금 (1년)</span><span>${krDpsText(d)}</span></li>
                    ${row('분배율', d.divYield != null ? `${fixed(d.divYield)}%` : '—')}
                </ul>
                <p class="mk-note">ETF는 PER·PBR 대신, 가격이 담고 있는 자산 가치(NAV)보다 비싼지(+) 싼지(−)를 봐요.
                    분배금은 현재가 × 최근 12개월 분배율로 추정한 값이라, 매달 분배금이 바뀌는 상품은 앞으로 받을 금액과 다를 수 있어요.</p>
            </section>`;
    }
    const yieldPct = d.divYield ?? (d.dps != null && d.price ? d.dps / d.price * 100 : null);
    return `
        <section class="card">
            <h2 class="card-title">가치 · 배당</h2>
            <ul class="rows rows-tight st-rows">
                ${row('PER', ratio(d.price, d.eps))}
                ${row('예상 PER', ratio(d.price, d.cnsEps))}
                ${row('PBR', ratio(d.price, d.bps, '—'))}
                <li class="divider"><span>EPS (주당순이익)</span><span>${d.eps != null ? `${won(d.eps)}원` : '—'}</span></li>
                ${row('BPS (주당순자산)', d.bps != null ? `${won(d.bps)}원` : '—')}
                <li class="divider"><span>주당 배당금 (1년)</span><span>${krDpsText(d)}</span></li>
                ${row('배당 수익률', yieldPct != null ? `${fixed(yieldPct)}%` : '—')}
            </ul>
            <p class="mk-note">PER = 주가 ÷ EPS, PBR = 주가 ÷ BPS. EPS·BPS·주당 배당금은 최근 결산 기준이고,
                예상 PER은 증권사 추정 EPS 기준이에요 (네이버 증권).</p>
        </section>`;
}

function chartCard(stock, kind) {
    return `
        <section class="card">
            <h2 class="card-title">차트</h2>
            <div class="segmented small st-chart-tabs" role="tablist" aria-label="차트 종류">
                ${CHARTS.map(([k, label]) => `<button type="button" role="tab" aria-selected="${k === kind}" data-chart="${k}">${label}</button>`).join('')}
            </div>
            <div class="st-chart">
                ${isOnline()
                    ? `<img src="${chartUrl(kind, stock.code)}" alt="${escapeHtml(stock.name)} ${CHARTS.find(c => c[0] === kind)?.[1]} 차트" width="700" height="289" data-chart-img>`
                    : '<p class="mk-msg">인터넷에 연결되면 보여요</p>'}
            </div>
            <p class="mk-note">네이버 증권 차트 그림이에요. 그림이라 누르거나 확대할 수는 없어요.</p>
        </section>`;
}

/* ---------- 화면 ---------- */

/** 시세 상태 (모듈 변수라 화면을 떠났다 와도 남아요) { code, status, data, time, error } */
let quote = null;

export default {
    id: 'stock',
    name: '종목 정보',
    shortName: '종목 정보',
    desc: '국내·미국 종목 검색 · 가격·PER·PBR·배당·차트',
    group: '정보',
    icon: 'stock',
    color: 'c10',
    records: false,
    markets: true,   // 맨 위 [국내 | 해외] (계산기와 같은 선택, 입력값도 시장마다 따로)

    mount(view, ctx) {
        view.innerHTML = `
            <div class="st-page">
                <section class="card st-search" data-search></section>
                <div class="st-grid">
                    <div class="st-col">
                        <div class="st-slot" data-slot="price"></div>
                        <div class="st-slot" data-slot="value"></div>
                    </div>
                    <div class="st-col">
                        <div class="st-slot" data-slot="chart"></div>
                        <div class="st-slot" data-slot="links"></div>
                    </div>
                </div>
            </div>`;
        const slot = (name) => view.querySelector(`[data-slot="${name}"]`);

        const us = ctx.market === 'global';
        let stock = ctx.inputs?.stock ?? null;       // 국내 { kind:'kr', code, name, market } / 해외 { kind:'us', code, name, en, exchange, type }
        if (stock && (stock.kind ?? 'kr') !== (us ? 'us' : 'kr')) stock = null;
        let chartKind = CHARTS.some(c => c[0] === ctx.inputs?.chart) ? ctx.inputs.chart : DEFAULT_CHART;
        const remember = () => ctx.saveInputs({ stock, chart: chartKind });

        const draw = () => {
            if (!view.isConnected) return;
            const q = quote?.code === stock?.code ? quote : null;
            if (!stock) {
                slot('price').innerHTML = emptyCard();
                ['value', 'chart', 'links'].forEach(n => { slot(n).innerHTML = ''; });
                return;
            }
            if (!q?.data) {
                slot('price').innerHTML = waitingCard(stock, q);
                slot('value').innerHTML = '';
                slot('links').innerHTML = '';
            } else if (us) {
                slot('price').innerHTML = usPriceCard(stock, q);
                slot('value').innerHTML = usValueCard(stock, q.data);
                slot('links').innerHTML = linksCard(q.data, usd, '해외 주식');
            } else {
                slot('price').innerHTML = priceCard(stock, q);
                slot('value').innerHTML = valueCard(stock, q.data);
                slot('links').innerHTML = linksCard(q.data, (n) => `${won(n)}원`, '국내 주식');
            }
            if (us) {
                // 해외 차트: 트레이딩뷰 위젯은 종목이 바뀌거나 연결될 때만 새로 넣어요 (다시 넣으면 새로 로딩돼서)
                const key = `${stock.exchange}:${stock.code}|${isOnline()}`;
                if (slot('chart').dataset.key !== key) {
                    slot('chart').innerHTML = usChartCard(stock);
                    slot('chart').dataset.key = key;
                    mountUsChart(slot('chart').querySelector('[data-tv-chart]'), stock);
                }
                return;
            }
            // 차트는 종목·종류가 바뀌었을 때만 다시 그려요 (시세를 새로 받을 때마다 그림이 깜빡이지 않게)
            const chartKey = `${stock.code}|${chartKind}|${isOnline()}`;
            if (slot('chart').dataset.key !== chartKey) {
                slot('chart').innerHTML = chartCard(stock, chartKind);
                slot('chart').dataset.key = chartKey;
                const img = slot('chart').querySelector('[data-chart-img]');
                img?.addEventListener('error', () => {
                    img.replaceWith(Object.assign(document.createElement('p'), { className: 'mk-msg', textContent: '차트 그림을 불러오지 못했어요' }));
                });
            } else if (chartKind === 'area/day') {
                // '오늘' 그림은 시세를 새로 받을 때 같이 새로 (주소가 1분마다 바뀌어서 많아야 1분에 한 번)
                const img = slot('chart').querySelector('[data-chart-img]');
                const url = chartUrl(chartKind, stock.code);
                if (img && img.getAttribute('src') !== url) img.src = url;
            }
        };

        /** 시세 받기 (같은 종목을 이미 받는 중이면 건너뛰어요) */
        const load = async () => {
            if (!stock || !isOnline()) return draw();
            const code = stock.code;
            if (quote?.code === code && quote.status === 'loading') return;
            quote = { ...(quote?.code === code ? quote : { code }), status: 'loading' };
            draw();
            try {
                let data;
                let time;
                if (us) {
                    data = await loadUsQuote(stock);
                    time = data.time;
                } else {
                    const res = await loadItems([code]);
                    data = res.items.find(it => it.code === code);
                    if (data) await addKrDividend(data);   // ETF처럼 네이버에 배당이 없으면 트레이딩뷰 분배율로
                    time = res.time;
                }
                if (!data) throw new Error('시세가 없어요 (거래 정지·상장 폐지일 수 있어요)');
                if (stock?.code === code) quote = { code, status: 'ok', data, time };
            } catch (err) {
                if (stock?.code === code) quote = { ...quote, status: 'error', error: err.message };
            }
            draw();
        };

        const select = (s) => {
            stock = s;
            remember();
            load();
        };

        createStockSearch(view.querySelector('[data-search]'), { kind: us ? 'us' : 'kr', onPick: select, autofocus: !stock });

        view.addEventListener('click', (e) => {
            if (e.target.closest('[data-retry]')) return load();
            const tab = e.target.closest('[data-chart]');
            if (tab) {
                chartKind = tab.dataset.chart;
                remember();
                return draw();
            }
            const send = e.target.closest('[data-send]');
            if (send && quote?.data) sendTo(send.dataset.send, quote.data);
        });

        /**
         * 계산기로 넘기기: 각 계산기의 receive가 받는 모양으로.
         * 국내/해외는 이 화면과 계산기가 같은 선택이라, 해외면 달러 값이 해외 계산기로 가요.
         */
        function sendTo(target, d) {
            const payload = {
                profit: { sellPrice: d.price },
                target: { buyPrice: d.price },
                split: { addBuyPrice: d.price },
                plan: { curPrice: d.price },
                // 해외는 지급 주기·최근 1회 분배금을 알면 같이 (배당 계산기가 주기를 그걸로 맞춰요)
                dividend: { price: d.price, annualDps: d.dps, recentDps: d.divRecent ?? null, freq: d.divFreq ?? null, estimated: !!d.dpsEstimated },
            }[target];
            if (payload) ctx.sendTo(target, payload);
        }

        // 연결이 돌아오면 다시 받기 / 끊기면 안내로
        const stopWatching = onNetworkChange((online) => {
            if (!view.isConnected) return stopWatching();
            const fresh = quote?.code === stock?.code && quote.status === 'ok';
            if (online && !fresh) load();
            else draw();
        });

        // 자동 갱신: 이 화면을 보고 있고, 탭이 보이고, 온라인일 때만
        //   국내는 거래 중일 때 30초마다, 해외는 15분 지연 값이라 1분마다 (30초 타이머 두 번에 한 번)
        let ticks = 0;
        const autoTimer = setInterval(() => {
            if (!view.isConnected) return clearInterval(autoTimer);
            if (document.hidden || !isOnline() || !stock || quote?.code !== stock.code) return;
            ticks += 1;
            if (us ? ticks % 2 === 0 : quote.data?.open) load();
        }, AUTO_REFRESH_MS);

        // 처음: 기억한 종목이 있으면 30초 안에 받은 값은 그대로, 아니면 새로 받기
        if (stock && !(quote?.code === stock.code && quote.status === 'ok' && Date.now() - quote.time < AUTO_REFRESH_MS)) load();
        else draw();
    },
};

