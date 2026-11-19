/* 손글씨 입력 — 결함마킹 앱의 퀵입력 시트를 「칸마다 큰 필기 상자」로 바꾼다.
 *
 *  - 현장(인터넷 없음) : 쓴 글씨는 획(점 좌표) 그대로 결함에 저장한다(m.ink[칸]). 원본이므로 변환한 뒤에도 지우지 않는다.
 *      숫자 칸(폭·길이·개수·사진번호·측정값 …)은 앱 안의 작은 인식기(ink/digits-model.js)로 그 자리에서 읽는다.
 *      글자 칸(부재·자재·결함·층수·위치 …)은 「변환 대기」로 두고, 카드에는 글씨 그림이 그대로 보인다.
 *  - 인터넷이 될 때 : 구글 필기 인식 또는 Claude 로 글자 칸을 한꺼번에 글자로 바꾼다(「손글씨 변환」 창, 또는 자동).
 *
 *  저장 모양 (마커 m.ink 의 칸 하나)
 *    { w, h,                 쓸 때 상자 크기(px). 획 좌표는 이 크기 기준
 *      s: [[x,y,x,y,…],…],   획마다 점 좌표(정수)
 *      st: 'pending'|'done'|'error',   글자로 바꿨는가
 *      text, alts, eng,      바꾼 글자, 다른 후보(구글), 누가 바꿨나('digits'|'google'|'claude'|'pick'|'manual')
 *      conf, at,             숫자 인식 확신도(0~1), 마지막으로 쓴 때
 *      carried }             앞 결함에서 이어받은 글씨(그 위에 쓰면 새 글씨로 바뀐다)
 *  칸 하나를 고칠 때마다 새 객체로 바꿔 끼운다(실행취소 기록이 마커를 얕게 복사하므로 안을 고치면 옛 기록까지 바뀐다).
 *
 *  window.Ink 로 내보낸다. 일반 <script> 라 파일로 열어도(file://) 돈다.
 */
(function () {
'use strict';

/* ═══ 설정 ═══════════════════════════════════════════════ */
const SETTINGS_KEY = 'defectMarkerInk_v1';
const DEFAULTS = { on: true, engine: 'google', auto: true, apiKey: '' };
function loadSettings() {
  try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); }
  catch (e) { return Object.assign({}, DEFAULTS); }
}
function saveSettings(patch) {
  const s = Object.assign(loadSettings(), patch);
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* 저장 못 해도 이번엔 동작 */ }
  return s;
}

