/**
 * received.js — 다른 기능에서 값을 넘겨받았을 때의 공통 표시
 *
 * 값이 들어간 칸을 잠깐 강조하고, 어디서 무엇이 왔는지 알림을 띄워요.
 * 목표가·손익 계산기가 함께 써요. (받는 기능마다 같은 코드를 반복하지 않도록)
 */
import { showToast } from './toast.js';

/**
 * @param {HTMLElement} view - 기능 화면
 * @param {string[]} names - 강조할 입력칸 name 목록 (예: ['buyPriceD', 'quantityD'])
 *                          같은 name이 여러 줄에 있으면 (물타기 추가 매수 줄처럼) 모두 강조해요
 * @param {string} message - 알림 문구
 */
export function showReceived(view, names, message) {
    names.forEach(name => {
        view.querySelectorAll(`input[name="${name}"]`).forEach(input => {
            input.classList.add('flash');
            input.addEventListener('animationend', () => input.classList.remove('flash'), { once: true });
        });
    });
    showToast(message);
}
