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
