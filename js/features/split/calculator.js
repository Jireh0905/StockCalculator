/**
 * split/calculator.js — 분할 매매 계산 (화면과 무관한 순수 함수)
 *
 *   calculateAverage()   분할 매수: 나눠서 더 사면 평균 단가가 얼마가 될까
 *   calculateSplitSell() 분할 매도: 나눠서 팔면 손익이 얼마이고, 남은 주식에 묶인 돈은 얼마일까
 *
 * 분할 매수의 평단은 수수료를 뺀 단순 평균이라 국내/해외 계산이 같아요 (단위만 원/$).
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

/** % 값(0.015)을 비율(0.00015)로. 비어 있으면 0 */
const ratio = (percent) => (percent > 0 ? percent / 100 : 0);

/**
 * 분할 매도
 *
 * 단계마다 "매도가 × 수량"을 팔아요. 손익은 손익 계산기와 같은 방식이에요:
 *   원가 = 평단 × 수량 × (1 + 수수료율)            ← 매수 수수료까지 원가에 넣어요
 *   국내: 받는 돈 = 매도 금액 − 매도 수수료 − 거래세 (매도 금액에)
 *   해외: 받는 돈 = 매도 금액 − 매도 수수료 (달러, 세금 전)
 *         양도소득세는 원화로: (모든 단계의 원화 차익 합계 − 기본 공제) × 세율  ← 공제는 한 번만
 *
 * 남은 주식의 실질 단가 = (넣은 돈 − 지금까지 받은 돈) ÷ 남은 수량
 *   증권사 앱의 평단은 팔아도 그대로지만, 판 돈만큼 원금을 회수했으니 남은 주식에 묶인 돈은 줄어요.
 *
 * @param {'domestic' | 'global'} market
 * @param {{ avgPrice: number, holdQty: number, sells: Array<{ price: number, qty: number }>,
 *           commRate: number, taxRate: number, taxBase?: number, fxBuy?: number, fxSell?: number }} input
 *   commRate·taxRate는 % 단위. 해외만: taxBase 기본 공제(원), fxBuy·fxSell 매수·매도 시 환율 (fxBuy가 비면 fxSell)
 * @returns 보유 주식이 입력되지 않았으면 null
 */
export function calculateSplitSell(market, { avgPrice, holdQty, sells, commRate, taxRate, taxBase, fxBuy, fxSell }) {
    if (!(avgPrice > 0 && holdQty > 0)) return null;

    const global = market === 'global';
    const c = ratio(commRate);
    const t = ratio(taxRate);
    const rateSell = fxSell > 0 ? fxSell : NaN;
    const rateBuy = fxBuy > 0 ? fxBuy : rateSell;

    let left = holdQty;   // 아직 안 판 수량
    let received = 0;     // 지금까지 받은 돈
    const rows = sells.map((s, i) => {
        const row = { no: i + 1, price: s.price, qty: s.qty };
        if (!(s.price > 0 && s.qty > 0)) return { ...row, status: 'empty' };
        if (s.qty > left) return { ...row, status: 'over', left };    // 남은 수량보다 많이 팖

        const gross = s.price * s.qty;
        const fee = gross * c;
        const tax = global ? 0 : gross * t;                // 국내 거래세 (해외 양도세는 아래에서 한 번에)
        const cost = avgPrice * s.qty;
        // 판 주식의 원가 (매수 수수료 포함). cost × (1 + c)로 쓰면 소수 오차로 1원이 어긋나서 손익 계산기와 같은 순서로 더해요
        const basis = cost + cost * c;
        const got = gross - fee - tax;
        left -= s.qty;
        received += got;
        return {
            ...row,
            status: 'ok',
            gross, fee, tax, basis, cost,
            received: got,                                 // 이 단계에서 받는 돈
            pl: got - basis,                               // 이 단계 손익 (해외는 세금 전)
            gainKrw: global ? (gross - fee) * rateSell - basis * rateBuy : NaN, // 해외: 원화 차익
            left,                                          // 이 단계 뒤 남은 수량
            receivedSoFar: received,
        };
    });

    const valid = rows.filter(r => r.status === 'ok');
    const base = { market, rows, valid, avgPrice, holdQty };
    if (valid.length === 0) return base;

    const sum = (key) => valid.reduce((acc, r) => acc + r[key], 0);
    const soldQty = sum('qty');
    const gross = sum('gross');
    const basis = sum('basis');
    const soldCost = sum('cost');   // 판 주식의 매수 금액 (수수료 제외) → 수익률의 분모 (손익 계산기와 같게)
    const holdCost = avgPrice * holdQty;
    const invested = holdCost + holdCost * c;              // 처음에 넣은 돈 전체 (매수 수수료 포함)
    const remainQty = holdQty - soldQty;

    const result = {
        ...base,
        ready: true,
        soldQty,
        remainQty,
        gross,
        fee: sum('fee'),
        tax: sum('tax'),
        received,
        basis,
        pl: received - basis,                              // 손익 합계 (국내는 세후, 해외는 세금 전 $)
        avgSell: gross / soldQty,                          // 평균 매도가
        invested,
        recovered: received >= invested,                   // 원금 회수 완료?
        surplus: received - invested,                      // 받은 돈 − 넣은 돈 (원금 회수 뒤 남는 돈)
        effective: remainQty > 0 ? (invested - received) / remainQty : null, // 남은 주식의 실질 단가
    };

    if (!global) {
        return { ...result, net: result.pl, rate: result.pl / soldCost * 100 };
    }

    // 해외: 양도소득세 (원화). 환율이 없으면 세금을 계산할 수 없어서 세금 전 달러 손익만 보여줘요.
    if (!(rateSell > 0)) return { ...result, taxReady: false, rate: result.pl / soldCost * 100 };
    const gainKrw = sum('gainKrw');
    const deduct = Math.min(Math.max(gainKrw, 0), taxBase || 0);
    const taxKrw = Math.max(0, gainKrw - (taxBase || 0)) * t;
    const net = gainKrw - taxKrw;
    return {
        ...result,
        taxReady: true,
        rateBuy, rateSell,
        gainKrw,                                           // 원화 양도차익 (수수료 뺌)
        deduct,                                            // 이번에 쓴 기본 공제
        taxKrw,                                            // 양도소득세 (원)
        net,                                               // 세후 순이익 (원)
        rate: net / (soldCost * rateBuy) * 100,
    };
}
