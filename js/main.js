/**
 * main.js — 앱의 시작점
 *
 * 하는 일:
 *  1. 앱의 "상태(state)"를 한 곳에서 관리 (지금 탭, 마지막 계산 결과, 기록 목록)
 *  2. 각 모듈을 연결 (입력 → 계산 → 결과 그리기, 기록 저장/불러오기)
 *
 * 파일 관계:
 *   main.js ─┬─ form.js ........ 입력칸 읽기/채우기
 *            ├─ calculator.js .. 계산 공식 (화면과 무관)
 *            ├─ result-view.js . 결과 카드 그리기
 *            ├─ history-view.js  기록 시트 그리기
 *            ├─ storage.js ..... 브라우저에 저장
 *            └─ toast.js ....... 알림
 */
import { calculateProfit } from './calculator.js';
import { readInput, readAllFields, fillFields, setupForm } from './form.js';
import { renderResult } from './result-view.js';
import { renderHistory, setupHistorySheet, closeSheet } from './history-view.js';
import { loadHistory, saveHistory } from './storage.js';
import { showToast } from './toast.js';
import { won, usd, shortDateTime } from './format.js';

/* ---------- 상태 ---------- */
const state = {
    tab: 'domestic',   // 'domestic' | 'global'
    result: null,      // 마지막 계산 결과
    history: [],       // 계산 기록 목록
};

/* ---------- 계산하고 결과 그리기 ---------- */
function refreshResult() {
    state.result = calculateProfit(state.tab, readInput(state.tab));
    renderResult(document.getElementById('result'), state.result, { onSave: saveCurrent });
}

/* ---------- 탭 전환 ---------- */
function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.segmented button').forEach(btn => {
        btn.setAttribute('aria-selected', String(btn.dataset.tab === tab));
    });
    document.getElementById('panel-domestic').hidden = tab !== 'domestic';
    document.getElementById('panel-global').hidden = tab !== 'global';
    refreshResult();
}

/* ---------- 계산 기록 ---------- */
function refreshHistory() {
    renderHistory(state.history, {
        onSelect: (item) => {
            fillFields(item.data);
            switchTab(item.type);
            closeSheet();
        },
        onDelete: (index) => {
            state.history.splice(index, 1);
            saveHistory(state.history);
            refreshHistory();
        },
    });
}

function saveCurrent() {
    const r = state.result;
    if (!r) return;

    const input = readInput(r.type);
    const price = (p) => (r.type === 'global' ? `$${usd(p)}` : `${won(p)}원`);
    const buyText = price(input.buyPrice);
    const sellText = price(input.sellPrice);

    state.history.unshift({
        type: r.type,
        data: readAllFields(),
        summary: `매수: ${buyText} | 수량: ${won(r.quantity)}`, // 예전 버전과 호환용
        title: `${buyText} → ${sellText} × ${won(r.quantity)}주`,
        net: r.net,
        rate: r.rate,
        timestamp: shortDateTime(new Date()),
    });
    saveHistory(state.history);
    refreshHistory();
    showToast('기록에 저장했어요');
}

/* ---------- 시작 ---------- */
document.querySelectorAll('.segmented button').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
setupForm(refreshResult);
setupHistorySheet({
    onClear: () => {
        state.history = [];
        saveHistory(state.history);
        refreshHistory();
    },
});

state.history = loadHistory();
refreshHistory();
refreshResult();
