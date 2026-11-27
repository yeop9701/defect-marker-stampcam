/* 2026-11-27 3차 — 현황 마킹 : 이름 현황(1)·현황(2), 둘 다 화살표, 위치·내용 두 칸(퀵입력·결함 목록),
   결함/현황 목록 나눔, 스탬프 촬영 메모에 위치·내용, 엑셀 「현황사진」 시트, 퀵입력 위 단추 자리 고정.

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더>
            --use-fake-device-for-media-stream --use-fake-ui-for-media-stream about:blank
     node tests/test-1127c.mjs                                                       */
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

async function boot(w = 1280, h = 800, ink = false) {
  await cdp.send('DOM.enable');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: APP }); await sleep(800);
  await ev(`localStorage.clear(); localStorage.setItem('defectMarkerTabletMode_v1','on'); ${ink ? "localStorage.setItem('defectMarkerInkInput_v1','on');" : ''} true`);
  await cdp.send('Page.navigate', { url: APP }); await sleep(1400);
  await ev(`__markerDbg.addBlankDrawing(); true`); await sleep(800);
  await ev(`__markerDbg.setSketchTool(null); document.querySelectorAll('.app-toast,.recovery-banner').forEach(e=>e.remove()); true`); await sleep(150);
}
const setup = `(()=>{const d=${D};const mk=(id,k,x,y,o)=>Object.assign({id,uid:id,typeKey:k,xPct:x,yPct:y,angle:180,lenMult:1},o||{});
  d.markers=[mk('a','wall',20,30,{rptFloor:'지상1층',rptLoc:'거실',rptType:'벽체'}),mk('s1','stat_v',50,30,{rptLoc:'주방',note:'전경'}),mk('b','flat',20,60),mk('s2','stat_h',50,60)];
  __markerDbg.renderCanvas();__markerDbg.renderTable();return true})()`;

console.log('\n[이름 · 모양]');
await boot();
eq(await ev(`${X}.DEFECT_TYPES.filter(t=>t.key.startsWith('stat')).map(t=>[t.label,t.endStyle])`), [['현황(1)', 'arrow'], ['현황(2)', 'arrow']], '현황(1)·현황(2), 둘 다 화살표');
eq(await ev(`${X}.sanitizeSeriesSnapshot([...__markerDbg.info.allPresets()[0].series.slice(0,4), {key:'stat_v',label:'현황사진(수직부재)',color:'#00B050',endStyle:'arrow'}, {key:'stat_h',label:'현황사진(수평부재)',color:'#FF8C00',endStyle:'dot'}]).slice(4).map(t=>[t.label,t.endStyle])`),
  [['현황(1)', 'arrow'], ['현황(2)', 'arrow']], '  오늘 앞서 저장한 프로젝트(옛 이름·점)도 새 이름·화살표로');

