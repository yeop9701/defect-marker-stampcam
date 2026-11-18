/* 2026-11-18 두 번째 요청 검사 — 실제 브라우저.
   ① 알림은 2초 뒤 사라진다
   ② 그리기를 켜면 하단 바에 그리기 도구가 겹쳐 나오지 않는다(그리기 바에만)
   ③ 선 지우개(E) 아이콘이 따로(더 굵은 것), 이름은 그대로
   ④ 층수·위치 : 퀵입력(손글씨·자판)·엑셀 시트, 손글씨 1 → 지상1층 · -1 → 지하1층, 직접 친 2 → 지상2층
   ⑤ 사진 창의 카메라는 「스탬프 촬영」 하나
   ⑥ 태블릿 결함 목록 서랍 1.5배(480 → 720px)
   ⑦ 결함 목록 칸 위의 이름표가 없고 칸 안 글자로만

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더> about:blank
     node tests/test-1118b.mjs                                                       */
import { connect, drag, click, finish } from './cdp.mjs';
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
const waitFor = async (expr, ms = 2500) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr)) return true; await sleep(80); } return false; };
const D = '__markerDbg.getActiveDrawing()';
const visible = (sel) => ev(`(()=>{const e=document.querySelector('${sel}'); if(!e) return false; const cs=getComputedStyle(e); return cs.display!=='none' && cs.visibility!=='hidden' && e.getClientRects().length>0;})()`);
const open = async (tablet, w = 1280, h = 900) => {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: APP }); await sleep(1300);
  await ev(`localStorage.clear(); ${tablet ? "localStorage.setItem('defectMarkerTabletMode_v1','on');" : ''} true`);
  await cdp.send('Page.navigate', { url: APP }); await sleep(1700);
  const r = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#addDrawingInput')` });
  await cdp.send('DOM.setFileInputFiles', { files: [ROOT + 'test-fixtures/plan.png'], objectId: r.result.objectId });
  await sleep(1400);
};
const cvRect = () => ev(`(()=>{const r=document.getElementById('mainCanvas').getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};})()`);
const ptAt = async (fx, fy) => { const c = await cvRect(); return { x: Math.round(c.x + c.w * fx), y: Math.round(c.y + c.h * fy) }; };
const padRect = (k) => ev(`(()=>{const p=document.querySelector('#quickInputFields .ink-box[data-k="${k}"] .ink-pad'); if(!p) return null; const r=p.getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height};})()`);
const stroke = (r, pts) => drag(cdp, pts.map(([u, v]) => ({ x: r.x + u * r.w, y: r.y + v * r.h })), { steps: 6 });

await cdp.send('DOM.enable');

/* ══ ① 알림 2초 ══ */
console.log('\n[1] 알림');
await open(false);
await ev(`__markerDbg.showToast('검사용 알림'); true`);
ok(await ev(`[...document.querySelectorAll('.app-toast')].some(t=>t.textContent.includes('검사용 알림'))`), '알림이 뜬다');
await sleep(1500);
ok(await ev(`[...document.querySelectorAll('.app-toast')].some(t=>t.textContent.includes('검사용 알림'))`), '1.5초에는 아직 있다');
await sleep(800);
ok(!(await ev(`[...document.querySelectorAll('.app-toast')].some(t=>t.textContent.includes('검사용 알림'))`)), '2초 뒤에는 사라진다');

/* ══ ③ 선 지우개 아이콘 ══ */
console.log('\n[3] 지우개');
const eIcon = await ev(`document.querySelector('#sketchToolGroup [data-sketch-tool="sketchErase"] use').getAttribute('href')`);
const dIcon = await ev(`document.querySelector('#btnEraseMode use').getAttribute('href')`);
eq([eIcon, dIcon], ['#i-eraser-strong', '#i-eraser'], '선 지우개(E)만 굵은 지우개 아이콘, 지우개(D)는 그대로');
ok(await ev(`(()=>{const s=document.getElementById('i-eraser-strong'); return !!s && [...s.querySelectorAll('path')].some(p=>p.getAttribute('fill')==='currentColor');})()`), '  → 고무 쪽이 꽉 찬 지우개');
ok(await ev(`/선 지우개/.test(document.querySelector('#sketchToolGroup [data-sketch-tool="sketchErase"]').title) && /지우개/.test(document.getElementById('btnEraseMode').textContent)`), '  → 이름(선 지우개 · 지우개)은 그대로');

/* ══ ② 그리기 바 겹침 (태블릿) ══ */
console.log('\n[2] 그리기 도구 겹침');
await open(true);
await ev(`__markerDbg.setSketchTool('line'); true`); await sleep(400);
ok(!(await visible('#sketchToolGroup')), '도면 아래 그리기 바의 도구는 나오지 않는다');
// 11-18 : 태블릿은 하단 바 하나에 도구를 모았다 — 같은 단추가 두 곳에 겹치지 않는다
ok(await ev(`[...document.querySelectorAll('#tabletFloatSketchGroup [data-sketch-tool]')].filter(e=>e.getClientRects().length>0).length===7`), '그리기 도구(도형·글자·지우개)는 하단 바에 한 벌만 있다');
const dupColors = await ev(`[...document.querySelectorAll('.sketch-color-btn')].filter(b=>b.getClientRects().length>0).length`);
eq(dupColors, 6, '  → 색 단추도 한 벌(6개)만 보인다');
await shot('1118b-sketch-tablet.png');
await ev(`__markerDbg.setSketchTool(null); true`);

