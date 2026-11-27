/* 결함마킹 ↔ 번호 스탬프 카메라 연동 검사.

   두 앱을 같은 주소(origin) 아래에 띄워야 번호·목록이 이어진다(GitHub Pages 의 yeop9701.github.io 와 같다).
   CL 폴더를 통째로 서버에 올리면 /defect-marker-stampcam/ 과 /stamp-camera/ 이 같은 origin 이 된다.

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더>
            --use-fake-device-for-media-stream --use-fake-ui-for-media-stream about:blank
     node tests/test-stampcam.mjs

   가짜 카메라가 실제 영상을 내보내므로 getUserMedia → 찍기 → 스탬프 → 저장 → 번호 올리기까지
   진짜 경로를 그대로 탄다.                                                                    */
import { connect, click, finish } from './cdp.mjs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = fileURLToPath(new URL('./out/', import.meta.url));
const DL = OUT + 'stampcam-downloads/';
mkdirSync(OUT, { recursive: true });
rmSync(DL, { recursive: true, force: true });
mkdirSync(DL, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:8125';
const APP = BASE + '/defect-marker-stampcam/index.html';
const STAMP = BASE + '/stamp-camera/';

const cdp = await connect(Number(process.env.CDP_PORT || 9223));
const ev = (s) => cdp.evaluate(s);
let fails = 0, passes = 0;
const ok = (cond, msg, extra) => {
  if (cond) passes++; else fails++;
  console.log((cond ? '  OK   ' : '  FAIL ') + msg + (!cond && extra !== undefined ? '  → ' + JSON.stringify(extra) : ''));
};
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg, { 실제: a, 바람: b });
const waitFor = async (expr, ms = 8000) => {
  for (let t = 0; t < ms; t += 100) { if (await ev(expr).catch(() => false)) return true; await sleep(100); }
  return false;
};
/* 촬영 화면이 한가해질 때까지 (찍기·취소가 끝날 때까지) */
const idle = () => waitFor(`!window.StampCam || !StampCam._debug.ui || !StampCam._debug.ui.busy`);
const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT + name, Buffer.from(data, 'base64'));
};
const settings = () => ev(`JSON.parse(localStorage.getItem('stampcam.settings.v1')||'{}')`);
const shotsInList = () => ev(`new Promise(r=>{const q=indexedDB.open('stampcam',1);q.onupgradeneeded=()=>q.result.createObjectStore('shots',{keyPath:'id',autoIncrement:true});
  q.onsuccess=()=>{const t=q.result.transaction('shots','readonly').objectStore('shots').getAll();t.onsuccess=()=>{r(t.result.map(x=>x.name));q.result.close();};t.onerror=()=>r(null)}; q.onerror=()=>r(null)})`);

await cdp.send('DOM.enable');
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: path.resolve(DL), eventsEnabled: true });
/* 참고 : 크롬은 한 사이트가 잇달아 여러 파일을 내려받으면 「여러 파일 다운로드」 허용을 한 번 묻는다(폰도 같다).
   새 프로필 headless 에서 가끔 두 번째 다운로드가 그 물음에 막혀 다운로드 칸 검사가 실패한다 — 다시 돌리면 통과한다. */
/* 다운로드는 조금 늦게 디스크에 닿는다 — 기다렸다 센다 */
const dlFiles = async (n) => {
  for (let i = 0; i < 40; i++) {
    const f = readdirSync(DL).filter((x) => !x.endsWith('.crdownload'));
    if (f.length >= n) return f.sort();
    await sleep(100);
  }
  return readdirSync(DL).sort();
};
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });

/* ── 0. 같은 origin 에서 스탬프 카메라 설정을 만들어 둔다 (번호 12, 사진에 번호 표시, 다운로드+목록) ── */
console.log('\n[0] 준비');
await cdp.send('Page.navigate', { url: STAMP });
await sleep(1500);
await ev(`localStorage.clear(); indexedDB.deleteDatabase('stampcam'); true`);
await ev(`localStorage.setItem('stampcam.settings.v1', JSON.stringify({current:12, pad:4, numberOn:true, saveMode:'download', keepInList:true,
  fileName:'{date}_{no}_{memo}', memo:'', rev:4})); true`);
await cdp.send('Page.navigate', { url: APP });
await sleep(1800);
await ev('try{ Object.keys(localStorage).filter(k=>!k.startsWith("stampcam")).forEach(k=>localStorage.removeItem(k)); }catch(e){}; true');
await cdp.send('Page.navigate', { url: APP });
await sleep(1800);
ok(await ev('!!window.StampCam'), 'stampcam.js 를 불러왔다');
eq(await ev('StampCam.peek().numberText'), '0012', '스탬프 카메라 설정을 그대로 읽는다(다음 번호 0012)');

