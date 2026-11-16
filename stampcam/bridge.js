/* 결함마킹 ↔ 번호 스탬프 카메라 연결
 *
 * 결함마킹 앱의 사진 창에서 「스탬프 촬영」을 누르면 이 화면이 뜬다. 찍으면
 *   1) 스탬프 카메라와 똑같이 번호(+메모·날짜)를 찍고, 스탬프 카메라 설정대로 저장한다
 *      (다운로드 폴더 / 스탬프 카메라 앱 목록 — 파일이름 규칙도 그대로)
 *   2) 번호를 하나 올린다
 *   3) 찍은 사진과 번호를 onShot 으로 결함마킹 앱에 넘긴다 (결함에 첨부 + 사진번호 칸 채우기)
 *
 * 번호·메모·저장 방식은 스탬프 카메라의 설정(localStorage 'stampcam.settings.v1')과
 * 촬영 목록(IndexedDB 'stampcam')을 그대로 읽고 쓴다. 두 앱이 같은 주소
 * (yeop9701.github.io) 아래에 있으면 브라우저가 같은 저장소로 보므로 번호가 하나로 이어진다.
 * 그래서 설정은 붙잡아 두지 않고 찍을 때마다 새로 읽고, 올린 번호는 곧바로 써 둔다.
 */

const FLASH_SETTLE_MS = 700;          // 스탬프 카메라와 같은 값 (손전등 켜고 노출이 맞춰질 때까지)
const FLASH_LABEL = { off: '플래시 끔', shot: '촬영 때만', on: '계속 켬' };
const FLASH_NEXT = { off: 'shot', shot: 'on', on: 'off' };

const sub = (s) => (s.sameOn ? s.sub : 0);
function nextNumberText(s) { return formatNumber(s.current, s, sub(s)); }
function textsFor(s, date) {
  return {
    numberText: s.numberOn ? nextNumberText(s) : '',
    memoText: s.memoOn ? String(s.memo || '').trim() : '',
    dateText: s.dateOn ? formatDate(date, s.dateFormat) : '',
  };
}
async function makeThumb(canvas) {
  const max = 240;
  const r = Math.min(1, max / Math.max(canvas.width, canvas.height));
  const t = document.createElement('canvas');
  t.width = Math.round(canvas.width * r);
  t.height = Math.round(canvas.height * r);
  t.getContext('2d').drawImage(canvas, 0, 0, t.width, t.height);
  return canvasToBlob(t, 0.7);
}

/* 원본(source)의 crop 영역에 스탬프를 찍어 저장하고 번호를 올린다.
   돌려주는 것 : { canvas, number, numberText, name, saved: 'download'|'list' } */
async function stampAndStore(source, width, height, date, crop) {
  crop = crop || { x: 0, y: 0, w: width, h: height };
  const s = loadSettings();                       // 찍을 때마다 새로 — 스탬프 카메라 앱과 번호를 같이 쓴다
  const number = s.current;
  const numberText = nextNumberText(s);
  const memo = String(s.memo || '').trim();

  const c = document.createElement('canvas');
  c.width = crop.w;
  c.height = crop.h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  drawStamp(ctx, crop.w, crop.h, textsFor(s, date), s);

  const name = buildFileName(s.fileName, numberText, date, memo);
  const blob = await canvasToBlob(c, s.quality / 100);
  /* 「공유」 방식은 찍을 때마다 공유 창이 떠서 결함 기록 흐름을 끊는다 → 앱 목록에만 둔다 */
  const mode = s.saveMode === 'download' ? 'download' : 'list';
  if (s.keepInList || mode === 'list') {
    try {
      await addShot({ name, numberText, memo, createdAt: date.getTime(), blob, thumb: await makeThumb(c), width: c.width, height: c.height });
    } catch (e) {
      if (mode === 'list') throw new Error('스탬프 카메라 목록에 저장하지 못했습니다: ' + (e.message || e));
      console.warn(e);
    }
  }
  if (mode === 'download') downloadBlob(blob, name);

  /* 저장이 끝난 뒤에만 번호를 올린다 (그 사이 스탬프 카메라에서 바뀐 값도 다시 읽어 반영) */
  const now = loadSettings();
  if (now.current === s.current && now.sub === s.sub && now.sameOn === s.sameOn) {
    if (now.sameOn) now.sub++;
    else now.current = nextValue(now.current, now);
  }
  saveSettings(now);
  return { canvas: c, number, numberText, name, saved: mode, sameOn: s.sameOn };
}

