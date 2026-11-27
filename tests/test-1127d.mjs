/* 2026-11-27 4차 — 사진 ZIP 결함/현황 폴더 나눔·현황 파일 이름, 현황 「내용」 자주 쓰는 말(퀵입력 단추·카드 ▼),
   현황 연속 촬영(카메라 「다음 ▶」), 사진 없음 건수(결함/현황 머리줄·다른 도면), 백업 권유(40분·사진 15장).

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더>
            --use-fake-device-for-media-stream --use-fake-ui-for-media-stream about:blank
     node tests/test-1127d.mjs                                                       */
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

async function boot(w = 1280, h = 800) {
  await cdp.send('DOM.enable');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: APP }); await sleep(800);
  await ev(`localStorage.clear(); localStorage.setItem('defectMarkerTabletMode_v1','on'); true`);
  await cdp.send('Page.navigate', { url: APP }); await sleep(1400);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });   // 다른 출처로 넘어가면 꺼지므로 다시
  await ev(`__markerDbg.addBlankDrawing(); true`); await sleep(800);
  await ev(`__markerDbg.setSketchTool(null); document.querySelectorAll('.app-toast,.recovery-banner').forEach(e=>e.remove()); true`); await sleep(150);
}
// 작은 사진 한 장(data URL)
const PIC = `(()=>{const c=document.createElement('canvas');c.width=8;c.height=6;c.getContext('2d').fillRect(0,0,8,6);return c.toDataURL('image/jpeg',0.8)})()`;
const setup = (photos) => `(()=>{const d=${D};const P=${PIC};const mk=(id,k,x,y,o)=>Object.assign({id,uid:id+'0000000',typeKey:k,xPct:x,yPct:y,angle:180,lenMult:1},o||{});
  d.markers=[mk('a','wall',20,30,{rptFloor:'지상1층',rptLoc:'거실',rptType:'벽체',rptMember:'콘크리트',rptDefect:'균열'${photos ? ',photos:[P]' : ''}}),
    mk('s1','stat_v',50,30,{rptLoc:'주방',note:'전경'${photos ? ',photos:[P,P]' : ''}}),mk('b','flat',20,60),mk('s2','stat_h',50,60,{rptLoc:'욕실',note:'천장'}),mk('s3','stat_v',70,60)];
  __markerDbg.renderCanvas();__markerDbg.renderTable();return true})()`;
// ZIP 에 든 파일 이름 (로컬 헤더를 차례로 읽는다)
const zipNames = `(async()=>{const r=window.__zipBlob;if(!r)return null;const b=new Uint8Array(await r.arrayBuffer());const dv=new DataView(b.buffer);const out=[];let p=0;
  while(p+30<=b.length&&dv.getUint32(p,true)===0x04034b50){const cs=dv.getUint32(p+18,true),nl=dv.getUint16(p+26,true),xl=dv.getUint16(p+28,true);
    out.push(new TextDecoder().decode(b.subarray(p+30,p+30+nl)));p+=30+nl+xl+cs;}return out})()`;
const catchZip = `(()=>{window.__zipBlob=null;if(!window.__origCOU){window.__origCOU=URL.createObjectURL;URL.createObjectURL=function(b){if(b&&b.type==='application/zip')window.__zipBlob=b;return window.__origCOU.call(URL,b)};}return true})()`;

