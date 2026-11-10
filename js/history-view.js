/**
 * history-view.js — 계산 기록 시트(아래에서 올라오는 창) 그리기와 열기/닫기
 *
 * 기록 데이터를 직접 바꾸지 않아요. 사용자가 무엇을 눌렀는지만
 * main.js에 알려주고(onSelect, onDelete, onClear), 실제 처리는 main.js가 해요.
 * → "데이터를 가진 쪽"과 "보여주는 쪽"을 나누는 연습 (React의 props 개념과 같아요)
 */
import { signedWon } from './format.js';

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
        if (confirm('계산 기록을 모두 지울까요?')) onClear();
    });
}

/**
 * 기록 목록을 그려요.
 * @param {Array} items - 기록 목록
 * @param {{ onSelect: (item) => void, onDelete: (index: number) => void }} handlers
 */
export function renderHistory(items, { onSelect, onDelete }) {
    const list = $('historyList');
    list.innerHTML = '';
    $('historyCount').textContent = items.length ? String(items.length) : '';
    $('clearHistory').hidden = items.length === 0;

    if (items.length === 0) {
        list.innerHTML = '<li class="history-empty">아직 저장한 기록이 없어요.<br>계산 후 “기록에 저장”을 눌러보세요.</li>';
        return;
    }

    items.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'history-item';

        const info = document.createElement('div');
        info.className = 'info';
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = `${item.type === 'domestic' ? '국내' : '해외'} · ${item.timestamp}`;
        const main = document.createElement('div');
        main.className = 'main';
        main.textContent = item.title || item.summary; // 예전 기록은 summary만 있음
        info.append(meta, main);
        li.append(info);

        if (typeof item.net === 'number') {
            const pl = document.createElement('div');
            const dir = Math.round(item.net) > 0 ? 'up' : Math.round(item.net) < 0 ? 'down' : '';
            pl.className = `pl ${dir}`;
            pl.innerHTML = `${signedWon(item.net)}원<br><span style="font-size:.75rem">${item.rate.toFixed(2)}%</span>`;
            li.append(pl);
        }

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'del';
        del.setAttribute('aria-label', '이 기록 삭제');
        del.textContent = '✕';
        del.addEventListener('click', (e) => {
            e.stopPropagation(); // 항목 클릭(불러오기)으로 번지지 않게
            onDelete(index);
        });
        li.append(del);

        li.addEventListener('click', () => onSelect(item));
        list.append(li);
    });
}