/* ═══ 글씨 데이터 ═══════════════════════════════════════════ */
function hasInk(e) { return !!(e && e.s && e.s.length); }
function isPending(e) { return hasInk(e) && e.st !== 'done'; }
function bbox(strokes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (let i = 0; i < s.length; i += 2) {
    if (s[i] < x0) x0 = s[i]; if (s[i] > x1) x1 = s[i];
    if (s[i + 1] < y0) y0 = s[i + 1]; if (s[i + 1] > y1) y1 = s[i + 1];
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
/* 같은 글씨인지 알아보는 짧은 값 — 같은 글씨를 두 번 변환하지 않으려고(이어받기로 복사된 글씨 등) */
function inkHash(e) {
  let h = 2166136261 >>> 0;
  const feed = (n) => { h ^= (n & 0xffff); h = Math.imul(h, 16777619) >>> 0; };
  feed(e.w); feed(e.h);
  for (const s of e.s) { feed(9999); for (const v of s) feed(v); }
  return h.toString(36);
}

/* ═══ 그리기 ═══════════════════════════════════════════════ */
function drawStrokes(ctx, e, scale, ox, oy, lw, color) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw;
  for (const s of e.s) {
    if (s.length <= 2) {          // 점 하나
      ctx.beginPath(); ctx.arc(ox + s[0] * scale, oy + s[1] * scale, lw / 2, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(ox + s[0] * scale, oy + s[1] * scale);
    for (let i = 2; i < s.length; i += 2) ctx.lineTo(ox + s[i] * scale, oy + s[i + 1] * scale);
    ctx.stroke();
  }
  ctx.restore();
}
/* 글씨만 잘라 그린 그림(흰 바탕 검은 글씨) — Claude 에 보내거나 「손글씨 변환」 창에 보여 줄 때 */
function renderCanvas(e, opts) {
  opts = opts || {};
  const H = opts.height || 96, pad = opts.pad == null ? 10 : opts.pad;
  const b = bbox(e.s);
  const bw = Math.max(b.w, 1), bh = Math.max(b.h, 1);
  /* 글씨 높이를 H 에 맞추되, 아주 납작한 글씨(가로로 긴 낱말)는 너무 길어지지 않게 */
  let scale = (H - pad * 2) / Math.max(bh, e.h * 0.25);
  if (bw * scale > (opts.maxWidth || 900)) scale = (opts.maxWidth || 900) / bw;
  const c = document.createElement('canvas');
  c.width = Math.ceil(bw * scale + pad * 2); c.height = Math.ceil(bh * scale + pad * 2);
  const ctx = c.getContext('2d');
  ctx.fillStyle = opts.bg || '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
  drawStrokes(ctx, e, scale, pad - b.x0 * scale, pad - b.y0 * scale, opts.lineWidth || Math.max(2, H / 28), opts.color || '#111111');
  return c;
}
const thumbCache = new Map();
/* 결함 목록 카드의 칸 배경으로 쓰는 작은 그림(투명 바탕) */
function thumbURL(e, color) {
  const key = inkHash(e) + '|' + (color || '');
  if (thumbCache.has(key)) return thumbCache.get(key);
  const url = renderCanvas(e, { height: 40, pad: 3, bg: 'rgba(0,0,0,0)', color: color || '#1a4f8a', lineWidth: 2, maxWidth: 400 }).toDataURL('image/png');
  if (thumbCache.size > 600) thumbCache.clear();
  thumbCache.set(key, url);
  return url;
}

/* ═══ 숫자 인식 (인터넷 없이) ═════════════════════════════════
   ink/digits-model.js 의 작은 CNN(MNIST 로 학습, int8). 글씨를 숫자 하나씩 나눈 뒤 28×28 로 그려 넣는다. */
let model = null;
function getModel() {
  if (model) return model;
  const M = window.InkDigitsModel;
  if (!M) return null;
  model = {};
  for (const k in M) {
    const bin = atob(M[k].data);
    const q = new Int8Array(bin.length);
    for (let i = 0; i < bin.length; i++) { const v = bin.charCodeAt(i); q[i] = v > 127 ? v - 256 : v; }
    const f = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) f[i] = q[i] * M[k].scale;
    model[k] = f;
  }
  return model;
}
function conv5(x, C, H, wt, b, K) {   // same 패딩 5×5, x: C*H*H
  const out = new Float32Array(K * H * H);
  for (let k = 0; k < K; k++) {
    for (let y = 0; y < H; y++) for (let xx = 0; xx < H; xx++) {
      let s = b[k];
      for (let c = 0; c < C; c++) for (let dy = 0; dy < 5; dy++) {
        const iy = y + dy - 2; if (iy < 0 || iy >= H) continue;
        for (let dx = 0; dx < 5; dx++) {
          const ix = xx + dx - 2; if (ix < 0 || ix >= H) continue;
          s += x[(c * H + iy) * H + ix] * wt[k * C * 25 + c * 25 + dy * 5 + dx];
        }
      }
      out[(k * H + y) * H + xx] = s > 0 ? s : 0;
    }
  }
  return out;
}
function pool2(x, C, H) {
  const h = H / 2, out = new Float32Array(C * h * h);
  for (let c = 0; c < C; c++) for (let y = 0; y < h; y++) for (let xx = 0; xx < h; xx++) {
    const i = (c * H + 2 * y) * H + 2 * xx;
    out[(c * h + y) * h + xx] = Math.max(x[i], x[i + 1], x[i + H], x[i + H + 1]);
  }
  return out;
}
function classify(img28) {
  const M = getModel(); if (!M) return null;
  const p1 = pool2(conv5(img28, 1, 28, M.c1w, M.c1b, 8), 8, 28);
  const p2 = pool2(conv5(p1, 8, 14, M.c2w, M.c2b, 16), 16, 14);
  const h = new Float32Array(64);
  for (let j = 0; j < 64; j++) { let s = M.f1b[j]; for (let i = 0; i < 784; i++) s += p2[i] * M.f1w[i * 64 + j]; h[j] = s > 0 ? s : 0; }
  const z = new Float32Array(10); let mx = -Infinity;
  for (let j = 0; j < 10; j++) { let s = M.f2b[j]; for (let i = 0; i < 64; i++) s += h[i] * M.f2w[i * 10 + j]; z[j] = s; if (s > mx) mx = s; }
  let sum = 0; for (let j = 0; j < 10; j++) { z[j] = Math.exp(z[j] - mx); sum += z[j]; }
  let best = 0; for (let j = 0; j < 10; j++) { z[j] /= sum; if (z[j] > z[best]) best = j; }
  return { digit: best, p: z[best], probs: z };
}
/* 획 묶음 하나 → MNIST 모양(20px 상자에 맞춰 그리고, 무게중심을 가운데로) */
function toMnist(strokes) {
  const b = bbox(strokes);
  const S = 4, N = 28 * S;
  const c = document.createElement('canvas'); c.width = N; c.height = N;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, N, N);
  const side = Math.max(b.w, b.h, 1);
  const scale = (20 * S) / side;
  const ox = N / 2 - (b.x0 + b.w / 2) * scale, oy = N / 2 - (b.y0 + b.h / 2) * scale;
  drawStrokes(ctx, { s: strokes }, scale, ox, oy, 2.6 * S, '#fff');
  const d = ctx.getImageData(0, 0, N, N).data;
  const img = new Float32Array(784);
  for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) {
    let s = 0;
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) s += d[((y * S + dy) * N + x * S + dx) * 4];
    img[y * 28 + x] = s / (S * S * 255);
  }
  /* 무게중심을 (13.5,13.5) 로 */
  let m = 0, mx = 0, my = 0;
  for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) { const v = img[y * 28 + x]; m += v; mx += v * x; my += v * y; }
  if (m <= 0) return img;
  const sx = Math.round(13.5 - mx / m), sy = Math.round(13.5 - my / m);
  if (!sx && !sy) return img;
  const out = new Float32Array(784);
  for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) {
    const ny = y + sy, nx = x + sx;
    if (ny >= 0 && ny < 28 && nx >= 0 && nx < 28) out[ny * 28 + nx] = img[y * 28 + x];
  }
  return out;
}
/* 획들을 글자(숫자) 단위로 나눈다. 소수점(작은 점)은 따로 표시한다. */
function segment(strokes) {
  const all = bbox(strokes);
  const H = Math.max(all.h, 1);
  const items = strokes.map(s => { const b = bbox([s]); return { s, b, diag: Math.hypot(b.w, b.h) }; });
  const bigH = items.filter(it => it.diag >= 0.25 * H);
  const Hd = bigH.length ? (bbox(bigH.map(it => it.s)).h || H) : H;   // 숫자 높이(점 빼고)
  const top = bigH.length ? bbox(bigH.map(it => it.s)).y0 : all.y0;
  const groups = [];
  const smalls = [];
  items.sort((a, b) => a.b.x0 - b.b.x0);
  for (const it of items) {
    if (it.diag < 0.22 * Hd) { smalls.push(it); continue; }
    let g = null;
    for (const cand of groups) {
      const ov = Math.min(cand.x1, it.b.x1) - Math.max(cand.x0, it.b.x0);
      const minW = Math.max(Math.min(cand.x1 - cand.x0, it.b.w), 0.15 * Hd);
      if (ov > 0.3 * minW) { g = cand; break; }
    }
    if (g) { g.s.push(it.s); g.x0 = Math.min(g.x0, it.b.x0); g.x1 = Math.max(g.x1, it.b.x1); }
    else groups.push({ s: [it.s], x0: it.b.x0, x1: it.b.x1 });
  }
  const dots = [];
  for (const it of smalls) {
    const cx = (it.b.x0 + it.b.x1) / 2, cy = (it.b.y0 + it.b.y1) / 2;
    const lower = cy > top + 0.6 * Hd;          // 아래쪽 작은 점 = 소수점
    const host = groups.find(g => cx >= g.x0 - 0.05 * Hd && cx <= g.x1 + 0.05 * Hd);
    if (lower) dots.push({ x: cx });
    else if (host) host.s.push(it.s);           // 5 의 깃발, 7 의 가로줄 같은 작은 획
    else if (groups.length) {                   // 가장 가까운 숫자에 붙인다
      let best = groups[0], bd = Infinity;
      for (const g of groups) { const d = Math.abs(cx - g_mid(g)); if (d < bd) { bd = d; best = g; } }
      best.s.push(it.s);
    } else groups.push({ s: [it.s], x0: it.b.x0, x1: it.b.x1 });
  }
  groups.sort((a, b) => a.x0 - b.x0);
  return { groups, dots };
}
function g_mid(g) { return (g.x0 + g.x1) / 2; }
/* 층수의 「-」(지하) : 맨 왼쪽에 있는 납작한 가로 획 하나. 숫자 1 과 헷갈리지 않게 가로가 세로의
   3배 이상이고, 다른 모든 획보다 왼쪽에서 끝나야 한다. */