/* 도면 한 장 + 결함 하나 */
const r0 = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#addDrawingInput')` });
await cdp.send('DOM.setFileInputFiles', { files: [ROOT + 'test-fixtures/plan.png'], objectId: r0.result.objectId });
await sleep(1400);
const box = await ev(`(()=>{const r=document.getElementById('mainCanvas').getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};})()`);
await click(cdp, box.x + box.w * 0.4, box.y + box.h * 0.4); await sleep(300);
ok(await ev('__markerDbg.getActiveDrawing().markers.length') === 1, '결함 하나를 찍었다');
const tagKey = await ev(`(()=>{const m=__markerDbg.getActiveDrawing().markers[0];return 'rptTag' in m || true ? (m.typeKey) : ''})()`);
console.log('  (결함 종류 : ' + tagKey + ')');
await ev(`(()=>{const m=__markerDbg.getActiveDrawing().markers[0]; m.rptType='벽체'; m.rptDefect='균열'; return true})()`);
// 2026-11-27 부터 촬영 화면을 열 때 번호를 프로젝트에 맞춘다(사진 없는 새 프로젝트면 1). 이 검사는 「이 프로젝트에서
// 이미 12 까지 이어 온」 경우를 본다 — 이 프로젝트를 번호의 주인으로 적어 두면 12 를 그대로 쓴다(맞춤 자체는 test-1127).
await ev(`localStorage.setItem('defectMarkerStampOwner_v1', JSON.stringify({uuid: __markerDbg.t1127.currentProjectUuid})); true`);

/* ── 1. 사진 창 → 스탬프 촬영 ─────────────────────────────── */
console.log('\n[1] 스탬프 촬영');
await ev(`document.querySelector('[data-role="photo"]').click(); true`);
ok(await waitFor(`document.getElementById('photoBackdrop').style.display==='flex'`), '사진 창이 열린다');
ok((await ev(`document.getElementById('stampCamNext').textContent`)).includes('0012'), '사진 창에 다음 번호 0012 가 보인다');
ok((await ev(`document.getElementById('stampCamHint').textContent`)).includes('첫 사진 번호가 사진번호 칸에 들어간다'), '첫 사진 번호가 사진번호 칸에 들어간다는 안내');
await shot('stampcam-1-modal.png');
await ev(`document.getElementById('btnStampCam').click(); true`);
ok(await waitFor(`!!document.querySelector('.sc-ov')`), '촬영 화면이 뜬다');
ok(await waitFor(`!document.querySelector('.sc-ov [data-sc="shutter"]').disabled`, 10000), '가짜 카메라가 켜져 셔터가 살아난다');
eq(await ev(`document.querySelector('.sc-ov [data-sc="next"]').textContent`), '0012', '촬영 화면의 다음 번호');
const frame = await ev(`(()=>{const r=document.querySelector('.sc-ov [data-sc="frame"]').getBoundingClientRect();return Math.round(r.width/r.height*100)/100})()`);
ok(Math.abs(frame - 4 / 3) < 0.02 || Math.abs(frame - 3 / 4) < 0.02, '미리보기 칸이 저장될 4:3 모양', String(frame));
ok(await ev(`document.querySelector('.sc-ov [data-sc="frame"]').getBoundingClientRect().height > 300`), '미리보기가 화면에 크게 보인다');
/* 메모 : 결함 정보로 채우기 → 스탬프 카메라 설정의 메모가 된다 */
await ev(`document.querySelector('.sc-ov [data-sc="suggest"]').click(); true`);
eq((await settings()).memo, '벽체 균열', '「결함 정보로」 → 메모 = 부재 결함 (스탬프 카메라 메모 칸에 저장)');
await shot('stampcam-2-camera.png');
await ev(`document.querySelector('.sc-ov [data-sc="shutter"]').click(); true`);
ok(await waitFor(`__markerDbg.getActiveDrawing().markers[0].photos && __markerDbg.getActiveDrawing().markers[0].photos.length===1`), '찍으면 결함에 사진이 붙는다');
const m1 = await ev(`(()=>{const m=__markerDbg.getActiveDrawing().markers[0];return {tag:m.rptTag||m.eqTag||'', photo:m.photos[0].slice(0,23)}})()`);
eq(m1.tag, '12', '사진번호 칸에 12 가 들어간다');
eq(m1.photo, 'data:image/jpeg;base64,', '붙은 사진은 JPEG');
eq((await settings()).current, 13, '번호가 13 으로 오른다(스탬프 카메라 설정에 저장)');
ok(await waitFor(`document.querySelector('.sc-ov [data-sc="next"]').textContent==='0013'`), '촬영 화면의 다음 번호도 0013');
ok((await ev(`(document.querySelector('.sc-ov .sc-toast')||{}).textContent||''`)).includes('사진번호 12'), '알림 : 0012 저장됨 · 결함에 붙임 · 사진번호 12');
await shot('stampcam-3-after-shot.png');
/* 두 번째 장 : 사진번호 칸은 그대로 */
await ev(`document.querySelector('.sc-ov [data-sc="shutter"]').click(); true`);
ok(await waitFor(`__markerDbg.getActiveDrawing().markers[0].photos.length===2`), '두 번째 장도 붙는다');
eq(await ev(`(()=>{const m=__markerDbg.getActiveDrawing().markers[0];return m.rptTag||m.eqTag})()`), '12', '사진번호 칸은 첫 번호 12 그대로');
eq((await settings()).current, 14, '번호 14');
eq(await ev(`document.querySelector('.sc-ov [data-sc="thumb"] span').textContent`), '2', '찍은 장수 2');
/* 다운로드 파일 이름 = 스탬프 카메라 규칙 {date}_{no}_{memo} */
const files = await dlFiles(2);
ok(files.length === 2 && /^\d{8}_0012_벽체 균열\.jpg$/.test(files[0]) && /^\d{8}_0013_벽체 균열\.jpg$/.test(files[1]),
  '다운로드 폴더에 스탬프 카메라 이름 규칙으로 저장 (날짜_0012_벽체 균열.jpg …)', files);
