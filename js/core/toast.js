/**
 * toast.js — 화면 아래에 잠깐 나타났다 사라지는 알림
 */
let timer;

/** @param {string} message - 보여줄 문구 */
export function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => toast.classList.remove('show'), 1600);
}