function splitMinus(strokes) {
  if (strokes.length < 2) return { minus: false, rest: strokes };
  const items = strokes.map(s => ({ s, b: bbox([s]) }));
  items.sort((a, b) => a.b.x0 - b.b.x0);
  const first = items[0], others = items.slice(1);
  const H = Math.max(bbox(others.map(it => it.s)).h, 1);
  const flat = first.b.w >= 3 * Math.max(first.b.h, 1) && first.b.w >= 0.2 * H && first.b.h <= 0.3 * H;
  const leftOf = others.every(it => it.b.x0 >= first.b.x1 - 0.1 * H);
  return flat && leftOf ? { minus: true, rest: others.map(it => it.s) } : { minus: false, rest: strokes };
}
/* 층수 글자 → 「지상1층」·「지하1층」. 1 → 지상1층, -1 → 지하1층, B1 → 지하1층, 1F·1층 → 지상1층.
   그 밖의 말(옥상·PIT·지붕 …)은 그대로 둔다. 0 도 그대로(그런 층은 없다). */
function formatFloor(v) {
  const t = String(v == null ? '' : v).trim();
  let m = /^(-|－|−)?\s*(\d+)\s*(층|f|F)?$/.exec(t);
  if (m) { const n = parseInt(m[2], 10); if (!n) return t; return (m[1] ? '지하' : '지상') + n + '층'; }
  m = /^(b|B)\s*(\d+)\s*(층|f|F)?$/.exec(t);
  if (m) { const n = parseInt(m[2], 10); if (!n) return t; return '지하' + n + '층'; }
  m = /^지\s*([상하])\s*(\d+)$/.exec(t);          // 「지상1」처럼 층을 빼먹은 것
  if (m) return '지' + m[1] + parseInt(m[2], 10) + '층';
  return t;
}
/* 글씨 → 숫자 문자열. kind: 'num'(소수점 있음) | 'int' | 'floor'(정수, 앞의 「-」 = 지하) */
function recognizeDigits(e, kind) {
  if (!hasInk(e) || !getModel()) return { text: '', conf: 0 };
  let strokes = e.s, minus = false;
  if (kind === 'floor') { const sm = splitMinus(e.s); strokes = sm.rest; minus = sm.minus; }
  const { groups, dots } = segment(strokes);
  const parts = groups.map(g => ({ x: g.x0, r: classify(toMnist(g.s)) }));
  let conf = 1;
  const seq = parts.map(p => { conf = Math.min(conf, p.r ? p.r.p : 0); return { x: p.x, ch: p.r ? String(p.r.digit) : '?' }; });
  if (kind === 'num' && dots.length && seq.length) {
    /* 첫 숫자 뒤 ~ 마지막 숫자 앞에 있는 점 하나만 소수점으로 */
    const d = dots.find(dd => dd.x > seq[0].x);
    if (d) seq.push({ x: d.x, ch: '.' });
  }
  seq.sort((a, b) => a.x - b.x);
  let text = seq.map(p => p.ch).join('');
  if (text.endsWith('.')) text = text.slice(0, -1);
  if (text.startsWith('.')) text = '0' + text;
  if (minus && text) text = '-' + text;
  return { text, conf: seq.length ? conf : 0 };
}

