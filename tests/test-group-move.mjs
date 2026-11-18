/* 여럿 골라 한꺼번에 옮기기 · 「선택」을 눌러도 「그리기」가 같이 켜지지 않기 — 실제 브라우저 검사.

   보는 것 : 「선택」으로 마커 2개 + 그린 선 2개를 범위로 고른 뒤
     ① 선택 모드에서 마커를 끌면 넷이 다 같이 움직이는지, 선을 끌어도 넷이 다 같이 움직이는지
     ② 「이동」 단추를 눌러도 고른 것이 그대로 남고, 이동 모드에서 마커·선 어느 쪽을 끌어도 넷이 함께 가는지
     ③ 태블릿(손가락 터치)으로 끌어도 같은지
     ④ 「선택」 단추를 누르면 「그리기」 단추·그리기 도구가 켜져 보이지 않는지, 선택 중 「그리기」를 누르면
        그리기로 넘어가는지

     chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<임시폴더> about:blank
     node tests/test-group-move.mjs                                                          */
import { connect, drag, click, key, finish } from './cdp.mjs';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const APP = process.env.APP_URL || new URL('../index.html', import.meta.url).href;
const OUT = fileURLToPath(new URL('./out/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const cdp = await connect(Number(process.env.CDP_PORT || 9222));
const ev = (s) => cdp.evaluate(s);
let fails = 0, passes = 0;
const ok = (cond, msg, extra) => {
  if (cond) passes++; else fails++;
  console.log((cond ? '  OK   ' : '  FAIL ') + msg + (!cond && extra !== undefined ? '  → ' + JSON.stringify(extra) : ''));
};
const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT + name, Buffer.from(data, 'base64'));
};
const VK = { KeyL:76, KeyS:83, Escape:27 };
const tap = async (code, ch) => key(cdp, { code, keyStr: ch, windowsVirtualKeyCode: VK[code] });

