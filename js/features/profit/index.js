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
import { showReceived } from '../../core/received.js';
import { price, inputText, isGlobal } from '../../core/market.js';

/** 시장별 입력칸 이름 끝 글자: 국내 buyPriceD, 해외 buyPriceG */
const suffix = (market) => (isGlobal(market) ? 'G' : 'D');

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
    shortName: '손익',
    desc: '수수료·세금을 뺀 실제 매매 손익',
    group: '계산기',
    icon: 'profit',
    color: 'c1',
    markets: true,   // 맨 위에 국내/해외 선택 (app.js가 그려줘요)

    /**
     * 다른 기능이 값을 넘겨줄 때 app.js가 불러요. (예: 분할 매수 → "손익 계산")
     * 매수가·수량만 바꿔요. 매도가, 수수료·세금은 그대로 둬요.
     *
     * @param {{ values: object } | null} inputs - 지금 시장의 저장된 입력값 (처음이면 null)
     * @param {{ buyPrice: number, quantity: number }} payload - 넘겨받은 값 (매수가는 소수 둘째 자리까지)
     * @param {'domestic' | 'global'} market - 지금 시장 (국내는 ...D, 해외는 ...G 칸)
     * @returns 새 입력값 (ctx.inputs와 같은 모양)
     */
    receive(inputs, { buyPrice, quantity }, market) {
        const s = suffix(market);
        return {
            ...inputs,
            values: { ...inputs?.values, [`buyPrice${s}`]: inputText(buyPrice), [`quantity${s}`]: won(quantity) },
        };
    },

    /**
     * @param {HTMLElement} view - 이 기능을 그릴 자리
     * @param {{ market: string, inputs: { values: object } | null, saveInputs: Function, addRecord: Function }} ctx
     */
    mount(view, ctx) {
        view.innerHTML = template;
        const resultEl = view.querySelector('[data-result]');

        // 국내/해외는 맨 위 공통 버튼이 정해요. 바꾸면 app.js가 이 화면을 새 시장으로 다시 그려요.
        const tab = ctx.market;
        const panel = view.querySelector(`#panel-${tab}`);
        panel.hidden = false;
        view.querySelector(`#panel-${tab === 'global' ? 'domestic' : 'global'}`).hidden = true;
        let result = null;

        if (ctx.inputs?.values) fillValues(view, ctx.inputs.values); // 지난 입력값 복원

        const remember = () => ctx.saveInputs({ values: readValues(panel) });

        function refresh() {
            result = calculateProfit(tab, readInput(view, tab));
            renderResult(resultEl, result, {
                onSave: saveRecord,
                // 손실이면: 수수료·세금까지 뺀 손실률을 손실 회복 계산기로 (본전까지 몇 % 올라야 하나)
                onSendToRecover: () => ctx.sendTo('recover', { loss: Math.round(Math.abs(result.rate) * 100) / 100 }),
                // 이익이면: 매수가를 목표가 계산기로 (목표 수익률이 되는 매도가는?)
                onSendToTarget: () => ctx.sendTo('target', { buyPrice: readInput(view, tab).buyPrice }),
            });
        }

        function saveRecord() {
            if (!result) return;
            const input = readInput(view, tab);
            const p = (v) => (tab === 'global' ? `$${usd(v)}` : `${won(v)}원`);
            ctx.addRecord({
                title: `${p(input.buyPrice)} → ${p(input.sellPrice)} × ${won(result.quantity)}주`,
                data: { values: readValues(panel) },
                result: {
                    text: `${signedWon(result.net)}원`,
                    sub: `${result.rate.toFixed(2)}%`,
                    tone: Math.round(result.net) > 0 ? 'up' : Math.round(result.net) < 0 ? 'down' : '',
                },
            });
        }

        bindNumberInputs(view, () => {
            updateSettingChips(view);
            remember();
            refresh();
        });

        updateSettingChips(view);
        refresh();

        // 다른 기능에서 매수가·수량을 받아 들어왔으면: 강조 + 알림, 그리고 매도가 칸으로 커서 이동
        if (ctx.received) {
            const { from, payload } = ctx.received;
            const s = suffix(tab);
            showReceived(view, [`buyPrice${s}`, `quantity${s}`],
                `${from?.shortName ?? '다른 계산기'} 평단 ${price(payload.buyPrice, tab)} × ${won(payload.quantity)}주를 넣었어요`);
            // 이전 매도가가 있으면 남겨두되 전체 선택 → 바로 숫자를 치면 새 값으로 바뀌어요
            const sell = view.querySelector(`input[name="sellPrice${s}"]`);
            sell.focus({ preventScroll: true });
            sell.select();
        }
    },
};
