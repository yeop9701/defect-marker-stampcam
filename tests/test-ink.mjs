/* 손글씨 입력 검사 (ink/ink.js + index.html 의 손글씨 묶음).

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더> about:blank
     node tests/test-ink.mjs                (LIVE=1 이면 구글 필기 인식에 진짜로 한 번 보내 본다)

   필기는 CDP 의 진짜 마우스 입력으로 쓴다(포인터 이벤트 경로 그대로). 구글·Claude 변환은 기본으로는
   가짜 응답(fetch / AnthropicSDK 바꿔치기)으로 검사한다 — 인터넷·API 키 없이도 돌게.            */
import { connect, click, drag, finish } from './cdp.mjs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = fileURLToPath(new URL('./out/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:8125';
const APP = BASE + '/defect-marker-stampcam/index.html';

const cdp = await connect(Number(process.env.CDP_PORT || 9223));
const ev = (s) => cdp.evaluate(s);
let fails = 0, passes = 0;
const ok = (cond, msg, extra) => {
  if (cond) passes++; else fails++;
  console.log((cond ? '  OK   ' : '  FAIL ') + msg + (!cond && extra !== undefined ? '  → ' + JSON.stringify(extra) : ''));
};
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg, { 실제: a, 바람: b });
const waitFor = async (expr, ms = 6000) => {
  for (let t = 0; t < ms; t += 100) { if (await ev(expr).catch(() => false)) return true; await sleep(100); }
  return false;
};
const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT + name, Buffer.from(data, 'base64'));
};
const M = (i = 0) => `__markerDbg.getActiveDrawing().markers[${i}]`;
const padRect = (k) => ev(`(()=>{const b=document.querySelector('#quickInputFields .ink-box[data-k="${k}"] .ink-pad');
  if(!b) return null; const r=b.getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height};})()`);
/* 상자 안 비율 좌표(0~1)로 획 하나 */
const stroke = async (r, pts) => drag(cdp, pts.map(([u, v]) => ({ x: r.x + u * r.w, y: r.y + v * r.h })), { steps: 6 });
/* 글자 비슷한 꼬부랑 (글자 칸) */
const scribble = async (r) => {
  await stroke(r, [[0.1, 0.3], [0.2, 0.7], [0.3, 0.3], [0.4, 0.7]]);
  await stroke(r, [[0.5, 0.3], [0.6, 0.7], [0.7, 0.4]]);
};
/* 숫자 「1」 — 높이 있는 세로 획 하나 (첫 칸 쪽에) */
const one = (r, u = 0.2) => stroke(r, [[u, 0.15], [u, 0.75]]);
/* 숫자 「0」 — 타원 */
const zero = (r, u = 0.45) => {
  const pts = [];
  for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2 - Math.PI / 2; pts.push([u + 0.06 * Math.cos(a), 0.45 + 0.3 * Math.sin(a)]); }
  return stroke(r, pts);
};

