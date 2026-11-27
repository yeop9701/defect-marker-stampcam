/* 2026-11-27 2차 — 태블릿 수직·수평 고정 단추, 현황사진 마킹을 PNG·PDF 저장에서 빼기(기본은 넣음).

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더> about:blank
     node tests/test-1127b.mjs                                                       */
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
const X = '__markerDbg.t1127';
const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });

async function boot(w = 1280, h = 800, keep = false) {
  await cdp.send('DOM.enable');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: APP }); await sleep(800);
  if (!keep) await ev(`localStorage.clear(); localStorage.setItem('defectMarkerTabletMode_v1','on'); true`);
  await cdp.send('Page.navigate', { url: APP }); await sleep(1400);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });   // 다른 출처로 넘어가면 꺼지므로 다시
  await ev(`__markerDbg.addBlankDrawing(); true`); await sleep(800);
  await ev(`__markerDbg.setSketchTool(null); document.querySelectorAll('.app-toast,.recovery-banner').forEach(e=>e.remove()); true`); await sleep(150);
}
const at = (fx, fy) => ev(`(()=>{const r=document.getElementById('mainCanvas').getBoundingClientRect();return {x:Math.round(r.left+r.width*${fx}),y:Math.round(r.top+r.height*${fy})}})()`);
async function dragCreate(fx0, fy0, fx1, fy1) {
  const a = await at(fx0, fy0), b = await at(fx1, fy1);
  await T('touchStart', a.x, a.y);
  for (let i = 1; i <= 10; i++) { await T('touchMove', Math.round(a.x + (b.x - a.x) * i / 10), Math.round(a.y + (b.y - a.y) * i / 10)); await sleep(15); }
  await T('touchEnd'); await sleep(350);
  await ev(`(()=>{const b=document.getElementById('quickInputSheet');if(b&&__markerDbg.ink)__markerDbg.ink.hideQuickInputSheet&&__markerDbg.ink.hideQuickInputSheet();return true})()`);
  return ev(`(()=>{const m=${D}.markers.at(-1);return m?{angle:Math.round(m.angle*10)/10,n:${D}.markers.length}:null})()`);
}

console.log('\n[태블릿 수직·수평 고정]');
await boot();
const btn = await ev(`(()=>{const b=document.getElementById('btnFloatOrtho');const r=b.getBoundingClientRect();return {vis:r.width>0&&r.height>0,on:b.classList.contains('active')}})()`);
ok(btn.vis && !btn.on, '하단 바에 수직·수평 고정 단추 (처음엔 꺼짐)', btn);
await shot('1127b-bar-1280.png');
let m1 = await dragCreate(0.30, 0.30, 0.45, 0.42);   // 비스듬히
ok(m1 && Math.abs(m1.angle % 90) > 5, `끈 상태에서 비스듬히 끌면 비스듬히 (각도 ${m1 && m1.angle})`, m1);
await ev(`document.getElementById('btnFloatOrtho').click(); true`); await sleep(150);
eq(await ev(`[document.getElementById('btnFloatOrtho').classList.contains('active'), ${X}.orthoLock]`), [true, true], '누르면 켜짐');
let m2 = await dragCreate(0.30, 0.65, 0.45, 0.72);   // 오른쪽 아래로 비스듬히 → 수평
eq(m2 && ((m2.angle % 360) + 360) % 360, 180, '켜면 비스듬히 끌어도 수평(배지가 오른쪽, 화살표는 왼쪽을 가리킴)');
let m3 = await dragCreate(0.70, 0.30, 0.73, 0.55);   // 거의 아래로 → 수직
eq(m3 && ((m3.angle % 360) + 360) % 360, 270, '  세로로 끌면 수직');
await shot('1127b-ortho.png');
// 다시 열어도 기억
await boot(1280, 800, true);
eq(await ev(`[document.getElementById('btnFloatOrtho').classList.contains('active'), ${X}.orthoLock]`), [true, true], '  다시 열어도 켜진 채(기억)');
// 그리는 동안은 단추를 감춘다
await ev(`__markerDbg.setSketchTool('line'); true`); await sleep(200);
eq(await ev(`document.getElementById('btnFloatOrtho').getBoundingClientRect().width`), 0, '  그리기 중에는 감춘다(그리기 바 폭 유지)');
await ev(`__markerDbg.setSketchTool(null); true`); await sleep(150);
await ev(`document.getElementById('btnFloatOrtho').click(); true`);
eq(await ev(`${X}.orthoLock`), false, '  다시 누르면 꺼짐');
// 좁은 태블릿(세로)에서도 하단 바가 화면 안
for (const [w, h] of [[800, 1280], [1024, 768]]) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(500);
  const fit = await ev(`(()=>{const b=document.getElementById('tabletFloatBar').getBoundingClientRect();const o=document.getElementById('btnFloatOrtho').getBoundingClientRect();return {l:Math.round(b.left),r:Math.round(b.right),w:innerWidth,ov:document.getElementById('tabletFloatBar').scrollWidth-document.getElementById('tabletFloatBar').clientWidth,ortho:o.width>0}})()`);
  ok(fit.l >= 0 && fit.r <= fit.w && fit.ov <= 1 && fit.ortho, `  ${w}×${h} : 하단 바가 화면 안, 단추 보임`, fit);
  await shot(`1127b-bar-${w}.png`);
}

