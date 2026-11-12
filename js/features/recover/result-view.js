/**
 * recover/result-view.js — 손실 회복 계산기의 결과 카드 (계산은 하지 않고 보여주기만)
 *
 * 그래프 보기(흐름/일봉/주봉/월봉/년봉) 버튼, 십자선, 봉 누르기·스크롤은 index.js가 연결해요.
 */
import { createFlowChart, createCandleChart } from './chart.js';
import { UNITS, unitOf, formatDays, candleCount, candleOk, MAX_CANDLES, MIN_CANDLES, aboutDate, tradingDates, needGain } from './calculator.js';

/** 숫자를 소수 digits자리로, 큰 값은 쉼표도: 99900 → "99,900.00" */
const fixed = (n, digits = 2) => n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
/** 부호 붙인 비율: −4 → "−4.00%" */
const sp = (n, digits = 2) => {
    const r = Math.round(n * 10 ** digits);
    return `${r > 0 ? '+' : r < 0 ? '−' : ''}${fixed(Math.abs(n), digits)}%`;
};
const lossText = (n) => `${n.toFixed(2).replace(/\.?0+$/, '')}%`;
const move = (signed) => `${signed > 0 ? '▲' : '▼'} ${fixed(Math.abs(signed), signed % 1 ? 1 : 0)}%`;

/** 시나리오 요약 (몇 뒤 어디인지, 본전 회복 시점, 그 뒤 매○ a%면 얼마나 더) */
function scenarioRows(r, today) {
    const items = [];
    if (r.scenarioDays > 0) {
        const cls = r.final >= 100 - 1e-9 ? 'tone-up' : 'tone-down';
        items.push(`<li><span>${formatDays(r.scenarioDays)} 뒤</span><span class="${cls}">본전보다 ${sp(r.final - 100)}</span></li>`);
        if (r.recoveredInScenario) {
            items.push(`<li class="sub"><span>본전 회복</span><span>약 ${formatDays(r.recoveredDay)} · ${aboutDate(today, r.recoveredDay)}</span></li>`);
        } else if (r.wiped) {
            items.push(`<li class="sub"><span>다 잃어서</span><span class="tone-warn">회복할 수 없어요</span></li>`);
        } else if (r.final < 100) {
            items.push(`<li class="sub"><span>그때 본전까지 남은 상승률</span><span>+${fixed(r.finalNeed)}%</span></li>`);
        }
    }
    if (r.projection) {
        const p = r.projection;
        items.push(`<li class="${r.scenarioDays > 0 ? 'divider' : ''}"><span>${r.scenarioDays > 0 ? '그 뒤로 ' : ''}${p.every} ${fixed(p.after, p.after % 1 ? 1 : 0)}%씩 오르면</span><span>약 ${formatDays(p.moreDays)} 더</span></li>`);
        items.push(p.reached
            ? `<li class="sub"><span>지금부터 본전까지</span><span>약 ${formatDays(p.totalDays)} · ${aboutDate(today, p.totalDays)}</span></li>`
            : `<li class="sub"><span>50년 안에는</span><span class="tone-warn">본전에 못 닿아요</span></li>`);
    }
    return items.join('');
}

/** 등락을 단순히 더한 값과 실제(곱한 값)가 다르면 한 줄로 설명 */
function sumNote(r) {
    if (r.valid.length < 2 || Math.abs(r.sum - r.finalFromNow) < 0.005) return '';
    const steps = r.valid.map(s => sp(s.signed, s.signed % 1 ? 1 : 0)).join(' → ');
    return `<p class="note">${steps}: 단순히 더하면 ${sp(r.sum)}이지만, 실제로는 지금보다 <b>${sp(r.finalFromNow)}</b>예요.
        내린 뒤에는 더 작은 금액에서 오르기 때문에, 같은 비율로 오르내려도 손해예요.</p>`;
}

