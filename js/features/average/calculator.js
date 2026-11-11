/**
 * average/calculator.js — 물타기(추가 매수) 후 평균 단가 계산 (화면과 무관한 순수 함수)
 */

/**
 * @param {{ avgPrice: number, holdQty: number, buyPrice: number, buyQty: number }} input
 *   avgPrice 지금 평균 단가, holdQty 보유 수량, buyPrice 추가 매수가, buyQty 추가 매수 수량
 * @returns 입력이 덜 됐으면 null
 */
export function calculateAverage({ avgPrice, holdQty, buyPrice, buyQty }) {
    if (!(avgPrice > 0 && holdQty > 0 && buyPrice > 0 && buyQty > 0)) return null;

    const holdCost = avgPrice * holdQty;   // 지금까지 산 금액
    const addCost = buyPrice * buyQty;     // 추가로 사는 금액
    const totalQty = holdQty + buyQty;
    const totalCost = holdCost + addCost;
    const newAvg = totalCost / totalQty;
    const change = newAvg - avgPrice;

    return {
        newAvg,                             // 새 평균 단가
        change,                             // 평단 변화 (원)
        changeRate: change / avgPrice * 100, // 평단 변화 (%)
        totalQty,
        addCost,
        totalCost,
    };
}
