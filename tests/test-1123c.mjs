/* 2026-11-23 3차 — 지우개 점선 원이 따라다님, 선 지우개가 결함 마킹도 지움, 「지우개」→「부분 삭제」,
   부분 삭제 미리보기가 그린 선을 덮어 지워지는 것처럼 보이던 것.

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더> about:blank
     node tests/test-1123c.mjs                                                       */
import { connect } from './cdp.mjs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

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
const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });

async function boot() {
  await cdp.send('DOM.enable');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: APP }); await sleep(800);
  await ev(`localStorage.clear(); localStorage.setItem('defectMarkerTabletMode_v1','on'); true`);
  await cdp.send('Page.navigate', { url: APP }); await sleep(1400);
  await ev(`__markerDbg.addBlankDrawing(); true`); await sleep(800);
}
const rect = () => ev(`(()=>{const r=document.getElementById('mainCanvas').getBoundingClientRect();return {l:r.left,t:r.top,w:r.width,h:r.height}})()`);
// 화면 좌표 → 캔버스 backing px
const toCv = (r, x, y) => ev(`(()=>{const c=document.getElementById('mainCanvas');return [Math.round((${x}-${r.l})*c.width/${r.w}),Math.round((${y}-${r.t})*c.height/${r.h})]})()`);
const cur = async () => { const p = await ev(`__markerDbg.eraseCursorPt`); return p ? [Math.round(p.x), Math.round(p.y)] : null; };
const near = (a, b) => !!a && !!b && Math.abs(a[0] - b[0]) <= 2 && Math.abs(a[1] - b[1]) <= 2;
// 마커 층의 그 자리에 점선 원(빨강·청록 계열)이 그려졌는가 — 원 둘레의 한 점 근처를 훑는다
const ringAt = (cx, cy) => ev(`(()=>{const c=document.getElementById('markerCanvas'),x=c.getContext('2d');const d=x.getImageData(${cx}-40,${cy}-40,81,81).data;let n=0;for(let i=0;i<d.length;i+=4){if(d[i+3]>100&&!(d[i]>240&&d[i+1]>240&&d[i+2]>240))n++;}return n})()`);

console.log('\n[1. 지우는 동안 점선 원이 따라온다]');
await boot();
const r = await rect();
await ev(`document.getElementById('btnFloatEraseMode').click(); true`); await sleep(250);
let x0 = r.l + r.w * 0.3, y = r.t + r.h * 0.5;
await T('touchStart', x0, y); await sleep(60);
ok(near(await cur(), await toCv(r, x0, y)), '부분 삭제 — 손가락을 대자마자 원');
for (let i = 1; i <= 8; i++) { await T('touchMove', x0 + i * 20, y); await sleep(20); }
await sleep(80);
const want = await toCv(r, x0 + 160, y);
ok(near(await cur(), want), '  끄는 동안 손가락을 따라 움직인다', { cur: await cur(), want });
ok(await ringAt(want[0], want[1]) > 20, '  그 자리에 원이 그려져 있다');
await shot('1123c-erase-drag.png');
await T('touchEnd'); await sleep(120);
eq(await cur(), null, '  손가락을 떼면 원을 감춘다');
// 마우스는 누른 채 끄는 동안에도
await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y + 60, button: 'left', clickCount: 1 });
for (let i = 1; i <= 5; i++) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + i * 25, y: y + 60, button: 'left', buttons: 1 }); await sleep(20); }
ok(near(await cur(), await toCv(r, x0 + 125, y + 60)), '마우스로 누른 채 끄는 동안에도 따라온다');
await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x0 + 125, y: y + 60, button: 'left', clickCount: 1 }); await sleep(100);
ok(!!(await cur()), '  마우스는 떼어도 커서 자리에 남는다(올려 둔 채 크기 확인)');
await ev(`document.getElementById('btnFloatEraseMode').click(); true`); await sleep(200);
// 선 지우개도
await ev(`__markerDbg.setSketchTool('sketchErase'); true`); await sleep(200);
await T('touchStart', x0, y); for (let i = 1; i <= 6; i++) { await T('touchMove', x0 + i * 20, y); await sleep(20); }
ok(near(await cur(), await toCv(r, x0 + 120, y)), '선 지우개도 끄는 동안 따라온다');
await T('touchEnd'); await sleep(120);
eq(await cur(), null, '  떼면 감춘다');
await ev(`__markerDbg.setSketchTool(null); true`);

