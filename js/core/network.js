/**
 * network.js — 인터넷 연결 상태 (모든 화면 공통)
 *
 * 몇 초마다 확인하는 "감시 스레드"를 두지 않고, 브라우저가 보내주는 알림을 받아요.
 * (MFC로 치면 스레드에서 Sleep 돌며 확인하는 대신, Windows의 네트워크 변경 알림 메시지를 받는 쪽)
 *
 *   offline 이벤트 ........ 바로 오프라인 (브라우저가 "연결 없음"이라고 하면 정확해요)
 *   online 이벤트 ......... 확인 요청 1번 → 되면 온라인
 *   데이터 요청이 네트워크 오류로 실패 ... 확인 요청 1번 (그 API만 고장일 수도 있어서)
 *   다른 탭에 갔다 돌아옴 ... 확인 요청 1번
 *
 * 브라우저의 "연결됨"은 와이파이에 붙었다는 뜻일 뿐이에요. 공유기 인터넷이 끊겨도 "연결됨"이라서,
 * 확인 요청이 실패하면 오프라인으로 보고, 이 상태일 때만 15초 → 30초 → 60초 간격으로 다시 확인해요.
 * (이때는 브라우저가 알려줄 일이 없어서요. 연결되면 멈추고, 탭이 숨어 있으면 쉬어요)
 *
 * 확인 요청은 우리 사이트(index.html)에 보내요. 내용은 받지 않고(HEAD) 답이 오는지만 봐요.
 * 로컬 서버에서는 내 컴퓨터에 묻는 셈이라, "와이파이는 있는데 인터넷 없음"은 배포 사이트에서만 진짜로 확인돼요.
 */

/** 지금 상태 (처음에는 브라우저가 알려주는 값) */
let online = navigator.onLine;
/** 상태가 바뀌면 부를 함수들 */
const listeners = new Set();
/** 다시 확인 예약 (오프라인인데 브라우저는 "연결됨"이라고 할 때만) */
let retryTimer = null;
let retryDelay = 15000;
/** 확인 요청이 이미 가는 중이면 그 결과를 같이 기다려요 (여러 곳에서 동시에 불러도 요청은 1번) */
let checking = null;

const RETRY_MIN = 15000;
const RETRY_MAX = 60000;
const PING_TIMEOUT = 5000;

/** 지금 인터넷이 되는지 */
export const isOnline = () => online;

/**
 * 상태가 바뀔 때 알려달라고 등록해요. 돌려주는 함수를 부르면 등록을 풀어요.
 * @param {(online: boolean) => void} fn
 * @returns {() => void}
 */
export function onNetworkChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

function setOnline(next) {
    if (next === online) return;
    online = next;
    listeners.forEach(fn => fn(online));
}

/** 우리 사이트에 답이 오는지 (어떤 HTTP 응답이든 오면 연결된 거예요) */
async function ping() {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), PING_TIMEOUT);
    try {
        await fetch(`./index.html?ping=${Date.now()}`, { method: 'HEAD', cache: 'no-store', signal: ctl.signal });
        return true;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

function stopRetry() {
    clearTimeout(retryTimer);
    retryTimer = null;
}

/** 브라우저는 "연결됨"인데 인터넷이 안 될 때만: 점점 길게 다시 확인 */
function scheduleRetry() {
    stopRetry();
    if (!navigator.onLine || document.hidden) return;   // 연결 없음은 online 이벤트가, 숨은 탭은 돌아올 때 확인해요
    retryTimer = setTimeout(checkNow, retryDelay);
    retryDelay = Math.min(retryDelay * 2, RETRY_MAX);
}

/**
 * 지금 연결을 확인해요. (상단 연결 표시를 누를 때, 요청이 실패했을 때 등)
 * @returns {Promise<boolean>} 온라인이면 true
 */
export function checkNow() {
    if (!navigator.onLine) {
        stopRetry();
        setOnline(false);
        return Promise.resolve(false);
    }
    checking ??= ping().then((ok) => {
        setOnline(ok);
        if (ok) {
            stopRetry();
            retryDelay = RETRY_MIN;
        } else {
            scheduleRetry();
        }
        return ok;
    }).finally(() => { checking = null; });
    return checking;
}

/**
 * fetch와 똑같이 쓰는데, 네트워크 오류(응답 자체가 없음·시간 초과)로 실패하면 연결을 확인해요.
 * 404·500처럼 응답이 온 실패는 그 서버 문제라서 연결 확인을 하지 않아요.
 */
export async function netFetch(url, options) {
    try {
        return await fetch(url, options);
    } catch (err) {
        checkNow();
        throw err;
    }
}

/** 브라우저 알림 연결 (app.js가 시작할 때 한 번) */
export function watchNetwork() {
    window.addEventListener('offline', () => {
        stopRetry();
        setOnline(false);
    });
    window.addEventListener('online', checkNow);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopRetry();
        else checkNow();
    });
}
