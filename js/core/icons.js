/**
 * icons.js — 메뉴와 홈 카드에 쓰는 선 아이콘 (SVG)
 *
 * 이미지 파일 대신 SVG 코드를 쓰면 글자색(currentColor)을 따라가서
 * 다크 모드나 선택 상태에 맞게 색이 저절로 바뀌어요.
 */
const PATHS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    profit: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    average: '<path d="M4 20h16"/><path d="M6 16V9M10 16V5M14 16v-6M18 16V8"/>',
    // 하락 대응: 내려가던 주가가 갈림길에서 나뉘는 모양 (물타기 / 손절 후 재매수)
    plan: '<path d="M3 5l6 6"/><path d="M9 11l5 7h7"/><path d="M9 11l5-4h7"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".5"/>',
    // 손실 회복: 떨어졌다가 다시 올라오는 화살표
    recover: '<path d="M3 6l6 8 4-3 7 6"/><path d="M15 17h5v-5"/>',
    // 적립식: 자라나는 새싹
    saving: '<path d="M12 21v-9"/><path d="M12 12c0-4 3-6.5 7.5-6.5 0 4.2-3 6.5-7.5 6.5z"/><path d="M12 14.5c0-3.2-2.4-5.5-6.5-5.5 0 3.3 2.4 5.5 6.5 5.5z"/><path d="M7 21h10"/>',
    dividend: '<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5c0-1 1-1.6 2.5-1.6s2.5.7 2.5 1.7-1 1.4-2.5 1.7-2.5.8-2.5 1.8 1 1.7 2.5 1.7 2.5-.6 2.5-1.6"/>',
    // 시장 지표: 맥박처럼 오르내리는 선
    market: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    // 종목 정보: 돋보기 안의 오르는 선
    stock: '<circle cx="10.5" cy="10.5" r="7"/><path d="M21 21l-5.5-5.5"/><path d="M7 12.5l2.2-2.2 1.8 1.6 3-3.4"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
};

/** @param {keyof PATHS} name @param {number} size */
export function icon(name, size = 20) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ''}</svg>`;
}
