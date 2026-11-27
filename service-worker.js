// 결함 위치 도면 마킹 도구 — 오프라인 캐시용 서비스워커.
// 앱이 사용자 데이터를 서버에 전혀 보내지 않고 브라우저 안에서만 동작하므로,
// 캐시 전략은 "앱 셸(정적 파일)만 캐시하고 나머지는 그대로 통과"로 단순하게 유지한다.
// 앱 파일을 바꿀 때마다 이 버전 문자열만 올리면 된다 — 캐시 이름이 바뀌므로 activate 단계에서
// 이전 버전 캐시가 자동으로 지워지고, 브라우저가 새 서비스워커를 새 파일로 다시 설치·활성화한다.
const CACHE_VERSION = 'sc26';
const CACHE_NAME = 'defect-marker-stampcam-cache-' + CACHE_VERSION;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  // PDF를 도면으로 넣는 기능이 쓰는 pdf.js(Mozilla). 현장에서 오프라인으로도 PDF를 열 수 있어야
  // 하므로 앱 셸과 함께 미리 받아 둔다 — 두 파일 합쳐 약 1.4MB로, 설치할 때 한 번만 받는다.
  './vendor/pdf.min.js',
  './vendor/pdf.worker.min.js',
  // 번호 스탬프 카메라 연결(사진 창의 「스탬프 촬영」)
  './stampcam/stampcam.js',
  // 손글씨 입력(필기 상자 · 숫자 인식 모델). 글자 변환용 vendor/anthropic-sdk.js 는 인터넷이 될 때만 쓰므로 미리 받지 않는다.
  './ink/ink.js',
  './ink/digits-model.js',
  // 부재 → 자재 → 결함 연결 목록
  './taxonomy/defect-taxonomy.js',
  './taxonomy/location-taxonomy.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL.map(f => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      // 이 앱의 옛 캐시만 지운다. 같은 주소(yeop9701.github.io)의 다른 앱(번호 스탬프 카메라 등)의
      // 캐시까지 지우면 그 앱이 오프라인에서 안 열린다.
      Promise.all(keys.filter(k => k.startsWith('defect-marker-stampcam-cache-') && k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 네트워크 우선 — GitHub Pages 는 파일을 10분간 브라우저 캐시에 두라고 보내므로(max-age=600)
// 캐시 우선으로 두면 고쳐 올려도 휴대폰에 옛 버전이 남는다(번호 스탬프 카메라에서 겪은 문제).
// 인터넷이 되면 늘 서버에서 새로 받고(브라우저 캐시도 건너뜀), 안 되거나 4초 안에 답이 없으면 캐시로 연다.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const network = fetch(req, { cache: 'no-cache' }).then(res => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      const timeout = new Promise(r => setTimeout(() => r(null), 4000));
      const res = await Promise.race([network, timeout]);
      if (res && res.ok) return res;
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      return (await network) || res || new Response('오프라인입니다.', { status: 503 });
    })
  );
});
