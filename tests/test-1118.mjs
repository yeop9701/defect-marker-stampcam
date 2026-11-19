/* 2026-11-18 요청 검사 — 실제 브라우저.
   ① 이동 모드에서도 고른 것의 점선이 남고 색이 바뀐다(초록)
   ② 「선택」을 눌러도 아래 떠 있는 바에 그리기 도구줄이 나오지 않는다(그린 선을 골랐을 때만 색·굵기)
   ④ 퀵입력 손글씨 : 부재·자재·결함 ✎ → 그 줄 안에서 아래로 넓어지며 필기 상자가 들어간다
   ⑤ 폭·길이·개수·사진 필기 상자가 더 높다
   ⑥ 결함 목록 카드가 두 줄, 부재 앞에 층수·위치 (저장·CSV·이어받기 포함)
   ⑦ 유형 이름 : 수직부재·수평부재·…(범위), 옛 이름 프로젝트도 새 이름으로

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더> about:blank
     node tests/test-1118.mjs                                                       */
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
const open = async (tablet) => {
  await cdp.send('Page.navigate', { url: APP }); await sleep(1300);
  await ev(`localStorage.clear(); ${tablet ? "localStorage.setItem('defectMarkerTabletMode_v1','on');" : ''} true`);
  await cdp.send('Page.navigate', { url: APP }); await sleep(1700);
  const r = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#addDrawingInput')` });
  await cdp.send('DOM.setFileInputFiles', { files: [ROOT + 'test-fixtures/plan.png'], objectId: r.result.objectId });
  await sleep(1400);
};
const cvRect = () => ev(`(()=>{const r=document.getElementById('mainCanvas').getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};})()`);
const ptAt = async (fx, fy) => { const c = await cvRect(); return { x: Math.round(c.x + c.w * fx), y: Math.round(c.y + c.h * fy) }; };
const visible = (sel) => ev(`(()=>{const e=document.querySelector('${sel}'); if(!e) return false; const cs=getComputedStyle(e); return cs.display!=='none' && cs.visibility!=='hidden' && e.getClientRects().length>0;})()`);

