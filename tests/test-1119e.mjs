/* 2026-11-19 5차 요청 검사 — 층수·위치 선택 목록 (taxonomy/위치_층수_선택목록.xlsx).
   엑셀을 직접 읽어 앱 목록과 비교하고, 퀵입력에서 실제로 눌러 본다.

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더> about:blank
     node tests/test-1119e.mjs                                                       */
import { connect, finish } from './cdp.mjs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

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
const D = '__markerDbg.getActiveDrawing()';
const Q = '#quickInputFields';

/* 엑셀 원본 그대로 (파이썬 openpyxl) */
const xl = JSON.parse(execFileSync('python', ['-X', 'utf8', '-c', `
import json, openpyxl
wb = openpyxl.load_workbook(r'${ROOT}taxonomy/위치_층수_선택목록.xlsx', data_only=True)
f = [[str(c or '') for c in r[:3]] for r in wb['층수'].iter_rows(min_row=2, values_only=True) if r[0]]
l = [[str(r[0]), str(r[1])] for r in wb['위치'].iter_rows(min_row=2, values_only=True) if r[0] and r[1]]
print(json.dumps({'f': f, 'l': l}, ensure_ascii=False))`], { encoding: 'utf8' }));

async function boot(ink) {
  await cdp.send('DOM.enable');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: APP }); await sleep(800);
  await ev(`localStorage.clear(); localStorage.setItem('defectMarkerTabletMode_v1','on'); localStorage.setItem('defectMarkerInk_v1', JSON.stringify({on:${ink},engine:'google',auto:false})); true`);
  await cdp.send('Page.navigate', { url: APP }); await sleep(1400);
  const r = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#addDrawingInput')` });
  await cdp.send('DOM.setFileInputFiles', { files: [ROOT + 'test-fixtures/plan.png'], objectId: r.result.objectId }); await sleep(1100);
}
let freshN = 0;
const fresh = async (vals = {}) => {
  const id = 't0x' + (++freshN);   // 결함마다 퀵입력 상태(✎ 등)가 따로라 매번 새 결함
  await ev(`(()=>{const d=${D},k=__markerDbg.info.allPresets()[0].series[0].key;d.markers=[Object.assign({id:'${id}',uid:'u${id}',typeKey:k,xPct:30,yPct:30,angle:0,seq:1},${JSON.stringify(vals)}),Object.assign({id:'t1',uid:'u1',typeKey:k,xPct:60,yPct:30,angle:0,seq:2})];__markerDbg.renderTable();__markerDbg.ink.openQuickInputSheetFor(d.markers[0]);return true})()`);
  await sleep(250);
};
const M = (k) => ev(`${D}.markers[0].${k}||''`);
const chips = (k) => ev(`(()=>{const b=document.querySelector('${Q} [data-tax-open=${k}], ${Q} .qis-tax-row.open');const rows=[...document.querySelectorAll('${Q} .qis-tax-row')];const r=rows.find(x=>x.querySelector('.qis-tax-label').textContent===${JSON.stringify(k)});return r&&r.classList.contains('open')?[...r.querySelectorAll('.qis-tax-chips button')].map(b=>b.textContent+(b.classList.contains('on')?'*':'')):null})()`);
const press = async (sel) => { const ok2 = await ev(`(()=>{const b=document.querySelector(${JSON.stringify(Q + ' ' + sel)});if(!b)return false;b.click();return true})()`); await sleep(200); return ok2; };
const chipText = async (label, text) => { const r = await ev(`(()=>{const r=[...document.querySelectorAll('${Q} .qis-tax-row')].find(x=>x.querySelector('.qis-tax-label').textContent===${JSON.stringify(label)});const b=r&&[...r.querySelectorAll('.qis-tax-chips button')].find(b=>b.textContent===${JSON.stringify(text)});if(!b)return false;b.click();return true})()`); await sleep(200); return r; };
const openRow = async (label) => { await ev(`(()=>{const r=[...document.querySelectorAll('${Q} .qis-tax-row')].find(x=>x.querySelector('.qis-tax-label').textContent===${JSON.stringify(label)});r.click();return true})()`); await sleep(200); };

