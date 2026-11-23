/* 2026-11-23 요청 검사 — 매끄러운 자유선, 펼친 「다 채운 결함」 다시 접기, JSON 불러오면 손글씨 자동 변환.

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더> about:blank
     node tests/test-1123.mjs                                                        */
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

async function boot(extra = '', fixture = 'plan.png') {
  await cdp.send('DOM.enable');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: APP }); await sleep(800);
  await ev(`localStorage.clear(); localStorage.setItem('defectMarkerTabletMode_v1','on'); ${extra} true`);
  await cdp.send('Page.navigate', { url: APP }); await sleep(1400);
  if (!fixture) return;
  const r = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#addDrawingInput')` });
  await cdp.send('DOM.setFileInputFiles', { files: [ROOT + 'test-fixtures/' + fixture], objectId: r.result.objectId }); await sleep(1100);
}
const canvasRect = () => ev(`(()=>{const r=document.getElementById('mainCanvas').getBoundingClientRect();return {l:r.left,t:r.top,w:r.width,h:r.height}})()`);
// 펜으로 그리듯 터치 이벤트를 보낸다 (CDP 는 포인터 이벤트도 함께 만든다)
async function drawTouch(pts) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0].x, y: pts[0].y }] });
  for (const p of pts.slice(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y }] }); await sleep(8); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(250);
}
async function drawMouse(pts) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0].x, y: pts[0].y, button: 'left', clickCount: 1 });
  for (const p of pts.slice(1)) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'left', buttons: 1 }); await sleep(8); }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pts.at(-1).x, y: pts.at(-1).y, button: 'left', clickCount: 1 }); await sleep(250);
}
// 손떨림을 섞은 「S」자 곡선
const wobble = (i) => ((i * 7919) % 11 - 5) * 0.6;
function sCurve(r, cx, cy, n = 70) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = t * Math.PI * 2;
    out.push({ x: Math.round(cx + Math.sin(a) * r.w * 0.12 + wobble(i)), y: Math.round(cy - r.h * 0.15 + t * r.h * 0.3 + wobble(i + 3)) });
  }
  return out;
}
// 꺾임 정도 — 이웃한 선분 사이 각도(도)의 최댓값·평균 (원본 px 기준)
const turnStats = (strokeExpr) => ev(`(()=>{const d=${D};const s=${strokeExpr};const P=s.pts.map(p=>({x:p.x/100*d.naturalW,y:p.y/100*d.naturalH}));
  const ang=[];for(let i=1;i<P.length-1;i++){const a=Math.atan2(P[i].y-P[i-1].y,P[i].x-P[i-1].x),b=Math.atan2(P[i+1].y-P[i].y,P[i+1].x-P[i].x);let t=Math.abs(b-a)*180/Math.PI;if(t>180)t=360-t;ang.push(t);}
  return {n:P.length,at:ang.indexOf(Math.max(...ang)),tool:s.tool,max:Math.max(0,...ang),avg:ang.length?ang.reduce((x,y)=>x+y,0)/ang.length:0}})()`);

console.log('\n[1. 자유선 — 손글씨처럼 매끄럽게]');
await boot();
await ev(`__markerDbg.setSketchTool('pen'); true`); await sleep(200);
const r = await canvasRect();
const curveA = sCurve(r, r.l + r.w * 0.35, r.t + r.h * 0.5);
await drawTouch(curveA);
let st = await turnStats(`${D}.sketch.at(-1)`);
ok(st.tool === 'pen', '곡선은 자유선으로 남는다', st);
ok(st.n >= 20, `점을 충분히 남긴다(예전 0.18% 솎아내기는 각졌다) — ${st.n}개`, st);
ok(st.max < 80 && st.avg < 22, `손떨림이 걸러져 꺾임이 작다(수정 전 같은 입력 : 최대 120°, 평균 39°) — 최대 ${st.max.toFixed(1)}°, 평균 ${st.avg.toFixed(1)}°`, st);
const endPx = await ev(`(()=>{const p=${D}.sketch.at(-1).pts.at(-1),cv=document.getElementById('mainCanvas').getBoundingClientRect();return [Math.round(cv.left+p.x/100*cv.width),Math.round(cv.top+p.y/100*cv.height)]})()`);
ok(Math.abs(endPx[0] - curveA.at(-1).x) <= 1 && Math.abs(endPx[1] - curveA.at(-1).y) <= 1, '손을 뗀 자리까지 선이 닿는다(끌려오던 끝을 이어 줌)', { endPx, raw: curveA.at(-1) });
await drawMouse(sCurve(r, r.l + r.w * 0.65, r.t + r.h * 0.5));
st = await turnStats(`${D}.sketch.at(-1)`);
ok(st.tool === 'pen' && st.n >= 20 && st.avg < 22, `마우스로 그려도 같다 — 점 ${st.n}, 평균 ${st.avg.toFixed(1)}°`, st);
const line = []; for (let i = 0; i <= 30; i++) line.push({ x: Math.round(r.l + r.w * 0.2 + i * r.w * 0.015), y: Math.round(r.t + r.h * 0.85 + wobble(i) * 0.5) });
await drawTouch(line);
eq(await ev(`[${D}.sketch.at(-1).tool, ${D}.sketch.at(-1).pts.length]`), ['line', 2], '거의 곧은 획은 여전히 직선으로 편다');
eq(await ev(`(()=>{let q=0;const o=CanvasRenderingContext2D.prototype.quadraticCurveTo;CanvasRenderingContext2D.prototype.quadraticCurveTo=function(){q++;return o.apply(this,arguments)};__markerDbg.renderCanvas();CanvasRenderingContext2D.prototype.quadraticCurveTo=o;return q>10})()`), true, '자유선을 곡선으로 그린다');
eq(await ev(`__markerDbg.buildProjectSnapshot().drawings[0].sketch.filter(x=>x.tool==='pen').length`), 2, '프로젝트 저장에 자유선 2개가 그대로');
await ev(`__markerDbg.setSketchTool(null); true`);
await shot('1123-pen.png');

