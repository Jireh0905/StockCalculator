/**
 * recover/chart.js — 앞으로의 값 변화 그래프 (SVG): 흐름 차트 / 일봉·주봉·월봉·년봉
 *
 * 세로: 값 (산 가격 = 100 = 본전), 가로: 시간 (거래일 → 달력 날짜)
 *
 * 두 보기가 같은 규칙을 써요.
 *   - 날짜 눈금: 달력 경계(주 시작·달·분기·해)에 맞춰요. 화면에서 글자가 겹치면 한 단계 굵은 경계로 바꿔요.
 *   - 줄 띠: 입력한 줄마다 번갈아 옅은 배경 띠. 띠가 넓으면 줄 번호를 위에 써요 (좁으면 띠 색으로만).
 *   - 가정 구간: "그 뒤로 매○ a%" 부분은 점선(흐름) / 속 빈 봉(봉)
 *
 * 흐름 차트(기본): 화면 폭에 맞춰 전체를 보여주고, 본전 아래는 파랑·위는 빨강 면으로 칠해요.
 *                 그래프 위를 누르거나 움직이면 세로선(십자선)이 따라가며 그날 값을 보여줘요.
 * 봉 차트: 봉 폭을 읽기 좋게 두고 옆으로 밀어서 봐요. 밀 때마다 보이는 봉에 맞춰 세로 눈금을 다시 잡아요.
 *
 * 실제 px 크기로 그려요 (글자 크기가 화면 폭에 따라 커졌다 작아졌다 하지 않게).
 * <path>의 d "M x,y L x,y …"는 MFC의 MoveTo/LineTo, <rect>는 CDC::Rectangle과 같아요.
 */
import { toCandles, unitOf } from './calculator.js';

const AXIS_W = 46;                 // 왼쪽 가격 눈금 폭
const H = 250;
const TOP = 30;                    // 위쪽: 줄 번호 자리
const BOTTOM = 26;                 // 아래쪽: 날짜 자리
const RIGHT = 14;
const PLOT_H = H - TOP - BOTTOM;
const MIN_GAP = 48;                // 날짜 글자 사이 최소 간격 (px)