/* ═══ 필기 상자 ═════════════════════════════════════════════
   createBox({ k, label, kind:'text'|'num'|'int', ink, value, options:()=>[…], onChange({ink,value}) })
   onChange 는 펜을 떼고 잠깐 뒤(쓰는 도중엔 부르지 않음), ✕, ▼ 고르기, 칸에 직접 친 값에서 불린다. */
let penSeen = false;          // 펜을 한 번이라도 쓰면 필기 칸에서 손가락은 글씨가 아니라 스크롤이다
let lastPenAt = 0;            // 펜이 닿거나 떠 있던 마지막 시각 — 이때 닿는 손은 손바닥으로 본다
document.addEventListener('pointermove', (e) => { if (e.pointerType === 'pen') lastPenAt = Date.now(); }, { capture: true, passive: true });
const IDLE_MS = { text: 900, num: 550, int: 550, floor: 650 };
function createBox(cfg) {
  const kind = cfg.kind === 'num' || cfg.kind === 'int' || cfg.kind === 'floor' ? cfg.kind : 'text';
  /* 층수 칸 : 숫자만 써도 「지상N층」(앞에 - 를 쓰면 「지하N층」)으로 넣는다. 직접 친 말도 같은 규칙. */
  const fmt = kind === 'floor' ? formatFloor : (v) => v;
  let entry = cfg.ink || null;
  let value = cfg.value == null ? '' : String(cfg.value);
  const el = document.createElement('div');
  el.className = 'ink-box ink-' + kind;
  el.dataset.k = cfg.k;
  el.innerHTML =
    '<div class="ink-head"><span class="ink-label"></span><span class="ink-status"></span>' +
    (kind === 'text' && cfg.options ? '<button type="button" class="ink-pick" title="목록에서 고르기">▼</button>' : '') +
    '<button type="button" class="ink-clear" title="이 칸 지우기">✕</button></div>' +
    '<div class="ink-pad"><canvas></canvas><span class="ink-hint"></span></div>' +
    '<input type="text" class="ink-val" autocomplete="off"' + (kind === 'num' ? ' inputmode="decimal"' : kind === 'int' ? ' inputmode="numeric"' : '') + '>';
  if (kind === 'floor') el.classList.add('ink-int');   // 크기·배치는 숫자 칸과 같다
  el.querySelector('.ink-label').textContent = cfg.label;
  el.querySelector('.ink-hint').textContent = kind === 'text' ? '여기에 쓰세요'
    : kind === 'floor' ? '층 숫자 (지하는 앞에 -)' : '숫자를 쓰세요';
  const pad = el.querySelector('.ink-pad');
  const canvas = el.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const input = el.querySelector('.ink-val');
  const statusEl = el.querySelector('.ink-status');
  let cw = 0, ch = 0, dpr = 1;
  let live = null;            // 쓰고 있는 획 [x,y,…] (상자 좌표)
  let pendingStrokes = [];    // 아직 onChange 로 넘기지 않은 획
  let idleTimer = 0;
  let activePointer = null;

  function inkColor() { return getComputedStyle(el).getPropertyValue('--ink-color').trim() || '#1a4f8a'; }
  /* 저장된 글씨의 좌표(entry.w×h 기준)를 지금 상자에 맞추는 배율 */
  function view() {
    if (!entry) return { sc: 1 };
    return { sc: Math.min(cw / entry.w, ch / entry.h) || 1 };
  }
  function resize() {
    const r = pad.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = window.devicePixelRatio || 1;
    cw = r.width; ch = r.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    redraw();
  }
  function redraw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const col = inkColor();
    const strokes = (entry ? entry.s : []).concat(pendingStrokes);
    if (strokes.length) drawStrokes(ctx, { s: strokes }, view().sc, 0, 0, 2.6, col);
    if (live && live.length) drawStrokes(ctx, { s: [live] }, view().sc, 0, 0, 2.6, col);
    el.classList.toggle('has-ink', strokes.length > 0 || !!live);
  }
  function status() {
    let t = '', cls = '';
    if (hasInk(entry) && !pendingStrokes.length) {
      if (entry.st === 'done') {
        t = { digits: '숫자 인식', google: '구글 변환', claude: 'Claude 변환', pick: '목록', manual: '직접 입력' }[entry.eng] || '변환됨';
        if (entry.eng === 'digits' && entry.conf != null && entry.conf < 0.6) { t = '확인 필요'; cls = 'warn'; }
      } else if (entry.st === 'error') { t = '변환 실패'; cls = 'warn'; }
      else { t = '변환 대기'; cls = 'wait'; }
    }
    statusEl.textContent = t; statusEl.className = 'ink-status ' + cls;
    if (document.activeElement !== input) input.value = value;
    input.placeholder = hasInk(entry) && kind === 'text' && !value ? '(글씨로 저장됨)' : '';
  }

  function toInk(ev) {   // 화면 좌표 → 저장 좌표
    const r = canvas.getBoundingClientRect();
    const sc = entry ? view().sc : 1;
    return [Math.round((ev.clientX - r.left) / sc), Math.round((ev.clientY - r.top) / sc)];
  }
  /* 펜을 쓰기 시작한 뒤의 손가락 : 시트를 직접 밀어 스크롤한다. touch-action 을 풀면 펜 획까지
     브라우저가 스크롤로 가져갈 수 있어서, 칸은 그대로 두고 손가락만 여기서 처리한다. */
  let fingerScroll = null;
  function startFingerScroll(ev) {
    const scroller = canvas.closest('.qis-fields');
    if (!scroller || Date.now() - lastPenAt < 500 || ev.width > 48 || ev.height > 48) return;   // 손바닥
    fingerScroll = { id: ev.pointerId, y: ev.clientY, top: scroller.scrollTop, scroller, moved: false };
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* 지원 안 해도 동작 */ }
  }
  function endFingerScroll(ev) { if (fingerScroll && (!ev || ev.pointerId === fingerScroll.id)) fingerScroll = null; }
  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'pen') { penSeen = true; lastPenAt = Date.now(); endFingerScroll(); }
    else if (ev.pointerType === 'touch' && penSeen) { startFingerScroll(ev); return; }
    if (ev.button > 0) return;
    if (activePointer !== null) return;
    ev.preventDefault();
    activePointer = ev.pointerId;
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* 지원 안 해도 동작 */ }
    clearTimeout(idleTimer);
    /* 앞 결함에서 이어받은 글씨 위에 쓰면 겹쳐 쌓지 않는다 — 새로 쓴 글씨가 이 칸의 글씨다 */
    if (entry && entry.carried) { entry = null; value = ''; status(); }
    if (!entry && !pendingStrokes.length) {         // 첫 획 — 지금 상자 크기를 기준으로 삼는다
      entry = null;
      baseW = Math.round(cw); baseH = Math.round(ch);
    }
    live = toInk(ev);
    redraw();
  });
  let baseW = 0, baseH = 0;
  canvas.addEventListener('pointermove', (ev) => {
    if (fingerScroll && ev.pointerId === fingerScroll.id) {
      const dy = ev.clientY - fingerScroll.y;
      if (!fingerScroll.moved && Math.abs(dy) < 8) return;     // 살짝 닿은 것은 스크롤이 아니다
      fingerScroll.moved = true;
      fingerScroll.scroller.scrollTop = fingerScroll.top - dy;
      return;
    }
    if (ev.pointerId !== activePointer || !live) return;
    ev.preventDefault();
    const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
    for (const e of (evs.length ? evs : [ev])) {
      const [x, y] = toInk(e);
      const n = live.length;
      if (Math.abs(x - live[n - 2]) + Math.abs(y - live[n - 1]) >= 2) live.push(x, y);
    }
    redraw();
  });
  function endStroke(ev) {
    endFingerScroll(ev);
    if (ev.pointerId !== activePointer) return;
    activePointer = null;
    if (live) { pendingStrokes.push(live); live = null; }
    redraw();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(commitStrokes, IDLE_MS[kind]);
  }
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  function commitStrokes() {
    if (!pendingStrokes.length) return;
    const prev = entry;
    const s = (prev ? prev.s : []).concat(pendingStrokes);
    pendingStrokes = [];
    entry = { w: prev ? prev.w : baseW || Math.round(cw), h: prev ? prev.h : baseH || Math.round(ch), s, st: 'pending', at: Date.now() };
    if (kind === 'text') {
      value = '';                                   // 새로 쓴 글씨가 기준 — 변환되면 채워진다
    } else {
      const r = recognizeDigits(entry, kind);
      const v = fmt(r.text);
      entry.st = 'done'; entry.eng = 'digits'; entry.text = v; entry.conf = Math.round(r.conf * 100) / 100;
      value = v;
    }
    redraw(); status();
    cfg.onChange && cfg.onChange({ ink: entry, value, reason: 'ink' });
  }
  /* 상자를 닫거나 다시 그리기 전에, 아직 넘기지 않은 획을 마저 넘긴다 */
  function flush() { clearTimeout(idleTimer); commitStrokes(); }

  el.querySelector('.ink-clear').addEventListener('click', () => {
    clearTimeout(idleTimer); pendingStrokes = []; live = null;
    entry = null; value = '';
    redraw(); status();
    cfg.onChange && cfg.onChange({ ink: null, value: '', reason: 'clear' });
  });
  input.addEventListener('change', () => {
    value = fmt(input.value.trim());
    input.value = value;
    if (hasInk(entry)) entry = Object.assign({}, entry, { st: 'done', eng: 'manual', text: value });
    status();
    cfg.onChange && cfg.onChange({ ink: entry, value, reason: 'type' });
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  const pickBtn = el.querySelector('.ink-pick');
  if (pickBtn) pickBtn.addEventListener('click', () => {
    openPicker(pickBtn, cfg.options(), (v) => {
      flush();
      value = v;
      if (hasInk(entry)) entry = Object.assign({}, entry, { st: 'done', eng: 'pick', text: v });
      status();
      cfg.onChange && cfg.onChange({ ink: entry, value, reason: 'pick' });
    });
  });

  const ro = new ResizeObserver(() => resize());
  ro.observe(pad);
  status();
  return {
    el, flush,
    get ink() { return entry; },
    /* 밖에서 값이 바뀌었을 때(자동 변환 등) — 쓰는 중이면 건드리지 않는다 */
    update(ink, v) {
      if (live || pendingStrokes.length) return;
      entry = ink || null; value = v == null ? '' : String(v);
      redraw(); status();
    },
    destroy() { flush(); ro.disconnect(); },
  };
}
/* ▼ 목록 — 손가락으로 고르는 큰 단추 */
let pickerEl = null;
function closePicker() { if (pickerEl) { pickerEl.remove(); pickerEl = null; } }
function openPicker(anchor, options, onPick) {
  closePicker();
  const opts = (options || []).filter(Boolean);
  const p = document.createElement('div');
  p.className = 'ink-picker';
  if (!opts.length) p.innerHTML = '<div class="ink-picker-empty">목록이 비어 있습니다 — 손으로 쓰면 변환된 말이 다음부터 여기 나옵니다</div>';
  for (const o of opts) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = o;
    b.addEventListener('click', () => { closePicker(); onPick(o); });
    p.appendChild(b);
  }
  document.body.appendChild(p);
  const r = anchor.getBoundingClientRect();
  const pw = Math.min(420, window.innerWidth - 16);
  p.style.width = pw + 'px';
  p.style.left = Math.max(8, Math.min(r.right - pw, window.innerWidth - pw - 8)) + 'px';
  const ph = p.getBoundingClientRect().height;
  p.style.top = (r.top - ph - 6 > 8 ? r.top - ph - 6 : Math.min(r.bottom + 6, window.innerHeight - ph - 8)) + 'px';
  pickerEl = p;
  setTimeout(() => document.addEventListener('pointerdown', function off(e) {
    if (pickerEl && !pickerEl.contains(e.target)) { closePicker(); }
    document.removeEventListener('pointerdown', off, true);
  }, true), 0);
}