await cdp.send('DOM.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 950, deviceScaleFactor: 1, mobile: false });
await cdp.send('Page.navigate', { url: APP });
await sleep(1500);
await ev('try{localStorage.clear()}catch(e){}; true');
await cdp.send('Page.navigate', { url: APP });
await sleep(1800);
const r = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#addDrawingInput')` });
await cdp.send('DOM.setFileInputFiles', { files: [ROOT + 'test-fixtures/plan.png'], objectId: r.result.objectId });
await sleep(1400);
ok(await ev('!!__markerDbg.getActiveDrawing()'), '도면을 한 장 올렸다');

const screenOfPct = async (xPct, yPct) => await ev(`(()=>{const c=document.getElementById('mainCanvas');
  const r=c.getBoundingClientRect();
  return { x: Math.round(r.left + ${xPct}/100*r.width), y: Math.round(r.top + ${yPct}/100*r.height) };})()`);
const ptAt = (fx, fy) => screenOfPct(fx*100, fy*100);
const state = () => ev(`(()=>({ tool:__markerDbg.sketchTool, select:__markerDbg.selectMode,
  strokes:__markerDbg.selectedSketchIds.length, markers:__markerDbg.selectedIds.length }))()`);
/* 마커 2개(xPct) + 선 2개(첫 점) 위치 */
const snap = () => ev(`(()=>{const d=__markerDbg.getActiveDrawing();
  return { m: d.markers.map(m=>({x:m.xPct,y:m.yPct})), s: d.sketch.map(s=>({x:s.pts[0].x,y:s.pts[0].y})) };})()`);
/* 넷이 모두 같은 양(dx,dy)만큼 움직였는지 */
const allMoved = (a, b, msg) => {
  const ds = [...a.m.map((p,i)=>({dx:b.m[i].x-p.x, dy:b.m[i].y-p.y})), ...a.s.map((p,i)=>({dx:b.s[i].x-p.x, dy:b.s[i].y-p.y}))];
  const d0 = ds[0];
  const same = ds.every(d=> Math.abs(d.dx-d0.dx) < 0.3 && Math.abs(d.dy-d0.dy) < 0.3);
  ok(same && Math.hypot(d0.dx, d0.dy) > 2, msg, ds.map(d=>[+d.dx.toFixed(2), +d.dy.toFixed(2)]));
};
const markerPt = async (i) => { const m = (await snap()).m[i]; return screenOfPct(m.x, m.y); };
const linePt = async (i) => {
  const c = await ev(`(()=>{const s=__markerDbg.getActiveDrawing().sketch[${i}]; return {x:(s.pts[0].x+s.pts[1].x)/2, y:(s.pts[0].y+s.pts[1].y)/2};})()`);
  return screenOfPct(c.x, c.y);
};
const clickEl = async (id) => {
  const b = await ev(`(()=>{const r=document.getElementById('${id}').getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)};})()`);
  await click(cdp, b.x, b.y); await sleep(250);
};
const touchDrag = async (a, b, steps = 12) => {
  await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x:a.x, y:a.y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{ x:a.x+(b.x-a.x)*i/steps, y:a.y+(b.y-a.y)*i/steps }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
  await sleep(300);
};
const btnActive = (id) => ev(`document.getElementById('${id}').classList.contains('active')`);
const visible = (id) => ev(`(()=>{const e=document.getElementById('${id}'); return !!e && e.offsetParent!==null && getComputedStyle(e).display!=='none';})()`);

let p = await ptAt(0.5, 0.5);
await click(cdp, p.x, p.y); await sleep(200);
await ev('__markerDbg.getActiveDrawing().markers = []; __markerDbg.renderCanvas(); true');

/* ── 준비 : 선 2개, 마커 2개 ── */
await tap('KeyL', 'l'); await sleep(150);
let a = await ptAt(0.15, 0.20), b = await ptAt(0.40, 0.20); await drag(cdp, [a, b]); await sleep(250);
a = await ptAt(0.15, 0.30); b = await ptAt(0.40, 0.30); await drag(cdp, [a, b]); await sleep(250);
await tap('Escape', 'Escape'); await sleep(200);
p = await ptAt(0.55, 0.45); await click(cdp, p.x, p.y); await sleep(300);
await tap('Escape', 'Escape'); await sleep(150);
p = await ptAt(0.62, 0.52); await click(cdp, p.x, p.y); await sleep(300);
await tap('Escape', 'Escape'); await sleep(150);
ok(await ev('__markerDbg.getActiveDrawing().sketch.length') === 2 && await ev('__markerDbg.getActiveDrawing().markers.length') === 2,
  '선 2개·마커 2개를 만들었다', await snap());

/* ── ④ 「선택」 단추를 눌러도 「그리기」가 켜져 보이지 않는다 ── */
await clickEl('btnSelectMode');
let st = await state();
ok(st.tool === 'pick' && st.select, '「선택」 단추로 선택이 켜졌다', st);
ok(await btnActive('btnSelectMode'), '「선택」 단추가 켜져 보인다');
ok(!(await btnActive('btnSketchMode')), '「그리기」 단추는 켜져 보이지 않는다');
ok(!(await ev(`document.body.classList.contains('mode-sketch')`)), '도면 테두리·이름표가 그리기(청록)가 아니다');
ok(await ev(`document.body.classList.contains('mode-select')`), '도면 테두리·이름표는 선택(보라)이다');
ok(!(await visible('sketchToolGroup')), '그리기 도구(직선·사각형…) 단추가 보이지 않는다');
await shot('group-move-select-mode.png');

/* ── 범위로 넷 다 고르기 ── */
a = await ptAt(0.05, 0.08); b = await ptAt(0.90, 0.80);
await drag(cdp, [a, b]); await sleep(300);
st = await state();
ok(st.strokes === 2 && st.markers === 2, '범위로 선 2·마커 2를 함께 골랐다', st);

/* ── ① 선택 모드 : 마커를 끌면 넷이 같이 ── */
let s0 = await snap();
p = await markerPt(0);
await drag(cdp, [p, { x: p.x + 60, y: p.y + 40 }]); await sleep(300);
let s1 = await snap();
allMoved(s0, s1, '선택 모드 : 골라 둔 마커를 끌면 고른 마커·선 넷이 다 같이 움직인다');
st = await state();
ok(st.strokes === 2 && st.markers === 2, '옮긴 뒤에도 넷 다 골라져 있다', st);

await ev('__markerDbg.undo(); true'); await sleep(300);
let su = await snap();
ok(JSON.stringify(su) === JSON.stringify(s0), '실행취소 한 번에 넷 다 제자리로', { su, s0 });
// 실행취소가 선택을 놓았을 수 있으므로 다시 고른다
st = await state();
if (!(st.strokes === 2 && st.markers === 2)) {
  await ev("__markerDbg.setSketchTool('pick'); true"); await sleep(150);
  a = await ptAt(0.05, 0.08); b = await ptAt(0.90, 0.80); await drag(cdp, [a, b]); await sleep(300);
}

/* ── ① 선택 모드 : 선을 끌어도 넷이 같이 ── */
s0 = await snap();
p = await linePt(1);
await drag(cdp, [p, { x: p.x - 50, y: p.y + 35 }]); await sleep(300);
s1 = await snap();
allMoved(s0, s1, '선택 모드 : 골라 둔 선을 끌어도 넷이 다 같이 움직인다');

/* ── ② 「이동」을 눌러도 고른 것이 남고, 끌면 넷이 같이 ── */
await clickEl('btnMoveMode');
st = await state();
ok(await btnActive('btnMoveMode') && !st.select, '「이동」 모드로 바뀌었다', st);
ok(st.strokes === 2 && st.markers === 2, '「이동」으로 바꿔도 고른 마커·선이 그대로 남는다', st);
s0 = await snap();
p = await markerPt(1);
await drag(cdp, [p, { x: p.x + 45, y: p.y - 30 }]); await sleep(300);
s1 = await snap();
allMoved(s0, s1, '이동 모드 : 마커를 끌면 고른 넷이 다 같이 움직인다');
s0 = await snap();
p = await linePt(0);
await drag(cdp, [p, { x: p.x + 40, y: p.y + 25 }]); await sleep(300);
s1 = await snap();
allMoved(s0, s1, '이동 모드 : 골라 둔 선을 끌어도 넷이 다 같이 움직인다');

/* ── ③ 터치(태블릿)로 끌어도 넷이 같이 ── */
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await sleep(400);   // 켠 직후 첫 터치는 브라우저가 흘려버릴 때가 있다
s0 = await snap();
p = await markerPt(0);
await touchDrag(p, { x: p.x - 50, y: p.y + 30 });
s1 = await snap();
allMoved(s0, s1, '이동 모드 · 터치 : 마커를 손가락으로 끌어도 넷이 같이 움직인다');
await clickEl('btnSelectMode');
st = await state();
ok(st.strokes === 2 && st.markers === 2, '다시 「선택」으로 와도 고른 것이 남는다', st);
s0 = await snap();
p = await linePt(0);
await touchDrag(p, { x: p.x + 40, y: p.y - 25 });
s1 = await snap();
allMoved(s0, s1, '선택 모드 · 터치 : 선을 손가락으로 끌어도 넷이 같이 움직인다');
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });

