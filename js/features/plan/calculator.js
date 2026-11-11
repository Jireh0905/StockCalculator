/**
 * plan/calculator.js — 하락 대응 계획 계산 (화면과 무관한 순수 함수)
 *
 * 주가가 떨어졌을 때의 두 가지 계획을 계산해요.
 *   planAveraging()  물타기 분할 매수: 단계마다 "매수가 + 목표 평단" → 필요한 수량
 *   planStopRebuy()  손절 후 재매수: 손절가에 모두 팔고 재매수가에 다시 사기
 * 그리고 "그대로 보유"까지 셋을 같은 기준(본전 가격)으로 비교할 수 있게 해요.
 *
 * 돈 계산 기준
 * - 평단은 물타기 계산기와 같이 수수료를 뺀 단순 평균이에요.
 * - "본전 가격"은 수수료·세금까지 넣어서 계산해요. 그 가격에 모두 팔면 넣은 돈을 그대로 돌려받는 가격이에요.
 *     본전 가격 = 넣은 돈 ÷ (보유 수량 × (1 − 수수료율 − 거래세율))
 * - 이미 갖고 있는 주식의 매수 수수료는 알 수 없어서 넣은 돈 = 평단 × 보유 수량으로 봐요.
 */

/** % 값(0.015)을 비율(0.00015)로. 비어 있으면 0 */
const ratio = (percent) => (percent > 0 ? percent / 100 : 0);

/** 평단을 목표까지 낮추는 데 필요한 수량 (1주 단위 올림) */
function qtyFor(avg, qty, price, goal) {
    const raw = qty * (avg - goal) / (goal - price);
    // 1e-9: 나누어떨어지는 값(예: 30.000000000004)이 소수 오차 때문에 31로 올라가지 않게
    return Math.ceil(raw - 1e-9);
}

/** 넣은 돈을 그대로 돌려받는 매도가 (수수료·세금 포함) */
function breakEvenPrice(moneyIn, qty, keep) {
    return moneyIn / (qty * keep);
}

/**
 * 물타기 분할 매수 계획
 *
 * 단계는 순서대로 계산해요. 2차는 1차까지 산 결과(평단·수량)에서 출발해요.
 * 조건이 맞지 않는 단계는 이유(status)를 붙여서 빼고, 다음 단계는 그 전 단계 결과에서 이어가요.
 *
 * @param {{ avgPrice: number, holdQty: number, steps: Array<{ price: number, goal: number }>,
 *           stopLine: number, budget: number, commRate: number, taxRate: number }} input
 *   stopLine 손절선(선택), budget 쓸 수 있는 돈(선택), commRate·taxRate는 % 단위
 * @returns 보유 주식이 입력되지 않았으면 null
 */
export function planAveraging({ avgPrice, holdQty, steps, stopLine, budget, commRate, taxRate }) {
    if (!(avgPrice > 0 && holdQty > 0)) return null;

    const c = ratio(commRate);
    const keep = 1 - c - ratio(taxRate); // 매도 금액 중 손에 남는 비율
    const holdCost = avgPrice * holdQty;

    let avg = avgPrice;
    let qty = holdQty;
    let cost = holdCost;   // 매수 금액 합계 (수수료 제외) → 평단 계산용
    let spend = 0;         // 추가 매수에 실제로 쓰는 돈 (수수료 포함)

    const rows = steps.map((s, i) => {
        const row = { no: i + 1, price: s.price, goal: s.goal, prevAvg: avg };
        if (!(s.price > 0 && s.goal > 0)) return { ...row, status: 'empty' };      // 아직 입력 중
        if (s.price >= avg) return { ...row, status: 'price-high' };              // 사도 평단이 안 내려감
        if (s.goal >= avg) return { ...row, status: 'goal-high' };                // 이미 목표보다 낮음
        if (s.goal <= s.price) return { ...row, status: 'goal-low' };             // 매수가 아래로는 못 내려감

        const add = qtyFor(avg, qty, s.price, s.goal);
        const addCost = s.price * add;
        const fee = addCost * c;
        qty += add;
        cost += addCost;
        spend += addCost + fee;
        avg = cost / qty;
        return {
            ...row,
            status: 'ok',
            qty: add,             // 이 단계에서 살 수량
            cost: addCost,        // 이 단계 매수 금액
            fee,                  // 이 단계 매수 수수료
            avgAfter: avg,        // 이 단계까지 산 뒤 평단
            totalQty: qty,        // 이 단계까지 산 뒤 보유 수량
            spendSoFar: spend,    // 이 단계까지 추가로 쓴 돈 (수수료 포함)
            overBudget: budget > 0 && spend > budget,
        };
    });

    const valid = rows.filter(r => r.status === 'ok');
    const base = { rows, valid, avgPrice, holdQty, holdCost, keep };
    if (valid.length === 0) return base;

    const lowest = Math.min(...valid.map(r => r.price));
    const moneyIn = holdCost + spend;
    const breakEven = breakEvenPrice(moneyIn, qty, keep);
    const holdBreakEven = breakEvenPrice(holdCost, holdQty, keep);

    let stop = null;
    if (stopLine > 0) {
        const proceeds = stopLine * qty * keep; // 손절선에서 모두 팔면 받는 돈
        stop = {
            price: stopLine,
            proceeds,
            pl: proceeds - moneyIn,                 // 손익 (보통 마이너스)
            plRate: (proceeds - moneyIn) / moneyIn * 100,
            // 손절선이 매수가 이상인 단계: 그 단계를 사기 전에 손절선에 먼저 닿아요
            aboveSteps: valid.filter(r => stopLine >= r.price).map(r => r.no),
        };
    }

    return {
        ...base,
        ready: true,
        finalAvg: avg,                              // 최종 평단
        totalQty: qty,
        addCost: cost - holdCost,                   // 추가 매수 금액 (수수료 제외)
        addFee: spend - (cost - holdCost),          // 추가 매수 수수료
        extra: spend,                               // 추가로 넣는 돈 (수수료 포함)
        moneyIn,                                    // 넣은 돈 전체
        breakEven,                                  // 본전 가격
        lowest,                                     // 계획에서 가장 낮은 매수가
        riseFromLowest: (breakEven / lowest - 1) * 100,        // 그 가격에서 본전까지
        holdBreakEven,                                         // 물타기 안 했을 때 본전 가격
        holdRiseFromLowest: (holdBreakEven / lowest - 1) * 100,
        stop,
        budget: budget > 0 ? { budget, left: budget - spend } : null,
    };
}