/* ═══ 글자로 바꾸기 (인터넷) ═════════════════════════════════ */
function withTimeout(ms) { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return { signal: c.signal, done: () => clearTimeout(t) }; }

/* 구글 필기 인식 (Google 입력 도구가 쓰는 주소 — 공식 공개 API 는 아니다) */
async function googleOne(e) {
  const ink = e.s.map(s => { const xs = [], ys = []; for (let i = 0; i < s.length; i += 2) { xs.push(s[i]); ys.push(s[i + 1]); } return [xs, ys]; });
  const t = withTimeout(12000);
  try {
    const res = await fetch('https://inputtools.google.com/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: t.signal,
      body: JSON.stringify({ options: 'enable_pre_space', requests: [{ writing_guide: { writing_area_width: e.w, writing_area_height: e.h }, ink, language: 'ko' }] }),
    });
    if (!res.ok) throw new Error('구글 응답 ' + res.status);
    const j = await res.json();
    if (j[0] !== 'SUCCESS') throw new Error('구글 인식 실패');
    const c = (j[1] && j[1][0] && j[1][0][1]) || [];
    return { text: String(c[0] || '').trim(), alts: c.slice(1, 6).map(String) };
  } finally { t.done(); }
}
async function convertGoogle(items, onResult) {
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const it = items[i++];
      try { onResult(it, await googleOne(it.ink)); }
      catch (err) { onResult(it, null, err); }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

/* Claude — 공식 Anthropic SDK(vendor/anthropic-sdk.js, 쓸 때만 불러온다) */
const CLAUDE_MODEL = 'claude-opus-5-5';
function loadSdk() {
  if (window.AnthropicSDK) return Promise.resolve(window.AnthropicSDK);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/anthropic-sdk.js';
    s.onload = () => window.AnthropicSDK ? resolve(window.AnthropicSDK) : reject(new Error('SDK 를 읽지 못했습니다'));
    s.onerror = () => reject(new Error('SDK 파일을 받지 못했습니다(인터넷 확인)'));
    document.head.appendChild(s);
  });
}
const CLAUDE_SYSTEM =
  '당신은 건축물 정밀안전점검 현장에서 태블릿에 손으로 쓴 메모를 판독한다. ' +
  '이미지마다 결함 조사표의 한 칸(예: 부재, 자재, 결함, 층수, 위치)에 쓴 짧은 글씨가 들어 있다. ' +
  '쓴 그대로의 글자를 옮겨 적는다. 맞춤법을 고치거나 말을 바꾸거나 설명을 붙이지 않는다. ' +
  '점검 용어(균열, 백태, 박리, 박락, 철근노출, 누수, 들뜸, 파손, 망상균열, 재료분리 등)와 아래 목록의 말을 참고해, ' +
  '글씨가 그 말과 맞으면 그 말로 적는다. 숫자·단위·층(B1, 2F, 지하1층 등)·기호는 쓴 그대로 둔다. ' +
  '도저히 읽을 수 없으면 text 를 빈 문자열로 둔다.';
