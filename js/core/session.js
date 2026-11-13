/**
 * session.js — 이번 방문 동안만 유지되는 저장소 (모든 기능이 함께 사용)
 *
 * sessionStorage를 써요.
 *  - 다른 기능으로 이동하거나 새로고침해도 → 그대로 남아 있음
 *  - 탭(창)을 닫았다가 배포 주소로 다시 들어오면 → 비어 있음
 * MFC로 치면 "프로그램이 켜져 있는 동안의 메모리"인데, 새로고침에도 살아남는다는 점이 달라요.
 *
 * 저장 모양:
 *   {
 *     market:  'domestic' | 'global',              모든 계산기가 함께 쓰는 국내/해외 선택
 *     inputs:  { profit: {...}, split: {...} },     기능별 입력값 (모양은 각 기능이 정함)
 *              국내/해외를 쓰는 기능은 { domestic: {...}, global: {...} } 처럼 시장별로 나눠 저장
 *     records: [ { id, feature, market, time, title, sub, data, result } ]   모든 기능의 기록
 *   }
 *
 * 기록이 바뀌면 subscribe()로 등록한 함수들을 불러줘요.
 * (MFC의 UpdateAllViews, C#의 event와 같은 역할 → 기록 버튼 숫자, 홈 목록이 함께 갱신)
 */
import { clockTime } from './format.js';

const KEY = 'stockTools.session';
const listeners = new Set();
let state = load();

function empty() {
    return { inputs: {}, records: [] };
}

function load() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(KEY));
        if (saved && typeof saved.inputs === 'object' && Array.isArray(saved.records)) return saved;
    } catch (e) {
        // 저장소를 쓸 수 없거나 값이 깨졌으면 빈 상태로 시작
    }
    return empty();
}

function persist() {
    try {
        sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
        // 저장에 실패해도 화면 동작은 계속되도록 무시
    }
}

function notify() {
    persist();
    listeners.forEach(fn => fn());
}

/** 기록이 바뀔 때마다 fn을 불러줘요 */
export function subscribe(fn) {
    listeners.add(fn);
}

/* ---------- 국내/해외 ---------- */

/** 지금 고른 시장 (처음이면 국내) */
export function getMarket() {
    return state.market === 'global' ? 'global' : 'domestic';
}

export function setMarket(market) {
    state.market = market;
    persist();
}

/* ---------- 해외: 기준 환율과 표시 단위 ---------- */

/** 기준 환율 (원/달러). 모든 계산기가 원화↔달러 바꾸기에 함께 써요. 처음이면 1,300원 */
export function getFx() {
    return state.fx?.rate > 0 ? state.fx.rate : 1300;
}

/** 기준 환율이 어디서 왔는지: { date: '2026-11-12' } (오늘 환율 불러오기) 또는 null (직접 입력) */
export function getFxSource() {
    return state.fx?.date ? { date: state.fx.date } : null;
}

/** @param {number} rate @param {string | null} [date] - 불러온 환율이면 기준 날짜 */
export function setFx(rate, date = null) {
    state.fx = { rate, date };
    persist();
}

/** 해외 결과의 세부 금액을 'usd'(달러) / 'krw'(원화 환산) 중 무엇으로 보여줄지 */
export function getFxView() {
    return state.fxView === 'krw' ? 'krw' : 'usd';
}

export function setFxView(view) {
    state.fxView = view;
    persist();
}

/** 입력칸마다 고른 입력 통화 ('krw'면 원화로 넣기). 키: "기능.칸이름" */
export function getInputCurrency(key) {
    return state.inputCurrency?.[key] === 'krw' ? 'krw' : 'usd';
}

export function setInputCurrency(key, currency) {
    state.inputCurrency = { ...state.inputCurrency, [key]: currency };
    persist();
}

/* ---------- 최근 본 종목 (종목 검색) ---------- */

const RECENT_MAX = 5;

/** 최근 고른 종목 (새것이 앞) [{ code, name, market }] */
export function getRecentStocks() {
    return Array.isArray(state.recentStocks) ? state.recentStocks : [];
}

/** 고른 종목을 맨 앞에 (같은 종목은 한 번만, 최대 5개) */
export function addRecentStock(stock) {
    state.recentStocks = [stock, ...getRecentStocks().filter(s => s.code !== stock.code)].slice(0, RECENT_MAX);
    persist();
}

/**
 * 계산기마다 고른 종목 (계산기 위 종목 검색 줄, core/stock-bar.js)
 * { code, name, market, price, change, rate, time } — 마지막으로 받은 시세까지 같이 기억해요
 */
export function getStockOf(featureId) {
    return state.stockOf?.[featureId] ?? null;
}

export function setStockOf(featureId, stock) {
    state.stockOf = { ...state.stockOf, [featureId]: stock };
    persist();
}

/* ---------- 입력값 ---------- */

/** 기능의 마지막 입력값 (없으면 null) */
export function getInputs(feature) {
    return state.inputs[feature] ?? null;
}

/** 기능의 입력값을 기억해요. 글자를 입력할 때마다 불리므로 알림은 보내지 않아요 */
export function setInputs(feature, value) {
    state.inputs[feature] = value;
    persist();
}

/* ---------- 기록 ---------- */

/** 기능 id 하나 또는 여러 개 → 해당 기록인지 판별하는 함수 (없으면 전부) */
function matcher(features) {
    if (!features) return () => true;
    const ids = Array.isArray(features) ? features : [features];
    return (r) => ids.includes(r.feature);
}

/**
 * 기록 목록. 최신이 앞
 * @param {string | string[]} [features] - 기능 id (여러 개면 배열). 생략하면 전부
 */
export function getRecords(features) {
    return state.records.filter(matcher(features));
}

/**
 * 기록을 추가해요.
 * @param {string} feature - 기능 id
 * @param {{ title: string, sub?: string, data: object, result?: { text: string, sub?: string, tone?: 'up'|'down' } }} record
 *   data: 불러오기 할 때 그대로 입력값으로 돌려놓을 값 (getInputs와 같은 모양)
 */
export function addRecord(feature, record) {
    state.records.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        feature,
        time: clockTime(new Date()),
        ...record,
    });
    notify();
}

export function removeRecord(id) {
    state.records = state.records.filter(r => r.id !== id);
    notify();
}

/**
 * 기록 지우기
 * @param {string | string[]} [features] - 기능 id (여러 개면 배열). 생략하면 전부
 */
export function clearRecords(features) {
    const match = matcher(features);
    state.records = state.records.filter(r => !match(r));
    notify();
}

/** 모든 기능의 입력값과 기록을 지워요 (창을 새로 연 것과 같은 상태) */
export function resetAll() {
    state = empty();
    try {
        sessionStorage.removeItem(KEY);
    } catch (e) { /* 무시 */ }
    listeners.forEach(fn => fn());
}
