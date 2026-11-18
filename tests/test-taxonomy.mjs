/* 부재 → 자재 → 결함 연결 목록 검사 (taxonomy/defect-taxonomy.js + index.html 의 연결 목록 묶음).

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더> about:blank
     node tests/test-taxonomy.mjs

   기대값은 엑셀(taxonomy/부재_자재_결함.xlsx) 을 python 으로 직접 읽어 비교한다 — 만든 js 파일만 믿지 않게.  */
import { connect, click, finish } from './cdp.mjs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = fileURLToPath(new URL('./out/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:8125';
const APP = BASE + '/defect-marker-stampcam/index.html';

/* 엑셀 원본 그대로 : {부재: {자재: [결함…]}} */
const XL = JSON.parse(execFileSync('python', ['-I', '-c', `
import openpyxl, json, sys
ws = openpyxl.load_workbook(sys.argv[1], data_only=True).worksheets[0]
t = {}
for r in ws.iter_rows(min_row=2, values_only=True):
    if r[0] and r[1]:
        t.setdefault(str(r[0]).strip(), {})[str(r[1]).strip()] = [d.strip() for d in str(r[2] or '').split(',') if d.strip()]
sys.stdout.buffer.write(json.dumps(t, ensure_ascii=False).encode('utf-8'))
`, ROOT + 'taxonomy/부재_자재_결함.xlsx']).toString('utf-8'));

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
const M = (i = 0) => `__markerDbg.getActiveDrawing().markers[${i}]`;
const Q = '#quickInputFields';
const rows = () => ev(`[...document.querySelectorAll('${Q} .qis-tax-row')].map(r=>(r.classList.contains('closed')?'-':'+')+r.querySelector('.qis-tax-label').textContent)`);
const chips = (k) => ev(`[...document.querySelectorAll('${Q} [data-tax-pick="${k}"]')].map(b=>b.dataset.v)`);
const onChips = (k) => ev(`[...document.querySelectorAll('${Q} [data-tax-pick="${k}"].on')].map(b=>b.dataset.v)`);
const pick = async (k, v) => {
  const hit = await ev(`(()=>{const b=[...document.querySelectorAll('${Q} [data-tax-pick="${k}"]')].find(b=>b.dataset.v===${JSON.stringify(v)}); if(!b) return false; b.click(); return true})()`);
  await sleep(120);
  return hit;
};
const openRow = async (k) => { await ev(`document.querySelector('${Q} [data-tax-open="${k}"]').click(); true`); await sleep(120); };
const val = (k, i = 0) => ev(`${M(i)}.${k}||''`);