await cdp.send('DOM.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

/* ══ ⑦ 유형 이름 ══ */
console.log('\n[7] 유형 이름');
await open(false);
const gridText = await ev(`document.getElementById('typeGrid').textContent`);
ok(['수직부재', '수평부재', '수직부재(범위)', '수평부재(범위)'].every(t => gridText.includes(t)) && !/벽체|바닥/.test(gridText), '외관조사 유형 4개가 새 이름이다', gridText);
// 옛 이름으로 저장된 프로젝트를 열어도 새 이름으로
const oldSnap = await ev(`(()=>{const s=__markerDbg.buildProjectSnapshot(); s.seriesSnapshot=(s.seriesSnapshot||[]).map(t=>Object.assign({},t,{label:{wall:'벽체',flat:'바닥/천장',wall_area:'벽체(범위)',flat_area:'바닥/천장(범위)'}[t.key]||t.label})); return s;})()`);
ok(oldSnap && Array.isArray(oldSnap.seriesSnapshot) && oldSnap.seriesSnapshot.some(t => t.label === '벽체'), '옛 이름(벽체)이 든 프로젝트 자료를 만들었다');
await ev(`(async()=>{ await __markerDbg.applyProjectData(${JSON.stringify(oldSnap)}); return true; })()`); await sleep(600);
const labelsAfter = await ev(`(()=>{const t=document.querySelectorAll('#typeGrid *'); return [...new Set([...t].filter(e=>e.children.length===0).map(e=>e.textContent.trim()).filter(x=>/부재|벽체|바닥/.test(x)))];})()`);
ok(labelsAfter.includes('수직부재') && !labelsAfter.includes('벽체'), '옛 이름 프로젝트를 열어도 유형은 새 이름으로 보인다', labelsAfter);
const custom = await ev(`(()=>{const s=__markerDbg.buildProjectSnapshot(); s.seriesSnapshot=s.seriesSnapshot.map(t=>t.key==='wall'?Object.assign({},t,{label:'외벽'}):t); return s;})()`);
await ev(`(async()=>{ await __markerDbg.applyProjectData(${JSON.stringify(custom)}); return true; })()`); await sleep(500);
const labelsCustom = await ev(`(()=>{const t=document.querySelectorAll('#typeGrid *'); return [...new Set([...t].filter(e=>e.children.length===0).map(e=>e.textContent.trim()).filter(Boolean))];})()`);
ok(labelsCustom.includes('외벽'), '사용자가 직접 지은 이름(외벽)은 바꾸지 않는다', labelsCustom);

/* ══ ⑥ 결함 목록 카드 두 줄 + 층수·위치 ══ */
console.log('\n[6] 결함 목록');
await open(true);
await ev(`(()=>{const d=${D}; d.markers=[]; for(let i=0;i<2;i++) d.markers.push({id:'t'+i,uid:'u'+i,typeKey:'wall',xPct:20+i*20,yPct:40,angle:0,rptType:'벽체',rptMember:'콘크리트',rptDefect:'균열/백태',rptWidth:'0.3',rptLength:'500',rptCount:'1',rptTag:'12'}); __markerDbg.renderCanvas(); __markerDbg.renderTable(); return true})()`);
// 태블릿에서 결함 목록은 오른쪽 서랍 — 오른쪽 가장자리의 「결함 목록」 손잡이로 연다
const drawerOpen = () => ev(`(()=>{const c=document.querySelector('.marker-card'); if(!c) return false; const r=c.getBoundingClientRect(); return r.width>0 && r.left < innerWidth && r.right > 0;})()`);
if (!(await drawerOpen())) {
  await ev(`(()=>{const b=[...document.querySelectorAll('button,div,span')].find(e=>e.children.length<3&&/결함\s*목록/.test(e.textContent)&&e.getBoundingClientRect().left>1000); if(b) b.click(); return !!b})()`);
}
await sleep(600);
const roles = await ev(`[...document.querySelector('.marker-card').querySelectorAll('[data-role]')].map(e=>e.dataset.role)`);
eq(roles.slice(0, 5), ['pos', 'type', 'rptFloor', 'rptLoc', 'rptType'], '카드 칸 순서 : 번호·유형·층수·위치·부재');
const rowsOf = await ev(`(()=>{const c=document.querySelector('.marker-card'); const rs=[...c.children].map(e=>e.getBoundingClientRect()).filter(r=>r.height>0).sort((a,b)=>a.top-b.top); const rows=[]; rs.forEach(r=>{const row=rows.find(x=> r.top < x.bottom && r.bottom > x.top); if(row){row.top=Math.min(row.top,r.top); row.bottom=Math.max(row.bottom,r.bottom);} else rows.push({top:r.top,bottom:r.bottom});}); return rows.length;})()`);
eq(rowsOf, 2, '카드가 두 줄이다 (태블릿)');
const firstRow = await ev(`(()=>{const c=document.querySelector('.marker-card'); const kids=[...c.children]; const r0=kids[0].getBoundingClientRect(); return kids.filter(e=>{const r=e.getBoundingClientRect(); return r.top < r0.bottom && r.bottom > r0.top;}).map(e=>(e.querySelector('[data-role]')||e).dataset.role);})()`);
eq(firstRow, ['pos', 'type', 'rptFloor', 'rptLoc', 'rptType', 'rptMember'], '  1줄 : 번호·유형·층수·위치·부재·자재 (결함은 11-19 부터 아래 줄)');
const clipped = await ev(`(()=>{const c=document.querySelector('.marker-card'); const i=c.querySelector('[data-role="rptMember"]'); return i.scrollWidth<=i.clientWidth+1;})()`);
ok(await drawerOpen(), '결함 목록 서랍이 열렸다');
ok(clipped, '자재 「콘크리트」가 잘리지 않는다');
ok(await ev(`(()=>{const w=document.querySelector('.marker-list-wrap'); return w.scrollWidth<=w.clientWidth+1;})()`), '목록이 옆으로 넘치지 않는다');
await shot('1118-list-tablet.png');
// 값 넣기 → 마커에 저장
await ev(`(()=>{const i=document.querySelector('.marker-card [data-role="rptFloor"]'); i.value='3F'; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true}));
  const j=document.querySelector('.marker-card [data-role="rptLoc"]'); j.value='거실'; j.dispatchEvent(new Event('input',{bubbles:true})); j.dispatchEvent(new Event('change',{bubbles:true})); return true})()`);
eq(await ev(`[${D}.markers[0].rptFloor, ${D}.markers[0].rptLoc]`), ['지상3층', '거실'], '층수·위치를 쓰면 결함에 저장된다 (3F → 지상3층, 11-18 2차)');
ok(await ev(`document.querySelector('.marker-card').dataset.search.includes('거실')`), '층수·위치로 검색된다');
// 프로젝트 저장 → 다시 열기
const snap = await ev(`__markerDbg.buildProjectSnapshot()`);
await ev(`(async()=>{ ${D}.markers[0].rptFloor=''; await __markerDbg.applyProjectData(${JSON.stringify(snap)}); return true; })()`); await sleep(500);
eq(await ev(`[${D}.markers[0].rptFloor, ${D}.markers[0].rptLoc]`), ['지상3층', '거실'], '프로젝트로 저장했다 열어도 층수·위치가 남는다');
// CSV 내보내기·불러오기
const csv = await ev(`(()=>{const t=__markerDbg.buildDefectExportData(); return t ? {h:t.header, r:t.rows[0].cells} : null;})()`);
ok(csv.h.slice(1, 4).join() === '번호,층수,위치' && csv.r.slice(2, 4).join() === '지상3층,거실', 'CSV : 번호 오른쪽에 층수·위치 (11-19)', csv.h.slice(0, 5));
eq(csv.r[4], '수직부재', 'CSV 위치유형 열도 새 이름');
// CSV 를 다시 불러오면 층수·위치·유형이 그대로 (새 이름도 옛 이름도 받는다)
const csvText = [csv.h, csv.r, csv.r.map((v, i) => i === 4 ? '바닥/천장(범위)' : v)].map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join(String.fromCharCode(10));
await ev(`(()=>{ ${D}.markers=[]; __markerDbg.importCSVText(${JSON.stringify(csvText)}); return true; })()`); await sleep(500);
eq(await ev(`${D}.markers.map(m=>[m.typeKey, m.rptFloor||'', m.rptLoc||''])`), [['wall', '지상3층', '거실'], ['flat_area', '지상3층', '거실']], 'CSV 불러오기 : 층수·위치, 새 이름(수직부재)·옛 이름(바닥/천장(범위)) 모두 맞는 유형으로');
await ev(`(async()=>{ await __markerDbg.applyProjectData(${JSON.stringify(snap)}); return true; })()`); await sleep(400);
// 값 이어받기 : 새로 찍는 결함에 층수·위치가 따라온다
// 서랍을 닫고 도면에 새 결함을 찍는다
await ev(`document.getElementById('btnDrawerRight').click(); true`);
await sleep(600);
if (await drawerOpen()) await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); true`);
const p = await ptAt(0.25, 0.75);
await click(cdp, p.x, p.y); await sleep(500);
const nm = await ev(`(()=>{const ms=${D}.markers; const m=ms[ms.length-1]; return [ms.length, m.rptFloor||'', m.rptLoc||''];})()`);
eq(nm, [3, '지상3층', '거실'], '값 이어받기 : 새 결함에 직전 층수·위치가 들어간다');
await ev(`document.getElementById('btnQuickInputClose') && document.getElementById('btnQuickInputClose').click(); true`);

/* ══ ④⑤ 퀵입력 손글씨 ══ */
console.log('\n[4·5] 퀵입력 손글씨');
await open(true);
ok(await ev('__markerDbg.ink && __markerDbg.ink.isInkInputOn()'), '손글씨 입력 켬');
let q = await ptAt(0.35, 0.3);
await click(cdp, q.x, q.y); await sleep(500);
ok(await waitFor(`document.getElementById('quickInputSheet').style.display!=='none' && document.getElementById('quickInputSheet').classList.contains('ink-mode')`), '손글씨 퀵입력 시트가 열린다');
const numH = await ev(`[...document.querySelectorAll('#quickInputFields .ink-box.ink-num .ink-pad, #quickInputFields .ink-box.ink-int:not(.ink-floor) .ink-pad')].map(p=>Math.round(p.getBoundingClientRect().height))`);
ok(numH.length === 4 && numH.every(h => h >= 115), '⑤ 폭·길이·개수·사진 필기 칸 높이 118px (예전 92px)', numH);
const rowH0 = await ev(`Math.round(document.querySelector('#quickInputFields .qis-tax-row:nth-child(1)').getBoundingClientRect().height)`);
await ev(`document.querySelector('#quickInputFields [data-tax-write="rptType"]').click(); true`); await sleep(300);
const inRow = await ev(`(()=>{const b=document.querySelector('#quickInputFields .ink-box[data-k="rptType"]'); return !!b && !!b.closest('.qis-tax-row') && b.closest('.qis-tax-row').querySelector('.qis-tax-label').textContent;})()`);
eq(inRow, '부재', '④ 부재 ✎ → 필기 상자가 「부재」 줄 안에 들어간다');
const rowH1 = await ev(`Math.round(document.querySelector('.ink-box[data-k="rptType"]').closest('.qis-tax-row').getBoundingClientRect().height)`);
ok(rowH1 > rowH0 + 80, '  → 그 줄이 아래로 넓어진다', { 전: rowH0, 후: rowH1 });
const order = await ev(`[...document.querySelectorAll('#quickInputFields .qis-tax-row')].map(r=>r.querySelector('.qis-tax-label').textContent)`);
eq(order, ['층수', '위치', '부재', '자재', '결함'], '  → 줄 순서는 그대로 (11-19 부터 층수·위치가 앞에)');
ok(await ev(`(()=>{const b=document.querySelector('.ink-box[data-k="rptType"]'); const nxt=document.querySelector('#quickInputFields .qis-tax'); return nxt.contains(b);})()`), '  → 시트 아래쪽에 따로 생기지 않는다');
const padR = await ev(`(()=>{const r=document.querySelector('.ink-box[data-k="rptType"] .ink-pad').getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height};})()`);
ok(padR.w > 250 && padR.h >= 100, '  → 쓸 자리가 넉넉하다', padR);
await shot('1118-ink-row.png');
// 실제로 써 보기 — 줄이 다시 그려져도 상자(글씨)가 그 줄에 남는다
await drag(cdp, [{ x: padR.x + padR.w * 0.1, y: padR.y + padR.h * 0.3 }, { x: padR.x + padR.w * 0.3, y: padR.y + padR.h * 0.7 }, { x: padR.x + padR.w * 0.5, y: padR.y + padR.h * 0.3 }], { steps: 6 });
ok(await waitFor(`!!(${D}.markers[0].ink && ${D}.markers[0].ink.rptType)`, 3500), '쓴 글씨가 결함에 저장된다');
await sleep(300);
ok(await ev(`(()=>{const b=document.querySelector('#quickInputFields .ink-box[data-k="rptType"]'); return !!b && !!b.closest('.qis-tax-row') && b.classList.contains('has-ink');})()`), '글씨를 쓴 뒤에도 상자가 「부재」 줄 안에 글씨째 남아 있다');
// 줄 안의 필기 상자를 눌러도 줄이 바뀌지 않는다
const before = await ev(`document.querySelectorAll('#quickInputFields .qis-tax-row.open').length`);
await ev(`document.querySelector('.ink-box[data-k="rptType"] .ink-head').click(); true`); await sleep(200);
eq(await ev(`document.querySelectorAll('#quickInputFields .qis-tax-row.open').length`), before, '상자 머리를 눌러도 다른 줄이 펼쳐지지 않는다');
// ✎ 다시 → 쓰기 닫힘
await ev(`document.querySelector('#quickInputFields [data-tax-write="rptType"]').click(); true`); await sleep(300);
ok(await ev(`(()=>{const b=document.querySelector('#quickInputFields .ink-box[data-k="rptType"]'); return !b || !!b.closest('.qis-tax-row');})()`), '✎ 를 다시 눌러도 상자가 시트 아래로 떨어지지 않는다');
await ev(`document.getElementById('btnQuickInputClose').click(); true`);

/* ══ ①② 선택·이동 ══ */
console.log('\n[1·2] 선택·이동');
await open(false);
await ev(`${D}.markers=[]; __markerDbg.renderCanvas(); true`);
await ev(`__markerDbg.setSketchTool('line'); true`);
let a = await ptAt(0.15, 0.2), b = await ptAt(0.4, 0.2); await drag(cdp, [a, b]); await sleep(250);
await ev(`__markerDbg.setSketchTool(null); true`);
await ev(`document.getElementById('btnSelectMode').click(); true`); await sleep(250);
ok(!(await visible('#canvasFloatBar')), '② 「선택」만 누르면 아래 떠 있는 바(그리기 도구줄)가 나오지 않는다');
ok(!(await ev(`document.body.classList.contains('mode-sketch')`)), '  → 그리기 모드 표시도 없다');
await shot('1118-select-nobar.png');
const lineMid = async () => { const c = await ev(`(()=>{const s=${D}.sketch[0]; return {x:(s.pts[0].x+s.pts[1].x)/2, y:(s.pts[0].y+s.pts[1].y)/2};})()`); return ptAt(c.x / 100, c.y / 100); };
let lm = await lineMid(); await click(cdp, lm.x, lm.y); await sleep(250);
ok(await visible('#canvasFloatBar') && await visible('#sketchColorRow') && !(await visible('#sketchToolGroup')),
  '  그린 선을 고르면 색·굵기만 나오고 그리기 도구(직선·사각형…)는 없다');
await click(cdp, (await ptAt(0.9, 0.9)).x, (await ptAt(0.9, 0.9)).y); await sleep(250);
ok(!(await visible('#canvasFloatBar')), '  선을 놓으면 바가 다시 들어간다');
// 고르고 이동으로
lm = await lineMid(); await click(cdp, lm.x, lm.y); await sleep(250);
await ev(`document.getElementById('btnMoveMode').click(); true`); await sleep(300);
const pix = await ev(`(()=>{const s=${D}.sketch[0]; const c=document.getElementById('markerCanvas')||document.querySelector('canvas.marker-layer'); const cv=c||document.getElementById('mainCanvas');
  const ctx=cv.getContext('2d'); const W=cv.width, H=cv.height; const y0=Math.round(Math.min(s.pts[0].y,s.pts[1].y)/100*H)-6;
  const x0=Math.round(s.pts[0].x/100*W), x1=Math.round(s.pts[1].x/100*W); const d=ctx.getImageData(x0,Math.max(0,y0-6),Math.max(1,x1-x0),14).data;
  let green=0, blue=0; for(let i=0;i<d.length;i+=4){ const r=d[i],g=d[i+1],b=d[i+2],a=d[i+3]; if(a<40) continue; if(g>r+30&&g>b) green++; else if(b>r+40&&b>g) blue++; } return {green,blue, id:cv.id};})()`);
ok(pix.green > 20, '① 이동 모드에서도 고른 선 둘레에 점선이 남는다(초록)', pix);
ok(pix.blue < pix.green, '  → 선택 모드의 파란 점선이 아니라 이동 색이다', pix);
await shot('1118-move-dash.png');

console.log(`\n${passes} 통과 / ${fails} 실패`);
finish(cdp, fails ? 1 : 0);