console.log('\n[2. 펼친 다 채운 결함 → 다시 접기]');
await ev(`(()=>{const d=${D};const k=__markerDbg.info.allPresets()[0].series[0].key;d.markers=[{id:'a',uid:'a',typeKey:k,xPct:10,yPct:10,seq:1,rptType:'수직',rptMember:'콘크리트',rptDefect:'균열',rptFloor:'지상1층'},{id:'b',uid:'b',typeKey:k,xPct:20,yPct:10,seq:2}];__markerDbg.renderTable();return true})()`);
await ev(`document.getElementById('btnDrawerRight').click(); true`); await sleep(500);
const cardA = `document.querySelector('.marker-card[data-id=a]')`;
eq(await ev(`${cardA}.classList.contains('mc-folded')`), true, '다 채운 결함은 한 줄로 접혀 있다');
await ev(`${cardA}.querySelector('.mc-fold-sum').click(); true`); await sleep(400);
eq(await ev(`[${cardA}.classList.contains('mc-folded'), ${cardA}.classList.contains('mc-unfolded'), !!${cardA}.querySelector('[data-role=rptDefect]').offsetParent]`), [false, true, true], '누르면 펼쳐지고 칸이 보인다');
eq(await ev(`${cardA}.querySelector('.mc-fold-sum .fs-close').textContent`), '▴ 접기', '펼친 카드 맨 위에 「▴ 접기」');
await shot('1123-unfolded.png');
await ev(`${cardA}.querySelector('.mc-fold-sum').click(); true`); await sleep(400);
eq(await ev(`[${cardA}.classList.contains('mc-folded'), __markerDbg.selectedIds.includes('a')]`), [true, false], '요약 줄을 다시 누르면 접히고 선택도 풀린다');
eq(await ev(`!!document.querySelector('.marker-card[data-id=b] .mc-fold-sum')`), false, '안 채운 결함에는 요약 줄이 없다');
await ev(`${cardA}.querySelector('.mc-fold-sum').click(); true`); await sleep(300);
await ev(`(()=>{const i=${cardA}.querySelector('[data-role=rptWidth]');i.focus();i.value='0.3';i.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
await ev(`__markerDbg.renderTable(); true`); await sleep(200);
eq(await ev(`${cardA}.classList.contains('mc-unfolded')`), true, '고치는 중에는 다시 그려도 펼친 채');
await ev(`${cardA}.querySelector('.mc-fold-sum').click(); true`); await sleep(300);
eq(await ev(`${cardA}.classList.contains('mc-folded')`), true, '고친 뒤 「접기」로 접힌다');
await ev(`document.getElementById('btnFoldToggle').click(); true`); await sleep(300);
eq(await ev(`!!${cardA}.querySelector('.mc-fold-sum')`), false, '「완료 접기: 끔」이면 요약 줄 없음');
await ev(`document.getElementById('btnFoldToggle').click(); true`); await sleep(200);

console.log('\n[3. JSON 을 옮겨 와 열면 손글씨 자동 변환]');
const pendingInk = { rptLoc: { w: 100, h: 50, s: [[1, 1, 20, 20, 40, 10]], st: 'pending' }, rptMember: { w: 100, h: 50, s: [[5, 5, 30, 30]], st: 'error', err: 'old fail' } };
await ev(`(()=>{const d=${D};d.markers=[{id:'a',uid:'a',typeKey:d.markers[0].typeKey,xPct:10,yPct:10,seq:1,rptType:'수직',ink:${JSON.stringify(pendingInk)}}];return true})()`);
const proj = await ev(`JSON.stringify(__markerDbg.buildProjectSnapshot())`);
ok(proj.includes('"rptLoc"') && proj.includes('"pending"'), 'JSON 에 손글씨가 담긴다');
writeFileSync(OUT + '1123-ink.json', proj);
async function openJson(settings, mock) {
  await boot(`localStorage.setItem('defectMarkerInk_v1', JSON.stringify(${JSON.stringify(settings)}));`, null);
  await ev(`window.__sent=[];Ink.convert=${mock};true`);
  const fi = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#loadProjectInput')` });
  await cdp.send('DOM.setFileInputFiles', { files: [OUT + '1123-ink.json'], objectId: fi.result.objectId }); await sleep(2600);
}
await openJson({ on: false, engine: 'google', auto: true },
  `async(items,o)=>{for(const it of items){__sent.push(it.k);o.onResult(it,{text:it.k==='rptLoc'?'계단실':'콘크리트',alts:[]},null,'google');}}`);
eq(await ev(`__sent.sort()`), ['rptLoc', 'rptMember'], '열자마자 변환으로 보낸다(손글씨 입력 끔이어도, 예전 실패 칸도 한 번 더)');
eq(await ev(`(()=>{const m=${D}.markers[0];return [m.rptLoc,m.rptMember,m.ink.rptLoc.st,m.ink.rptMember.st]})()`), ['계단실', '콘크리트', 'done', 'done'], '글자가 칸에 들어간다');
await openJson({ on: false, engine: 'google', auto: false }, `async(items,o)=>{for(const it of items)__sent.push(it.k);}`);
eq(await ev(`__sent.length`), 0, '「자동 변환」을 끈 기기에서는 보내지 않는다');

console.log(`\n통과 ${passes} · 실패 ${fails}`);
process.exit(fails ? 1 : 0);
