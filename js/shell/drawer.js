/**
 * drawer.js — 왼쪽 기능 메뉴
 *
 * 좁은 화면(휴대폰)에서는 ☰ 버튼으로 열고 닫는 "서랍"이고,
 * 넓은 화면(960px 이상)에서는 항상 펼쳐진 사이드바예요.
 * 이 차이는 CSS(@media)가 처리하고, 이 파일은 열기/닫기와 목록 그리기만 해요.
 */
import { icon } from '../core/icons.js';

const $ = (id) => document.getElementById(id);

export function openDrawer() {
    document.body.classList.add('drawer-open');
}

export function closeDrawer() {
    document.body.classList.remove('drawer-open');
}

/**
 * 메뉴 버튼·배경·Esc 키·초기화 버튼을 연결해요. 처음에 한 번만 호출.
 * @param {{ onReset: () => void }} handlers - "지금 모두 초기화"를 확인했을 때 할 일
 */
export function setupDrawer({ onReset }) {
    $('menuBtn').addEventListener('click', openDrawer);
    $('scrim').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDrawer();
    });
    $('resetBtn').addEventListener('click', () => {
        if (confirm('모든 기능의 입력값과 계산 기록을 지울까요?')) onReset();
    });
}

/**
 * 메뉴 목록을 그려요. 기능 목록(features.js)이 바뀌면 메뉴도 저절로 바뀌어요.
 * @param {Array} features - 기능 목록
 * @param {string} activeId - 지금 화면 ('home' 또는 기능 id)
 */
export function renderNav(features, activeId) {
    const groups = [...new Set(features.map(f => f.group))];
    const link = (href, id, iconName, name, soon) => `
        <a href="${href}" class="${soon ? 'disabled' : ''}" ${id === activeId ? 'aria-current="page"' : ''}
           ${soon ? 'aria-disabled="true" tabindex="-1"' : ''}>
            ${icon(iconName)}<span>${name}</span>${soon ? '<span class="soon">준비 중</span>' : ''}
        </a>`;

    $('nav').innerHTML = link('#/', 'home', 'home', '홈')
        + groups.map(group => `<div class="nav-group">${group}</div>`
            + features.filter(f => f.group === group)
                .map(f => link(`#/${f.id}`, f.id, f.icon, f.name, f.soon)).join('')
        ).join('');
}
