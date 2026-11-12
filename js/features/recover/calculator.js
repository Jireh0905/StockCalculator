/**
 * recover/calculator.js — 손실 회복 계산 (화면과 무관한 순수 함수)
 *
 * 산 가격을 100으로 보고, "지금 떨어진 곳"에서 출발해 앞으로 오르고 내리는 시나리오를 따라가요.
 *   지금 = 100 × (1 − 손실률),  본전 = 100으로 돌아오는 것
 *
 * 기간은 거래일(주식 시장이 열리는 날)로 바꿔서 이어 붙여요.
 *   1주 = 5거래일, 1달 = 21거래일, 1년 = 252거래일 (주말·휴일 제외)
 * 한 줄 안에서는 그 기간 동안 매일 같은 비율로 움직인다고 봐요.
 *   예) 3일 동안 −5%  →  하루에 (0.95)^(1/3) − 1 ≈ −1.7%씩
 * 이렇게 하루 단위 값을 만들어 두면, 일봉·주봉·월봉·년봉은 그 값을 기간별로 묶기만 하면 돼요.
 *
 * 손실과 회복은 비대칭이에요: 필요한 상승률 = 손실률 ÷ (1 − 손실률)  (−30% → +42.86%)
 * %만 다뤄서 국내/해외 구분이 없고, 수수료·세금은 넣지 않아요.
 */

/** 시간 단위: 거래일 수와 글자 */
export const UNITS = {
    day: { days: 1, label: '일', every: '매일', candle: '일봉', nth: '일째' },
    week: { days: 5, label: '주', every: '매주', candle: '주봉', nth: '주차' },
    month: { days: 21, label: '달', every: '매달', candle: '월봉', nth: '달째' },
    year: { days: 252, label: '년', every: '매년', candle: '년봉', nth: '년차' },
};
export const unitOf = (u) => UNITS[u] ?? UNITS.year;

/** 손실률(%) → 본전까지 필요한 상승률(%) */
export const needGain = (lossPct) => lossPct / (100 - lossPct) * 100;

/** 값(산 가격 = 100) → 본전까지 필요한 상승률(%). 이미 본전 위면 0, 다 잃었으면(0) null = 회복 불가 */
export const needFrom = (value) => (value >= 100 ? 0 : value <= 0 ? null : (100 / value - 1) * 100);

/** 최대 50년(거래일)까지만 계산해요 */
export const MAX_DAYS = 252 * 50;

/**
 * 거래일 수 → 읽기 쉬운 기간
 *   한 달(21거래일) 이상: 년 + 개월 (개월은 반올림)   340 → "1년 4개월", 104 → "5개월"
 *   한 달 미만:          주 + 일                    13 → "2주 3일"
 */
export function formatDays(days) {
    const d = Math.round(days);
    if (d <= 0) return '0일';
    if (d < 21) {
        const w = Math.floor(d / 5);
        const rest = d - w * 5;
        return [w && `${w}주`, rest && `${rest}일`].filter(Boolean).join(' ');
    }
    let y = Math.floor(d / 252);
    let m = Math.round((d - y * 252) / 21);
    if (m === 12) { y += 1; m = 0; }
    return [y && `${y}년`, m && `${m}개월`].filter(Boolean).join(' ');
}

/**
 * @param {{ loss: number, steps: Array<{ dur: number, unit: string, dir: 'up' | 'down', pct: number }>,
 *           after: number, afterUnit: string }} input
 *   loss 지금 손실률(%, 0이면 본전에서 출발), steps 앞으로의 오르내림 (기간·단위·방향·비율),
 *   after 그 뒤로 기간마다 오르는 비율(%, 선택), afterUnit 그 기간 단위
 * @returns 손실률도 등락도 없으면 null. status: 'ok' | 'total'(100% 손실)
 */
