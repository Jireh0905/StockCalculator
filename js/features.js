/**
 * features.js — 기능 목록
 *
 * 여기에 기능을 한 줄 추가하면 왼쪽 메뉴와 홈 카드에 저절로 나타나요.
 *
 * 기능 하나 = js/features/<id>/ 폴더 하나 (MFC의 CView 하나, WinForms의 UserControl 하나)
 * 각 기능은 아래 모양의 객체를 export default 해요.
 *   {
 *     id, name, shortName, desc, group, icon, color,
 *     (group이 같은 기능끼리는 계산 기록을 함께 봐요)
 *     markets: true           맨 위에 국내/해외 선택 버튼 (모든 계산기가 같은 선택을 따라가요)
 *     mount(container, ctx)   화면을 그리고 이벤트를 연결 (OnInitialUpdate 같은 역할)
 *     receive(inputs, payload, market)   다른 기능이 값을 넘겨줄 때 (선택)
 *   }
 * ctx(앱이 넘겨주는 도구):
 *   ctx.market           'domestic' | 'global' (markets: true인 기능만)
 *   ctx.inputs           이 기능의 마지막 입력값 (처음이면 null, 국내/해외는 따로 기억)
 *   ctx.saveInputs(v)    입력값 기억하기
 *   ctx.addRecord(r)     기록 저장하기
 *   ctx.sendTo(id, v)    다른 기능으로 값 넘기기
 *   ctx.received         다른 기능이 방금 넘겨준 값 (없으면 null)
 */
import profit from './features/profit/index.js';
import split from './features/split/index.js';
import target from './features/target/index.js';
import plan from './features/plan/index.js';
import dividend from './features/dividend/index.js';

export const FEATURES = [
    profit,
    split,
    plan,   // 물타기·손절 계획이라 분할 매매 바로 아래에
    target,
    // 아직 만들지 않은 기능: mount가 없고 soon: true → 메뉴에 "준비 중"으로 보여요
    dividend,
    { id: 'fx', name: '환율·시세', desc: '실시간 데이터 (서버가 필요해서 6단계에서)', group: '정보', icon: 'fx', color: 'c5', soon: true },
];