await cdp.send('DOM.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

/* ── 0. 준비 : 태블릿 모드, 손글씨 끔(단추·자판 시트), 도면 한 장 ── */
console.log('\n[0] 준비');
await cdp.send('Page.navigate', { url: APP });
await sleep(1500);
await ev(`localStorage.clear(); localStorage.setItem('defectMarkerTabletMode_v1','on'); true`);
await cdp.send('Page.navigate', { url: APP });
await sleep(1800);
await ev(`Ink.saveSettings({on:false}); true`);
const r0 = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#addDrawingInput')` });
await cdp.send('DOM.setFileInputFiles', { files: [ROOT + 'test-fixtures/plan.png'], objectId: r0.result.objectId });
await sleep(1400);
const cv = await ev(`(()=>{const r=document.getElementById('mainCanvas').getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};})()`);

/* ── 1. 자료 ── */
console.log('\n[1] 엑셀 자료');
const T = await ev(`(()=>{const T=window.DefectTaxonomy; return T && {tree:T.tree, parts:T.parts.length, mats:T.materials.length, defs:T.defects.length}})()`);
ok(!!T, 'taxonomy/defect-taxonomy.js 를 불러왔다');
eq(T.tree, XL, '부재 → 자재 → 결함 이 엑셀과 칸 하나 다르지 않다(순서까지)');
eq([T.parts, T.mats, T.defs], [21, 37, 43], '부재 21 · 자재 37 · 결함 43 (엑셀 「목록」 시트)');

/* ── 2. 퀵입력 : 부재 → 자재 → 결함 ── */
console.log('\n[2] 퀵입력 단추');
await click(cdp, cv.x + cv.w * 0.35, cv.y + cv.h * 0.35); await sleep(500);
ok(await ev(`document.getElementById('quickInputSheet').style.display!=='none'`), '결함을 찍으면 퀵입력 시트');
eq(await rows(), ['+부재', '-자재', '-결함'], '처음에는 부재 줄만 펼쳐져 있다');
eq(await chips('rptType'), Object.keys(XL), '부재 단추 = 엑셀 부재 21개(엑셀 순서)');
await shot('tax-1-part.png');
ok(await pick('rptType', '벽체'), '「벽체」를 누른다');
eq(await val('rptType'), '벽체', '  → 부재 = 벽체');
eq(await rows(), ['-부재', '+자재', '-결함'], '  → 부재 줄은 접히고 자재 줄이 펼쳐진다');
eq(await chips('rptMember'), Object.keys(XL['벽체']), '자재 단추 = 벽체에 쓰이는 자재만 (엑셀 15개)');
ok(!(await chips('rptMember')).includes('창틀'), '  → 벽체와 상관없는 자재(창틀)는 없다');
await pick('rptMember', '콘크리트');
eq(await rows(), ['-부재', '-자재', '+결함'], '자재를 누르면 결함 줄이 펼쳐진다');
eq(await chips('rptDefect'), XL['벽체']['콘크리트'], '결함 단추 = 벽체·콘크리트 조합의 결함만 (엑셀 그대로)');
ok(!(await chips('rptDefect')).includes('곰팡이'), '  → 그 조합에 없는 결함(곰팡이)은 없다');
await pick('rptDefect', '균열');
await pick('rptDefect', '백태');
eq(await val('rptDefect'), '균열/백태', '결함 두 개 → 「균열/백태」');
eq(await onChips('rptDefect'), ['균열', '백태'], '  → 고른 단추가 켜져 있다');
eq(await rows(), ['-부재', '-자재', '+결함'], '  → 결함 줄은 열린 채로(여러 개 고르기)');
eq(await ev(`document.querySelector('${Q} .qis-tax-result').textContent`), '→ 벽체 콘크리트 균열/백태', '아래에 합친 결과');
await shot('tax-2-defects.png');
await pick('rptDefect', '균열');
eq(await val('rptDefect'), '백태', '켜진 단추를 다시 누르면 뺀다');
await pick('rptDefect', '균열');
ok(await ev(`document.querySelector('.marker-card [data-role="rptDefect"]').value==='백태/균열'`), '결함 목록 카드에도 바로 보인다');

/* 접힌 줄을 눌러 부재를 바꾸면 뒤 칸이 정리된다 */
await openRow('rptType');
eq(await rows(), ['+부재', '-자재', '-결함'], '접힌 부재 줄을 누르면 다시 펼쳐진다');
eq(await onChips('rptType'), ['벽체'], '  → 지금 값이 켜져 있다');
await pick('rptType', '기둥');
eq([await val('rptType'), await val('rptMember')], ['기둥', '콘크리트'], '기둥에도 콘크리트가 있으면 자재는 그대로');
eq(await val('rptDefect'), '백태/균열', '  → 결함도 기둥·콘크리트에 있으니 그대로');
await openRow('rptType');
await pick('rptType', '창호');
eq(await val('rptMember'), '', '창호에는 콘크리트가 없으니 자재를 비운다');
eq(await val('rptDefect'), '균열', '창호 결함에 없는 백태는 빼고 균열은 남는다');
eq(await rows(), ['-부재', '+자재', '-결함'], '  → 빈 자재 줄이 펼쳐진다');
eq(await chips('rptMember'), Object.keys(XL['창호']), '창호 자재 3개');
/* 지우기 */
await openRow('rptDefect');
await ev(`document.querySelector('${Q} [data-tax-clear="rptDefect"]').click(); true`); await sleep(120);
eq(await val('rptDefect'), '', '「지우기」로 결함을 비운다');

/* 엑셀에 없는 말 : ✎ 직접 입력 */
await openRow('rptType');
await ev(`document.querySelector('${Q} [data-tax-write="rptType"]').click(); true`); await sleep(120);
ok(await ev(`document.activeElement && document.activeElement.classList.contains('qis-tax-write')`), '✎ → 그 줄이 입력칸이 되고 바로 쓸 수 있다');
await ev(`(()=>{const i=document.activeElement; i.value='외벽'; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); return true})()`);
await sleep(120);
eq(await val('rptType'), '외벽', '직접 친 부재 = 외벽');
await ev(`document.querySelector('${Q} [data-tax-write="rptType"]').click(); true`); await sleep(120);
await openRow('rptMember');
eq((await chips('rptMember')).length, 37, '엑셀에 없는 부재면 자재는 전부(37개)');
await pick('rptMember', '조적');
const unionJ = [...new Set(Object.values(XL).flatMap(p => p['조적'] || []))];
eq((await chips('rptDefect')).slice().sort(), unionJ.slice().sort(), '부재를 모르면 그 자재(조적)가 쓰인 모든 부재의 결함을 합쳐 보여 준다');
await openRow('rptType');
eq(await onChips('rptType'), ['외벽'], '직접 친 부재도 켜진 단추로 보인다(목록 끝)');
await ev(`__markerDbg.ink.hideQuickInputSheet(); true`);

/* ── 3. 결함 목록 카드의 ▼ ── */
console.log('\n[3] 결함 목록 카드 ▼');
await click(cdp, cv.x + cv.w * 0.6, cv.y + cv.h * 0.35); await sleep(400);
await ev(`__markerDbg.ink.hideQuickInputSheet(); true`);
const card = (i) => `document.querySelectorAll('.marker-card')[${i}]`;
const setCard = (i, k, v) => ev(`(()=>{const x=${card(i)}.querySelector('[data-role="${k}"]'); x.focus(); x.value=${JSON.stringify(v)};
  x.dispatchEvent(new Event('input',{bubbles:true})); x.dispatchEvent(new Event('change',{bubbles:true})); return true})()`);
const drop = async (i, k) => { await ev(`${card(i)}.querySelector('button[data-drop="${k}"]').click(); true`); await sleep(120); };
const menu = () => ev(`[...document.querySelectorAll('.cell-menu button[data-v]')].map(b=>b.dataset.v).filter(Boolean)`);
const menuPick = async (v) => { await ev(`[...document.querySelectorAll('.cell-menu button')].find(b=>b.dataset.v===${JSON.stringify(v)}).click(); true`); await sleep(120); };
await setCard(1, 'rptType', '천장');
await drop(1, 'rptMember');
eq(await menu(), Object.keys(XL['천장']), '부재가 천장이면 자재 ▼ 에 천장 자재만');
await menuPick('천장 흡음판(텍스)');
eq(await val('rptMember', 1), '천장 흡음판(텍스)', '고른 자재가 들어간다');
ok(!(await ev('!!document.querySelector(".cell-menu")')), '  → 자재 목록은 하나 고르면 닫힌다');
await drop(1, 'rptDefect');
eq(await menu(), XL['천장']['천장 흡음판(텍스)'], '결함 ▼ = 천장·텍스 조합의 결함만');
ok(await ev(`document.querySelector('.cell-menu .cell-menu-hint').textContent.includes('여러 개')`), '  → 「여러 개 고를 수 있습니다」 안내');
await menuPick('처짐');
await menuPick('누수흔적');
ok(await ev('!!document.querySelector(".cell-menu")'), '결함 목록은 골라도 열려 있다');
eq(await val('rptDefect', 1), '처짐/누수흔적', '  → 「처짐/누수흔적」');
eq(await ev(`[...document.querySelectorAll('.cell-menu button.on')].map(b=>b.dataset.v)`), ['누수흔적', '처짐'], '  → 고른 것이 켜져 있다');
await menuPick('처짐');
eq(await val('rptDefect', 1), '누수흔적', '다시 누르면 뺀다');
await drop(1, 'rptDefect');
ok(!(await ev('!!document.querySelector(".cell-menu")')), '▼ 를 한 번 더 누르면 닫힌다');
/* 손으로 친 새 말은 엑셀에 없는 것만 목록 끝에 */
await setCard(1, 'rptDefect', '누수흔적/곰팡이자국');
await drop(1, 'rptDefect');
const m1 = await menu();
eq(m1[m1.length - 1], '곰팡이자국', '친 말 중 엑셀에 없는 것(곰팡이자국)은 목록 끝에 오른다');
ok(!m1.includes('경사균열'), '  → 다른 결함에 쓴 엑셀 말(경사균열 등)이 섞여 들어와 목록을 넓히지 않는다');
await drop(1, 'rptDefect');

/* ── 4. 「표로 입력」 창 ── */
console.log('\n[4] 표로 입력');
await ev(`document.getElementById('btnTableInput').click(); true`); await sleep(400);
await ev(`document.getElementById('btnAddInputRow').click(); true`); await sleep(100);
await ev(`(()=>{const i=document.getElementById('inputTableBody').children[0].querySelector('[data-col="rptType"]'); i.value='계단'; i.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
await ev(`document.getElementById('inputTableBody').children[0].querySelector('button[data-drop="rptMember"]').click(); true`); await sleep(120);
eq(await menu(), Object.keys(XL['계단']), '표 입력도 그 줄의 부재(계단)에 맞는 자재만');
await ev(`document.querySelector('.cell-menu button[data-v=""]').click(); true`);
await ev(`document.getElementById('btnTableInputCancel').click(); true`); await sleep(200);

/* ── 5. 목록수정 : 엑셀에 없는 말 더 붙이기 ── */
console.log('\n[5] 목록수정');
await ev(`document.getElementById('btnEditFieldOptions').click(); true`); await sleep(200);
eq(await ev(`[document.getElementById('optFieldType').value, document.getElementById('optFieldDefect').value]`), ['', ''], '기본은 비어 있다(엑셀 목록이 기본)');
await ev(`document.getElementById('optFieldType').value='승강기 홀\\n벽체'; document.getElementById('btnFieldOptionsApply').click(); true`); await sleep(200);
await drop(0, 'rptType');
const m2 = await menu();
eq(m2.slice(0, 21), Object.keys(XL), '부재 목록 앞은 엑셀 그대로');
ok(m2.includes('승강기 홀') && m2.filter(v => v === '벽체').length === 1, '더 붙인 말(승강기 홀)이 끝에 붙고, 엑셀에 있는 말(벽체)은 겹치지 않는다', m2.slice(21));
await drop(0, 'rptType');

/* ── 6. 손글씨 켬 ── */
console.log('\n[6] 손글씨 모드');
await ev(`Ink.saveSettings({on:true}); true`);
await click(cdp, cv.x + cv.w * 0.35, cv.y + cv.h * 0.6); await sleep(500);
ok(await ev(`document.getElementById('quickInputSheet').classList.contains('ink-mode')`), '손글씨 모드 시트');
eq(await ev(`document.querySelectorAll('${Q} .qis-tax-row').length`), 3, '부재·자재·결함은 단추 줄');
eq(await ev(`[...document.querySelectorAll('${Q} .ink-box')].map(b=>b.dataset.k)`), ['rptFloor', 'rptLoc', 'rptWidth', 'rptLength', 'rptCount', 'rptTag'], '층수·위치·실측값은 필기 상자');
eq(await val('rptType', 2), '천장', '값 이어받기 : 새 결함이 직전 부재를 물려받았다');
await openRow('rptType');
await pick('rptType', '바닥');
eq(await val('rptMember', 2), '', '  → 바닥에 없는 자재(텍스)는 비운다');
await pick('rptMember', '타일');
eq(await val('rptDefect', 2), '곰팡이자국', '  → 엑셀에 없는 직접 친 결함은 남긴다');
await ev(`document.querySelector('${Q} [data-tax-clear="rptDefect"]').click(); true`); await sleep(120); await pick('rptDefect', '들뜸');
eq([await val('rptType', 2), await val('rptMember', 2), await val('rptDefect', 2)], ['바닥', '타일', '들뜸'], '손글씨 모드에서도 단추로 고른다');
eq(await ev(`[...document.querySelectorAll('${Q} .ink-box')].map(b=>b.dataset.k)`), ['rptFloor', 'rptLoc', 'rptWidth', 'rptLength', 'rptCount', 'rptTag'], '  → 단추를 눌러도 필기 상자는 그대로');
await shot('tax-3-ink.png');
ok(await ev(`(()=>{const s=document.getElementById('quickInputSheet').getBoundingClientRect();return s.right<=innerWidth+1 && s.left>=-1 && s.top>=-1})()`), '시트가 화면 안에 들어온다');
await ev(`__markerDbg.ink.hideQuickInputSheet(); true`);

/* ── 7. 통계 : 결함은 나눠 센다 ── */
console.log('\n[7] 통계');
await ev(`document.getElementById('btnShowStats').click(); true`); await sleep(300);
const stats = await ev(`document.getElementById('statsBody') ? document.getElementById('statsBody').textContent : ''`);
ok(!stats.includes('누수흔적/곰팡이자국') && stats.includes('곰팡이자국'), '결함별 개수는 「/」 로 나눠 각각 센다', stats.slice(0, 300));

console.log(`\n${passes} 통과, ${fails} 실패`);
finish(cdp, fails ? 1 : 0);
