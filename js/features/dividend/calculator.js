/**
 * dividend/calculator.js — 배당 계산 (화면과 무관한 순수 함수)
 *
 *   calculateMyDividend()    내 배당: 이만큼 갖고 있으면 배당이 얼마 들어올까
 *   calculateGoalDividend()  목표 배당: 한 달(1년)에 이만큼 받으려면 몇 주, 얼마가 필요할까
 *
 * 세금은 배당을 받을 때 떼고 들어와요 (원천징수).
 *   국내: 배당소득세 15.4% (소득세 14% + 지방소득세 1.4%)
 *   해외: 현지 원천징수 (미국 15%) — 한국 세율(14%)보다 높아서 국내에서 더 떼지 않아요
 * 1년 세전 이자+배당이 2,000만 원을 넘으면 금융소득종합과세 대상이라 경고만 보여줘요.
 */

/** 배당 주기: 1년에 몇 번 받는지 */
export const FREQS = [
    { n: 1, label: '연 1회', every: '1년마다' },
    { n: 2, label: '반기', every: '반년마다' },
    { n: 4, label: '분기', every: '분기마다' },
    { n: 12, label: '매월', every: '매달' },
];
export const freqOf = (n) => FREQS.find(f => f.n === n) ?? FREQS[0];

/** 금융소득종합과세 기준 (1년 세전 이자+배당, 원) */
export const THRESHOLD_KRW = 20_000_000;

/** % 값(15.4)을 비율(0.154)로. 비어 있으면 0 */
const ratio = (percent) => (percent > 0 ? percent / 100 : 0);

/** 원화로 바꾼 금액 (국내는 그대로, 해외는 환율을 곱해요. 환율이 없으면 null) */
function toKrw(amount, market, fx) {
    if (market !== 'global') return amount;
    return fx > 0 ? amount * fx : null;
}

/**
 * 내 배당
 * @param {'domestic' | 'global'} market
 * @param {{ price: number, dps: number, freq: number, qty: number, avgPrice: number, taxRate: number, fx: number }} input
 *   price 주가(선택, 수익률용), dps 1회 주당 배당금, freq 1년에 받는 횟수, qty 보유 수량,
 *   avgPrice 내 평단(선택), taxRate 세율(%), fx 환율(해외, 선택)
 * @returns 입력이 덜 됐으면 null
 */
export function calculateMyDividend(market, { price, dps, freq, qty, avgPrice, taxRate, fx }) {
    if (!(dps > 0 && freq > 0 && qty > 0)) return null;

    const t = ratio(taxRate);
    const annualDps = dps * freq;           // 1년 주당 배당금
    const perGross = dps * qty;             // 1회 세전
    const annualGross = annualDps * qty;    // 1년 세전
    const annualNet = annualGross * (1 - t);
    const yieldOf = (base) => (base > 0 ? annualDps / base * 100 : null);
    const annualGrossKrw = toKrw(annualGross, market, fx);

    return {
        market, freq, qty, dps, price, avgPrice, taxRate: t, fx,
        annualDps,
        perGross,
        perTax: perGross * t,
        perNet: perGross * (1 - t),         // 1회 받는 돈
        annualGross,
        annualTax: annualGross * t,
        annualNet,                          // 1년 세후
        monthlyNet: annualNet / 12,         // 한 달 평균 세후
        invested: price > 0 ? price * qty : null,      // 지금 주가로 본 평가 금액
        yield: yieldOf(price),              // 현재가 기준 배당 수익률 (세전 %)
        yieldOnCost: yieldOf(avgPrice),     // 내 평단 기준 (세전 %)
        annualNetKrw: toKrw(annualNet, market, fx),
        monthlyNetKrw: toKrw(annualNet / 12, market, fx),
        overThreshold: annualGrossKrw !== null && annualGrossKrw > THRESHOLD_KRW,
    };
}

/**
 * 목표 배당
 *
 *   필요한 1년 세전 배당 = 목표 세후 배당(1년) ÷ (1 − 세율)
 *   필요한 수량 = 필요한 세전 배당 ÷ 1년 주당 배당금   (1주 단위라 올림)
 *
 * @param {'domestic' | 'global'} market
 * @param {{ price: number, dps: number, freq: number, goal: number, period: 'month' | 'year',
 *           cash: number, taxRate: number, fx: number }} input
 *   goal 목표 세후 배당 (period가 month면 한 달, year면 1년), cash 가진 돈(선택)
 * @returns 입력이 덜 됐으면 null
 */
export function calculateGoalDividend(market, { price, dps, freq, goal, period, cash, taxRate, fx }) {
    if (!(price > 0 && dps > 0 && freq > 0 && goal > 0)) return null;

    const t = ratio(taxRate);
    if (t >= 1) return null;
    const annualDps = dps * freq;
    const goalYear = period === 'year' ? goal : goal * 12;  // 목표 1년 세후
    const needGross = goalYear / (1 - t);                    // 필요한 1년 세전 배당
    // 1e-9: 나누어떨어지는 값이 소수 오차 때문에 1주 더 올라가지 않게
    const qty = Math.ceil(needGross / annualDps - 1e-9);
    const annualNet = qty * annualDps * (1 - t);
    const invest = qty * price;
    const annualGrossKrw = toKrw(qty * annualDps, market, fx);

    let withCash = null;
    if (cash > 0) {
        const cashQty = Math.floor(cash / price + 1e-9);
        withCash = {
            cash,
            qty: cashQty,                                   // 가진 돈으로 살 수 있는 수량
            monthlyNet: cashQty * annualDps * (1 - t) / 12, // 그때 한 달 세후 배당
            short: invest - cash,                           // 목표까지 모자란 돈 (음수면 남음)
        };
    }

    return {
        market, price, dps, freq, taxRate: t, fx, period, goal,
        annualDps,
        yield: annualDps / price * 100,
        goalYear,
        needGross,
        qty,                                // 필요한 수량
        invest,                             // 필요한 투자금
        annualNet,                          // 그만큼 사면 실제 1년 세후 (올림 때문에 목표보다 조금 많음)
        monthlyNet: annualNet / 12,
        investKrw: toKrw(invest, market, fx),
        monthlyNetKrw: toKrw(annualNet / 12, market, fx),
        annualNetKrw: toKrw(annualNet, market, fx),
        overThreshold: annualGrossKrw !== null && annualGrossKrw > THRESHOLD_KRW,
        withCash,
    };
}
