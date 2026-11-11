/**
 * profit/index.js — 손익 계산기 (국내·해외 주식 매매 손익)
 *
 * 1단계의 main.js·form.js가 하던 일을 이 기능 안으로 옮겼어요.
 *   template.js ...... 화면 HTML
 *   calculator.js .... 계산 공식 (화면과 무관)
 *   result-view.js ... 결과 카드 그리기
 *   index.js ......... 위 셋을 연결 + 입력값 기억·기록 저장 (이 파일)
 */
import { template } from './template.js';
import { calculateProfit } from './calculator.js';
import { renderResult } from './result-view.js';
import { bindNumberInputs, readValues, fillValues, readNumber, readInt } from '../../core/number-input.js';
import { won, usd, signedWon } from '../../core/format.js';

/** 국내/해외 탭의 입력값을 계산기(calculator.js)가 받는 모양으로 읽어와요 */
function readInput(view, type) {
    const n = (name) => readNumber(view, name);
    if (type === 'domestic') {
        return {
            buyPrice: n('buyPriceD'),
            sellPrice: n('sellPriceD'),
            quantity: readInt(view, 'quantityD'),
            commRate: n('commRateD'),
            taxRate: n('taxRateD'),
        };
    }
    return {
        buyPrice: n('buyPriceG'),
        sellPrice: n('sellPriceG'),
        quantity: readInt(view, 'quantityG'),
        commRate: n('commRateG'),
        taxRate: n('taxRateG'),
        taxBase: n('taxBaseG'),
        exchangeRateBuy: n('exchangeRateBuyG'),
        exchangeRateSell: n('exchangeRateG'),
    };
}

/** 접혀 있는 수수료·세금 설정 옆에 현재 값을 요약해서 보여줘요 */
function updateSettingChips(view) {
    const v = (name) => view.querySelector(`input[name="${name}"]`).value || 0;
    view.querySelector('[data-chip="domestic"]').textContent = `수수료 ${v('commRateD')}% · 거래세 ${v('taxRateD')}%`;
    view.querySelector('[data-chip="global"]').textContent = `수수료 ${v('commRateG')}% · 양도세 ${v('taxRateG')}%`;
}

export default {
    id: 'profit',
    name: '손익 계산기',
    desc: '수수료·세금을 뺀 실제 매매 손익',
    group: '계산기',
    icon: 'profit',
    color: 'c1',

    /**
     * @param {HTMLElement} view - 이 기능을 그릴 자리
     * @param {{ inputs: {tab: string, values: object} | null, saveInputs: Function, addRecord: Function }} ctx
     */
    mount(view, ctx) {
        view.innerHTML = template;
        const resultEl = view.querySelector('[data-result]');
        const tabButtons = view.querySelectorAll('.segmented button');

        // 이 기능의 상태 (MFC의 Document 멤버 변수 같은 것)
        let tab = ctx.inputs?.tab ?? 'domestic';
        let result = null;

        if (ctx.inputs?.values) fillValues(view, ctx.inputs.values); // 지난 입력값 복원

        const remember = () => ctx.saveInputs({ tab, values: readValues(view) });

        function refresh() {
            result = calculateProfit(tab, readInput(view, tab));
            renderResult(resultEl, result, { onSave: saveRecord });
        }

        function showTab(next) {
            tab = next;
            tabButtons.forEach(btn => btn.setAttribute('aria-selected', String(btn.dataset.tab === tab)));
            view.querySelector('#panel-domestic').hidden = tab !== 'domestic';
            view.querySelector('#panel-global').hidden = tab !== 'global';
            refresh();
        }

        function saveRecord() {
            if (!result) return;
            const input = readInput(view, tab);
            const price = (p) => (tab === 'global' ? `$${usd(p)}` : `${won(p)}원`);
            ctx.addRecord({
                title: `${price(input.buyPrice)} → ${price(input.sellPrice)} × ${won(result.quantity)}주`,
                sub: tab === 'domestic' ? '국내' : '해외',
                data: { tab, values: readValues(view) },
                result: {
                    text: `${signedWon(result.net)}원`,
                    sub: `${result.rate.toFixed(2)}%`,
                    tone: Math.round(result.net) > 0 ? 'up' : Math.round(result.net) < 0 ? 'down' : '',
                },
            });
        }

        tabButtons.forEach(btn => btn.addEventListener('click', () => {
            showTab(btn.dataset.tab);
            remember();
        }));
        bindNumberInputs(view, () => {
            updateSettingChips(view);
            remember();
            refresh();
        });

        updateSettingChips(view);
        showTab(tab);
    },
};
