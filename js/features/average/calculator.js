/**
 * average/calculator.js — 물타기(추가 매수) 후 평균 단가 계산 (화면과 무관한 순수 함수)
 */

/**
 * @param {{ avgPrice: number, holdQty: number, buys: Array<{ price: number, qty: number }> }} input
 *   avgPrice 지금 평균 단가, holdQty 보유 수량, buys 추가 매수 목록 (여러 건)
 * @returns 입력이 덜 됐으면 null
 *
 * 추가 매수는 매수가와 수량이 둘 다 입력된 건만 계산에 넣어요.
 */
export function calculateAverage({ avgPrice, holdQty, buys }) {
    if (!(avgPrice > 0 && holdQty > 0)) return null;

    // no: 화면의 줄 번호(1차, 2차…). 중간 줄이 비어 있어도 번호가 화면과 맞도록 거르기 전에 붙여요.
    const valid = buys
        .map((b, i) => ({ ...b, no: i + 1 }))
        .filter(b => b.price > 0 && b.qty > 0);
    if (valid.length === 0) return null;

    const holdCost = avgPrice * holdQty;                               // 지금까지 산 금액
    const addQty = valid.reduce((sum, b) => sum + b.qty, 0);           // 추가로 사는 수량
    const addCost = valid.reduce((sum, b) => sum + b.price * b.qty, 0); // 추가로 사는 금액
    const totalQty = holdQty + addQty;
    const totalCost = holdCost + addCost;
    const newAvg = totalCost / totalQty;
    const change = newAvg - avgPrice;

    // 차수별 내역: 매수 금액, 전체에서 차지하는 비중, 그 차수까지 샀을 때의 평단
    let accQty = holdQty;
    let accCost = holdCost;
    const steps = valid.map(b => {
        const cost = b.price * b.qty;
        accQty += b.qty;
        accCost += cost;
        return {
            no: b.no,
            price: b.price,
            qty: b.qty,
            cost,
            share: cost / totalCost * 100,
            avgAfter: accCost / accQty,
        };
    });

    return {
        newAvg,                              // 새 평균 단가
        change,                              // 평단 변화 (원)
        changeRate: change / avgPrice * 100, // 평단 변화 (%)
        usedCount: valid.length,             // 계산에 넣은 추가 매수 건수
        skippedCount: buys.length - valid.length, // 입력이 덜 돼서 뺀 건수
        avgPrice,                            // 입력한 기존 평단 (내역 표시용)
        holdQty,                             // 입력한 보유 수량 (내역 표시용)
        holdCost,                            // 기존 매수 총액
        holdShare: holdCost / totalCost * 100, // 기존 매수가 전체에서 차지하는 비중 (%)
        steps,                               // 추가 매수 차수별 내역
        addQty,
        addCost,
        totalQty,
        totalCost,
    };
}
