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
 *     mount(container, ctx)   화면을 그리고 이벤트를 연결 (OnInitialUpdate 같은 역할)
 *   }
 * ctx(앱이 넘겨주는 도구):
 *   ctx.inputs           이 기능의 마지막 입력값 (처음이면 null)
 *   ctx.saveInputs(v)    입력값 기억하기
 *   ctx.addRecord(r)     기록 저장하기
 */
import profit from './features/profit/index.js';
import average from './features/average/index.js';
import target from './features/target/index.js';

export const FEATURES = [
    profit,
    average,
    target,
    // 아직 만들지 않은 기능: mount가 없고 soon: true → 메뉴에 "준비 중"으로 보여요
    { id: 'dividend', name: '배당금 계산기', desc: '세금 뺀 실제 배당금', group: '계산기', icon: 'dividend', color: 'c4', soon: true },
    { id: 'fx', name: '환율·시세', desc: '실시간 데이터 (서버가 필요해서 6단계에서)', group: '정보', icon: 'fx', color: 'c5', soon: true },
];
