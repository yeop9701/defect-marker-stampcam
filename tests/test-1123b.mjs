/* 2026-11-23 2차 — 손글씨를 글자로 바꾼 칸에 ✋ 표시(나중에 다시 확인용).

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더> about:blank
     node tests/test-1123b.mjs                                                       */
import { connect } from './cdp.mjs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = fileURLToPath(new URL('./out/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const APP = process.env.APP_URL || ((process.env.BASE_URL || 'http://localhost:8125') + '/defect-marker-stampcam/index.html');
const cdp = await connect(Number(process.env.CDP_PORT || 9223));
const ev = (s) => cdp.evaluate(s);
let fails = 0, passes = 0;
const ok = (c, m, x) => { if (c) passes++; else fails++; console.log((c ? '  OK   ' : '  FAIL ') + m + (!c && x !== undefined ? '  → ' + JSON.stringify(x) : '')); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m, { 실제: a, 바람: b });
const shot = async (n) => { const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(OUT + n, Buffer.from(data, 'base64')); };
const D = '__markerDbg.getActiveDrawing()';

async function boot(w = 1280, h = 800, extra = '') {
  await cdp.send('DOM.enable');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: APP }); await sleep(800);
  await ev(`localStorage.clear(); localStorage.setItem('defectMarkerTabletMode_v1','on'); localStorage.setItem('defectMarkerInk_v1', JSON.stringify({on:false,engine:'google',auto:false})); ${extra} true`);
  await cdp.send('Page.navigate', { url: APP }); await sleep(1400);
  const r = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#addDrawingInput')` });
  await cdp.send('DOM.setFileInputFiles', { files: [ROOT + 'test-fixtures/plan.png'], objectId: r.result.objectId }); await sleep(1100);
}
const S = (a) => [[1, 1, 20 + a, 20, 40, 10 + a]];
const ink = (text, eng, extra = {}) => Object.assign({ w: 100, h: 50, s: S(text.length), st: 'done', eng, text }, extra);
const setup = `(()=>{const d=${D};const k=__markerDbg.info.allPresets()[0].series[0].key;
  d.markers=[
   {id:'a',uid:'a',typeKey:k,xPct:10,yPct:10,seq:1,rptType:'수직',rptMember:'콘크리트',rptDefect:'균열',rptLoc:'계단실',rptWidth:'0.3',
    ink:{rptLoc:${JSON.stringify(ink('계단실', 'google'))},rptMember:${JSON.stringify(ink('콘크리트', 'pick'))},rptWidth:${JSON.stringify(ink('0.3', 'digits', { conf: 0.9 }))}}},
   {id:'b',uid:'b',typeKey:k,xPct:20,yPct:10,seq:2,rptLoc:'복도',rptDefect:'백태',
    ink:{rptLoc:${JSON.stringify(ink('보도', 'google'))},rptDefect:${JSON.stringify(ink('백태', 'claude', { ok: true }))}}},
   {id:'c',uid:'c',typeKey:k,xPct:30,yPct:10,seq:3,rptTag:'7',ink:{rptTag:${JSON.stringify(ink('7', 'manual'))}}}];
  __markerDbg.renderTable();return true})()`;
const card = (id) => `document.querySelector('.marker-card[data-id=${id}]')`;
const hands = (id) => ev(`[...${card(id)}.querySelectorAll('.hand-badge')].map(b=>b.dataset.hand)`);

console.log('\n[어느 칸에 ✋ 가 붙나]');
await boot();
await ev(setup);
await ev(`document.getElementById('btnDrawerRight').click(); true`); await sleep(500);
eq(await ev(`${card('a')}.classList.contains('mc-folded')`), true, '다 채운 결함 a 는 접혀 있다');
eq(await ev(`${card('a')}.querySelector('.fs-hand').textContent`), '✋2', '  접힌 줄에 ✋2 (위치·폭)');
await ev(`${card('a')}.querySelector('.mc-fold-sum').click(); true`); await sleep(400);
eq(await hands('a'), ['rptLoc', 'rptWidth'], '구글로 바꾼 위치, 앱이 읽은 폭 → ✋ / 목록에서 고른 자재 → 없음');
eq(await hands('b'), [], '바꾼 뒤 손으로 고친 칸(보도→복도), 「맞음」 누른 칸 → 없음');
eq(await hands('c'), [], '직접 친 사진번호 → 없음');
eq(await ev(`[...document.querySelectorAll('#markerFilterRow button')].map(b=>b.textContent)`), ['전체 3', '미입력 2', '사진 없음 3', '손글씨 미변환 0', '✋ 확인 1'], '거르기에 「✋ 확인 1」');
await shot('1123b-hand.png');

