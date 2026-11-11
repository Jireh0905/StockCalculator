/**
 * saving/calculator.js — 적립식(복리) 계산 (화면과 무관한 순수 함수)
 *
 *   calculateSaving()  얼마가 될까: 처음 넣는 돈 + 매달 넣는 돈을 기간 동안 굴리면
 *   calculateGoal()    목표 금액: 기간 뒤 목표를 만들려면 매달 얼마를 넣어야 할까
 *
 * 매달 단위로 계산해요 (가정은 화면에도 적어둬요).
 *   1. 매달 초에 돈을 넣어요 (첫 달에는 처음 넣는 돈도)
 *   2. 한 달치 주가 상승:  잔고 × 월 상승률,  월 상승률 = (1 + 연 상승률)^(1/12) − 1
 *   3. 한 달치 배당:      잔고 × 연 배당률 ÷ 12, 받을 때 배당세를 떼요
 *      다시 투자 → 잔고에 더해요 (그만큼 새로 산 주식이라 원가에도 더해요)
 *      받아서 쓰기 → 계좌 밖으로 (받은 배당 합계로만 셈)
 * 수익률은 매년 같다고 가정해요. 매수 수수료는 넣지 않아요.
 * 국내 주식의 매매 차익은 세금이 없다고 봐요 (소액주주). 해외는 다 팔 때 양도소득세를 따로 보여줘요.
 */

export const MAX_YEARS = 50;

/** % 값을 비율로. 비어 있으면 0 */
const ratio = (percent) => (Number.isFinite(percent) ? percent / 100 : 0);

/**
 * 매달 계산을 실제로 돌리는 부분 (두 탭이 함께 써요)
 * @returns {{ rows: Array, balance: number, principal: number, basis: number, cashDiv: number }}
 *   rows: 연차별 { year, principal, value, gain, cashDiv }
 */
function simulate({ initial, monthly, years, growth, divYield, reinvest, divTax }) {
    const gm = Math.pow(1 + ratio(growth), 1 / 12) - 1;   // 월 주가 상승률
    const dm = ratio(divYield) / 12;                      // 월 배당률
    const keep = 1 - ratio(divTax);                       // 배당에서 세금 떼고 남는 비율

    let balance = initial;     // 주식 평가 금액
    let principal = initial;   // 내가 넣은 돈
    let basis = initial;       // 원가 (넣은 돈 + 다시 투자한 배당) → 해외 양도세 계산용
    let cashDiv = 0;           // 받아서 쓴 배당 합계 (세후)
    const rows = [];

    for (let m = 1; m <= years * 12; m++) {
        balance += monthly;
        principal += monthly;
        basis += monthly;
        balance *= 1 + gm;
        const div = balance * dm * keep;
        if (reinvest) {
            balance += div;
            basis += div;
        } else {
            cashDiv += div;
        }
        if (m % 12 === 0) {
            rows.push({ year: m / 12, principal, value: balance, gain: balance - principal, cashDiv });
        }
    }
    return { rows, balance, principal, basis, cashDiv };
}

/** 입력 확인: 기간 1~50년, 수익률은 −99% 위 */
function valid({ years, growth }) {
    return years >= 1 && years <= MAX_YEARS && Number.isInteger(years) && !(growth <= -99);
}

