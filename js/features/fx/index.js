/**
 * fx/index.js — 시장 지표 (국내 증시·해외 선물·환율·금리·금·비트코인)
 *
 *   sources.js ... 출처마다 받아오기 (화면과 무관)
 *   index.js ..... 카드 그리기 + 새로고침 + 장중 자동 갱신 + 기준 환율로 쓰기 (이 파일)
 *
 * 계산기가 아니라서 국내/해외 버튼·입력값·기록이 없어요 (records: false → 기록 버튼도 숨겨요).
 *
 * 출처 8곳을 한꺼번에 요청하고, 하나씩 도착할 때마다 다시 그려요.
 * 한 곳이 실패해도 그 줄만 "불러오지 못했어요 · 다시 시도"가 나오고 나머지는 그대로예요.
 */
import { SOURCES, TENORS, dollarIndex, GRAMS_PER_OZ, KR_BASE_RATE } from './sources.js';
import { getFx, setFx } from '../../core/session.js';
import { showToast } from '../../core/toast.js';
import { clockTime } from '../../core/format.js';
import { isOnline, onNetworkChange } from '../../core/network.js';

/** 이 시간 안에 다시 들어오면 받아둔 값을 그대로 써요 (메뉴를 오갈 때마다 요청하지 않게) */
const FRESH_MS = 60 * 1000;
/** 장중 국내 증시 자동 갱신 간격 */
const AUTO_REFRESH_MS = 60 * 1000;

/**
 * 출처별 상태. 모듈 변수라 화면을 떠났다 돌아와도 남아 있어요.
 *   { status: 'loading' | 'ok' | 'error', data, at }
 * 다시 불러오는 중(loading)이거나 실패(error)해도 예전 data는 지우지 않아요.
 */
const state = {};
/** 마지막으로 모두 불러온 시각 */
let loadedAt = null;

/* ---------- 숫자 글자 ---------- */

/** 소수 d자리로 고정: 1334.1 → "1,334.10" */
const fixed = (n, d = 2) => n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** "11/12" (YYYY-MM-DD에서) */
const shortDate = (iso) => iso ? `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}` : '';

/** 오르면 빨강·내리면 파랑 (한국 증권 관례) */
const tone = (diff) => (diff > 0 ? 'tone-up' : diff < 0 ? 'tone-down' : '');
const arrow = (diff) => (diff > 0 ? '▲' : diff < 0 ? '▼' : '–');

/**
 * 변화 한 줄: "▲ 2.30 (+0.17%)"
 * 소수 d자리로 반올림해서 0이면 보합으로 봐요 (0.001 같은 작은 차이를 ▲로 그리지 않게).
 */
function change(now, prev, d = 2) {
    if (prev == null) return '';
    const diff = +(now - prev).toFixed(d);
    const pct = prev ? (now - prev) / prev * 100 : 0;
    return `<small class="mk-chg ${tone(diff)}">${arrow(diff)} ${fixed(Math.abs(diff), d)} (${pct >= 0 ? '+' : '−'}${fixed(Math.abs(pct), 2)}%)</small>`;
}

/** 금리 변화는 bp(0.01%p) 단위: "▲ 3bp" */
function bpChange(now, prev) {
    if (prev == null) return '';
    const bp = Math.round((now - prev) * 100);
    return `<small class="mk-chg ${tone(bp)}">${arrow(bp)} ${Math.abs(bp)}bp</small>`;
}

/* ---------- 카드 조각 ---------- */

/**
 * 지표 한 줄
 * @param {string} name - 이름 (예: 원/달러)
 * @param {string} sub - 이름 아래 작은 글자 (예: 1달러)
 * @param {string} value - 값 글자
 * @param {string} [chg] - 변화 글자 (change/bpChange)
 */
const row = (name, sub, value, chg = '') => `
    <li class="mk-row">
        <span class="mk-name">${name}${sub ? `<small>${sub}</small>` : ''}</span>
        <span class="mk-val"><b>${value}</b>${chg}</span>
    </li>`;

/** 묶음 제목: "국채 금리 · 미국 재무부 · 11/12 기준" */
const section = (title, meta) => `<li class="mk-section"><b>${title}</b>${meta ? `<span>${meta}</span>` : ''}</li>`;

/** 받침이 있으면 '을', 없으면 '를' (환율을 / 금 시세를) */
const eulReul = (word) => ((word.charCodeAt(word.length - 1) - 0xAC00) % 28 ? '을' : '를');

