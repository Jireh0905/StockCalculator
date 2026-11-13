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