/* ══ ⑥⑦ 서랍 폭 · 칸 이름 ══ */
console.log('\n[6·7] 결함 목록 서랍');
await ev(`(()=>{const d=${D}; d.markers=[]; for(let i=0;i<2;i++) d.markers.push({id:'t'+i,uid:'u'+i,typeKey:'wall',xPct:20+i*20,yPct:40,angle:0,rptFloor:'지상1층',rptType:'벽체',rptMember:'콘크리트',rptDefect:'균열'}); __markerDbg.renderCanvas(); __markerDbg.renderTable(); return true})()`);
await ev(`(()=>{const b=[...document.querySelectorAll('button,div,span')].find(e=>e.children.length<3&&/결함\\s*목록/.test(e.textContent)&&e.getBoundingClientRect().left>1000); if(b) b.click(); return !!b})()`);
await sleep(700);
const sw = await ev(`Math.round(document.querySelector('.sidebar.right').getBoundingClientRect().width)`);
ok(sw >= 715 && sw <= 722, '태블릿 결함 목록 서랍 폭 720px (예전 480px의 1.5배)', sw);
const labels = await ev(`[...document.querySelector('.marker-card').querySelectorAll('.mc-cell')].map(c=>getComputedStyle(c,'::before').content)`);
ok(labels.every(c => c === 'none' || c === 'normal' || c === '""'), '칸 위의 이름표가 없다', labels);
const ph = await ev(`[...document.querySelector('.marker-card').querySelectorAll('input[data-role]')].filter(i=>i.dataset.role!=='pos').map(i=>i.placeholder)`);
eq(ph, ['층수', '위치', '부재', '자재', '결함', '폭(mm)', '길이(mm)', '개수', '사진번호'], '칸 안 글자 : 층수·위치·부재·자재·결함·폭(mm)·길이(mm)·개수·사진번호');
const rows = await ev(`(()=>{const c=document.querySelector('.marker-card'); const rs=[...c.children].map(e=>e.getBoundingClientRect()).filter(r=>r.height>0).sort((a,b)=>a.top-b.top); const out=[]; rs.forEach(r=>{const x=out.find(o=>r.top<o.bottom&&r.bottom>o.top); if(x){x.top=Math.min(x.top,r.top);x.bottom=Math.max(x.bottom,r.bottom);} else out.push({top:r.top,bottom:r.bottom});}); return out.length;})()`);
eq(rows, 2, '카드는 여전히 두 줄');
// 직접 친 층수 2 → 지상2층
await ev(`(()=>{const i=document.querySelector('.marker-card [data-role="rptFloor"]'); i.value='2'; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); return true})()`);
await sleep(150);
eq(await ev(`[document.querySelector('.marker-card [data-role="rptFloor"]').value, ${D}.markers[0].rptFloor]`), ['지상2층', '지상2층'], '결함 목록에 2 를 치면 「지상2층」');
await ev(`(()=>{const i=document.querySelector('.marker-card [data-role="rptFloor"]'); i.value='-3'; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); return true})()`);
await sleep(150);
eq(await ev(`${D}.markers[0].rptFloor`), '지하3층', '  -3 → 「지하3층」');
await ev(`(()=>{const i=document.querySelector('.marker-card [data-role="rptFloor"]'); i.value='옥상'; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); return true})()`);
await sleep(150);
eq(await ev(`${D}.markers[0].rptFloor`), '옥상', '  숫자가 아닌 말(옥상)은 그대로');
await shot('1118b-drawer.png');

/* ══ ④ 엑셀 외관조사 시트 ══ */
console.log('\n[4] 엑셀');
const sheet = await ev(`(()=>{const d=${D}; d.markers[0].rptFloor='지상1층'; d.markers[0].rptLoc='거실'; const sh=__markerDbg.buildOegwanSheet(d.markers.map((m,idx)=>({m,idx,d}))); return {h:sh.header, r:sh.rows[0].cells, n:[...sh.numericColIdx]};})()`);
eq(sheet.h.slice(0, 7), ['NO', '', '층수', '위치', '부재', '자재', '결함'], '외관조사 시트 : NO · 유형 · 층수 · 위치 · 부재 · 자재 · 결함');
eq(sheet.r.slice(2, 5), ['지상1층', '거실', '벽체'], '  → 값도 그 자리에');
eq(sheet.h[sheet.n[1]], '폭', '  → 숫자 칸 표시도 한 칸씩 밀렸다(폭)');