/**
 * 손절 후 재매수 계획
 *
 * 손절가에 모두 팔고(수수료·거래세 차감) → 재매수가에 다시 사요(수수료 포함).
 * 재매수 금액을 비우면 손절로 받은 돈을 전부 써요.
 *
 *   본전 가격 = (확정 손실 + 재매수에 쓴 돈) ÷ (재매수 수량 × 남는 비율)
 *   (넣은 돈 전체 − 손에 남은 현금을 다시 사들인 주식으로 메워야 하니까)
 *
 * @param {{ avgPrice: number, holdQty: number, stopPrice: number, rebuyPrice: number,
 *           rebuyAmount: number, commRate: number, taxRate: number }} input
 * @returns 입력이 덜 됐으면 null
 */
export function planStopRebuy({ avgPrice, holdQty, stopPrice, rebuyPrice, rebuyAmount, commRate, taxRate }) {
    if (!(avgPrice > 0 && holdQty > 0 && stopPrice > 0 && rebuyPrice > 0)) return null;

    const c = ratio(commRate);
    const t = ratio(taxRate);
    const keep = 1 - c - t;
    const holdCost = avgPrice * holdQty;

    // 1) 손절: 모두 팔기
    const gross = stopPrice * holdQty;
    const sellComm = gross * c;
    const tax = gross * t;
    const receive = gross - sellComm - tax;  // 손절로 받는 돈
    const realized = receive - holdCost;     // 확정 손익 (보통 마이너스)

    // 2) 재매수: 비우면 받은 돈 전부
    const amount = rebuyAmount > 0 ? rebuyAmount : receive;
    const extra = Math.max(0, amount - receive);           // 받은 돈보다 더 넣는 돈
    const qty = Math.floor(amount / (rebuyPrice * (1 + c)) + 1e-9);
    const buyCost = rebuyPrice * qty;
    const buyFee = buyCost * c;
    const spend = buyCost + buyFee;
    const cash = receive + extra - spend;                 // 다시 사고 남는 현금

    const holdBreakEven = breakEvenPrice(holdCost, holdQty, keep);
    const base = {
        avgPrice, holdQty, holdCost, stopPrice, rebuyPrice,
        gross, sellComm, tax, receive, realized,
        amount, extra, usedAll: !(rebuyAmount > 0),
        holdBreakEven,
        holdRise: (holdBreakEven / rebuyPrice - 1) * 100, // 재매수가에서 "그대로 보유"의 본전까지
    };
    if (qty === 0) return { ...base, status: 'no-qty' };

    const breakEven = breakEvenPrice(-realized + spend, qty, keep);
    return {
        ...base,
        status: 'ok',
        qty, buyCost, buyFee, spend, cash,
        breakEven,                                  // 본전 가격
        rise: (breakEven / rebuyPrice - 1) * 100,   // 재매수가에서 본전까지
    };
}