eq((await shotsInList()).length, 2, '스탬프 카메라 앱 목록(IndexedDB)에도 2장');
/* 닫기 → 카메라 꺼짐 */
await ev(`document.querySelector('.sc-ov [data-sc="close"]').click(); true`);
ok(!(await ev(`!!document.querySelector('.sc-ov')`)), '닫으면 촬영 화면이 사라진다');
ok((await ev(`document.getElementById('stampCamNext').textContent`)).includes('0014'), '사진 창의 다음 번호 0014');
eq(await ev(`document.querySelectorAll('#photoGrid .photo-thumb').length`), 2, '사진 창 목록에 2장');
ok((await ev(`document.getElementById('stampCamHint').textContent`)).includes('지금 12 → 바뀜'), '이제는 「지금 12 → 바뀜」 안내(다음 촬영의 첫 장이 번호를 바꾼다)');

/* ── 2. 기본 카메라 + 번호 (파일 받아 스탬프) ───────────────── */
console.log('\n[2] 기본 카메라 + 번호');
const r1 = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#stampNativeInput')` });
await cdp.send('DOM.setFileInputFiles', { files: [ROOT + 'test-fixtures/plan.png'], objectId: r1.result.objectId });
ok(await waitFor(`__markerDbg.getActiveDrawing().markers[0].photos.length===3`), '기본 카메라 사진에도 번호를 찍어 붙인다');
eq((await settings()).current, 15, '번호 15');
eq(await ev(`(()=>{const m=__markerDbg.getActiveDrawing().markers[0];return m.rptTag||m.eqTag})()`), '14', '새 촬영의 첫 장이므로 사진번호 12 → 14 로 바뀐다');
ok((await dlFiles(3)).some((f) => /_0014_벽체 균열\.jpg$/.test(f)), '0014 파일이 다운로드 폴더에');

/* ── 3. 실행취소 : 사진번호 칸만 되돌아가고 사진은 남는다 ── */
console.log('\n[3] 실행취소');
await ev(`document.getElementById('btnPhotoModalClose').click(); true`);
await ev(`(()=>{const m=__markerDbg.getActiveDrawing().markers[0]; m.rptTag=''; m.eqTag=''; return true})()`);
/* 사진번호가 빈 결함에 새로 찍어 채운 뒤 Ctrl+Z */
await ev(`document.querySelector('[data-role="photo"]').click(); true`);
await ev(`document.getElementById('btnStampCam').click(); true`);
await waitFor(`!document.querySelector('.sc-ov [data-sc="shutter"]').disabled`, 10000);
await ev(`document.querySelector('.sc-ov [data-sc="shutter"]').click(); true`);
await waitFor(`__markerDbg.getActiveDrawing().markers[0].photos.length===4`); await idle();
eq(await ev(`(()=>{const m=__markerDbg.getActiveDrawing().markers[0];return m.rptTag||m.eqTag})()`), '15', '빈 사진번호 칸에 15');
await ev(`document.querySelector('.sc-ov [data-sc="close"]').click(); document.getElementById('btnPhotoModalClose').click(); true`);

