/**
 * money-input.js — 해외 달러 입력칸에 "원화로 넣기"를 붙여요 (모든 계산기 공통)
 *
 * 해외 계산기의 $ 칸 왼쪽 "$" 글자를 [$ ⇄ ₩] 버튼으로 바꿔요.
 *   - $ 모드: 지금처럼 달러로 넣고, 아래에 "≈ 165,600원"
 *   - ₩ 모드: 원화로 넣으면 기준 환율로 나눠 진짜 칸(달러)에 넣어줘요. 아래에 "= $127.38"
 *
 * 계산기는 이 파일을 몰라도 돼요. 진짜 달러 칸(name 있는 칸)은 그대로 두고,
 * 원화 모드에서는 그 칸을 숨기고 옆의 "대신 받는 칸"(name 없음)을 보여줄 뿐이에요.
 * 원화를 넣으면 진짜 칸 값을 바꾸고 input 이벤트를 보내서, 계산기는 달러를 직접 친 것처럼 받아요.
 * (MFC로 치면 에디트 컨트롤을 서브클래싱해서 변환만 끼워 넣는 것과 같아요)
 *
 * 어떤 칸을 원화로 넣을지는 "기능.칸이름"마다 기억해요. 같은 이름의 여러 줄(1차·2차 매수가)은 함께 바뀌어요.
 */
import { won, parseNumber } from './format.js';
import { formatInput } from './number-input.js';
import { getFx, getInputCurrency, setInputCurrency } from './session.js';
import { dollars, inputText } from './market.js';

/** 원화 칸에 친 글자를 기억해요 (다시 그려도 1,000,000이 999,960으로 바뀌지 않게). 키 → { usd, text } */
const typed = new Map();

/**
 * container 안의 해외 달러 칸에 $/₩ 버튼을 붙여요. 이미 붙인 칸은 건너뛰어서 여러 번 불러도 돼요.
 * @param {HTMLElement} container
 * @param {string} featureId - 입력 통화를 기억할 때 쓰는 이름
 */
export function enhanceMoneyInputs(container, featureId) {
    const fresh = container.querySelectorAll('.input-wrap.prefix:not([data-cur])');
    if (!fresh.length) return;
    fresh.forEach(wrap => {
        const real = wrap.querySelector('input[name]');
        if (!real || wrap.querySelector('.prefix-unit')?.textContent !== '$') return; // 달러 칸만
        const key = `${featureId}.${real.name}`;
        wrap.dataset.cur = key;

        // "$" 글자 → 누를 수 있는 버튼
        wrap.querySelector('.prefix-unit')?.remove();
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'cur-toggle';
        toggle.dataset.curToggle = '';
        wrap.prepend(toggle);

        // 원화 모드에서 대신 받는 칸 (name이 없어서 계산기의 읽기·저장에는 안 잡혀요)
        const proxy = document.createElement('input');
        proxy.className = 'krw-proxy';
        proxy.inputMode = 'numeric';
        proxy.autocomplete = 'off';
        proxy.setAttribute('data-int', ''); // 원화는 정수만
        proxy.placeholder = real.placeholder ? won(parseNumber(real.placeholder) * getFx()) : '';
        const unit = document.createElement('span');
        unit.className = 'unit krw-unit';
        unit.textContent = '원';
        real.after(proxy, unit);

        // 아래 한 줄: 다른 통화로 얼마인지
        const hint = document.createElement('span');
        hint.className = 'cur-hint';
        wrap.after(hint);

        let fromProxy = false;   // 원화 칸에서 보낸 input 이벤트인지 (아래 real 리스너가 되받지 않게)
        proxy.addEventListener('input', () => {
            formatInput(proxy);
            const krw = parseNumber(proxy.value);
            real.value = krw > 0 ? inputText(krw / getFx()) : '';
            typed.set(slot(wrap), { usd: real.value, text: proxy.value, rate: getFx() });
            // 계산기는 진짜 칸에 달러를 친 것처럼 받아요 (bindNumberInputs가 듣는 이벤트)
            fromProxy = true;
            real.dispatchEvent(new Event('input', { bubbles: true }));
            fromProxy = false;
        });
        // 다른 곳(종목 검색 줄 등)이 진짜 칸에 달러를 넣으면, 원화 모드일 때 원화 칸도 맞춰요
        real.addEventListener('input', () => {
            if (fromProxy || !wrap.classList.contains('is-krw')) return;
            const usd = parseNumber(real.value);
            proxy.value = usd > 0 ? won(usd * getFx()) : '';
        });

        applyMode(wrap, getInputCurrency(key));
    });
    refreshHints(container);
}

