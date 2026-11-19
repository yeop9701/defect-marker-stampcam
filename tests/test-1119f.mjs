/* 2026-11-19 6차 요청 검사 — 최근 값 단추, 결함 목록 ▼ 층수·위치, 장비조사 단추, 다 채운 결함 접기,
   서랍 탭 붙음, 퀵입력 칸 이름 크기, 지상 39층까지.

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더> about:blank
     node tests/test-1119f.mjs                                                       */
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
const click = async (id, ms = 250) => { await ev(`document.getElementById('${id}').click(); true`); await sleep(ms); };
const D = '__markerDbg.getActiveDrawing()', Q = '#quickInputFields';

async function boot(w = 1280, h = 800, preset) {
  await cdp.send('DOM.enable');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: APP }); await sleep(800);
  await ev(`localStorage.clear(); localStorage.setItem('defectMarkerTabletMode_v1','on'); localStorage.setItem('defectMarkerInk_v1', JSON.stringify({on:false,engine:'google',auto:false})); true`);
  await cdp.send('Page.navigate', { url: APP }); await sleep(1400);
  if (preset) { await ev(`(()=>{const s=document.getElementById('seriesPresetSelect');s.value=${JSON.stringify(preset)};s.dispatchEvent(new Event('change',{bubbles:true}));return true})()`); await sleep(300); }
  const r = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#addDrawingInput')` });
  await cdp.send('DOM.setFileInputFiles', { files: [ROOT + 'test-fixtures/plan.png'], objectId: r.result.objectId }); await sleep(1100);
}
const setMarkers = (list, key) => ev(`(()=>{const d=${D},k=${key ? JSON.stringify(key) : `__markerDbg.info.allPresets()[0].series[0].key`};d.markers=${JSON.stringify(list)}.map((x,i)=>Object.assign({id:'m'+i,uid:'u'+i,typeKey:k,xPct:10+i*8,yPct:30,angle:0,seq:i+1},x));__markerDbg.renderTable();__markerDbg.renderCanvas();return d.markers.length})()`);
const rowChips = (label) => ev(`(()=>{const r=[...document.querySelectorAll('${Q} .qis-tax-row')].find(x=>x.querySelector('.qis-tax-label').textContent===${JSON.stringify(label)});return r&&r.classList.contains('open')?[...r.querySelectorAll('.qis-tax-chips button')].map(b=>(b.classList.contains('recent')?'★':'')+b.textContent):null})()`);
const chip = async (label, text) => { const r = await ev(`(()=>{const r=[...document.querySelectorAll('${Q} .qis-tax-row')].find(x=>x.querySelector('.qis-tax-label').textContent===${JSON.stringify(label)});const b=r&&[...r.querySelectorAll('.qis-tax-chips button')].find(b=>b.textContent===${JSON.stringify(text)});if(!b)return false;b.click();return true})()`); await sleep(200); return r; };
const openSheet = async (i) => { await ev(`__markerDbg.ink.openQuickInputSheetFor(${D}.markers[${i}]); true`); await sleep(250); };

console.log('\n[최근 쓴 층수·위치]');
await boot();
await setMarkers([{ rptFloor: '지상2층', rptLoc: '계단실' }, { rptFloor: '지하1층', rptLoc: '복도' }, { rptFloor: '옥탑층', rptLoc: '스팀터빈동' }, {}]);
await openSheet(3);
eq((await rowChips('층수')).slice(0, 4), ['★옥탑층', '★지하1층', '★지상2층', '지하1-9층'], '층수 줄 맨 앞에 최근 값(나중 것부터)');
eq((await rowChips('위치')), null, '  (위치 줄은 아직 접혀 있다)');
await chip('층수', '지하1층');
eq(await ev(`${D}.markers[3].rptFloor`), '지하1층', '최근 값 한 번에 → 「지하1층」');
eq((await rowChips('위치')).slice(0, 4), ['★스팀터빈동', '★복도', '★계단실', '공용공간'], '위치 줄도 최근 값이 맨 앞(목록에 없는 말 포함)');
await shot('1119f-recent.png');
await chip('위치', '계단실');
eq(await ev(`${D}.markers[3].rptLoc`), '계단실', '최근 위치 한 번에 → 「계단실」(분류를 거치지 않음)');
ok((await rowChips('부재')) !== null, '  다음 줄(부재)이 열린다');