/* ── 3-2. 방금 찍은 것 취소 ─────────────────────────────── */
console.log('\n[3-2] 방금 찍은 것 취소');
const tag = () => ev(`(()=>{const m=__markerDbg.getActiveDrawing().markers[0];return m.rptTag||m.eqTag||''})()`);
const nPhotos = () => ev(`__markerDbg.getActiveDrawing().markers[0].photos.length`);
await ev(`(()=>{const m=__markerDbg.getActiveDrawing().markers[0]; m.rptTag=''; m.eqTag=''; return true})()`);
await ev(`document.querySelector('[data-role="photo"]').click(); true`);
await ev(`document.getElementById('btnStampCam').click(); true`);
await waitFor(`!document.querySelector('.sc-ov [data-sc="shutter"]').disabled`, 10000);
ok(await ev(`document.querySelector('.sc-ov [data-sc="undo"]').disabled`), '찍기 전에는 취소 단추가 꺼져 있다');
const listBefore = (await shotsInList()).length;
await ev(`document.querySelector('.sc-ov [data-sc="shutter"]').click(); true`);
await waitFor(`__markerDbg.getActiveDrawing().markers[0].photos.length===5`); await idle();
eq([await tag(), (await settings()).current, (await shotsInList()).length], ['16', 17, listBefore + 1], '찍음 : 사진번호 16 · 번호 17 · 목록 +1');
await ev(`document.querySelector('.sc-ov [data-sc="undo"]').click(); true`); await idle();
ok(await waitFor(`__markerDbg.getActiveDrawing().markers[0].photos.length===4`), '취소 → 결함에서 사진이 빠진다');
eq([await tag(), (await settings()).current, (await shotsInList()).length], ['', 16, listBefore], '취소 → 사진번호 비움 · 번호 16 으로 · 목록에서도 지움');
eq(await ev(`document.querySelector('.sc-ov [data-sc="next"]').textContent`), '0016', '촬영 화면 다음 번호도 0016');
ok((await ev(`(document.querySelector('.sc-ov .sc-toast')||{}).textContent||''`)).includes('다운로드된 파일은 직접'), '알림 : 다운로드 파일은 직접 지우라고 알려 준다');
ok(await ev(`document.querySelector('.sc-ov [data-sc="undo"]').disabled`), '더 취소할 것이 없으면 단추가 꺼진다');
/* 두 장 찍고 두 번 취소 → 차례로 거슬러 간다 */
await ev(`document.querySelector('.sc-ov [data-sc="shutter"]').click(); true`);
await waitFor(`__markerDbg.getActiveDrawing().markers[0].photos.length===5`); await idle();
await ev(`document.querySelector('.sc-ov [data-sc="shutter"]').click(); true`);
await waitFor(`__markerDbg.getActiveDrawing().markers[0].photos.length===6`); await idle();
eq([await tag(), (await settings()).current], ['16', 18], '두 장 : 사진번호 16(첫 장) · 번호 18');
await ev(`document.querySelector('.sc-ov [data-sc="undo"]').click(); true`); await idle();
await waitFor(`__markerDbg.getActiveDrawing().markers[0].photos.length===5`); await idle();
eq([await tag(), (await settings()).current], ['16', 17], '한 번 취소 : 둘째 장만 빠지고 사진번호 16 은 그대로 · 번호 17');
await ev(`document.querySelector('.sc-ov [data-sc="undo"]').click(); true`); await idle();
await waitFor(`__markerDbg.getActiveDrawing().markers[0].photos.length===4`); await idle();
eq([await tag(), (await settings()).current, (await shotsInList()).length], ['', 16, listBefore], '두 번 취소 : 처음 상태로');
/* 그 사이 다른 앱이 번호를 올렸으면 번호는 되돌리지 않는다(겹치지 않게) */
await ev(`document.querySelector('.sc-ov [data-sc="shutter"]').click(); true`);
await waitFor(`__markerDbg.getActiveDrawing().markers[0].photos.length===5`); await idle();
await ev(`(()=>{const s=JSON.parse(localStorage.getItem('stampcam.settings.v1')); s.current=30; localStorage.setItem('stampcam.settings.v1', JSON.stringify(s)); return true})()`);
await ev(`document.querySelector('.sc-ov [data-sc="undo"]').click(); true`); await idle();
await waitFor(`__markerDbg.getActiveDrawing().markers[0].photos.length===4`); await idle();
eq((await settings()).current, 30, '다른 앱이 번호를 올린 뒤의 취소는 번호를 그대로 둔다');
ok((await ev(`(document.querySelector('.sc-ov .sc-toast')||{}).textContent||''`)).includes('번호는 그대로'), '알림 : 번호는 그대로');
await ev(`(()=>{const s=JSON.parse(localStorage.getItem('stampcam.settings.v1')); s.current=16; localStorage.setItem('stampcam.settings.v1', JSON.stringify(s)); return true})()`);

