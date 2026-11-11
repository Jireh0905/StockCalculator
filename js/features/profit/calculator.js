/**
 * calculator.js — 주식 손익 계산 공식
 *
 * 화면(DOM)과 완전히 분리된 순수 계산 함수예요.
 * 입력값(숫자)만 받아서 결과(숫자)만 돌려주기 때문에
 * - 화면을 바꿔도(예: 나중에 React로 바꿔도) 이 파일은 그대로 쓸 수 있고
 * - 3단계에서 자동 테스트를 붙이기 쉬워요.
 */

/**
 * @typedef {Object} ProfitInput
 * @property {number} buyPrice     - 매수가 (국내: 원, 해외: 달러)
 * @property {number} sellPrice    - 매도가 (국내: 원, 해외: 달러)
 * @property {number} quantity     - 수량 (주)
 * @property {number} commRate     - 증권사 수수료율 (%, 예: 0.015)
 * @property {number} taxRate      - 국내: 거래세율 / 해외: 양도소득세율 (%, 예: 0.20, 22)
 * @property {number} [taxBase]         - 해외: 양도소득세 기본 공제 (원)
 * @property {number} [exchangeRateBuy] - 해외: 매수 시 환율 (비어 있으면 매도 시 환율 사용)
 * @property {number} [exchangeRateSell]- 해외: 매도 시 환율
 */

/**
 * 손익을 계산해요. 입력이 덜 되었으면 null을 돌려줘요.
 *
 * @param {'domestic' | 'global'} type - 국내 / 해외
 * @param {ProfitInput} input
 */
export function calculateProfit(type, input) {
    const quantity = input.quantity;
    const commRate = (input.commRate || 0) / 100; // % → 비율
    const taxRate = (input.taxRate || 0) / 100;
    let buyPrice = input.buyPrice;
    let sellPrice = input.sellPrice;
    let taxBase = 0;
    let rateBuy;
    let rateSell;

    if (type === 'global') {
        rateSell = input.exchangeRateSell;
        rateBuy = input.exchangeRateBuy || rateSell;
        if (!rateSell) return null;
        taxBase = input.taxBase || 0;
        buyPrice *= rateBuy;    // 취득가액: 매수일 환율로 원화 환산
        sellPrice *= rateSell;  // 양도가액: 매도일 환율로 원화 환산
    }

    if (isNaN(buyPrice) || isNaN(sellPrice) || isNaN(quantity) || quantity <= 0 || buyPrice <= 0) {
        return null; // 아직 입력이 덜 됨
    }

    const totalBuy = buyPrice * quantity;
    const buyComm = totalBuy * commRate;
    const totalSell = sellPrice * quantity;
    const sellComm = totalSell * commRate;
    const beforeTax = totalSell - totalBuy - buyComm - sellComm;

    let tax = 0;
    if (type === 'domestic') {
        // 국내: 거래세는 매도 금액에 부과
        tax = totalSell * taxRate;
    } else if (beforeTax > 0) {
        // 해외: (양도차익 - 수수료) - 기본 공제 → 과세표준 × 세율
        tax = Math.max(0, beforeTax - taxBase) * taxRate;
    }
    const net = beforeTax - tax;

    return {
        type,
        quantity,
        commRate,
        taxRate,
        taxName: type === 'domestic' ? '거래세' : '양도소득세',
        taxBase,
        rateBuy,
        rateSell,
        totalBuy,                           // 매수 금액
        buyComm,                            // 매수 수수료
        totalSell,                          // 매도 금액
        sellComm,                           // 매도 수수료
        beforeTax,                          // 세전 손익
        tax,                                // 세금
        net,                                // 순손익
        rate: net / totalBuy * 100,         // 수익률 (%)
        payIn: totalBuy + buyComm,          // 매수에 쓴 돈 (매수 금액 + 수수료)
        payOut: totalSell - sellComm - tax, // 매도로 받을 돈 (매도 금액 − 수수료 − 세금)
    };
}
