/**
 * history-sheet.js — 계산 기록 시트(아래에서 올라오는 창) 그리기와 열기/닫기
 *
 * 같은 그룹(예: "계산기")의 기록을 함께 보여주고, 위쪽 칩으로 "이 기능만" 볼 수도 있어요.
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
 * @param {{ onClear: () => void }} handlers - "전체 삭제"를 눌렀을 때 할 일 (확인 창은 app.js가 띄움)
 */
export function setupHistorySheet({ onClear }) {
    $('historyBtn').addEventListener('click', openSheet);
    $('closeSheet').addEventListener('click', closeSheet);
    $('backdrop').addEventListener('click', closeSheet);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSheet();
    });
    $('clearHistory').addEventListener('click', onClear);
}

/**
 * 범위 칩, 기록 버튼의 숫자, 시트의 목록을 그려요.
 *
 * @param {object} options
 * @param {Array<{ id: string, label: string, count: number }>} options.scopes - 칩 목록 (2개 미만이면 칩 숨김)
 * @param {string} options.scope - 지금 고른 칩 id
 * @param {Array} options.records - 지금 범위의 기록 목록
 * @param {(record) => string} options.labelOf - 기록 왼쪽 위 작은 글씨 (예: "손익 · 국내")
 * @param {(scopeId: string) => void} options.onScope - 칩을 눌렀을 때
 * @param {(record) => void} options.onSelect - 기록을 눌렀을 때
 * @param {(record) => void} options.onDelete - ✕를 눌렀을 때
 */
export function renderHistory({ scopes, scope, records, labelOf, onScope, onSelect, onDelete }) {
    // 칩
    const filter = $('historyFilter');
    filter.innerHTML = '';
    filter.hidden = scopes.length < 2;
    scopes.forEach(s => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'filter-chip';
        chip.setAttribute('aria-pressed', String(s.id === scope));
        chip.textContent = `${s.label} `;
        const n = document.createElement('span');
        n.className = 'count';
        n.textContent = s.count;
        chip.append(n);
        chip.addEventListener('click', () => onScope(s.id));
        filter.append(chip);
    });

    // 버튼 숫자와 목록
    const list = $('historyList');
    list.innerHTML = '';
    $('historyCount').textContent = records.length ? String(records.length) : '';
    $('clearHistory').hidden = records.length === 0;

    if (records.length === 0) {
        list.innerHTML = '<li class="history-empty">아직 저장한 기록이 없어요.<br>계산 후 “기록에 저장”을 눌러보세요.</li>';
        return;
    }
    records.forEach(record => {
        list.append(createRecordItem(record, { label: labelOf(record), onSelect, onDelete }));
    });
}