/** 같은 이름 칸이 여러 줄이면 몇 번째인지까지 넣은 기억 키 */
function slot(wrap) {
    const same = [...document.querySelectorAll(`[data-cur="${wrap.dataset.cur}"]`)];
    return `${wrap.dataset.cur}#${same.indexOf(wrap)}`;
}

/** 칸 하나를 $ 또는 ₩ 모드로 */
function applyMode(wrap, mode) {
    const krw = mode === 'krw';
    const real = wrap.querySelector('input[name]');
    const proxy = wrap.querySelector('.krw-proxy');
    const toggle = wrap.querySelector('[data-cur-toggle]');
    wrap.classList.toggle('is-krw', krw);
    toggle.textContent = krw ? '₩' : '$';
    toggle.setAttribute('aria-label', krw ? '원화로 넣는 중 (누르면 달러로)' : '달러로 넣는 중 (누르면 원화로)');
    if (krw) {
        // 달러 값과 기준 환율이 그대로면 아까 친 원화 글자를, 하나라도 바뀌었으면 기준 환율로 다시 계산
        // (기준 환율을 바꿔도 달러 값은 그대로 두고 원화 쪽을 고쳐요 — 주식 가격은 달러가 진짜라서)
        const memo = typed.get(slot(wrap));
        const usd = parseNumber(real.value);
        proxy.value = memo && memo.usd === real.value && memo.rate === getFx()
            ? memo.text
            : usd > 0 ? won(usd * getFx()) : '';
    }
}

/** 칸 아래 "≈ 165,600원" / "= $127.38" 글자를 지금 값으로 */
export function refreshHints(container) {
    container.querySelectorAll('.input-wrap[data-cur]').forEach(wrap => {
        const hint = wrap.nextElementSibling;
        if (!hint?.classList.contains('cur-hint')) return;
        const usd = parseNumber(wrap.querySelector('input[name]').value);
        const text = !(usd > 0) ? ''
            : wrap.classList.contains('is-krw') ? `= $${dollars(usd)} · 환율 ${won(getFx())}원`
            : `≈ ${won(usd * getFx())}원`;
        // 같은 글자면 건드리지 않아요 (바꿀 때마다 MutationObserver가 또 불려서 끝없이 돌지 않게)
        if (hint.textContent !== text) hint.textContent = text;
    });
}

/**
 * 화면 하나에 $/₩ 기능을 연결해요: 지금 있는 칸 + 나중에 생기는 줄(+ 늘리기) + 버튼 + 아래 글자.
 * app.js가 해외 계산기를 그린 뒤 한 번 불러요.
 */
export function setupMoneyInputs(root, featureId) {
    enhanceMoneyInputs(root, featureId);

    // "+ 늘리기"로 새 줄이 생기면 그 줄에도 붙여요
    new MutationObserver(() => enhanceMoneyInputs(root, featureId))
        .observe(root, { childList: true, subtree: true });

    root.addEventListener('click', (e) => {
        const toggle = e.target.closest('[data-cur-toggle]');
        if (!toggle) return;
        e.preventDefault(); // <label> 안이라 진짜 칸으로 포커스가 가지 않게
        const wrap = toggle.closest('.input-wrap');
        const next = wrap.classList.contains('is-krw') ? 'usd' : 'krw';
        setInputCurrency(wrap.dataset.cur, next);
        root.querySelectorAll(`[data-cur="${wrap.dataset.cur}"]`).forEach(w => applyMode(w, next));
        refreshHints(root);
        wrap.querySelector(next === 'krw' ? '.krw-proxy' : 'input[name]').focus();
    });

    // 어떤 칸이든 값이 바뀌면 아래 글자도 (다른 칸이 바꾼 값·받아온 값 포함)
    root.addEventListener('input', () => refreshHints(root));
}
