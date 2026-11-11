/**
 * home.js — 첫 화면: 기능 고르기 + 이번 방문의 기록 모아 보기
 */
import { icon } from './core/icons.js';
import { createRecordItem } from './shell/record-item.js';

/**
 * @param {HTMLElement} container
 * @param {{ features: Array, records: Array, labelOf: (record) => string, onSelect: (record) => void }} options
 */
export function renderHome(container, { features, records, labelOf, onSelect }) {
    const groups = [...new Set(features.map(f => f.group))];

    const tile = (f, wide) => `
        <a class="tile ${wide ? 'wide' : ''} ${f.soon ? 'disabled' : ''}" href="#/${f.id}"
           ${f.soon ? 'aria-disabled="true" tabindex="-1"' : ''}>
            <span class="tile-icon ${f.color}">${icon(f.icon)}</span>
            <span class="tile-text">
                <b>${f.name}</b>${f.soon ? '<span class="tag">준비 중</span>' : ''}
                <span class="tile-desc">${f.desc}</span>
            </span>
        </a>`;

    container.innerHTML = `
        <div class="home">
            <div class="hello">
                <h2>무엇을 계산할까요?</h2>
                <p>기능을 골라 시작하세요. 왼쪽 메뉴로 언제든 바꿀 수 있어요.</p>
            </div>
            ${groups.map(group => {
                const items = features.filter(f => f.group === group);
                return `<h3 class="section-title">${group}</h3>
                    <div class="tiles">${items.map(f => tile(f, items.length === 1)).join('')}</div>`;
            }).join('')}
            <h3 class="section-title">이번 방문 기록 <span class="section-note">창을 닫으면 사라져요</span></h3>
            <section class="card records-card"><ul class="history-list" id="homeRecords"></ul></section>
        </div>`;

    const list = container.querySelector('#homeRecords');
    if (records.length === 0) {
        list.innerHTML = '<li class="history-empty">아직 기록이 없어요.<br>계산기에서 “기록에 저장”을 눌러보세요.</li>';
        return;
    }
    records.slice(0, 10).forEach(record => {
        list.append(createRecordItem(record, { label: labelOf(record), onSelect })); // 예: "손익 계산기 · 해외"
    });
}