await cdp.send('DOM.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

/* ── 0. 준비 : 태블릿 모드 고정, 손글씨 켬, 도면 한 장 ── */
console.log('\n[0] 준비');
await cdp.send('Page.navigate', { url: APP });
await sleep(1500);
await ev(`localStorage.clear(); localStorage.setItem('defectMarkerTabletMode_v1','on'); true`);
await cdp.send('Page.navigate', { url: APP });
await sleep(1800);
ok(await ev('!!window.Ink && !!window.InkDigitsModel'), 'ink.js · digits-model.js 를 불러왔다');
ok(await ev(`document.body.classList.contains('layout-tablet')`), '태블릿 모드');
ok(await ev('__markerDbg.ink.isInkInputOn()'), '손글씨 입력은 처음부터 켜져 있다');
eq(await ev(`document.getElementById('inkStateLabel').textContent`), '켬', '설정 메뉴 표시 「손글씨 입력: 켬」');
const r0 = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#addDrawingInput')` });
await cdp.send('DOM.setFileInputFiles', { files: [ROOT + 'test-fixtures/plan.png'], objectId: r0.result.objectId });
await sleep(1400);
const cv = await ev(`(()=>{const r=document.getElementById('mainCanvas').getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};})()`);

/* ── 1. 결함을 찍으면 칸마다 필기 상자 ── */
console.log('\n[1] 필기 상자');
await click(cdp, cv.x + cv.w * 0.35, cv.y + cv.h * 0.3); await sleep(500);
eq(await ev('__markerDbg.getActiveDrawing().markers.length'), 1, '결함 하나를 찍었다');
ok(await waitFor(`document.getElementById('quickInputSheet').style.display!=='none'`), '퀵입력 시트가 열린다');
ok(await ev(`document.getElementById('quickInputSheet').classList.contains('ink-mode')`), '시트가 손글씨 모드');
const keys = await ev(`[...document.querySelectorAll('#quickInputFields .ink-box')].map(b=>b.dataset.k)`);
eq(keys, ['rptType', 'rptMember', 'rptDefect', 'rptWidth', 'rptLength', 'rptCount', 'rptTag'], '외관 결함 7칸 모두 필기 상자');
const kinds = await ev(`[...document.querySelectorAll('#quickInputFields .ink-box')].map(b=>b.className.replace('ink-box ',''))`);
eq(kinds, ['ink-text', 'ink-text', 'ink-text', 'ink-num', 'ink-num', 'ink-int', 'ink-int'], '글자 칸 3 · 숫자 칸 4');
const rType = await padRect('rptType');
ok(rType && rType.h >= 100 && rType.w >= 250, '글자 칸 필기 자리가 크다(높이 100px 이상)', rType);
const rW = await padRect('rptWidth');
ok(rW && rW.h >= 85, '숫자 칸 필기 자리', rW);
ok(await ev(`(()=>{const s=document.getElementById('quickInputSheet').getBoundingClientRect();return s.right<=innerWidth+1 && s.left>=-1})()`), '시트가 화면 밖으로 넘치지 않는다');
await shot('ink-1-sheet.png');

/* ── 2. 글자 칸 : 글씨 그대로 저장, 변환 대기 ── */
console.log('\n[2] 글자 칸에 쓰기');
await ev(`window.__fetchLog=[]; window.__realFetch=window.__realFetch||window.fetch;
  window.fetch=(u,o)=>{ if(String(u).includes('inputtools.google.com')){ __fetchLog.push(JSON.parse(o.body)); return Promise.reject(new TypeError('Failed to fetch')); } return __realFetch(u,o); }; true`);
await scribble(rType);
ok(await waitFor(`!!(${M()}.ink && ${M()}.ink.rptType)`, 3000), '펜을 떼고 잠깐 뒤 글씨가 결함에 저장된다');
const e1 = await ev(`${M()}.ink.rptType`);
eq(e1.st, 'pending', '글자 칸은 「변환 대기」');
eq(e1.s.length, 2, '획 두 개 그대로');
ok(e1.w > 200 && e1.h > 80 && e1.s[0].length >= 8, '획 좌표·상자 크기를 같이 저장', { w: e1.w, h: e1.h });
eq(await ev(`${M()}.rptType||''`), '', '값은 아직 비어 있다');
eq(await ev(`document.querySelector('.ink-box[data-k="rptType"] .ink-status').textContent`), '변환 대기', '상자에 「변환 대기」 표시');
ok(await ev(`!!document.querySelector('#markerTable input.ink-only[data-role="rptType"]')`), '결함 목록 카드 칸에 글씨 그림이 보인다');
ok(await ev(`document.querySelector('#markerTable input.ink-only[data-role="rptType"]').style.backgroundImage.startsWith('url("data:image/png')`), '  → 칸 배경이 글씨 그림');
eq(await ev(`document.getElementById('inkFloatBadge').textContent`), '1', '떠 있는 ✎ 단추에 변환 대기 1');
/* 자동 변환이 인터넷 오류를 만나면 대기 그대로 */
await sleep(2200);
ok(await ev('__fetchLog.length') >= 1, '자동 변환이 구글로 보내 본다(인터넷 되면)');
eq(await ev(`${M()}.ink.rptType.st`), 'pending', '인터넷 오류면 「변환 대기」 그대로(실패로 만들지 않는다)');
const sent = await ev('__fetchLog[0]');
eq(sent.requests[0].language, 'ko', '구글 요청 : 한국어');
ok(Array.isArray(sent.requests[0].ink[0][0]) && sent.requests[0].ink.length === 2, '구글 요청 : 획마다 [xs, ys]');
await ev(`window.fetch=__realFetch; Ink.saveSettings({auto:false}); true`);
/* 이어 쓰기 : 같은 칸에 한 획 더 → 획 셋, 여전히 대기 */
await stroke(rType, [[0.8, 0.3], [0.8, 0.7]]);
ok(await waitFor(`${M()}.ink.rptType.s.length===3`, 3000), '같은 칸에 이어 쓰면 획이 더해진다');

/* ── 3. 숫자 칸 : 앱 안에서 바로 읽기 ── */
console.log('\n[3] 숫자 칸');
const rCount = await padRect('rptCount');
await one(rCount, 0.3);
ok(await waitFor(`!!(${M()}.ink && ${M()}.ink.rptCount)`, 3000), '숫자 칸 글씨 저장');
const c1 = await ev(`({v:${M()}.rptCount, e:${M()}.ink.rptCount})`);
eq(c1.e.st, 'done', '숫자 칸은 바로 「변환됨」');
eq(c1.e.eng, 'digits', '  → 앱 안 숫자 인식');
eq(c1.v, '1', '세로 획 하나 → 1');
await ev(`document.querySelector('.ink-box[data-k="rptCount"] .ink-clear').click(); true`);
await sleep(200);
ok(await ev(`!${M()}.ink.rptCount && !${M()}.rptCount`), '✕ 로 그 칸 글씨·값을 지운다');
/* 「10」 */
const rTag = await padRect('rptTag');
await one(rTag, 0.25); await zero(rTag, 0.45);
ok(await waitFor(`${M()}.ink && ${M()}.ink.rptTag && ${M()}.ink.rptTag.s.length===2`, 3000), '사진# 에 두 획');
const tag = await ev(`${M()}.rptTag`);
eq(tag, '10', '「1」「0」 → 10');
/* 소수점 : 1 . 0 → 1.0 (점은 아래쪽 작은 획) */
await one(rW, 0.2);
await stroke(rW, [[0.3, 0.72], [0.305, 0.73]]);
await zero(rW, 0.42);
ok(await waitFor(`${M()}.ink && ${M()}.ink.rptWidth && ${M()}.ink.rptWidth.s.length===3`, 3000), '폭에 세 획(1 · 점 · 0)');
eq(await ev(`${M()}.rptWidth`), '1.0', '아래쪽 작은 점은 소수점 → 1.0');
/* 직접 친 값이 이긴다 */
await ev(`(()=>{const i=document.querySelector('.ink-box[data-k="rptWidth"] .ink-val'); i.value='0.3'; i.dispatchEvent(new Event('change')); return true})()`);
eq(await ev(`[${M()}.rptWidth, ${M()}.ink.rptWidth.eng, ${M()}.ink.rptWidth.s.length]`), ['0.3', 'manual', 3], '칸에 직접 고치면 값은 바뀌고 글씨 원본은 남는다');
await shot('ink-2-written.png');

/* ── 4. 숫자 인식 단독 (모델 정확도 맛보기) ── */
console.log('\n[4] 숫자 인식기');
const synth = await ev(`(()=>{
  const out = {};
  const font = '72px sans-serif';
  // 글꼴로 그린 숫자의 윤곽을 따라 획을 만들기는 어려우니, 모델 자체는 글꼴 그림으로 시험한다
  for (let d = 0; d < 10; d++) {
    const c = document.createElement('canvas'); c.width = c.height = 112;
    const x = c.getContext('2d'); x.fillStyle='#000'; x.fillRect(0,0,112,112);
    x.fillStyle='#fff'; x.font = font; x.textAlign='center'; x.textBaseline='middle'; x.fillText(String(d), 56, 60);
    const D = x.getImageData(0,0,112,112).data;
    let x0=112,y0=112,x1=0,y1=0;
    for(let y=0;y<112;y++)for(let xx=0;xx<112;xx++) if(D[(y*112+xx)*4]>40){ if(xx<x0)x0=xx; if(xx>x1)x1=xx; if(y<y0)y0=y; if(y>y1)y1=y; }
    const side=Math.max(x1-x0,y1-y0)+1, sc=20/side;
    const c2=document.createElement('canvas'); c2.width=c2.height=28; const y2=c2.getContext('2d');
    y2.fillStyle='#000'; y2.fillRect(0,0,28,28);
    y2.drawImage(c, x0, y0, x1-x0+1, y1-y0+1, 14-(x1-x0+1)*sc/2, 14-(y1-y0+1)*sc/2, (x1-x0+1)*sc, (y1-y0+1)*sc);
    const E = y2.getImageData(0,0,28,28).data, img = new Float32Array(784);
    for(let i=0;i<784;i++) img[i]=E[i*4]/255;
    const r = Ink.classify(img); out[d] = r ? r.digit : null;
  }
  return out;
})()`);
const hit = Object.entries(synth).filter(([d, p]) => String(d) === String(p)).length;
ok(hit >= 8, `글꼴 숫자 0~9 중 ${hit}개를 맞힌다(8개 이상)`, synth);

/* ── 5. 다음 결함 · 이어받기 · ◀ ▶ ── */
console.log('\n[5] 결함 넘기기 · 이어받기');
await ev(`__markerDbg.ink.hideQuickInputSheet(); true`);
await click(cdp, cv.x + cv.w * 0.6, cv.y + cv.h * 0.3); await sleep(500);
eq(await ev('__markerDbg.getActiveDrawing().markers.length'), 2, '두 번째 결함');
const carried = await ev(`${M(1)}.ink && ${M(1)}.ink.rptType`);
ok(carried && carried.s.length === 3 && carried.st === 'pending', '분류 칸(부재)은 아직 글자가 아니면 글씨째 이어받는다');
ok(!(await ev(`${M(1)}.ink && ${M(1)}.ink.rptTag`)), '실측값(사진#)은 이어받지 않는다');
ok(await ev(`document.querySelector('.ink-box[data-k="rptType"]').classList.contains('has-ink')`), '두 번째 결함의 부재 상자에 이어받은 글씨가 그려져 있다');
await ev(`document.getElementById('btnQuickInputPrev').click(); true`);
await sleep(300);
eq(await ev(`__markerDbg.ink.quickInputMarkerId === ${M(0)}.id`), true, '◀ 앞 → 첫 결함으로');
eq(await ev(`document.querySelector('.ink-box[data-k="rptTag"] .ink-val').value`), '10', '  → 첫 결함 값이 상자에 보인다');
await ev(`document.getElementById('btnQuickInputNext').click(); true`);
await sleep(300);
eq(await ev(`__markerDbg.ink.quickInputMarkerId === ${M(1)}.id`), true, '다음 ▶ → 두 번째 결함');
await ev(`__markerDbg.ink.hideQuickInputSheet(); true`);
await ev(`document.getElementById('btnFloatInk').click(); true`);
ok(await waitFor(`document.getElementById('quickInputSheet').style.display!=='none' && __markerDbg.ink.quickInputMarkerId===${M(1)}.id`), '떠 있는 ✎ → 고른(마지막) 결함의 필기 상자');
await ev(`__markerDbg.ink.hideQuickInputSheet(); true`);

/* ── 6. 저장 · 다시 열기 ── */
console.log('\n[6] 저장');
const snap = await ev(`JSON.stringify(__markerDbg.buildProjectMetaSnapshot())`);
ok(snap.includes('"ink"') && snap.includes('"pending"'), '프로젝트·자동저장에 손글씨가 같이 실린다');
await ev(`(async()=>{ const d = JSON.parse(JSON.stringify(__markerDbg.buildProjectSnapshot())); __markerDbg.getActiveDrawing().markers.forEach(m=>{ delete m.ink; }); await __markerDbg.applyProjectData(d); return true })()`);
await sleep(600);
ok(await ev(`!!(${M()}.ink && ${M()}.ink.rptType && ${M()}.ink.rptType.s.length===3)`), '다시 열어도 글씨 원본이 그대로');

/* ── 7. 손글씨 변환 창 : 구글(가짜 응답) ── */
console.log('\n[7] 변환 (구글)');
await ev(`window.__gCalls=0; window.fetch=(u,o)=>{ if(String(u).includes('inputtools.google.com')){ __gCalls++;
  return Promise.resolve(new Response(JSON.stringify(['SUCCESS',[['x',['벽체','벽제','벽']]]]),{status:200})); } return __realFetch(u,o); }; true`);
await ev(`__markerDbg.ink.openInkConvert(); true`);
ok(await waitFor(`document.getElementById('inkConvertBackdrop').style.display==='flex'`), '「손글씨 변환」 창이 열린다');
const rows = await ev(`document.querySelectorAll('#inkCvList .ink-cv-row').length`);
eq(rows, 2, '변환할 것 = 부재 칸 둘(이어받은 같은 글씨 포함)');
ok(await ev(`[...document.querySelectorAll('#inkCvList .ink-cv-img')].every(i=>i.src.startsWith('data:image/png'))`), '원본 글씨 그림이 나란히 보인다');
ok((await ev(`document.getElementById('btnInkConvertRun').textContent`)).includes('2칸'), '「변환하기 (2칸)」');
await shot('ink-3-convert-before.png');
await ev(`document.getElementById('btnInkConvertRun').click(); true`);
ok(await waitFor(`${M()}.rptType==='벽체' && ${M(1)}.rptType==='벽체'`), '변환 → 두 결함 부재 = 벽체');
eq(await ev('__gCalls'), 1, '같은 글씨는 한 번만 보낸다');
const e7 = await ev(`${M()}.ink.rptType`);
eq([e7.st, e7.eng, e7.text, e7.s.length], ['done', 'google', '벽체', 3], '글씨 원본은 남고 변환 기록이 붙는다');
eq(e7.alts, ['벽제', '벽'], '다른 후보도 남긴다');
await ev(`document.querySelector('input[name="inkCvFilter"][value="all"]').click(); true`);
await sleep(200);
{ const r = await ev(`[...document.querySelectorAll('#inkCvList .ink-cv-row .ink-cv-where b')].map(b=>b.textContent.replace(/^#\d+\s*/,''))`);
  ok(r.length === 4 && r.some(t=>t.includes('사진 #')) && r.some(t=>t.includes('폭')), '「손글씨 전부」 = 4칸(부재 둘 · 사진# · 폭, ✕ 로 지운 개수는 빠짐) — 숫자 칸도 원본과 비교', r); }
/* 후보 단추로 고치기 */
const altBtn = await ev(`(()=>{const row=[...document.querySelectorAll('#inkCvList .ink-cv-row')].find(r=>r.textContent.includes('부재')); const b=[...row.querySelectorAll('.ink-cv-alts button')].find(b=>b.textContent==='벽제'); if(!b) return false; b.click(); return true})()`);
ok(altBtn, '후보 단추가 있다');
eq(await ev(`[${M()}.rptType, ${M()}.ink.rptType.eng]`), ['벽제', 'manual'], '후보를 누르면 그 글자로(직접 고침으로 기록)');
ok(!(await ev(`!!document.querySelector('#markerTable input.ink-only[data-role="rptType"]')`)), '글자가 생기면 카드의 글씨 그림은 빠진다');
await shot('ink-4-convert-after.png');
await ev(`__markerDbg.ink.closeInkConvert(); true`);

/* ── 8. Claude (가짜 SDK) ── */
console.log('\n[8] 변환 (Claude)');
await ev(`__markerDbg.ink.openQuickInputSheetFor(${M(1)}); true`);
await sleep(300);
const rMem = await padRect('rptMember');
await scribble(rMem);
ok(await waitFor(`!!(${M(1)}.ink && ${M(1)}.ink.rptMember)`, 3000), '두 번째 결함 자재 칸에 손글씨');
await ev(`__markerDbg.ink.hideQuickInputSheet(); true`);
await ev(`(()=>{
  window.__claudeReq = null;
  class APIError extends Error {}
  class FakeAnthropic { constructor(o){ this.o=o; this.beta={ messages:{ create: async (req)=>{ window.__claudeReq={req, opts:this.o};
      return { stop_reason:'end_turn', content:[{type:'text', text: JSON.stringify({results:[{id:'1', text:'콘크리트'}]})}] }; } } }; } }
  FakeAnthropic.AuthenticationError = class extends APIError {};
  FakeAnthropic.APIConnectionError = class extends APIError {};
  FakeAnthropic.RateLimitError = class extends APIError {};
  FakeAnthropic.InternalServerError = class extends APIError {};
  window.AnthropicSDK = FakeAnthropic;
  Ink.saveSettings({ engine:'claude', apiKey:'' });
  return true; })()`);
await ev(`__markerDbg.ink.openInkConvert(); true`);
ok(await ev(`document.getElementById('inkCvKeyRow').style.display!=='none'`), 'Claude 를 고르면 API 키 칸이 보인다');
await ev(`document.getElementById('btnInkConvertRun').click(); true`);
await sleep(300);
eq(await ev(`${M(1)}.ink.rptMember.st`), 'pending', '키가 없으면 보내지 않는다');
await ev(`(()=>{const i=document.getElementById('inkCvApiKey'); i.value='sk-ant-test'; i.dispatchEvent(new Event('change')); return true})()`);
eq(await ev(`Ink.loadSettings().apiKey`), 'sk-ant-test', 'API 키는 이 브라우저에 저장');
await ev(`document.getElementById('btnInkConvertRun').click(); true`);
ok(await waitFor(`${M(1)}.rptMember==='콘크리트'`), 'Claude 변환 → 자재 = 콘크리트');
const req = await ev(`(()=>{const r=__claudeReq; return {model:r.req.model, sys:r.req.system, n:r.req.messages[0].content.filter(c=>c.type==='image').length,
  label:r.req.messages[0].content[0].text, fmt:r.req.output_config.format.type, browser:r.opts.dangerouslyAllowBrowser, key:r.opts.apiKey}})()`);
eq(req.model, 'claude-opus-5-5', 'Claude 모델');
eq(req.n, 1, '글씨 그림 한 장');
ok(req.label.includes('자재'), '칸 이름을 같이 알려 준다', req.label);
ok(req.sys.includes('벽제'), '현장에서 쓴 말(목록·입력값)을 참고 말로 보낸다');
eq(req.fmt, 'json_schema', '결과는 JSON 형식으로 받는다');
eq([req.browser, req.key], [true, 'sk-ant-test'], '브라우저에서 키로 바로 부른다');
eq(await ev(`${M(1)}.ink.rptMember.eng`), 'claude', '변환 기록 = claude');
await ev(`__markerDbg.ink.closeInkConvert(); Ink.saveSettings({engine:'google'}); true`);

/* ── 9. 내보내기 경고 · 손글씨 끔 ── */
console.log('\n[9] 내보내기 · 끄기');
await ev(`__markerDbg.ink.openQuickInputSheetFor(${M(1)}); true`);
await sleep(300);
await scribble(await padRect('rptDefect'));
ok(await waitFor(`!!(${M(1)}.ink && ${M(1)}.ink.rptDefect)`, 3000), '결함 칸에 손글씨(변환 안 함)');
await ev(`__markerDbg.ink.hideQuickInputSheet(); window.__toasts=[]; const _st=document.querySelector('.app-toast-stack'); if(_st) _st.innerHTML=''; true`);
await ev(`document.getElementById('btnExportCSV') ? document.getElementById('btnExportCSV').click() : null; true`);
await sleep(400);
const toast = await ev(`(document.querySelector('.app-toast-stack')||{}).textContent||''`);
ok(toast.includes('손글씨 1칸'), '내보낼 때 아직 글자가 아닌 칸을 알려 준다', toast);
await ev(`document.getElementById('btnInkToggle').click(); true`);
eq(await ev(`[__markerDbg.ink.isInkInputOn(), document.getElementById('inkStateLabel').textContent]`), [false, '끔'], '「손글씨 입력: 끔」');
await ev(`__markerDbg.ink.openQuickInputSheetFor(${M(1)}); true`);
await sleep(300);
ok(await ev(`!document.getElementById('quickInputSheet').classList.contains('ink-mode') && !!document.querySelector('#quickInputFields select')`), '끄면 퀵입력이 예전 목록·자판 칸으로');
await ev(`__markerDbg.ink.hideQuickInputSheet(); document.getElementById('btnInkToggle').click(); true`);

/* ── 10. 진짜 구글 (LIVE=1) ── */
if (process.env.LIVE) {
  console.log('\n[10] 구글 필기 인식 실제 호출');
  await ev(`window.fetch=__realFetch; true`);
  const live = await ev(`(async()=>{ try{ const r = await Ink.googleOne(${M()}.ink.rptType); return r; } catch(e){ return {err:String(e)} } })()`);
  ok(live && !live.err && typeof live.text === 'string', '구글 필기 인식이 응답한다(브라우저에서, CORS 포함)', live);
  console.log('  (꼬부랑 글씨 → ' + JSON.stringify(live) + ')');
}

const errs = await ev(`(window.__errs||[]).length`).catch(() => 0);
console.log(`\n${passes} 통과, ${fails} 실패`);
finish(cdp, fails ? 1 : 0);