async function convertClaude(items, onResult, vocab) {
  const apiKey = loadSettings().apiKey;
  if (!apiKey) throw new Error('Claude API 키가 없습니다 — 「손글씨 변환」 창의 설정에서 넣어 주세요');
  const Anthropic = await loadSdk();
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 120000 });
  const system = CLAUDE_SYSTEM + (vocab && vocab.length ? '\n\n이 현장에서 쓰는 말 : ' + vocab.slice(0, 400).join(', ') : '');
  for (let b = 0; b < items.length; b += 20) {
    const chunk = items.slice(b, b + 20);
    const content = [];
    chunk.forEach((it, n) => {
      content.push({ type: 'text', text: `[${n + 1}] 칸: ${it.label}` });
      const data = renderCanvas(it.ink, { height: 96 }).toDataURL('image/png').split(',')[1];
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data } });
    });
    content.push({ type: 'text', text: `위 ${chunk.length}개 이미지의 글씨를 번호(id = "1" ~ "${chunk.length}")마다 옮겨 적어 주세요.` });
    try {
      const res = await client.beta.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        output_config: {
          effort: 'low',
          format: {
            type: 'json_schema',
            schema: {
              type: 'object', additionalProperties: false, required: ['results'],
              properties: { results: { type: 'array', items: {
                type: 'object', additionalProperties: false, required: ['id', 'text'],
                properties: { id: { type: 'string' }, text: { type: 'string' } },
              } } },
            },
          },
        },
        messages: [{ role: 'user', content }],
      });
      if (res.stop_reason === 'refusal') throw new Error('Claude 가 이 요청을 처리하지 않았습니다');
      const tb = res.content.find(c => c.type === 'text');
      const parsed = JSON.parse(tb ? tb.text : '{}');
      const byId = new Map((parsed.results || []).map(r => [String(r.id).replace(/\D/g, ''), String(r.text || '').trim()]));
      chunk.forEach((it, n) => {
        const t = byId.get(String(n + 1));
        if (t == null) onResult(it, null, new Error('결과 없음'));
        else onResult(it, { text: t, alts: [] });
      });
    } catch (err) {
      if (window.AnthropicSDK && err instanceof window.AnthropicSDK.AuthenticationError) {
        chunk.forEach(it => onResult(it, null, new Error('API 키가 맞지 않습니다')));
        throw new Error('Claude API 키가 맞지 않습니다');
      }
      chunk.forEach(it => onResult(it, null, err));
    }
  }
}
/* items: [{ ink, label, … }] — 같은 글씨는 한 번만 보낸다. onResult(item, {text,alts}|null, err) */
async function convert(items, opts) {
  opts = opts || {};
  const engine = opts.engine || loadSettings().engine;
  const groups = new Map();
  for (const it of items) { const h = inkHash(it.ink); if (!groups.has(h)) groups.set(h, []); groups.get(h).push(it); }
  const uniq = Array.from(groups.values()).map(g => g[0]);
  const fan = (it, r, err) => { for (const x of groups.get(inkHash(it.ink))) opts.onResult(x, r, err, engine); };
  if (engine === 'claude') await convertClaude(uniq, fan, opts.vocab || []);
  else await convertGoogle(uniq, fan);
}

window.Ink = {
  loadSettings, saveSettings, hasInk, isPending, inkHash,
  createBox, closePicker, recognizeDigits, segment, toMnist, classify, formatFloor, splitMinus,
  renderCanvas, thumbURL, convert, googleOne, CLAUDE_MODEL,
};
})();