console.log('\n[지상 39층까지 · 칸 이름]');
await setMarkers([{}]); await openSheet(0);
eq((await rowChips('층수')).filter(t => /^\d+-\d+층$/.test(t)), ['1-9층', '10-19층', '20-29층', '30-39층'], '지상 1단계는 30-39층까지');
const lab = await ev(`(()=>{const a=document.querySelector('${Q} .qis-tax-label'),b=document.querySelector('${Q} .ink-label')||null,c=getComputedStyle(a);return {크기:parseFloat(c.fontSize),굵기:c.fontWeight,색:c.color,본문색:getComputedStyle(document.body).color}})()`);
ok(lab.크기 >= 15 && Number(lab.굵기) >= 700 && lab.색 !== lab.본문색, '퀵입력 칸 이름이 15px 이상 · 굵게 · 강조색', lab);
await ev(`localStorage.setItem('defectMarkerInk_v1', JSON.stringify({on:true,engine:'google',auto:false})); __markerDbg.ink.hideQuickInputSheet(); true`);
await openSheet(0);
const ink = await ev(`[...document.querySelectorAll('${Q} .ink-label')].map(e=>{const c=getComputedStyle(e);return [e.textContent,parseFloat(c.fontSize),c.color]})`);
ok(ink.length === 4 && ink.every(x => x[1] >= 15 && x[2] === lab.색), '손글씨 칸 이름(폭·길이·개수·사진 #)도 같은 크기·색', ink);
await shot('1119f-labels.png');
await ev(`__markerDbg.ink.hideQuickInputSheet(); localStorage.setItem('defectMarkerInk_v1', JSON.stringify({on:false,engine:'google',auto:false})); true`);

console.log('\n[결함 목록 ▼ — 층수·위치]');
await setMarkers([{ rptFloor: '지상2층', rptLoc: '계단실' }, {}]);
await click('btnDrawerRight', 400);
const cardSel = `.marker-card[data-id=m1]`;
ok(await ev(`!!document.querySelector('${cardSel} [data-drop=rptFloor]') && !!document.querySelector('${cardSel} [data-drop=rptLoc]')`), '카드 층수·위치 칸에 ▼');
const menu = () => ev(`(()=>{const m=document.querySelector('.cell-menu');return m?[...m.querySelectorAll('button')].map(b=>(b.classList.contains('recent')?'★':'')+b.textContent):null})()`);
const mclick = async (text) => { await ev(`(()=>{const b=[...document.querySelectorAll('.cell-menu button')].find(b=>b.textContent===${JSON.stringify(text)});b.dispatchEvent(new MouseEvent('click',{bubbles:true}));return true})()`); await sleep(150); };
await ev(`document.querySelector('${cardSel} [data-drop=rptFloor]').click(); true`); await sleep(200);
eq((await menu()).slice(0, 2), ['★지상2층', '지하1-9층'], '▼ 층수 : 최근 값 + 1단계');
await mclick('10-19층');
ok((await menu()).includes('지상12층') && (await menu()).includes('중층'), '  1단계를 누르면 2단계·중층이 같은 창에');
await shot('1119f-card-menu.png');
await mclick('중층'); await mclick('지상12층');
eq([await ev(`document.querySelector('${cardSel} [data-role=rptFloor]').value`), await ev(`${D}.markers[1].rptFloor`), await vis('.cell-menu')], ['지상중12층', '지상중12층', 0], '  중층 → 12층 : 칸과 결함에 「지상중12층」, 창이 닫힌다');
await ev(`document.querySelector('${cardSel} [data-drop=rptLoc]').click(); true`); await sleep(200);
await mclick('주차장'); await mclick('램프');
eq(await ev(`${D}.markers[1].rptLoc`), '램프', '▼ 위치 : 분류 → 위치 「램프」');
await ev(`document.querySelector('${cardSel} [data-drop=rptLoc]').click(); true`); await sleep(200);
await mclick('(비움)');
eq(await ev(`${D}.markers[1].rptLoc||''`), '', '(비움)');
await click('btnDrawerRight', 300);

console.log('\n[장비조사도 같은 단추]');
await boot(1280, 800, '장비조사');
const eqKey = await ev(`__markerDbg.info.allPresets().find(p=>p.name==='장비조사').series[0].key`);
await setMarkers([{ eqFloor: '지상1층', eqLoc: '기계실' }, {}], eqKey);
await openSheet(1);
eq(await ev(`[...document.querySelectorAll('${Q} .qis-tax-label')].map(e=>e.textContent)`), ['층수', '위치'], '퀵입력 : 층수·위치 단추 줄');
eq(await ev(`[...document.querySelectorAll('${Q} [data-qis]')].map(e=>e.dataset.qis)`), ['eqMember', 'eqTag'], '  부재·사진번호는 입력칸으로 펼쳐져 있다');
eq((await rowChips('층수')).slice(0, 2), ['★지상1층', '지하1-9층'], '  최근 값도 장비조사 것');
await chip('층수', '지하1-9층'); await chip('층수', '지하3층');
await chip('위치', '전기설비실'); await chip('위치', '발전기실');
eq(await ev(`[${D}.markers[1].eqFloor, ${D}.markers[1].eqLoc]`), ['지하3층', '발전기실'], '  「지하3층」「발전기실」');
await shot('1119f-equip.png');
await ev(`__markerDbg.ink.hideQuickInputSheet(); true`);
await click('btnDrawerRight', 400);
ok(await ev(`!!document.querySelector('.marker-card [data-drop=eqFloor]') && !!document.querySelector('.marker-card [data-drop=eqLoc]')`), '장비조사 카드에도 ▼');
await click('btnDrawerRight', 300);

