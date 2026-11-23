/* 2026-11-23 4차 — 선 지우개는 다시 그린 선만, 「마킹/부분 삭제」, 빨리 문질러도 건너뛰지 않는 지우개,
   버전 표시, 알림이 위 창을 가리지 않음, 잘 보이는 지우개 원, 펜 압력 굵기.

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더> about:blank
     node tests/test-1123d.mjs                                                       */
import { connect } from './cdp.mjs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

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
const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });

async function boot(w = 1280, h = 800) {
  await cdp.send('DOM.enable');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: APP }); await sleep(800);
  await ev(`localStorage.clear(); localStorage.setItem('defectMarkerTabletMode_v1','on'); true`);
  await cdp.send('Page.navigate', { url: APP }); await sleep(1400);
  await ev(`__markerDbg.addBlankDrawing(); true`); await sleep(800);
}
const at = (fx, fy) => ev(`(()=>{const r=document.getElementById('mainCanvas').getBoundingClientRect();return {x:Math.round(r.left+r.width*${fx}),y:Math.round(r.top+r.height*${fy})}})()`);
const setup = `(()=>{const d=${D};const k=__markerDbg.info.allPresets()[0].series[0].key;
  d.markers=[{id:'a',uid:'a',typeKey:k,xPct:50,yPct:30,seq:1,rptDefect:'균열'}];
  d.sketch=[{id:'s1',tool:'line',color:'#0b0b0b',width:1,pts:[{x:50,y:45},{x:50,y:75}]}];
  __markerDbg.renderCanvas();__markerDbg.renderTable();return true})()`;

console.log('\n[선 지우개는 그린 선만 — 마킹은 그대로]');
await boot();
await ev(setup);
await ev(`__markerDbg.setSketchTool('sketchErase'); true`); await sleep(150);
let a = await at(0.40, 0.30), b = await at(0.60, 0.30);
await T('touchStart', a.x, a.y); for (let i = 1; i <= 10; i++) { await T('touchMove', a.x + (b.x - a.x) * i / 10, a.y); await sleep(15); } await T('touchEnd'); await sleep(250);
eq(await ev(`${D}.markers.length`), 1, '마킹 위를 문질러도 결함은 남는다');
ok(/마킹은 건드리지 않/.test(await ev(`document.querySelector('#sketchToolGroup [data-sketch-tool=sketchErase]').title`)), '  선 지우개 설명 : 마킹은 건드리지 않음');

console.log('\n[빨리 문질러도 건너뛰지 않는다]');
// 선 지우개 : 시작과 끝 두 점만(사이에 선이 있음)
a = await at(0.30, 0.60); b = await at(0.70, 0.60);
await T('touchStart', a.x, a.y); await T('touchMove', b.x, b.y); await sleep(30); await T('touchEnd'); await sleep(250);
eq(await ev(`${D}.sketch.length`), 0, '선 지우개 — 한 번에 휙 지나간 사이의 선도 지운다');
await ev(`__markerDbg.setSketchTool(null); true`);
// 마킹/부분 삭제 : 사이에 있는 마커
await ev(`document.getElementById('btnFloatEraseMode').click(); true`); await sleep(200);
a = await at(0.30, 0.30); b = await at(0.70, 0.30);
await T('touchStart', a.x, a.y); await T('touchMove', b.x, b.y); await sleep(30); await T('touchEnd'); await sleep(250);
eq(await ev(`${D}.markers.length`), 0, '마킹/부분 삭제 — 휙 지나간 사이의 마킹도 지운다');
await ev(`__markerDbg.undo(); true`); await sleep(200);
eq(await ev(`${D}.markers.length`), 1, '  실행취소로 돌아온다');

console.log('\n[이름 「마킹/부분 삭제」]');
eq(await ev(`document.getElementById('btnEraseMode').textContent.trim()`), '마킹/부분 삭제', '도구줄 단추');
ok((await ev(`document.body.innerText`)).includes('마킹/부분 삭제 — Esc'), '켰을 때 이름표');
ok((await ev(`document.getElementById('btnFloatEraseMode').title`)).startsWith('마킹/부분 삭제'), '태블릿 하단 단추 설명');
const tb = await ev(`(()=>{const b=document.getElementById('btnEraseMode').getBoundingClientRect();const n=document.getElementById('btnEraseMode').nextElementSibling;return {h:Math.round(b.height),wrap:b.height>44}})()`);
ok(!tb.wrap, '  긴 이름이어도 단추가 두 줄로 안 접힌다', tb);

console.log('\n[잘 보이는 지우개 원]');
const c = await at(0.5, 0.5);
await T('touchStart', c.x, c.y); await T('touchMove', c.x + 3, c.y); await sleep(120);
const ring = await ev(`(()=>{const cv=document.getElementById('markerCanvas'),x=cv.getContext('2d');const p=__markerDbg.eraseCursorPt;const k=cv.width/cv.getBoundingClientRect().width;
  const d=x.getImageData(Math.round(p.x)-60,Math.round(p.y),121,1).data;let red=0,white=0;for(let i=0;i<d.length;i+=4){if(d[i+3]>200&&d[i]>140&&d[i+1]<90)red++;if(d[i+3]>200&&d[i]>240&&d[i+1]>240&&d[i+2]>240)white++;}
  const m=x.getImageData(Math.round(p.x)+3,Math.round(p.y)+3,1,1).data;return {red,white,fillA:m[3]}})()`);
ok(ring.red >= 4, `진한 점선 (가로줄에 빨강 ${ring.red}px — 예전 1.5px 점선은 2px 안팎)`, ring);
ok(ring.fillA > 0, '  안쪽이 칠해져 있다', ring);
await shot('1123d-ring.png');
await T('touchEnd'); await sleep(150);
await ev(`document.getElementById('btnFloatEraseMode').click(); true`); await sleep(150);

