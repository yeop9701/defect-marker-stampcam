/* 2026-11-19 요청 검사 — 실제 브라우저.
   ① 필기 칸 가운데 선 제거 · 휴대폰에서 퀵입력 스크롤(늘 보이는 막대)
   ② 결함 칸을 카드 아래 줄로, 넓게  ③ 「마킹 제외 복사」  ④ 그리는 중에도 마킹 단추

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더> about:blank
     node tests/test-1119.mjs                                                        */
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
const click = async (id) => { await ev(`document.getElementById('${id}').click(); true`); await sleep(180); };
const D = '__markerDbg.getActiveDrawing()';
const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const tapXY = async (x, y) => { await touch('touchStart', [{ x, y }]); await sleep(40); await touch('touchEnd', []); await sleep(550); };
const tap = async (sel) => { const p = await ev(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`); await tapXY(p.x, p.y); };

async function boot(w, h, mobile = false, files = 1) {
  await cdp.send('DOM.enable');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  await cdp.send('Page.navigate', { url: APP }); await sleep(800);
  await ev(`localStorage.clear(); localStorage.setItem('defectMarkerTabletMode_v1','on'); localStorage.setItem('defectMarkerInk_v1', JSON.stringify({on:true,engine:'google',auto:false})); true`);
  await cdp.send('Page.navigate', { url: APP }); await sleep(1400);
  const r = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#addDrawingInput')` });
  await cdp.send('DOM.setFileInputFiles', { files: Array(files).fill(ROOT + 'test-fixtures/plan.png'), objectId: r.result.objectId }); await sleep(1000 + 300 * files);
}
const placeMarker = async () => {
  const p = await ev(`(()=>{const c=document.getElementById('mainCanvas'),r=c.getBoundingClientRect();for(let j=1;j<10;j++)for(let i=1;i<10;i++){const x=Math.round(r.left+r.width*i/10),y=Math.round(r.top+r.height*j/10);if(x<50||y<50||x>=innerWidth-50||y>=innerHeight-70)continue;if(document.elementFromPoint(x,y)===c)return {x,y}}return null})()`);
  await tapXY(p.x, p.y);
};
const sheet = () => ev(`(()=>{const s=document.getElementById('quickInputSheet'),r=s.getBoundingClientRect(),b=document.getElementById('quickInputFields'),t=document.getElementById('quickInputTitle').getBoundingClientRect(),bar=document.getElementById('tabletFloatBar').getBoundingClientRect();return {top:r.top,bottom:r.bottom,vh:innerHeight,barTop:bar.top,scroll:b.scrollTop,max:b.scrollHeight-b.clientHeight,has:s.classList.contains('has-scroll'),titleH:t.height}})()`);

