/**
 * dividend/result-view.js — 배당 계산기의 결과 카드 그리기 (계산은 하지 않고 보여주기만)
 */
import { won } from '../../core/format.js';
import { price, money, bigMoney, isGlobal } from '../../core/market.js';
import { freqOf, THRESHOLD_KRW } from './calculator.js';

const pct = (n) => `${n.toFixed(2)}%`;

/** 해외: 달러 금액 옆에 붙는 원화 환산 "≈ 221,000원" (환율이 없으면 빈 글자) */
const krw = (n) => (n === null || n === undefined ? '' : `≈ ${won(n)}원`);

/** 금융소득종합과세 경고 + 해외 세금 안내 + 예상치 안내 */
function notes(r) {
    const list = [];
    if (r.overThreshold) {
        list.push(`<p class="note note-warn">1년 세전 배당이 ${won(THRESHOLD_KRW)}원을 넘어요. 이자·배당을 합쳐 2,000만 원이 넘으면
            <b>금융소득종합과세</b> 대상이라 다른 소득과 합쳐 세금을 다시 계산해요. 실제 세금은 더 많을 수 있어요.</p>`);
    }
    if (isGlobal(r.market)) {
        list.push(`<p class="note">해외 배당은 현지에서 ${(r.taxRate * 100).toFixed(1).replace(/\.0$/, '')}%를 떼고 들어와요 (미국 기준).
            한국 세율(14%)보다 높아서 국내에서 더 떼지 않아요.${r.fx > 0 ? '' : ' 환율을 넣으면 원화로도 보여줘요.'}</p>`);
    }
    list.push('<p class="note">지금 배당금이 그대로 이어진다고 본 예상치예요. 회사가 배당을 바꾸면 달라져요.</p>');
    return list.join('');
}

/* ---------- 내 배당 ---------- */

export function renderMineResult(el, r, market, { onSave }) {
    if (!r) {
        el.innerHTML = `<div class="result-empty"><span class="icon">💰</span>주당 배당금·배당 주기와 보유 수량을<br>입력하면 받을 배당이 나와요</div>`;
        return;
    }
    const f = freqOf(r.freq);
    const global = isGlobal(market);
    const pill = r.yield !== null
        ? `<span class="rate-pill pill-up">세후 수익률 ${pct(r.yield * (1 - r.taxRate))}</span>`
        : `<span class="rate-pill pill-flat">1년에 ${r.freq}번 받아요</span>`;

    const yields = r.yield !== null || r.yieldOnCost !== null ? `
        <h3 class="sub-title">배당 수익률 <span class="sub-title-note">세전 · 세후</span></h3>
        <ul class="rows rows-tight">
            ${r.yield !== null ? `<li><span>현재가 ${price(r.price, market)} 기준</span><span>${pct(r.yield)} · ${pct(r.yield * (1 - r.taxRate))}</span></li>` : ''}
            ${r.yieldOnCost !== null ? `<li><span>내 평단 ${price(r.avgPrice, market)} 기준</span><span>${pct(r.yieldOnCost)} · ${pct(r.yieldOnCost * (1 - r.taxRate))}</span></li>
            <li class="sub"><span>평단이 낮을수록 같은 배당에도 수익률이 높아요</span><span></span></li>` : ''}
            ${r.invested !== null ? `<li class="divider"><span>지금 평가 금액 (${won(r.qty)}주)</span><span>${money(r.invested, market)}</span></li>` : ''}
        </ul>` : '';

    el.innerHTML = `
        <div class="result-label">1년 세후 배당금</div>
        <div class="result-amount">${bigMoney(r.annualNet, market)}</div>
        ${global && r.annualNetKrw !== null ? `<div class="result-krw">${krw(r.annualNetKrw)} <span>환율 ${won(r.fx)}원</span></div>` : ''}
        ${pill}

        <h3 class="sub-title">받는 배당</h3>
        <ul class="rows rows-tight">
            <li><span>1회 (${f.every})</span><span>${money(r.perNet, market)}</span></li>
            <li class="sub"><span>세전 ${money(r.perGross, market)} − 세금 ${money(r.perTax, market)}</span><span></span></li>
            <li><span>한 달 평균</span><span>${money(r.monthlyNet, market)}${global && r.monthlyNetKrw !== null ? ` <small class="krw">${krw(r.monthlyNetKrw)}</small>` : ''}</span></li>
            <li class="divider"><span>1년 세전 (주당 ${price(r.annualDps, market)} × ${won(r.qty)}주)</span><span>${money(r.annualGross, market)}</span></li>
            <li class="sub"><span>세금 ${(r.taxRate * 100).toFixed(1).replace(/\.0$/, '')}%</span><span>−${money(r.annualTax, market)}</span></li>
        </ul>
        ${yields}
        ${notes(r)}
        <button type="button" class="save-btn">기록에 저장</button>`;
    el.querySelector('.save-btn').addEventListener('click', onSave);
}