console.log('\n[버전 표시]');
const swVer = /CACHE_VERSION = '([^']+)'/.exec(readFileSync(ROOT + 'service-worker.js', 'utf8'))[1];
const label = await ev(`document.getElementById('buildVersionLabel').textContent`);
ok(label.startsWith('버전 ' + swVer + ' ('), `결함 목록 아래 「${label}」 — 서비스워커 ${swVer} 와 같다`);
await ev(`document.getElementById('btnSettingsMenuToggle').click(); true`); await sleep(200);
eq(await ev(`(()=>{const e=document.getElementById('settingsVersionLabel');return [e.textContent, e.getBoundingClientRect().height>0]})()`), [label, true], '「설정」 맨 아래에도 보인다');
await shot('1123d-settings.png');
await ev(`document.getElementById('btnSettingsMenuToggle').click(); true`);
ok(!(await ev(`document.body.innerText`)).includes('Ver 2.5'), '옛 「Ver 2.5」 표기는 없다');

console.log('\n[알림이 위 창을 가리지 않는다]');
await ev(`(()=>{const b=document.createElement('div');b.className='recovery-banner';b.id='tb';b.innerHTML='<span><b>이전 작업 내역</b>이 있습니다.</span><button class=primary>복구하기</button><button>무시</button>';document.body.appendChild(b);return true})()`); await sleep(100);
await ev(`__markerDbg.showToast('알림 하나'); __markerDbg.showToast('알림 둘'); true`); await sleep(150);
const ov = await ev(`(()=>{const b=document.getElementById('tb').getBoundingClientRect();const t=[...document.querySelectorAll('.app-toast')].map(e=>e.getBoundingClientRect());return {bb:Math.round(b.bottom),tt:Math.round(Math.min(...t.map(r=>r.top)))}})()`);
ok(ov.tt >= ov.bb, `복구 창 아래로 내려간다(창 아래 ${ov.bb}px, 알림 위 ${ov.tt}px)`, ov);
await shot('1123d-toast.png');
await ev(`document.querySelectorAll('.recovery-banner').forEach(e=>e.remove()); true`); await sleep(150);
eq(await ev(`Math.round(document.querySelector('.app-toast-stack').getBoundingClientRect().top)`), 14, '  창이 사라지면 다시 맨 위로');

console.log('\n[펜 압력 — 세게 누르면 굵게]');
await boot();
await ev(`__markerDbg.setSketchTool('pen'); true`); await sleep(150);
const p0 = await at(0.2, 0.5);
const pen = (type, x, y, force) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen', force });
await pen('mousePressed', p0.x, p0.y, 0.1);
for (let i = 1; i <= 60; i++) { await pen('mouseMoved', p0.x + i * 10, p0.y + Math.round(Math.sin(i / 6) * 40), 0.1 + 0.85 * i / 60); await sleep(8); }
await pen('mouseReleased', p0.x + 600, p0.y, 0.9); await sleep(250);
const st = await ev(`(()=>{const s=${D}.sketch.at(-1);return {tool:s.tool,n:s.pts.length,pr:s.pr?[Math.min(...s.pr),Math.max(...s.pr),s.pr.length]:null}})()`);
ok(st.tool === 'pen' && st.pr && st.pr[2] === st.n, '자유선에 점마다 압력이 남는다', st);
ok(st.pr && st.pr[0] < 0.3 && st.pr[1] > 0.7, `  살살 → 세게 : ${st.pr && st.pr[0]} ~ ${st.pr && st.pr[1]}`, st);
// 실제로 그려진 굵기 : 앞쪽(살살)과 뒤쪽(세게)에서 세로로 잉크 두께를 잰다
const thick = (fx) => ev(`(()=>{const cv=document.getElementById('mainCanvas'),x=cv.getContext('2d');const r=cv.getBoundingClientRect();const k=cv.width/r.width;
  const px=Math.round((${p0.x}+${fx}-r.left)*k);const d=x.getImageData(px,0,1,cv.height).data;let n=0;for(let i=0;i<d.length;i+=4){if(d[i]<120&&d[i+1]<120&&d[i+2]<120)n++;}return n})()`);
const thin = await thick(60), fat = await thick(540);
ok(fat > thin * 1.6, `  세게 누른 쪽이 굵다 (앞 ${thin}px · 뒤 ${fat}px)`, { thin, fat });
await shot('1123d-pressure.png');
// 저장 → 다시 열기
await ev(`(()=>{const snap=JSON.parse(JSON.stringify(__markerDbg.buildProjectSnapshot()));__markerDbg.applyProjectData(snap);return true})()`); await sleep(1200);
eq(await ev(`(()=>{const s=__markerDbg.getActiveDrawing().sketch.find(x=>x.tool==='pen');return !!s && Array.isArray(s.pr) && s.pr.length===s.pts.length})()`), true, '  프로젝트를 저장했다 열어도 압력이 남는다');
// 손가락·마우스는 압력 없이 고른 굵기
await ev(`__markerDbg.setSketchTool('pen'); true`);
const m0 = await at(0.2, 0.8);
await T('touchStart', m0.x, m0.y); for (let i = 1; i <= 30; i++) { await T('touchMove', m0.x + i * 15, m0.y + Math.round(Math.sin(i / 4) * 30)); await sleep(8); } await T('touchEnd'); await sleep(250);
eq(await ev(`'pr' in __markerDbg.getActiveDrawing().sketch.at(-1)`), false, '손가락으로 그린 선은 압력 없이 고른 굵기');

console.log(`\n통과 ${passes} · 실패 ${fails}`);
process.exit(fails ? 1 : 0);
