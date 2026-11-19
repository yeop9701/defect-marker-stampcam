/* 2026-11-18 : 태블릿 그리기 작업바를 하단 바 하나로 합친 것 검사 — 실제 브라우저.
   가로(1280·1480) : 도구 7개 + 색·굵기 펼침 / 세로(800)·좁은 가로(1024) : 색·굵기는 단추 하나씩.
   어느 크기에서도 바가 옆으로 밀리지 않아야 하고, 도구별 설정은 ⚙ 로 연다.

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더> about:blank
     node tests/test-1118e.mjs                                                       */
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
const vis = (s) => ev(`[...document.querySelectorAll('${s}')].filter(e=>{const c=getComputedStyle(e);return c.display!=='none'&&c.visibility!=='hidden'&&e.getClientRects().length>0}).length`);
const tool = async (t) => { await ev(`__markerDbg.setSketchTool(${t ? `'${t}'` : 'null'}); true`); await sleep(180); };
const click = async (id) => { await ev(`document.getElementById('${id}').click(); true`); await sleep(150); };
const tap = async (sel) => {
  const p = await ev(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] }); await sleep(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(550);
};
const fit = () => ev(`(()=>{const b=document.getElementById('tabletFloatBar'),r=b.getBoundingClientRect();return {밀림:b.scrollWidth-b.clientWidth,왼:Math.round(r.left),오:Math.round(innerWidth-r.right),폭:Math.round(r.width)}})()`);
const fits = (f) => f.밀림 <= 0 && f.왼 >= 0 && f.오 >= 0;
async function boot(w, h) {
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: APP }); await sleep(800);
  await ev(`localStorage.clear(); localStorage.setItem('defectMarkerTabletMode_v1','on'); true`);
  await cdp.send('Page.navigate', { url: APP }); await sleep(1400);
  const r = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#addDrawingInput')` });
  await cdp.send('DOM.setFileInputFiles', { files: [ROOT + 'test-fixtures/plan.png'], objectId: r.result.objectId }); await sleep(1000);
}

