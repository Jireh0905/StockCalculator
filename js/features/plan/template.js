/**
 * plan/template.js — 하락 대응 계산기 화면의 HTML
 *
 * data-values: 이 안의 입력칸은 values 하나로 묶어서 저장해요. (분할 매수 단계 줄은 따로 steps로 저장)
 * data-hint="이름": 입력값에 따라 글자가 바뀌는 안내 (예: "현재가 −4.3%")
 */
export const template = `
<div class="layout">
    <div class="input-col">
        <section class="card" data-values>
            <h2 class="card-title">지금 갖고 있는 주식</h2>
            <div class="grid-2">
                <label class="field">
                    <span class="field-label">평균 단가</span>
                    <span class="input-wrap"><input name="avgPrice" inputmode="decimal" placeholder="52,000" autocomplete="off"><span class="unit">원</span></span>
                </label>
                <label class="field">
                    <span class="field-label">보유 수량</span>
                    <span class="input-wrap"><input name="holdQty" inputmode="numeric" data-int placeholder="30" autocomplete="off"><span class="unit">주</span></span>
                </label>
            </div>
            <label class="field">
                <span class="field-label">현재가 <span class="field-optional">선택</span></span>
                <span class="input-wrap"><input name="curPrice" inputmode="decimal" placeholder="46,000" autocomplete="off"><span class="unit">원</span></span>
                <span class="hint" data-hint="curPrice">넣으면 계획한 가격이 지금보다 몇 % 아래인지 보여줘요</span>
            </label>

            <details class="settings">
                <summary>수수료·세금 (국내) <span class="chip" data-chip></span></summary>
                <div class="settings-body grid-2">
                    <label class="field">
                        <span class="field-label">증권사 수수료</span>
                        <span class="input-wrap"><input name="commRate" inputmode="decimal" value="0.015" autocomplete="off"><span class="unit">%</span></span>
                        <span class="hint">매수·매도 각각</span>
                    </label>
                    <label class="field">
                        <span class="field-label">거래세</span>
                        <span class="input-wrap"><input name="taxRate" inputmode="decimal" value="0.20" autocomplete="off"><span class="unit">%</span></span>
                        <span class="hint">매도할 때만</span>
                    </label>
                </div>
            </details>
        </section>

        <div class="segmented" role="tablist" aria-label="대응 방법">
            <button type="button" role="tab" id="tab-avg" aria-controls="panel-avg" aria-selected="true" data-tab="avg">물타기 계획</button>
            <button type="button" role="tab" id="tab-stop" aria-controls="panel-stop" aria-selected="false" data-tab="stop">손절 후 재매수</button>
        </div>

        <!-- 물타기 계획: 매수가 + 목표 평단을 한 세트로 늘리고 줄여요 -->
        <section class="card panel" id="panel-avg" role="tabpanel" aria-labelledby="tab-avg">
            <h2 class="card-title">분할 매수 계획</h2>
            <div class="buy-list" data-steps></div>
            <button type="button" class="add-row-btn" data-add>+ 분할 매수 늘리기</button>

            <div class="grid-2 panel-extra" data-values>
                <label class="field">
                    <span class="field-label">손절선 <span class="field-optional">선택</span></span>
                    <span class="input-wrap"><input name="stopLine" inputmode="decimal" placeholder="36,000" autocomplete="off"><span class="unit">원</span></span>
                    <span class="hint" data-hint="stopLine">다 사고도 여기까지 떨어지면 판다</span>
                </label>
                <label class="field">
                    <span class="field-label">쓸 수 있는 돈 <span class="field-optional">선택</span></span>
                    <span class="input-wrap"><input name="budget" inputmode="numeric" data-int placeholder="3,000,000" autocomplete="off"><span class="unit">원</span></span>
                    <span class="hint">넘는 단계를 알려줘요</span>
                </label>
            </div>
        </section>

        <!-- 손절 후 재매수 -->
        <section class="card panel" id="panel-stop" role="tabpanel" aria-labelledby="tab-stop" hidden data-values>
            <h2 class="card-title">손절 후 재매수 계획</h2>
            <div class="grid-2">
                <label class="field">
                    <span class="field-label">손절가</span>
                    <span class="input-wrap"><input name="stopPrice" inputmode="decimal" placeholder="45,000" autocomplete="off"><span class="unit">원</span></span>
                    <span class="hint" data-hint="stopPrice">이 가격에 모두 팔아요</span>
                </label>
                <label class="field">
                    <span class="field-label">재매수가</span>
                    <span class="input-wrap"><input name="rebuyPrice" inputmode="decimal" placeholder="40,000" autocomplete="off"><span class="unit">원</span></span>
                    <span class="hint" data-hint="rebuyPrice">이 가격에 다시 사요</span>
                </label>
            </div>
            <label class="field">
                <span class="field-label">재매수 금액 <span class="field-optional">선택</span></span>
                <span class="input-wrap"><input name="rebuyAmount" inputmode="numeric" data-int placeholder="비우면 손절로 받은 돈 전부" autocomplete="off"><span class="unit">원</span></span>
                <span class="hint">받은 돈보다 많이 넣으면 그만큼 돈을 더 넣는 거예요</span>
            </label>
        </section>
    </div>
    <div class="result-col">
        <section class="card result-card" data-result aria-live="polite"></section>
    </div>
</div>`;

/** 분할 매수 한 단계의 입력 줄 (매수가 + 목표 평단 세트) */
export function createStepRow() {
    const row = document.createElement('div');
    row.className = 'buy-row step-row';
    row.innerHTML = `
        <div class="buy-row-head">
            <span class="buy-row-title"></span>
            <button type="button" class="text-btn" data-remove>삭제</button>
        </div>
        <div class="grid-2">
            <label class="field">
                <span class="field-label">매수가</span>
                <span class="input-wrap"><input name="stepPrice" inputmode="decimal" placeholder="44,000" autocomplete="off"><span class="unit">원</span></span>
                <span class="hint" data-step-hint></span>
            </label>
            <label class="field">
                <span class="field-label">목표 평단</span>
                <span class="input-wrap"><input name="stepGoal" inputmode="decimal" placeholder="48,000" autocomplete="off"><span class="unit">원</span></span>
            </label>
        </div>
        <p class="step-result" data-step-result></p>`;
    return row;
}