/** 줄별 표: 번 | 기간 | 등락 | 산 가격 대비 | 본전까지 */
function stepTable(r) {
    if (!r.valid.length) return '';
    const rows = r.valid.map(s => `
        <tr class="${r.recoveredInScenario && r.recoveredDay > s.startDay && r.recoveredDay <= s.endDay ? 'is-selected' : ''}">
            <th>${s.no}번</th>
            <td>${s.dur}${s.unitLabel}<small>~${formatDays(s.endDay)}</small></td>
            <td class="${s.signed > 0 ? 'tone-up' : 'tone-down'}">${move(s.signed)}</td>
            <td class="${s.fromCost >= -1e-9 ? 'tone-up' : 'tone-down'}">${sp(s.fromCost, 1)}</td>
            <td>${s.needMore === null ? '회복 불가' : s.needMore > 0 ? `+${fixed(s.needMore, 1)}%` : '회복'}</td>
        </tr>`).join('');
    const table = `
        <table class="year-table step-table">
            <thead><tr><th>번</th><th>기간</th><th>등락</th><th>산 가격 대비</th><th>본전까지</th></tr></thead>
            <tbody>
                <tr><th>지금</th><td></td><td></td><td class="${r.loss > 0 ? 'tone-down' : ''}">${sp(-r.loss, 1)}</td><td>${r.loss > 0 ? `+${fixed(r.need, 1)}%` : '본전'}</td></tr>
                ${rows}
            </tbody>
        </table>`;
    // 줄이 많으면(8줄 넘게) 접어두고 눌러서 펼쳐요
    return r.valid.length > 8
        ? `<details class="breakdown step-fold"><summary>줄별 결과 ${r.valid.length}줄 보기</summary>${table}</details>`
        : `<h3 class="sub-title">줄별 결과</h3>${table}`;
}

/* ---------- 손실률별 필요한 상승률 (직접 넣어 보는 표) ---------- */

export const REF_MIN = 1;          // 넣을 수 있는 손실률 범위 (%)
export const REF_MAX = 99.99;

/** 손실률 글자: 33.17 → "33.17", 30 → "30" */
const lossNum = (n) => n.toFixed(2).replace(/\.?0+$/, '');

/**
 * 표 줄들: 넣은 손실률 하나 + 위아래로 1%씩 5개 (소수는 떼고 정수로)
 *   33.17 → 28, 29, 30, 31, 32, [33.17], 34, 35, 36, 37, 38
 *   1~99.99% 밖의 줄은 빼요.
 * @param {number} center - 넣은 손실률 (%, 양수)
 */
export function refRowsHtml(center) {
    if (!(center >= REF_MIN && center <= REF_MAX)) {
        return `<tr><td colspan="2" class="ref-empty">손실률을 ${REF_MIN}~${REF_MAX}% 사이로 넣어 주세요</td></tr>`;
    }
    const base = Math.floor(center);
    const list = [];
    for (let k = -5; k <= 5; k++) {
        const v = k === 0 ? center : base + k;
        if (k !== 0 && (v < REF_MIN || v > REF_MAX)) continue;
        list.push({ v, mine: k === 0 });
    }
    return list.map(({ v, mine }) => `
        <tr class="${mine ? 'is-selected' : ''}"><th>−${lossNum(v)}%</th><td>+${fixed(needGain(v))}%</td></tr>`).join('');
}

/**
 * 손실률별 필요한 상승률 (접어두는 표). 입력칸에 보고 싶은 손실률을 넣으면 그 근처 11줄을 보여줘요.
 * 입력칸은 결과 전체를 다시 그리지 않고 표만 바꿔요 (index.js가 연결). 그래서 name이 없어요.
 * @param {{ value: number, open: boolean }} ref - 처음 값(보통 지금 손실률)과 펼침 상태
 */