console.log('\n[다 채운 결함 접기]');
await boot();
const full = { rptFloor: '지상1층', rptLoc: '거실', rptType: '벽체', rptMember: '콘크리트', rptDefect: '균열', rptWidth: '0.3', rptLength: '100', rptCount: '2', rptTag: '12' };
await setMarkers([full, { ...full, rptDefect: '' }, full, full]);
await click('btnDrawerRight', 400);
const folded = () => ev(`[...document.querySelectorAll('.marker-card')].map(c=>c.classList.contains('mc-folded'))`);
eq(await folded(), [true, false, true, true], '부재·자재·결함이 다 찬 결함만 접힌다');
const f0 = await ev(`(()=>{const c=document.querySelector('.marker-card.mc-folded'),s=c.querySelector('.mc-fold-sum');return {h:Math.round(c.getBoundingClientRect().height),t:s.textContent,넘침:s.scrollWidth-s.clientWidth}})()`);
eq(f0.t, '1지상1층 거실벽체 콘크리트 균열0.3×100 2개#12▾', '한 줄 요약 : 번호·층수 위치·부재 자재 결함·크기·사진번호');
ok(f0.h <= 44, '접힌 카드 높이 44px 이하(펼친 카드 86px)', f0);
await shot('1119f-fold.png');
await ev(`document.querySelector('.marker-card.mc-folded .mc-fold-sum').click(); true`); await sleep(300);
eq(await folded(), [false, false, true, true], '요약을 누르면 펼쳐진다(그 결함이 골라진다)');
await ev(`document.querySelectorAll('.marker-card')[2].querySelector('.mc-fold-sum').click(); true`); await sleep(300);
eq(await folded(), [true, false, false, true], '다른 결함을 펼치면 앞의 것은 다시 접힌다');
await ev(`(()=>{const i=document.querySelectorAll('.marker-card')[1].querySelector('[data-role=rptDefect]');i.focus();i.value='백태';i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));__markerDbg.renderTable();return true})()`); await sleep(200);
eq((await folded())[1], false, '고치고 있는 결함은 다 채워도 바로 접히지 않는다');
await click('btnFoldToggle', 250);
eq(await folded(), [false, false, false, false], '「완료 접기: 끔」이면 모두 펼친다');
eq(await ev(`localStorage.getItem('defectMarkerFoldDone_v1')`), 'off', '  설정이 남는다');
await click('btnFoldToggle', 250);
await click('btnDrawerRight', 300);

console.log('\n[서랍 탭이 서랍에 붙는다]');
for (const [w, h] of [[1280, 800], [800, 1280], [390, 844]]) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  await sleep(300);
  for (const side of ['Right', 'Left']) {
    await click('btnDrawer' + side, 50);
    // 서랍이 미끄러져 나오는 동안에도 탭이 서랍 가장자리를 따라온다
    const mid = await ev(`(()=>{const t=document.getElementById('btnDrawer${side}').getBoundingClientRect(),d=document.querySelector('.sidebar.${side.toLowerCase()}').getBoundingClientRect();return ('${side}'==='Right'?Math.round(d.left-t.right):Math.round(t.left-d.right))+0})()`);   // +0 : -0 은 CDP 가 값으로 안 넘긴다
    await sleep(400);
    const end = await ev(`(()=>{const t=document.getElementById('btnDrawer${side}').getBoundingClientRect(),d=document.querySelector('.sidebar.${side.toLowerCase()}').getBoundingClientRect();return '${side}'==='Right'?d.left-t.right:t.left-d.right})()`);
    ok(end <= 0 && end >= -1.5, `${w}px ${side === 'Right' ? '결함목록' : '도면유형'} : 다 열린 뒤 틈 없이 붙는다`, end);
    ok(Math.abs(mid) <= 60, '  여는 동안에도 크게 떨어지지 않는다', mid);
    await click('btnDrawer' + side, 400);
  }
}

console.log(`\n${passes} 통과 / ${fails} 실패`);
finish(cdp, fails ? 1 : 0);