/** 눈금 간격: 1, 2, 5 × 10^n 중 4칸 안팎이 되는 값 */
function niceStep(range) {
    const rough = range / 4;
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const n = rough / pow;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

const fmt = (n) => (Math.abs(n) >= 100 ? Math.round(n).toLocaleString('en-US') : n.toFixed(1).replace(/\.0$/, ''));
const pct = (v) => `${v - 100 >= 0 ? '+' : '−'}${fmt(Math.abs(v - 100))}%`;   // 값 → 산 가격 대비
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
const ymd = (d) => `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;

/** 날짜 하나: "2027년 1월 8일(금)" */
export const longDate = (d) => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일(${WEEKDAY[d.getDay()]})`;

/* ---------- 세로 눈금 (본전 대비 %) ---------- */

/**
 * @param {number} vMin @param {number} vMax - 보여줄 값 범위 (여백 넣기 전)
 * @param {number} x1 @param {number} x2 - 가로 눈금선을 그을 범위
 * @param {number} labelX - 가격 글자 오른쪽 끝 x
 */
function yAxis(vMin, vMax, x1, x2, labelX) {
    const pad = Math.max((vMax - vMin) * 0.1, 0.6);
    const lo = Math.max(vMin - pad, 0);
    const hi = vMax + pad;
    const y = (v) => TOP + PLOT_H - ((v - lo) / (hi - lo)) * PLOT_H;
    const step = niceStep(hi - lo);
    let grid = '';
    let labels = '';
    for (let d = Math.ceil((lo - 100) / step) * step; d <= hi - 100 + 1e-9; d += step) {
        const base = Math.abs(d) < 1e-9;
        grid += `<line class="grid-line" x1="${x1}" x2="${x2}" y1="${y(100 + d)}" y2="${y(100 + d)}"/>`;
        labels += `<text class="axis-label${base ? ' is-base' : ''}" x="${labelX}" y="${y(100 + d) + 4}" text-anchor="end">${base ? '본전' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}%`}</text>`;
    }
    return { y, lo, hi, grid, labels };
}

/* ---------- 날짜 눈금 (달력 경계) ---------- */

/** 촘촘한 것부터: 주 시작, 달, 분기, 해, 5년. 글자가 겹치지 않는 첫 단계를 써요 */
const monthLabel = (d) => (d.getMonth() === 0 ? `${d.getFullYear()}` : `${d.getMonth() + 1}월`);
const LEVELS = [
    { starts: (p, c) => c.getDay() < p.getDay() || c - p > 3 * 864e5, label: md },
    { starts: (p, c) => c.getMonth() !== p.getMonth(), label: monthLabel },
    { starts: (p, c) => c.getMonth() !== p.getMonth() && c.getMonth() % 3 === 0, label: monthLabel },
    { starts: (p, c) => c.getFullYear() !== p.getFullYear(), label: (d) => `${d.getFullYear()}` },
    { starts: (p, c) => c.getFullYear() !== p.getFullYear() && c.getFullYear() % 5 === 0, label: (d) => `${d.getFullYear()}` },
];

/**
 * @param {Date[]} dates - 거래일별 날짜
 * @param {number} last - 마지막 거래일
 * @param {(day: number) => number} xOf - 거래일 → x
 * @param {number} nowX - "지금" 글자 x (그 근처 눈금은 빼요)
 * @returns {string} 날짜 글자들
 */
function dateTicks(dates, last, xOf, nowX) {
    for (const lv of LEVELS) {
        const ticks = [];
        for (let d = 1; d <= last; d++) if (lv.starts(dates[d - 1], dates[d])) ticks.push(d);
        // 이웃한 눈금이 너무 가까우면 이 단계는 탈락 (달은 20~23거래일로 조금씩 달라서 15% 여유)
        if (ticks.some((d, i) => i > 0 && xOf(d) - xOf(ticks[i - 1]) < MIN_GAP * 0.85)) continue;
        return ticks
            .filter(d => xOf(d) - nowX >= 36)
            .map(d => {
                const strong = dates[d].getFullYear() !== dates[d - 1].getFullYear();
                return `<text class="axis-label${strong ? ' is-strong' : ''}" x="${xOf(d)}" y="${H - 8}" text-anchor="middle">${lv.label(dates[d])}</text>`;
            }).join('');
    }
    return '';
}

/* ---------- 줄 띠 ---------- */

/** 입력한 줄마다 번갈아 옅은 띠 + (넓으면) 줄 번호, 가정 구간 띠 */
function rowBands(r, xOf, last) {
    let rects = '';
    let labels = '';
    r.valid.forEach((s, k) => {
        const a = xOf(s.startDay);
        const b = xOf(s.endDay);
        rects += `<rect class="band ${k % 2 ? 'band-b' : 'band-a'}" x="${a}" y="${TOP}" width="${Math.max(b - a, 0.5)}" height="${PLOT_H}"/>`;
        if (b - a >= 16) labels += `<text class="band-label" x="${(a + b) / 2}" y="${TOP - 8}" text-anchor="middle">${s.no}</text>`;
    });
    if (r.projection && last > r.scenarioEnd) {
        const a = xOf(r.scenarioEnd);
        const b = xOf(last);
        rects += `<rect class="band band-project" x="${a}" y="${TOP}" width="${b - a}" height="${PLOT_H}"/>`;
        const text = b - a >= 110 ? `${r.projection.every} ${fmt(r.projection.after)}% 가정` : b - a >= 34 ? '가정' : '';
        if (text) labels += `<text class="band-label is-project" x="${a + 4}" y="${TOP - 8}">${text}</text>`;
    }
    return { rects, labels };
}

/* ---------- 글자 자리 잡기 (겹치지 않게) ---------- */

/** 글자 폭 어림: 한글은 약 10px, 숫자·기호는 약 6px (글자 크기 10px 기준) */
const textWidth = (s) => [...s].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? 10 : 6), 0);

/**
 * 점 옆 글자들을 차례로 놓아요. 후보 자리(오른쪽, 위, 아래, 왼쪽 …) 중
 * 그래프 안쪽이면서 이미 놓은 글자와 겹치지 않는 첫 자리를 골라요.
 * @param {Array<{ x: number, y: number, text: string, cls: string, prefer?: string[] }>} items
 * @param {{ left: number, right: number, top: number, bottom: number }} box - 글자가 들어가도 되는 범위
 */
function placeLabels(items, box) {
    const placed = [];
    const OFFSETS = {
        right: (w) => ({ x: 7, y: 4, anchor: 'start', bx: 7, bw: w }),
        'below-right': (w) => ({ x: 7, y: 16, anchor: 'start', bx: 7, bw: w }),
        'above-right': (w) => ({ x: 7, y: -8, anchor: 'start', bx: 7, bw: w }),
        above: (w) => ({ x: 0, y: -10, anchor: 'middle', bx: -w / 2, bw: w }),
        below: (w) => ({ x: 0, y: 18, anchor: 'middle', bx: -w / 2, bw: w }),
        left: (w) => ({ x: -7, y: 4, anchor: 'end', bx: -7 - w, bw: w }),
        'above-left': (w) => ({ x: -7, y: -8, anchor: 'end', bx: -7 - w, bw: w }),
        'below-left': (w) => ({ x: -7, y: 16, anchor: 'end', bx: -7 - w, bw: w }),
    };
    const ALL = ['right', 'above-right', 'below-right', 'above', 'below', 'left', 'above-left', 'below-left'];
    return items.map(it => {
        const w = textWidth(it.text);
        const order = [...(it.prefer ?? []), ...ALL];
        let pick = null;
        for (const key of order) {
            const o = OFFSETS[key](w);
            const r = { l: it.x + o.bx, r: it.x + o.bx + o.bw, t: it.y + o.y - 10, b: it.y + o.y + 2 };
            const inside = r.l >= box.left && r.r <= box.right && r.t >= box.top && r.b <= box.bottom;
            const free = placed.every(p => r.r < p.l || r.l > p.r || r.b < p.t || r.t > p.b);
            if (inside && free) { pick = { o, r }; break; }
        }
        if (!pick) {          // 어디에도 안 맞으면 오른쪽에 그대로 (드문 경우)
            const o = OFFSETS.right(w);
            pick = { o, r: { l: it.x + 7, r: it.x + 7 + w, t: it.y - 6, b: it.y + 6 } };
        }
        placed.push(pick.r);
        return `<text class="point-label ${it.cls}" x="${it.x + pick.o.x}" y="${it.y + pick.o.y}" text-anchor="${pick.o.anchor}">${it.text}</text>`;
    }).join('');
}

/* ---------- 흐름 차트 (기본) ---------- */

/**
 * @param {object} r - calculateRecovery() 결과
 * @param {number} width - 그릴 폭 (px)
 * @param {Date[]} dates - 거래일별 날짜
 * @returns {{ kind: 'flow', html: string, pick: (px: number) => object }}
 */
export function createFlowChart(r, width, dates) {
    const series = r.series;
    const last = series.length - 1;
    const maxDay = Math.max(last, 1);
    const lead = r.loss > 0 ? 36 : 0;                 // "산 때 → 지금" 여백
    const x0 = AXIS_W + lead;
    const x1 = width - RIGHT;
    const xOf = (d) => x0 + (d / maxDay) * (x1 - x0);

    const { y, grid, labels: yLabels } = yAxis(Math.min(...series, r.start, 100), Math.max(...series, r.start, 100), AXIS_W, x1, AXIS_W - 6);

    // 최저점 (지금보다 낮아지는 곳이 있으면)
    let minDay = 0;
    for (let d = 1; d <= last; d++) if (series[d] < series[minDay]) minDay = d;

    // 선·면에 쓸 점: 많으면 건너뛰되(최대 약 500개) 줄이 바뀌는 날·최저점·회복일은 꼭 넣어요
    const keep = new Set([0, r.scenarioEnd, last, minDay, r.recoveredDay ?? 0, ...r.valid.map(s => s.endDay)]);
    const every = Math.max(1, Math.ceil(series.length / 500));
    const pts = [];
    for (let d = 0; d <= last; d++) if (d % every === 0 || keep.has(d)) pts.push(d);
    const line = (a, b) => pts.filter(d => d >= a && d <= b).map((d, i) => `${i ? 'L' : 'M'}${xOf(d).toFixed(1)},${y(series[d]).toFixed(1)}`).join(' ');
    const baseY = y(100);
    const area = `M${xOf(0)},${baseY} ${pts.map(d => `L${xOf(d).toFixed(1)},${y(series[d]).toFixed(1)}`).join(' ')} L${xOf(last)},${baseY} Z`;

    const { rects, labels: bandLabels } = rowBands(r, xOf, last);

    // 주요 지점: 산 때, 지금, 최저, 본전 회복 — 점은 그대로, 글자는 겹치지 않는 자리에
    const points = [];
    const notes = [];
    if (r.loss > 0) {
        points.push(`<path class="seg-past" d="M${AXIS_W + 4},${baseY} L${x0},${y(r.start)}"/>`,
            `<circle class="dot is-base" cx="${AXIS_W + 4}" cy="${baseY}" r="3"/>`);
        notes.push({ x: AXIS_W + 4, y: baseY, text: '산 때', cls: 'is-base', prefer: ['above-right', 'below-right'] });
    }
    points.push(`<circle class="dot ${r.start < 100 ? 'is-down' : 'is-base'} is-now" cx="${x0}" cy="${y(r.start)}" r="4.5"/>`);
    // 최저점이 "지금" 바로 옆(40px 안)이면 글자 하나로 합쳐요: "지금 −25% → 최저 −29.5% (11/19)"
    const hasMin = minDay > 0 && series[minDay] < r.start - 1e-9;
    const mergeMin = hasMin && xOf(minDay) - x0 < 40;
    if (r.loss > 0 && !mergeMin) notes.push({ x: x0, y: y(r.start), text: `지금 −${fmt(r.loss)}%`, cls: 'is-down', prefer: ['below-right', 'right', 'above-right'] });
    if (r.recoveredDay > 0) {
        const rx = xOf(r.recoveredDay);
        points.push(`<circle class="dot is-up" cx="${rx}" cy="${baseY}" r="4"/>`);
        notes.push({ x: rx, y: baseY, text: `본전 회복 · ${ymd(dates[r.recoveredDay])}`, cls: 'is-up', prefer: ['above-left', 'above', 'above-right', 'below-left'] });
    }
    if (hasMin) {
        const mx = xOf(minDay);
        const text = mergeMin && r.loss > 0
            ? `지금 −${fmt(r.loss)}% → 최저 ${pct(series[minDay])} (${md(dates[minDay])})`
            : `최저 ${pct(series[minDay])} · ${md(dates[minDay])}`;
        points.push(`<circle class="dot is-down" cx="${mx}" cy="${y(series[minDay])}" r="3.5"/>`);
        notes.push({ x: mx, y: y(series[minDay]), text, cls: 'is-down', prefer: ['right', 'below-right', 'above-right', 'below', 'left'] });
    }
    if (!(r.recoveredDay > 0) && r.projection && !r.projection.reached) {
        points.push(`<text class="point-label is-down" x="${x1}" y="${TOP + 12}" text-anchor="end">50년까지만 그렸어요</text>`);
    }
    points.push(placeLabels(notes, { left: AXIS_W + 2, right: x1, top: TOP + 2, bottom: TOP + PLOT_H - 2 }));

    const nowLabel = `<text class="axis-label is-base" x="${x0}" y="${H - 8}" text-anchor="${lead ? 'middle' : 'start'}">지금</text>`;

    const html = `
        <svg class="chart flow-chart" width="${width}" height="${H}" role="img" aria-label="산 때부터 지금, 앞으로의 값 변화 그래프">
            <defs>
                <clipPath id="rc-above"><rect x="0" y="0" width="${width}" height="${baseY}"/></clipPath>
                <clipPath id="rc-below"><rect x="0" y="${baseY}" width="${width}" height="${H - baseY}"/></clipPath>
            </defs>
            ${rects}
            ${grid}
            <path class="area-up" clip-path="url(#rc-above)" d="${area}"/>
            <path class="area-down" clip-path="url(#rc-below)" d="${area}"/>
            <line class="base-line" x1="${AXIS_W}" x2="${x1}" y1="${baseY}" y2="${baseY}"/>
            ${r.scenarioEnd > 0 ? `<path class="seg-scenario" d="${line(0, r.scenarioEnd)}"/>` : ''}
            ${last > r.scenarioEnd ? `<path class="seg-project" d="${line(r.scenarioEnd, last)}"/>` : ''}
            ${points.join('')}
            ${bandLabels}
            ${yLabels}
            ${nowLabel}
            ${dateTicks(dates, last, xOf, x0)}
            <g class="cross" data-cross style="display:none">
                <line class="cross-line" x1="0" x2="0" y1="${TOP}" y2="${TOP + PLOT_H}"/>
                <circle class="cross-dot" cx="0" cy="0" r="4"/>
            </g>
            <rect class="cross-area" data-cross-area x="${x0}" y="${TOP}" width="${x1 - x0}" height="${PLOT_H}"/>
        </svg>`;

    return {
        kind: 'flow',
        html,
        /** 그래프 안 x(px) → 그날의 값 (십자선용) */
        pick(px) {
            const day = Math.min(last, Math.max(0, Math.round(((px - x0) / (x1 - x0)) * maxDay)));
            return { day, x: xOf(day), y: y(series[day]), value: series[day], date: dates[day], projected: day > r.scenarioEnd };
        },
    };
}

/* ---------- 봉 차트 ---------- */

const SLOT = { min: 14, max: 60 };  // 봉 하나가 차지하는 폭 (px). 봉이 적으면 넓혀서 화면을 채워요

/** 봉을 눌렀을 때 그 봉의 기간 글자 */
function periodText(from, to, unit) {
    if (unit === 'day') return longDate(to);
    return `${ymd(from)} ~ ${unit === 'year' ? ymd(to) : md(to)}`;
}

/**
 * 봉 차트 만들기. 옆으로 밀 때마다 "지금 화면에 보이는 봉"에 맞춰 세로 눈금을 다시 잡아요 (증권사 앱처럼).
 *
 * @param {object} r - calculateRecovery() 결과
 * @param {string} unit - 'day' | 'week' | 'month' | 'year'
 * @param {number} width - 그래프를 그릴 수 있는 폭 (px, 카드 안쪽 폭)
 * @param {Date[]} dates - 거래일별 날짜
 * @returns {{ kind: 'candle', html: string, candles: Array, scrollable: boolean, slot: number, size: number,
 *             redraw: (scrollLeft: number, viewWidth: number) => { plot: string, axis: string },
 *             period: (candle) => string }}
 */
export function createCandleChart(r, unit, width, dates) {
    const candles = toCandles(r.series, unit, r.scenarioEnd);
    const n = Math.max(candles.length, 1);
    const size = unitOf(unit).days;
    const last = r.series.length - 1;
    const room = Math.max(width - AXIS_W - RIGHT, 120);           // 스크롤 없이 쓸 수 있는 폭
    const slot = Math.min(Math.max(room / n, SLOT.min), SLOT.max);
    const svgW = slot * n + RIGHT;
    const bodyW = Math.max(Math.min(slot * 0.62, 26), 3);
    const cx = (i) => slot * i + slot / 2;
    const xDay = (d) => (d / size) * slot;                         // 지금부터 d거래일 지점

    // 줄 띠와 날짜는 세로 눈금과 상관없어서 한 번만 만들어요
    const { rects, labels: bandLabels } = rowBands(r, xDay, last);
    const ticks = `<text class="axis-label is-base" x="2" y="${H - 8}" text-anchor="start">지금</text>` + dateTicks(dates, last, xDay, 0);

    /**
     * from~to 번째 봉이 보일 때의 그래프 안쪽(plot)과 왼쪽 눈금(axis)
     * @param {number} right - 지금 보이는 오른쪽 끝 (px). 오른쪽에 붙는 글자가 잘리지 않게
     */
    function draw(from, to, right) {
        const shown = candles.slice(from, to + 1);
        // 세로 범위: 보이는 봉의 고가·저가 (+ 처음 화면이면 지금 값). 본전이 가까우면 함께 보이게
        let vMin = Math.min(...shown.map(c => c.low), from === 0 ? r.start : Infinity);
        let vMax = Math.max(...shown.map(c => c.high), from === 0 ? r.start : -Infinity);
        const span = Math.max(vMax - vMin, 2);
        if (100 > vMax && 100 - vMax <= span * 0.6) vMax = 100;
        if (100 < vMin && vMin - 100 <= span * 0.6) vMin = 100;
        const { y, lo, hi, grid, labels } = yAxis(vMin, vMax, 0, svgW, AXIS_W - 6);

        // 본전 가로선: 화면 안이면 점선, 밖이면 "본전까지 +X% ↑"
        let axis = labels;
        let base = '';
        if (100 >= lo && 100 <= hi) {
            base = `<line class="base-line" x1="0" x2="${svgW}" y1="${y(100)}" y2="${y(100)}"/>`;
        } else {
            const above = 100 > hi;
            axis += `<text class="axis-label is-base" x="${AXIS_W - 6}" y="${above ? TOP - 2 : TOP + PLOT_H + 12}" text-anchor="end">본전${above ? '↑' : '↓'}</text>`;
            const close = shown[shown.length - 1].close;
            if (above && close > 0) {
                base = `<text class="offscreen-base" x="${right - 6}" y="${TOP + 12}" text-anchor="end">본전까지 +${fmt((100 / close - 1) * 100)}% ↑</text>`;
            }
        }

        // 봉: 보이는 것 + 양옆 20개만 그려요 (봉이 많아도 가볍게)
        let bars = '';
        for (let i = Math.max(0, from - 20); i <= Math.min(n - 1, to + 20); i++) {
            const c = candles[i];
            const up = c.close >= c.open;
            const top = y(Math.max(c.open, c.close));
            const height = Math.max(Math.abs(y(c.open) - y(c.close)), 1.5);
            bars += `
                <g class="candle ${up ? 'is-up' : 'is-down'}${c.projected ? ' is-project' : ''}" data-candle="${i}">
                    <rect class="candle-hit" x="${slot * i}" y="${TOP - 4}" width="${slot}" height="${PLOT_H + 8}"/>
                    <line class="wick" x1="${cx(i)}" x2="${cx(i)}" y1="${y(c.high)}" y2="${y(c.low)}"/>
                    <rect class="body" x="${cx(i) - bodyW / 2}" y="${top}" width="${bodyW}" height="${height}"/>
                </g>`;
        }

        const now = from === 0 ? `<circle class="dot is-down is-now" cx="1" cy="${y(r.start)}" r="4"/>` : '';
        let reach = '';
        if (r.recoveredDay > 0) {
            const i = Math.min(Math.floor((r.recoveredDay - 1) / size), n - 1);
            if (i >= from && i <= to) {
                reach = `<text class="point-label is-up" x="${cx(i)}" y="${Math.max(y(Math.max(candles[i].high, 100)) - 8, TOP + 10)}" text-anchor="${cx(i) > right - 60 ? 'end' : 'middle'}">본전 회복</text>`;
            }
        } else if (r.projection && !r.projection.reached && to === n - 1) {
            reach = `<text class="point-label is-down" x="${svgW - RIGHT}" y="${TOP + 12}" text-anchor="end">50년까지만 그렸어요</text>`;
        }

        return { plot: rects + grid + base + bars + now + reach + bandLabels + ticks, axis };
    }

    /** 스크롤 위치 → 보이는 봉 번호 범위로 다시 그리기 */
    function redraw(scrollLeft, viewWidth) {
        const from = Math.max(0, Math.floor(scrollLeft / slot));
        const to = Math.min(n - 1, Math.max(from, Math.ceil((scrollLeft + viewWidth) / slot) - 1));
        return draw(from, to, Math.min(scrollLeft + viewWidth, svgW - RIGHT));
    }

    const first = redraw(0, room);
    const html = `
        <div class="candle-frame">
            <svg class="candle-axis" width="${AXIS_W}" height="${H}" aria-hidden="true" data-candle-axis>${first.axis}</svg>
            <div class="candle-scroll" data-candle-scroll>
                <svg class="chart candle-chart" width="${svgW}" height="${H}" role="img" aria-label="${unitOf(unit).candle} 차트, 봉 ${n}개" data-candle-plot>${first.plot}</svg>
            </div>
        </div>`;

    return {
        kind: 'candle',
        html,
        candles,
        slot,
        size,
        scrollable: svgW > room + RIGHT + 1,
        redraw,
        period: (c) => periodText(dates[Math.min(c.from + 1, last)], dates[c.to], unit),
    };
}
