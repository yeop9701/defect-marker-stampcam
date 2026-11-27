/* 2026-11-27 — 현황사진 마킹(초록·주황), 범례 기본 끔, S펜 버튼 지우기, 마지막 도면 지우면 그리기 해제,
   휴대폰·태블릿 도면 추가(이미지/PDF 따로), 스탬프 번호를 프로젝트에 맞추기, 스탬프 촬영 줌.

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더>
            --use-fake-device-for-media-stream --use-fake-ui-for-media-stream about:blank
     node tests/test-1127.mjs                                                        */
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
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function boot({ w = 1280, h = 800, tablet = true, ua = '' } = {}) {
  await cdp.send('DOM.enable');
  await cdp.send('Emulation.setUserAgentOverride', { userAgent: ua || '' });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: APP }); await sleep(800);
  await ev(`localStorage.clear(); ${tablet ? "localStorage.setItem('defectMarkerTabletMode_v1','on');" : ''} true`);
  await cdp.send('Page.navigate', { url: APP }); await sleep(1400);
}
const at = (fx, fy) => ev(`(()=>{const r=document.getElementById('mainCanvas').getBoundingClientRect();return {x:Math.round(r.left+r.width*${fx}),y:Math.round(r.top+r.height*${fy})}})()`);

console.log('\n[현황사진 마킹 2개 — 외관조사에 초록·주황, 범위 없음]');
await boot();
await ev(`__markerDbg.addBlankDrawing(); true`); await sleep(800);
const types = await ev(`${X}.DEFECT_TYPES.map(t=>[t.key,t.label,t.color,t.endStyle])`);
eq(types.map(t => t[0]), ['wall', 'flat', 'wall_area', 'flat_area', 'stat_v', 'stat_h'], '외관조사 유형 6개 (기존 4 + 현황사진 2)');
eq(types.slice(4), [['stat_v', '현황(1)', '#00B050', 'arrow'], ['stat_h', '현황(2)', '#FF8C00', 'arrow']], '  초록·주황 화살표 (범위형 없음, 3차 요청으로 이름 현황(1)·(2))');
const grid = await ev(`[...document.querySelectorAll('#typeGrid [data-key], #typeGrid button, .type-grid button')].map(b=>b.textContent.trim()).join('|')`);
ok(/현황\(1\)/.test(grid) && /현황\(2\)/.test(grid), '  좌측 유형 목록에 보인다', grid);

// 번호 : 결함은 결함끼리, 현황사진은 두 색을 합쳐 따로 1,2,3
await ev(`(()=>{const d=${D};const mk=(id,k,x)=>({id,uid:id,typeKey:k,xPct:x,yPct:40});
  d.markers=[mk('a','wall',10),mk('s1','stat_v',20),mk('b','flat',30),mk('s2','stat_h',40),mk('c','wall_area',50),mk('s3','stat_v',60)];
  d.markers[4].rectXPct=45;d.markers[4].rectYPct=50;d.markers[4].rectWPct=10;d.markers[4].rectHPct=10;
  __markerDbg.renderCanvas();__markerDbg.renderTable();return true})()`); await sleep(300);
