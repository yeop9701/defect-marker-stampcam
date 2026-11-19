/* 2026-11-18 네 번째 요청 검사 — 실제 브라우저(태블릿 모드).
   ① 퀵입력의 위치가 결함 목록에 빠짐없이 들어온다 (손글씨 변환 중 쓴 글씨 · 이어받은 글씨 · 자판)
   ② 카드의 ⓘ : 카메라와 ✕ 사이, 손글씨 + 카메라 메모를 한 창에서
   ③ 엑셀 「손글씨」 시트 : 제목별 칸에 글씨 그림
   ④ 사진 ZIP 이름에 층수·위치  ⑤ 표로 입력 15칸  ⑥ 유형 칸 짧은 이름

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더> about:blank
     node tests/test-1118d.mjs                                                       */
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
const ok = (cond, msg, extra) => {
  if (cond) passes++; else fails++;
  console.log((cond ? '  OK   ' : '  FAIL ') + msg + (!cond && extra !== undefined ? '  → ' + JSON.stringify(extra) : ''));
};
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg, { 실제: a, 바람: b });
const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT + name, Buffer.from(data, 'base64'));
};
const D = '__markerDbg.getActiveDrawing()';
const I = '__markerDbg.info';

await cdp.send('DOM.enable');
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

const fakeGoogle = (ms) => `window.__n=0; window.__of=window.__of||window.fetch; window.fetch=(u,o)=>{ if(String(u).includes('inputtools')){ const n=++window.__n; return new Promise(r=>setTimeout(()=>r(new Response(JSON.stringify(['SUCCESS',[['x',['위치'+n]]]]),{status:200})),${ms})); } return window.__of(u,o); }; true`;
async function boot(inkOn) {
  await cdp.send('Page.navigate', { url: APP }); await sleep(900);
  await ev(`localStorage.clear(); localStorage.setItem('defectMarkerTabletMode_v1','on'); localStorage.setItem('defectMarkerFoldDone_v1','off'); /* 카드 칸을 보는 검사라 「완료 접기」는 끈다 */ localStorage.setItem('defectMarkerInk_v1', JSON.stringify({on:${inkOn},engine:'google',auto:true})); true`);
  await cdp.send('Page.navigate', { url: APP }); await sleep(1500);
  const r0 = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#addDrawingInput')` });
  await cdp.send('DOM.setFileInputFiles', { files: [ROOT + 'test-fixtures/plan.png'], objectId: r0.result.objectId });
  /* 이 검사는 층수·위치를 손글씨 칸으로 쓰던 예전 배치를 본다 — 층수·위치 목록(11-19)은 끄고 본다. 목록이 있을 때는 tests/test-1119e.mjs */
  await ev(`window.LocationTaxonomy = null; true`);
  await sleep(1200);
}
const tapXY = async (x, y) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await sleep(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(450);
};
// 시트에 가리지 않고 다른 마커와 떨어진 도면 위 한 점을 눌러 결함을 찍는다
const tapNew = async () => {
  const p = await ev(`(()=>{const c=document.getElementById('mainCanvas'),r=c.getBoundingClientRect(),d=${D};for(let j=1;j<12;j++)for(let i=1;i<16;i++){const x=Math.round(r.left+r.width*i/16),y=Math.round(r.top+r.height*j/12);if(x<0||y<0||x>=innerWidth||y>=innerHeight)continue;if(document.elementFromPoint(x,y)!==c)continue;if(d.markers.some(m=>Math.hypot(r.left+r.width*m.xPct/100-x,r.top+r.height*m.yPct/100-y)<110))continue;return {x,y}}return null})()`);
  if (!p) throw new Error('찍을 자리가 없다');
  await tapXY(p.x, p.y); await sleep(250);
};
const closeSheet = async () => { await ev(`document.getElementById('btnQuickInputClose').click(); true`); await sleep(150); };
const write = (k, dx = 0) => ev(`(()=>{const c=document.querySelector('.ink-box[data-k=${k}] canvas');const r=c.getBoundingClientRect();const f=(t,x,y)=>c.dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,pointerId:7,pointerType:'pen',button:0,clientX:x,clientY:y}));const X=r.left+30+${dx},Y=r.top+30;f('pointerdown',X,Y);for(let i=1;i<8;i++)f('pointermove',X+i*5,Y+i*3);f('pointerup',X+40,Y+24);return 1})()`);
const locs = () => ev(`${D}.markers.map(m=>({v:m.rptLoc||'',strokes:m.ink&&m.ink.rptLoc?m.ink.rptLoc.s.length:0,st:m.ink&&m.ink.rptLoc?m.ink.rptLoc.st:null,card:(document.querySelector('.marker-card[data-id="'+m.id+'"] [data-role=rptLoc]')||{}).value}))`);
const until = async (fn, ms = 9000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(200); } return false; };