console.log('\n[엑셀과 앱 목록]');
await boot(true);
const T = await ev(`window.LocationTaxonomy`);
eq(T.floors.map(g => g.group), xl.f.map(r => r[0]), '층수 1단계가 엑셀 그대로');
eq(T.floors.map(g => g.floors.map(n => n + '층').join(', ')), xl.f.map(r => r[1].includes('바로') ? '' : r[1]), '층수 2단계가 엑셀 그대로');
eq(T.floors.map(g => g.mezz), xl.f.map(r => r[2].includes('중층')), '중층(3단계)이 있는 줄이 엑셀 그대로');
eq(T.locations.flatMap(c => c.items.map(v => c.name + '|' + v)), xl.l.map(([c, v]) => c.replace(/\s*\(.*\)\s*$/, '') + '|' + v), '위치 분류·위치가 엑셀 그대로(순서 포함)');

console.log('\n[층수 — 손글씨 켬]');
await fresh();
eq(await ev(`[...document.querySelectorAll('${Q} .qis-tax-label')].map(e=>e.textContent)`), ['층수', '위치', '부재', '자재', '결함'], '층수·위치가 부재 앞 단추 줄');
eq(await ev(`[...document.querySelectorAll('${Q} .ink-box')].map(b=>b.dataset.k)`), ['rptWidth', 'rptLength', 'rptCount', 'rptTag'], '층수·위치 필기 상자는 ✎ 를 누를 때만');
eq(await chips('층수'), xl.f.map(r => r[0]), '처음엔 1단계 14개');
await shot('1119e-floor1.png');
await chipText('층수', '1-9층');
eq(await chips('층수'), ['◀ 1-9층', ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `지상${n}층`), '중층'], '1단계를 누르면 2단계 + 중층');
await shot('1119e-floor2.png');
await chipText('층수', '지상3층');
eq(await M('rptFloor'), '지상3층', '2단계 → 「지상3층」');
eq(await chips('위치'), T.locations.map(c => c.name), '  다음 줄(위치)의 분류가 열린다');
await openRow('층수');
eq(await chips('층수'), ['◀ 1-9층', '지상1층', '지상2층', '지상3층*', ...[4, 5, 6, 7, 8, 9].map(n => `지상${n}층`), '중층', '지우기'], '다시 열면 고른 층이 켜져 있다');
await press('[data-floor-mezz]');
eq(await M('rptFloor'), '지상중3층', '3단계 중층 → 「지상중3층」');
await press('[data-floor-mezz]');
eq(await M('rptFloor'), '지상3층', '  다시 누르면 빠진다');
await press('[data-floor-back]');
eq((await chips('층수')).length, 15, '◀ 로 1단계로 돌아간다(14 + 지우기)');
await chipText('층수', '지하1-9층');
await press('[data-floor-mezz]');
await chipText('층수', '지하2층');
eq(await M('rptFloor'), '지하중2층', '중층을 먼저 눌러도 된다 → 「지하중2층」');
await openRow('층수');
await chipText('층수', '◀ 지하1-9층');
await chipText('층수', '90-99층'); await chipText('층수', '지상99층');
eq(await M('rptFloor'), '지상99층', '90-99층 → 「지상99층」');
for (const g of ['지붕층', '옥탑층', '외부']) {
  await openRow('층수'); await chipText('층수', '◀ 90-99층');
  await chipText('층수', g);
  eq(await M('rptFloor'), g, `「${g}」는 1단계만`);
}

