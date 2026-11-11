/**
 * history-sheet.js — 계산 기록 시트(아래에서 올라오는 창) 그리기와 열기/닫기
 *
 * 지금 보고 있는 기능의 기록만 보여줘요. (모든 기능의 기록은 홈 화면에)
 * 기록 데이터를 직접 바꾸지 않고, 무엇을 눌렀는지만 app.js에 알려줘요.
 */
import { createRecordItem } from './record-item.js';

const $ = (id) => document.getElementById(id);

export function openSheet() {
    document.body.classList.add('sheet-open');
    $('closeSheet').focus();
}

export function closeSheet() {
    document.body.classList.remove('sheet-open');
}

/**
 * 시트의 버튼·배경·Esc 키를 연결해요. 처음에 한 번만 호출.
 * @param {{ onClear: () => void }} handlers - "전체 삭제"를 확인했을 때 할 일
 */
export function setupHistorySheet({ onClear }) {
    $('historyBtn').addEventListener('click', openSheet);
    $('closeSheet').addEventListener('click', closeSheet);
    $('backdrop').addEventListener('click', closeSheet);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSheet();
    });
    $('clearHistory').addEventListener('click', () => {
        if (confirm('이 기능의 계산 기록을 모두 지울까요?')) onClear();
    });
}

/**
 * 기록 버튼의 숫자와 시트의 목록을 그려요.
 * @param {Array} records - 지금 기능의 기록 목록
 * @param {{ onSelect: (record) => void, onDelete: (record) => void }} handlers
 */
export function renderHistory(records, { onSelect, onDelete }) {
    const list = $('historyList');
    list.innerHTML = '';
    $('historyCount').textContent = records.length ? String(records.length) : '';
    $('clearHistory').hidden = records.length === 0;

    if (records.length === 0) {
        list.innerHTML = '<li class="history-empty">아직 저장한 기록이 없어요.<br>계산 후 “기록에 저장”을 눌러보세요.</li>';
        return;
    }
    records.forEach(record => {
        list.append(createRecordItem(record, { label: record.sub ?? '', onSelect, onDelete }));
    });
}