/* ══ ① 위치 ══ */
console.log('\n[1] 위치 — 손글씨');
await boot(true);
await ev(fakeGoogle(2500));
await tapNew(); await write('rptLoc'); await sleep(1100);
await sleep(1000);                       // 변환 시작(글씨 뒤 1.5초) — 응답을 기다리는 중
await closeSheet(); await tapNew();
let L = await locs();
eq([L.length, L[1].strokes, L[1].st], [2, 1, 'pending'], '변환 중 찍은 #2 는 글씨를 이어받는다');
ok(await until(async () => (await locs())[1].v !== ''), '이어받기만 한 #2 도 저절로 글자로 바뀐다', await locs());
L = await locs();
eq(L.map(x => x.card), L.map(x => x.v), '결함 목록 칸에 값이 그대로 보인다');

await boot(true);
await ev(fakeGoogle(4000));
await tapNew(); await write('rptLoc'); await sleep(1100);
await closeSheet(); await tapNew();
await write('rptLoc', 20); await sleep(1100);
L = await locs();
eq(L[1].strokes, 1, '이어받은 글씨 위에 쓰면 겹치지 않고 새 글씨만 남는다');
ok(await until(async () => (await locs()).every(x => x.v), 14000), '변환이 도는 중에 쓴 #2 도 끝나면 글자로 바뀐다', await locs());
L = await locs();
ok(L[0].v !== L[1].v, '#1·#2 는 각자의 글씨로 바뀐다', L);

console.log('\n[1] 위치 — 자판');
await boot(false);
await tapNew();
await ev(`document.querySelector('#quickInputFields [data-qis=rptLoc]').focus(); true`);
await cdp.send('Input.insertText', { text: '거실' }); await sleep(80);
eq((await locs())[0].card, '거실', '치는 동안에도 결함 목록 칸에 바로 보인다');
await tapNew();
L = await locs();
eq([L[0].v, L[0].card], ['거실', '거실'], '칸에 커서를 둔 채 다음 결함을 찍어도 앞 결함에 남는다');
await ev(`document.querySelector('#quickInputFields [data-qis=rptLoc]').focus(); true`); await sleep(50);
await cdp.send('Input.insertText', { text: '안방' }); await sleep(80);
await closeSheet();
L = await locs();
eq(L.map(x => x.v), ['거실', '안방'], '이어받은 값 칸에 치면 뒤에 붙지 않고 바뀐다');
eq(L.map(x => x.card), ['거실', '안방'], '닫으면 두 칸 모두 목록에 맞다');