function refTable(ref) {
    return `
        <details class="breakdown ref-fold" data-ref-fold ${ref.open ? 'open' : ''}>
            <summary>손실률별 필요한 상승률 보기</summary>
            <div class="ref-input">
                <span class="field-label">손실률</span>
                <span class="input-wrap prefix"><span class="prefix-unit">−</span><input data-ref-loss inputmode="decimal" value="${lossNum(ref.value)}" autocomplete="off" aria-label="손실률 (%)"><span class="unit">%</span></span>
                <span class="hint">${REF_MIN}~${REF_MAX}% · 넣은 값 위아래로 1%씩 5줄</span>
            </div>
            <table class="ref-table">
                <thead><tr><th>손실</th><th>본전까지 필요한 상승</th></tr></thead>
                <tbody data-ref-rows>${refRowsHtml(ref.value)}</tbody>
            </table>
        </details>`;
}

/**
 * 그래프 보기 버튼: [흐름 | 일봉 | 주봉 | 월봉 | 년봉]
 * 봉이 너무 많거나(1,500개 초과) 너무 적은(3개 미만) 단위는 누를 수 없게 하고 이유를 알려줘요.
 */
function viewToggle(days, view) {
    const opts = [{ value: 'flow', label: '흐름', ok: true }].concat(Object.entries(UNITS).map(([key, u]) => {
        const count = candleCount(days, key);
        const why = count > MAX_CANDLES ? `봉이 ${count.toLocaleString()}개라 너무 많아요` : count < MIN_CANDLES ? `기간이 짧아서 ${u.candle}이 ${count}개뿐이에요` : '';
        return { value: key, label: u.candle, ok: candleOk(days, key), why };
    }));
    return `
        <div class="segmented small cols-5 chart-views" role="radiogroup" aria-label="그래프 보기">
            ${opts.map(o => `<button type="button" role="radio" data-view="${o.value}" aria-checked="${o.value === view}" ${o.ok ? '' : `disabled title="${o.why}"`}>${o.label}</button>`).join('')}
        </div>`;
}

/** 그래프 위 설명 줄의 처음 글자 */
function defaultCaption(chart, view) {
    if (chart.kind === 'flow') return '그래프 위를 누르거나 움직이면 그날 값을 보여줘요';
    return `${unitOf(view).candle} ${chart.candles.length}개 · 봉을 누르면 시가·종가를 보여줘요${chart.scrollable ? '<span>옆으로 밀면 뒤쪽도 볼 수 있어요 →</span>' : ''}`;
}

/**
 * @param {HTMLElement} el
 * @param {object | null} r - calculateRecovery() 결과
 * @param {string} view - 'flow' | 'day' | 'week' | 'month' | 'year' (index.js가 정한 지금 보기)
 * @param {{ onSave: Function, today: Date, ref?: { value: number | null, open: boolean } }} options
 *   today: 지금(오늘). 날짜 계산 기준 / ref: 손실률별 표의 입력값(없으면 지금 손실률)과 펼침 상태
 * @returns {object | null} 그래프 객체 (흐름: 십자선용 pick / 봉: 스크롤·봉 누르기용), 그래프가 없으면 null
 */