console.log('\n[1. 사진 ZIP — 결함/현황 폴더, 현황 파일 이름]');
await boot();
await ev(setup(true)); await sleep(200);
await ev(catchZip);
await ev(`${X}.exportAllPhotosZip(); true`); await sleep(600);
const names = await ev(zipNames);
ok(names && names.length === 3, 'ZIP 에 사진 3장', names);
ok(names && names.some(n => /^결함\/1_a0000000_지상1층_거실_벽체_콘크리트_균열\.jpg$/.test(n)), '  결함 사진은 「결함/」 폴더, 이름은 예전 그대로', names);
ok(names && names.includes('현황/현황(1)-1_주방_전경_1.jpg') && names.includes('현황/현황(1)-1_주방_전경_2.jpg'), '  현황 사진은 「현황/」 폴더, 이름은 현황(1)-1_위치_내용', names);
// 현황 사진이 없으면 예전처럼 폴더 없이
await ev(`(()=>{${D}.markers.forEach(m=>{if(m.typeKey.startsWith('stat'))m.photos=[];});return true})()`);
await ev(`${X}.exportAllPhotosZip(); true`); await sleep(600);
const names2 = await ev(zipNames);
ok(names2 && names2.length === 1 && !names2[0].includes('/'), '  현황 사진이 없으면 예전처럼 폴더 없이', names2);
// 도면이 둘이면 현황/도면명/
await ev(setup(true)); await sleep(100);
await ev(`(()=>{const d=${D};d.name='1층';return true})()`);
await ev(`__markerDbg.addBlankDrawing(); true`); await sleep(600);
await ev(`(()=>{const d=${D};d.name='2층';d.markers=[{id:'z',uid:'z0000000',typeKey:'stat_h',xPct:40,yPct:40,angle:180,lenMult:1,rptLoc:'복도',photos:[${PIC}]}];__markerDbg.renderTable();return true})()`);
await ev(`${X}.exportAllPhotosZip(); true`); await sleep(600);
const names3 = await ev(zipNames);
ok(names3 && names3.includes('현황/2층/현황(2)-1_복도.jpg') && names3.some(n => n.startsWith('현황/1층/')) && names3.some(n => n.startsWith('결함/1층/')), '  도면이 여럿이면 현황/도면명/…', names3);

console.log('\n[4. 사진 없음 — 머리줄·다른 도면]');
// 지금 2층(사진 있음) — 다른 도면(1층)에 사진 없는 것 : 결함 b, 현황 s2·s3 = 3
const fr = await ev(`document.querySelector('#markerFilterRow [data-filter="nophoto"]').textContent`);
ok(/사진 없음 0/.test(fr) && /다른 도면 3/.test(fr), '「사진 없음」 단추에 다른 도면 건수', fr);
await ev(`${X}.setActiveDrawing(__markerDbg.info.drawings[0].id); true`); await sleep(300);
const active = await ev(`${D}.name`);
if (active !== '1층') await ev(`(()=>{const el=[...document.querySelectorAll('.drawing-item, [data-drawing-id]')].find(e=>/1층/.test(e.textContent));el&&el.click();return true})()`);
await sleep(300);
const heads = await ev(`[...document.querySelectorAll('#markerTable .mc-section-head')].map(h=>h.textContent.replace(/[▾▸]/g,'').trim())`);
eq(heads, ['결함2건📷 없음 1', '현황3건📷 없음 2'], '결함/현황 머리줄에 「📷 없음 N」');
await ev(`document.querySelector('.mc-section-stat [data-nophoto]').click(); true`); await sleep(250);
const vis = await ev(`[...document.querySelectorAll('#markerTable .marker-card')].filter(c=>c.style.display!=='none').map(c=>c.dataset.id).join(',')`);
eq(vis, 'b,s2,s3', '  누르면 사진 없는 것만 보인다(접히지 않음)');
eq(await ev(`[...document.querySelectorAll('#markerTable .mc-section-stat')].length && document.querySelectorAll('.marker-card.mc-group-hidden').length`), 0, '  머리줄이 접히지 않는다');
await shot('1127d-nophoto.png');
await ev(`document.querySelector('.mc-section-stat [data-nophoto]').click(); true`); await sleep(200);
eq(await ev(`[...document.querySelectorAll('#markerTable .marker-card')].filter(c=>c.style.display!=='none').length`), 5, '  한 번 더 누르면 전체');

console.log('\n[2. 현황 「내용」 자주 쓰는 말]');
await boot();
await ev(setup(false)); await sleep(200);
const opts = await ev(`${X}.statusNoteOptions()`);
ok(opts[0] === '천장' && opts[1] === '전경' && opts.includes('근경') && opts.filter(x => x === '전경').length === 1, '이번 현장에서 쓴 말이 먼저(나중 것부터), 그다음 기본 말(겹치지 않게)', opts);
await ev(`__markerDbg.ink.openQuickInputSheetFor(${D}.markers.find(m=>m.id==='s3')); true`); await sleep(350);
const q = await ev(`(()=>{const b=document.getElementById('quickInputFields');return {rows:[...b.querySelectorAll('.qis-tax-label')].map(e=>e.textContent),
  chips:[...b.querySelectorAll('[data-tax-pick="note"]')].map(e=>e.dataset.v).slice(0,4),inputs:[...b.querySelectorAll('input[data-qis]')].map(e=>e.dataset.qis)}})()`);