/* ══ ②③④⑥ 준비 ══ */
await boot(true);
await ev(`(()=>{const d=${D}; d.markers=[
  {id:'a',uid:'aaaaaaaa11',typeKey:'wall_area',xPct:20,yPct:30,angle:0,rectXPct:10,rectYPct:20,rectWPct:8,rectHPct:6,rptFloor:'지상3층',rptLoc:'거실',rptType:'벽체',rptMember:'콘크리트',rptDefect:'균열/백태',rptWidth:'0.3',rptLength:'500',rptCount:'1',rptTag:'12'},
  {id:'b',uid:'bbbbbbbb22',typeKey:'flat',xPct:50,yPct:30,angle:0,rptFloor:'지하1층',rptLoc:'주차장',rptType:'천장'},
  {id:'c',uid:'cccccccc33',typeKey:'wall',xPct:70,yPct:30,angle:0}];
  const s=(x)=>[[10+x,10,30+x,30,50+x,12],[20+x,40,60+x,42]];
  d.markers[0].ink={rptLoc:{w:300,h:112,s:s(0),st:'done',eng:'google',text:'거실'},rptWidth:{w:200,h:118,s:s(5),st:'done',eng:'digits',text:'0.3',conf:.9}};
  d.markers[1].ink={rptLoc:{w:300,h:112,s:s(9),st:'pending'}};
  __markerDbg.renderCanvas(); __markerDbg.renderTable(); return true})()`);
await ev(`document.getElementById('btnDrawerRight').click(); true`); await sleep(700);

console.log('\n[2] ⓘ 단추');
const order = await ev(`[...document.querySelector('.marker-card').children].slice(-3).map(e=>e.dataset.role)`);
eq(order, ['photo', 'info', 'del'], '순서 : 카메라 → ⓘ → ✕');
const g = await ev(`(()=>{const c=document.querySelector('.marker-card'),r=s=>c.querySelector(s).getBoundingClientRect();const p=r('[data-role=photo]'),i=r('[data-role=info]'),x=r('[data-role=del]');return {붙음:Math.round(i.left-p.right),같은줄:Math.abs(p.top-i.top)<2&&Math.abs(i.top-x.top)<2,폭:Math.round(i.width),높이:Math.round(i.height),끝:Math.round(x.right)<=Math.round(c.getBoundingClientRect().right)}})()`);
ok(g.같은줄 && g.붙음 >= 0 && g.붙음 <= 8 && g.폭 >= 30 && g.높이 >= 36 && g.끝, 'ⓘ 가 카메라 바로 옆, 같은 줄, 누르기 충분한 크기', g);
eq(await ev(`[...document.querySelectorAll('.marker-card [data-role=info]')].map(b=>b.classList.contains('has'))`), [true, true, false], '손글씨·메모가 있는 결함만 ⓘ 에 색');
// 사진 + 메모
await ev(`(()=>{const c=document.createElement('canvas');c.width=320;c.height=240;const x=c.getContext('2d');x.fillStyle='#39a';x.fillRect(0,0,320,240);
  ${I}.attachStampShot('a',{canvas:c,number:12,numberText:'0012',memo:'지상3층 거실 북측벽',at:Date.UTC(2026,10,18,5,0)},{});
  x.fillStyle='#a93';x.fillRect(0,0,320,240);
  ${I}.attachStampShot('a',{canvas:c,number:13,numberText:'0013',memo:'',at:Date.UTC(2026,10,18,5,1)},{}); return true})()`); await sleep(200);
