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
const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT + name, Buffer.from(data, 'base64'));
};
const settings = () => ev(`JSON.parse(localStorage.getItem('stampcam.settings.v1')||'{}')`);
const shotsInList = () => ev(`new Promise(r=>{const q=indexedDB.open('stampcam',1);q.onupgradeneeded=()=>q.result.createObjectStore('shots',{keyPath:'id',autoIncrement:true});
  q.onsuccess=()=>{const t=q.result.transaction('shots','readonly').objectStore('shots').getAll();t.onsuccess=()=>{r(t.result.map(x=>x.name));q.result.close();};t.onerror=()=>r(null)}; q.onerror=()=>r(null)})`);

await cdp.send('DOM.enable');
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: path.resolve(DL), eventsEnabled: true });
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

/* ── 1. 사진 창 → 스탬프 촬영 ─────────────────────────────── */
console.log('\n[1] 스탬프 촬영');
await ev(`document.querySelector('[data-role="photo"]').click(); true`);
ok(await waitFor(`document.getElementById('photoBackdrop').style.display==='flex'`), '사진 창이 열린다');
ok((await ev(`document.getElementById('stampCamNext').textContent`)).includes('0012'), '사진 창에 다음 번호 0012 가 보인다');
ok((await ev(`document.getElementById('stampCamHint').textContent`)).includes('사진번호 칸이 비어'), '사진번호 칸이 비어 있다는 안내');
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
ok((await ev(`document.getElementById('stampCamHint').textContent`)).includes('이미 12'), '이제는 「사진번호 칸에 이미 12」 안내');

/* ── 2. 기본 카메라 + 번호 (파일 받아 스탬프) ───────────────── */
console.log('\n[2] 기본 카메라 + 번호');
const r1 = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#stampNativeInput')` });
await cdp.send('DOM.setFileInputFiles', { files: [ROOT + 'test-fixtures/plan.png'], objectId: r1.result.objectId });
ok(await waitFor(`__markerDbg.getActiveDrawing().markers[0].photos.length===3`), '기본 카메라 사진에도 번호를 찍어 붙인다');
eq((await settings()).current, 15, '번호 15');
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
await waitFor(`__markerDbg.getActiveDrawing().markers[0].photos.length===4`);
eq(await ev(`(()=>{const m=__markerDbg.getActiveDrawing().markers[0];return m.rptTag||m.eqTag})()`), '15', '빈 사진번호 칸에 15');
await ev(`document.querySelector('.sc-ov [data-sc="close"]').click(); document.getElementById('btnPhotoModalClose').click(); true`);

/* ── 4. 스탬프 카메라 앱을 열면 번호가 이어진다 ─────────────── */
console.log('\n[4] 스탬프 카메라 앱과 번호 공유');
await cdp.send('Page.navigate', { url: STAMP });
await sleep(2500);
const stampNext = await ev(`(document.getElementById('nextText')||{}).textContent||''`);
ok(stampNext.includes('0016'), '스탬프 카메라 앱의 다음 번호 = 0016', stampNext);
eq((await shotsInList()).length, 4, '스탬프 카메라 목록에 결함마킹에서 찍은 4장');

/* ── 5. 스탬프 카메라 앱이 떠 있는 동안 다른 곳(결함마킹)에서 번호가 오르면 곧바로 따라간다 (v1.8.0) ── */
console.log('\n[5] 떠 있는 스탬프 카메라가 바뀐 번호를 따라감');
await ev(`(async()=>{const f=document.createElement('iframe');f.src='/defect-marker-stampcam/manifest.json';document.body.appendChild(f);
  await new Promise(r=>f.onload=r);
  const s=JSON.parse(f.contentWindow.localStorage.getItem('stampcam.settings.v1')); s.current=40; s.memo='다른 앱 메모';
  f.contentWindow.localStorage.setItem('stampcam.settings.v1', JSON.stringify(s)); return true})()`);
ok(await waitFor(`document.getElementById('nextText').textContent==='0040'`, 3000), '다른 문서에서 번호를 40 으로 → 스탬프 카메라 화면도 0040', await ev(`document.getElementById('nextText').textContent`));
ok(await waitFor(`document.getElementById('memoText').textContent==='다른 앱 메모'`, 3000), '메모도 따라감');
ok(await ev(`document.getElementById('btnUndo').disabled`), '남이 올린 번호는 되돌리기로 되감지 않는다(되돌리기 비움)');

/* 콘솔 오류 */
const errs = cdp.events.filter((e) => e.method === 'Runtime.exceptionThrown' ||
  (e.method === 'Log.entryAdded' && e.params.entry.level === 'error' && !/favicon|ERR_FILE_NOT_FOUND|404/.test(e.params.entry.text)));
eq(errs.map((e) => (e.params.exceptionDetails ? e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text : e.params.entry.text)).slice(0, 3), [], '콘솔 오류 없음');

console.log(`\n통과 ${passes} / 실패 ${fails}`);
finish(cdp, fails ? 1 : 0);