export function renderResult(el, r, view, { onSave, today, ref }) {
    // 그래프는 실제 px로 그려서, 카드 안쪽 폭을 재서 넘겨줘요 (좌우 여백 20px씩)
    const width = Math.max(el.clientWidth - 40, 260);
    el.className = 'card result-card';
    if (!r) {
        el.innerHTML = `<div class="result-empty"><span class="icon">📉</span>지금 손실률이나 앞으로의 오르내림을 입력하면<br>본전까지 얼마나 걸리는지 보여줘요</div>`;
        return null;
    }
    if (r.status === 'total') {
        el.innerHTML = `
            <div class="result-label">본전까지 필요한 상승률</div>
            <div class="result-amount result-amount-text">회복할 수 없어요</div>
            <p class="note">100% 손실이면 남은 돈이 0이라, 몇 %가 올라도 0이에요.</p>`;
        return null;
    }

    const days = r.series.length - 1;
    // 맨 위 큰 숫자: 손실이 있으면 "지금 본전까지 필요한 상승률", 본전에서 시작했으면 "최종 등락률"
    const head = r.loss > 0
        ? `<div class="result-label">지금 본전까지 필요한 상승률</div>
           <div class="result-amount" style="color:var(--up)">+${fixed(r.need)}<small>%</small></div>
           <p class="lead">${lossText(r.loss)} 떨어지면, 원래대로 돌아가려면 <b>${lossText(r.loss).replace('%', '')}%가 아니라 ${fixed(r.need)}%</b> 올라야 해요.</p>`
        : `<div class="result-label">${formatDays(r.scenarioDays)} 뒤 등락률</div>
           <div class="result-amount ${r.final >= 100 ? '' : 'tone-down-text'}">${r.wiped ? '−100' : sp(r.final - 100).replace('%', '')}<small>%</small></div>
           <p class="lead">본전(100)에서 시작해 ${formatDays(r.scenarioDays)} 뒤 ${r.wiped ? '0' : fixed(r.final)}이 돼요.</p>`;

    const summary = scenarioRows(r, today);
    const skipped = r.rows.filter(s => s.status === 'over').map(s => `${s.no}번`);

    // 그래프: 거래일별 날짜를 한 번 만들어 두 보기가 같이 써요
    let chart = null;
    if (days > 0) {
        const dates = tradingDates(today, days);
        chart = view === 'flow' ? createFlowChart(r, width, dates) : createCandleChart(r, view, width, dates);
    }

    const legend = !chart ? '' : chart.kind === 'flow'
        ? `<span><i class="lg-area-down"></i>본전 아래</span><span><i class="lg-area-up"></i>본전 위</span>
           ${r.projection ? `<span><i class="lg-project"></i>${r.projection.every} 가정</span>` : ''}
           ${r.valid.length ? '<span><i class="lg-band"></i>입력한 줄 (번호)</span>' : ''}
           <span><i class="lg-base"></i>본전</span>`
        : `<span><i class="lg-candle-up"></i>오른 봉</span><span><i class="lg-candle-down"></i>내린 봉</span>
           ${r.projection ? `<span><i class="lg-candle-project"></i>${r.projection.every} 가정</span>` : ''}
           ${r.valid.length ? '<span><i class="lg-band"></i>입력한 줄 (번호)</span>' : ''}
           <span><i class="lg-base"></i>본전</span>`;

    el.innerHTML = `
        ${head}
        ${summary ? `<ul class="rows rows-tight">${summary}</ul>` : ''}

        <h3 class="sub-title">앞으로의 흐름 <span class="sub-title-note">산 가격 = 본전 · 오늘부터 거래일</span></h3>
        ${chart ? `
            ${viewToggle(days, view)}
            <div class="chart-caption" data-caption>${defaultCaption(chart, view)}</div>
            <div class="chart-wrap" data-chart>${chart.html}</div>
            <div class="chart-legend">${legend}</div>`
        : '<p class="note">"앞으로 오르고 내리면"에 줄을 넣거나 "그 뒤로"를 넣으면 본전까지의 흐름을 그래프로 보여줘요 (흐름·일봉·주봉·월봉·년봉).</p>'}
        ${stepTable(r)}
        ${skipped.length ? `<p class="note">${skipped.join('·')}은 100%보다 많이 내릴 수 없어서 빼고 계산했어요.</p>` : ''}
        ${r.cut ? '<p class="note">50년이 넘는 부분은 잘라서 계산했어요.</p>' : ''}
        ${sumNote(r)}
        ${refTable({ value: ref?.value ?? (r.loss > 0 ? r.loss : 30), open: !!ref?.open })}
        <p class="note">1주 = 5거래일, 1달 = 21거래일, 1년 = 252거래일로 계산하고, 한 줄 안에서는 매일 같은 비율로 움직인다고 봐요.
            날짜는 오늘부터 주말과 공휴일 몫을 빼고 센 예상 날짜예요. 수수료·세금은 넣지 않았어요.</p>
        <button type="button" class="save-btn">기록에 저장</button>`;
    el.querySelector('.save-btn').addEventListener('click', onSave);
    if (chart) chart.defaultCaption = defaultCaption(chart, view);
    return chart;
}