/* ── 3-3. 점검 앱용 파일이름 (카메라명+번호) ─────────────── */
console.log('\n[3-3] 점검 앱용 파일이름 {cam}{no}');
await ev(`(()=>{const s=JSON.parse(localStorage.getItem('stampcam.settings.v1')); s.fileName='{cam}{no}'; s.camName='KIM'; localStorage.setItem('stampcam.settings.v1', JSON.stringify(s)); return true})()`);
const dlBefore = readdirSync(DL).length;
await ev(`document.querySelector('.sc-ov [data-sc="shutter"]').click(); true`);
await waitFor(`__markerDbg.getActiveDrawing().markers[0].photos.length===5`); await idle();
ok((await dlFiles(dlBefore + 1)).includes('KIM0016.jpg'), '파일이름 KIM0016.jpg — 외관조사·체크리스트 앱이 찾는 이름', readdirSync(DL));
eq(await tag(), '16', '사진번호 칸 16 (외관조사 앱 : 카메라 k + 사진번호 16 → KIM0016)');
await ev(`document.querySelector('.sc-ov [data-sc="undo"]').click(); true`); await idle();
await waitFor(`__markerDbg.getActiveDrawing().markers[0].photos.length===4`); await idle();
await ev(`(()=>{const s=JSON.parse(localStorage.getItem('stampcam.settings.v1')); s.fileName='{date}_{no}_{memo}'; localStorage.setItem('stampcam.settings.v1', JSON.stringify(s)); return true})()`);
eq((await settings()).current, 16, '되돌려 놓음(번호 16)');
await ev(`document.querySelector('.sc-ov [data-sc="close"]').click(); document.getElementById('btnPhotoModalClose').click(); true`);

/* ── 3-4. 촬영 목록 (작은 사진을 누르면) ─────────────────── */
console.log('\n[3-4] 촬영 목록');
const sc = (k) => `document.querySelector('.sc-ov [data-sc="${k}"]')`;
const clickSc = (k) => ev(`${sc(k)}.click(); true`);
await ev(`(()=>{const m=__markerDbg.getActiveDrawing().markers[0]; m.rptTag=''; m.eqTag=''; return true})()`);
await ev(`document.querySelector('[data-role="photo"]').click(); true`);
await ev(`document.getElementById('btnStampCam').click(); true`);
await waitFor(`!${sc('shutter')}.disabled`, 10000);
await clickSc('shutter'); await waitFor(`__markerDbg.getActiveDrawing().markers[0].photos.length===5`); await idle();
await clickSc('shutter'); await waitFor(`__markerDbg.getActiveDrawing().markers[0].photos.length===6`); await idle();
eq([await tag(), (await settings()).current], ['16', 18], '두 장 찍음 (0016 · 0017)');
await clickSc('thumb');
ok(await waitFor(`!${sc('list')}.hidden && document.querySelectorAll('.sc-ov .sc-item').length===6`), '작은 사진을 누르면 촬영 목록 (스탬프 카메라 목록 6장)');
eq(await ev(`[...document.querySelectorAll('.sc-ov .sc-item')].map(b=>b.querySelector('span').textContent.split(' ')[0])`),
  ['0017', '0016', '0015', '0014', '0013', '0012'], '최근 것부터 · 번호가 보인다');
