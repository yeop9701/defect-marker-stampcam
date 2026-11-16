/* 자동 생성 파일 — 직접 고치지 말 것. 원본 : stampcam/src/*.js + stampcam/bridge.js, 만들기 : node stampcam/build.mjs */
(function () {
"use strict";

/* ── counter.js ── */
const { formatNumber, nextValue, DATE_FORMATS, formatDate, buildFileName } = (function () {
// 번호 계산과 표시 형식, 날짜 형식, 파일명 규칙.

// sub: 같은 번호로 여러 장 찍을 때 뒤 번호 (0이면 없음) → 접두어 0012-2 접미어
function formatNumber(n, s, sub = 0) {
  const neg = n < 0;
  let body = String(Math.abs(n));
  if (s.pad > 0) body = body.padStart(s.pad, '0');
  const tail = sub > 0 ? (s.subSep ?? '-') + sub : '';
  return s.prefix + (neg ? '-' : '') + body + tail + s.suffix;
}

function nextValue(n, s) {
  return n + s.step;
}

const p2 = (v) => String(v).padStart(2, '0');

const DATE_FORMATS = [
  'YYYY-MM-DD HH:mm',
  'YYYY-MM-DD HH:mm:ss',
  'YYYY-MM-DD',
  'YYYY.MM.DD HH:mm',
  'YY.MM.DD HH:mm',
  'YY.MM.DD',
  'HH:mm:ss',
  'HH:mm',
];

function formatDate(d, fmt) {
  const map = {
    YYYY: String(d.getFullYear()),
    YY: String(d.getFullYear()).slice(2),
    MM: p2(d.getMonth() + 1),
    DD: p2(d.getDate()),
    HH: p2(d.getHours()),
    mm: p2(d.getMinutes()),
    ss: p2(d.getSeconds()),
  };
  return fmt.replace(/YYYY|YY|MM|DD|HH|mm|ss/g, (t) => map[t]);
}

// 파일명 규칙: {no}/{번호} 번호, {date}/{날짜} 20261029, {time}/{시간} 143012, {memo}/{메모} 메모
// 메모가 비어 있으면 {memo}와 붙어 있는 구분 기호(_ - 공백 하나)를 같이 뺀다: 날짜_번호_{memo} → 날짜_번호
function buildFileName(pattern, numberText, d, memo = '') {
  const date = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
  const time = `${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  let name = (pattern || '{no}')
    .replace(/\{(no|번호)\}/g, numberText)
    .replace(/\{(date|날짜)\}/g, date)
    .replace(/\{(time|시간)\}/g, time);
  const m = String(memo || '').trim();
  if (m) name = name.replace(/\{(memo|메모)\}/g, m);
  else {
    name = name
      .replace(/^\{(memo|메모)\}[_\- ]?/, '')
      .replace(/[_\- ]?\{(memo|메모)\}/g, '');
  }
  name = name.replace(/[\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return (name || 'photo') + '.jpg';
}

return { formatNumber, nextValue, DATE_FORMATS, formatDate, buildFileName };
})();

/* ── settings.js ── */
const { DEFAULTS, loadSettings, saveSettings } = (function () {
// 설정값: localStorage에 JSON 하나로 저장한다. 사진은 넣지 않는다.
const KEY = 'stampcam.settings.v1';

const DEFAULTS = {
  // 번호
  numberOn: false,     // 사진에 번호 표시 (꺼도 번호는 파일명에 쓰이고 계속 올라감)
  current: 1,          // 다음에 찍힐 번호
  start: 1,
  step: 1,
  pad: 4,              // 자릿수 0 채우기 (0이면 안 채움)
  prefix: '',
  suffix: '',
  // 같은 번호로 여러 장 (0012-1, 0012-2 …)
  sameOn: false,       // 켜져 있으면 번호는 그대로, 뒤 번호(sub)만 오른다
  sub: 1,              // 다음에 찍힐 뒤 번호
  subSep: '-',         // 번호와 뒤 번호 사이 기호
  // 메모 (위치·부재명)
  memo: '',
  memoOn: false,       // 사진에 메모 표시 (꺼도 파일명 {memo}에는 들어감)
  memoRecent: [],      // 최근 메모 (최대 12개)
  // 위치
  position: 'tl',      // tl tc tr ml mc mr bl bc br
  margin: 3,           // 사진 짧은 변 기준 %
  // 글자
  size: 8,             // 사진 짧은 변 기준 %
  bold: true,
  color: '#ffffff',
  // 테두리
  outline: true,
  outlineWidth: 3,     // 1~10 단계
  outlineColor: '#000000',
  box: false,
  boxColor: '#000000',
  boxOpacity: 50,      // %
  // 날짜/시간
  dateOn: false,       // 사진에 날짜/시간 표시
  dateFormat: 'YYYY-MM-DD HH:mm',
  dateLayout: 'below', // below | inline
  // 저장
  saveMode: 'download',  // download | share | list
  keepInList: true,
  fileName: '{date}_{no}_{memo}', // 메모가 비면 {memo}와 그 앞 _ 는 빠진다
  quality: 92,
  // 카메라
  facing: 'environment',
  hiRes: false,        // ImageCapture.takePhoto 사용 (실험)
  flashMode: 'off',    // off | shot(촬영할 때만) | on(계속 켜기)
  // 화면 보조 (사진에는 안 찍힘)
  gridOn: false,       // 3×3 격자선
  levelOn: false,      // 수평 표시
  rev: 4,              // 설정 판 번호 (아래 REV_MIGRATIONS)
};

// 예전 기본값을 그대로 쓰던 설정은 새 기본값으로 옮긴다 (직접 바꾼 값은 유지)
const OLD_DEFAULTS = { fileName: ['{no}_{date}_{time}'] };
// 판이 오를 때 한 번만 옮기는 값 { 판: { 키: { 옛값: 새값 } } }
//  rev 2: "사진에 표시" 기본값을 껐다 → 예전 판에서 켜진 채 저장된 것도 끈다
//  rev 3: 자릿수 기본값 3 → 4
//  rev 4: 파일명 목록에 메모가 들어감 → 목록에서 고른 옛 규칙은 같은 순서 + _{memo} (메모가 비면 파일명은 그대로)
const REV_MIGRATIONS = {
  2: { numberOn: { true: false }, dateOn: { true: false } },
  3: { pad: { 3: 4 } },
  4: {
    fileName: {
      '{date}_{no}': '{date}_{no}_{memo}',
      '{no}_{date}': '{no}_{memo}_{date}',
      '{date}_{time}_{no}': '{date}_{time}_{no}_{memo}',
      '{no}': '{no}_{memo}',
    },
  },
};

const sameType = (a, b) => (Array.isArray(b) ? Array.isArray(a) : typeof a === typeof b);

function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, memoRecent: [] };
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return { ...DEFAULTS, memoRecent: [] };
    // 모르는 키는 버리고, 없는 키는 기본값으로 채운다 (설정 구조가 바뀌어도 안전)
    const out = { ...DEFAULTS, memoRecent: [] };
    for (const k of Object.keys(DEFAULTS)) {
      if (k in saved && sameType(saved[k], DEFAULTS[k])) out[k] = saved[k];
    }
    out.memoRecent = out.memoRecent.filter((m) => typeof m === 'string' && m).slice(0, 12);
    for (const [k, olds] of Object.entries(OLD_DEFAULTS)) {
      if (olds.includes(out[k])) out[k] = DEFAULTS[k];
    }
    const savedRev = typeof saved.rev === 'number' ? saved.rev : 1;
    for (const [rev, map] of Object.entries(REV_MIGRATIONS)) {
      if (savedRev >= Number(rev)) continue;
      for (const [k, pairs] of Object.entries(map)) {
        const key = String(out[k]);
        if (Object.prototype.hasOwnProperty.call(pairs, key)) out[k] = pairs[key];
      }
    }
    if (!(out.sub >= 1)) out.sub = 1;
    out.rev = DEFAULTS.rev;
    return out;
  } catch (e) {
    return { ...DEFAULTS, memoRecent: [] };
  }
}

function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch (e) {
    return false;
  }
}

return { DEFAULTS, loadSettings, saveSettings };
})();

/* ── stamp.js ── */
const { drawStamp } = (function () {
// canvas에 번호·날짜 스탬프를 그린다. 미리보기 오버레이와 저장 이미지가 같은 함수를 쓴다.
// 크기·여백은 모두 사진 짧은 변 기준 비율이라 해상도가 달라도 모양이 같다.

const DATE_RATIO = 0.6; // 아래 줄 날짜 글자 크기 (번호 대비)
const MEMO_RATIO = 0.7; // 메모 줄 글자 크기 (번호 대비)

function hexToRgba(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const v = m ? parseInt(m[1], 16) : 0;
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
}

function drawStamp(ctx, w, h, texts, s) {
  const short = Math.min(w, h);
  let fontPx = Math.max(4, (short * s.size) / 100);
  const margin = (short * s.margin) / 100;
  const weight = s.bold ? 'bold' : 'normal';
  const family = 'system-ui, "Noto Sans KR", "Malgun Gothic", sans-serif';

  // 줄 구성: 번호(+옆 날짜) / 메모 / 날짜. 빈 문자열은 빠진다 (번호를 끄면 메모·날짜만, 크기는 그대로)
  const lines = [];
  const inline = texts.numberText && texts.dateText && s.dateLayout === 'inline';
  if (inline) lines.push({ text: `${texts.numberText}  ${texts.dateText}`, px: fontPx });
  else if (texts.numberText) lines.push({ text: texts.numberText, px: fontPx });
  if (texts.memoText) lines.push({ text: texts.memoText, px: fontPx * MEMO_RATIO });
  if (texts.dateText && !inline) lines.push({ text: texts.dateText, px: fontPx * DATE_RATIO });
  if (!lines.length) return;
  fontPx = Math.max(...lines.map((l) => l.px)); // 여백·외곽선·박스 크기의 기준

  const outlinePx = s.outline ? fontPx * s.outlineWidth * 0.035 : 0;
  const lineGap = fontPx * 0.15;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  for (const ln of lines) {
    ctx.font = `${weight} ${ln.px}px ${family}`;
    const m = ctx.measureText(ln.text);
    ln.width = m.width;
    ln.ascent = ln.px * 0.8;
    ln.descent = ln.px * 0.22;
  }
  const blockW = Math.max(...lines.map((l) => l.width)) + outlinePx;
  const blockH =
    lines.reduce((a, l) => a + l.ascent + l.descent, 0) + lineGap * (lines.length - 1) + outlinePx;
  const pad = s.box ? fontPx * 0.3 : 0;

  // 9칸 격자 위치 → 블록(배경 박스 포함) 좌상단
  const col = s.position[1]; // l c r
  const row = s.position[0]; // t m b
  const outerW = blockW + pad * 2;
  const outerH = blockH + pad * 2;
  const x0 = col === 'l' ? margin : col === 'r' ? w - margin - outerW : (w - outerW) / 2;
  const y0 = row === 't' ? margin : row === 'b' ? h - margin - outerH : (h - outerH) / 2;

  if (s.box) {
    ctx.fillStyle = hexToRgba(s.boxColor, s.boxOpacity / 100);
    const r = fontPx * 0.15;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, y0, outerW, outerH, r);
    else ctx.rect(x0, y0, outerW, outerH);
    ctx.fill();
  }

  ctx.textAlign = col === 'l' ? 'left' : col === 'r' ? 'right' : 'center';
  const tx =
    col === 'l' ? x0 + pad + outlinePx / 2 : col === 'r' ? x0 + outerW - pad - outlinePx / 2 : x0 + outerW / 2;
  let y = y0 + pad + outlinePx / 2;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  for (const ln of lines) {
    y += ln.ascent;
    ctx.font = `${weight} ${ln.px}px ${family}`;
    if (outlinePx > 0) {
      ctx.strokeStyle = s.outlineColor;
      ctx.lineWidth = outlinePx * (ln.px / fontPx);
      ctx.strokeText(ln.text, tx, y);
    }
    ctx.fillStyle = s.color;
    ctx.fillText(ln.text, tx, y);
    y += ln.descent + lineGap;
  }
  ctx.restore();
}

return { drawStamp };
})();

/* ── save.js ── */
const { downloadBlob, canShareFiles, shareBlob, shareFiles, canvasToBlob } = (function () {
// 다운로드 / 공유.

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function canShareFiles() {
  try {
    const f = new File([new Blob(['x'], { type: 'image/jpeg' })], 'x.jpg', { type: 'image/jpeg' });
    return !!(navigator.canShare && navigator.canShare({ files: [f] }));
  } catch (e) {
    return false;
  }
}

// 공유 시트를 연다. 사용자가 취소하면 false.
function shareBlob(blob, name) {
  return shareFiles([{ blob, name }]);
}

// 여러 장을 한 번에 공유 (items: [{ blob, name }])
async function shareFiles(items) {
  const files = items.map(({ blob, name }) => new File([blob], name, { type: blob.type || 'image/jpeg' }));
  if (!(navigator.canShare && navigator.canShare({ files }))) {
    throw new Error('이 브라우저는 파일 공유를 지원하지 않습니다.');
  }
  try {
    await navigator.share({ files });
    return true;
  } catch (e) {
    if (e.name === 'AbortError') return false;
    throw e;
  }
}

function canvasToBlob(canvas, quality) {
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('이미지를 만들지 못했습니다.'))), 'image/jpeg', quality)
  );
}

return { downloadBlob, canShareFiles, shareBlob, shareFiles, canvasToBlob };
})();

/* ── storage.js ── */
const { addShot, deleteShot, clearShots, getShot, listShots, allShotsWithBlobs, requestPersist } = (function () {
// 촬영 목록 (IndexedDB). 항목: { id, name, numberText, createdAt, blob, thumb }

const DB_NAME = 'stampcam';
const STORE = 'shots';
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => {
        dbPromise = null;
        rej(req.error);
      };
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return open().then(
    (db) =>
      new Promise((res, rej) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result;
        Promise.resolve(fn(store)).then((r) => (result = r));
        t.oncomplete = () => res(result);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error || new Error('저장 공간이 부족합니다.'));
      })
  );
}

const reqP = (req) => new Promise((res, rej) => {
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});

function addShot(item) {
  return tx('readwrite', (s) => reqP(s.add(item)));
}

function deleteShot(id) {
  return tx('readwrite', (s) => reqP(s.delete(id)));
}

function clearShots() {
  return tx('readwrite', (s) => reqP(s.clear()));
}

function getShot(id) {
  return tx('readonly', (s) => reqP(s.get(id)));
}

// 목록 화면용: 원본 blob 없이 가볍게
function listShots() {
  return tx('readonly', (s) => new Promise((res, rej) => {
    const out = [];
    const req = s.openCursor(null, 'prev');
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return res(out);
      const { blob, ...rest } = c.value;
      out.push({ ...rest, size: blob ? blob.size : 0 });
      c.continue();
    };
    req.onerror = () => rej(req.error);
  }));
}

async function allShotsWithBlobs() {
  const items = await tx('readonly', (s) => reqP(s.getAll()));
  return items.sort((a, b) => a.id - b.id);
}

async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (e) { /* 무시 */ }
  return false;
}

return { addShot, deleteShot, clearShots, getShot, listShots, allShotsWithBlobs, requestPersist };
})();

/* ── camera.js ── */
const { FOCUS_HOLD_MS, Camera, zoomCrop, crop43, cameraErrorMessage } = (function () {
// 카메라 스트림 시작/전환/캡처, 줌·초점.

const FOCUS_HOLD_MS = 6000; // 눌러서 맞춘 초점을 유지하는 시간

class Camera {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.facing = 'environment';
  }

  get active() {
    return !!this.stream;
  }

  async start(facing = this.facing) {
    this.stop();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw Object.assign(new Error('이 브라우저는 카메라를 지원하지 않습니다.'), { name: 'NotSupportedError' });
    }
    this.facing = facing;
    // 4:3에서 가능한 가장 큰 해상도를 요청한다 (기기가 지원하는 값으로 맞춰지고,
    // 다른 비율이 오면 저장할 때 가운데를 4:3으로 자른다 — crop43)
    const video = {
      facingMode: { ideal: facing },
      width: { ideal: 4096 },
      height: { ideal: 3072 },
      aspectRatio: { ideal: 4 / 3 },
    };
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (e) {
      if (e.name === 'OverconstrainedError') {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
      } else {
        throw e;
      }
    }
    this.stream = stream;
    this.video.srcObject = stream;
    this.video.classList.toggle('mirror', facing === 'user');
    await this.video.play().catch(() => {});
    if (!this.video.videoWidth) {
      await new Promise((res) => this.video.addEventListener('loadedmetadata', res, { once: true }));
    }
  }

  get track() {
    return this.stream ? this.stream.getVideoTracks()[0] : null;
  }

  // 플래시(손전등) 지원 여부 — 안드로이드 크롬 후면 카메라에서 주로 지원
  get torchSupported() {
    const t = this.track;
    try {
      return !!(t && t.getCapabilities && t.getCapabilities().torch);
    } catch (e) {
      return false;
    }
  }

  async setTorch(on) {
    if (!this.torchSupported) return false;
    try {
      await this.track.applyConstraints({ advanced: [{ torch: !!on }] });
      return true;
    } catch (e) {
      console.warn('플래시 제어 실패', e);
      return false;
    }
  }

  caps() {
    const t = this.track;
    try {
      return (t && t.getCapabilities && t.getCapabilities()) || {};
    } catch (e) {
      return {};
    }
  }

  // 카메라 자체 줌 범위 { min, max, step } — 지원 안 하면 null (그때는 화면에서 디지털 줌)
  get zoomRange() {
    const z = this.caps().zoom;
    return z && z.max > z.min ? { min: z.min, max: z.max, step: z.step || 0.1 } : null;
  }

  async setZoom(z) {
    if (!this.zoomRange) return false;
    try {
      await this.track.applyConstraints({ advanced: [{ zoom: z }] });
      return true;
    } catch (e) {
      console.warn('줌 실패', e);
      return false;
    }
  }

  // 눌러서 초점: x, y는 영상 안 위치(0~1). 지원 안 하면 false
  // 한 번 맞추기(single-shot)로 그 자리에 초점을 잡고, 잠시 뒤 연속 자동 초점으로 돌린다
  // (계속 잠가 두면 다음 결함으로 옮겨 찍을 때 흐려진다)
  async focusAt(x, y) {
    const c = this.caps();
    const modes = c.focusMode || [];
    if (!modes.length || !(modes.includes('single-shot') || modes.includes('continuous'))) return false;
    const point = { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
    const one = { pointsOfInterest: [point], focusMode: modes.includes('single-shot') ? 'single-shot' : 'continuous' };
    if ((c.exposureMode || []).includes('continuous')) one.exposureMode = 'continuous';
    try {
      await this.track.applyConstraints({ advanced: [one] });
    } catch (e) {
      console.warn('초점 맞추기 실패', e);
      return false;
    }
    clearTimeout(this.focusTimer);
    if (one.focusMode === 'single-shot' && modes.includes('continuous')) {
      const track = this.track;
      this.focusTimer = setTimeout(() => {
        if (this.track === track) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
      }, FOCUS_HOLD_MS);
    }
    return true;
  }

  // 고화질 촬영(takePhoto)의 최대 크기 (센서 방향 그대로). 모르면 null
  async photoMax() {
    if (!this.track || !('ImageCapture' in window)) return null;
    try {
      const c = await new ImageCapture(this.track).getPhotoCapabilities();
      const w = c.imageWidth && c.imageWidth.max;
      const h = c.imageHeight && c.imageHeight.max;
      return w && h ? { width: w, height: h } : null;
    } catch (e) {
      return null;
    }
  }

  // 고화질 촬영으로 찍힐 크기 — 미리보기와 같은 가로/세로 방향으로
  async photoSize() {
    const p = await this.photoMax();
    if (!p) return null;
    const v = this.video;
    const turned = v.videoWidth && (v.videoHeight > v.videoWidth) !== (p.height > p.width);
    return turned ? { width: p.height, height: p.width } : p;
  }

  // 고화질이 미리보기 영상보다 실제로 큰가 (작거나 같으면 쓸 이유가 없다)
  async hiResHelps() {
    const p = await this.photoMax();
    return !!p && p.width * p.height > this.video.videoWidth * this.video.videoHeight;
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
  }

  async switchFacing() {
    await this.start(this.facing === 'user' ? 'environment' : 'user');
    return this.facing;
  }

  // 현재 화면을 캡처해 { source, width, height } 를 돌려준다.
  // hiRes면 ImageCapture.takePhoto로 원본 해상도를 시도하고, 실패하면 비디오 프레임으로 대신한다.
  async capture(hiRes) {
    const v = this.video;
    if (!this.stream || !v.videoWidth) throw new Error('카메라가 준비되지 않았습니다.');
    // 고화질이 영상보다 작은 기기(일부 기기·가짜 카메라)는 영상 프레임이 더 낫다
    const max = hiRes ? await this.photoMax() : null;
    if (max && max.width * max.height > v.videoWidth * v.videoHeight) {
      try {
        const track = this.stream.getVideoTracks()[0];
        // 최대 크기를 달라고 명시 (기본값은 기기마다 작게 나오기도 함)
        const ic = new ImageCapture(track);
        const blob = await ic.takePhoto({ imageWidth: max.width, imageHeight: max.height }).catch(() => ic.takePhoto());
        let bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
        // 일부 기기는 센서 방향 그대로 돌려준다 → 미리보기와 가로/세로가 다르면 돌려 맞춘다
        const vPortrait = v.videoHeight > v.videoWidth;
        const pPortrait = bmp.height > bmp.width;
        if (vPortrait !== pPortrait) bmp = rotate90(bmp, this.facing === 'user' ? -1 : 1);
        return { source: bmp, width: bmp.width, height: bmp.height, hiRes: true };
      } catch (e) {
        console.warn('takePhoto 실패, 비디오 프레임으로 대신함', e);
      }
    }
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    return { source: c, width: c.width, height: c.height, hiRes: false };
  }
}

// 디지털 줌: 영역의 가운데 1/z 만 남긴다
function zoomCrop(crop, z) {
  if (!(z > 1)) return crop;
  const w = Math.round(crop.w / z);
  const h = Math.round(crop.h / z);
  return { x: crop.x + Math.round((crop.w - w) / 2), y: crop.y + Math.round((crop.h - h) / 2), w, h };
}

// 가운데를 4:3(세로 사진이면 3:4)으로 자르는 영역 { x, y, w, h }
function crop43(width, height) {
  const ratio = width >= height ? 4 / 3 : 3 / 4;
  if (Math.abs(width / height - ratio) < 0.005) return { x: 0, y: 0, w: width, h: height };
  if (width / height > ratio) {
    const w = Math.round(height * ratio);
    return { x: Math.round((width - w) / 2), y: 0, w, h: height };
  }
  const h = Math.round(width / ratio);
  return { x: 0, y: Math.round((height - h) / 2), w: width, h };
}

function rotate90(src, dir) {
  const c = document.createElement('canvas');
  c.width = src.height;
  c.height = src.width;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((dir * Math.PI) / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

function cameraErrorMessage(e) {
  switch (e && e.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return '카메라 권한이 거부되었습니다. 주소창 왼쪽 자물쇠 → 권한에서 카메라를 허용해 주세요.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return '사용할 수 있는 카메라를 찾지 못했습니다.';
    case 'NotReadableError':
      return '다른 앱이 카메라를 사용 중입니다. 다른 앱을 닫고 다시 시도해 주세요.';
    case 'NotSupportedError':
      return '이 브라우저는 카메라를 지원하지 않습니다. 크롬에서 열어 주세요.';
    default:
      return '카메라를 시작하지 못했습니다: ' + ((e && e.message) || e);
  }
}

return { FOCUS_HOLD_MS, Camera, zoomCrop, crop43, cameraErrorMessage };
})();

/* ── bridge.js ── */
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

})();