// 2026-11-19 : 마킹 단추를 남기면서 폭에 맞춰 굵기 → 색 → (마지막에) 마킹 단추 순으로 접는다
for (const [w, h, colors, widths, types] of [[1280, 800, true, false, 4], [1480, 924, true, true, 4], [1024, 768, false, false, 4], [800, 1280, false, false, 0]]) {
  const wide = colors;
  console.log(`\n[${w}×${h}] 색 ${colors ? '펼침' : '접음'} · 굵기 ${widths ? '펼침' : '접음'} · 마킹 ${types ? types + '개' : '단추 하나'}`);
  await boot(w, h);
  await click('btnFloatSketchMode'); await sleep(200);
  eq(await vis('#tabletFloatSketchGroup [data-sketch-tool]'), 7, '하단 바에 도구 7개');
  eq([await vis('#canvasFloatBar'), await vis('#sketchToolGroup')], [0, 0], '세부 작업바는 없다');
  eq(await vis('#tabletFloatSketchGroup .sketch-color-btn'), colors ? 6 : 0, `바의 색 ${colors ? '6개' : '없음(단추로)'}`);
  eq(await vis('#tabletFloatSketchGroup > .float-sketch-width'), widths ? 4 : 0, `바의 굵기 ${widths ? '4개' : '없음(단추로)'}`);
  eq([await vis('#btnFloatColorPick'), await vis('#btnFloatWidthPick')], [colors ? 0 : 1, widths ? 0 : 1], '색·굵기 단추');
  eq([await vis('#tabletFloatTypeGrid .tablet-float-type-btn'), await vis('#btnFloatTypePick')], [types, types ? 0 : 1], '그리는 중에도 마킹 단추가 있다');
  let f = await fit(); ok(fits(f), '직선 : 바가 화면 안, 옆으로 밀리지 않는다', f);
  await shot(`1118e-${w}-line.png`);
  for (const t of ['text', 'sketchErase']) { await tool(t); f = await fit(); ok(fits(f), `${t} : 바가 화면 안`, f); }
  await tool('line');
  ok(await ev(`document.querySelector('.float-sketch-tool[data-sketch-tool=line]').classList.contains('active')`), '지금 도구가 켜져 보인다');
  await tap('.float-sketch-tool[data-sketch-tool=rect]');
  ok(await ev(`document.querySelector('.float-sketch-tool[data-sketch-tool=rect]').classList.contains('active')`), '하단 바의 도구를 누르면 바뀐다');

  // ⚙
  await tool('line');
  ok(await ev(`document.getElementById('btnFloatSketchSettings').disabled`), '직선(모눈 끔)은 설정할 것이 없어 ⚙ 가 꺼져 있다');
  await tool('sketchErase');
  ok(!(await ev(`document.getElementById('btnFloatSketchSettings').disabled`)), '선 지우개는 ⚙ 가 켜진다');
  eq(await vis('#canvasFloatBar'), 0, '  누르기 전에는 도면을 가리지 않는다');
  await tap('#btnFloatSketchSettings');
  eq([await vis('#canvasFloatBar'), await vis('#sketchEraseSizeGroup'), await vis('#sketchToolGroup')], [1, 1, 0], '⚙ : 지우개 굵기만 뜬다');
  const noOverlap = await ev(`(()=>{const a=document.getElementById('canvasFloatBar').getBoundingClientRect(),b=document.getElementById('tabletFloatBar').getBoundingClientRect();return a.bottom<=b.top&&a.left>=0&&a.right<=innerWidth})()`);
  ok(noOverlap, '  하단 바와 겹치지 않고 화면 안');
  await shot(`1118e-${w}-settings.png`);
  await tap('#btnSketchErasePlus');
  eq(await vis('#canvasFloatBar'), 1, '  설정을 조절해도 닫히지 않는다');
  const c = await ev(`(()=>{const r=document.getElementById('mainCanvas').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/3)}})()`);
  await ev(`document.getElementById('mainCanvas').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:3,clientX:${c.x},clientY:${c.y}})); true`); await sleep(120);
  eq(await vis('#canvasFloatBar'), 0, '  도면을 누르면 닫힌다');
  await tool('text'); await click('btnFloatSketchSettings');
  eq([await vis('#sketchTextGroup'), await vis('#sketchEraseSizeGroup')], [1, 0], '글자 : ⚙ 에 글상자 설정');
  await click('btnFloatSketchSettings'); await tool('line');
  await click('btnFloatSketchGrid');
  ok(!(await ev(`document.getElementById('btnFloatSketchSettings').disabled`)), '모눈을 켜면 직선에서도 ⚙ 가 켜진다');
  await click('btnFloatSketchSettings');
  eq(await vis('#sketchGridDivGroup'), 1, '  ⚙ 에 모눈 칸');
  await click('btnFloatSketchGrid'); await sleep(100);
  eq([await vis('#canvasFloatBar'), await ev(`document.getElementById('btnFloatSketchSettings').disabled`)], [0, true], '  모눈을 끄면 설정 창도 닫힌다');

  // 접힌 색·굵기
  if (!wide) {
    eq(await ev(`(()=>{const a=document.querySelector('#btnFloatColorPick .float-pick-swatch').getBoundingClientRect(),b=document.querySelector('#btnFloatWidthPick .float-pick-width').getBoundingClientRect();return [Math.round(a.width),Math.round(a.height),Math.round(b.width)]})()`), [20, 20, 22], '색 단추는 동그랗고 굵기 단추는 제 길이');
    await tap('#btnFloatColorPick');
    eq(await vis('#tabletSketchPop .sketch-color-btn'), 6, '색 단추 : 고르기 창에 6색');
    const p = await ev(`(()=>{const a=document.getElementById('tabletSketchPop').getBoundingClientRect(),b=document.getElementById('tabletFloatBar').getBoundingClientRect();return a.bottom<=b.top&&a.left>=0&&a.right<=innerWidth})()`);
    ok(p, '  창이 하단 바 위, 화면 안');
    await shot(`1118e-${w}-color.png`);
    const col = await ev(`document.querySelectorAll('#tabletSketchPop .sketch-color-btn')[2].dataset.sketchColor`);
    await tap('#tabletSketchPop .sketch-color-btn:nth-child(3)');
    eq(await vis('#tabletSketchPop'), 0, '  고르면 닫힌다');
    eq(await ev(`getComputedStyle(document.querySelector('#btnFloatColorPick .float-pick-swatch')).getPropertyValue('--sk-color').trim().toLowerCase()`), String(col).toLowerCase(), '  단추가 고른 색을 보여 준다');
    await tap('#btnFloatWidthPick');
    eq(await vis('#tabletSketchPop .float-sketch-width'), 4, '굵기 단추 : 고르기 창에 4개');
    await tap('#tabletSketchPop .float-sketch-width[data-sketch-width="1.8"]');
    eq(await ev(`document.querySelector('#btnFloatWidthPick .float-pick-width').style.height`), '4.5px', '  단추가 고른 굵기를 보여 준다');
    await tool('sketchErase');
    eq([await vis('#btnFloatColorPick'), await vis('#btnFloatWidthPick')], [0, 0], '선 지우개를 들면 색·굵기 단추도 숨는다');
  }
  // 「선택」으로 그린 선을 고르면 색·굵기만
  await ev(`(()=>{const d=__markerDbg.getActiveDrawing();d.sketch=[{id:'s1',tool:'line',pts:[{x:10,y:10},{x:30,y:10}],color:'#000',w:1}];__markerDbg.renderCanvas();return true})()`);
  await tool('pick');
  eq(await vis('#tabletFloatSketchGroup [data-sketch-tool]'), 0, '「선택」 중에는 그리기 도구가 나오지 않는다');
  eq(await vis('#btnFloatSketchSettings'), 0, '  ⚙ 도 나오지 않는다');
  await tool(null);
  eq(await vis('#tabletFloatSketchGroup'), 0, '그리기를 끄면 묶음이 사라진다');
  ok((await vis('#tabletFloatTypeGrid')) === 1, '  결함 유형 단추가 돌아온다');
}

console.log('\n[컴퓨터 화면]');
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp.send('Page.navigate', { url: APP }); await sleep(600);
await ev(`localStorage.clear(); localStorage.setItem('defectMarkerTabletMode_v1','off'); true`);
await cdp.send('Page.navigate', { url: APP }); await sleep(1300);
const r = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#addDrawingInput')` });
await cdp.send('DOM.setFileInputFiles', { files: [ROOT + 'test-fixtures/plan.png'], objectId: r.result.objectId }); await sleep(900);
await tool('line');
eq([await vis('#sketchToolGroup'), await vis('#sketchColorRow'), await vis('#tabletFloatBar')], [1, 1, 0], '컴퓨터 화면의 그리기 도구줄은 그대로');

console.log(`\n${passes} 통과 / ${fails} 실패`);
finish(cdp, fails ? 1 : 0);