console.log('\n[2. 선 지우개는 그린 선만 (4차에서 되돌림)]');
await ev(`(()=>{const d=${D};const k=__markerDbg.info.allPresets()[0].series[0].key;d.markers=[{id:'a',uid:'a',typeKey:k,xPct:30,yPct:30,seq:1},{id:'b',uid:'b',typeKey:k,xPct:70,yPct:30,seq:2,rptDefect:'균열'}];d.sketch=[{id:'s1',tool:'line',color:'#0b0b0b',width:1,pts:[{x:20,y:60},{x:80,y:60}]}];__markerDbg.renderCanvas();__markerDbg.renderTable();return true})()`);
await ev(`__markerDbg.setSketchTool('sketchErase'); true`); await sleep(200);
const mp = await ev(`(()=>{const r=document.getElementById('mainCanvas').getBoundingClientRect();return {x:r.left+r.width*0.30,y:r.top+r.height*0.30}})()`);
// 마커 a 를 지나 선을 함께 문지르기 (한 번의 드래그)
await T('touchStart', mp.x - 30, mp.y); await T('touchMove', mp.x, mp.y); await sleep(30); await T('touchMove', mp.x + 10, mp.y + 2); await sleep(30);
const lp = await ev(`(()=>{const r=document.getElementById('mainCanvas').getBoundingClientRect();return {x:r.left+r.width*0.5,y:r.top+r.height*0.6}})()`);
for (let i = 1; i <= 8; i++) { await T('touchMove', mp.x + (lp.x - mp.x) * i / 8, mp.y + (lp.y + 10 - mp.y) * i / 8); await sleep(20); }
await T('touchMove', lp.x, lp.y - 10); await sleep(20); await T('touchMove', lp.x, lp.y); await sleep(20); await T('touchMove', lp.x, lp.y + 10); await sleep(30);
await T('touchEnd'); await sleep(300);
eq(await ev(`[${D}.markers.map(m=>m.id), ${D}.sketch.length]`), [['a', 'b'], 0], '(4차에서 되돌림) 그린 선만 지워지고 문지른 마킹 a 는 남는다');
await ev(`__markerDbg.undo(); true`); await sleep(250);
eq(await ev(`[${D}.markers.map(m=>m.id), ${D}.sketch.length]`), [['a', 'b'], 1], '실행취소로 선이 돌아온다');
await ev(`__markerDbg.setSketchTool(null); true`);

console.log('\n[3. 이름 「마킹/부분 삭제」]');
eq(await ev(`document.getElementById('btnEraseMode').textContent.trim()`), '마킹/부분 삭제', '도구줄 단추');
ok((await ev(`document.getElementById('btnFloatEraseMode').title`)).startsWith('마킹/부분 삭제'), '태블릿 하단 단추 설명');
await ev(`document.getElementById('btnFloatEraseMode').click(); true`); await sleep(250);
ok((await ev(`document.body.innerText`)).includes('마킹/부분 삭제 — Esc'), '켰을 때 이름표');
ok(!(await ev(`document.body.innerText`)).includes('지우개 모드'), '「지우개 모드」 문구가 남아 있지 않다');

console.log('\n[4. 부분 삭제로 문질러도 그린 선은 그대로 보인다]');
await ev(`(()=>{const d=${D};d.markers=[];d.sketch=[{id:'s1',tool:'rect',color:'#0b0b0b',width:2,pts:[{x:20,y:20},{x:80,y:80}]}];__markerDbg.renderCanvas();return true})()`); await sleep(200);
const yL = r.t + r.h * 0.5, xL = r.l + r.w * 0.2;   // 사각형 왼쪽 변 위를 가로지른다
await T('touchStart', xL - 60, yL); for (let i = 1; i <= 10; i++) { await T('touchMove', xL - 60 + i * 12, yL); await sleep(15); }
await sleep(80);
const [ex, ey] = await toCv(r, xL, yL - 4);
const dark = await ev(`(()=>{const c=document.getElementById('markerCanvas'),x=c.getContext('2d');const d=x.getImageData(${ex}-6,${ey},13,1).data;let n=0;for(let i=0;i<d.length;i+=4){if(d[i+3]>200&&d[i]<80&&d[i+1]<80&&d[i+2]<80)n++;}return n})()`);
ok(dark > 0, '문지르는 동안에도 흰 미리보기 위에 그린 선이 보인다');
await shot('1123c-partial-erase.png');
await T('touchEnd'); await sleep(300);
eq(await ev(`${D}.sketch.length`), 1, '  손을 떼도 선은 그대로(지워지는 것은 도면 이미지)');

console.log(`\n통과 ${passes} · 실패 ${fails}`);
process.exit(fails ? 1 : 0);