console.log('\n[결함 목록 — 결함/현황 나눔, 현황 카드는 위치·내용]');
await ev(setup); await sleep(300);
const order = await ev(`[...document.querySelectorAll('#markerTable > .marker-card, #markerTable > .mc-group-head')].map(e=>e.classList.contains('mc-group-head')?('['+e.textContent.replace(/[▾▸]/g,'').trim()+']'):e.dataset.id).join(' ')`);
eq(order, '[결함2건] [지상1층1건] a [층 미정1건] b [현황2건] s1 s2', '「결함」 머리줄 아래 결함(층별 묶음은 결함 안에서 그대로), 「현황」 머리줄 아래 현황');
const card = await ev(`(()=>{const c=document.querySelector('.marker-card[data-id="s1"]');return {roles:[...c.querySelectorAll('[data-role]')].map(e=>e.dataset.role).filter(r=>r!=='fold'),loc:c.querySelector('[data-role="rptLoc"]').value,note:c.querySelector('[data-role="note"]').value,drop:!!c.querySelector('[data-drop="rptLoc"]')}})()`);
eq(card.roles, ['pos', 'type', 'rptLoc', 'note', 'photo', 'info', 'del'], '현황 카드 : 번호·유형·위치·내용·📷·ⓘ·✕');
ok(card.loc === '주방' && card.note === '전경' && card.drop, '  값이 보이고 위치는 ▼ 목록', card);
await ev(`(()=>{const i=document.querySelector('.marker-card[data-id="s2"] [data-role="note"]');i.value='외벽 전경';i.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
eq(await ev(`${D}.markers.find(m=>m.id==='s2').note`), '외벽 전경', '  내용 칸에 쓰면 저장');
// 한 줄에 들어가는지 (태블릿 서랍)
await ev(`document.getElementById('btnDrawerRight').click(); true`); await sleep(500);
const rows = await ev(`(()=>{const c=document.querySelector('.marker-card[data-id="s1"]');const ys=[...c.children].filter(e=>e.getBoundingClientRect().height>0).map(e=>Math.round(e.getBoundingClientRect().top));return new Set(ys).size})()`);
eq(rows, 1, '  태블릿 결함 목록에서 현황 카드는 한 줄');
await shot('1127c-list.png');
// 접기
await ev(`document.querySelector('.mc-section-stat').click(); true`); await sleep(200);
eq(await ev(`[...document.querySelectorAll('.marker-card.mc-stat')].filter(c=>c.classList.contains('mc-group-hidden')).length`), 2, '  「현황」 머리줄을 누르면 접힌다');
await ev(`document.querySelector('.mc-section-stat').click(); true`); await sleep(200);
await ev(`document.getElementById('btnDrawerRight').click(); true`); await sleep(400);
// 현황만 있으면 머리줄 없음
await ev(`(()=>{const d=${D};d.markers=d.markers.filter(m=>m.typeKey.startsWith('stat'));__markerDbg.renderTable();return true})()`);
eq(await ev(`document.querySelectorAll('#markerTable .mc-section-head').length`), 0, '  한 종류만 있으면 머리줄 없음');

console.log('\n[퀵입력 — 현황은 위치(단추)·내용]');
await ev(setup); await sleep(200);
await ev(`__markerDbg.ink.openQuickInputSheetFor(${D}.markers.find(m=>m.id==='s1')); true`); await sleep(300);
const qs = await ev(`(()=>{const b=document.getElementById('quickInputFields');return {inputs:[...b.querySelectorAll('[data-qis]')].map(e=>e.dataset.qis),txt:b.innerText.slice(0,300),
  locBtns:b.querySelectorAll('[data-step-pick], .qtax-chip, .qis-tax button').length,stamp:getComputedStyle(document.getElementById('btnQuickInputStamp')).display}})()`);
ok(/내용/.test(qs.txt) && !qs.inputs.some(k => /rptType|rptMember|rptDefect|rptWidth|rptTag|rptFloor/.test(k)), '퀵입력 칸은 위치(단추)·내용뿐', qs);
ok(/위치/.test(qs.txt) && !/부재|자재|층수/.test(qs.txt), '  위치 단추 줄은 있고 부재·자재·층수는 없다', qs.txt);
ok(qs.stamp !== 'none', '  스탬프 촬영 단추가 보인다', qs);
await shot('1127c-quick.png');

console.log('\n[퀵입력 위 단추 자리 — 결함 ↔ 현황]');
for (const ink of [false, true]) {
  await boot(1280, 800, ink);
  await ev(setup); await sleep(200);
  const pos = async (id) => { await ev(`__markerDbg.ink.openQuickInputSheetFor(${D}.markers.find(m=>m.id==='${id}')); true`); await sleep(350);
    return ev(`['btnQuickInputPrev','btnQuickInputNext','btnQuickInputStamp','btnQuickInputClose'].map(i=>{const r=document.getElementById(i).getBoundingClientRect();return r.width?Math.round(r.left)+','+Math.round(r.top):'-'})`); };
  // 마커가 모두 도면 아래쪽(시트가 가리지 않는 자리) — 결함과 현황을 오가도 머리줄이 그대로여야 한다
  await ev(`(()=>{${D}.markers.forEach((m,i)=>{m.yPct=62+i*4;});__markerDbg.renderCanvas();return true})()`);
  const pa = await pos('a'), ps = await pos('s1'), pb = await pos('b'), ps2 = await pos('s2');
  ok(JSON.stringify(pa) === JSON.stringify(ps) && JSON.stringify(pa) === JSON.stringify(pb) && JSON.stringify(pa) === JSON.stringify(ps2),
    `${ink ? '손글씨' : '보통'} 퀵입력 : 결함·현황을 오가도 앞·다음·스탬프·닫기 자리가 같다`, { pa, ps, pb, ps2 });
  if (ink) await shot('1127c-quick-ink.png');
}
// 위에 붙은 시트가 그 마커를 가리게 되면 그때만 아래로 비킨다(마커를 덮지 않는 것이 먼저)
await ev(`(()=>{${D}.markers.find(m=>m.id==='s2').yPct=8;return true})()`);
await ev(`__markerDbg.ink.openQuickInputSheetFor(${D}.markers.find(m=>m.id==='s2')); true`); await sleep(350);
eq(await ev(`document.getElementById('quickInputSheet').classList.contains('pinned-top')`), false, '  맨 위 마커로 넘기면 그때만 시트가 아래로 비킨다');

console.log('\n[스탬프 촬영 — 메모에 위치·내용]');
await boot();
await ev(setup); await sleep(200);
await ev(`(()=>{const s=StampCam._debug.loadSettings();s.memo='예전 메모';StampCam._debug.saveSettings(s);return true})()`);
await ev(`${X}.openStampCamFor(${D}.markers.find(m=>m.id==='s1')); true`); await sleep(2500);
eq(await ev(`document.querySelector('.sc-ov [data-sc="memo"]').value`), '주방 전경', '현황 마킹으로 열면 메모 자리에 「위치 내용」');
await ev(`document.querySelector('.sc-ov [data-sc="shutter"]').click(); true`); await sleep(2500);
const sh = await ev(`(async()=>{const m=${D}.markers.find(m=>m.id==='s1');const k=Object.keys(m.photoMeta||{})[0];return {n:(m.photos||[]).length,tag:m.rptTag,memo:k?m.photoMeta[k].memo:null}})()`);
ok(sh.n === 1 && sh.tag && sh.memo === '주방 전경', '  찍으면 현황에 붙고 사진번호가 들어가며, 그 사진 메모는 「주방 전경」', sh);
await ev(`StampCam.close(); true`); await sleep(300);
eq(await ev(`StampCam._debug.loadSettings().memo`), '예전 메모', '  닫으면 스탬프 카메라 메모는 원래대로');
await ev(`${X}.openStampCamFor(${D}.markers.find(m=>m.id==='a')); true`); await sleep(1500);
eq(await ev(`document.querySelector('.sc-ov [data-sc="memo"]').value`), '예전 메모', '결함 마킹은 예전처럼 메모를 건드리지 않는다');
await ev(`StampCam.close(); true`); await sleep(300);

console.log('\n[엑셀 — 현황사진 시트]');
const sheets = await ev(`__markerDbg.info.buildWorkbookSheets().map(s=>({name:s.name,n:s.rows?s.rows.length:0,first:s.rows&&s.rows[0]?s.rows[0].cells:null}))`);
const og = sheets.find(s => s.name === '외관조사'), st = sheets.find(s => s.name === '현황사진');
ok(og && og.n === 2, '외관조사 시트는 결함 2건만', og);
ok(st && st.n === 2 && st.first[2] === '현황(1)' && st.first[3] === '주방' && st.first[4] === '전경', '「현황사진」 시트 : 도면명·NO·구분·위치·내용·사진번호', st);
const csv = await ev(`(()=>{const r=__markerDbg.buildDefectExportData();const rows=r.rows||r;const row=rows.find(x=>(x.cells||x).includes('현황(1)'));return row?(row.cells||row):null})()`);
ok(csv && csv.includes('전경') && csv.includes('주방'), 'CSV 에도 현황의 위치·내용(비고 칸)이 나간다', csv);

console.log(`\n통과 ${passes} · 실패 ${fails}`);
process.exit(fails ? 1 : 0);