eq(await ev(`${D}.markers.map(m=>m.id+':'+m.seq).join(' ')`), 'a:1 s1:1 b:2 s2:2 c:3 s3:3', '결함 1·2·3 은 건너뛰지 않고, 현황사진은 초록·주황 합쳐 1·2·3');
await shot('1127-status-markers.png');
// 번호 칸에 값을 넣어 옮기기 — 같은 묶음 안에서
await ev(`(()=>{const c=[...document.querySelectorAll('.mc-seq')];const i=${D}.markers.findIndex(m=>m.id==='s3');const inp=document.querySelectorAll('[data-role="pos"]')[i];inp.value='1';inp.dispatchEvent(new Event('change',{bubbles:true}));return true})()`); await sleep(300);
eq(await ev(`${D}.markers.filter(m=>m.typeKey.startsWith('stat')).map(m=>m.id+':'+m.seq).join(' ')`), 's3:1 s1:2 s2:3', '현황사진 3번을 1로 바꾸면 현황사진 맨 앞으로');
eq(await ev(`${D}.markers.filter(m=>!m.typeKey.startsWith('stat')).map(m=>m.id+':'+m.seq).join(' ')`), 'a:1 b:2 c:3', '  결함 번호는 그대로');
// 입력칸 · 점검
eq(await ev(`${X}.missingFieldLabels(${D}.markers.find(m=>m.id==='s1'))`), [], '현황사진은 부재·자재·결함이 비어도 「빈 결함」으로 안 잡힌다');
eq(await ev(`(()=>{const m=${D}.markers.find(m=>m.id==='s1');const a=${X}.isMarkerDone(m,false);m.rptLoc='주방';m.note='전경';const b=${X}.isMarkerDone(m,false);m.rptLoc='';m.note='';return [a,b]})()`), [false, true], '  위치·내용을 채우면 「다 채움」(3차)');
eq(await ev(`(()=>{const s=__markerDbg.info.buildSummarySheet();return s?s.rows.find(r=>r.cells[0]==='전체').cells[2]:null})()`), 3, '  엑셀 집계 시트는 결함 3건만 센다');
// 범례 : 현황사진은 쓴 도면에만
await ev(`document.getElementById('legendToggle').checked=true; true`);
// 예전 4종 스냅샷 → 현황사진이 붙는다 · 이름을 바꾼 목록은 그대로
eq(await ev(`${X}.sanitizeSeriesSnapshot(__markerDbg.info.allPresets()[0].series.slice(0,4)).map(t=>t.key)`), ['wall', 'flat', 'wall_area', 'flat_area', 'stat_v', 'stat_h'], '예전 외관조사 4종 프로젝트를 열면 현황사진 2개가 붙는다');
eq(await ev(`${X}.sanitizeSeriesSnapshot(__markerDbg.info.allPresets()[0].series.slice(0,3)).length`), 3, '  사용자가 바꾼 목록(3종)은 건드리지 않는다');
eq(await ev(`${X}.sanitizeSeriesSnapshot(__markerDbg.info.allPresets()[0].series)[4].numbering.group`), 'stat', '  번호 묶음(group)이 저장·복원된다');
await ev(`(()=>{const snap=JSON.parse(JSON.stringify(__markerDbg.buildProjectSnapshot()));__markerDbg.applyProjectData(snap);return true})()`); await sleep(1200);
eq(await ev(`${D}.markers.filter(m=>m.typeKey.startsWith('stat')).map(m=>m.seq).join(',')`), '1,2,3', '  저장 후 다시 열어도 현황사진 1·2·3');

console.log('\n[내보내기 범례 기본 끔]');
await boot();
eq(await ev(`[document.getElementById('legendToggle').checked, ${X}.isLegendEnabled()]`), [false, false], '처음 열면 「범례」가 꺼져 있다');

console.log('\n[마지막 도면을 지우면 그리기가 풀린다]');
await ev(`__markerDbg.addBlankDrawing(); true`); await sleep(800);
await ev(`__markerDbg.setSketchTool('line'); true`); await sleep(200);
eq(await ev(`[!!__markerDbg.sketchTool, document.getElementById('btnSketchMode').classList.contains('active')]`), [true, true], '그리기 켬');
await ev(`${X}.deleteDrawing(${D}.id); true`); await sleep(400);
const after = await ev(`(()=>{const h=document.getElementById('modeHint');const r=h&&h.getBoundingClientRect();return {tool:__markerDbg.sketchTool,btn:document.getElementById('btnSketchMode').classList.contains('active'),
  fbtn:(document.getElementById('btnFloatSketchMode')||{classList:{contains:()=>false}}).classList.contains('active'),
  sketchBody:document.body.classList.contains('mode-sketch'),hintTxt:h?h.textContent:'' ,hintVisible:!!(r&&r.width&&r.height&&getComputedStyle(h).visibility!=='hidden'&&getComputedStyle(h).display!=='none')}})()`);
