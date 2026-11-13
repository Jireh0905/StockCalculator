/**
 * fx/sources.js — 시장 지표를 인터넷에서 받아오는 함수 모음 (화면과 무관)
 *
 * 출처마다 함수 하나씩. 받은 응답을 화면이 쓰기 좋은 숫자로 정리해서 돌려줘요.
 * MFC로 치면 Document 쪽이에요. 화면(index.js)은 이 파일이 어디서 받는지 몰라도 돼요.
 *
 * 모두 키 없이, 브라우저에서 바로 읽을 수 있는 곳만 골랐어요 (CORS 허용 확인).
 *   fx        유럽중앙은행 기준 환율 (Frankfurter)  하루 한 번
 *   fed       뉴욕 연은 기준 금리·실효 금리          하루 한 번
 *   treasury  미국 재무부 국채 금리 (CSV)           하루 한 번
 *   gold      금 현물 (gold-api.com)               실시간
 *   upbit     비트코인 원화 (업비트)                실시간
 *   binance   비트코인 달러 (바이낸스, USDT)        실시간
 *
 * 각 함수는 { ...값, date 또는 time } 을 돌려주고, 실패하면 오류를 던져요 (throw).
 */
import { netFetch } from '../../core/network.js';

/** 오래 기다리지 않게: 10초 안에 답이 없으면 실패로 봐요 */
const TIMEOUT = 10000;

/**
 * 주소에서 글자를 받아와요. 실패(네트워크·시간 초과·200이 아닌 응답)면 오류를 던져요.
 * fetch는 응답이 올 때까지 기다리는 "약속(Promise)"을 돌려줘요. await는 그 약속이 끝날 때까지 기다려요.
 * (WinHttp로 동기 호출하는 것과 비슷하지만, 기다리는 동안 화면이 멈추지 않아요)
 */
async function getText(url) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
        const res = await netFetch(url, { signal: ctl.signal }); // 네트워크 오류면 연결 확인 (core/network.js)
        if (!res.ok) throw new Error(`응답 ${res.status}`);
        return await res.text();
    } finally {
        clearTimeout(timer);
    }
}

const getJson = async (url) => JSON.parse(await getText(url));

/** 숫자가 맞는지 확인 (응답 모양이 바뀌었을 때 엉뚱한 값을 보여주지 않게) */
function num(v, what) {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    if (!Number.isFinite(n)) throw new Error(`${what} 값이 없어요`);
    return n;
}

/** 'YYYY-MM-DD' (n일 전) */
function daysAgo(n) {
    const d = new Date(Date.now() - n * 864e5);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------- 환율 (유럽중앙은행) ---------- */

/** 달러 인덱스 공식에 들어가는 통화 6개 (ICE 공식 가중치) */
const DXY_CODES = ['EUR', 'JPY', 'GBP', 'CAD', 'SEK', 'CHF'];

/**
 * 달러 인덱스(DXY) 근사값. 6개 통화에 대한 달러 값을 가중 기하평균으로 계산해요.
 *   DXY = 50.14348112 × EURUSD^−0.576 × USDJPY^0.136 × GBPUSD^−0.119 × USDCAD^0.091 × USDSEK^0.042 × USDCHF^0.036
 * r는 "1달러 = r[통화]" 모양이라 EUR·GBP는 뒤집어서 (1/r) 넣어요.
 * 실제 지수는 장중 시세로 계산하지만, 여기는 하루 한 번 기준가라 "근사값"이에요.
 * @param {Record<string, number>} r - 달러 기준 환율 { EUR: 0.90245, JPY: 159.7, ... }
 */
export function dollarIndex(r) {
    return 50.14348112
        * Math.pow(1 / r.EUR, -0.576)
        * Math.pow(r.JPY, 0.136)
        * Math.pow(1 / r.GBP, -0.119)
        * Math.pow(r.CAD, 0.091)
        * Math.pow(r.SEK, 0.042)
        * Math.pow(r.CHF, 0.036);
}

/**
 * 최근 기준 환율과 그 전 영업일 환율.
 * 열흘 치를 받아서 마지막 두 날짜를 써요 (주말·휴일에는 날짜가 비어 있어서).
 * @returns {Promise<{ date, prevDate, now: Record<string, number>, prev: Record<string, number> }>}
 *          now/prev는 "1달러 = 몇 [통화]" (KRW, JPY, CNY, EUR + 달러 인덱스용 통화)
 */
export async function loadFx() {
    const codes = ['KRW', 'JPY', 'CNY', ...DXY_CODES.filter(c => c !== 'JPY')];
    const json = await getJson(`https://api.frankfurter.dev/v1/${daysAgo(10)}..?base=USD&symbols=${codes.join(',')}`);
    const dates = Object.keys(json?.rates ?? {}).sort();
    if (dates.length < 2) throw new Error('환율 날짜가 모자라요');
    const pick = (date) => Object.fromEntries(codes.map(c => [c, num(json.rates[date][c], c)]));
    const [prevDate, date] = dates.slice(-2);
    return { date, prevDate, now: pick(date), prev: pick(prevDate) };
}

/* ---------- 미국 금리 ---------- */

/**
 * 미국 기준 금리(목표 범위)와 실효 금리(EFFR, 은행끼리 실제로 하루 빌려준 평균 금리).
 * 뉴욕 연은이 매 영업일 아침 전날 값을 발표해요.
 */
export async function loadFed() {
    const json = await getJson('https://markets.newyorkfed.org/api/rates/unsecured/effr/last/2.json');
    const [now, prev] = json?.refRates ?? [];
    if (!now) throw new Error('기준 금리 값이 없어요');
    return {
        date: now.effectiveDate,
        from: num(now.targetRateFrom, '목표 하단'),
        to: num(now.targetRateTo, '목표 상단'),
        effr: num(now.percentRate, '실효 금리'),
        prevEffr: prev ? num(prev.percentRate, '실효 금리') : null,
    };
}

/** 보여줄 국채 만기 (CSV 머리글 이름 → 화면 이름) */
export const TENORS = [
    ['1 Mo', '1개월'], ['3 Mo', '3개월'], ['6 Mo', '6개월'], ['1 Yr', '1년'],
    ['2 Yr', '2년'], ['5 Yr', '5년'], ['10 Yr', '10년'], ['30 Yr', '30년'],
];

/**
 * CSV 글자를 줄 배열로. 재무부 CSV는 쉼표 안에 쉼표가 없어서 간단히 나눠요.
 *   Date,"1 Mo","1.5 Month",...      ← 머리글 (따옴표 제거)
 *   11/12/2026,4.12,4.18,...         ← 최근 날짜가 맨 위
 * @returns {Array<Record<string, string>>} 머리글 이름으로 꺼낼 수 있는 줄들
 */
export function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const head = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    return lines.slice(1).map(line => {
        const cells = line.split(',');
        return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()]));
    });
}

