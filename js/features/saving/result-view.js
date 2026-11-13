/**
 * saving/result-view.js — 적립식 계산기의 결과 카드 (계산은 하지 않고 보여주기만)
 *
 * 그래프·표 HTML은 chart.js가 만들고, 막대를 누르는 동작은 index.js가 연결해요.
 */
import { won } from '../../core/format.js';
import { money, bigMoney, isGlobal, viewMarket, krwLine, fxToggle } from '../../core/market.js';
import { chartSvg, caption, tableHtml } from './chart.js';


/** 그래프 + 범례 + 표 */
function chartBlock(r, m) {
    const last = r.rows[r.rows.length - 1];
    return `
        <h3 class="sub-title">연도별로 불어나는 모습 <span class="sub-title-note">막대를 눌러보세요</span></h3>
        <div class="chart-caption" data-caption>${caption(last, m)}</div>
        <div class="chart-wrap" data-chart>${chartSvg(r.rows, m)}</div>
        <div class="chart-legend"><span><i class="lg-principal"></i>넣은 원금</span><span><i class="lg-gain"></i>수익</span></div>
        ${tableHtml(r.rows, m, r.hasDiv && !r.reinvest)}`;
}

/** 재투자 효과, 72 법칙, 해외 양도세, 물가 */
function extras(r, m) {
    const items = [];
    if (r.hasDiv && r.reinvestGain !== null) {
        items.push(r.reinvest
            ? `<li><span>배당을 다시 투자한 효과</span><span class="tone-up">+${money(r.reinvestGain, m)}</span></li>
               <li class="sub"><span>받아서 썼을 때(받은 배당 포함)보다 이만큼 더</span><span></span></li>`
            : `<li><span>받아서 쓴 배당 합계 (세후)</span><span>${money(r.cashDiv, m)}</span></li>
               <li><span>다시 투자했다면</span><span class="tone-up">+${money(r.reinvestGain, m)} 더</span></li>`);
    }
    if (r.doubleYears !== null) {
        items.push(`<li><span>돈이 2배가 되는 데</span><span>약 ${r.doubleYears.toFixed(1)}년</span></li>
            <li class="sub"><span>72 법칙: 72 ÷ 연 수익률 ${r.yearly.toFixed(2).replace(/\.?0+$/, '')}%</span><span></span></li>`);
    }
    if (r.capital) {
        items.push(`<li class="divider"><span>${r.years}년 뒤 다 팔면 양도소득세</span><span>약 ${won(r.capital.taxKrw)}원</span></li>
            <li class="sub"><span>원화 차익 ${won(r.capital.gainKrw)}원에서 기본 공제 뒤 ${r.capital.rate}%</span><span></span></li>
            <li><span>세금 뒤 남는 돈</span><span>${money(r.capital.afterTax, m)}</span></li>`);
    }
    if (r.real !== null) {
        items.push(`<li class="divider"><span>오늘 돈 가치로는</span><span>약 ${money(r.real, m)}</span></li>`);
    }
    return items.length ? `<h3 class="sub-title">더 알아보기</h3><ul class="rows rows-tight">${items.join('')}</ul>` : '';
}

const ASSUMPTION = `<p class="note">매달 초에 넣고, 수익률이 매년 같다고 가정한 예상치예요. 실제 주가는 오르내려요.
    배당은 받을 때 세금을 떼고, 매수 수수료는 넣지 않았어요.</p>`;

/* ---------- 얼마가 될까 ---------- */

export function renderGrowResult(el, r, { onSave }) {
    if (!r) {
        el.innerHTML = `<div class="result-empty"><span class="icon">🌱</span>매달 넣는 돈(또는 처음 넣는 돈)과<br>기간을 입력하면 얼마가 되는지 보여줘요</div>`;
        return;
    }
    const m = viewMarket(r.market); // [원] 보기면 세부 금액을 원화로
    const parts = [
        r.initial > 0 ? `처음 ${money(r.initial, m)}` : '',
        r.monthly > 0 ? `매달 ${money(r.monthly, m)} × ${won(r.years * 12)}달` : '',
    ].filter(Boolean).join(' + ');

    el.innerHTML = `
        ${fxToggle(m)}
        <div class="result-label">${r.years}년 뒤 평가 금액</div>
        <div class="result-amount">${bigMoney(r.final, m)}</div>
        ${krwLine(r.final, m)}
        <span class="rate-pill ${r.gain >= 0 ? 'pill-up' : 'pill-down'}">수익 ${r.gain >= 0 ? '+' : '−'}${money(Math.abs(r.gain), m)}${r.multiple ? ` · 원금의 ${r.multiple.toFixed(2)}배` : ''}</span>

        <ul class="rows">
            <li><span>넣은 원금</span><span>${money(r.principal, m)}</span></li>
            <li class="sub"><span>${parts}</span><span></span></li>
            <li><span>수익</span><span class="${r.gain >= 0 ? 'tone-up' : 'tone-down'}">${r.gain >= 0 ? '+' : '−'}${money(Math.abs(r.gain), m)}</span></li>
        </ul>
        ${chartBlock(r, m)}
        ${extras(r, m)}
        ${ASSUMPTION}
        <button type="button" class="save-btn">기록에 저장</button>`;
    el.querySelector('.save-btn').addEventListener('click', onSave);
}

/* ---------- 목표 금액 ---------- */

export function renderGoalResult(el, r, { onSave }) {
    if (!r) {
        el.innerHTML = `<div class="result-empty"><span class="icon">🏁</span>목표 금액과 기간을 입력하면<br>매달 얼마를 넣어야 하는지 알려줘요</div>`;
        return;
    }
    const m = viewMarket(r.market); // [원] 보기면 세부 금액을 원화로
    const unit = isGlobal(m) ? '$1' : '1,000원';
    const head = r.enough
        ? `<div class="result-amount result-amount-text">더 안 넣어도 돼요</div>
           <span class="rate-pill pill-up">처음 넣는 돈만으로 ${r.years}년 뒤 ${money(r.fromInitial, m)}</span>`
        : `<div class="result-amount">${bigMoney(r.monthly, m)}</div>
           ${krwLine(r.monthly, m)}
           <span class="rate-pill pill-up">${r.years}년 뒤 ${money(r.goal, m)} 목표</span>`;

    el.innerHTML = `
        ${fxToggle(m)}
        <div class="result-label">매달 넣어야 할 돈</div>
        ${head}
        <ul class="rows">
            ${r.enough ? '' : `
            <li><span>계산한 값</span><span>${money(r.exact, m)}</span></li>
            <li class="sub"><span>${unit} 단위로 올림</span><span></span></li>`}
            ${r.initial > 0 && !r.enough ? `<li><span>처음 넣는 돈만 굴리면</span><span>${money(r.fromInitial, m)}</span></li>` : ''}
            <li class="divider"><span>${r.enough ? '' : `매달 ${money(r.monthly, m)}씩 넣으면 `}${r.years}년 뒤</span><span>${money(r.final, m)}</span></li>
            <li class="sub"><span>넣은 원금 ${money(r.principal, m)} + 수익 ${money(r.gain, m)}</span><span></span></li>
        </ul>
        ${chartBlock(r, m)}
        ${extras(r, m)}
        ${r.hasDiv && !r.reinvest ? '<p class="note">배당을 받아서 쓰면 그 돈은 계좌 밖으로 나가서 목표 금액에 넣지 않았어요.</p>' : ''}
        ${ASSUMPTION}
        <button type="button" class="save-btn">기록에 저장</button>`;
    el.querySelector('.save-btn').addEventListener('click', onSave);
}