ok(after.tool === null && !after.btn && !after.fbtn, '도면을 지우면 그리기 단추가 풀린다', after);
ok(!after.sketchBody, '  그리기 바(mode-sketch)도 사라진다', after);
ok(!/그리기 모드/.test(after.hintTxt) || !after.hintVisible, '  「그리기 모드」 안내 띠가 남지 않는다', after);
await shot('1127-deleted-drawing.png');
// 되돌리면 도면은 돌아오고 그리기는 꺼진 채
await ev(`__markerDbg.undo(); true`); await sleep(400);
eq(await ev(`[!!${D}, __markerDbg.sketchTool]`), [true, null], '  실행취소로 도면은 돌아오고 그리기는 꺼진 채');

console.log('\n[S펜 옆 버튼을 누른 채 그으면 그린 선이 지워진다]');
await boot();
await ev(`__markerDbg.addBlankDrawing(); true`); await sleep(800);
await ev(`(()=>{const d=${D};d.markers=[{id:'a',uid:'a',typeKey:'wall',xPct:50,yPct:30,seq:1}];
  d.sketch=[{id:'s1',tool:'line',color:'#0b0b0b',width:1,pts:[{x:30,y:40},{x:30,y:80}]},{id:'s2',tool:'line',color:'#0b0b0b',width:1,pts:[{x:70,y:40},{x:70,y:80}]}];
  __markerDbg.renderCanvas();__markerDbg.renderTable();return true})()`);
await ev(`__markerDbg.setSketchTool('pen'); true`); await sleep(150);
const pen = (type, x, y, btn) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: btn, buttons: type === 'mouseReleased' ? 0 : (btn === 'right' ? 2 : 1), clickCount: 1, pointerType: 'pen', force: 0.5 });
let a = await at(0.2, 0.6), b = await at(0.5, 0.6), m = await at(0.5, 0.3);
await pen('mousePressed', a.x, a.y, 'right');
for (let i = 1; i <= 12; i++) { await pen('mouseMoved', a.x + (b.x - a.x) * i / 12, a.y, 'right'); await sleep(10); }
ok(!!(await ev(`${X}.penBtnErase`)), '  누르는 동안 펜 버튼 지우개가 켜져 있다');
await shot('1127-pen-erase.png');
await pen('mouseMoved', m.x, m.y, 'right'); await sleep(20);   // 결함 마킹 위도 지나간다
await pen('mouseReleased', m.x, m.y, 'right'); await sleep(250);
eq(await ev(`${D}.sketch.map(s=>s.id)`), ['s2'], '펜 버튼으로 지나간 선(s1)만 지워진다');
eq(await ev(`${D}.markers.length`), 1, '  결함 마킹은 지우지 않는다');
eq(await ev(`[__markerDbg.sketchTool, ${D}.sketch.length]`), ['pen', 1], '  손을 떼면 자유선 도구 그대로, 새 선은 안 그려진다');
eq(await ev(`[${X}.penBtnErase, __markerDbg.eraseCursorPt]`), [null, null], '  지우개 원도 사라진다');
await ev(`__markerDbg.undo(); true`); await sleep(200);
eq(await ev(`${D}.sketch.map(s=>s.id).sort()`), ['s1', 's2'], '  실행취소 한 번으로 돌아온다');
// 버튼 없이 그으면 평소처럼 그린다
await pen('mousePressed', a.x, a.y + 40, 'left');
for (let i = 1; i <= 10; i++) { await pen('mouseMoved', a.x + i * 20, a.y + 40 + (i % 3) * 4, 'left'); await sleep(10); }
await pen('mouseReleased', a.x + 200, a.y + 40, 'left'); await sleep(250);
eq(await ev(`${D}.sketch.length`), 3, '버튼 없이 그으면 평소처럼 선이 그려진다');
// 그리기 아닌 도구(마킹 추가)에서도 펜 버튼은 선만 지운다
await ev(`__markerDbg.setSketchTool(null); true`); await sleep(100);
const before = await ev(`${D}.markers.length`);
a = await at(0.6, 0.6); b = await at(0.8, 0.6);
await pen('mousePressed', a.x, a.y, 'right');
for (let i = 1; i <= 10; i++) { await pen('mouseMoved', a.x + (b.x - a.x) * i / 10, a.y, 'right'); await sleep(10); }
await pen('mouseReleased', b.x, b.y, 'right'); await sleep(250);
eq(await ev(`[${D}.sketch.some(s=>s.id==='s2'), ${D}.markers.length]`), [false, before], '마킹 모드에서도 펜 버튼으로 선을 지우고, 마킹은 새로 안 찍힌다');

