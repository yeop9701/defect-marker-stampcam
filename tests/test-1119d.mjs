/* 2026-11-19 4차 요청 검사 — 서랍 탭(세로 글자·가운데), 결함 카드 높이.

     node ../stamp-camera/tests/serve.mjs 8125 C:/Users/user/Desktop/CL
     chrome --headless=new --remote-debugging-port=9223 --user-data-dir=<빈 폴더> about:blank
     node tests/test-1119d.mjs                                                       */
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
const shot = async (n) => { const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(OUT + n, Buffer.from(data, 'base64')); };
const D = '__markerDbg.getActiveDrawing()';
const click = async (id, ms = 300) => { await ev(`document.getElementById('${id}').click(); true`); await sleep(ms); };

const tabs = () => ev(`(()=>{const w=document.getElementById('canvasWrap').getBoundingClientRect(),mid=w.top+w.height/2;return ['btnDrawerLeft','btnDrawerRight'].map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect(),c=getComputedStyle(e),range=document.createRange();range.selectNodeContents(e);const t=range.getBoundingClientRect();return {글:e.textContent,방향:c.writingMode,세움:c.textOrientation,중심차:Math.abs(r.top+r.height/2-mid),폭:r.width,높이:r.height,글자높이:t.height,글자폭:t.width,왼:r.left,오:innerWidth-r.right}})})()`);

for (const [w, h, mobile] of [[1280, 800, false], [800, 1280, false], [390, 844, true]]) {
  console.log(`\n[${w}×${h}]`);
  await cdp.send('DOM.enable');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  await cdp.send('Page.navigate', { url: APP }); await sleep(800);
  await ev(`localStorage.clear(); localStorage.setItem('defectMarkerTabletMode_v1','on'); true`);
  await cdp.send('Page.navigate', { url: APP }); await sleep(1400);
  const r = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#addDrawingInput')` });
  await cdp.send('DOM.setFileInputFiles', { files: [ROOT + 'test-fixtures/plan.png'], objectId: r.result.objectId }); await sleep(1100);
  let t = await tabs();
  t.forEach((x, i) => {
    const name = i ? '결함목록' : '도면유형';
    ok(x.글 === name && x.방향 === 'vertical-rl' && x.세움 === 'upright', `${name} : 한 글자씩 세로`, x);
    ok(x.글자높이 >= 44 && x.글자폭 <= 20, '  글자가 한 줄로 세로로 놓인다', x);
    ok(x.중심차 <= 1.5, '  도면 칸의 세로 가운데', x);
    ok(x.높이 >= 64 && x.폭 >= 28 && (i ? x.오 : x.왼) <= 0.5, '  가장자리에 붙고 누르기 충분한 크기', x);
  });
  await shot(`1119d-tabs-${w}.png`);
  await ev(`document.getElementById('btnFloatCanvasMax').click(); true`); await sleep(350);
  t = await tabs(); ok(t.every(x => x.중심차 <= 1.5), '크게 보기에서도 가운데', t.map(x => x.중심차));
  await ev(`document.getElementById('btnFloatCanvasMax').click(); true`); await sleep(350);

  await ev(`(()=>{const d=${D},k=__markerDbg.info.allPresets()[0].series[0].key;d.markers=Array.from({length:12},(_,i)=>({id:'t'+i,uid:'u'+i,typeKey:k,xPct:10+i*6,yPct:30,angle:0,seq:i+1,rptType:'벽체',rptMember:'콘크리트',rptDefect:'균열'}));__markerDbg.renderTable();__markerDbg.renderCanvas();return true})()`);
  await click('btnDrawerRight');
  const c = await ev(`(()=>{const cs=[...document.querySelectorAll('.marker-card')],a=cs[0],R=e=>e.getBoundingClientRect(),hs=[...a.querySelectorAll('input,select,.cbtn,.mc-photo,.mc-info,.row-del')].filter(e=>e.getClientRects().length).map(e=>Math.round(R(e).height));return {카드:Math.round(R(a).height),간격:Math.round(R(cs[1]).top-R(a).bottom),칸:[...new Set(hs)],넘침:a.scrollWidth-a.clientWidth,콘크리트:(()=>{const i=a.querySelector('[data-role=rptMember]');return i.scrollWidth<=i.clientWidth+1})()}})()`);
  ok(c.칸.length === 1 && c.칸[0] === 36, '카드의 칸·단추 높이 36px', c);
  ok(c.카드 <= (w <= 640 ? 130 : 90), `카드 전체 높이 ${w <= 640 ? '130(휴대폰 3줄)' : '90'}px 이하(이전 116px)`, c);
  ok(c.간격 <= 6, '카드 사이 간격이 좁다', c);
  ok(c.넘침 <= 0 && c.콘크리트, '칸이 넘치거나 글자가 잘리지 않는다', c);
  const clip = await ev(`(()=>{const a=document.querySelector('.marker-card');return ['pos','rptWidth','rptTag'].map(k=>{const e=a.querySelector('[data-role='+k+']');return e.getBoundingClientRect().width})})()`);
  ok(clip[0] >= 24 && clip[1] >= 44 && clip[2] >= 44, '번호·폭·사진번호 칸이 읽을 수 있는 폭', clip);
  ok(await ev(`(()=>{document.getElementById('btnDrawerRight').click();return true})()`) && await (async () => { await sleep(300); const o = await ev(`(()=>{const v=id=>{const e=document.getElementById(id);return getComputedStyle(e).display!=='none'?e.getBoundingClientRect():null};const a=v('btnDrawerLeft'),b=v('btnDrawerRight');return !a||!b||a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top})()`); await ev(`document.getElementById('btnDrawerRight').click(); true`); await sleep(300); return o; })(), '서랍을 열어도 두 탭이 겹치지 않는다');
  await shot(`1119d-cards-${w}.png`);
  await click('btnDrawerRight');
}
console.log(`\n${passes} 통과 / ${fails} 실패`);
finish(cdp, fails ? 1 : 0);