/* ── 화면 ─────────────────────────────────────────────────────── */
const CSS = `
.sc-ov{position:fixed;inset:0;z-index:100000;background:#000;color:#fff;display:grid;
  grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto minmax(0,1fr) auto;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Malgun Gothic",sans-serif;touch-action:manipulation;}
.sc-top{display:flex;align-items:center;gap:8px;padding:calc(8px + env(safe-area-inset-top)) 10px 8px;background:rgba(0,0,0,.6);flex-wrap:wrap;}
.sc-top .sc-title{flex:1;min-width:120px;font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sc-btn{border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.12);color:#fff;border-radius:10px;
  min-height:42px;padding:0 12px;font-size:14px;font-weight:700;cursor:pointer;}
.sc-btn:disabled{opacity:.4;}
.sc-next{font-size:13px;opacity:.9;white-space:nowrap;}
.sc-next b{font-size:17px;color:#ffd84d;}
.sc-memo{display:flex;gap:6px;align-items:center;padding:0 10px 8px;background:rgba(0,0,0,.6);}
.sc-memo input{flex:1;min-width:0;min-height:40px;border-radius:9px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.1);color:#fff;padding:0 10px;font-size:15px;}
.sc-view{min-height:0;min-width:0;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;}
.sc-frame{position:relative;max-width:100%;max-height:100%;overflow:hidden;background:#111;}
.sc-frame video{width:100%;height:100%;object-fit:cover;display:block;}
.sc-frame .sc-focus{position:absolute;width:64px;height:64px;margin:-32px 0 0 -32px;border:2px solid #ffd84d;border-radius:8px;pointer-events:none;opacity:0;transition:opacity .2s;}
.sc-frame .sc-focus.on{opacity:1;}
.sc-flashfx{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;}
.sc-flashfx.on{animation:scfx .25s ease-out;}
@keyframes scfx{from{opacity:.85}to{opacity:0}}
.sc-msg{position:absolute;left:12px;right:12px;top:40%;text-align:center;font-size:15px;line-height:1.6;}
.sc-bot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px calc(14px + env(safe-area-inset-bottom));background:rgba(0,0,0,.6);}
.sc-thumb{width:58px;height:58px;border-radius:10px;border:2px solid rgba(255,255,255,.5);background:#222 center/cover no-repeat;position:relative;}
.sc-thumb span{position:absolute;right:-8px;top:-8px;background:#ffd84d;color:#000;border-radius:999px;font-size:12px;font-weight:800;min-width:22px;height:22px;display:flex;align-items:center;justify-content:center;padding:0 5px;}
.sc-shutter{width:76px;height:76px;border-radius:50%;border:5px solid #fff;background:#fff;box-shadow:inset 0 0 0 4px #000;cursor:pointer;}
.sc-shutter:disabled{opacity:.4;}
.sc-shutter:active{transform:scale(.95);}
.sc-toast{position:absolute;left:50%;bottom:120px;transform:translateX(-50%);background:rgba(20,20,20,.92);padding:9px 16px;border-radius:999px;font-size:14px;white-space:nowrap;max-width:92vw;overflow:hidden;text-overflow:ellipsis;pointer-events:none;}
/* 가로 화면 : 셔터 줄을 오른쪽 세로 막대로 (스탬프 카메라와 같다) */
@media (orientation:landscape){
  .sc-ov{grid-template-columns:minmax(0,1fr) 116px;grid-template-rows:auto auto minmax(0,1fr);}
  .sc-top,.sc-memo{grid-column:1 / -1;}
  .sc-view{grid-column:1;grid-row:3;}
  .sc-bot{grid-column:2;grid-row:3;flex-direction:column;justify-content:center;padding:10px 8px calc(10px + env(safe-area-inset-bottom));}
}`;