console.log('\n[휴대폰·태블릿 도면 추가 — 이미지 / PDF 따로]');
await boot({ ua: ANDROID });
eq(await ev(`__markerDbg.info.isMobileDevice()`), true, '안드로이드 태블릿으로 본다');
await ev(`document.getElementById('btnEmptyAdd').click(); true`); await sleep(200);
const pk = await ev(`(()=>{const p=document.getElementById('addDrawingPicker');return p?[...p.querySelectorAll('button')].map(b=>b.textContent.trim()):null})()`);
ok(pk && pk.length === 3 && /이미지/.test(pk[0]) && /PDF/.test(pk[1]), '「도면 이미지 추가」 → 이미지 / PDF / 취소', pk);
await shot('1127-add-picker.png');
eq(await ev(`[document.getElementById('addDrawingImageInput').accept, document.getElementById('addDrawingPdfInput').accept]`), ['image/*', 'application/pdf,.pdf'], '  이미지 칸은 image/* 만, PDF 칸은 PDF 만 받는다(캠코더가 안 섞임)');
// PDF 고르면 PDF 칸이 열린다
await ev(`window.__clicked=null; ['addDrawingImageInput','addDrawingPdfInput','addDrawingInput'].forEach(id=>{const el=document.getElementById(id);el.click=()=>{window.__clicked=id;};}); true`);
await ev(`[...document.querySelectorAll('#addDrawingPicker button')][1].click(); true`); await sleep(100);
eq(await ev(`[window.__clicked, !!document.getElementById('addDrawingPicker')]`), ['addDrawingPdfInput', false], '  「PDF 파일」 → PDF 고르기 창, 선택 창은 닫힘');
await ev(`document.getElementById('btnAddDrawing').click(); true`); await sleep(100);
await ev(`[...document.querySelectorAll('#addDrawingPicker button')][0].click(); true`); await sleep(100);
eq(await ev(`window.__clicked`), 'addDrawingImageInput', '  좌측 「+ 도면 추가」 → 「이미지」 → 이미지 고르기 창');
// 실제 PDF 파일이 PDF 칸으로 들어가 도면이 된다
const { root } = await cdp.send('DOM.getDocument');
const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#addDrawingPdfInput' });
const pdfPath = fileURLToPath(new URL('../test-fixtures/', import.meta.url));
const fs = await import('node:fs');
const pdfs = fs.readdirSync(pdfPath).filter(f => f.endsWith('.pdf'));
if (pdfs.length) {
  await cdp.send('DOM.setFileInputFiles', { nodeId, files: [pdfPath + pdfs[0]] }); await sleep(4000);
  ok((await ev(`__markerDbg.info.drawings.length`)) >= 1, `  PDF(${pdfs[0]})를 PDF 칸으로 넣으면 도면이 생긴다`);
} else console.log('  (test-fixtures 에 PDF 가 없어 실제 넣기는 건너뜀)');
await boot({ ua: '' });
await ev(`window.__clicked=null; document.getElementById('addDrawingInput').click=()=>{window.__clicked='addDrawingInput';}; document.getElementById('btnEmptyAdd').click(); true`); await sleep(100);
eq(await ev(`[window.__clicked, !!document.getElementById('addDrawingPicker')]`), ['addDrawingInput', false], '컴퓨터는 예전처럼 한 창(이미지·PDF 함께)');