console.log('\n[현황사진 마킹을 저장에서 빼기]');
await boot();
eq(await ev(`[document.getElementById('statusExportToggle').checked, ${X}.isStatusExportShown()]`), [true, true], '「현황사진 마킹」 기본 켬(저장에 들어감)');
await ev(`(()=>{const d=${D};const mk=(id,k,x,y)=>({id,uid:id,typeKey:k,xPct:x,yPct:y,angle:180,lenMult:1});
  d.markers=[mk('a','wall',30,30),mk('s1','stat_v',60,30),mk('s2','stat_h',60,60)];__markerDbg.renderCanvas();__markerDbg.renderTable();return true})()`);
await ev(`document.getElementById('legendToggle').checked=true; document.getElementById('legendToggle').dispatchEvent(new Event('change')); true`);
const count = () => ev(`(()=>{const c=__markerDbg.buildExportCanvasFor(${D},'png',false);const x=c.getContext('2d');const d=x.getImageData(0,0,c.width,c.height).data;
  let g=0,o=0,r=0;for(let i=0;i<d.length;i+=4){const R=d[i],G=d[i+1],B=d[i+2];if(R<40&&G>150&&G<200&&B>60&&B<110)g++;else if(R>230&&G>120&&G<160&&B<40)o++;else if(R>230&&G<40&&B<40)r++;}return {g,o,r}})()`);
const c1 = await count();
ok(c1.g > 50 && c1.o > 50 && c1.r > 50, '켬 : 저장 그림에 초록·주황·빨강 마킹이 다 있다', c1);
const leg1 = await ev(`__markerDbg.t1127.DEFECT_TYPES && (()=>{return true})()`);
await ev(`(()=>{const e=document.getElementById('statusExportToggle');e.checked=false;e.dispatchEvent(new Event('change'));return true})()`); await sleep(200);
const c2 = await count();
ok(c2.g === 0 && c2.o === 0 && c2.r > 50, '끔 : 초록·주황은 빠지고(범례 줄 포함) 결함 마킹은 그대로', c2);
eq(await ev(`${D}.markers.map(m=>m.seq).join(',')`), '1,1,2', '  번호는 그대로(결함 1, 현황사진 1·2)');
// 작업 화면에는 그대로
const scr = await ev(`(()=>{const c=document.getElementById('markerCanvas')||document.getElementById('mainCanvas');const x=c.getContext('2d');const d=x.getImageData(0,0,c.width,c.height).data;let g=0;for(let i=0;i<d.length;i+=4){if(d[i]<40&&d[i+1]>150&&d[i+1]<200&&d[i+2]>60&&d[i+2]<110)g++;}return g})()`);
ok(scr > 50, '  작업 화면에는 현황사진이 그대로 보인다', scr);
// 다시 열어도 기억
await boot(1280, 800, true);
eq(await ev(`document.getElementById('statusExportToggle').checked`), false, '  다시 열어도 끈 채(기억)');
await ev(`document.getElementById('btnOpenExport').click(); true`); await sleep(300);
await shot('1127b-export-option.png');

console.log(`\n통과 ${passes} · 실패 ${fails}`);
process.exit(fails ? 1 : 0);