/** 아직 못 받았거나 실패한 출처의 자리 (받은 값이 있으면 null → 그 값을 그려요) */
function placeholder(id) {
    const s = state[id];
    if (s?.data) return null;
    if (s?.status === 'loading') return `<li class="mk-msg">불러오는 중…</li>`;
    // 오프라인이면 실패 대신 "연결되면 불러올게요" (연결이 돌아오면 index.js가 저절로 다시 불러와요)
    if (!isOnline()) return `<li class="mk-msg">인터넷에 연결되면 불러올게요</li>`;
    if (s?.status === 'error') {
        const name = SOURCES[id].name;
        return `<li class="mk-msg is-error">${name}${eulReul(name)} 불러오지 못했어요
            <button type="button" class="mini-btn" data-retry="${id}" data-needs-net>다시 시도</button></li>`;
    }
    return `<li class="mk-msg">불러오는 중…</li>`;
}

/** 예전 값을 보여주는 중인데 새로 받다가 실패했으면 묶음 제목 옆에 작게 알려요 (오프라인이면 맨 위 한 줄로 대신) */
const staleNote = (id) => (state[id]?.status === 'error' && state[id]?.data && isOnline()
    ? ` · <button type="button" class="mk-stale" data-retry="${id}" data-needs-net>새 값을 못 받았어요 ↻</button>` : '');

/** 실시간 출처의 시각: "15:07" */
const timeOf = (id) => clockTime(new Date(state[id].data.time));

/* ---------- 카드 ---------- */

function krCard() {
    let body = placeholder('kr');
    if (!body) {
        body = state.kr.data.items.map(it => row(
            it.name,
            it.open ? '<span class="mk-live">장중</span>' : '장 마감',
            fixed(it.value),
            change(it.value, it.prev),
        )).join('');
    }
    const meta = state.kr?.data ? `네이버 증권 · ${timeOf('kr')}${staleNote('kr')}` : '네이버 증권';
    return `
        <section class="card mk-card">
            <h2 class="card-title">국내 증시</h2>
            <p class="mk-meta">${meta}</p>
            <ul class="mk-list">${body}</ul>
            <p class="mk-note">네이버 증권 시세예요. 공식 API가 아니라서 네이버가 바꾸면 안 보일 수 있어요.
                장중에 이 화면을 보고 있으면 1분마다 새로 받아요.</p>
        </section>`;
}

/** 트레이딩뷰 값의 출처·지연 글자: "트레이딩뷰 · 10분 지연" */
const tvMeta = (quote) => `트레이딩뷰${quote?.delay ? ` · ${quote.delay}` : ''}`;

/** 해외 선물: 트레이딩뷰 숫자 (근월물 연결, 10분 지연) */
function futuresCard() {
    let body = placeholder('tv');
    if (!body) {
        body = state.tv.data.futures.map(f => f.quote
            ? row(f.name, f.unit, fixed(f.quote.value), change(f.quote.value, f.quote.prev))
            : row(f.name, f.unit, '—')).join('');
    }
    const first = state.tv?.data?.futures.find(f => f.quote)?.quote;
    const meta = state.tv?.data ? `${tvMeta(first)} · ${timeOf('tv')}${staleNote('tv')}` : '트레이딩뷰';
    return `
        <section class="card mk-card">
            <h2 class="card-title">해외 선물</h2>
            <p class="mk-meta">${meta}</p>
            <ul class="mk-list">${body}</ul>
            <p class="mk-note">가장 가까운 만기(근월물)를 이어 붙인 값이에요. 트레이딩뷰 사이트가 쓰는 주소라 공식 API가 아니에요.
                이 화면을 보고 있으면 1분마다 새로 받아요.</p>
        </section>`;
}

/** 달러 인덱스: 트레이딩뷰 실제 값이 있으면 그것, 없으면 유럽중앙은행 환율로 계산한 근사값 */
function dxyRow(now, prev) {
    const dxy = state.tv?.data?.dxy;
    if (dxy) return row('달러 인덱스', tvMeta(dxy), fixed(dxy.value), change(dxy.value, dxy.prev));
    return row('달러 인덱스', '근사값 · 6개 통화로 계산', fixed(dollarIndex(now)), change(dollarIndex(now), dollarIndex(prev)));
}