console.log('\n[스탬프 번호를 프로젝트에 맞추기]');
await boot();
await ev(`__markerDbg.addBlankDrawing(); true`); await sleep(800);
const setCur = (n) => ev(`(()=>{const s=StampCam._debug.loadSettings();s.current=${n};s.sub=1;StampCam._debug.saveSettings(s);return true})()`);
const cur = () => ev(`StampCam.peek().number`);
await setCur(57);
await ev(`(()=>{const d=${D};d.markers=[{id:'a',uid:'a',typeKey:'wall',xPct:50,yPct:30}];__markerDbg.renderTable();return true})()`);
ok(/1부터/.test(await ev(`${X}.syncStampCounterToProject()`)) && (await cur()) === 1, '사진 없는 새 프로젝트 → 번호 1부터 (예전 현장 57 에서)');
await setCur(5);   // 같은 프로젝트에서 스탬프 카메라 앱으로 몇 장 더 찍음
eq([await ev(`${X}.syncStampCounterToProject()`), await cur()], ['', 5], '  같은 프로젝트에서 번호가 더 올라가 있으면 내리지 않는다(파일 이름 겹침 방지)');
await ev(`(()=>{const m=${D}.markers[0];m.rptTag='12';m.photos=['data:image/png;base64,AAAA'];m.photoMeta={[__markerDbg.info.photoKey(m.photos[0])]:{no:'0009'},gone:{no:'0099'}};return true})()`);
ok(/0013부터/.test(await ev(`${X}.syncStampCounterToProject()`)) && (await cur()) === 13, '사진번호 12 가 있으면 13 부터 (붙인 사진 번호 0009 보다 큰 쪽)');
// 다른 프로젝트를 열었다가 돌아오기
await ev(`(()=>{const snap=JSON.parse(JSON.stringify(__markerDbg.buildProjectSnapshot()));window.__snapA=snap;return true})()`);
await setCur(200);   // 다른 프로젝트에서 쓰다 이 프로젝트로 돌아옴(마지막 주인이 다른 프로젝트)
await ev(`localStorage.setItem('defectMarkerStampOwner_v1', JSON.stringify({uuid:'someone-else'})); true`);
eq([await ev(`${X}.syncStampCounterToProject()`).then(s => /0013부터/.test(s)), await cur()], [true, 13], '  다른 프로젝트에서 쓰다 돌아오면 200 → 13 (이 프로젝트에 이어서)');
await ev(`(()=>{const s=JSON.parse(JSON.stringify(window.__snapA));s.projectUuid='other-project';s.drawings.forEach(d=>d.markers.forEach(m=>{m.rptTag='';m.photoMeta={};}));__markerDbg.applyProjectData(s);return true})()`); await sleep(1200);
await setCur(40);
ok(/1부터/.test(await ev(`${X}.syncStampCounterToProject()`)) && (await cur()) === 1, '사진 없는 다른 프로젝트를 열면 다시 1 부터');
// 사진 창의 「다음」 표시도 맞춰질 번호
await setCur(77);
await ev(`(()=>{const d=${D};d.markers[0].rptTag='3';return true})()`);
await ev(`(()=>{localStorage.removeItem('defectMarkerStampOwner_v1');return true})()`);
const plan = await ev(`${X}.stampCounterPlan()`);
eq([plan.target, plan.change], [4, true], '  열기 전 계획 : 4 로 맞춤');
// 「같은 번호 여러 장」 중에는 손대지 않는다
await ev(`(()=>{const s=StampCam._debug.loadSettings();s.sameOn=true;StampCam._debug.saveSettings(s);return true})()`);
eq([await ev(`${X}.syncStampCounterToProject()`), await cur()], ['', 77], '「같은 번호 여러 장」 켬이면 그대로');
await ev(`(()=>{const s=StampCam._debug.loadSettings();s.sameOn=false;StampCam._debug.saveSettings(s);return true})()`);

