/* 2026-11-18 세 번째 요청 검사 — 실제 브라우저(태블릿 모드).
   ① 그리기 : 하단 바 = 색·선 굵기·모눈·모두 지움, 그리기 바 = 도형·글자·선 지우개(색·굵기·모눈·지움 없음)
   ② +/− 를 꾹 누르면 값이 계속 바뀐다 (떼는 순간 한 칸 더 가지 않는다)
   ③ 결함 목록 칸 폭 : 번호·개수·사진번호는 좁게, 폭·길이는 조금 좁게, 위치·부재·자재·결함은 넓게
   ④ 부재·자재·결함 ▼ 상자가 칸과 한 몸 (왼쪽 모서리 곧게, 같은 테두리·높이)
   ⑤ 결함 목록에서 부재를 바꾸면 아래 집계가 바로 바뀐다

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더> about:blank
     node tests/test-1118c.mjs                                                       */
import { connect, click, finish } from './cdp.mjs';
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
const ok = (cond, msg, extra) => {
  if (cond) passes++; else fails++;
  console.log((cond ? '  OK   ' : '  FAIL ') + msg + (!cond && extra !== undefined ? '  → ' + JSON.stringify(extra) : ''));
};
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg, { 실제: a, 바람: b });
const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT + name, Buffer.from(data, 'base64'));
};
const D = '__markerDbg.getActiveDrawing()';
const vis = (sel) => ev(`[...document.querySelectorAll('${sel}')].filter(e=>{const cs=getComputedStyle(e); return cs.display!=='none' && cs.visibility!=='hidden' && e.getClientRects().length>0;}).length`);

await cdp.send('DOM.enable');
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await cdp.send('Page.navigate', { url: APP }); await sleep(1300);
await ev(`localStorage.clear(); localStorage.setItem('defectMarkerTabletMode_v1','on'); true`);
await cdp.send('Page.navigate', { url: APP }); await sleep(1700);
const r0 = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#addDrawingInput')` });
await cdp.send('DOM.setFileInputFiles', { files: [ROOT + 'test-fixtures/plan.png'], objectId: r0.result.objectId });
await sleep(1400);
ok(await ev(`document.body.classList.contains('layout-tablet')`), '태블릿 모드');

/* ══ ① 그리기 바 나누기 ══ */
console.log('\n[1] 그리기 바');
await ev(`__markerDbg.setSketchTool('line'); true`); await sleep(400);
eq(await vis('#tabletFloatSketchGroup .sketch-color-btn'), 6, '하단 바에 색 6개');
eq(await vis('#tabletFloatSketchGroup .float-sketch-width'), 4, '하단 바에 선 굵기 4개');
eq([await vis('#btnFloatSketchGrid'), await vis('#btnFloatSketchClear')], [1, 1], '하단 바에 모눈 · 모두 지움');
eq(await vis('#tabletFloatSketchGroup [data-sketch-tool]'), 0, '하단 바에는 도형·글자·지우개 단추가 없다');
eq(await vis('#sketchToolGroup [data-sketch-tool]'), 7, '그리기 바에 도형·글자·선 지우개 7개');
eq([await vis('#sketchColorRow .sketch-color-btn'), await vis('#sketchWidthGroup'), await vis('#btnSketchGrid'), await vis('#btnSketchClear')], [0, 0, 0, 0],
  '그리기 바에는 색·굵기·모눈·모두 지움이 없다');
await shot('1118c-sketch.png');
// 하단 바 단추가 실제로 듣는지
await ev(`document.querySelectorAll('#tabletFloatSketchGroup .sketch-color-btn')[1].click(); true`); await sleep(100);
const col = await ev(`document.querySelectorAll('#tabletFloatSketchGroup .sketch-color-btn')[1].dataset.sketchColor`);
ok(await ev(`document.querySelectorAll('#tabletFloatSketchGroup .sketch-color-btn')[1].classList.contains('active')`), '하단 바 색을 누르면 그 색이 골라진다', col);
await ev(`document.querySelector('.float-sketch-width[data-sketch-width="1.8"]').click(); true`); await sleep(100);
ok(await ev(`document.querySelector('.float-sketch-width[data-sketch-width="1.8"]').classList.contains('active')`), '하단 바 굵기를 누르면 그 굵기가 골라진다');
const gridBefore = await ev(`document.getElementById('btnFloatSketchGrid').classList.contains('active')`);
await ev(`document.getElementById('btnFloatSketchGrid').click(); true`); await sleep(100);
ok(await ev(`document.getElementById('btnFloatSketchGrid').classList.contains('active')`) !== gridBefore, '하단 바 모눈 단추가 켜고 끈다');
// 선을 하나 긋고 모두 지움
await ev(`(()=>{const d=${D}; d.sketch=[{id:'s1',tool:'line',pts:[{x:10,y:10},{x:30,y:10}],color:'#000',w:1}]; __markerDbg.renderCanvas(); return true})()`);
await ev(`window.confirm=()=>true; document.getElementById('btnFloatSketchClear').click(); true`); await sleep(200);
eq(await ev(`(${D}.sketch||[]).length`), 0, '하단 바 「모두 지움」이 그린 선을 지운다');
// 선 지우개를 들면 선 굵기 대신 지우개 굵기(그리기 바)
await ev(`__markerDbg.setSketchTool('sketchErase'); true`); await sleep(200);
eq(await vis('#tabletFloatSketchGroup .float-sketch-width'), 0, '선 지우개를 들면 하단 바의 선 굵기는 숨는다');
ok(await vis('#sketchEraseSizeGroup') === 1, '  → 지우개 굵기는 그리기 바에');