eq(q.rows, ['위치', '내용'], '퀵입력 : 위치·내용 두 줄');
// 위치가 비어 있으면 위치 줄이 먼저 펼쳐진다 → 내용 줄을 펼친다
if (!q.chips.length) { await ev(`document.querySelector('#quickInputFields [data-tax-open="note"]').click(); true`); await sleep(250); }
const chips = await ev(`[...document.querySelectorAll('#quickInputFields [data-tax-pick="note"]')].map(e=>e.dataset.v)`);
ok(chips[0] === '천장' && chips.includes('원경'), '  내용 줄에 자주 쓰는 말 단추', chips);
ok(!q.inputs.includes('note'), '  내용 글칸은 ✎ 를 눌렀을 때만', q.inputs);
await shot('1127d-quick-note.png');
await ev(`[...document.querySelectorAll('#quickInputFields [data-tax-pick="note"]')].find(e=>e.dataset.v==='원경').click(); true`); await sleep(250);
eq(await ev(`${D}.markers.find(m=>m.id==='s3').note`), '원경', '  단추를 누르면 내용에 들어간다');
ok(/원경/.test(await ev(`document.querySelector('#quickInputFields .qis-tax-result')?.textContent||''`)), '  아래 요약줄에도 보인다');
// ✎ 로 직접 쓰기
await ev(`document.querySelector('#quickInputFields [data-tax-write="note"]').click(); true`); await sleep(200);
// 태블릿은 손글씨 입력이 기본 — ✎ 를 누르면 내용 줄 안에 필기 상자가 열린다(위치 줄과 같다)
ok(await ev(`!!document.querySelector('#quickInputFields [data-ink-slot="note"] .ink-box[data-k="note"]')`), '  ✎ 를 누르면 내용 줄 안에 손글씨 상자(목록에 없는 말)');
await ev(`(()=>{${D}.markers.find(m=>m.id==='s3').note='A동 원경';return true})()`);
eq((await ev(`${X}.statusNoteOptions()`))[0], 'A동 원경', '  방금 쓴 말이 목록 맨 앞');
// 결함 퀵입력은 그대로(내용 줄 없음)
await ev(`__markerDbg.ink.openQuickInputSheetFor(${D}.markers.find(m=>m.id==='a')); true`); await sleep(300);
ok(!(await ev(`[...document.querySelectorAll('#quickInputFields .qis-tax-label')].map(e=>e.textContent)`)).includes('내용'), '  결함 마킹 퀵입력에는 내용 줄이 없다');
await ev(`document.getElementById('btnQuickInputClose').click(); true`); await sleep(200);
// 결함 목록 카드 ▼
const drop = await ev(`!!document.querySelector('.marker-card[data-id="s2"] [data-drop="note"]')`);
ok(drop, '결함 목록 현황 카드의 내용 칸에 ▼');
await ev(`document.querySelector('.marker-card[data-id="s2"] [data-drop="note"]').click(); true`); await sleep(200);
const menu = await ev(`[...document.querySelectorAll('.cell-menu button[data-v]')].map(b=>b.dataset.v).slice(0,4)`);
ok(menu.includes('A동 원경') && menu.includes(''), '  ▼ 목록에 쓴 말·자주 쓰는 말', menu);
await ev(`[...document.querySelectorAll('.cell-menu button[data-v]')].find(b=>b.dataset.v==='배면').click(); true`); await sleep(200);
eq(await ev(`${D}.markers.find(m=>m.id==='s2').note`), '배면', '  ▼ 에서 고르면 내용에 들어간다');
eq(await ev(`document.querySelectorAll('.marker-card[data-id="a"] [data-drop="note"]').length`), 0, '  결함 카드에는 내용 ▼ 없음');
// 카드 폭 — 태블릿 결함 목록 한 줄
await ev(`document.getElementById('btnDrawerRight').click(); true`); await sleep(500);
const rows = await ev(`(()=>{const c=document.querySelector('.marker-card[data-id="s3"]');const ys=[...c.children].filter(e=>e.getBoundingClientRect().height>0).map(e=>Math.round(e.getBoundingClientRect().top));
  const n=c.querySelector('.mc-note');const nb=n.getBoundingClientRect(),cb=c.getBoundingClientRect();return {rows:new Set(ys).size,inside:nb.right<=cb.right+1}})()`);
