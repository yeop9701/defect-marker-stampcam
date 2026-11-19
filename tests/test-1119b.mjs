/* 2026-11-19 2차 요청 검사 — 실제 브라우저.
   ① 휴대폰 저장(PDF·엑셀·CSV : 저장·공유 창, 실제 파일)  ② 엑셀 도면명  ③ CSV 층수·위치 자리
   ④ 미변환 손글씨 표시·저장 전 확인  ⑤ ⚙ 숨김  ⑥ 휴대폰 하단 바  ⑦ 다음 결함에 복사

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더> about:blank
     node tests/test-1119b.mjs                                                       */
import { connect, finish } from './cdp.mjs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = fileURLToPath(new URL('./out/', import.meta.url));
const DL = path.join(OUT, 'dl1119');
mkdirSync(OUT, { recursive: true });
const APP = process.env.APP_URL || ((process.env.BASE_URL || 'http://localhost:8125') + '/defect-marker-stampcam/index.html');
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const cdp = await connect(Number(process.env.CDP_PORT || 9223));
const ev = (s) => cdp.evaluate(s);
let fails = 0, passes = 0;
const ok = (c, m, x) => { if (c) passes++; else fails++; console.log((c ? '  OK   ' : '  FAIL ') + m + (!c && x !== undefined ? '  → ' + JSON.stringify(x) : '')); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m, { 실제: a, 바람: b });
const shot = async (n) => { const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(OUT + n, Buffer.from(data, 'base64')); };
const vis = (s) => ev(`[...document.querySelectorAll('${s}')].filter(e=>{const c=getComputedStyle(e);return c.display!=='none'&&c.visibility!=='hidden'&&e.getClientRects().length>0}).length`);
const click = async (id, ms = 200) => { await ev(`document.getElementById('${id}').click(); true`); await sleep(ms); };
const D = '__markerDbg.getActiveDrawing()';
const tapXY = async (x, y) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(40); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(500); };
const tap = async (sel) => { const p = await ev(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`); await tapXY(p.x, p.y); };
const until = async (expr, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr)) return true; await sleep(150); } return false; };
const files = () => { try { return readdirSync(DL).filter(f => !f.endsWith('.crdownload') && !f.endsWith('.tmp')); } catch (e) { return []; } };
const waitFile = async (re, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { const f = files().find(n => re.test(n)); if (f) return path.join(DL, f); await sleep(150); } return null; };
async function boot(w, h, { mobile = false, ua = '', ink = true } = {}) {
  await cdp.send('DOM.enable');
  await cdp.send('Emulation.setUserAgentOverride', { userAgent: ua || (await cdp.send('Browser.getVersion')).userAgent.replace('HeadlessChrome', 'Chrome') });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  await cdp.send('Page.navigate', { url: APP }); await sleep(800);
  await ev(`localStorage.clear(); localStorage.setItem('defectMarkerTabletMode_v1','on'); localStorage.setItem('defectMarkerInk_v1', JSON.stringify({on:${ink},engine:'google',auto:false})); true`);
  await cdp.send('Page.navigate', { url: APP }); await sleep(1400);
  const r = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#addDrawingInput')` });
  await cdp.send('DOM.setFileInputFiles', { files: [ROOT + 'test-fixtures/plan.png'], objectId: r.result.objectId }); await sleep(1100);
}
const addMarkers = (n) => ev(`(()=>{const d=${D},k=__markerDbg.info.allPresets()[0].series[0].key;for(let i=0;i<${n};i++)d.markers.push({id:'t'+i,uid:'u'+i,typeKey:k,xPct:20+i*10,yPct:30,angle:0,seq:i+1});__markerDbg.renderTable();__markerDbg.renderCanvas();return d.markers.length})()`);
const fit = () => ev(`(()=>{const b=document.getElementById('tabletFloatBar'),r=b.getBoundingClientRect();return {밀림:b.scrollWidth-b.clientWidth,왼:Math.round(r.left),오:Math.round(innerWidth-r.right)}})()`);
const fits = (f) => f.밀림 <= 0 && f.왼 >= 0 && f.오 >= 0;

rmSync(DL, { recursive: true, force: true }); mkdirSync(DL, { recursive: true });
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });

