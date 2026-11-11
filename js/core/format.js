/**
 * format.js — 숫자를 화면에 보여주기 좋게 바꾸는 함수 모음
 *
 * 이 파일의 함수들은 화면(DOM)을 전혀 건드리지 않는 "순수 함수"예요.
 * 같은 값을 넣으면 항상 같은 결과가 나오기 때문에, 나중에 자동 테스트하기 쉬워요.
 */

/** 원화 표시: 1234567.8 → "1,234,568" */
export function won(n) {
    return Math.round(n).toLocaleString('ko-KR');
}

/** 소수 둘째 자리까지 원화: 47333.333 → "47,333.33", 52000 → "52,000" (평단처럼 원 아래까지 필요할 때) */
export function wonPrecise(n) {
    return n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

/** 부호 붙인 원화: 97485 → "+97,485", -1200 → "−1,200" */
export function signedWon(n) {
    const rounded = Math.round(n);
    const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
    return sign + won(Math.abs(n));
}

/** 달러 표시: 100.5 → "100.5" (소수 둘째 자리까지) */
export function usd(n) {
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** 비율(0.00015)을 퍼센트 문자열("0.015%")로. 끝자리 0은 생략 */
export function percent(ratio) {
    return (ratio * 100).toFixed(3).replace(/\.?0+$/, '') + '%';
}

/** 기록용 시각: "14:32" (기록은 창을 닫으면 사라지니 날짜는 생략) */
export function clockTime(date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${p(date.getHours())}:${p(date.getMinutes())}`;
}

/** "1,234.5" 같은 입력 문자열을 숫자로. 빈 칸이면 NaN */
export function parseNumber(text) {
    return parseFloat((text || '').replace(/,/g, ''));
}

/**
 * 입력 중인 숫자 문자열에 세 자리마다 쉼표를 넣고, 커서 위치도 함께 계산해요.
 * (커서 위치를 같이 돌려주지 않으면, 숫자 중간을 고칠 때 커서가 맨 뒤로 튀어요)
 *
 * @param {string} value - 지금 입력칸의 글자
 * @param {number} caret - 지금 커서 위치
 * @param {{ allowDecimal?: boolean }} options - 소수점 허용 여부 (수량 같은 정수 칸은 false)
 * @returns {{ value: string, caret: number }} 정리된 글자와 새 커서 위치
 *
 * 예) formatNumberInput('12345', 5) → { value: '12,345', caret: 6 }
 */
export function formatNumberInput(value, caret, { allowDecimal = true } = {}) {
    const keep = allowDecimal ? /[\d.]/ : /\d/;

    // 커서 앞에 있던 "의미 있는 글자(숫자, 소수점)" 개수
    const before = [...value.slice(0, caret)].filter(ch => keep.test(ch)).length;

    // 숫자·소수점만 남기고, 소수점은 첫 번째 것만 유지
    let clean = [...value].filter(ch => keep.test(ch)).join('');
    const dot = clean.indexOf('.');
    if (dot !== -1) {
        clean = clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, '');
    }

    const [intPart, decPart] = clean.split('.');
    const formatted = (intPart || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                    + (decPart !== undefined ? '.' + decPart : '');

    // 같은 개수의 의미 있는 글자 바로 뒤가 새 커서 위치
    let pos = 0;
    let count = 0;
    while (pos < formatted.length && count < before) {
        if (keep.test(formatted[pos])) count++;
        pos++;
    }

    return { value: formatted, caret: pos };
}