/* ══ ④ 퀵입력 손글씨 층수 ══ */
console.log('\n[4] 퀵입력');
await open(true);
let q = await ptAt(0.35, 0.3);
await click(cdp, q.x, q.y); await sleep(500);
ok(await waitFor(`document.getElementById('quickInputSheet').style.display!=='none'`), '퀵입력 시트');
const order = await ev(`[...document.querySelectorAll('#quickInputFields > *')].map(e=>e.dataset.k || (e.classList.contains('qis-tax')?'부재·자재·결함':e.className))`);
eq(order, ['rptFloor', 'rptLoc', '부재·자재·결함', 'rptWidth', 'rptLength', 'rptCount', 'rptTag'], '순서 : 층수·위치 → 부재·자재·결함 → 실측값');
ok(await ev(`/지하는 앞에 -/.test(document.querySelector('.ink-box[data-k="rptFloor"] .ink-hint').textContent)`), '층수 상자 안내 「층 숫자 (지하는 앞에 -)」');
await shot('1118b-quick-ink.png');
let r = await padRect('rptFloor');
await stroke(r, [[0.3, 0.15], [0.3, 0.8]]);            // 1
ok(await waitFor(`(${D}.markers[0].rptFloor||'')!==''`, 3000), '층수에 숫자를 쓰면 값이 들어간다');
eq(await ev(`${D}.markers[0].rptFloor`), '지상1층', '  1 → 「지상1층」');
eq(await ev(`document.querySelector('.ink-box[data-k="rptFloor"] .ink-val').value`), '지상1층', '  → 상자 아래 칸에도 「지상1층」');
await ev(`document.querySelector('.ink-box[data-k="rptFloor"] .ink-clear').click(); true`); await sleep(200);
r = await padRect('rptFloor');
await stroke(r, [[0.12, 0.47], [0.28, 0.47]]);          // -
await stroke(r, [[0.45, 0.15], [0.45, 0.8]]);           // 1
ok(await waitFor(`(${D}.markers[0].rptFloor||'')!==''`, 3000), '「-1」을 쓰면 값이 들어간다');
eq(await ev(`${D}.markers[0].rptFloor`), '지하1층', '  -1 → 「지하1층」');
// 직접 친 값도
await ev(`(()=>{const i=document.querySelector('.ink-box[data-k="rptFloor"] .ink-val'); i.value='5'; i.dispatchEvent(new Event('change',{bubbles:true})); return true})()`); await sleep(200);
eq(await ev(`${D}.markers[0].rptFloor`), '지상5층', '  상자 아래 칸에 5 를 치면 「지상5층」');
// 위치 상자는 글자 칸
ok(await ev(`document.querySelector('.ink-box[data-k="rptLoc"]').classList.contains('ink-text')`), '위치는 글자 손글씨 칸');
await ev(`document.getElementById('btnQuickInputClose').click(); true`);

/* ══ ④ 퀵입력 자판 ══ */
await ev(`Ink.saveSettings(Object.assign(Ink.loadSettings(), { on:false })); true`);
const inkOff = await ev(`!__markerDbg.ink.isInkInputOn()`);
if (inkOff) {
  q = await ptAt(0.55, 0.55);
  await click(cdp, q.x, q.y); await sleep(500);
  const vis = await ev(`[...document.querySelectorAll('#quickInputFields [data-qis]')].filter(i=>i.getClientRects().length>0).map(i=>i.dataset.qis)`);
  ok(vis[0] === 'rptFloor' && vis[1] === 'rptLoc', '자판 퀵입력에도 층수·위치가 맨 앞에 펼쳐져 있다', vis);
  await ev(`(()=>{const i=document.querySelector('#quickInputFields [data-qis="rptFloor"]'); i.value='-2'; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); return true})()`); await sleep(150);
  const ms = await ev(`${D}.markers.length`);
  eq(await ev(`${D}.markers[${ms - 1}].rptFloor`), '지하2층', '  자판으로 -2 → 「지하2층」');
}

/* ══ ⑤ 카메라 ══ */
console.log('\n[5] 사진 창');
await ev(`document.getElementById('btnQuickInputClose') && document.getElementById('btnQuickInputClose').click(); true`);
await ev(`(()=>{const b=[...document.querySelectorAll('button,div,span')].find(e=>e.children.length<3&&/결함\\s*목록/.test(e.textContent)&&e.getBoundingClientRect().left>1000); if(b) b.click(); return !!b})()`);
await sleep(600);
await ev(`document.querySelector('.marker-card [data-role="photo"]').click(); true`); await sleep(500);
const cams = await ev(`[...document.querySelectorAll('#photoGridView button')].filter(b=>b.getClientRects().length>0).map(b=>b.textContent.replace(/\\s+/g,' ').trim())`);
ok(cams.some(t => /스탬프 촬영/.test(t)), '「스탬프 촬영」이 있다', cams);
ok(cams.some(t => /앨범에서 선택/.test(t)), '「앨범에서 선택」은 그대로', cams);
ok(!cams.some(t => /^촬영$|사진 촬영|기본 카메라/.test(t)), '「촬영」·「사진 촬영」·「기본 카메라 + 번호」는 없다', cams);
await shot('1118b-photo.png');

console.log(`\n${passes} 통과 / ${fails} 실패`);
finish(cdp, fails ? 1 : 0);