function fxCard() {
    const s = state.fx;
    let body = placeholder('fx');
    let foot = '';
    if (!body) {
        const { now, prev, date } = s.data;
        // 원/엔처럼 원화로 보는 값은 "1달러 = 몇 원 ÷ 1달러 = 몇 엔"으로 바꿔요
        const krwPer = (r, code, unit = 1) => r.KRW / r[code] * unit;
        body = [
            row('원/달러', '1달러', fixed(now.KRW), change(now.KRW, prev.KRW)),
            row('엔/달러', '1달러', fixed(now.JPY), change(now.JPY, prev.JPY)),
            row('원/100엔', '100엔', fixed(krwPer(now, 'JPY', 100)), change(krwPer(now, 'JPY', 100), krwPer(prev, 'JPY', 100))),
            row('원/위안', '1위안', fixed(krwPer(now, 'CNY')), change(krwPer(now, 'CNY'), krwPer(prev, 'CNY'))),
            row('원/유로', '1유로', fixed(krwPer(now, 'EUR')), change(krwPer(now, 'EUR'), krwPer(prev, 'EUR'))),
            dxyRow(now, prev),
        ].join('');

        // 해외 계산기들이 함께 쓰는 기준 환율에 넣기 (시장 바의 "오늘 환율"과 같은 값)
        const rate = Math.round(now.KRW * 100) / 100;
        foot = rate === getFx()
            ? `<p class="mk-foot">해외 계산기의 기준 환율도 ${fixed(rate)}원이에요.</p>`
            : `<p class="mk-foot"><button type="button" class="mini-btn" data-use-fx="${rate}" data-date="${date}">원/달러 ${fixed(rate)}원을 기준 환율로 쓰기</button>
                <span>지금 기준 환율 ${fixed(getFx())}원</span></p>`;
    }
    const meta = s?.data ? `유럽중앙은행 기준가 · ${shortDate(s.data.date)} (전 영업일 ${shortDate(s.data.prevDate)} 대비)` : '유럽중앙은행 기준가';
    return `
        <section class="card mk-card">
            <h2 class="card-title">환율</h2>
            <p class="mk-meta">${meta}${staleNote('fx')}</p>
            <ul class="mk-list">${body}</ul>
            ${foot}
            <p class="mk-note">매 영업일 한 번(한국 시간 밤 11시~0시쯤) 바뀌는 기준가예요. 은행·증권사 실시간 환율과는 조금 달라요.</p>
        </section>`;
}

function ratesCard() {
    // 기준 금리 (뉴욕 연은)
    let fed = placeholder('fed');
    if (!fed) {
        const d = state.fed.data;
        fed = row('목표 범위', '연준이 정한 기준 금리', `${fixed(d.from)}~${fixed(d.to)}%`)
            + row('실효 금리', 'EFFR · 은행 간 하루 대출 평균', `${fixed(d.effr)}%`, bpChange(d.effr, d.prevEffr));
    }
    const fedMeta = state.fed?.data ? `뉴욕 연은 · ${shortDate(state.fed.data.date)} 기준${staleNote('fed')}` : '뉴욕 연은';

    // 국채 금리 (재무부)
    let ust = placeholder('treasury');
    if (!ust) {
        const { now, prev } = state.treasury.data;
        const spread = now['10 Yr'] - now['2 Yr'];
        const prevSpread = prev['10 Yr'] - prev['2 Yr'];
        ust = TENORS.map(([key, label]) => row(label, '', `${fixed(now[key])}%`, bpChange(now[key], prev[key]))).join('')
            + `<li class="mk-gap"></li>`
            + row('장단기 금리차', `10년 − 2년${spread < 0 ? ' · <em class="mk-tag">역전</em>' : ''}`,
                `${spread >= 0 ? '+' : '−'}${fixed(Math.abs(spread))}%p`, bpChange(spread, prevSpread));
    }
    const ustMeta = state.treasury?.data
        ? `미국 재무부 · ${shortDate(state.treasury.data.date)} 기준 (${shortDate(state.treasury.data.prevDate)} 대비)${staleNote('treasury')}`
        : '미국 재무부';

    // 한국 기준 금리: 받아올 곳이 없어서 코드에 적어둔 값 (sources.js의 KR_BASE_RATE)
    const kr = KR_BASE_RATE;
    const krRows = row('기준 금리', `${kr.since.slice(0, 4)}년 ${shortDate(kr.since)}부터 · 전 ${fixed(kr.prev)}%`, `${fixed(kr.rate)}%`, bpChange(kr.rate, kr.prev));
    const krMeta = '한국은행 · 코드에 적어 둔 값 (바뀌면 직접 고쳐요)';

    // 한국 국채 금리: 트레이딩뷰 (실시간)
    let krBonds = placeholder('tv');
    if (!krBonds) {
        krBonds = state.tv.data.krBonds.map(b => b.quote
            ? row(b.label, '', `${fixed(b.quote.value, 3)}%`, bpChange(b.quote.value, b.quote.prev))
            : row(b.label, '', '—')).join('');
    }
    const firstBond = state.tv?.data?.krBonds.find(b => b.quote)?.quote;
    const krBondMeta = state.tv?.data ? `${tvMeta(firstBond)}${staleNote('tv')}` : '트레이딩뷰';

    return `
        <section class="card mk-card">
            <h2 class="card-title">금리</h2>
            <ul class="mk-list">
                ${section('한국 기준 금리', krMeta)}${krRows}
                ${section('한국 국채 금리', krBondMeta)}${krBonds}
                ${section('미국 기준 금리', fedMeta)}${fed}
                ${section('미국 국채 금리', ustMeta)}${ust}
            </ul>
            <p class="mk-note">bp는 0.01%p예요. 장단기 금리차가 마이너스(역전)면 짧게 빌리는 금리가 더 높다는 뜻이에요.</p>
        </section>`;
}

