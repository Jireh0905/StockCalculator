/**
 * form.js — 입력칸 읽기·채우기·자동 쉼표 처리
 *
 * 화면의 입력칸(input)과 직접 맞닿는 부분은 이 파일에 모아요.
 * 다른 파일은 "입력값이 담긴 객체"만 주고받고, 입력칸 id를 몰라도 되게 하는 게 목표예요.
 */
import { parseNumber, formatNumberInput } from './format.js';

const $ = (id) => document.getElementById(id);

/** 계산 기록에 함께 저장하는 입력칸 목록 */
export const FIELD_IDS = [
    'buyPriceD', 'sellPriceD', 'quantityD', 'commRateD', 'taxRateD',
    'buyPriceG', 'sellPriceG', 'quantityG', 'commRateG', 'taxRateG', 'taxBaseG',
    'exchangeRateG', 'exchangeRateBuyG',
];

const readField = (id) => parseNumber($(id).value);
const readInt = (id) => parseInt(($(id).value || '').replace(/,/g, ''));

/**
 * 국내/해외 탭의 입력값을 계산기(calculator.js)가 받는 모양으로 읽어와요.
 * @param {'domestic' | 'global'} type
 */
export function readInput(type) {
    if (type === 'domestic') {
        return {
            buyPrice: readField('buyPriceD'),
            sellPrice: readField('sellPriceD'),
            quantity: readInt('quantityD'),
            commRate: readField('commRateD'),
            taxRate: readField('taxRateD'),
        };
    }
    return {
        buyPrice: readField('buyPriceG'),
        sellPrice: readField('sellPriceG'),
        quantity: readInt('quantityG'),
        commRate: readField('commRateG'),
        taxRate: readField('taxRateG'),
        taxBase: readField('taxBaseG'),
        exchangeRateBuy: readField('exchangeRateBuyG'),
        exchangeRateSell: readField('exchangeRateG'),
    };
}

/** 기록 저장용: 모든 입력칸 값을 { id: 숫자 } 모양으로 */
export function readAllFields() {
    const data = {};
    FIELD_IDS.forEach(id => { data[id] = readField(id); });
    return data;
}

/** 기록 불러오기용: { id: 숫자 } 값을 입력칸에 채워요. 빈 값은 빈 칸으로 */
export function fillFields(data = {}) {
    FIELD_IDS.forEach(id => {
        const v = data[id];
        const empty = v === undefined || v === null || Number.isNaN(v);
        const input = $(id);
        input.value = empty ? '' : String(v);
        applyNumberFormat(input);
    });
    updateSettingChips();
}

/** 입력칸 하나에 세 자리 쉼표를 적용하고 커서 위치를 지켜줘요 */
function applyNumberFormat(input) {
    const caret = input.selectionStart ?? input.value.length;
    const result = formatNumberInput(input.value, caret, {
        allowDecimal: !input.hasAttribute('data-int'), // data-int가 붙은 칸은 정수만
    });
    input.value = result.value;
    if (document.activeElement === input) {
        input.setSelectionRange(result.caret, result.caret);
    }
}

/** 접혀 있는 수수료·세금 설정 옆에 현재 값을 요약해서 보여줘요 */
export function updateSettingChips() {
    $('chipD').textContent = `수수료 ${$('commRateD').value || 0}% · 거래세 ${$('taxRateD').value || 0}%`;
    $('chipG').textContent = `수수료 ${$('commRateG').value || 0}% · 양도세 ${$('taxRateG').value || 0}%`;
}

/**
 * 입력칸에 글자를 입력할 때마다 할 일을 연결해요.
 * @param {() => void} onChange - 값이 바뀐 뒤 호출할 함수 (예: 다시 계산)
 */
export function setupForm(onChange) {
    document.querySelectorAll('.panel input').forEach(input => {
        input.addEventListener('input', () => {
            applyNumberFormat(input);
            updateSettingChips();
            onChange();
        });
    });
    updateSettingChips();
}
