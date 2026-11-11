/**
 * record-item.js — 기록 한 줄 그리기 (기록 시트와 홈 화면이 함께 사용)
 *
 * 기록 글자는 textContent로 넣어요. innerHTML에 글자를 그대로 넣으면
 * 글자 속 "<...>"가 HTML로 해석될 수 있어서, 데이터는 항상 textContent가 안전해요.
 */

/**
 * @param {object} record - session.js의 기록 하나
 * @param {{ label: string, onSelect: (record) => void, onDelete?: (record) => void }} options
 *   label: 왼쪽 위 작은 글씨 (예: "국내", "물타기 계산기")
 * @returns {HTMLLIElement}
 */
export function createRecordItem(record, { label, onSelect, onDelete }) {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.tabIndex = 0; // 키보드(Tab)로도 고를 수 있게

    const info = document.createElement('div');
    info.className = 'info';
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${label} · ${record.time}`;
    const main = document.createElement('div');
    main.className = 'main';
    main.textContent = record.title;
    info.append(meta, main);
    li.append(info);

    if (record.result) {
        const pl = document.createElement('div');
        pl.className = `pl ${record.result.tone ?? ''}`;
        pl.textContent = record.result.text;
        if (record.result.sub) {
            const sub = document.createElement('span');
            sub.className = 'pl-sub';
            sub.textContent = record.result.sub;
            pl.append(sub);
        }
        li.append(pl);
    }

    if (onDelete) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'del';
        del.setAttribute('aria-label', '이 기록 삭제');
        del.textContent = '✕';
        del.addEventListener('click', (e) => {
            e.stopPropagation(); // 항목 클릭(불러오기)으로 번지지 않게
            onDelete(record);
        });
        li.append(del);
    }

    li.addEventListener('click', () => onSelect(record));
    li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') onSelect(record);
    });
    return li;
}