console.log('\n[위치]');
await fresh({ rptFloor: '지상1층' });
eq(await chips('위치'), T.locations.map(c => c.name), '분류 11개');
await chipText('위치', '기계설비실');
eq(await chips('위치'), ['◀ 기계설비실', ...T.locations.find(c => c.name === '기계설비실').items], '분류를 누르면 그 위치들');
await shot('1119e-loc.png');
await chipText('위치', '펌프실');
eq(await M('rptLoc'), '펌프실', '값은 위치만 「펌프실」');
eq(await chips('부재') !== null, true, '  다음 줄(부재)이 열린다');
await openRow('위치');
eq((await chips('위치'))[0], '◀ 기계설비실', '다시 열면 그 분류에서');
ok((await chips('위치')).includes('펌프실*'), '  고른 위치가 켜져 있다');
await fresh({ rptFloor: '외부' });
eq((await chips('위치'))[0], '◀ 외부', '층수가 외부면 외부 위치를 바로 연다');
await chipText('위치', '정면');
eq(await M('rptLoc'), '정면', '  「정면」');
eq(await ev(`document.querySelector('${Q} .qis-tax-result').textContent`), '→ 외부 정면', '아래 요약에 층수·위치');

console.log('\n[목록에 없는 말 · 이어받기 · 손글씨 끔]');
await fresh();
await press('[data-tax-write=rptLoc]');
eq(await ev(`!!document.querySelector('${Q} .qis-tax-inkslot[data-ink-slot=rptLoc] .ink-box[data-k=rptLoc]')`), true, '✎ : 위치 줄 안에 필기 상자');
await press('[data-tax-write=rptFloor]');
eq(await ev(`document.querySelector('${Q} .ink-box[data-k=rptFloor]').classList.contains('ink-floor')`), true, '✎ : 층수는 숫자 인식 상자(1 → 지상1층)');
await fresh({ rptFloor: '지상2층', rptLoc: '스팀터빈동' });
await openRow('위치');
eq(await chips('위치'), T.locations.map(c => c.name).concat('지우기'), '목록에 없는 위치는 분류부터(값은 그대로)');
eq(await M('rptLoc'), '스팀터빈동', '  값은 지우지 않는다');
await boot(false);
await fresh();
eq(await ev(`[...document.querySelectorAll('${Q} .qis-tax-label')].map(e=>e.textContent)`), ['층수', '위치', '부재', '자재', '결함'], '손글씨를 꺼도 같은 단추 줄');
eq(await ev(`document.querySelectorAll('${Q} > .qis-field [data-qis=rptFloor]').length`), 0, '  예전 층수 입력칸은 없다');
await chipText('층수', '10-19층'); await chipText('층수', '지상12층');
await chipText('위치', '공용공간'); await chipText('위치', 'E/V 홀');
eq([await M('rptFloor'), await M('rptLoc')], ['지상12층', 'E/V 홀'], '자판 모드에서도 같다');
eq(await ev(`(()=>{const c=document.querySelector('.marker-card[data-id^=t0x]');return [c.querySelector('[data-role=rptFloor]').value,c.querySelector('[data-role=rptLoc]').value]})()`), ['지상12층', 'E/V 홀'], '결함 목록 카드에도 들어간다');
eq(await ev(`['지하중1층','지하1층','지상1층','지상중1층','지상2층','지붕층','옥탑층','외부'].map(v=>({v,s:0}))`).then(() => ev(`(()=>{const d=${D},k=d.markers[0].typeKey;d.markers=['외부','지상2층','지하1층','지붕층','지상중1층','지하중1층','옥탑층','지상1층'].map((f,i)=>({id:'s'+i,uid:'s'+i,typeKey:k,xPct:5,yPct:5,seq:i+1,rptFloor:f,rptDefect:'균열'}));return __markerDbg.info.buildSummarySheet().rows.filter(r=>r.cells[0]==='층별').map(r=>r.cells[1])})()`)), ['지하중1층', '지하1층', '지상1층', '지상중1층', '지상2층', '지붕층', '옥탑층', '외부'], '엑셀 집계의 층 순서(중층 포함)');

console.log(`\n${passes} 통과 / ${fails} 실패`);
finish(cdp, fails ? 1 : 0);
