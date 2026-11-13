/**
 * naver.js — 네이버 증권 실시간 시세 (국내 지수·종목)
 *
 * 네이버 증권 페이지가 쓰는 시세 주소(polling.finance.naver.com)를 JSONP 방식으로 불러요.
 * ⚠ 공식 API가 아니에요. 네이버가 주소나 모양을 바꾸면 이 파일만 고치면 되게 모아뒀어요.
 *
 * JSONP란?
 *   브라우저는 다른 사이트의 데이터를 fetch로 읽는 걸 막지만(CORS), <script> 태그로 다른 사이트의
 *   "코드"를 실행하는 건 허락해요. 그래서 "?_callback=내함수"를 붙여 부르면 네이버가
 *   `내함수({...데이터...})` 모양의 코드를 보내고, 그 코드가 실행되면서 내 함수가 데이터를 받아요.
 *   남의 코드를 내 페이지에서 실행하는 방식이라, 믿을 수 있는 곳(네이버)에만 써요.
 *
 * 네이버 숫자 규칙
 *   지수(SERVICE_INDEX): 100배 정수 (529053 → 5,290.53), cv·cr에 부호가 있어요
 *   종목(SERVICE_ITEM): 원 단위, cv·cr은 부호 없이 크기만 → rf(등락 코드)로 방향을 정해요
 *     rf: 1 상한가, 2 상승, 3 보합, 4 하한가, 5 하락
 *   ms: 'OPEN' 장중 / 'CLOSE' 장 마감
 */
import { checkNow } from './network.js';

const BASE = 'https://polling.finance.naver.com/api/realtime?query=';
const TIMEOUT = 10000;
let seq = 0;

/**
 * JSONP로 불러요. 10초 안에 답이 없거나 스크립트를 못 받으면 실패 (연결 확인도 같이).
 * @returns {Promise<object>} 네이버 응답 그대로
 */
function jsonp(url) {
    return new Promise((resolve, reject) => {
        const name = `__jirehNaver${++seq}`;
        const script = document.createElement('script');
        const done = () => {
            clearTimeout(timer);
            script.remove();
            delete window[name];
        };
        const timer = setTimeout(() => {
            done();
            // 시간 초과 뒤에 늦게 도착해도 오류가 나지 않게 빈 함수로 남겨요 (불리면 스스로 지워요)
            window[name] = () => { delete window[name]; };
            checkNow();
            reject(new Error('네이버 응답이 없어요'));
        }, TIMEOUT);
        window[name] = (data) => {
            done();
            resolve(data);
        };
        script.onerror = () => {
            done();
            checkNow();
            reject(new Error('네이버 시세를 받지 못했어요'));
        };
        script.src = `${url}&_callback=${name}`;
        document.head.append(script);
    });
}

/** 응답에서 datas 배열 꺼내기 (모양이 다르면 오류) */
function datasOf(json, area) {
    const datas = json?.result?.areas?.find(a => a.name === area)?.datas;
    if (json?.resultCode !== 'success' || !Array.isArray(datas)) throw new Error('네이버 응답 모양이 달라요');
    return datas;
}

const isDown = (rf) => rf === '4' || rf === '5';
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** 종목 거래 시간대 (네이버 tradingSessionType → 화면 글자) */
const SESSIONS = {
    PRE_MARKET: '프리마켓',
    REGULAR_MARKET: '정규장',
    AFTER_MARKET: '애프터마켓',
};

/** 지수 이름 (네이버 코드 → 화면 이름) */
export const INDEX_NAMES = {
    KOSPI: '코스피',
    KOSDAQ: '코스닥',
    KPI200: '코스피200',
    FUT: '코스피200 선물',
};

/**
 * 국내 지수 (코스피·코스닥·코스피200·코스피200 선물)
 * @returns {Promise<{ time: number, items: Array<{ code, name, value, prev, high, low, open: boolean }> }>}
 */
export async function loadIndices(codes = Object.keys(INDEX_NAMES)) {
    const json = await jsonp(`${BASE}SERVICE_INDEX:${codes.join(',')}`);
    const items = datasOf(json, 'SERVICE_INDEX').map(d => {
        const value = num(d.nv);
        if (value == null) throw new Error(`${d.cd} 값이 없어요`);
        return {
            code: d.cd,
            name: INDEX_NAMES[d.cd] ?? d.cd,
            value: value / 100,
            prev: (value - (num(d.cv) ?? 0)) / 100,   // 지수의 cv는 부호가 있어요
            high: num(d.hv) != null ? d.hv / 100 : null,
            low: num(d.lv) != null ? d.lv / 100 : null,
            open: d.ms === 'OPEN',
        };
    });
    // 요청한 순서대로 (네이버가 순서를 바꿔 줘도)
    items.sort((a, b) => codes.indexOf(a.code) - codes.indexOf(b.code));
    if (!items.length) throw new Error('지수 값이 없어요');
    return { time: json.result.time ?? Date.now(), items };
}

/**
 * 국내 종목 시세 (여러 개 한 번에, 종목 코드 6자리)
 * EPS·BPS는 최근 결산 기준, cnsEps는 증권사 추정(컨센서스) EPS, dps는 주당 배당금(최근 결산)이에요.
 * @returns {Promise<{ time: number, items: Array<object> }>}
 */
export async function loadItems(codes) {
    const json = await jsonp(`${BASE}SERVICE_ITEM:${codes.join(',')}`);
    const items = datasOf(json, 'SERVICE_ITEM').map(d => {
        const sign = isDown(d.rf) ? -1 : 1;
        const price = num(d.nv);
        if (price == null) throw new Error(`${d.cd} 가격이 없어요`);
        return {
            code: d.cd,
            name: d.nm,
            price,
            prev: num(d.sv) ?? price - sign * (num(d.cv) ?? 0),
            change: sign * (num(d.cv) ?? 0),
            rate: sign * (num(d.cr) ?? 0),
            dayOpen: num(d.ov), high: num(d.hv), low: num(d.lv),
            upper: num(d.ul), lower: num(d.ll),               // 상한가·하한가
            volume: num(d.aq), amount: num(d.aa),             // 거래량(주)·거래대금(원)
            eps: num(d.eps), cnsEps: num(d.cnsEps), bps: num(d.bps), dps: num(d.dv),
            high52: num(d.highPriceOf52Weeks), low52: num(d.lowPriceOf52Weeks),
            shares: num(d.countOfListedStock),
            nav: num(d.nav),                                   // ETF 순자산가치
            open: d.ms === 'OPEN',
            // 거래 시간대: 정규장(9:00~15:30) 밖에도 대체거래소(NXT) 프리마켓·애프터마켓에서 가격이 움직여요
            session: SESSIONS[d.nxtOverMarketPriceInfo?.tradingSessionType] ?? null,
        };
    });
    return { time: json.result.time ?? Date.now(), items };
}