export function calculateRecovery({ loss, steps, after, afterUnit }) {
    const lossPct = loss > 0 ? loss : 0;
    if (lossPct >= 100) return { status: 'total', loss: lossPct };

    const start = 100 - lossPct;
    const series = [start];          // 하루마다의 값. series[0] = 지금
    let value = start;
    let factor = 1;                  // 지금부터의 누적 배수
    let sum = 0;                     // 등락률을 단순히 더한 값 (비교용)
    let cut = false;                 // 50년을 넘어서 잘랐는지

    const rows = steps.map((s, i) => {
        const u = unitOf(s.unit);
        const dur = s.dur > 0 ? Math.floor(s.dur) : 1;
        const row = { no: i + 1, dir: s.dir, pct: s.pct, dur, unit: s.unit, unitLabel: u.label };
        if (!(s.pct > 0)) return { ...row, status: 'empty' };
        if (s.dir === 'down' && s.pct > 100) return { ...row, status: 'over' }; // 100%보다 많이 내릴 수는 없어요
        if (cut) return { ...row, status: 'cut' };

        const signed = s.dir === 'down' ? -s.pct : s.pct;
        const startDay = series.length - 1;
        let days = dur * u.days;
        if (startDay + days > MAX_DAYS) { days = MAX_DAYS - startDay; cut = true; }
        // 하루 비율: 기간 전체 배수를 날 수로 나눠 매일 같은 비율로 (−100%면 마지막 날 0)
        const total = 1 + signed / 100;
        const daily = Math.pow(Math.max(total, 0), 1 / days);
        const stepStart = value;
        for (let d = 1; d <= days; d++) {
            // −100%(다 잃음)은 매일 같은 비율로 0이 될 수 없어서, 그 기간 동안 곧게 0까지 내려가게 그려요
            value = total > 0 ? value * daily : stepStart * (1 - d / days);
            series.push(value);
        }
        factor *= total;
        value = start * factor;           // 소수 오차가 쌓이지 않게 기간 끝 값은 곱한 값으로 맞춰요
        series[series.length - 1] = value;
        sum += signed;
        return {
            ...row,
            status: 'ok',
            signed,
            startDay,
            endDay: series.length - 1,      // 이 줄이 끝나는 날 (지금부터 거래일)
            value,
            fromNow: (factor - 1) * 100,
            fromCost: value - 100,
            needMore: needFrom(value),
        };
    });
    const valid = rows.filter(r => r.status === 'ok');
    if (lossPct === 0 && valid.length === 0) return null;
    const scenarioEnd = series.length - 1;      // 시나리오가 끝나는 날
    const finalValue = value;

    // 그 뒤로 기간마다 after%씩: 본전까지 며칠 더 걸리는지 + 그래프용 하루 값 이어 붙이기
    let projection = null;
    if (after > 0 && value > 0 && value < 100 - 1e-9) {
        const u = unitOf(afterUnit);
        const periods = Math.log(100 / value) / Math.log(1 + after / 100);
        const moreDays = periods * u.days;
        const daily = Math.pow(1 + after / 100, 1 / u.days);
        let v = value;
        while (v < 100 - 1e-9 && series.length - 1 < MAX_DAYS) {
            v = Math.min(v * daily, 100);
            series.push(v);
        }
        projection = { after, unit: afterUnit, every: u.every, moreDays, totalDays: scenarioEnd + moreDays, reached: v >= 100 - 1e-9 };
    }

    // 처음으로 본전(100) 이상이 된 날 (지금이 이미 본전이면 0)
    const recoveredDay = series.findIndex(v => v >= 100 - 1e-9);

    return {
        status: 'ok',
        loss: lossPct,
        start,
        need: needGain(lossPct),
        rows,
        valid,
        series,                                  // 하루마다의 값 (그래프·봉 차트용)
        scenarioEnd,
        scenarioDays: scenarioEnd,
        final: finalValue,                       // 시나리오 끝 값
        finalFromNow: (factor - 1) * 100,
        sum,
        finalNeed: needFrom(finalValue),
        recoveredDay: recoveredDay >= 0 ? recoveredDay : null,
        recoveredInScenario: recoveredDay > 0 && recoveredDay <= scenarioEnd,
        wiped: finalValue <= 0,
        cut,
        projection,
    };
}

/* ---------- 날짜 (지금 = 오늘) ---------- */

/**
 * 오늘에서 n거래일 뒤의 날짜. 토·일은 건너뛰어요.
 * 평일은 1년에 약 261일인데 거래일은 252일이라(공휴일), 252거래일마다 평일 9일을 더 건너뛰어요.
 * 그래야 "1년(252거래일) 뒤"가 달력으로도 1년 뒤 같은 날 근처가 돼요.
 * @param {Date} base - 오늘
 * @param {number} n - 거래일 수 (소수면 반올림)
 */
export function tradingDate(base, n) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    const days = Math.round(n);
    let left = days + Math.floor(days / 28);   // 건너뛸 평일 수: 28거래일마다 공휴일 1일 (= 252일마다 9일)
    while (left > 0) {
        d.setDate(d.getDate() + 1);
        if (d.getDay() !== 0 && d.getDay() !== 6) left--;
    }
    return d;
}