/* ─── 휴대폰 ─── */
for (const [w, h] of [[390, 844], [844, 390]]) {
  console.log(`\n[휴대폰 ${w}×${h}] 퀵입력`);
  await boot(w, h, true);
  await placeMarker();
  eq(await vis('#quickInputSheet'), 1, '시트가 열린다');
  let s = await sheet();
  ok(s.top >= 0 && s.bottom <= s.barTop, '시트가 화면 안, 하단 바 위에서 끝난다', s);
  ok(s.has && s.max > 0, '넘치는 내용은 스크롤로 본다', s);
  eq(await vis('#quickInputScrollbar'), 1, '스크롤 막대가 늘 보인다');
  ok(s.titleH < 40, '제목이 세로로 찌그러지지 않는다', s);
  eq(await ev(`getComputedStyle(document.querySelector('.ink-pad')).backgroundImage`), 'none', '필기 칸 가운데 선이 없다');
  await shot(`1119-phone-${w}-top.png`);
  // 막대를 맨 아래까지 끈다 (실제 터치)
  const r = await ev(`(()=>{const r=document.querySelector('#quickInputScrollbar i').getBoundingClientRect(),b=document.getElementById('quickInputScrollbar').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),end:Math.round(b.bottom-2)}})()`);
  await touch('touchStart', [{ x: r.x, y: r.y }]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [{ x: r.x, y: Math.round(r.y + (r.end - r.y) * i / 8) }]); await sleep(20); }
  await touch('touchEnd', []); await sleep(200);
  s = await sheet();
  ok(s.scroll >= s.max - 2, '막대를 끌면 맨 아래까지 간다', s);
  const last = await ev(`(()=>{const b=document.getElementById('quickInputFields').getBoundingClientRect(),l=[...document.querySelectorAll('#quickInputFields .ink-box')].pop().getBoundingClientRect();return l.bottom<=b.bottom+1&&l.top<b.bottom})()`);
  ok(last, '마지막 칸이 보인다');
  eq(await ev(`(()=>{const t=document.querySelector('#quickInputScrollbar i').getBoundingClientRect(),b=document.getElementById('quickInputScrollbar').getBoundingClientRect();return Math.abs(t.bottom-b.bottom)<=2})()`), true, '손잡이도 맨 아래에 있다');
  await shot(`1119-phone-${w}-end.png`);
  // 스크롤한 뒤 쓴 글씨가 펜 끝 자리에 들어간다
  const before = await ev(`${D}.markers[0].ink ? Object.keys(${D}.markers[0].ink).length : 0`);
  const p = await ev(`(()=>{const q=[...document.querySelectorAll('#quickInputFields .ink-box .ink-pad')].pop(),r=q.getBoundingClientRect();return {x:Math.round(r.left+20),y:Math.round(r.top+24),k:q.closest('.ink-box').dataset.k}})()`);
  await touch('touchStart', [{ x: p.x, y: p.y }]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: p.x + i * 6, y: p.y + i * 5 }]); await sleep(15); }
  const scrollWhile = (await sheet()).scroll;
  await touch('touchEnd', []); await sleep(1300);
  eq(Math.round((await sheet()).scroll), Math.round(scrollWhile), '필기 칸에 쓰는 동안 시트가 밀리지 않는다');
  const stroke = await ev(`(()=>{const e=(${D}.markers[0].ink||{})['${p.k}'];return e&&e.s&&e.s[0]?[e.s[0][0],e.s[0][1]]:null})()`);
  ok(stroke && Math.abs(stroke[0] - 20) <= 3 && Math.abs(stroke[1] - 24) <= 3, '글씨가 쓴 자리에 저장된다', { stroke, before });
  await click('btnQuickInputClose');
}

console.log('\n[태블릿 1480×924] 퀵입력 + 결함 카드');
await boot(1480, 924);
await placeMarker();
let s = await sheet();
eq(s.has, false, '내용이 들어가면 막대가 나오지 않는다');
eq(await vis('#quickInputScrollbar'), 0, '  막대 숨김');
await click('btnQuickInputClose');
await click('btnDrawerRight'); await sleep(250);
const rects = await ev(`(()=>{const c=document.querySelector('.marker-card.mc-rpt'),g=k=>{const e=c.querySelector('[data-role="'+k+'"]').closest('.mc-cell,button,input,select');const r=e.getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,w:r.width}};const o={};['pos','type','rptFloor','rptLoc','rptType','rptMember','rptDefect','rptWidth','rptLength','rptCount','rptTag','photo','del'].forEach(k=>o[k]=g(k));const i=c.querySelector('.mc-info').getBoundingClientRect();o.info={l:i.left,r:i.right,t:i.top,w:i.width};o.card=c.getBoundingClientRect().right;return o})()`);
ok(rects.rptDefect.t > rects.rptMember.t + 20, '결함 칸이 아래 줄로 내려갔다', rects.rptDefect);
ok(Math.abs(rects.rptDefect.t - rects.rptWidth.t) < 2, '  폭·길이와 같은 줄');
ok(rects.rptDefect.w >= rects.rptMember.w * 1.5, '  자재 칸보다 넓다', { 결함: rects.rptDefect.w, 자재: rects.rptMember.w });
ok(rects.photo.l - rects.rptTag.r <= 8, '사진번호와 카메라 사이가 벌어지지 않는다', { 틈: rects.photo.l - rects.rptTag.r });
ok(rects.del.l - rects.info.r <= 8, 'ⓘ 와 ✕ 사이도 붙어 있다', { 틈: rects.del.l - rects.info.r });
ok(await ev(`(()=>{const c=document.querySelector('.marker-card.mc-rpt');return c.scrollWidth<=c.clientWidth})()`), '카드가 옆으로 넘치지 않는다');
await shot('1119-card.png');

