/**
 * number-input.js — 숫자 입력칸 공통 처리 (모든 계산기가 함께 사용)
 *
 * 입력칸은 id 대신 name으로 찾아요. 예) <input name="buyPrice">
 * 한 번에 한 기능 화면만 그려지므로, 화면(container) 안에서 name으로 찾으면 충분해요.
 * WinForms의 Controls["buyPrice"]처럼 "이 화면 안의 이름"으로 찾는다고 보면 돼요.
 *
 * - data-int 속성이 있는 칸은 정수만 (수량 등)
 * - 값은 화면에 보이는 그대로(쉼표 포함 문자열)로 저장·복원해요. 그래야 "0.10"이 "0.1"로 바뀌지 않아요.
 */
import { parseNumber, formatNumberInput } from './format.js';

/** 입력칸 하나에 세 자리 쉼표를 적용하고 커서 위치를 지켜줘요 */
export function formatInput(input) {
    const caret = input.selectionStart ?? input.value.length;
    const result = formatNumberInput(input.value, caret, {
        allowDecimal: !input.hasAttribute('data-int'),
    });
    input.value = result.value;
    if (document.activeElement === input) {
        input.setSelectionRange(result.caret, result.caret);
    }
}

/**
 * 화면 안의 입력칸에 글자를 입력할 때마다 쉼표를 넣고 onChange를 불러요.
 *
 * 입력칸마다 따로 연결하지 않고, 바깥 container에 한 번만 연결해요 ("이벤트 위임").
 * 자식 컨트롤의 알림(EN_CHANGE)을 부모 다이얼로그가 한 곳에서 받는 MFC 방식과 같아요.
 *
 * @param {HTMLElement} container
 * @param {(input: HTMLInputElement) => void} onChange
 */
export function bindNumberInputs(container, onChange) {
    container.addEventListener('input', (e) => {
        if (!e.target.matches('input[name]')) return;
        formatInput(e.target);
        onChange(e.target);
    });
}

/** 화면 안의 모든 입력칸 값을 { name: '글자' } 모양으로 */
export function readValues(container) {
    const values = {};
    container.querySelectorAll('input[name]').forEach(input => {
        values[input.name] = input.value;
    });
    return values;
}

/**
 * { name: '글자' } 값을 입력칸에 채워요. 값에 없는 칸은 그대로 둬요
 * 숨은 입력칸(type="hidden", 예: 버튼으로 고른 "month")은 숫자가 아니라서 쉼표 처리를 하지 않아요.
 */
export function fillValues(container, values = {}) {
    container.querySelectorAll('input[name]').forEach(input => {
        if (values[input.name] === undefined) return;
        input.value = String(values[input.name]);
        if (input.type !== 'hidden') formatInput(input);
    });
}

/** 입력칸 값을 숫자로 (빈 칸이면 NaN) */
export function readNumber(container, name) {
    return parseNumber(container.querySelector(`input[name="${name}"]`).value);
}

/** 정수 칸 값을 숫자로 (빈 칸이면 NaN) */
export function readInt(container, name) {
    return parseInt(container.querySelector(`input[name="${name}"]`).value.replace(/,/g, ''), 10);
}