eq(await ev(`document.querySelectorAll('.sc-ov .sc-item i').length`), 2, '이번에 찍어 결함에 붙인 2장에 「결함」 표시');
ok((await ev(`${sc('lsum')}.textContent`)).startsWith('6장'), '장수·용량 요약');
await shot('stampcam-4-list.png');
/* 보기 → 삭제 */
await ev(`document.querySelector('.sc-ov .sc-item').click(); true`);
ok(await waitFor(`!${sc('viewer')}.hidden && ${sc('vimg')}.src.startsWith('blob:')`), '누르면 크게 보기');
ok((await ev(`${sc('vname')}.textContent`)).includes('결함에 붙인 사진'), '보기 : 파일이름 · 크기 · 결함에 붙인 사진');
await shot('stampcam-5-viewer.png');
await clickSc('vdel');
ok(await waitFor(`document.querySelectorAll('.sc-ov .sc-item').length===5`), '보기에서 삭제 → 목록 5장');
eq(await nPhotos(), 5, '이번에 붙인 사진이라 결함에서도 빠진다');
ok(await ev(`${sc('viewer')}.hidden`), '보기가 닫힌다');
/* 선택 → 삭제 */
await clickSc('lsel');
ok(await ev(`${sc('lgrid')}.classList.contains('selecting') && !${sc('lselbar')}.hidden`), '[선택] → 선택 모드');
await ev(`document.querySelector('.sc-ov .sc-item').click(); true`);
eq(await ev(`${sc('lselcount')}.textContent`), '1장 선택', '한 장 고름');
await clickSc('lseldel');
ok(await waitFor(`document.querySelectorAll('.sc-ov .sc-item').length===4`), '선택 삭제 → 목록 4장');
eq([await nPhotos(), await tag()], [4, ''], '결함에서도 빠지고, 그 사진이 채운 사진번호(16)도 비운다');
eq((await settings()).current, 18, '목록에서 지워도 번호는 그대로(스탬프 카메라와 같다)');
eq(await ev(`${sc('thumb')}.textContent`), '', '찍은 장수 0 · 「방금 것 취소」 할 것도 없음');
ok(await ev(`${sc('undo')}.disabled`), '취소 단추 꺼짐');
/* 길게 눌러 선택 */
const it0 = await ev(`(()=>{const r=document.querySelector('.sc-ov .sc-item').getBoundingClientRect();return {x:r.x+20,y:r.y+20}})()`);
await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: it0.x, y: it0.y, button: 'left', buttons: 1, clickCount: 1 });
await sleep(650);
await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: it0.x, y: it0.y, button: 'left', buttons: 0, clickCount: 1 });
await sleep(100);
eq(await ev(`${sc('lselcount')}.textContent`), '1장 선택', '길게 누르면 선택 모드로 들어가며 그 사진을 고른다');
await clickSc('lselall');
eq(await ev(`${sc('lselcount')}.textContent`), '4장 선택', '전체 선택');
const zipBefore = readdirSync(DL).filter((f) => f.endsWith('.zip')).length;
await clickSc('lselzip');
let zips = [];
for (let i = 0; i < 50 && zips.length <= zipBefore; i++) { await sleep(100); zips = readdirSync(DL).filter((f) => /^스탬프사진_.*\.zip$/.test(f)); }
ok(zips.length > zipBefore, '선택 ZIP 이 다운로드된다', zips);
await clickSc('lselcancel');
ok(!(await ev(`${sc('lgrid')}.classList.contains('selecting')`)), '취소 → 선택 모드 끝');
/* 저장 방식 : 목록에만 → 취소하면 완전히 지워진다 */
ok(await ev(`${sc('lmode')}.checked`), '「찍을 때 다운로드 폴더에도 저장」 켜짐 (지금 설정 = 다운로드)');
await ev(`(()=>{const c=${sc('lmode')}; c.checked=false; c.dispatchEvent(new Event('change',{bubbles:true})); return true})()`);
eq((await settings()).saveMode, 'list', '끄면 스탬프 카메라 설정의 저장 방식이 「앱 목록에만」');
await clickSc('lclose');
ok(await ev(`${sc('list')}.hidden`), '목록 닫기');
const dlCount = readdirSync(DL).length;
await clickSc('shutter'); await waitFor(`__markerDbg.getActiveDrawing().markers[0].photos.length===5`); await idle();
await sleep(500);
eq(readdirSync(DL).length, dlCount, '목록에만 저장 : 다운로드 폴더에 파일이 생기지 않는다');
eq((await shotsInList()).length, 5, '목록에는 들어간다');
await clickSc('undo'); await idle();
eq([(await shotsInList()).length, (await settings()).current, await nPhotos()], [4, 18, 4], '취소 → 목록·결함·번호 모두 처음대로 (남는 파일 없음)');
ok(!(await ev(`(document.querySelector('.sc-ov .sc-toast')||{}).textContent||''`)).includes('직접 지워'), '이때는 「직접 지워 주세요」 안내가 없다');
await ev(`(()=>{const s=JSON.parse(localStorage.getItem('stampcam.settings.v1')); s.saveMode='download'; s.current=16; localStorage.setItem('stampcam.settings.v1', JSON.stringify(s)); return true})()`);
/* 목록이 열려 있을 때 Esc 는 목록만 닫는다 */
await clickSc('thumb'); await waitFor(`!${sc('list')}.hidden`);
await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
ok(await waitFor(`${sc('list')}.hidden`) && await ev(`!!document.querySelector('.sc-ov')`), 'Esc → 목록만 닫히고 촬영 화면은 남는다');
await clickSc('close');
await ev(`document.getElementById('btnPhotoModalClose').click(); true`);

