/* 2026-11-19 8차 요청 검사 — 도면마다 층수, 결함 목록 층별 묶음, 좁아진 서랍에 붙는 탭.

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더> about:blank
     node tests/test-1119g.mjs                                                       */
import { connect, finish } from './cdp.mjs';
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
const click = async (id, ms = 300) => { await ev(`document.getElementById('${id}').click(); true`); await sleep(ms); };
const D = '__markerDbg.getActiveDrawing()', I = '__markerDbg.info';
const tapXY = async (x, y) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(40); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(500); };

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
const menu = () => ev(`(()=>{const m=document.querySelector('.cell-menu');return m?[...m.querySelectorAll('button')].map(b=>(b.classList.contains('recent')?'★':'')+b.textContent):null})()`);
const mclick = async (text) => { const r = await ev(`(()=>{const b=[...document.querySelectorAll('.cell-menu button')].find(b=>b.textContent===${JSON.stringify(text)});if(!b)return false;b.dispatchEvent(new MouseEvent('click',{bubbles:true}));return true})()`); await sleep(200); return r; };
const tapCanvas = async (fx, fy) => { const p = await ev(`(()=>{const r=document.getElementById('mainCanvas').getBoundingClientRect();return {x:Math.round(r.left+r.width*${fx}),y:Math.round(r.top+r.height*${fy})}})()`); await tapXY(p.x, p.y); await ev(`__markerDbg.ink.hideQuickInputSheet(); true`); };

console.log('\n[도면 이름에서 층 짐작]');
await boot();
eq(await ev(`['지상3층 평면도','3층 평면','B2 평면도','지하1층','12F 평면','옥탑 평면','지붕 평면도','205동 평면도','지하중1층'].map(${I}.floorFromDrawingName)`),
  ['지상3층', '지상3층', '지하2층', '지하1층', '지상12층', '옥탑층', '지붕층', '', '지하중1층'], '이름 → 층 (동 번호는 층이 아니다)');

console.log('\n[도면마다 층수]');
await ev(`(()=>{const d=${D};d.name='지상3층 평면도';d.markers=[{id:'a',uid:'a',typeKey:d.markers[0]?d.markers[0].typeKey:${I}.allPresets()[0].series[0].key,xPct:10,yPct:10,seq:1},{id:'b',uid:'b',typeKey:${I}.allPresets()[0].series[0].key,xPct:20,yPct:10,seq:2,rptFloor:'지상1층'}];__markerDbg.renderTable();return true})()`);
await click('btnDrawerLeft');
await ev(`(()=>{const t=document.querySelector('#drawingTabs .drawing-tab');t.replaceWith(t);return true})()`);
await ev(`(()=>{__markerDbg.renderTable();return true})()`);
await ev(`document.querySelector('#drawingTabs [data-act=floor]').dispatchEvent(new MouseEvent('click',{bubbles:true})); true`); await sleep(250);
eq(await ev(`document.querySelector('#drawingTabs [data-act=floor]').textContent`), '층 미정', '도면 목록에 「층 미정」');
const m0 = await menu();
eq(m0[0], '★지상3층', '창 맨 앞에 도면 이름에서 짐작한 층');
ok(m0.includes('(정하지 않음)'), '  「정하지 않음」도 있다');
await shot('1119g-drawing-floor.png');
await mclick('지상3층');
eq(await ev(`[${D}.floor, document.querySelector('#drawingTabs [data-act=floor]').textContent]`), ['지상3층', '지상3층'], '도면 층수가 정해지고 목록에 보인다');
eq(await ev(`${D}.markers.map(m=>m.rptFloor||'')`), ['지상3층', '지상1층'], '층수가 빈 결함에만 넣는다(이미 적은 층은 그대로)');
await click('btnDrawerLeft');
await tapCanvas(0.5, 0.5);
eq(await ev(`${D}.markers[2].rptFloor`), '지상3층', '새로 찍은 결함에 도면 층수가 자동으로');
await ev(`__markerDbg.ink.openQuickInputSheetFor(${D}.markers[2]); true`); await sleep(200);
ok(await ev(`[...document.querySelectorAll('#quickInputFields .qis-tax-row.open .qis-tax-label')].map(e=>e.textContent).includes('위치')`), '  퀵입력은 위치 줄부터 열린다');
await ev(`__markerDbg.ink.hideQuickInputSheet(); true`);
// 값 이어받기보다 도면 층수가 앞선다
await ev(`(()=>{const m=${D}.markers[1];__markerDbg.ink.openQuickInputSheetFor(m);return true})()`); await sleep(150);
await ev(`__markerDbg.ink.hideQuickInputSheet(); true`);
await tapCanvas(0.3, 0.7);
eq(await ev(`${D}.markers[3].rptFloor`), '지상3층', '이어받은 층(지상1층)보다 도면 층수가 앞선다');
// 저장했다 열어도 남는다
const snap = await ev(`__markerDbg.buildProjectSnapshot()`);
eq(snap.drawings[0].floor, '지상3층', '프로젝트 파일에 들어간다');
await ev(`(async()=>{ ${D}.floor=''; await __markerDbg.applyProjectData(${JSON.stringify(snap)}); return true; })()`); await sleep(600);
eq(await ev(`${D}.floor`), '지상3층', '  다시 열어도 남는다');
// 실행취소
await click('btnDrawerLeft');
await ev(`document.querySelector('#drawingTabs [data-act=floor]').dispatchEvent(new MouseEvent('click',{bubbles:true})); true`); await sleep(200);
await mclick('(정하지 않음)');
eq(await ev(`${D}.floor||''`), '', '「정하지 않음」으로 되돌릴 수 있다');
await ev(`(()=>{${D}.markers.forEach(m=>m.rptFloor='');__markerDbg.ink.openQuickInputSheetFor(${D}.markers[0]);__markerDbg.ink.hideQuickInputSheet();return true})()`);
await click('btnCarryToggle', 150);   // 값 이어받기를 끄고 본다
await tapCanvas(0.7, 0.3);
eq(await ev(`${D}.markers[${D}.markers.length-1].rptFloor||''`), '', '  그 뒤로 찍는 결함은 층수가 비어 있다(결함마다 고른다)');
await click('btnCarryToggle', 150);
await click('btnDrawerLeft');