console.log('\n[✋ 누르기 → 비교 · 맞음 · 고치기]');
await ev(`${card('a')}.querySelector('.hand-badge[data-hand=rptLoc]').click(); true`); await sleep(250);
eq(await ev(`(()=>{const p=document.getElementById('handPop');return p?[p.querySelector('.hp-cmp b').textContent, !!p.querySelector('img[src^="data:image/png"]')]:null})()`), ['계단실', true], '창에 손글씨 원본 그림과 바꾼 글자');
const inView = await ev(`(()=>{const r=document.getElementById('handPop').getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()`);
ok(inView, '  창이 화면 안에');
await shot('1123b-pop.png');
await ev(`document.querySelector('#handPop [data-hp=ok]').click(); true`); await sleep(300);
eq(await ev(`[${D}.markers[0].ink.rptLoc.ok, !!document.getElementById('handPop')]`), [true, false], '「맞음」 → 확인됨으로 적고 창 닫힘');
eq(await hands('a'), ['rptWidth'], '  위치의 ✋ 가 사라진다');
await ev(`__markerDbg.undo(); true`); await sleep(300);
eq(await ev(`!!${D}.markers[0].ink.rptLoc.ok`), false, '실행취소로 되돌릴 수 있다');
await ev(`${card('a')}.querySelector('.mc-fold-sum') && ${card('a')}.classList.contains('mc-folded') && ${card('a')}.querySelector('.mc-fold-sum').click(); true`); await sleep(300);
await ev(`${card('a')}.querySelector('.hand-badge[data-hand=rptWidth]').click(); true`); await sleep(250);
await ev(`document.querySelector('#handPop [data-hp=fix]').click(); true`); await sleep(300);
eq(await ev(`document.activeElement && document.activeElement.dataset.role`), 'rptWidth', '「고치기」 → 그 칸에 커서');
await ev(`(()=>{const i=document.activeElement;i.value='0.5';i.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
await ev(`__markerDbg.renderTable(); true`); await sleep(200);
eq(await hands('a'), ['rptLoc'], '손으로 고친 폭은 ✋ 없음');
await ev(`${card('a')}.querySelector('.hand-badge').click(); true`); await sleep(200);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 600 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(250);
eq(await ev(`!!document.getElementById('handPop')`), false, '바깥을 누르면 창 닫힘');

console.log('\n[거르기 · 저장]');
await ev(`document.querySelector('#markerFilterRow [data-filter=hand]').click(); true`); await sleep(200);
eq(await ev(`[...document.querySelectorAll('#markerTable .marker-card')].filter(c=>c.style.display!=='none').map(c=>c.dataset.id)`), ['a'], '「✋ 확인」 → 확인할 결함만');
eq(await ev(`JSON.parse(JSON.stringify(__markerDbg.buildProjectSnapshot())).drawings[0].markers[1].ink.rptDefect.ok`), true, '확인 표시는 프로젝트 파일에 남는다');

console.log('\n[변환되자마자 ✋]');
await ev(`(()=>{const d=${D};d.markers.push({id:'n',uid:'n',typeKey:d.markers[0].typeKey,xPct:40,yPct:10,seq:4,ink:{rptLoc:{w:100,h:50,s:[[1,1,9,9]],st:'pending'}}});return true})()`);
await ev(`document.querySelector('#markerFilterRow [data-filter=all]').click(); true`);
await ev(`localStorage.setItem('defectMarkerInk_v1', JSON.stringify({on:false,engine:'google',auto:true})); Ink.convert=async(items,o)=>{for(const it of items)o.onResult(it,{text:'기계실',alts:[]},null,'google');}; true`);
await ev(`document.querySelector('#btnFloatInkPending, #btnInkConvertRun') ; true`);
// 저장 후 불러오기 길로 변환
const proj = await ev(`JSON.stringify(__markerDbg.buildProjectSnapshot())`);
writeFileSync(OUT + '1123b.json', proj);
const fi = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#loadProjectInput')` });
await cdp.send('DOM.setFileInputFiles', { files: [OUT + '1123b.json'], objectId: fi.result.objectId }); await sleep(2600);
eq(await ev(`${D}.markers.find(m=>m.id==='n'||m.seq===4).rptLoc`), '기계실', '불러오자 자동 변환');
eq(await ev(`[...document.querySelectorAll('#markerTable .marker-card')].at(-1).querySelectorAll('.hand-badge').length`), 1, '  바뀐 칸에 ✋');

console.log('\n[휴대폰 폭]');
await boot(390, 800);
await ev(setup);
await ev(`document.getElementById('btnDrawerRight').click(); true`); await sleep(500);
await ev(`${card('b')}.scrollIntoView(); true`);
await ev(`${card('a')}.querySelector('.mc-fold-sum').click(); true`); await sleep(400);
eq(await hands('a'), ['rptLoc', 'rptWidth'], '390px 에서도 ✋');
const vis = await ev(`(()=>{const b=${card('a')}.querySelector('.hand-badge');const r=b.getBoundingClientRect();const e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return e===b})()`);
ok(vis, '  ✋ 가 다른 것에 가리지 않는다');
await shot('1123b-phone.png');

console.log(`\n통과 ${passes} · 실패 ${fails}`);
process.exit(fails ? 1 : 0);