/* ── 3-5. 퀵입력 시트에서 바로 스탬프 촬영 ── */
console.log('\n[3-5] 퀵입력 시트의 「스탬프 촬영」');
await click(cdp, box.x + box.w * 0.7, box.y + box.h * 0.6); await sleep(300);
const qn = await ev('__markerDbg.getActiveDrawing().markers.length') - 1;
/* 사진번호 칸에 이미 다른 값(손으로 쓴 5)이 있어도 찍은 번호로 바뀌어야 한다 */
await ev(`(()=>{const m=__markerDbg.getActiveDrawing().markers[${qn}]; if('rptTag' in m || !('eqTag' in m)) m.rptTag='5'; else m.eqTag='5'; return true})()`);
await ev(`__markerDbg.ink.openQuickInputSheetFor(__markerDbg.getActiveDrawing().markers[${qn}]); true`);
await sleep(300);
const qb = `document.getElementById('btnQuickInputStamp')`;
ok(await ev(`${qb}.style.display!=='none' && ${qb}.offsetWidth>0`), '퀵입력 시트 위 줄에 「스탬프 촬영」 단추');
ok((await ev(`${qb}.textContent`)).includes('0016'), '  → 다음 번호(0016)가 같이 보인다', await ev(`${qb}.textContent`));
await ev(`${qb}.click(); true`);
ok(await waitFor(`!!document.querySelector('.sc-ov')`), '누르면 사진 창을 거치지 않고 바로 촬영 화면');
ok(await waitFor(`!document.querySelector('.sc-ov [data-sc="shutter"]').disabled`, 10000), '  → 셔터가 살아난다');
await ev(`document.querySelector('.sc-ov [data-sc="shutter"]').click(); true`);
ok(await waitFor(`(__markerDbg.getActiveDrawing().markers[${qn}].photos||[]).length===1`), '찍은 사진이 그 결함에 붙는다');
ok(await waitFor(`(()=>{const m=__markerDbg.getActiveDrawing().markers[${qn}]; return (m.rptTag||m.eqTag)==='16'})()`), '찍자마자 사진번호 5 → 16 (칸에 값이 있어도 바꾼다)');
ok(await ev(`!!document.querySelector('.sc-ov')`) && await ev(`[...document.querySelectorAll('#quickInputFields input')].some(i=>i.value==='16')`), '  → 촬영 화면이 떠 있는 동안 뒤의 퀵입력 시트 칸도 이미 16');
ok((await ev(`(document.querySelector('.sc-ov .sc-toast')||{}).textContent||''`)).includes('5 → 16'), '  → 촬영 화면 알림에 「5 → 16」', await ev(`(document.querySelector('.sc-ov .sc-toast')||{}).textContent||''`));
/* 같은 촬영 화면의 두 번째 장은 첫 장 번호 그대로 */
await idle();
await ev(`document.querySelector('.sc-ov [data-sc="shutter"]').click(); true`);
ok(await waitFor(`(__markerDbg.getActiveDrawing().markers[${qn}].photos||[]).length===2`), '두 번째 장도 붙는다');
eq(await ev(`(()=>{const m=__markerDbg.getActiveDrawing().markers[${qn}]; return m.rptTag||m.eqTag})()`), '16', '  → 사진번호는 첫 장 16 그대로');
/* 두 번째 장을 취소하고, 첫 장도 취소하면 원래 값 5 로 */
await idle(); await ev(`document.querySelector('.sc-ov [data-sc="undo"]') && document.querySelector('.sc-ov [data-sc="undo"]').click(); true`);
await idle(); await ev(`document.querySelector('.sc-ov [data-sc="undo"]') && document.querySelector('.sc-ov [data-sc="undo"]').click(); true`);
await idle();
eq(await ev(`(()=>{const m=__markerDbg.getActiveDrawing().markers[${qn}]; return [(m.photos||[]).length, m.rptTag||m.eqTag]})()`), [0, '5'], '두 장 다 취소 → 사진 없음 · 사진번호 원래 값 5 로');
await ev(`document.querySelector('.sc-ov [data-sc="shutter"]').click(); true`);
ok(await waitFor(`(()=>{const m=__markerDbg.getActiveDrawing().markers[${qn}]; return (m.photos||[]).length===1 && (m.rptTag||m.eqTag)==='16'})()`), '취소 뒤 다시 찍으면 그 장이 첫 장 — 사진번호 16');
await idle();
await ev(`document.querySelector('.sc-ov [data-sc="close"]').click(); true`);
ok(await waitFor(`!document.querySelector('.sc-ov')`), '촬영 화면을 닫는다');
const qTag = await ev(`(()=>{const m=__markerDbg.getActiveDrawing().markers[${qn}]; return m.rptTag||m.eqTag||''})()`);
eq(qTag, '16', '빈 사진번호 칸에 16');
ok(await ev(`document.getElementById('quickInputSheet').style.display!=='none'`), '퀵입력 시트는 그대로 열려 있다');
ok(await ev(`[...document.querySelectorAll('#quickInputFields input')].some(i=>i.value==='16')`), '  → 시트의 사진번호 칸에도 16 이 보인다');
ok((await ev(`${qb}.textContent`)).includes('0017'), '  → 단추의 다음 번호는 0017');
await ev(`__markerDbg.ink.hideQuickInputSheet(); true`);

