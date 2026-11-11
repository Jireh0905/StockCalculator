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