/* ---------- 목표 배당 ---------- */

export function renderGoalResult(el, r, market, { onSave }) {
    if (!r) {
        el.innerHTML = `<div class="result-empty"><span class="icon">🎯</span>주가·주당 배당금·배당 주기와<br>목표 배당을 입력하면 필요한 수량이 나와요</div>`;
        return;
    }
    const global = isGlobal(market);
    const goalText = r.period === 'year' ? `1년 세후 ${money(r.goal, market)}` : `한 달 세후 ${money(r.goal, market)}`;

    let cashBlock = '';
    if (r.withCash) {
        const c = r.withCash;
        cashBlock = `
            <h3 class="sub-title">가진 돈 ${money(c.cash, market)}으로는</h3>
            <ul class="rows rows-tight">
                <li><span>살 수 있는 수량</span><span>${won(c.qty)}주</span></li>
                <li><span>한 달 세후 배당</span><span>${money(c.monthlyNet, market)}</span></li>
                <li><span>목표까지</span>${c.short > 0
                    ? `<span class="tone-warn">${money(c.short, market)} 모자라요</span>`
                    : `<span class="tone-ok">충분해요 · ${money(-c.short, market)} 남아요</span>`}</li>
            </ul>`;
    }

    el.innerHTML = `
        <div class="result-label">필요한 수량 <span class="result-label-sub">(${goalText})</span></div>
        <div class="result-amount">${won(r.qty)}<small>주</small></div>
        <span class="rate-pill pill-up">투자금 ${money(r.invest, market)}</span>
        ${global && r.investKrw !== null ? `<div class="result-krw">투자금 ${krw(r.investKrw)} <span>환율 ${won(r.fx)}원</span></div>` : ''}

        <h3 class="sub-title">계산 과정</h3>
        <ul class="rows rows-tight">
            <li><span>목표 1년 세후 배당</span><span>${money(r.goalYear, market)}</span></li>
            <li><span>세금 전으로 되돌리면</span><span>${money(r.needGross, market)}</span></li>
            <li class="sub"><span>÷ (1 − 세율 ${(r.taxRate * 100).toFixed(1).replace(/\.0$/, '')}%)</span><span></span></li>
            <li><span>1년 주당 배당금</span><span>${price(r.annualDps, market)}</span></li>
            <li class="sub"><span>배당 수익률 (주가 ${price(r.price, market)})</span><span>${pct(r.yield)}</span></li>
            <li class="divider"><span>필요한 수량 (1주 단위 올림)</span><span>${won(r.qty)}주</span></li>
        </ul>

        <h3 class="sub-title">${won(r.qty)}주를 사면</h3>
        <ul class="rows rows-tight">
            <li><span>한 달 세후 배당</span><span>${money(r.monthlyNet, market)}${global && r.monthlyNetKrw !== null ? ` <small class="krw">${krw(r.monthlyNetKrw)}</small>` : ''}</span></li>
            <li><span>1년 세후 배당</span><span>${money(r.annualNet, market)}</span></li>
        </ul>
        ${cashBlock}
        ${notes(r)}
        <button type="button" class="save-btn">기록에 저장</button>`;
    el.querySelector('.save-btn').addEventListener('click', onSave);
}