function coinCard() {
    const usdKrw = state.fx?.data?.now.KRW;   // 금 원/g 환산에 써요 (유럽중앙은행 원/달러)
    const needFx = '환율을 불러오면 보여요';

    let gold = placeholder('gold');
    if (!gold) {
        const oz = state.gold.data.price;
        gold = row('금 1온스', '트로이온스 = 31.1g', `$${fixed(oz)}`)
            + row('금 1g', '원/달러 기준가로 환산', usdKrw ? `${fixed(oz / GRAMS_PER_OZ * usdKrw, 0)}원` : needFx);
    }
    const goldMeta = state.gold?.data ? `gold-api.com · ${timeOf('gold')}${staleNote('gold')}` : 'gold-api.com';

    const up = placeholder('upbit') ?? row('업비트', '원화 · 오늘 0시 대비',
        `${fixed(state.upbit.data.price, 0)}원`, change(state.upbit.data.price, state.upbit.data.prev, 0));
    const bn = placeholder('binance') ?? row('바이낸스', 'USDT · 24시간 전 대비',
        `$${fixed(state.binance.data.price)}`, change(state.binance.data.price, state.binance.data.prev));

    const times = ['upbit', 'binance'].filter(id => state[id]?.data).map(timeOf);
    const coinMeta = `업비트 · 바이낸스${times.length ? ` · ${times[0]}` : ''}${staleNote('upbit')}${staleNote('binance')}`;

    return `
        <section class="card mk-card">
            <h2 class="card-title">금·비트코인</h2>
            <ul class="mk-list">
                ${section('금 현물', goldMeta)}${gold}
                ${section('비트코인', coinMeta)}${up}${bn}
            </ul>
            <p class="mk-note">금·비트코인은 불러온 순간의 실시간 값이에요. 금은 전날 값을 주지 않아서 변화가 없어요.</p>
        </section>`;
}

/* ---------- 화면 ---------- */