console.log('\n[휴대폰 저장 390×844, 안드로이드]');
await boot(390, 844, { mobile: true, ua: ANDROID });
eq(await ev(`__markerDbg.info.isMobileDevice()`), true, '휴대폰으로 알아본다');
await addMarkers(2);
await ev(`(()=>{const m=${D}.markers[0];m.rptFloor='지상1층';m.rptLoc='거실';m.rptType='벽체';return true})()`);
await ev(`(()=>{navigator.canShare=()=>true;navigator.share=async d=>{window.__shared=d.files[0].name};return true})()`);
const exportBtn = await ev(`(()=>{const b=document.getElementById('btnOpenExport');const r=b.getBoundingClientRect();return {w:r.width>0,in:r.right<=innerWidth&&r.left>=0}})()`);
ok(exportBtn.w, '내보내기 단추가 있다', exportBtn);
await click('btnOpenExport');
eq(await vis('#exportBackdrop'), 1, '내보내기 창이 열린다');
await click('btnExportXLSX', 300);
eq(await vis('#inkExportBackdrop'), 1, '엑셀 : 빈 칸이 있으면 먼저 알려 준다');
await click('btnInkExportAnyway', 500);
eq(await vis('#fileReadyBackdrop'), 1, '엑셀 : 저장·공유 창이 뜬다');
eq(files().length, 0, '  누르기 전에는 저장되지 않는다');
await shot('1119b-file-ready.png');
await ev(`document.querySelector('#fileReadyList [data-file-act=save]').click(); true`);
const xlsx = await waitFile(/\.xlsx$/);
ok(!!xlsx, '  「저장」 : 엑셀 파일이 기기에 저장된다');
if (xlsx) { const b = readFileSync(xlsx); ok(b[0] === 0x50 && b[1] === 0x4b && b.includes(Buffer.from('<t>도면명</t>')), '  올바른 xlsx, 도면명 열이 있다'); }
await ev(`document.querySelector('#fileReadyList [data-file-act=share]').click(); true`); await sleep(200);
ok(/\.xlsx$/.test(await ev(`window.__shared||''`)), '  「공유」 : 파일이 공유로 넘어간다');
await click('btnFileReadyClose');
eq(await vis('#fileReadyBackdrop'), 0, '  닫힌다');
await ev(`(()=>{const s=document.getElementById('exportFormatSelect');s.value='pdf';s.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
await click('btnExportPNG', 100);
ok(await until(`document.getElementById('fileReadyBackdrop').style.display==='flex'`), 'PDF : 다 만들면 창이 뜬다');
await ev(`document.querySelector('#fileReadyList [data-file-act=save]').click(); true`);
const pdf = await waitFile(/\.pdf$/);
ok(!!pdf && readFileSync(pdf).subarray(0, 5).toString() === '%PDF-', '  PDF 파일이 저장된다');
await click('btnFileReadyClose');
await click('btnExportAll', 100);
ok(await until(`document.getElementById('fileReadyBackdrop').style.display==='flex'`), '전체 도면 PDF 도 같은 창');
await sleep(150);
ok(!(await ev(`/저장했습니다/.test((document.querySelector('.app-toast-stack')||{}).textContent||'')`)), '  누르기 전에 「저장했습니다」 알림이 없다');
await click('btnFileReadyClose');
await click('btnExportCSV', 200); await click('btnInkExportAnyway', 300);
eq(await ev(`document.querySelectorAll('#fileReadyList .file-ready-row').length`), 1, 'CSV 도 같은 창');
await ev(`document.querySelector('#fileReadyList [data-file-act=save]').click(); true`);
const csvPath = await waitFile(/\.csv$/);
ok(!!csvPath, '  CSV 파일이 저장된다');
if (csvPath) {
  const [h, r] = readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '').split('\r\n').map(l => l.split(','));
  eq(h.slice(0, 5), ['도면명', '번호', '층수', '위치', '위치유형'], 'CSV : 번호 오른쪽에 층수·위치');
  eq(r.slice(2, 4), ['지상1층', '거실'], '  값도 그 자리에');
  eq(h.filter(x => x === '층수' || x === '위치').length, 2, '  같은 열이 두 번 나오지 않는다');
}
await click('btnFileReadyClose'); await click('btnExportModalClose');

console.log('\n[휴대폰 하단 바]');
let f = await fit(); ok(fits(f), '평소 : 옆으로 밀리지 않는다', f);
eq([await vis('#btnFloatUndo'), await vis('#btnFloatTypePick'), await vis('#btnFloatSelectMode'), await vis('#btnFloatMoveMode'), await vis('#btnFloatEraseMode'), await vis('#btnFloatSketchMode'), await vis('#btnFloatInk'), await vis('#btnFloatMore')], [1, 1, 1, 1, 1, 1, 1, 1], '자주 쓰는 8개');
eq([await vis('#btnFloatRedo'), await vis('#btnFloatZoomFit'), await vis('#btnFloatCanvasMax'), await vis('#tabletFloatTypeGrid')], [0, 0, 0, 0], '나머지는 숨김');
await shot('1119b-phone-bar.png');
await tap('#btnFloatMore');
eq(await ev(`[...document.querySelectorAll('#tabletPopProxy .float-proxy')].map(b=>b.textContent.trim())`), ['다시 실행', '화면 맞춤', '크게 보기', '프로젝트 백업'], '⋯ 안에 4개');
await shot('1119b-phone-more.png');
eq(await ev(`(()=>{const a=[...document.querySelectorAll('#tabletPopProxy .float-proxy')].map(b=>b.getBoundingClientRect());const p=document.getElementById('tabletSketchPop').getBoundingClientRect(),bar=document.getElementById('tabletFloatBar').getBoundingClientRect();return [a.every(r=>r.width>=60&&r.height>=50),a.every((r,i)=>!i||r.left>=a[i-1].right||r.top>=a[i-1].bottom),p.left>=0&&p.right<=innerWidth&&p.bottom<=bar.top]})()`), [true, true, true], '  ⋯ 창 단추가 겹치지 않고 화면 안');
await tap('#tabletPopProxy .float-proxy:nth-child(3)');
eq(await vis('#tabletSketchPop'), 0, '고르면 닫힌다');
eq(await ev(`document.body.classList.contains('canvas-max')`), true, '  「크게 보기」가 실제로 동작한다');
await click('btnFloatCanvasMax');
await tap('#btnFloatTypePick');
eq(await vis('#tabletSketchPop .tablet-float-type-btn'), 4, '마킹 단추를 누르면 4개');
await tap('#tabletSketchPop .tablet-float-type-btn:nth-child(2)');
await tap('#btnFloatSketchMode');
f = await fit(); ok(fits(f), '그리기 : 옆으로 밀리지 않는다', f);
eq(await vis('.float-sketch-tool'), 0, '  도구 7개는 접혀 있다');
eq([await vis('#btnFloatToolPick'), await vis('#btnFloatColorPick'), await vis('#btnFloatWidthPick'), await vis('#btnFloatTypePick')], [1, 1, 1, 1], '  도구·색·굵기·마킹 단추');
await shot('1119b-phone-sketch.png');
await tap('#btnFloatToolPick');
eq(await vis('#tabletPopProxy .float-proxy'), 7, '  도구 창에 7개');
await tap('#tabletPopProxy .float-proxy:nth-child(7)');
eq(await ev(`document.querySelector('.float-sketch-tool[data-sketch-tool=sketchErase]').classList.contains('active')`), true, '  선 지우개를 고른다');
await tap('#btnFloatMore');
ok((await ev(`[...document.querySelectorAll('#tabletPopProxy .float-proxy')].map(b=>b.textContent.trim())`)).includes('도구 설정'), '  선 지우개면 ⋯ 에 도구 설정');
await ev(`[...document.querySelectorAll('#tabletPopProxy .float-proxy')].find(b=>b.textContent.includes('도구 설정')).click(); true`); await sleep(200);
eq(await vis('#sketchEraseSizeGroup'), 1, '  지우개 굵기가 뜬다');

console.log('\n[엑셀 도면명 — 모든 시트]');
await boot(1280, 800);
await addMarkers(1);
const sheets = await ev(`(()=>{const d=${D},m=d.markers[0];return __markerDbg.info.allPresets().map(p=>{const k=(p.series.find(s=>s.key==='tilt_pos')||p.series[0]).key;const sh=__markerDbg.info.buildSheetForPreset(p,[{m:Object.assign({},m,{typeKey:k}),idx:0,d}]);return {n:sh.name,h:sh.header,c:sh.rows[0].cells,num:[...sh.numericColIdx].map(i=>sh.header[i]),same:sh.rows[0].cells.length===sh.header.length,dn:d.name}})})()`);
ok(sheets.length >= 4, '시트 4종 이상', sheets.map(s => s.n));
for (const s of sheets) { eq([s.h[0], s.c[0], s.same], ['도면명', s.dn, true], `  ${s.n} : 맨 앞이 도면명, 칸 수 일치`); ok(!s.num.includes('도면명'), `  ${s.n} : 도면명은 숫자 칸이 아니다`, s.num); }
const oe = sheets.find(s => s.n === '외관조사'); eq(oe.num, ['NO', '폭', '길이', '개수'], '외관조사 숫자 칸이 제자리');
const tilt = sheets.find(s => s.n === '기울기'); eq(tilt.num[0], '도', '기울기 숫자 칸이 제자리');
const lv = sheets.find(s => s.n === '부동침하'); eq(lv.num, ['NO', '측정값(cm)', '경간(mm)'], '부동침하 숫자 칸이 제자리');

console.log('\n[CSV 불러오기 — 새 형식·옛 형식]');
const csvBack = async (t) => { await ev(`(()=>{${D}.markers=[];__markerDbg.importCSVText(${JSON.stringify(t)});return true})()`); await sleep(400); return ev(`${D}.markers.map(m=>[m.xPct,m.rptFloor||'',m.rptLoc||'',m.rptType||''])`); };
const nl = String.fromCharCode(10), name = await ev(`${D}.name`);
eq(await csvBack(`도면명,번호,층수,위치,위치유형,X(%),Y(%),부재${nl}${name},1,지상2층,복도,수직부재,10,20,벽체`), [[10, '지상2층', '복도', '벽체']], '새 형식');
eq(await csvBack(`도면명,번호,위치유형,X(%),Y(%),부재,층수,위치${nl}${name},1,수직부재,30,20,기둥,지상3층,계단`), [[30, '지상3층', '계단', '기둥']], '옛 형식(맨 끝)');

console.log('\n[미변환 손글씨 · ⚙ (태블릿)]');
await boot(1280, 800);
await addMarkers(3);
await ev(`(()=>{${D}.markers.forEach(m=>Object.assign(m,{rptType:'벽체',rptMember:'콘크리트',rptDefect:'균열'}));__markerDbg.renderTable();return true})()`);
eq(await vis('#btnFloatInkPending'), 0, '변환할 것이 없으면 표시 없음');
await ev(`(()=>{const m=${D}.markers[0];m.ink={rptLoc:{w:100,h:50,s:[[1,1,20,20,40,10]],st:'pending'}};__markerDbg.renderTable();return true})()`); await sleep(150);
eq([await vis('#btnFloatInkPending'), await ev(`document.getElementById('btnFloatInkPending').textContent`)], [1, '글자 변환 1'], '하단 바에 「글자 변환 1」');
ok(fits(await fit()), '  바가 밀리지 않는다');
await shot('1119b-pending.png');
await tap('#btnFloatInkPending');
eq(await vis('#inkConvertBackdrop'), 1, '  누르면 변환 창');
await ev(`__markerDbg.ink.closeInkConvert(); true`);
const before = files().length;
await click('btnOpenExport'); await click('btnExportXLSX', 300);
eq(await vis('#inkExportBackdrop'), 1, '엑셀 저장 전에 묻는다');
ok((await ev(`document.getElementById('inkExportText').textContent`)).includes('1칸'), '  남은 칸 수를 알려 준다');
eq(files().length, before, '  아직 저장하지 않는다');
await shot('1119b-ink-export.png');
await click('btnInkExportCancel');
eq(await vis('#inkExportBackdrop'), 0, '  취소');
await click('btnExportXLSX', 200); await click('btnInkExportReview', 200);
eq(await vis('#inkConvertBackdrop'), 1, '  「확인하기」는 변환 창으로');
await ev(`__markerDbg.ink.closeInkConvert(); true`);
await ev(`window.__of=window.fetch;window.fetch=(u,o)=>String(u).includes('inputtools')?Promise.resolve(new Response(JSON.stringify(['SUCCESS',[['x',['거실']]]]),{status:200})):window.__of(u,o);true`);
files().filter(x => /\.csv$/.test(x)).forEach(x => rmSync(path.join(DL, x)));   // 같은 이름이면 덮어써서 개수로 알 수 없다
await click('btnExportCSV', 200); const n0 = 0;
await click('btnInkExportConvert', 100);
ok(await until(`${D}.markers[0].rptLoc==='거실'`), '  「지금 변환 후 저장」 : 글자로 바뀐다');
ok(await (async () => { const t = Date.now(); while (Date.now() - t < 8000) { if (files().filter(x => /\.csv$/.test(x)).length > n0) return true; await sleep(150); } return false; })(), '  이어서 저장까지 된다');
eq(await vis('#inkExportBackdrop'), 0, '  다시 묻지 않는다');
await click('btnExportModalClose');
await click('btnFloatSketchMode');
eq(await vis('#btnFloatSketchSettings'), 0, '직선 : ⚙ 가 없다');
await ev(`__markerDbg.setSketchTool('sketchErase'); true`); await sleep(150);
eq(await vis('#btnFloatSketchSettings'), 1, '선 지우개 : ⚙ 가 나온다');
ok(fits(await fit()), '  바가 밀리지 않는다');
await ev(`__markerDbg.setSketchTool(null); true`);

console.log('\n[다음 결함에 복사]');
await ev(`(()=>{const [a,b,c]=${D}.markers;Object.assign(a,{rptFloor:'지상1층',rptLoc:'거실',rptType:'벽체',rptMember:'콘크리트',rptDefect:'균열',rptWidth:'0.3',rptLength:'100',rptCount:'1',rptTag:'7'});delete a.ink;a.ink={rptLoc:{w:100,h:50,s:[[1,1,9,9]],st:'done',text:'거실',eng:'google'}};b.rptTag='8';__markerDbg.ink.openQuickInputSheetFor(a);return true})()`); await sleep(250);
eq(await vis('#btnQuickInputCopyNext'), 1, '시트에 「다음에 복사」');
await shot('1119b-copy-next.png');
await click('btnQuickInputCopyNext', 300);
const b1 = await ev(`(()=>{const b=${D}.markers[1];return {v:[b.rptFloor,b.rptLoc,b.rptType,b.rptMember,b.rptDefect,b.rptWidth,b.rptLength,b.rptCount],tag:b.rptTag,ink:!!(b.ink&&b.ink.rptLoc&&b.ink.rptLoc.carried),cur:__markerDbg.ink.quickInputMarkerId===b.id}})()`);
eq(b1.v, ['지상1층', '거실', '벽체', '콘크리트', '균열', '0.3', '100', '1'], '내용이 다음 결함으로');
eq(b1.tag, '8', '  사진번호는 그대로');
ok(b1.ink, '  손글씨 원본도 함께');
ok(b1.cur, '  시트가 다음 결함으로 넘어간다');
await click('btnFloatUndo', 250);
eq(await ev(`${D}.markers[1].rptLoc||''`), '', '실행취소로 되돌아간다');
await ev(`(()=>{const [a,b]=${D}.markers;b.rptLoc='복도';__markerDbg.ink.openQuickInputSheetFor(a);return true})()`); await sleep(200);
cdp.setDialogAnswer(false);
await click('btnQuickInputCopyNext', 300);
eq(await ev(`${D}.markers[1].rptLoc`), '복도', '덮어쓰기를 거절하면 그대로');
eq(await ev(`__markerDbg.ink.quickInputMarkerId===${D}.markers[0].id`), true, '  시트도 그 자리');
cdp.setDialogAnswer(true);
await click('btnQuickInputCopyNext', 300);
eq(await ev(`${D}.markers[1].rptLoc`), '거실', '승낙하면 덮어쓴다');
await ev(`__markerDbg.ink.openQuickInputSheetFor(${D}.markers[2]); true`); await sleep(200);
eq(await vis('#btnQuickInputCopyNext'), 0, '마지막 결함에는 단추가 없다');

console.log('\n[컴퓨터 : 곧바로 내려받기]');
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp.send('Page.navigate', { url: APP }); await sleep(700);
await ev(`localStorage.clear(); localStorage.setItem('defectMarkerTabletMode_v1','off'); localStorage.setItem('defectMarkerInk_v1', JSON.stringify({on:true,engine:'google',auto:false})); true`);
await cdp.send('Page.navigate', { url: APP }); await sleep(1300);
const r0 = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#addDrawingInput')` });
await cdp.send('DOM.setFileInputFiles', { files: [ROOT + 'test-fixtures/plan.png'], objectId: r0.result.objectId }); await sleep(900);
await addMarkers(1);
rmSync(DL, { recursive: true, force: true }); mkdirSync(DL, { recursive: true });
await ev(`(()=>{const m=${D}.markers[0];Object.assign(m,{rptType:'벽체',rptMember:'콘크리트',rptDefect:'균열'});return true})()`);
await click('btnOpenExport'); await click('btnExportXLSX', 300);
eq(await vis('#fileReadyBackdrop'), 0, '저장 창 없이');
ok(!!(await waitFile(/\.xlsx$/)), '  바로 저장된다');
eq(await vis('#tabletFloatBar'), 0, '  태블릿 하단 바는 없다');

console.log(`\n${passes} 통과 / ${fails} 실패`);
await cdp.send('Emulation.setUserAgentOverride', { userAgent: '' }).catch(() => {});
finish(cdp, fails ? 1 : 0);