/* ══ ② 꾹 누르기 ══ */
console.log('\n[2] +/− 꾹 누르기');
const holdOn = async (id, ms) => {
  const b = await ev(`(()=>{const r=document.getElementById('${id}').getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)};})()`);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [b] });
  await sleep(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
};
const val = (id) => ev(`parseFloat(document.getElementById('${id}').value)`);
let v0 = await val('sketchEraseSizeSlider');
await holdOn('btnSketchErasePlus', 1500);
let v1 = await val('sketchEraseSizeSlider');
ok(v1 - v0 >= 0.6, '선 지우개 굵기 + 를 1.5초 누르면 여러 칸 오른다', { 전: v0, 후: v1 });
// 짧게 한 번 = 한 칸
v0 = await val('sketchEraseSizeSlider');
await holdOn('btnSketchEraseMinus', 120);
v1 = await val('sketchEraseSizeSlider');
ok(Math.abs((v0 - v1) - 0.1) < 0.001, '짧게 한 번 누르면 딱 한 칸', { 전: v0, 후: v1 });
// 꾹 누르다 떼도 한 칸 더 가지 않는다 : 누르는 동안 바뀐 값 = 뗀 뒤 값
v0 = await val('sketchEraseSizeSlider');
const b = await ev(`(()=>{const r=document.getElementById('btnSketchEraseMinus').getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)};})()`);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [b] });
await sleep(900);
const during = await val('sketchEraseSizeSlider');
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(300);
const after = await val('sketchEraseSizeSlider');
ok(during < v0, '누르고 있는 동안 값이 내려간다', { 전: v0, 중: during });
ok(after - during >= -0.1001 && after <= during, '떼는 순간 한 칸 더 가지 않는다(많아야 진행 중이던 한 칸)', { 중: during, 후: after });
// 모눈 칸
await ev(`__markerDbg.setSketchTool('line'); true`); await sleep(200);
const gOn = await ev(`document.getElementById('btnFloatSketchGrid').classList.contains('active')`);
if (!gOn) { await ev(`document.getElementById('btnFloatSketchGrid').click(); true`); await sleep(200); }
if (await vis('#btnGridDivPlus')) {
  const g0 = await val('sketchGridDivSlider');
  await holdOn('btnGridDivMinus', 1300);
  const g1 = await val('sketchGridDivSlider');
  ok(g0 - g1 >= 10, '모눈 칸 − 를 꾹 누르면 계속 줄어든다', { 전: g0, 후: g1 });
} else ok(false, '모눈 칸 +/− 가 보인다');
// 지우개(D) 브러시
await ev(`__markerDbg.setSketchTool(null); document.getElementById('btnEraseMode').click(); true`); await sleep(300);
const e0 = await val('eraseBrushSlider');
await holdOn('btnBrushPlus', 1300);
const e1 = await val('eraseBrushSlider');
ok(e1 - e0 >= 0.5, '지우개 브러시 굵기 + 를 꾹 누르면 계속 오른다', { 전: e0, 후: e1 });
await ev(`document.getElementById('btnEraseMode').click(); true`); await sleep(200);