/* ── 고르지 않은 것을 새로 잡으면 그것 하나만 (예전 약속 유지) ── */
await ev("__markerDbg.setSketchTool('pick'); true"); await sleep(150);
p = await ptAt(0.95, 0.95); await click(cdp, p.x, p.y); await sleep(250);   // 빈 곳 = 선택 해제
st = await state();
ok(st.strokes === 0 && st.markers === 0, '빈 곳을 누르면 선택이 풀린다', st);
s0 = await snap();
p = await markerPt(0);
await drag(cdp, [p, { x: p.x + 30, y: p.y + 30 }]); await sleep(300);
s1 = await snap();
const onlyFirst = Math.abs(s1.m[0].x - s0.m[0].x) > 1 && s1.m[1].x === s0.m[1].x && s1.s[0].x === s0.s[0].x && s1.s[1].x === s0.s[1].x;
ok(onlyFirst, '고르지 않은 마커를 끌면 그 마커 하나만 움직인다', { s0, s1 });

/* ── 선택 중 「그리기」를 누르면 그리기로 넘어간다 ── */
await clickEl('btnSketchMode');
st = await state();
ok(st.tool && st.tool !== 'pick' && !st.select, '선택 중 「그리기」를 누르면 그리는 도구로 넘어간다', st);
ok(await btnActive('btnSketchMode') && !(await btnActive('btnSelectMode')), '그때는 「그리기」만 켜져 보인다');
ok(await visible('sketchToolGroup'), '그리기 도구 단추가 보인다');
await clickEl('btnSketchMode');
ok((await state()).tool === null, '그리기에서 「그리기」를 다시 누르면 꺼진다');

/* ── 태블릿 하단 바의 「선택」도 같은지 ── */
const hasFloat = await ev(`!!document.getElementById('btnFloatSelectMode')`);
if (hasFloat) {
  await ev(`document.getElementById('btnFloatSelectMode').click(); true`); await sleep(200);
  ok(!(await ev(`document.getElementById('btnFloatSketchMode') && document.getElementById('btnFloatSketchMode').classList.contains('active')`)),
    '하단 바 「선택」을 눌러도 하단 바 「그리기」가 켜져 보이지 않는다');
  ok(!(await ev(`document.body.classList.contains('mode-sketch')`)), '하단 바 그리기 도구 묶음도 나오지 않는다');
}

console.log(`\n${passes} 통과 / ${fails} 실패`);
finish(cdp, fails ? 1 : 0);