console.log('\n[스탬프 촬영 — 열 때 번호 맞춤 · 줌]');
await ev(`(()=>{const d=${D};${X}.openStampCamFor(d.markers[0]);return true})()`); await sleep(2500);
eq(await ev(`document.querySelector('.sc-ov [data-sc="next"]').textContent`), '0004', '촬영 화면을 열면 다음 번호 0004');
ok(/이어서 0004부터/.test(await ev(`(document.querySelector('.sc-ov .sc-toast')||{}).textContent||''`)), '  「번호를 이 프로젝트에 이어서 0004부터」 알림');
const z0 = await ev(`(()=>{const z=document.querySelector('.sc-ov [data-sc="zoom"]');return {btns:[...z.querySelectorAll('button')].filter(b=>!b.hidden).map(b=>b.textContent),lab:z.querySelector('[data-sc="zlab"]').textContent,
  ta:getComputedStyle(document.querySelector('.sc-frame')).touchAction}})()`);
ok(z0.btns.includes('1×') && z0.btns.includes('2×'), '줌 단추 1× 2× 3×', z0);
eq(z0.ta, 'none', '  미리보기는 브라우저 확대(touch-action)를 막는다 — 예전엔 화면 전체가 커져 깨졌다');
await ev(`document.querySelector('.sc-ov [data-z="2"]').click(); true`); await sleep(300);
const z1 = await ev(`(()=>{const v=document.querySelector('.sc-ov video');return {lab:document.querySelector('.sc-ov [data-sc="zlab"]').textContent,tf:v.style.transform,hw:!!StampCam._debug.ui.camera.zoomRange,zoom:StampCam._debug.ui.zoom}})()`);
ok(z1.zoom === 2 && (z1.hw ? z1.tf === '' : /scale\(2\)/.test(z1.tf)), `2× 누르면 ${z1.hw ? '카메라 줌' : '화면 확대(가짜 카메라는 카메라 줌 없음)'} 2배`, z1);
// 두 손가락 벌리기
const fr = await ev(`(()=>{const r=document.querySelector('.sc-frame').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
const tp = (type, d) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: fr.x - d, y: fr.y, id: 1 }, { x: fr.x + d, y: fr.y, id: 2 }] });
await tp('touchStart', 40); for (let i = 1; i <= 8; i++) { await tp('touchMove', 40 + i * 5); await sleep(20); } await tp('touchEnd'); await sleep(200);
const z2 = await ev(`StampCam._debug.ui.zoom`);
ok(z2 > 2.8 && z2 <= 4, `  두 손가락으로 벌리면 더 커진다 (2 → ${z2.toFixed(2)})`, z2);
await shot('1127-stamp-zoom.png');
// 찍으면 확대한 만큼 잘린 사진 (가짜 카메라 = 디지털 줌)
await ev(`document.querySelector('.sc-ov [data-z="2"]').click(); true`); await sleep(200);
const vw = await ev(`document.querySelector('.sc-ov video').videoWidth`);
await ev(`document.querySelector('.sc-ov [data-sc="shutter"]').click(); true`); await sleep(2500);
const ph = await ev(`(async()=>{const m=${D}.markers[0];const src=m.photos.at(-1);const im=new Image();im.src=src;await im.decode();return {w:im.naturalWidth,tag:m.rptTag,n:m.photos.length}})()`);
ok(ph.n === 2 && ph.tag === '4', '  찍으면 결함에 붙고(앞서 넣은 시험 사진 + 1) 사진번호 4', ph);
ok(z1.hw || ph.w <= Math.ceil(vw / 2) + 2, `  화면 확대 2× 로 찍은 사진은 가운데 1/2 (영상 폭 ${vw} → 사진 ${ph.w})`, { vw, ph });
eq(await cur(), 5, '  번호는 5 로 오른다');
await ev(`StampCam.close(); true`); await sleep(300);

console.log(`\n통과 ${passes} · 실패 ${fails}`);
process.exit(fails ? 1 : 0);