/* ══ ③④⑤ 결함 목록 ══ */
console.log('\n[3·4·5] 결함 목록');
await ev(`(()=>{const d=${D}; d.markers=[]; for(let i=0;i<2;i++) d.markers.push({id:'t'+i,uid:'u'+i,typeKey:'wall',xPct:20+i*20,yPct:40,angle:0,rptFloor:'지상1층',rptLoc:'거실',rptType:'벽체',rptMember:'콘크리트',rptDefect:'균열',rptWidth:'0.3',rptLength:'500',rptCount:'1',rptTag:'12'}); __markerDbg.renderCanvas(); __markerDbg.renderTable(); return true})()`);
await ev(`document.getElementById('btnDrawerRight').click(); true`); await sleep(700);
const W = await ev(`(()=>{const c=document.querySelector('.marker-card'); const w=s=>Math.round((c.querySelector(s).closest('.mc-cell')||c.querySelector(s)).getBoundingClientRect().width);
  return { 번호:w('[data-role="pos"]'), 층수:w('[data-role="rptFloor"]'), 위치:w('[data-role="rptLoc"]'), 부재:w('[data-role="rptType"]'), 자재:w('[data-role="rptMember"]'), 결함:w('[data-role="rptDefect"]'),
    폭:w('[data-role="rptWidth"]'), 길이:w('[data-role="rptLength"]'), 개수:w('[data-role="rptCount"]'), 사진:w('[data-role="rptTag"]') };})()`);
console.log('       칸 폭', JSON.stringify(W));
ok(W.번호 <= 45, '번호 칸이 좁다(45px 이하)', W.번호);
ok(W.개수 < W.폭 * 0.7 && W.사진 < W.폭 * 0.8, '개수·사진번호는 폭 칸보다 확실히 좁다', W);
ok(W.위치 > W.폭 && W.부재 > W.폭 && W.자재 > W.폭 && W.결함 > W.폭, '위치·부재·자재·결함은 폭·길이보다 넓다', W);
ok(await ev(`(()=>{const i=document.querySelector('.marker-card [data-role="rptMember"]'); return i.scrollWidth<=i.clientWidth+1;})()`), '「콘크리트」가 잘리지 않는다');
const cb = await ev(`(()=>{const w=document.querySelector('.marker-card .cwrap'); const i=w.querySelector('input'), b=w.querySelector('.cbtn'); const ri=i.getBoundingClientRect(), rb=b.getBoundingClientRect(), cs=getComputedStyle(b), ci=getComputedStyle(i);
  return { 높이: [Math.round(ri.height), Math.round(rb.height)], 위: [Math.round(ri.top), Math.round(rb.top)], 붙음: Math.round(rb.left - ri.right), 왼모서리: [cs.borderTopLeftRadius, cs.borderBottomLeftRadius], 오른모서리: cs.borderTopRightRadius, 테두리: [cs.borderTopColor, ci.borderTopColor], 바탕: [cs.backgroundColor, ci.backgroundColor] };})()`);
eq(cb.높이[0], cb.높이[1], '▼ 상자와 칸 높이가 같다');
eq(cb.위[0], cb.위[1], '▼ 상자와 칸 윗선이 같다');
ok(Math.abs(cb.붙음) <= 1, '▼ 상자가 칸에 딱 붙어 있다', cb.붙음);
eq(cb.왼모서리, ['0px', '0px'], '▼ 상자 왼쪽(칸과 붙는 쪽) 모서리는 곧다');
ok(cb.오른모서리 !== '0px', '  오른쪽 모서리만 둥글다', cb.오른모서리);
eq(cb.테두리[0], cb.테두리[1], '  테두리 색이 칸과 같다');
eq(cb.바탕[0], cb.바탕[1], '  바탕 색이 칸과 같다');
await shot('1118c-list.png');
// ⑤ 부재를 바꾸면 집계가 바로
const chips = () => ev(`[...document.querySelectorAll('#legendPreview .legend-chip')].map(c=>c.textContent.trim())`);
eq(await chips(), ['벽체 (2)'], '처음 집계 : 벽체 (2)');
await ev(`(()=>{const i=document.querySelector('.marker-card [data-role="rptType"]'); i.value='기둥'; i.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
await sleep(400);
const c1 = await chips();
ok(c1.includes('기둥 (1)') && c1.includes('벽체 (1)'), '카드에서 부재를 「기둥」으로 바꾸면 결함을 더 찍지 않아도 집계가 바로 바뀐다', c1);
// 퀵입력 단추로 바꾼 경우도 (목록만 다시 그리는 길)
await ev(`(()=>{const d=${D}; d.markers[1].rptType='보'; __markerDbg.renderTable(); return true})()`); await sleep(400);
const c2 = await chips();
ok(c2.includes('보 (1)') && c2.includes('기둥 (1)'), '목록만 다시 그리는 길(퀵입력·손글씨·여러 건 채우기)에서도 집계가 맞춰진다', c2);

console.log(`\n${passes} 통과 / ${fails} 실패`);
finish(cdp, fails ? 1 : 0);
