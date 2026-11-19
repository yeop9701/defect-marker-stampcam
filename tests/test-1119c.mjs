/* 2026-11-19 3차 요청 검사 — 실제 브라우저.
   ① 저장 전 점검 ② 백업 권유 ③ 펜 사용 뒤 손가락 스크롤 ④ 결함 목록 거르기 ⑤ 엑셀 집계 ⑦ 구글 변환 실패 안내

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더> about:blank
     node tests/test-1119c.mjs                                                       */
import { connect, finish } from './cdp.mjs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = fileURLToPath(new URL('./out/', import.meta.url));
const DL = path.join(OUT, 'dl1119c');
mkdirSync(OUT, { recursive: true });
const APP = process.env.APP_URL || ((process.env.BASE_URL || 'http://localhost:8125') + '/defect-marker-stampcam/index.html');
const cdp = await connect(Number(process.env.CDP_PORT || 9223));
const ev = (s) => cdp.evaluate(s);
let fails = 0, passes = 0;
const ok = (c, m, x) => { if (c) passes++; else fails++; console.log((c ? '  OK   ' : '  FAIL ') + m + (!c && x !== undefined ? '  → ' + JSON.stringify(x) : '')); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m, { 실제: a, 바람: b });
const shot = async (n) => { const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(OUT + n, Buffer.from(data, 'base64')); };
const vis = (s) => ev(`[...document.querySelectorAll('${s}')].filter(e=>{const c=getComputedStyle(e);return c.display!=='none'&&c.visibility!=='hidden'&&e.getClientRects().length>0}).length`);
const click = async (id, ms = 200) => { await ev(`document.getElementById('${id}').click(); true`); await sleep(ms); };
const D = '__markerDbg.getActiveDrawing()', I = '__markerDbg.info';
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const files = () => { try { return readdirSync(DL); } catch (e) { return []; } };
const clearDL = () => { rmSync(DL, { recursive: true, force: true }); mkdirSync(DL, { recursive: true }); };
async function boot(w = 1280, h = 800) {
  await cdp.send('DOM.enable');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: APP }); await sleep(800);
  await ev(`localStorage.clear(); localStorage.setItem('defectMarkerTabletMode_v1','on'); localStorage.setItem('defectMarkerInk_v1', JSON.stringify({on:true,engine:'google',auto:false})); true`);
  await cdp.send('Page.navigate', { url: APP }); await sleep(1400);
  const r = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#addDrawingInput')` });
  await cdp.send('DOM.setFileInputFiles', { files: [ROOT + 'test-fixtures/plan.png'], objectId: r.result.objectId }); await sleep(1100);
  /* 이 검사는 층수·위치를 손글씨 칸으로 쓰던 예전 배치를 본다 — 층수·위치 목록(11-19)은 끄고 본다. 목록이 있을 때는 tests/test-1119e.mjs */
  await ev(`window.LocationTaxonomy = null; true`);
}
const setMarkers = (list) => ev(`(()=>{const d=${D},k=${I}.allPresets()[0].series[0].key;d.markers=${JSON.stringify(list)}.map((x,i)=>Object.assign({id:'t'+i,uid:'u'+i,typeKey:k,xPct:15+i*12,yPct:30,angle:0,seq:i+1},x));__markerDbg.renderTable();__markerDbg.renderCanvas();return d.markers.length})()`);
const full = { rptType: '벽체', rptMember: '콘크리트', rptDefect: '균열' };
const pendingInk = { rptLoc: { w: 100, h: 50, s: [[1, 1, 9, 9]], st: 'pending' } };

clearDL();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });

