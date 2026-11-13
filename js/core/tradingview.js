/**
 * tradingview.js — 트레이딩뷰 시세 (해외 주식·선물·달러 인덱스·국채 금리)
 *
 * 트레이딩뷰 사이트가 종목 검색·스크리너에 쓰는 주소(scanner.tradingview.com)를 불러요.
 * ⚠ 공식 API가 아니에요. 바뀌거나 막히면 이 파일만 고치면 되게 모아뒀어요.
 *
 * 네이버(JSONP)와 달리 숫자(JSON)만 받는 보통 요청이라, 남의 코드를 우리 페이지에서 실행하지 않아요.
 * 트레이딩뷰가 브라우저 요청을 허락해줘서(CORS) fetch로 바로 받을 수 있어요.
 *
 * 요청 모양
 *   POST https://scanner.tradingview.com/{시장}/scan
 *   { symbols: { tickers: ['NASDAQ:AAPL', 'TVC:DXY'] }, columns: ['close', 'change'] }
 * 응답 모양
 *   { data: [ { s: 'NASDAQ:AAPL', d: [354.88, -0.21] }, ... ] }   ← d는 columns 순서대로
 *
 * 여러 종목을 한 번에 묶어 받아요 (요청을 적게 보내야 막힐 위험이 줄어요).
 * 'global' 시장은 주식·선물·지수·국채를 가리지 않고 받아줘요.
 */
import { netFetch } from './network.js';

const URL_BASE = 'https://scanner.tradingview.com';
const TIMEOUT = 10000;

/**
 * 종목들의 칸(columns)을 받아요.
 * @param {string[]} tickers - 'EXCHANGE:SYMBOL' 모양 (예: 'NASDAQ:AAPL', 'CME_MINI:NQ1!')
 * @param {string[]} columns - 트레이딩뷰 칸 이름
 * @param {string} [market='global']
 * @returns {Promise<Map<string, Record<string, any>>>} 티커 → { 칸이름: 값 }
 */