await ev(`document.querySelector('.marker-card[data-id=a] [data-role=info]').click(); true`);   // 층이 다르면 층별로 묶여 순서가 바뀐다(11-19) — 결함 a 의 카드 await sleep(250);
const info = () => ev(`({show:getComputedStyle(document.getElementById('markerInfoBackdrop')).display,title:document.getElementById('markerInfoTitle').textContent,ink:[...document.querySelectorAll('#markerInfoBody .mi-row:not(.shot)')].map(r=>[r.querySelector('.mi-label').textContent,r.querySelector('img').naturalWidth>0,r.querySelector('.mi-val').firstChild.textContent]),shots:[...document.querySelectorAll('#markerInfoBody .mi-row.shot')].map(r=>[r.querySelector('.mi-label').textContent,r.querySelector('.mi-val').textContent,r.querySelector('img').naturalWidth>0])})`);
let v = await info();
eq(v.show, 'flex', '누르면 창이 열린다');
eq(v.ink, [['위치', true, '거실'], ['폭(mm)', true, '0.3']], '쓴 손글씨가 칸 이름·그림·바뀐 글자로 보인다');
eq(v.shots, [['0012', '지상3층 거실 북측벽', true], ['0013', '메모 없음', true]], '카메라 메모가 사진·번호와 함께 보인다');
await shot('1118d-info.png');
await ev(`document.getElementById('btnMarkerInfoClose').click(); true`); await sleep(100);
// 저장했다 열어도 / 사진을 지우면
const rt = await ev(`(()=>{const s=JSON.parse(JSON.stringify(__markerDbg.buildProjectSnapshot())); const m=s.drawings[0].markers[0]; return Object.values(m.photoMeta).map(x=>x.memo)})()`);
eq(rt, ['지상3층 거실 북측벽', ''], '프로젝트 저장 내용에 메모가 들어 있다');
await ev(`${D}.markers[0].photos.shift(); ${I}.openMarkerInfo('a'); true`); await sleep(150);
eq((await info()).shots, [['0013', '메모 없음', true]], '지운 사진의 메모는 보이지 않고 남은 사진과 어긋나지 않는다');
await ev(`${I}.closeMarkerInfo(); ${I}.openMarkerInfo('c'); true`); await sleep(100);
eq(await ev(`document.querySelectorAll('#markerInfoBody .mi-empty').length`), 2, '아무것도 없는 결함은 없다고 알려 준다');
await ev(`${I}.closeMarkerInfo(); true`);

console.log('\n[6] 유형 칸');
const ty = await ev(`__markerDbg.getActiveDrawing().markers.map(m=>document.querySelector('.marker-card[data-id="'+m.id+'"] select[data-role=type]')).map(s=>{const t=s.options[s.selectedIndex].textContent;const c=document.createElement('canvas').getContext('2d');const cs=getComputedStyle(s);c.font=cs.fontSize+' '+cs.fontFamily;return {t,fit:c.measureText(t).width<=s.clientWidth-16,title:s.title.split(' — ')[0]}})`);
eq(ty.map(x => x.t), ['수직(범위)', '수평', '수직'], '카드에는 짧은 이름');
ok(ty.every(x => x.fit), '짧은 이름이 칸 안에 다 들어간다', ty);
eq(ty.map(x => x.title), ['수직부재(범위)', '수평부재', '수직부재'], '전체 이름은 칸 설명(title)에 남는다');
ok((await ev(`${D}.markers.map(m=>m.typeKey).join()`)) === 'wall_area,flat,wall', '유형 값 자체는 그대로');
await shot('1118d-cards.png');

console.log('\n[3] 엑셀 손글씨 시트');
const x = await ev(`(()=>{const s=${I}.buildWorkbookSheets(); const k=s.find(a=>a.name==='손글씨'); return {names:s.map(a=>a.name),header:k.header,rows:k.rows.map(r=>r.cells),images:k.images.map(i=>[i.row,k.header[i.col],i.w<=124&&i.h<=46])}})()`);
eq(x.names, ['외관조사', '집계', '손글씨'], '시트가 하나 더 생긴다 (집계는 11-19)');
eq(x.header, ['도면', '번호', '유형', '층수', '위치', '부재', '자재', '결함', '폭(mm)', '길이(mm)', '개수', '사진 #'], '제목별 칸');
eq(x.rows.length, 2, '손글씨가 있는 결함만 줄이 된다');
eq(x.images, [[1, '위치', true], [1, '폭(mm)', true], [2, '위치', true]], '쓴 칸에만 그림이 들어가고 칸 크기 안');
eq([x.rows[0][4], x.rows[0][8], x.rows[1][4]], ['거실', '0.3', '주차장'], '칸에 있는 글자도 그림과 함께 들어간다');
// 실제 Excel 로 열어 볼 파일
const b64 = await cdp.evaluate(`(async()=>{const b=${I}.buildXLSXBlob(${I}.buildWorkbookSheets());const a=new Uint8Array(await b.arrayBuffer());let s='';for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode.apply(null,a.subarray(i,i+8192));return btoa(s)})()`, { awaitPromise: true });
writeFileSync(OUT + '1118d-ink.xlsx', Buffer.from(await b64, 'base64'));
ok(true, 'tests/out/1118d-ink.xlsx 저장');
await ev(`(()=>{const d=${D}; const keep=d.markers.map(m=>m.ink); d.markers.forEach(m=>delete m.ink); window.__r=${I}.buildInkSheet(); d.markers.forEach((m,i)=>{if(keep[i])m.ink=keep[i]}); return true})()`);
eq(await ev(`window.__r`), null, '손글씨가 없으면 시트를 만들지 않는다');