console.log('\n[① 저장 전 점검]');
await boot();
await setMarkers([{ ...full, rptTag: '12', photos: ['x'] }, { rptType: '기둥', rptDefect: '백태', rptTag: '0012', photos: ['x'] }, { ...full, rptTag: '13' }, { ...full, photos: ['x'], rptTag: '14' }]);
eq(await ev(`${I}.buildExportChecks().map(g=>[g.title,g.items.length])`), [['부재·자재·결함이 빈 결함', 1], ['사진번호가 겹치는 결함', 2], ['사진번호는 있는데 사진이 없는 결함', 1]], '세 가지를 찾는다(12 와 0012 는 같은 번호)');
await click('btnOpenExport'); await click('btnExportXLSX', 300);
eq(await vis('#inkExportBackdrop'), 1, '저장 전에 창이 뜬다');
eq(files().length, 0, '  아직 저장하지 않는다');
eq(await vis('#btnInkExportConvert'), 0, '  손글씨가 없으면 변환 단추는 없다');
ok((await ev(`document.getElementById('exportCheckList').textContent`)).includes('자재 없음'), '  무엇이 비었는지 적혀 있다');
await shot('1119c-check.png');
await ev(`document.querySelector('.export-check-group .export-check-item').click(); true`); await sleep(400);
eq([await vis('#inkExportBackdrop'), await vis('#exportBackdrop'), await ev(`__markerDbg.ink.quickInputMarkerId`)], [0, 0, 't1'], '  항목을 누르면 그 결함의 입력으로 이동');
await click('btnQuickInputClose');
await click('btnOpenExport'); await click('btnExportCSV', 200); await click('btnInkExportAnyway', 500);
ok(files().some(f => f.endsWith('.csv')), '「그대로 저장」은 저장한다');
await setMarkers([{ ...full, rptTag: '1', photos: ['x'] }]);
clearDL();
await click('btnExportCSV', 500);
eq(await vis('#inkExportBackdrop'), 0, '문제가 없으면 묻지 않는다');
ok(files().some(f => f.endsWith('.csv')), '  바로 저장');
await click('btnExportModalClose');

console.log('\n[④ 결함 목록 거르기]');
await setMarkers([{ ...full, rptTag: '1', photos: ['x'] }, { rptType: '기둥' }, { ...full, ink: pendingInk }, { ...full }]);
await click('btnDrawerRight', 300);
eq(await ev(`[...document.querySelectorAll('#markerFilterRow button')].map(b=>b.textContent)`), ['전체 4', '미입력 1', '사진 없음 3', '손글씨 미변환 1'], '칸마다 개수');
const shown = () => ev(`[...document.querySelectorAll('#markerTable .marker-card')].filter(c=>c.style.display!=='none').map(c=>c.dataset.id)`);
const pick = async (f) => { await ev(`document.querySelector('#markerFilterRow [data-filter=${f}]').click(); true`); await sleep(120); };
const search = async (v) => { await ev(`(()=>{const e=document.getElementById('markerSearchInput');e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input'));return true})()`); await sleep(100); };
await pick('missing'); eq(await shown(), ['t1'], '미입력');
await shot('1119c-filter.png');
await pick('nophoto'); eq(await shown(), ['t1', 't2', 't3'], '사진 없음');
await pick('ink'); eq(await shown(), ['t2'], '손글씨 미변환');
await search('없는말'); eq(await shown(), [], '검색과 함께 걸린다');
await search('');
await pick('nophoto');
await click('btnDrawerRight', 200);
const cur = () => ev(`__markerDbg.ink.quickInputMarkerId`);
await ev(`__markerDbg.ink.openQuickInputSheetFor(${D}.markers[0]); true`); await sleep(200);
await click('btnQuickInputNext'); eq(await cur(), 't1', '퀵입력 다음 : 고른 것만');
await click('btnQuickInputNext'); await click('btnQuickInputNext'); eq(await cur(), 't3', '  끝까지');
await pick('missing'); await click('btnQuickInputPrev'); eq(await cur(), 't1', '  앞으로도, 지금 결함이 목록 밖이어도');
await pick('all'); await click('btnQuickInputClose');

