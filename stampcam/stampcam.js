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

// 파일명 규칙: {no}/{번호} 번호, {date}/{날짜} 20261029, {time}/{시간} 143012, {memo}/{메모} 메모,
//   {cam}/{카메라} 카메라명 — 외관조사·3종 체크리스트 등 점검 앱은 사진을 「카메라명+번호 4자리」(KIM0012.jpg)로 찾는다
// 메모가 비어 있으면 {memo}와 붙어 있는 구분 기호(_ - 공백 하나)를 같이 뺀다: 날짜_번호_{memo} → 날짜_번호
function buildFileName(pattern, numberText, d, memo = '', cam = '') {
  const date = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
  const time = `${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  let name = (pattern || '{no}')
    .replace(/\{(no|번호)\}/g, numberText)
    .replace(/\{(date|날짜)\}/g, date)
    .replace(/\{(time|시간)\}/g, time)
    .replace(/\{(cam|카메라)\}/g, String(cam || '').trim());
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
  camName: 'KIM',      // 파일명 {cam} — 점검 앱의 카메라명(K = KIM, C = CHOI 처럼)
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

/* ── zip.js ── */
const { makeZip, uniqueNames } = (function () {
// 무압축(STORE) ZIP 만들기. JPEG는 이미 압축돼 있어서 압축해도 거의 줄지 않는다.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// files: [{ name, blob, date }]
async function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const data = new Uint8Array(await f.blob.arrayBuffer());
    const name = enc.encode(f.name);
    const crc = crc32(data);
    const { time, date } = dosTime(f.date || new Date());

    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true); // 파일명 UTF-8
    lh.setUint16(8, 0, true); // STORE
    lh.setUint16(10, time, true);
    lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true);
    lh.setUint16(28, 0, true);
    parts.push(lh.buffer, name, data);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true);
    ch.setUint16(14, date, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(ch.buffer, name);

    offset += 30 + name.length + data.length;
  }

  const centralSize = central.reduce((a, p) => a + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

// 같은 이름이 겹치면 "이름 (2).jpg" 처럼 바꾼다
function uniqueNames(names) {
  const seen = new Map();
  return names.map((n) => {
    const key = n.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, 1);
      return n;
    }
    let i = seen.get(key) + 1;
    const dot = n.lastIndexOf('.');
    const base = dot > 0 ? n.slice(0, dot) : n;
    const ext = dot > 0 ? n.slice(dot) : '';
    let cand;
    do {
      cand = `${base} (${i})${ext}`;
      i++;
    } while (seen.has(cand.toLowerCase()));
    seen.set(key, i - 1);
    seen.set(cand.toLowerCase(), 1);
    return cand;
  });
}

return { makeZip, uniqueNames };
})();

/* ── csv.js ── */
const { shotsCsv } = (function () {
// 촬영 목록을 엑셀에서 바로 열리는 CSV로 (UTF-8 BOM, 한글 안 깨짐)

const cell = (v) => {
  const t = v == null ? '' : String(v);
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

// items: 찍은 순서대로, names: ZIP 안 파일명과 같은 이름(겹치면 "이름 (2).jpg")
function shotsCsv(items, names) {
  const rows = [['순서', '번호', '메모', '촬영일', '촬영시각', '파일명', '가로', '세로']];
  items.forEach((it, n) => {
    const d = new Date(it.createdAt);
    rows.push([n + 1, it.numberText, it.memo || '', formatDate(d, 'YYYY-MM-DD'), formatDate(d, 'HH:mm:ss'),
      names[n], it.width || '', it.height || '']);
  });
  return new Blob(['\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
}

return { shotsCsv };
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

  const name = buildFileName(s.fileName, numberText, date, memo, s.camName);
  const blob = await canvasToBlob(c, s.quality / 100);
  /* 「공유」 방식은 찍을 때마다 공유 창이 떠서 결함 기록 흐름을 끊는다 → 앱 목록에만 둔다 */
  const mode = s.saveMode === 'download' ? 'download' : 'list';
  let listId = null;
  if (s.keepInList || mode === 'list') {
    try {
      listId = await addShot({ name, numberText, memo, createdAt: date.getTime(), blob, thumb: await makeThumb(c), width: c.width, height: c.height });
    } catch (e) {
      if (mode === 'list') throw new Error('스탬프 카메라 목록에 저장하지 못했습니다: ' + (e.message || e));
      console.warn(e);
    }
  }
  if (mode === 'download') downloadBlob(blob, name);

  /* 저장이 끝난 뒤에만 번호를 올린다 (그 사이 스탬프 카메라에서 바뀐 값도 다시 읽어 반영) */
  const now = loadSettings();
  const before = { current: now.current, sub: now.sub };
  let bumped = false;
  if (now.current === s.current && now.sub === s.sub && now.sameOn === s.sameOn) {
    if (now.sameOn) now.sub++;
    else now.current = nextValue(now.current, now);
    bumped = true;
  }
  saveSettings(now);
  return { canvas: c, number, numberText, name, saved: mode, sameOn: s.sameOn, listId,
    counter: bumped ? { before, after: { current: now.current, sub: now.sub } } : null };
}

/* 방금 찍은 한 장을 없던 일로 : 스탬프 카메라 목록에서 지우고, 번호를 되돌린다.
   번호는 그 뒤에 아무도(스탬프 카메라 앱 등) 올리지 않았을 때만 되돌린다 — 남이 쓴 번호를 다시 쓰면 겹친다.
   다운로드 폴더에 이미 저장된 파일은 브라우저가 지울 수 없다. 돌려주는 값 : { numberBack, listRemoved } */
async function undoStored(res) {
  let listRemoved = false;
  if (res.listId !== null && res.listId !== undefined) {
    try { await deleteShot(res.listId); listRemoved = true; } catch (e) { console.warn(e); }
  }
  let numberBack = false;
  if (res.counter) {
    const s = loadSettings();
    if (s.current === res.counter.after.current && s.sub === res.counter.after.sub) {
      s.current = res.counter.before.current;
      s.sub = res.counter.before.sub;
      saveSettings(s);
      numberBack = true;
    }
  }
  return { numberBack, listRemoved };
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
.sc-thumb{cursor:pointer;}
/* 촬영 목록 (스탬프 카메라 목록과 같다) */
.sc-list{position:absolute;inset:0;z-index:5;background:#15181d;display:flex;flex-direction:column;}
.sc-list[hidden],.sc-viewer[hidden],.sc-list [hidden]{display:none !important;}
.sc-lhead{display:flex;align-items:center;gap:8px;padding:calc(10px + env(safe-area-inset-top)) 12px 8px;}
.sc-lhead h2{flex:1;margin:0;font-size:17px;}
.sc-lhead small{font-weight:500;opacity:.7;font-size:13px;margin-left:6px;}
.sc-lbar{display:flex;flex-wrap:wrap;gap:8px;padding:0 12px 8px;align-items:center;}
.sc-lbar .sc-btn{min-height:38px;font-size:13px;}
.sc-lbar .grow{flex:1;}
.sc-btn.pri{background:#2a78d6;border-color:#2a78d6;}
.sc-btn.dan{color:#ff8a80;border-color:rgba(255,138,128,.5);}
.sc-lmode{font-size:12px;opacity:.85;padding:0 12px 6px;line-height:1.5;}
.sc-lmode label{display:inline-flex;gap:6px;align-items:center;cursor:pointer;}
.sc-ltip{font-size:12px;opacity:.7;padding:0 12px 6px;margin:0;}
.sc-grid{flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:6px;padding:4px 12px calc(16px + env(safe-area-inset-bottom));align-content:start;}
.sc-item{position:relative;border:0;padding:0;background:#222;border-radius:6px;overflow:hidden;aspect-ratio:1;cursor:pointer;color:#fff;
  -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:manipulation;}
.sc-item img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;}
.sc-item span{position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);font-size:11px;padding:3px 4px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sc-item i{position:absolute;right:4px;top:4px;background:#ffd84d;color:#000;font-style:normal;font-size:10px;font-weight:800;border-radius:4px;padding:1px 4px;}
.sc-grid.selecting .sc-item::after{content:'';position:absolute;left:6px;top:6px;width:20px;height:20px;border-radius:50%;border:2px solid #fff;background:rgba(0,0,0,.35);}
.sc-grid.selecting .sc-item.sel{outline:3px solid #2a78d6;outline-offset:-3px;}
.sc-grid.selecting .sc-item.sel img{opacity:.7;}
.sc-grid.selecting .sc-item.sel::after{content:'✓';background:#2a78d6;border-color:#2a78d6;color:#fff;font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;}
.sc-lempty{text-align:center;opacity:.7;font-size:14px;padding:30px 12px;}
.sc-viewer{position:absolute;inset:0;z-index:6;background:#000;display:flex;flex-direction:column;}
.sc-viewer img{flex:1;min-height:0;width:100%;object-fit:contain;}
.sc-vbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:rgba(0,0,0,.7);}
.sc-vbar span{font-size:13px;opacity:.9;word-break:break-all;}
.sc-vbar div{display:flex;gap:8px;flex-wrap:wrap;}
.sc-msg{position:absolute;left:12px;right:12px;top:40%;text-align:center;font-size:15px;line-height:1.6;}
.sc-bot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px calc(14px + env(safe-area-inset-bottom));background:rgba(0,0,0,.6);}
.sc-side{display:flex;flex-direction:column;gap:8px;align-items:stretch;}
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
  .sc-side .sc-btn{font-size:12px;padding:0 6px;}
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
      '<div class="sc-side">' +
        '<button type="button" class="sc-btn" data-sc="flash"></button>' +
        '<button type="button" class="sc-btn" data-sc="undo" title="방금 찍은 사진을 결함·목록에서 빼고 번호를 되돌린다" disabled>↶ 방금 것 취소</button>' +
      '</div>' +
      '<button type="button" class="sc-shutter" data-sc="shutter" title="촬영 (Space)" disabled></button>' +
      '<div class="sc-thumb" data-sc="thumb" title="촬영 목록 열기"></div>' +
    '</div>' +
    /* 촬영 목록 — 스탬프 카메라 목록(IndexedDB)을 그대로 보여 준다 */
    '<section class="sc-list" data-sc="list" hidden aria-label="촬영 목록">' +
      '<div class="sc-lhead"><h2>촬영 목록<small data-sc="lsum"></small></h2><button type="button" class="sc-btn" data-sc="lclose">닫기</button></div>' +
      '<div class="sc-lbar" data-sc="lacts">' +
        '<button type="button" class="sc-btn" data-sc="lsel">선택</button>' +
        '<button type="button" class="sc-btn pri" data-sc="lzip">전체 ZIP</button>' +
        '<button type="button" class="sc-btn" data-sc="lcsv">목록 CSV</button>' +
        '<button type="button" class="sc-btn dan" data-sc="lclear">전체 삭제</button>' +
      '</div>' +
      '<div class="sc-lbar" data-sc="lselbar" hidden>' +
        '<b class="grow" data-sc="lselcount">0장 선택</b>' +
        '<button type="button" class="sc-btn" data-sc="lselall">전체 선택</button>' +
        '<button type="button" class="sc-btn" data-sc="lselcancel">취소</button>' +
        '<button type="button" class="sc-btn" data-sc="lseldl">다운로드</button>' +
        '<button type="button" class="sc-btn pri" data-sc="lselzip">ZIP</button>' +
        '<button type="button" class="sc-btn" data-sc="lselshare">공유</button>' +
        '<button type="button" class="sc-btn dan" data-sc="lseldel">삭제</button>' +
      '</div>' +
      '<div class="sc-lmode"><label><input type="checkbox" data-sc="lmode"> 찍을 때 다운로드 폴더에도 저장</label>' +
        ' — 끄면 이 목록에만 저장되어, 취소·삭제하면 사진이 완전히 지워진다. 다 찍은 뒤 ZIP·다운로드로 꺼낸다.</div>' +
      '<p class="sc-ltip" data-sc="ltip">사진을 길게 누르거나 [선택]을 눌러 여러 장을 고를 수 있다. <b style="color:#ffd84d">결함</b> 표시는 이번에 찍어 결함에 붙인 사진.</p>' +
      '<div class="sc-grid" data-sc="lgrid"></div>' +
      '<p class="sc-lempty" data-sc="lempty" hidden>아직 촬영한 사진이 없다.</p>' +
    '</section>' +
    '<section class="sc-viewer" data-sc="viewer" hidden aria-label="사진 보기">' +
      '<img data-sc="vimg" alt="">' +
      '<div class="sc-vbar"><span data-sc="vname"></span><div>' +
        '<button type="button" class="sc-btn" data-sc="vdl">다운로드</button>' +
        '<button type="button" class="sc-btn" data-sc="vshare">공유</button>' +
        '<button type="button" class="sc-btn dan" data-sc="vdel">삭제</button>' +
        '<button type="button" class="sc-btn" data-sc="vclose">닫기</button>' +
      '</div></div>' +
    '</section>';
  document.body.appendChild(ov);
  const $ = (k) => ov.querySelector('[data-sc="' + k + '"]');
  const video = ov.querySelector('video');
  const camera = new Camera(video);
  const state = { ov, camera, opts, busy: false, shots: 0, resume: false, toastT: 0, undo: [] };
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
      res.thumbURL = res.canvas.toDataURL('image/jpeg', 0.6);
      refreshTop();
      let note = '', back = null;
      try {
        const r = opts.onShot && opts.onShot(res);
        if (typeof r === 'string') note = r;
        else if (r) { note = r.note || ''; back = r.undo || null; }
      } catch (e) { console.error(e); note = '결함에 붙이지 못했습니다'; }
      state.undo.push({ res, back });
      showLast();
      toast(res.numberText + (res.saved === 'download' ? ' 저장됨' : ' 스탬프 카메라 목록에 저장됨') + (note ? ' · ' + note : ''));
    } catch (e) {
      console.error(e);
      toast('촬영 실패: ' + (e.message || e), 3000);
    } finally {
      if (lit) camera.setTorch(false);
      state.busy = false;
      $('shutter').disabled = !camera.active;
      showLast();
    }
  }
  state.shoot = shoot;

  /* 찍은 장수 · 마지막 사진 · 취소 단추 */
  function showLast() {
    const last = state.undo[state.undo.length - 1];
    $('thumb').style.backgroundImage = last ? 'url(' + last.res.thumbURL + ')' : '';
    $('thumb').innerHTML = state.shots ? '<span>' + state.shots + '</span>' : '';
    $('undo').disabled = !state.undo.length || state.busy;
  }
  /* 방금 찍은 것 취소 : 결함에서 빼고(결함마킹) · 목록에서 지우고 · 번호를 되돌린다. 여러 번 누르면 차례로 거슬러 간다 */
  async function undoLast() {
    if (state.busy || !state.undo.length) return;
    state.busy = true;
    const it = state.undo.pop();
    try {
      let msg = it.res.numberText + ' 취소';
      try { const t = it.back && it.back(); if (t) msg += ' · ' + t; } catch (e) { console.error(e); }
      const u = await undoStored(it.res);
      msg += u.numberBack ? ' · 번호 되돌림' : (it.res.counter ? ' · 그 뒤 번호가 쓰여 번호는 그대로' : '');
      if (it.res.saved === 'download') msg += ' · 다운로드된 파일은 직접 지워 주세요';
      state.shots = Math.max(0, state.shots - 1);
      refreshTop();
      toast(msg, 3200);
    } finally {
      state.busy = false;
      showLast();
    }
  }
  state.undoLast = undoLast;

  /* ── 촬영 목록 (스탬프 카메라 목록과 같은 기능) ──────────────────
     목록은 스탬프 카메라의 IndexedDB 그대로다. 여기서 지우면 스탬프 카메라 앱 목록에서도 지워진다.
     이번 촬영 화면에서 찍어 결함에 붙인 사진을 지우면 결함에서도 뺀다(사진번호 칸도 그 사진이 채운 것이면 비운다).
     번호는 되돌리지 않는다(스탬프 카메라와 같다 — 되돌리려면 「방금 것 취소」). */
  const L = { urls: [], ids: [], selecting: false, sel: new Set(), viewer: null, vurl: null };
  state.L = L;
  const sessionOf = (id) => state.undo.find((u) => u.res.listId === id) || null;
  async function refreshList() {
    let items = [];
    try { items = await listShots(); } catch (e) { console.error(e); }
    L.urls.forEach((u) => URL.revokeObjectURL(u));
    L.urls = [];
    L.ids = items.map((i) => i.id);
    for (const id of [...L.sel]) if (!L.ids.includes(id)) L.sel.delete(id);
    if (!items.length) L.selecting = false;
    const total = items.reduce((a, i) => a + (i.size || 0), 0);
    $('lsum').textContent = items.length ? `${items.length}장 · ${(total / 1048576).toFixed(1)}MB` : '';
    $('lempty').hidden = items.length > 0;
    ['lzip', 'lcsv', 'lclear', 'lsel'].forEach((k) => ($(k).disabled = items.length === 0));
    $('lmode').checked = loadSettings().saveMode === 'download';
    const grid = $('lgrid');
    grid.textContent = '';
    for (const it of items) {
      const b = el('button', 'sc-item');
      b.type = 'button';
      b.dataset.id = it.id;
      const img = el('img');
      if (it.thumb) { const u = URL.createObjectURL(it.thumb); L.urls.push(u); img.src = u; }
      img.alt = it.name;
      const cap = el('span');
      cap.textContent = it.memo ? `${it.numberText} · ${it.memo}` : it.numberText;
      b.append(img, cap);
      if (sessionOf(it.id) && sessionOf(it.id).back) b.append(el('i', '', '결함'));
      bindItem(b, it.id);
      grid.append(b);
    }
    renderSel();
    return items;
  }
  /* 누르면 보기(선택 모드에서는 고르기), 길게 누르면 선택 모드로 */
  function bindItem(b, id) {
    let timer = null, long = false, start = null;
    const cancel = () => { clearTimeout(timer); timer = null; };
    b.addEventListener('pointerdown', (e) => {
      long = false; start = { x: e.clientX, y: e.clientY }; cancel();
      timer = setTimeout(() => {
        timer = null; long = true;
        if (!L.selecting) L.selecting = true;
        L.sel.add(id); renderSel();
        if (navigator.vibrate) navigator.vibrate(30);
      }, 500);
    });
    b.addEventListener('pointermove', (e) => { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel(); });
    b.addEventListener('pointerup', cancel);
    b.addEventListener('pointercancel', cancel);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      if (long) { long = false; return; }
      if (!L.selecting) return openViewer(id);
      if (L.sel.has(id)) L.sel.delete(id); else L.sel.add(id);
      renderSel();
    });
  }
  function renderSel() {
    const n = L.sel.size;
    $('lgrid').classList.toggle('selecting', L.selecting);
    $('lacts').hidden = L.selecting;
    $('lselbar').hidden = !L.selecting;
    $('ltip').hidden = L.selecting || L.ids.length === 0;
    $('lselcount').textContent = `${n}장 선택`;
    $('lselall').textContent = n && n === L.ids.length ? '선택 해제' : '전체 선택';
    ['lseldl', 'lselzip', 'lselshare', 'lseldel'].forEach((k) => ($(k).disabled = n === 0));
    ov.querySelectorAll('.sc-item').forEach((b) => b.classList.toggle('sel', L.sel.has(Number(b.dataset.id))));
  }
  async function selectedShots() {
    const ids = L.ids.filter((id) => L.sel.has(id)).sort((a, b) => a - b);
    return (await Promise.all(ids.map((id) => getShot(id)))).filter(Boolean);
  }
  const stampNow = () => buildFileName('{date}_{time}', '', new Date()).replace(/\.jpg$/, '');
  async function exportZip(items, btn) {
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = 'ZIP 만드는 중…';
    try {
      const names = uniqueNames(items.map((i) => i.name));
      const files = items.map((i, n) => ({ name: names[n], blob: i.blob, date: new Date(i.createdAt) }));
      files.push({ name: '목록.csv', blob: shotsCsv(items, names), date: new Date() });
      downloadBlob(await makeZip(files), `스탬프사진_${stampNow()}.zip`);
      toast(`${items.length}장을 ZIP으로 내보냈습니다.`);
    } catch (e) {
      console.error(e); toast('ZIP을 만들지 못했습니다: ' + (e.message || e), 3000);
    } finally { btn.textContent = label; btn.disabled = false; }
  }
  /* 지우기 : 목록에서 지우고, 이번에 찍어 결함에 붙인 사진이면 결함에서도 뺀다 */
  async function deleteIds(ids) {
    let fromDefect = 0, mine = 0;
    for (const id of ids) {
      await deleteShot(id);
      const u = sessionOf(id);
      if (u) {
        mine++;
        if (u.back) { try { u.back(); fromDefect++; } catch (e) { console.error(e); } }
        state.undo.splice(state.undo.indexOf(u), 1);   // 지운 사진은 「방금 것 취소」 대상에서도 뺀다
      }
    }
    state.shots = Math.max(0, state.shots - mine);   // 「찍은 장수」는 이번에 찍어 남아 있는 것
    showLast();
    await refreshList();
    return fromDefect;
  }
  const delNote = (n, d) => `${n}장을 지웠습니다.` + (d ? ` (결함에서도 ${d}장 뺌)` : '') + (loadSettings().saveMode === 'download' ? ' 다운로드한 파일은 직접 지워 주세요.' : '');
  async function openList() {
    L.selecting = false; L.sel.clear();
    $('list').hidden = false;
    await refreshList();
  }
  state.openList = openList;
  function closeList() { closeViewer(); $('list').hidden = true; L.urls.forEach((u) => URL.revokeObjectURL(u)); L.urls = []; }
  async function openViewer(id) {
    const it = await getShot(id);
    if (!it) return refreshList();
    L.viewer = it;
    if (L.vurl) URL.revokeObjectURL(L.vurl);
    L.vurl = URL.createObjectURL(it.blob);
    $('vimg').src = L.vurl;
    $('vname').textContent = `${it.name}${it.memo ? ` (${it.memo})` : ''} · ${it.width ? `${it.width}×${it.height} · ` : ''}${(it.blob.size / 1024).toFixed(0)}KB` +
      (sessionOf(id) && sessionOf(id).back ? ' · 결함에 붙인 사진' : '');
    $('viewer').hidden = false;
  }
  function closeViewer() {
    $('viewer').hidden = true;
    $('vimg').removeAttribute('src');
    if (L.vurl) URL.revokeObjectURL(L.vurl);
    L.vurl = null; L.viewer = null;
  }
  const LIST_ACTIONS = {
    thumb: () => openList(),
    lclose: () => closeList(),
    lsel: () => { L.selecting = true; renderSel(); },
    lselcancel: () => { L.selecting = false; L.sel.clear(); renderSel(); },
    lselall: () => { if (L.sel.size === L.ids.length) L.sel.clear(); else L.ids.forEach((id) => L.sel.add(id)); renderSel(); },
    lzip: async () => exportZip(await allShotsWithBlobs(), $('lzip')),
    lcsv: async () => {
      const items = await allShotsWithBlobs();
      downloadBlob(shotsCsv(items, uniqueNames(items.map((i) => i.name))), `스탬프목록_${stampNow()}.csv`);
      toast(`${items.length}장 목록을 CSV로 내보냈습니다 (엑셀에서 열기).`);
    },
    lclear: async () => {
      if (!confirm('촬영 목록의 사진을 모두 지울까요? 되돌릴 수 없습니다.\n(이번에 찍어 결함에 붙인 사진은 결함에서도 빠집니다. 이미 다운로드한 파일은 지워지지 않습니다)')) return;
      const d = await deleteIds([...L.ids]);
      toast('촬영 목록을 비웠습니다.' + (d ? ` (결함에서도 ${d}장 뺌)` : ''));
    },
    lselzip: async () => exportZip(await selectedShots(), $('lselzip')),
    lseldl: async () => {
      const items = await selectedShots();
      const names = uniqueNames(items.map((i) => i.name));
      for (let n = 0; n < items.length; n++) {
        downloadBlob(items[n].blob, names[n]);
        if (n < items.length - 1) await new Promise((r) => setTimeout(r, 300));
      }
      toast(`${items.length}장을 다운로드했습니다.`);
    },
    lselshare: async () => {
      try { const items = await selectedShots(); await shareFiles(items.map((i) => ({ blob: i.blob, name: i.name }))); }
      catch (e) { toast(e.message || String(e), 3000); }
    },
    lseldel: async () => {
      const ids = [...L.sel];
      if (!ids.length || !confirm(`선택한 ${ids.length}장을 목록에서 지울까요? 되돌릴 수 없습니다.\n(이번에 찍어 결함에 붙인 사진은 결함에서도 빠집니다. 이미 다운로드한 파일은 지워지지 않습니다)`)) return;
      L.selecting = false; L.sel.clear();
      const d = await deleteIds(ids);
      toast(delNote(ids.length, d));
    },
    vclose: () => closeViewer(),
    vdl: () => L.viewer && downloadBlob(L.viewer.blob, L.viewer.name),
    vshare: async () => { if (!L.viewer) return; try { await shareBlob(L.viewer.blob, L.viewer.name); } catch (e) { toast(e.message || String(e), 3000); } },
    vdel: async () => {
      if (!L.viewer || !confirm(`${L.viewer.name} 을(를) 목록에서 지울까요?` + (sessionOf(L.viewer.id) && sessionOf(L.viewer.id).back ? '\n(결함에 붙인 사진이라 결함에서도 빠집니다)' : ''))) return;
      const id = L.viewer.id;
      closeViewer();
      const d = await deleteIds([id]);
      toast(delNote(1, d));
    },
  };
  $('lmode').addEventListener('change', () => {
    const s = loadSettings();
    s.saveMode = $('lmode').checked ? 'download' : 'list';
    saveSettings(s);
    toast($('lmode').checked ? '찍을 때 다운로드 폴더에도 저장한다.' : '이제 이 목록에만 저장한다 — 다 찍은 뒤 ZIP·다운로드로 꺼낸다.', 3000);
  });

  ov.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-sc]');
    if (!b) return;
    const k = b.dataset.sc;
    if (k === 'close') close();
    else if (k === 'shutter') shoot();
    else if (k === 'undo') undoLast();
    else if (LIST_ACTIONS[k]) LIST_ACTIONS[k]();
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
    if (!$('viewer').hidden || !$('list').hidden) {
      if (e.key === 'Escape') { e.preventDefault(); if (!$('viewer').hidden) closeViewer(); else closeList(); }
      return;
    }
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