export async function scan(tickers, columns, market = 'global') {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
        // body를 문자열로 보내면 "단순 요청"이라 사전 확인(preflight) 없이 바로 가요
        const res = await netFetch(`${URL_BASE}/${market}/scan`, {
            method: 'POST',
            body: JSON.stringify({ symbols: { tickers }, columns }),
            signal: ctl.signal,
        });
        if (!res.ok) throw new Error(`트레이딩뷰 응답 ${res.status}`);
        const json = await res.json();
        if (!Array.isArray(json?.data)) throw new Error('트레이딩뷰 응답 모양이 달라요');
        return new Map(json.data.map(row => [row.s, Object.fromEntries(columns.map((c, i) => [c, row.d?.[i] ?? null]))]));
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 지연 글자: 'delayed_streaming_600' → '10분 지연', 'streaming' → '실시간'
 * @param {string | null} mode - update_mode 칸
 */
export function delayText(mode) {
    const m = /delayed\D*(\d+)/.exec(mode ?? '');
    if (m) return `${Math.round(Number(m[1]) / 60)}분 지연`;
    return mode === 'streaming' ? '실시간' : '';
}

/* ---------- 미국 종목 ---------- */

/** 미국 종목 한 개에 받는 칸 */
const US_COLUMNS = [
    'close', 'change', 'change_abs', 'open', 'high', 'low', 'volume',
    'price_52_week_high', 'price_52_week_low',
    'price_earnings_ttm', 'price_book_fq', 'earnings_per_share_basic_ttm',
    'dps_common_stock_prim_issue_fy', 'dividends_yield_current', 'market_cap_basic',
    // ETF는 위 배당 칸이 비어 있어서 이 칸들을 써요 (최근 12개월 배당 수익률, 최근 1회 분배금, 지급 주기)
    'dividends_yield', 'dividend_amount_recent', 'dividends_frequency',
    'premarket_close', 'premarket_change', 'postmarket_close', 'postmarket_change',
    'nav', 'aum', 'expense_ratio', 'type', 'update_mode', 'description',
];

/**
 * 미국 종목 시세·가치 (트레이딩뷰, 보통 15분 지연)
 * @param {{ code: string, exchange: string }} stock - 예: { code: 'AAPL', exchange: 'NASDAQ' }
 * @returns {Promise<object>} 종목 정보 화면이 쓰는 모양 (국내 naver.js loadItems와 비슷하게)
 */
export async function loadUsQuote(stock) {
    const ticker = `${stock.exchange}:${stock.code}`;
    const rows = await scan([ticker], US_COLUMNS);
    const r = rows.get(ticker);
    const price = num(r?.close);
    if (price == null) throw new Error('시세가 없어요');
    const change = num(r.change_abs) ?? 0;
    const extra = (close, pct) => (num(close) != null ? { price: close, rate: num(pct) ?? 0 } : null);
    // 배당: 주식은 1년 주당 배당금 칸이 있고, ETF는 없어서 "현재가 × 최근 12개월 배당 수익률"로 추정해요
    const divYield = num(r.dividends_yield_current) ?? num(r.dividends_yield);
    let dps = num(r.dps_common_stock_prim_issue_fy);
    const dpsEstimated = dps == null && divYield > 0;
    if (dpsEstimated) dps = price * divYield / 100;
    return {
        code: stock.code,
        name: r.description,
        price,
        prev: price - change,
        change,
        rate: num(r.change) ?? 0,
        dayOpen: num(r.open), high: num(r.high), low: num(r.low), volume: num(r.volume),
        high52: num(r.price_52_week_high), low52: num(r.price_52_week_low),
        per: num(r.price_earnings_ttm), pbr: num(r.price_book_fq), eps: num(r.earnings_per_share_basic_ttm),
        dps,                                                  // 1년 주당 배당금 (달러, 주식은 최근 회계연도 / ETF는 추정)
        dpsEstimated,                                         // true면 현재가 × 최근 12개월 수익률로 추정한 값
        divYield,                                             // 배당 수익률 (%, 최근 12개월)
        divRecent: num(r.dividend_amount_recent),             // 최근 1회 분배금 (달러)
        divFreq: FREQ_N[r.dividends_frequency] ?? null,       // 1년에 몇 번 (12·4·2·1, 모르면 null)
        cap: num(r.market_cap_basic),
        pre: extra(r.premarket_close, r.premarket_change),    // 프리마켓 (정규장 전)
        post: extra(r.postmarket_close, r.postmarket_change), // 애프터마켓 (정규장 뒤)
        isEtf: r.type === 'fund',
        nav: num(r.nav), aum: num(r.aum), expense: num(r.expense_ratio),
        delay: delayText(r.update_mode),
        time: Date.now(),
    };
}

/** 트레이딩뷰 지급 주기 → 1년에 몇 번 */
const FREQ_N = { Monthly: 12, Quarterly: 4, 'Semi-Annual': 2, 'Semi-annual': 2, Annual: 1, Annually: 1 };

/**
 * 국내 종목 배당 보충: 네이버에 주당 배당금이 없을 때(ETF 등) 트레이딩뷰 분배율로 1년 분배금을 추정해요.
 *   1년 분배금 ≈ 현재가 × 최근 12개월 분배율
 * 트레이딩뷰의 국내 1회 분배금·지급 주기는 단위가 이상하거나 "기타"로 와서 쓰지 않아요.
 * 실패해도 시세는 그대로 보여줘야 해서 오류를 던지지 않아요.
 * @param {{ code: string, price: number, dps: number | null }} data - naver.js loadItems의 종목 한 개 (바꿔서 돌려줘요)
 */
export async function addKrDividend(data) {
    if (data.dps > 0) {
        data.divYield ??= data.dps / data.price * 100;
        return data;
    }
    try {
        const rows = await scan([`KRX:${data.code}`], ['dividends_yield']);
        const y = num(rows.get(`KRX:${data.code}`)?.dividends_yield);
        if (y > 0) {
            data.divYield = y;
            data.dps = Math.round(data.price * y / 100);
            data.dpsEstimated = true;
        }
    } catch {
        // 배당은 덤이라 못 받아도 넘어가요
    }
    return data;
}

/**
 * 목록 파일에 없는 미국 종목 찾기 (코드나 영문 이름으로, 시가총액 순)
 * @returns {Promise<Array<{ code, name, en, exchange, type }>>}
 */
export async function searchUs(query) {
    const q = query.trim();
    if (!/^[A-Za-z0-9 .&-]+$/.test(q)) return [];   // 영문·숫자만 (한글은 목록 파일에서 찾아요)
    const body = (left) => ({
        filter: [
            { left, operation: 'match', right: q },
            { left: 'exchange', operation: 'in_range', right: ['NASDAQ', 'NYSE', 'AMEX'] },
        ],
        sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
        columns: ['name', 'description', 'exchange', 'type'],
        range: [0, 10],
    });
    const run = async (left) => {
        const res = await netFetch(`${URL_BASE}/america/scan`, { method: 'POST', body: JSON.stringify(body(left)) });
        if (!res.ok) return [];
        const json = await res.json();
        return (json.data ?? []).map(({ d }) => ({ code: d[0], name: d[1], en: d[1], exchange: d[2], type: d[3] === 'fund' ? 'E' : 'S' }));
    };
    const byCode = await run('name');
    return byCode.length ? byCode : run('description');
}

/** 숫자면 그대로, 아니면 null (응답이 바뀌었을 때 엉뚱한 값을 보여주지 않게) */
export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * 시세 한 줄을 우리 모양으로: { value, prev, change, rate, delay }
 * prev(전일 종가) = 지금 값 − 전일 대비(change_abs)
 */
export function quoteOf(row) {
    const value = num(row?.close);
    if (value == null) return null;
    const change = num(row.change_abs) ?? 0;
    return { value, prev: value - change, change, rate: num(row.change) ?? 0, delay: delayText(row.update_mode) };
}
