/**
 * storage.js — 계산 기록을 브라우저(localStorage)에 저장하고 불러오기
 *
 * 저장 위치를 이 파일 한 곳에만 모아두면, 나중에(6단계) 저장 위치를
 * 서버 DB로 바꿀 때 이 파일만 고치면 돼요.
 *
 * ⚠️ 저장 키와 데이터 모양을 바꾸면 사용자 기기에 쌓인 기존 기록을 못 읽게 되니 주의!
 */

const HISTORY_KEY = 'stockCalculator.history';

/** 저장된 기록 목록을 불러와요. 없거나 읽을 수 없으면 빈 배열 */
export function loadHistory() {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch (e) {
        // 시크릿 모드 등 저장소를 쓸 수 없거나, 저장된 값이 깨진 경우
        return [];
    }
}

/** 기록 목록 전체를 저장해요 */
export function saveHistory(list) {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch (e) {
        // 저장에 실패해도 계산 기능은 그대로 동작하도록 무시
    }
}