let ui = null;            // 열려 있는 화면 (한 번에 하나)

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
const escH = (s) => String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function open(opts) {
  opts = opts || {};
  if (ui) close();
  if (!document.getElementById('sc-style')) {
    const st = el('style'); st.id = 'sc-style'; st.textContent = CSS; document.head.appendChild(st);
  }
  const ov = el('div', 'sc-ov');
  ov.setAttribute('role', 'dialog');
  ov.innerHTML =
    '<div class="sc-top">' +
      '<button type="button" class="sc-btn" data-sc="close" title="닫기">✕ 닫기</button>' +
      '<div class="sc-title">' + escH(opts.title || '스탬프 촬영') + '</div>' +
      '<div class="sc-next">다음 번호 <b data-sc="next"></b></div>' +
    '</div>' +
    '<div class="sc-memo">' +
      '<input type="text" data-sc="memo" placeholder="메모 (위치·부재) — 파일이름의 {메모}" autocomplete="off">' +
      (opts.memoSuggest ? '<button type="button" class="sc-btn" data-sc="suggest" title="' + escH(opts.memoSuggest) + '">결함 정보로</button>' : '') +
    '</div>' +
    '<div class="sc-view"><div class="sc-frame" data-sc="frame"><video playsinline muted autoplay></video>' +
      '<div class="sc-focus" data-sc="focus"></div><div class="sc-flashfx" data-sc="fx"></div></div>' +
      '<div class="sc-msg" data-sc="msg">카메라를 켜는 중…</div></div>' +
    '<div class="sc-bot">' +
      '<button type="button" class="sc-btn" data-sc="flash"></button>' +
      '<button type="button" class="sc-shutter" data-sc="shutter" title="촬영 (Space)" disabled></button>' +
      '<div class="sc-thumb" data-sc="thumb" title="이번에 찍은 사진"></div>' +
    '</div>';
  document.body.appendChild(ov);
  const $ = (k) => ov.querySelector('[data-sc="' + k + '"]');
  const video = ov.querySelector('video');
  const camera = new Camera(video);
  const state = { ov, camera, opts, busy: false, shots: 0, resume: false, toastT: 0 };
  ui = state;

  const toast = (msg, ms) => {
    let t = ov.querySelector('.sc-toast');
    if (!t) { t = el('div', 'sc-toast'); ov.appendChild(t); }
    t.textContent = msg;
    clearTimeout(state.toastT);
    state.toastT = setTimeout(() => t.remove(), ms || 2200);
  };
  state.toast = toast;
  const refreshTop = () => {
    const s = loadSettings();
    $('next').textContent = nextNumberText(s);
    $('flash').textContent = '⚡ ' + FLASH_LABEL[s.flashMode || 'off'];
    if (document.activeElement !== $('memo')) $('memo').value = s.memo || '';
  };
  state.refreshTop = refreshTop;
  refreshTop();

  /* 미리보기 칸을 저장될 4:3(세로면 3:4) 모양으로 — 보이는 그대로 찍힌다 */
  const fit = () => {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const c = crop43(vw, vh);
    const box = $('frame').parentElement.getBoundingClientRect();
    const r = Math.min(box.width / c.w, box.height / c.h);
    $('frame').style.width = Math.floor(c.w * r) + 'px';
    $('frame').style.height = Math.floor(c.h * r) + 'px';
  };
  state.fit = fit;
  video.addEventListener('loadedmetadata', fit);
  window.addEventListener('resize', fit);

  async function start() {
    $('msg').textContent = '카메라를 켜는 중…';
    $('msg').style.display = '';
    try {
      await camera.start('environment');
      if (ui !== state) { camera.stop(); return; }
      $('msg').style.display = 'none';
      $('shutter').disabled = false;
      fit();
      const s = loadSettings();
      if (s.flashMode === 'on') camera.setTorch(true);
      $('flash').disabled = !camera.torchSupported;
    } catch (e) {
      $('msg').textContent = cameraErrorMessage(e);
      $('shutter').disabled = true;
    }
  }
  state.start = start;

  async function shoot() {
    if (state.busy || !camera.active) return;
    state.busy = true;
    $('shutter').disabled = true;
    const s = loadSettings();
    let lit = s.flashMode === 'shot' && (await camera.setTorch(true));
    try {
      if (lit) await new Promise((r) => setTimeout(r, FLASH_SETTLE_MS));
      const date = new Date();
      const shot = await camera.capture(s.hiRes);
      if (lit) { lit = false; await camera.setTorch(false); }
      const fx = $('fx'); fx.classList.remove('on'); void fx.offsetWidth; fx.classList.add('on');
      if (navigator.vibrate) navigator.vibrate(30);
      const res = await stampAndStore(shot.source, shot.width, shot.height, date, crop43(shot.width, shot.height));
      state.shots++;
      $('thumb').style.backgroundImage = 'url(' + res.canvas.toDataURL('image/jpeg', 0.6) + ')';
      $('thumb').innerHTML = '<span>' + state.shots + '</span>';
      refreshTop();
      let note = '';
      try { note = (opts.onShot && opts.onShot(res)) || ''; } catch (e) { console.error(e); note = '결함에 붙이지 못했습니다'; }
      toast(res.numberText + (res.saved === 'download' ? ' 저장됨' : ' 스탬프 카메라 목록에 저장됨') + (note ? ' · ' + note : ''));
    } catch (e) {
      console.error(e);
      toast('촬영 실패: ' + (e.message || e), 3000);
    } finally {
      if (lit) camera.setTorch(false);
      state.busy = false;
      $('shutter').disabled = !camera.active;
    }
  }
  state.shoot = shoot;

  ov.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-sc]');
    if (!b) return;
    const k = b.dataset.sc;
    if (k === 'close') close();
    else if (k === 'shutter') shoot();
    else if (k === 'flash') {
      const s = loadSettings();
      s.flashMode = FLASH_NEXT[s.flashMode || 'off'] || 'off';
      saveSettings(s);
      await camera.setTorch(s.flashMode === 'on');
      refreshTop();
    } else if (k === 'suggest') {
      $('memo').value = opts.memoSuggest;
      $('memo').dispatchEvent(new Event('input'));
    }
  });
  /* 메모는 스탬프 카메라와 같은 칸 — 바꾸면 그쪽 메모도 바뀐다 */
  $('memo').addEventListener('input', () => {
    const s = loadSettings();
    s.memo = $('memo').value;
    saveSettings(s);
  });
  $('memo').addEventListener('change', () => {
    const s = loadSettings();
    const m = s.memo.trim();
    if (m) { s.memoRecent = [m].concat(s.memoRecent.filter((x) => x !== m)).slice(0, 12); saveSettings(s); }
    refreshTop();
  });
  /* 눌러서 초점 */
  $('frame').addEventListener('pointerdown', async (e) => {
    if (!camera.active) return;
    const r = $('frame').getBoundingClientRect();
    const f = $('focus');
    f.style.left = (e.clientX - r.left) + 'px'; f.style.top = (e.clientY - r.top) + 'px';
    f.classList.add('on');
    setTimeout(() => f.classList.remove('on'), 900);
    /* 화면 칸은 영상의 가운데 4:3 이므로 영상 좌표로 되돌린다 */
    const c = crop43(video.videoWidth, video.videoHeight);
    const nx = (c.x + (e.clientX - r.left) / r.width * c.w) / video.videoWidth;
    const ny = (c.y + (e.clientY - r.top) / r.height * c.h) / video.videoHeight;
    camera.focusAt(nx, ny);
  });
  state.onKey = (e) => {
    if (ui !== state) return;
    if (document.activeElement === $('memo')) { if (e.key === 'Enter') $('memo').blur(); return; }
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.code === 'Space' || e.key === 'Enter' || e.code === 'AudioVolumeUp' || e.code === 'AudioVolumeDown') { e.preventDefault(); shoot(); }
  };
  document.addEventListener('keydown', state.onKey, true);
  /* 다른 앱으로 갔다 오면 카메라를 껐다 다시 켠다 (스탬프 카메라에서 바뀐 번호도 다시 읽는다) */
  state.onVis = () => {
    if (ui !== state) return;
    if (document.hidden) { state.resume = camera.active; camera.stop(); }
    else { refreshTop(); if (state.resume) { state.resume = false; start(); } }
  };
  document.addEventListener('visibilitychange', state.onVis);
  state.onStorage = (e) => { if (ui === state && (!e.key || e.key === 'stampcam.settings.v1')) refreshTop(); };
  window.addEventListener('storage', state.onStorage);

  start();
  return state;
}