/**
 * 0~count거래일의 날짜를 한꺼번에 (그래프 눈금·십자선용). tradingDate와 같은 규칙이에요.
 * 하나씩 tradingDate를 부르면 50년치(12,600일)에서 너무 느려서, 평일 목록을 한 번 만들고 골라 써요.
 * @returns {Date[]} dates[0] = 오늘, dates[n] = n거래일 뒤
 */
export function tradingDates(base, count) {
    const first = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    const weekdays = [first];
    const d = new Date(first);
    const need = count + Math.floor(count / 28);
    while (weekdays.length <= need) {
        d.setDate(d.getDate() + 1);
        if (d.getDay() !== 0 && d.getDay() !== 6) weekdays.push(new Date(d));
    }
    return Array.from({ length: count + 1 }, (_, i) => weekdays[i + Math.floor(i / 28)]);
}

/** "2027년 5월쯤" (3개월 안쪽이면 "2027년 1월 12일쯤") */
export function aboutDate(base, n) {
    const d = tradingDate(base, n);
    return n < 63
        ? `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일쯤`
        : `${d.getFullYear()}년 ${d.getMonth() + 1}월쯤`;
}

/* ---------- 봉 차트 ---------- */

/**
 * 봉은 옆으로 밀어 보는(가로 스크롤) 차트라 많이 그릴 수 있어요.
 * 다만 너무 많으면 화면이 무거워져서 이만큼까지만 (일봉 약 6년, 주봉 약 30년)
 */
export const MAX_CANDLES = 1500;

/** 봉이 이보다 적으면 그 단위는 막아요 (봉 2개로는 차트가 의미 없어서) */
export const MIN_CANDLES = 3;

/** 이 봉 단위를 쓸 수 있는지 (너무 많지도 적지도 않게) */
export const candleOk = (days, unit) => {
    const count = Math.ceil(days / unitOf(unit).days);
    return days > 0 && count >= MIN_CANDLES && count <= MAX_CANDLES;
};

/** 이 봉 단위로 그리면 몇 개가 되는지 */
export const candleCount = (days, unit) => Math.max(1, Math.ceil(days / unitOf(unit).days));

/**
 * 처음 보여줄 봉 단위: "내가 넣은 시나리오" 길이에 맞춰요 (그 뒤 가정 구간은 옆으로 밀어서 봐요)
 *   3달 이하 일봉, 1년 이하 주봉, 5년 이하 월봉, 그 이상 년봉
 * 시나리오 없이 "그 뒤로"만 있으면 전체 길이로 정해요.
 * @param {number} scenarioDays - 시나리오 길이 (거래일)
 * @param {number} totalDays - 그래프 전체 길이 (거래일)
 */
export function autoCandle(scenarioDays, totalDays) {
    const days = scenarioDays > 0 ? scenarioDays : totalDays;
    const order = ['day', 'week', 'month', 'year'];
    const limit = { day: 63, week: 252, month: 1260, year: Infinity };
    // 길이에 맞는 단위부터, 전체를 그렸을 때 봉이 너무 많으면 한 단계씩 굵게
    for (const u of order.slice(order.findIndex(k => days <= limit[k]))) {
        if (candleOk(totalDays, u)) return u;
    }
    // 그래도 없으면 쓸 수 있는 가장 촘촘한 단위, 그것도 없으면 null (흐름 차트로)
    return order.find(u => candleOk(totalDays, u)) ?? null;
}

/**
 * 하루 값을 봉으로 묶어요. 봉 하나 = 그 기간의 시가(처음)·고가(가장 높음)·저가(가장 낮음)·종가(끝)
 * @param {number[]} series - 하루마다의 값 (series[0] = 지금)
 * @param {string} unit - 'day' | 'week' | 'month' | 'year'
 * @param {number} scenarioEnd - 시나리오가 끝나는 날 (그 뒤는 "그 뒤로 매○" 가정)
 */
export function toCandles(series, unit, scenarioEnd) {
    const size = unitOf(unit).days;
    const candles = [];
    for (let from = 0; from < series.length - 1; from += size) {
        const to = Math.min(from + size, series.length - 1);
        const slice = series.slice(from, to + 1);         // 시가는 앞 봉의 종가 = from날 값
        candles.push({
            index: candles.length,
            from, to,
            open: slice[0],
            close: slice[slice.length - 1],
            high: Math.max(...slice),
            low: Math.min(...slice),
            projected: from >= scenarioEnd,                // "그 뒤로 매○" 가정 구간
        });
    }
    return candles;
}