console.log('\n[마킹 제외 복사]');
await boot(1280, 800, false, 3);
await click('btnDrawerLeft'); await sleep(250);
const btns = await ev(`(()=>{const a=document.getElementById('btnDuplicateOpen').getBoundingClientRect(),b=document.getElementById('btnDuplicateNoMarkOpen').getBoundingClientRect();return {same:Math.abs(a.top-b.top)<2,right:b.left>=a.right,inside:b.right<=document.querySelector('.sidebar.left').getBoundingClientRect().right}})()`);
eq(btns, { same: true, right: true, inside: true }, '「마킹 전체 복사」 오른쪽에 있다');
await shot('1119-copy-buttons.png');
await click('btnDuplicateNoMarkOpen');
eq(await ev(`document.getElementById('duplicateBackdrop').style.display`), 'none', '그린 선이 없으면 창을 열지 않는다');
await ev(`(()=>{const ds=__markerDbg.drawings||null;const d=${D};d.sketch=[{id:'s1',tool:'line',pts:[{x:10,y:10},{x:30,y:10}],color:'#000',w:1},{id:'s2',tool:'rect',pts:[{x:40,y:40},{x:60,y:60}],color:'#000',w:1}];d.markers.push({id:'mx',uid:'ux',typeKey:d.markers[0]?d.markers[0].typeKey:'crack',xPct:50,yPct:50,seq:1});__markerDbg.renderCanvas();return true})()`);
await click('btnDuplicateNoMarkOpen');
eq(await ev(`document.getElementById('duplicateTitle').textContent`), '마킹 제외 복사', '창 제목');
eq(await vis('#duplicateSketchRow'), 0, '「그린 선도 함께」 칸은 없다');
eq(await ev(`document.querySelectorAll('#duplicateDrawingList input').length`), 2, '다른 도면 2장');
await shot('1119-copy-modal.png');
const tabIds = await ev(`[...document.querySelectorAll('#duplicateDrawingList input')].map(i=>i.dataset.id)`);
await click('btnDuplicateSelectAll');
await click('btnDuplicateAppend'); await sleep(200);
// 도면을 차례로 열어 본다 (탭 순서 = 도면 순서, 복사 창 목록은 원본만 뺀 같은 순서)
const openTab = async (i) => { await ev(`document.querySelectorAll('#drawingTabs .drawing-tab')[${i}].querySelector('.name').click(); true`); await sleep(250); };
const counts = () => ev(`[${D}.markers.length, (${D}.sketch||[]).length, new Set((${D}.sketch||[]).map(s=>s.id)).has('s1')]`);
const srcTab = await ev(`[...document.querySelectorAll('#drawingTabs .drawing-tab')].findIndex(e=>e.classList.contains('active'))`);
const otherTabs = [0, 1, 2].filter(i => i !== srcTab);
await openTab(otherTabs[0]);
eq(await counts(), [0, 2, false], '대상 도면 : 마킹 0 · 선 2 (새 id)');
await ev(`(()=>{const d=${D};d.markers.push({id:'keep',uid:'keepu',typeKey:d.markers[0]?d.markers[0].typeKey:__markerDbg.getActiveDrawing().presetName&&'crack',xPct:20,yPct:20,seq:1});d.sketch.push({id:'own',tool:'line',pts:[{x:1,y:1},{x:2,y:2}],color:'#000',w:1});return true})()`);
await openTab(srcTab);
await click('btnDuplicateNoMarkOpen');
await ev(`document.querySelector('#duplicateDrawingList input[data-id=${JSON.stringify(tabIds[0])}]').click(); true`); await sleep(100);
await click('btnDuplicateOverwrite'); await sleep(200);
await openTab(otherTabs[0]);
eq((await counts()).slice(0, 2), [1, 2], '덮어쓰기 : 선만 바뀌고 대상의 마킹은 남는다');
await click('btnFloatUndo'); await sleep(250);
eq((await counts()).slice(0, 2), [1, 3], '실행취소로 되돌아간다');
// 기존 「마킹 전체 복사」는 그대로
await openTab(srcTab);
await click('btnDuplicateOpen');
eq(await ev(`document.getElementById('duplicateTitle').textContent`), '마킹 전체 복사', '기존 창 제목');
eq(await vis('#duplicateSketchRow'), 1, '  「그린 선도 함께」 칸이 있다');
await ev(`document.querySelector('#duplicateDrawingList input[data-id=${JSON.stringify(tabIds[1])}]').click(); true`); await sleep(100);
await click('btnDuplicateOverwrite'); await sleep(200);
await openTab(otherTabs[1]);
eq((await counts()).slice(0, 2), [1, 2], '  마킹과 선이 함께 복사된다');