console.log('\n[결함 목록 층별 묶음]');
await boot(1280, 800, `localStorage.setItem('defectMarkerFoldDone_v1','off');`);
await ev(`(()=>{const d=${D},k=${I}.allPresets()[0].series[0].key;const F=['지상2층','지하1층','지상2층','','지상중1층','지상2층'];d.markers=F.map((f,i)=>({id:'g'+i,uid:'g'+i,typeKey:k,xPct:10+i*10,yPct:30,seq:i+1,rptFloor:f}));__markerDbg.renderTable();return true})()`);
await click('btnDrawerRight');
const layout = () => ev(`[...document.querySelectorAll('#markerTable > .mc-group-head, #markerTable > .marker-card')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.classList.contains('mc-group-head')?'['+e.dataset.group+']':e.dataset.id)`);
eq(await layout(), ['[지하1층]', 'g1', '[지상중1층]', 'g4', '[지상2층]', 'g0', 'g2', 'g5', '[]', 'g3'], '아래층부터 층 제목 아래에 모인다(층 미정은 맨 끝, 번호 순서는 그대로)');
eq(await ev(`[...document.querySelectorAll('#markerTable .mc-group-head')].map(h=>h.textContent)`), ['▾지하1층1건', '▾지상중1층1건', '▾지상2층3건', '▾층 미정1건'], '제목에 층 이름과 건수');
await shot('1119g-groups.png');
await ev(`[...document.querySelectorAll('#markerTable .mc-group-head')].find(h=>h.dataset.group==='지상2층').click(); true`); await sleep(200);
eq(await layout(), ['[지하1층]', 'g1', '[지상중1층]', 'g4', '[지상2층]', '[]', 'g3'], '층 제목을 누르면 그 층만 접힌다');
await ev(`[...document.querySelectorAll('#markerTable .mc-group-head')].find(h=>h.dataset.group==='지상2층').click(); true`); await sleep(200);
eq((await layout()).length, 10, '  다시 누르면 펼친다');
await ev(`(()=>{const e=document.getElementById('markerSearchInput');e.value='지하';e.dispatchEvent(new Event('input'));return true})()`); await sleep(150);
eq(await layout(), ['[지하1층]', 'g1'], '검색으로 걸러진 층은 제목도 숨긴다');
await ev(`(()=>{const e=document.getElementById('markerSearchInput');e.value='';e.dispatchEvent(new Event('input'));return true})()`); await sleep(100);
await ev(`(()=>{${D}.markers.forEach(m=>m.rptFloor='지상2층');__markerDbg.renderTable();return true})()`); await sleep(100);
eq(await ev(`document.querySelectorAll('#markerTable .mc-group-head').length`), 0, '층이 하나뿐이면 제목 없이 예전처럼');
await click('btnDrawerRight');

console.log('\n[좁게 줄여 둔 서랍에도 탭이 붙는다 — 사용자 캡처]');
for (const [w, h, width] of [[1912, 974, 674], [1280, 800, 560], [1280, 800, null]]) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  await ev(`document.querySelector('.sidebar.right').style.width=${width ? `'${width}px'` : `''`}; true`);
  await click('btnDrawerRight', 450);
  const g = await ev(`(()=>{const t=document.getElementById('btnDrawerRight').getBoundingClientRect(),d=document.querySelector('.sidebar.right').getBoundingClientRect();return {틈:d.left-t.right,서랍폭:Math.round(d.width)}})()`);
  ok(g.틈 <= 0 && g.틈 >= -1.5, `${w}px · 서랍 ${g.서랍폭}px : 결함목록 탭이 서랍에 붙는다`, g);
  if (width === 674) await shot('1119g-tab-674.png');
  await click('btnDrawerRight', 400);
}
await ev(`document.querySelector('.sidebar.right').style.width=''; true`);

console.log(`\n${passes} 통과 / ${fails} 실패`);
finish(cdp, fails ? 1 : 0);