console.log('\n[4] 사진 ZIP 이름');
const names = await ev(`${D}.markers.map((m,i)=>${I}.photoZipBaseName(m,i,${D}))`);
ok(/_aaaaaaaa_지상3층_거실_벽체_콘크리트_균열_백태$/.test(names[0]), '번호_고유번호_층수_위치_부재_자재_결함', names[0]);
ok(/_bbbbbbbb_지하1층_주차장_천장$/.test(names[1]), '빈 칸은 건너뛴다', names[1]);
const eqName = await ev(`${I}.photoZipBaseName({uid:'dddddddd44',typeKey:'sh',seq:1,eqFloor:'지상1층',eqLoc:'계단',eqMember:'기둥',xPct:1,yPct:1},0,${D})`);
ok(/_dddddddd_지상1층_계단_기둥$/.test(eqName), '장비조사도 층수·위치·부재', eqName);

console.log('\n[5] 표로 입력');
await ev(`document.getElementById('btnDrawerRight').click(); document.getElementById('btnTableInput').click(); true`); await sleep(300);
eq(await ev(`[...document.querySelectorAll('#inputTable thead th')].map(t=>t.textContent.trim()).slice(6,16)`), ['층수', '위치', '부재', '자재', '결함', '폭(mm)', '길이(mm)', '개수', '사진번호', '비고'], '제목 순서');
eq(await ev(`[...document.querySelectorAll('#inputTableBody tr:first-child input[data-col]')].map(i=>i.dataset.col).slice(5)`), ['rptFloor', 'rptLoc', 'rptType', 'rptMember', 'rptDefect', 'rptWidth', 'rptLength', 'rptCount', 'rptTag', 'note'], '칸 순서가 제목과 같다');
ok(await ev(`(()=>{const p=document.querySelector('#tableInputPanel .ti-scroll'),b=document.getElementById('tableInputPanel').getBoundingClientRect(),r=p.getBoundingClientRect();return r.right<=b.right && p.scrollWidth>p.clientWidth})()`), '표는 창 안에서 옆으로 밀린다');
await ev(`(()=>{const t=document.querySelector('#inputTableBody tr [data-col=rptFloor]');const dt=new DataTransfer();dt.setData('text','-1\\t복도\\t벽체\\t콘크리트\\t균열\\t0.2\\t300\\t2\\t45\\t메모\\n2\\t거실\\t천장\\t\\t누수\\t\\t\\t1\\t46\\t');t.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
  const rows=document.querySelectorAll('#inputTableBody tr');[0,1].forEach(i=>{rows[i].querySelector('[data-col=x]').value=30+i*10;rows[i].querySelector('[data-col=y]').value=60;});document.getElementById('btnTableInputApply').click();return true})()`); await sleep(250);