/* ── 4. 스탬프 카메라 앱을 열면 번호가 이어진다 ─────────────── */
console.log('\n[4] 스탬프 카메라 앱과 번호 공유');
await cdp.send('Page.navigate', { url: STAMP });
await sleep(2500);
const stampNext = await ev(`(document.getElementById('nextText')||{}).textContent||''`);
ok(stampNext.includes('0017'), '스탬프 카메라 앱의 다음 번호 = 0017', stampNext);
eq((await shotsInList()).length, 5, '스탬프 카메라 목록에 결함마킹에서 찍은 5장(퀵입력 시트에서 찍은 1장 포함)');

/* ── 5. 스탬프 카메라 앱이 떠 있는 동안 다른 곳(결함마킹)에서 번호가 오르면 곧바로 따라간다 (v1.8.0) ── */
console.log('\n[5] 떠 있는 스탬프 카메라가 바뀐 번호를 따라감');
await ev(`(async()=>{const f=document.createElement('iframe');f.src='/defect-marker-stampcam/manifest.json';document.body.appendChild(f);
  await new Promise(r=>f.onload=r);
  const s=JSON.parse(f.contentWindow.localStorage.getItem('stampcam.settings.v1')); s.current=40; s.memo='다른 앱 메모';
  f.contentWindow.localStorage.setItem('stampcam.settings.v1', JSON.stringify(s)); return true})()`);
ok(await waitFor(`document.getElementById('nextText').textContent==='0040'`, 3000), '다른 문서에서 번호를 40 으로 → 스탬프 카메라 화면도 0040', await ev(`document.getElementById('nextText').textContent`));
ok(await waitFor(`document.getElementById('memoText').textContent==='다른 앱 메모'`, 3000), '메모도 따라감');
ok(await ev(`document.getElementById('btnUndo').disabled`), '남이 올린 번호는 되돌리기로 되감지 않는다(되돌리기 비움)');

/* ── 6. 스탬프 카메라 설정 : 점검 앱용 파일이름 (v1.9.0) ── */
console.log('\n[6] 스탬프 카메라 설정 화면의 「점검 앱용」 파일이름');
const setSel = (id, v) => ev(`(()=>{const e=document.getElementById('${id}'); e.value=${JSON.stringify(v)}; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true})()`);
ok(await ev(`[...document.getElementById('fileNamePreset').options].some(o=>o.value==='{cam}{no}')`), '파일명 목록에 「점검 앱용 : 카메라명+번호」');
ok(await ev(`document.getElementById('camNameRow').hidden`), '다른 규칙일 때는 카메라명 칸이 숨어 있다');
await setSel('fileNamePreset', '{cam}{no}');
ok(!(await ev(`document.getElementById('camNameRow').hidden`)), '고르면 카메라명 칸이 나온다');
eq(await ev(`document.getElementById('fileNamePreview').textContent`), 'KIM0040.jpg', '미리보기 KIM0040.jpg (기본 카메라명 KIM)');
await setSel('s-camName', 'CHOI');
eq(await ev(`document.getElementById('fileNamePreview').textContent`), 'CHOI0040.jpg', '카메라명 CHOI → CHOI0040.jpg');
ok(await ev(`document.getElementById('camNameWarn').hidden`), '4자리면 경고 없음');
await setSel('s-pad', '3');
ok(!(await ev(`document.getElementById('camNameWarn').hidden`)), '자릿수 3 이면 「4자리여야 짝이 맞는다」 경고');
await setSel('s-pad', '4');
await setSel('fileNamePreset', '{date}_{no}_{memo}');
ok(await ev(`document.getElementById('camNameRow').hidden`), '다른 규칙으로 돌리면 다시 숨는다');

/* 콘솔 오류 */
const errs = cdp.events.filter((e) => e.method === 'Runtime.exceptionThrown' ||
  (e.method === 'Log.entryAdded' && e.params.entry.level === 'error' && !/favicon|ERR_FILE_NOT_FOUND|404/.test(e.params.entry.text)));
eq(errs.map((e) => (e.params.exceptionDetails ? e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text : e.params.entry.text)).slice(0, 3), [], '콘솔 오류 없음');

console.log(`\n통과 ${passes} / 실패 ${fails}`);
finish(cdp, fails ? 1 : 0);