/* ─── 그리기 중 마킹 단추 ─── */
for (const [w, h, n] of [[1480, 924, 4], [1280, 800, 4], [1024, 768, 4], [800, 1280, 0]]) {
  console.log(`\n[그리기 중 마킹 단추 ${w}×${h}]`);
  await boot(w, h);
  await click('btnFloatSketchMode');
  const fit = await ev(`(()=>{const b=document.getElementById('tabletFloatBar'),r=b.getBoundingClientRect();return {밀림:b.scrollWidth-b.clientWidth,왼:Math.round(r.left),오:Math.round(innerWidth-r.right)}})()`);
  ok(fit.밀림 <= 0 && fit.왼 >= 0 && fit.오 >= 0, '바가 화면 안, 옆으로 밀리지 않는다', fit);
  eq(await vis('#tabletFloatTypeGrid .tablet-float-type-btn'), n, `마킹 단추 ${n || '(하나로 접힘)'}`);
  eq(await ev(`document.querySelectorAll('#tabletFloatTypeGrid .tablet-float-type-btn.active').length`), n ? 1 : 1, '  지금 유형 정보는 유지');
  await shot(`1119-bar-${w}.png`);
  if (n) await tap('#tabletFloatTypeGrid .tablet-float-type-btn:nth-child(2)');
  else {
    await tap('#btnFloatTypePick');
    eq(await vis('#tabletSketchPop .tablet-float-type-btn'), 4, '  단추를 누르면 고르기 창에 4개');
    ok(await ev(`(()=>{const a=document.getElementById('tabletSketchPop').getBoundingClientRect(),b=document.getElementById('tabletFloatBar').getBoundingClientRect();return a.bottom<=b.top&&a.left>=0&&a.right<=innerWidth})()`), '  창이 바 위, 화면 안');
    await shot('1119-bar-800-pop.png');
    await tap('#tabletSketchPop .tablet-float-type-btn:nth-child(2)');
    eq(await vis('#tabletSketchPop'), 0, '  고르면 닫힌다');
  }
  eq(await ev(`document.body.classList.contains('mode-sketch')`), false, '마킹 단추를 누르면 그리기가 꺼진다');
  eq(await ev(`document.querySelectorAll('#tabletFloatTypeGrid .tablet-float-type-btn')[1].classList.contains('active')`), true, '  누른 유형이 골라진다');
  eq(await vis('#tabletFloatTypeGrid .tablet-float-type-btn'), 4, '  평소 바에는 4개가 그대로');
  const before = await ev(`${D}.markers.length`);
  await placeMarker();
  eq(await ev(`${D}.markers.length`), before + 1, '  바로 찍을 수 있다');
}

console.log(`\n${passes} 통과 / ${fails} 실패`);
finish(cdp, fails ? 1 : 0);