console.log('\n[⑤ 엑셀 집계]');
await setMarkers([{ rptFloor: '지상1층', rptType: '벽체', rptMember: '콘크리트', rptDefect: '균열/백태', rptWidth: '0.3', rptLength: '100', rptCount: '2' }, { rptFloor: '지하1층', rptType: '벽체', rptMember: '콘크리트', rptDefect: '균열', rptWidth: '0.5', rptLength: '50.5', rptCount: '1' }, { rptType: '기둥', rptDefect: '' }]);
const sum = await ev(`(()=>{const s=${I}.buildSummarySheet();return {h:s.header,r:s.rows.map(r=>r.cells)}})()`);
const row = (g, k) => (sum.r.find(r => r[0] === g && r[1] === k) || []).slice(2);
eq(sum.h, ['구분', '항목', '건수', '개수 합', '길이 합(mm)', '최대 폭(mm)'], '제목');
eq(row('전체', '전체'), [3, 3, 150.5, 0.5], '전체');
eq(row('부재별', '벽체'), [2, 3, 150.5, 0.5], '부재별');
eq(row('결함별', '균열'), [2, 3, 150.5, 0.5], '결함별 : 균열');
eq(row('결함별', '백태'), [1, 2, 100, 0.3], '  「균열/백태」는 백태에도');
eq(row('부재·결함별', '벽체 · 균열'), [2, 3, 150.5, 0.5], '부재·결함별');
eq(row('층별', '(미입력)'), [1, 0, 0, ''], '빈 칸은 (미입력)');
eq(sum.r.filter(r => r[0] === '층별').map(r => r[1]), ['지하1층', '지상1층', '(미입력)'], '층은 아래부터 차례로');
eq(await ev(`${I}.buildWorkbookSheets().map(s=>s.name)`), ['외관조사', '집계'], '시트 순서');
ok(await ev(`(async()=>{const b=${I}.buildXLSXBlob(${I}.buildWorkbookSheets());const t=new TextDecoder().decode(await b.arrayBuffer());return t.includes('<t>부재·결함별</t>')&&t.includes('name="집계"')})()`), 'xlsx 파일에 들어간다');

console.log('\n[② 백업 권유]');
await boot();
const nudge = () => ev(`(()=>{const e=document.getElementById('appNudge');return e.hidden?'':e.dataset.kind})()`);
const check = (ms = 0) => ev(`${I}.checkBackupNudge(Date.now()+${ms}); true`);
const nudgeBtn = async (t) => { await ev(`[...document.querySelectorAll('#appNudge button')].find(b=>b.textContent===${JSON.stringify(t)}).click(); true`); await sleep(100); };
const edit = async () => { await ev(`(()=>{const e=document.querySelector('.marker-card [data-role=rptLoc]');e.value='거실'+Math.random();e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`); await sleep(100); };
await setMarkers(Array.from({ length: 5 }, () => ({ ...full })));
await click('btnSaveProject', 300);
eq(await ev(`Object.values(JSON.parse(localStorage.getItem('defectMarkerBackup_v1'))).map(r=>r.count)`), [5], '프로젝트 저장이 백업으로 기록된다');
await check(2 * 3600000); eq(await nudge(), '', '백업 뒤 변경이 없으면 묻지 않는다');
await edit(); await check(); eq(await nudge(), '', '조금 고친 직후에는 묻지 않는다');
await check(61 * 60000); eq(await nudge(), 'backup', '한 시간이 지나면 권한다');
await shot('1119c-backup.png');
await nudgeBtn('나중에');
await check(60000); eq(await nudge(), '', '「나중에」는 잠시 묻지 않는다');
await check(92 * 60000); eq(await nudge(), 'backup', '  30분 뒤 다시');
clearDL();
await nudgeBtn('지금 백업'); await sleep(400);
ok(files().some(f => f.endsWith('_project.json')), '「지금 백업」은 프로젝트 파일을 저장한다');
eq(await nudge(), '', '  안내가 닫힌다');
await ev(`(()=>{const d=${D};for(let i=0;i<20;i++)d.markers.push({id:'n'+i,uid:'nu'+i,typeKey:d.markers[0].typeKey,xPct:50,yPct:50,seq:6+i});__markerDbg.renderTable();return true})()`);
await edit(); await check(); eq(await nudge(), 'backup', '결함이 20건 늘면 바로 권한다');
await nudgeBtn('나중에');