function close() {
  const s = ui;
  if (!s) return;
  ui = null;
  try { s.camera.setTorch(false); } catch (e) {}
  s.camera.stop();
  document.removeEventListener('keydown', s.onKey, true);
  document.removeEventListener('visibilitychange', s.onVis);
  window.removeEventListener('storage', s.onStorage);
  window.removeEventListener('resize', s.fit);
  s.ov.remove();
  if (s.opts.onClose) try { s.opts.onClose(s.shots); } catch (e) {}
}

/* 기본 카메라 앱·갤러리에서 받은 사진 파일에 번호를 찍는다 (스탬프 카메라의 「기본 카메라」와 같음).
   원본 비율 그대로, 날짜는 지금. 한 장씩 차례로 번호가 오른다. */
async function stampFiles(files, onShot) {
  const out = [];
  for (const file of Array.from(files || [])) {
    if (!file.type || !file.type.startsWith('image/')) continue;
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const res = await stampAndStore(bmp, bmp.width, bmp.height, new Date());
      out.push(res);
      if (onShot) onShot(res);
    } finally {
      if (bmp.close) bmp.close();
    }
  }
  return out;
}

window.StampCam = {
  open, close, stampFiles,
  isOpen: () => !!ui,
  /* 다음에 찍힐 번호 (글자 / 숫자) */
  peek: () => { const s = loadSettings(); return { number: s.current, numberText: nextNumberText(s), sameOn: s.sameOn, saveMode: s.saveMode }; },
  /* 검사용 */
  _debug: { loadSettings, saveSettings, stampAndStore, formatNumber, crop43, listShots, clearShots, get ui() { return ui; } },
};
