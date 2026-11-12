/**
 * target/calculator.js — 목표가·본전가 계산 (국내 주식, 화면과 무관한 순수 함수)
 *
 * 수익률 기준은 손익 계산기와 같아요: 순손익 ÷ 매수 금액.
 * 그래서 여기서 나온 목표가를 손익 계산기에 넣으면 목표 수익률이 그대로 나와요.
 *
 * 1주 기준으로 풀면
 *   순손익 = 매도가 × (1 − 수수료율 − 거래세율) − 매수가 × (1 + 수수료율)
 *   순손익 = 매수가 × 목표수익률  이 되는 매도가를 찾으면
 *   매도가 = 매수가 × (1 + 수수료율 + 목표수익률) ÷ (1 − 수수료율 − 거래세율)
 */

/**
 * @param {{ buyPrice: number, goalRate: number, commRate: number, taxRate: number }} input
 *   goalRate·commRate·taxRate는 % 단위 (예: 10, 0.015, 0.20)
 * @returns 입력이 덜 됐으면 null
 */
export function calculateTarget({ buyPrice, goalRate, commRate, taxRate }) {
    if (!(buyPrice > 0) || Number.isNaN(goalRate)) return null;

    const c = (commRate || 0) / 100;
    const t = (taxRate || 0) / 100;
    const g = goalRate / 100;
    const keep = 1 - c - t; // 매도 금액 중 손에 남는 비율
    if (keep <= 0) return null;

    const breakEven = buyPrice * (1 + c) / keep;
    const target = buyPrice * (1 + c + g) / keep;

    return {
        breakEven,                                      // 본전 매도가
        breakEvenRise: (breakEven / buyPrice - 1) * 100, // 본전까지 올라야 하는 비율 (%)
        target,                                         // 목표 매도가
        targetRise: (target / buyPrice - 1) * 100,      // 목표까지 올라야 하는 비율 (%)
        profitPerShare: buyPrice * g,                   // 목표가에 팔 때 1주당 순이익
    };
}

/**
 * 해외 주식 목표가
 *
 * 해외는 거래세가 없고, 양도소득세(22%)가 1년 수익 합계에서 기본 공제(250만 원)를 뺀 만큼에 붙어요.
 * 그래서 세금이 붙는지는 이 거래 하나로 정할 수 없어서 두 가지를 함께 보여줘요.
 *   공제 안 (세금 없음):   매도가 = 매수가 × (1 + 수수료율 + 목표수익률) ÷ (1 − 수수료율)
 *   공제를 다 썼을 때:     (매도가 × (1 − 수수료율) − 매수가 × (1 + 수수료율)) × (1 − 세율) = 매수가 × 목표수익률
 *                        → 매도가 = (매수가 × (1 + 수수료율) + 매수가 × 목표수익률 ÷ (1 − 세율)) ÷ (1 − 수수료율)
 * 본전(손익 0)에는 세금이 없어서 본전 매도가는 하나예요.
 *
 * @param {{ buyPrice: number, goalRate: number, commRate: number, taxRate: number }} input  ($, %)
 */
export function calculateTargetGlobal({ buyPrice, goalRate, commRate, taxRate }) {
    if (!(buyPrice > 0) || Number.isNaN(goalRate)) return null;

    const c = (commRate || 0) / 100;
    const t = (taxRate || 0) / 100;
    const g = goalRate / 100;
    if (c >= 1 || t >= 1) return null;

    const breakEven = buyPrice * (1 + c) / (1 - c);
    const target = buyPrice * (1 + c + g) / (1 - c);                    // 공제 안 (세금 없음)
    const targetTaxed = (buyPrice * (1 + c) + buyPrice * g / (1 - t)) / (1 - c); // 공제를 다 썼을 때
    return {
        breakEven,
        breakEvenRise: (breakEven / buyPrice - 1) * 100,
        target,
        targetRise: (target / buyPrice - 1) * 100,
        targetTaxed,
        targetTaxedRise: (targetTaxed / buyPrice - 1) * 100,
        profitPerShare: buyPrice * g,
    };
}

/**
 * 해외 주식 목표가 — 환율까지 생각하기 (원화 기준)
 *
 * 산 날 환율 r1, 팔 때 예상 환율 r2가 다르면, 원화로 같은 수익률을 내는 달러 목표가가 달라져요.
 * 원화 순이익 = 매도가 × (1 − 수수료율) × r2 − 매수가 × (1 + 수수료율) × r1
 *   공제 안 (세금 없음):  원화 순이익 = 매수가 × r1 × 목표수익률
 *       → 매도가 = 매수가 × r1 × (1 + 수수료율 + 목표수익률) ÷ ((1 − 수수료율) × r2)
 *   공제를 다 썼을 때:    원화 순이익 × (1 − 세율) = 매수가 × r1 × 목표수익률
 *       → 매도가 = 매수가 × r1 × (1 + 수수료율 + 목표수익률 ÷ (1 − 세율)) ÷ ((1 − 수수료율) × r2)
 *   본전(원화 손익 0)     → 매도가 = 매수가 × r1 × (1 + 수수료율) ÷ ((1 − 수수료율) × r2)
 * 수익률의 기준은 손익 계산기와 같은 원화 매수 금액(매수가 × r1)이에요.
 *
 * @param {{ buyPrice: number, goalRate: number, commRate: number, taxRate: number, fxBuy: number, fxSell: number }} input
 * @returns 환율 두 개 중 하나라도 비었으면 null
 */
export function calculateTargetFx({ buyPrice, goalRate, commRate, taxRate, fxBuy, fxSell }) {
    if (!(buyPrice > 0 && fxBuy > 0 && fxSell > 0) || Number.isNaN(goalRate)) return null;
    const c = (commRate || 0) / 100;
    const t = (taxRate || 0) / 100;
    const g = goalRate / 100;
    if (c >= 1 || t >= 1) return null;
    const k = buyPrice * fxBuy / ((1 - c) * fxSell);     // 공통 부분
    const target = k * (1 + c + g);
    const targetTaxed = k * (1 + c + g / (1 - t));
    const breakEven = k * (1 + c);
    return {
        fxBuy, fxSell,
        fxRate: (fxSell / fxBuy - 1) * 100,              // 환율 변화 (%)
        target, targetRise: (target / buyPrice - 1) * 100,
        targetTaxed, targetTaxedRise: (targetTaxed / buyPrice - 1) * 100,
        breakEven, breakEvenRise: (breakEven / buyPrice - 1) * 100,
    };
}