/** 'MM/DD/YYYY' → 'YYYY-MM-DD' */
const isoFromUs = (s) => {
    const [m, d, y] = s.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

/**
 * 미국 국채 금리 (만기별 수익률, %). 최근 영업일과 그 전 영업일.
 * 재무부 CSV는 한 해 치씩 있어서, 1월 초처럼 올해 줄이 2개보다 적으면 작년 것도 받아요.
 */
export async function loadTreasury() {
    const url = (y) => 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/'
        + `${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`;
    const year = new Date().getFullYear();
    let rows = parseCsv(await getText(url(year)));
    if (rows.length < 2) rows = rows.concat(parseCsv(await getText(url(year - 1))));
    if (rows.length < 2) throw new Error('국채 금리 날짜가 모자라요');
    // 최근 날짜가 위에 오도록 (혹시 순서가 바뀌어 와도)
    rows.sort((a, b) => isoFromUs(b.Date).localeCompare(isoFromUs(a.Date)));
    const pick = (row) => Object.fromEntries(TENORS.map(([key]) => [key, num(row[key], key)]));
    return { date: isoFromUs(rows[0].Date), prevDate: isoFromUs(rows[1].Date), now: pick(rows[0]), prev: pick(rows[1]) };
}

/* ---------- 금·비트코인 ---------- */

/** 금 현물 가격 ($/트로이온스). 전날 값은 주지 않아서 변화는 없어요 */
export async function loadGold() {
    const json = await getJson('https://api.gold-api.com/price/XAU');
    return { price: num(json?.price, '금'), time: Date.parse(json.updatedAt) || Date.now() };
}

/**
 * 비트코인 원화 (업비트). 변화는 오늘 0시(한국 시간) 가격 대비예요.
 */
export async function loadUpbit() {
    const [t] = await getJson('https://api.upbit.com/v1/ticker?markets=KRW-BTC');
    return {
        price: num(t?.trade_price, '비트코인'),
        prev: num(t.prev_closing_price, '전일 종가'),
        time: t.trade_timestamp ?? Date.now(),
    };
}

/**
 * 비트코인 달러 (바이낸스 BTC/USDT). USDT는 1달러에 맞춰 움직이는 코인이라 달러로 봐요.
 * 변화는 24시간 전 대비예요.
 */
export async function loadBinance() {
    const t = await getJson('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT');
    const price = num(t?.lastPrice, '비트코인');
    return { price, prev: price - num(t.priceChange, '24시간 변화'), time: t.closeTime ?? Date.now() };
}

/** 트로이온스 → 그램 (금 무게 단위) */
export const GRAMS_PER_OZ = 31.1034768;

/**
 * 출처 목록: 화면이 이 순서대로 불러오고, 실패하면 이름으로 알려줘요.
 * 금 원/g처럼 두 출처를 섞는 값은 화면이 둘 다 받은 뒤에 계산해요.
 */
export const SOURCES = {
    fx: { name: '환율', load: loadFx },
    fed: { name: '기준 금리', load: loadFed },
    treasury: { name: '국채 금리', load: loadTreasury },
    gold: { name: '금 시세', load: loadGold },
    upbit: { name: '업비트 시세', load: loadUpbit },
    binance: { name: '바이낸스 시세', load: loadBinance },
};