console.log('\n[⑦ 구글 변환 실패]');
await setMarkers([{ ...full, ink: pendingInk }]);
await ev(`window.__of=window.__of||window.fetch;window.fetch=(u,o)=>String(u).includes('inputtools')?Promise.reject(new TypeError('Failed to fetch')):window.__of(u,o);true`);
await ev(`${I}.runInkConvert({auto:true})`); await sleep(100);
eq([await nudge(), await ev(`${I}.inkGoogleFailStreak`)], ['', 1], '한 번 실패는 조용히');
await ev(`${I}.runInkConvert({auto:true})`); await sleep(100);
eq(await nudge(), 'ink', '이어지면 알린다');
eq(await ev(`${D}.markers[0].ink.rptLoc.st`), 'pending', '  글씨는 대기로 남는다');
eq(await ev(`JSON.parse(localStorage.getItem('defectMarkerInk_v1')).engine`), 'google', '  Claude 로 저절로 바뀌지 않는다');
await shot('1119c-ink-nudge.png');
await nudgeBtn('변환 창 열기'); await sleep(150);
eq([await vis('#inkConvertBackdrop'), await vis('#inkCvFallback')], [1, 1], '변환 창에 안내');
await click('btnInkUseClaude');
eq([await ev(`JSON.parse(localStorage.getItem('defectMarkerInk_v1')).engine`), await ev(`document.querySelector('input[name=inkEngine]:checked').value`), await vis('#inkCvKeyRow'), await vis('#inkCvFallback')], ['claude', 'claude', 1, 0], '「Claude로 바꾸기」 : 키 칸이 열린다');
await ev(`document.querySelector('input[name=inkEngine][value=google]').click(); __markerDbg.ink.closeInkConvert(); window.fetch=(u,o)=>String(u).includes('inputtools')?Promise.resolve(new Response(JSON.stringify(['SUCCESS',[['x',['거실']]]]),{status:200})):window.__of(u,o);true`);
await ev(`${I}.runInkConvert({auto:true})`); await sleep(100);
eq([await ev(`${I}.inkGoogleFailStreak`), await ev(`${D}.markers[0].rptLoc`)], [0, '거실'], '다시 되면 원래대로');

console.log('\n[③ 펜 사용 뒤 손가락 스크롤]');
await boot(390, 844);
await setMarkers([{}]);
await ev(`__markerDbg.ink.openQuickInputSheetFor(${D}.markers[0]); true`); await sleep(300);
const pad = () => ev(`(()=>{const r=document.querySelector('.ink-box[data-k=rptFloor] canvas').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
const swipe = async (p, dy) => { await touch('touchStart', [p]); for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: p.x, y: p.y + Math.round(dy * i / 6) }]); await sleep(15); } await touch('touchEnd', []); await sleep(120); };
const top = () => ev(`document.getElementById('quickInputFields').scrollTop`);
await swipe(await pad(), -90); await sleep(900);
eq(await top(), 0, '펜을 쓰기 전 손가락은 글씨(스크롤 안 됨)');
ok(await ev(`!!(${D}.markers[0].ink&&${D}.markers[0].ink.rptFloor)`), '  글씨가 써진다');
await ev(`document.querySelector('.ink-box[data-k=rptFloor] .ink-clear').click(); true`); await sleep(100);
const pen = (t, x, y) => `c.dispatchEvent(new PointerEvent('${t}',{bubbles:true,cancelable:true,pointerId:77,pointerType:'pen',clientX:${x},clientY:${y},button:0}))`;
await ev(`(()=>{const c=document.querySelector('.ink-box[data-k=rptLoc] canvas'),r=c.getBoundingClientRect(),x=r.left+20,y=r.top+20;${pen('pointerdown', 'x', 'y')};${pen('pointermove', 'x+20', 'y+10')};${pen('pointerup', 'x+20', 'y+10')};return true})()`); await sleep(1300);
ok(await ev(`!!(${D}.markers[0].ink&&${D}.markers[0].ink.rptLoc)`), '펜 글씨가 써진다');
await swipe(await pad(), -90);
ok((await top()) >= 70, '펜을 쓴 뒤 손가락은 스크롤', await top());
eq(await ev(`!!(${D}.markers[0].ink&&${D}.markers[0].ink.rptFloor)`), false, '  손가락으로 글씨가 써지지 않는다');
await ev(`document.getElementById('quickInputFields').scrollTop=0; true`); await sleep(50);
const p2 = await pad();
await ev(`document.body.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:77,pointerType:'pen',clientX:10,clientY:10})); true`);
await swipe(p2, -90);
eq(await top(), 0, '펜이 막 지나간 때 닿는 손(손바닥)은 무시');

console.log(`\n${passes} 통과 / ${fails} 실패`);
finish(cdp, fails ? 1 : 0);
