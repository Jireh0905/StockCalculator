/**
 * template.js — 손익 계산기 화면의 HTML
 *
 * 예전에는 index.html에 있던 부분이에요. 이제 index.html은 공통 틀만 갖고,
 * 각 기능의 화면 HTML은 기능 폴더 안에 둬요. (MFC로 치면 뷰마다 다이얼로그 리소스가 따로 있는 것)
 *
 * 입력칸은 id 대신 name으로 구분해요 (core/number-input.js 참고).
 * 국내/해외 선택 버튼은 이제 모든 계산기가 함께 써서 app.js가 맨 위에 그려요 (core/market.js).
 * 이 화면은 두 패널 중 지금 시장의 것만 보여줘요.
 */
export const template = `
<div class="layout">
    <!-- ===== 입력 영역 ===== -->
    <div class="input-col">
        <!-- 국내 -->
        <section class="card panel" id="panel-domestic">
            <div class="grid-2">
                <label class="field">
                    <span class="field-label">매수가</span>
                    <span class="input-wrap"><input name="buyPriceD" inputmode="decimal" placeholder="10,000" autocomplete="off"><span class="unit">원</span></span>
                </label>
                <label class="field">
                    <span class="field-label">매도가</span>
                    <span class="input-wrap"><input name="sellPriceD" inputmode="decimal" placeholder="11,000" autocomplete="off"><span class="unit">원</span></span>
                </label>
            </div>
            <label class="field">
                <span class="field-label">수량</span>
                <span class="input-wrap"><input name="quantityD" inputmode="numeric" data-int placeholder="10" autocomplete="off"><span class="unit">주</span></span>
            </label>

            <details class="settings">
                <summary>수수료·세금 <span class="chip" data-chip="domestic"></span></summary>
                <div class="settings-body grid-2">
                    <label class="field">
                        <span class="field-label">증권사 수수료</span>
                        <span class="input-wrap"><input name="commRateD" inputmode="decimal" value="0.015" autocomplete="off"><span class="unit">%</span></span>
                        <span class="hint">매수·매도 각각</span>
                    </label>
                    <label class="field">
                        <span class="field-label">거래세</span>
                        <span class="input-wrap"><input name="taxRateD" inputmode="decimal" value="0.20" autocomplete="off"><span class="unit">%</span></span>
                        <span class="hint">매도할 때만</span>
                    </label>
                </div>
            </details>
        </section>

        <!-- 해외 -->
        <section class="card panel" id="panel-global" hidden>
            <div class="grid-2">
                <label class="field">
                    <span class="field-label">매수가</span>
                    <span class="input-wrap prefix"><span class="prefix-unit">$</span><input name="buyPriceG" inputmode="decimal" placeholder="100" autocomplete="off"></span>
                </label>
                <label class="field">
                    <span class="field-label">매도가</span>
                    <span class="input-wrap prefix"><span class="prefix-unit">$</span><input name="sellPriceG" inputmode="decimal" placeholder="110" autocomplete="off"></span>
                </label>
            </div>
            <label class="field">
                <span class="field-label">수량</span>
                <span class="input-wrap"><input name="quantityG" inputmode="numeric" data-int placeholder="10" autocomplete="off"><span class="unit">주</span></span>
            </label>
            <div class="grid-2">
                <label class="field">
                    <span class="field-label">매수 시 환율</span>
                    <span class="input-wrap"><input name="exchangeRateBuyG" inputmode="decimal" placeholder="매도와 동일" autocomplete="off"><span class="unit">원</span></span>
                </label>
                <label class="field">
                    <span class="field-label">매도 시 환율</span>
                    <span class="input-wrap"><input name="exchangeRateG" inputmode="decimal" value="1,300" autocomplete="off"><span class="unit">원</span></span>
                </label>
            </div>

            <details class="settings">
                <summary>수수료·세금 <span class="chip" data-chip="global"></span></summary>
                <div class="settings-body">
                    <div class="grid-2">
                        <label class="field">
                            <span class="field-label">증권사 수수료</span>
                            <span class="input-wrap"><input name="commRateG" inputmode="decimal" value="0.10" autocomplete="off"><span class="unit">%</span></span>
                            <span class="hint">매수·매도 각각</span>
                        </label>
                        <label class="field">
                            <span class="field-label">양도소득세</span>
                            <span class="input-wrap"><input name="taxRateG" inputmode="decimal" value="22.0" autocomplete="off"><span class="unit">%</span></span>
                            <span class="hint">지방소득세 포함</span>
                        </label>
                    </div>
                    <label class="field">
                        <span class="field-label">양도소득세 기본 공제</span>
                        <span class="input-wrap"><input name="taxBaseG" inputmode="numeric" data-int value="2,500,000" autocomplete="off"><span class="unit">원</span></span>
                        <span class="hint">1년에 한 번 적용돼요</span>
                    </label>
                </div>
            </details>
        </section>
    </div>

    <!-- ===== 결과 영역 ===== -->
    <div class="result-col">
        <section class="card result-card" data-result aria-live="polite"></section>
    </div>
</div>`;