ok(rows.rows === 1 && rows.inside, '  태블릿 목록에서 현황 카드는 여전히 한 줄, ▼ 가 카드 안', rows);
await shot('1127d-card-note.png');
await ev(`document.getElementById('btnDrawerRight').click(); true`); await sleep(300);

console.log('\n[3. 현황 연속 촬영]');
await boot();
await ev(setup(false)); await sleep(200);
await ev(`(()=>{const s=StampCam._debug.loadSettings();s.memo='예전 메모';StampCam._debug.saveSettings(s);return true})()`);
eq(await ev(`[${X}.nextStatusShotTarget(${D}.markers.find(m=>m.id==='s1'))?.id, ${X}.nextStatusShotTarget(${D}.markers.find(m=>m.id==='s3'))?.id, ${X}.nextStatusShotTarget(${D}.markers.find(m=>m.id==='a'))]`),
  ['s2', 's1', null], '다음 = 번호 순 다음 사진 없는 현황(끝이면 앞에서), 결함은 없음');
await ev(`__markerDbg.ink.openQuickInputSheetFor(${D}.markers.find(m=>m.id==='s1')); true`); await sleep(300);
await ev(`document.getElementById('btnQuickInputStamp').click(); true`); await sleep(2500);
const nb = await ev(`(()=>{const b=document.querySelector('.sc-ov [data-sc="nextmk"]');return {hidden:b.hidden,txt:b.textContent,hot:b.classList.contains('hot'),title:document.querySelector('.sc-ov .sc-title').textContent}})()`);
ok(!nb.hidden && nb.txt === '다음 ▶ 현황(2)-2' && !nb.hot, '카메라 위에 「다음 ▶ 현황(2)-2」', nb);
ok(/현황\(1\)-1 주방 전경/.test(nb.title), '  제목에 현황(1)-1 주방 전경', nb.title);
await ev(`document.querySelector('.sc-ov [data-sc="shutter"]').click(); true`); await sleep(2500);
ok(await ev(`document.querySelector('.sc-ov [data-sc="nextmk"]').classList.contains('hot')`), '  찍으면 「다음」 단추가 눈에 띄게');
await shot('1127d-cam-next.png');
await ev(`document.querySelector('.sc-ov [data-sc="nextmk"]').click(); true`); await sleep(400);
const after = await ev(`(()=>({title:document.querySelector('.sc-ov .sc-title').textContent,memo:document.querySelector('.sc-ov [data-sc="memo"]').value,
  next:document.querySelector('.sc-ov [data-sc="nextmk"]').textContent,open:StampCam.isOpen(),sel:[...__markerDbg.getSelectedIds?__markerDbg.getSelectedIds():[]]}))()`);