/** 결과에 공통으로 붙는 것: 재투자 비교, 72 법칙, 해외 양도세, 물가 */
function summarize(input, run) {
    const { market, years, growth, divYield, reinvest, divTax, capTax, taxBase, inflation, fx } = input;
    const final = run.balance;

    // 배당을 반대로 했을 때 (다시 투자 ↔ 받아서 쓰기)와 비교
    const other = divYield > 0 ? simulate({ ...input, reinvest: !reinvest }) : null;
    const wealth = (r, re) => r.balance + (re ? 0 : r.cashDiv); // 받아서 쓴 배당까지 더한 전체
    const reinvestGain = other
        ? (reinvest ? wealth(run, true) - wealth(other, false) : wealth(other, true) - wealth(run, false))
        : null;

    // 72 법칙: 72 ÷ 연 수익률(%) ≈ 돈이 2배가 되는 햇수 (배당은 다시 투자할 때만 불어나요)
    const yearly = (growth || 0) + (reinvest ? (divYield || 0) * (1 - ratio(divTax)) : 0);
    const doubleYears = yearly > 0 ? 72 / yearly : null;

    // 해외: 다 팔 때 양도소득세 (원화 차익 − 기본 공제) × 세율. 같은 환율이라고 가정
    let capital = null;
    if (market === 'global' && fx > 0) {
        const gainKrw = (final - run.basis) * fx;
        const taxKrw = Math.max(0, gainKrw - (taxBase || 0)) * ratio(capTax);
        capital = { gainKrw, taxKrw, afterTax: final - taxKrw / fx, rate: capTax || 0 };
    }

    return {
        market, years, reinvest, fx,
        rows: run.rows,
        final,                              // 기간 뒤 평가 금액
        principal: run.principal,           // 넣은 원금
        gain: final - run.principal,        // 수익
        multiple: run.principal > 0 ? final / run.principal : null,
        cashDiv: run.cashDiv,               // 받아서 쓴 배당 합계 (세후)
        hasDiv: divYield > 0,
        reinvestGain,                       // 다시 투자하면 더 생기는 돈
        doubleYears,
        yearly,
        capital,
        real: inflation > 0 ? final / Math.pow(1 + inflation / 100, years) : null, // 오늘 돈 가치로
    };
}

/**
 * 얼마가 될까
 * @param {{ market: string, initial: number, monthly: number, years: number, growth: number,
 *           divYield: number, reinvest: boolean, divTax: number, capTax: number, taxBase: number,
 *           inflation: number, fx: number }} input  (금액은 원/$, 비율은 %)
 * @returns 입력이 덜 됐으면 null
 */
export function calculateSaving(input) {
    const initial = input.initial > 0 ? input.initial : 0;
    const monthly = input.monthly > 0 ? input.monthly : 0;
    if (!(initial > 0 || monthly > 0) || !valid(input)) return null;
    const run = simulate({ ...input, initial, monthly });
    return { ...summarize({ ...input, initial, monthly }, run), initial, monthly };
}

/**
 * 목표 금액: 매달 얼마를 넣어야 할까
 *
 * 결과는 매달 넣는 돈에 정비례해요: 기간 뒤 금액 = A + B × 매달 넣는 돈
 *   A = 처음 넣는 돈만 굴린 결과, B = 매달 1원씩 넣었을 때의 결과
 *   → 매달 넣는 돈 = (목표 − A) ÷ B   (국내 1,000원, 해외 $1 단위로 올림)
 * 목표는 "팔기 전 평가 금액" 기준이에요. 받아서 쓴 배당은 계좌 밖이라 넣지 않아요.
 *
 * @param {object} input - calculateSaving과 같고, monthly 대신 goal(목표 금액)
 */
export function calculateGoal(input) {
    const initial = input.initial > 0 ? input.initial : 0;
    if (!(input.goal > 0) || !valid(input)) return null;

    const a = simulate({ ...input, initial, monthly: 0 }).balance;
    const b = simulate({ ...input, initial: 0, monthly: 1 }).balance;
    const unit = input.market === 'global' ? 1 : 1000;
    const enough = a >= input.goal;                       // 처음 넣는 돈만으로 충분
    const raw = enough ? 0 : (input.goal - a) / b;
    const monthly = enough ? 0 : Math.ceil(raw / unit - 1e-9) * unit;

    const run = simulate({ ...input, initial, monthly });
    if (!(initial > 0 || monthly > 0)) return null;
    return {
        ...summarize({ ...input, initial, monthly }, run),
        initial,
        goal: input.goal,
        monthly,                            // 필요한 매달 금액
        exact: raw,                         // 올림 전 값
        enough,
        fromInitial: a,                     // 처음 넣는 돈만 굴린 결과
    };
}