export default {
    id: 'fx',
    name: '시장 지표',
    shortName: '시장 지표',
    desc: '국내 증시·해외 선물·환율·금리·금·비트코인',
    group: '정보',
    icon: 'market',
    color: 'c9',
    records: false,   // 저장할 계산이 없어서 기록 버튼을 숨겨요 (app.js)

    mount(view) {
        view.innerHTML = `
            <div class="mk-page">
                <div class="mk-head">
                    <p class="mk-updated" data-updated></p>
                    <button type="button" class="ghost-btn mk-refresh" data-refresh data-needs-net>새로고침</button>
                </div>
                <div class="mk-grid">
                    <div class="mk-col">
                        <div class="mk-slot" data-slot="kr"></div>
                        <div class="mk-slot" data-slot="fx"></div>
                        <div class="mk-slot" data-slot="coin"></div>
                    </div>
                    <div class="mk-col">
                        <div class="mk-slot" data-slot="fut"></div>
                        <div class="mk-slot" data-slot="rates"></div>
                    </div>
                </div>
            </div>`;
        const updated = view.querySelector('[data-updated]');
        const refreshBtn = view.querySelector('[data-refresh]');
        // 다시 그리는 카드
        const slots = {
            kr: krCard, fut: futuresCard, fx: fxCard, rates: ratesCard, coin: coinCard,
        };

        const draw = () => {
            if (!view.isConnected) return;   // 기다리는 동안 다른 화면으로 갔으면 그리지 않아요
            Object.entries(slots).forEach(([id, card]) => {
                view.querySelector(`[data-slot="${id}"]`).innerHTML = card();
            });
            const loading = Object.values(state).some(s => s.status === 'loading');
            const online = isOnline();
            refreshBtn.toggleAttribute('data-busy', loading);  // 불러오는 중이면 app.js가 다시 켜지 않게
            refreshBtn.disabled = loading || !online;
            refreshBtn.textContent = loading ? '불러오는 중…' : '새로고침';
            updated.classList.toggle('is-offline', !online);
            updated.textContent = online
                ? (loadedAt ? `${clockTime(loadedAt)}에 불러왔어요` : '')
                : (loadedAt ? `인터넷 연결이 없어서 지난 값이에요 (${clockTime(loadedAt)})` : '인터넷 연결이 없어요');
        };

        /**
         * 출처들을 불러와요. 하나 도착할 때마다 다시 그려서 빠른 것부터 보여요.
         * Promise.allSettled: 여러 요청을 동시에 보내고, 성공이든 실패든 "모두 끝날 때"를 알려줘요.
         * (Promise.all은 하나만 실패해도 바로 실패로 끝나서, 여기처럼 따로따로인 데이터에는 안 맞아요)
         * @param {string[]} ids - 불러올 출처
         * @param {boolean} force - true면 방금 받은 값이 있어도 다시 받아요 (새로고침·다시 시도)
         */
        const load = async (ids, force) => {
            if (!isOnline()) return draw();   // 오프라인이면 요청하지 않고, 연결되면 아래 onNetworkChange가 불러요
            const now = Date.now();
            const todo = ids.filter(id => force || !(state[id]?.status === 'ok' && now - state[id].at < FRESH_MS));
            if (!todo.length) return draw();
            todo.forEach(id => { state[id] = { ...state[id], status: 'loading' }; });
            draw();
            await Promise.allSettled(todo.map(id => SOURCES[id].load().then(
                (data) => { state[id] = { status: 'ok', data, at: Date.now() }; },
                (err) => {
                    state[id] = { ...state[id], status: 'error', error: err.message };
                    console.warn(`[시장 지표] ${SOURCES[id].name}:`, err);
                },
            ).finally(draw)));
            if (todo.some(id => state[id].status === 'ok')) loadedAt = new Date(); // 하나라도 받았을 때만
            draw();
        };

        // 연결 상태가 바뀌면: 끊김 → 안내로 다시 그리기, 연결됨 → 못 받은 출처를 저절로 다시 불러오기
        // (이 화면을 떠난 뒤에 불리면 등록을 풀어요. 화면마다 새로 등록하니까 쌓이지 않게)
        const stopWatching = onNetworkChange((online) => {
            if (!view.isConnected) return stopWatching();
            if (online) {
                load(Object.keys(SOURCES).filter(id => state[id]?.status !== 'ok'), true);
            } else {
                draw();
            }
        });

        // 자동 갱신: 이 화면을 보고 있고(탭이 보임), 온라인일 때만 1분마다
        //   국내 증시는 장중일 때만, 트레이딩뷰(선물·달러 인덱스·국채)는 늘
        // (setInterval은 MFC의 SetTimer와 같아요. 화면을 떠나면 다음 차례에 스스로 멈춰요)
        const autoTimer = setInterval(() => {
            if (!view.isConnected) return clearInterval(autoTimer);
            if (document.hidden || !isOnline()) return;
            const due = [];
            if (state.kr?.status !== 'loading' && state.kr?.data?.items.some(it => it.open)) due.push('kr');
            if (state.tv?.status !== 'loading' && state.tv?.data) due.push('tv');   // 선물은 거의 24시간 거래
            if (due.length) load(due, true);
        }, AUTO_REFRESH_MS);

        view.addEventListener('click', (e) => {
            if (e.target.closest('[data-refresh]')) return load(Object.keys(SOURCES), true);
            const retry = e.target.closest('[data-retry]');
            if (retry) return load([retry.dataset.retry], true);
            const use = e.target.closest('[data-use-fx]');
            if (use) {
                const rate = Number(use.dataset.useFx);
                setFx(rate, use.dataset.date);
                draw();
                showToast(`${shortDate(use.dataset.date)} 환율 ${fixed(rate)}원을 기준 환율로 넣었어요`);
            }
        });

        load(Object.keys(SOURCES), false);
    },
};