const added = await ev(`${D}.markers.slice(3).map(m=>[m.rptFloor,m.rptLoc,m.rptType,m.rptMember,m.rptDefect,m.rptWidth,m.rptLength,m.rptCount,m.rptTag,m.note])`);
eq(added, [['지하1층', '복도', '벽체', '콘크리트', '균열', '0.2', '300', '2', '45', '메모'], ['지상2층', '거실', '천장', '', '누수', '', '', '1', '46', '']], '엑셀 붙여넣기 값이 모두 결함에 들어간다(층수는 지상/지하로)');
// 편집 모드 왕복 + 장비조사
await ev(`(()=>{const d=${D}; d.markers.push({id:'e',uid:'eeeeeeee55',typeKey:'sh',xPct:80,yPct:70,angle:0,eqFloor:'지상5층',eqLoc:'옥상',eqMember:'기둥',eqTag:'77'}); window.confirm=()=>true; document.getElementById('btnTableInput').click(); document.getElementById('btnLoadCurrentMarkers').click(); return true})()`); await sleep(250);
const row = (i, c) => `document.querySelectorAll('#inputTableBody tr')[${i}].querySelector('[data-col=${c}]')`;
eq(await ev(`['rptFloor','rptLoc','rptWidth','rptLength','rptCount','rptTag'].map(c=>document.querySelectorAll('#inputTableBody tr')[0].querySelector('[data-col='+c+']').value)`), ['지상3층', '거실', '0.3', '500', '1', '13'], '「마커 불러와 편집」에 새 칸 값이 들어온다');
eq(await ev(`['rptFloor','rptLoc','rptType','rptTag'].map(c=>document.querySelectorAll('#inputTableBody tr')[5].querySelector('[data-col='+c+']').value)`), ['지상5층', '옥상', '기둥', '77'], '장비조사 결함은 장비 칸 값을 보여 준다');
await ev(`${row(0, 'rptLoc')}.value='안방'; ${row(5, 'rptLoc')}.value='지붕'; document.getElementById('btnTableInputApply').click(); true`); await sleep(250);
eq(await ev(`[${D}.markers[0].rptLoc, ${D}.markers[0].rptWidth, ${D}.markers[5].eqLoc, ${D}.markers[5].eqTag, ${D}.markers[5].rptLoc||'']`), ['안방', '0.3', '지붕', '77', ''], '편집 결과가 맞는 칸에 저장되고 다른 칸은 그대로');

console.log('\n[7] 컴퓨터 화면 표 머리글');
await ev(`localStorage.setItem('defectMarkerTabletMode_v1','off'); true`);
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1900, height: 1000, deviceScaleFactor: 1, mobile: false });
await cdp.send('Page.navigate', { url: APP }); await sleep(1500);
const r1 = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#addDrawingInput')` });
await cdp.send('DOM.setFileInputFiles', { files: [ROOT + 'test-fixtures/plan.png'], objectId: r1.result.objectId }); await sleep(1200);
// (위와 같은 까닭)
await ev(`window.LocationTaxonomy = null; true`);
await ev(`(()=>{const d=${D}; d.markers=[{id:'a',uid:'a1',typeKey:'wall',xPct:20,yPct:30,angle:0}]; __markerDbg.renderCanvas(); __markerDbg.renderTable(); return true})()`); await sleep(200);
const dk = await ev(`(()=>{const w=document.querySelector('.marker-list-wrap'),h=document.querySelector('.marker-list-head'),c=document.querySelector('.marker-card');return {narrow:w.classList.contains('narrow'),head:h.children.length,card:c.children.length,tracks:getComputedStyle(document.getElementById('markerTable')).gridTemplateColumns.split(' ').length,row:new Set(['photo','info','del'].map(k=>Math.round(c.querySelector('[data-role='+k+']').getBoundingClientRect().top))).size}})()`);
ok(dk.narrow || (dk.head === dk.card && dk.card === dk.tracks && dk.row === 1), '머리글·카드·표 칸 수가 같다', dk);

console.log(`\n${passes} 통과 / ${fails} 실패`);
finish(cdp, fails ? 1 : 0);