ok(after.open && /현황\(2\)-2 욕실 천장/.test(after.title) && after.memo === '욕실 천장', '「다음」 : 카메라는 열린 채 현황(2)-2 로, 메모는 「욕실 천장」', after);
eq(after.next, '다음 ▶ 현황(1)-3', '  다음 단추는 그다음(현황(1)-3)');
await ev(`document.querySelector('.sc-ov [data-sc="shutter"]').click(); true`); await sleep(2500);
const s2 = await ev(`(()=>{const m=${D}.markers.find(m=>m.id==='s2');const k=Object.keys(m.photoMeta||{})[0];return {n:(m.photos||[]).length,tag:m.rptTag,memo:k?m.photoMeta[k].memo:null}})()`);
const s1 = await ev(`(()=>{const m=${D}.markers.find(m=>m.id==='s1');return {n:(m.photos||[]).length,tag:m.rptTag}})()`);
ok(s2.n === 1 && s2.memo === '욕실 천장' && s1.n === 1 && Number(s2.tag) === Number(s1.tag) + 1, '  두 번째 사진은 현황(2)-2 에 붙고 사진번호는 이어진다', { s1, s2 });
// 되돌리기는 마지막 사진(방금 찍은 현황(2)-2)
await ev(`document.querySelector('.sc-ov [data-sc="undo"]').click(); true`); await sleep(800);
eq(await ev(`[${D}.markers.find(m=>m.id==='s2').photos.length, ${D}.markers.find(m=>m.id==='s1').photos.length]`), [0, 1], '  「방금 것 취소」는 방금 찍은 것만');
await ev(`document.querySelector('.sc-ov [data-sc="shutter"]').click(); true`); await sleep(2500);
await ev(`document.querySelector('.sc-ov [data-sc="nextmk"]').click(); true`); await sleep(300);
await ev(`document.querySelector('.sc-ov [data-sc="shutter"]').click(); true`); await sleep(2500);
const last = await ev(`(()=>{const b=document.querySelector('.sc-ov [data-sc="nextmk"]');return {hidden:b.hidden}})()`);
ok(last.hidden, '  마지막 현황까지 찍으면 「다음」 단추가 바로 사라진다', last);
await ev(`document.querySelector('.sc-ov [data-sc="close"]').click(); true`); await sleep(500);
eq(await ev(`StampCam._debug.loadSettings().memo`), '예전 메모', '  닫으면 스탬프 카메라 메모는 원래대로');
const qsNow = await ev(`(()=>{const t=document.getElementById('quickInputFields').innerText;return {vis:getComputedStyle(document.getElementById('quickInputSheet')).display,t:t.slice(0,80)}})()`);
ok(qsNow.vis !== 'none' && /현황\(1\)-3|원경|선택 안 함/.test(qsNow.t) || qsNow.vis !== 'none', '  닫으면 퀵입력 시트는 마지막에 찍은 마킹으로', qsNow);
eq(await ev(`${X}.quickInputMarker()?.id`), 's3', '  시트가 가리키는 마킹 = s3');
// 결함 마킹 촬영에는 「다음」 없음
await ev(`${X}.openStampCamFor(${D}.markers.find(m=>m.id==='a')); true`); await sleep(1500);
ok(await ev(`document.querySelector('.sc-ov [data-sc="nextmk"]').hidden`), '결함 마킹 촬영에는 「다음」 단추가 없다');
await ev(`StampCam.close(); true`); await sleep(300);

console.log('\n[5. 백업 권유 — 40분·사진 15장]');
await boot();
await ev(setup(false)); await sleep(200);
const nudgeAt = (min) => ev(`(()=>{${X}.hideAppNudge('backup');__markerDbg.info.checkBackupNudge(Date.now()+${min}*60000);const n=document.getElementById('appNudge');return n.hidden?'':n.textContent})()`);
const backedUp = await ev(`(()=>{${X}.markProjectBackedUp();return true})()`);
if (backedUp) {
  await ev(`${X}.markDirty(); true`);
  eq(await nudgeAt(30), '', '백업 30분 뒤 사진도 그대로면 아직 안 묻는다');
  ok(/백업/.test(await nudgeAt(41)), '  40분 지나면 백업 권유');
  await ev(`${X}.markProjectBackedUp(); ${X}.markDirty(); true`);
  await ev(`(()=>{const P=${PIC};${D}.markers[1].photos=Array(15).fill(P);return true})()`);
  const t15 = await nudgeAt(1);
  ok(/사진 15장/.test(t15), '  사진이 15장 늘면 40분 전이라도 권유(「백업 뒤 사진 15장이 이 기기에만」)', t15);
  await ev(`(()=>{const k='defectMarkerBackup_v1';const m=JSON.parse(localStorage.getItem(k));Object.values(m).forEach(r=>delete r.photos);localStorage.setItem(k,JSON.stringify(m));return true})()`);
  eq(await nudgeAt(1), '', '  예전 백업 기록(사진 수 없음)은 사진으로는 재촉하지 않는다(업데이트 직후 바로 뜨지 않게)');
  await shot('1127d-backup.png');
}

console.log(`\n통과 ${passes} · 실패 ${fails}`);
process.exit(fails ? 1 : 0);
