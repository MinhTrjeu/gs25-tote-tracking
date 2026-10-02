// Service worker: lưu sẵn "vỏ" app (trang, icon, thư viện quét mã) trong máy
// để mở app nhanh và mở được cả khi mất sóng.
//
// - Trang chính (index.html): ưu tiên lấy bản MỚI từ mạng, chỉ dùng bản lưu
//   sẵn khi mất mạng hoặc mạng chậm quá 3 giây -> deploy bản mới là thấy ngay.
// - Icon, thư viện từ CDN (ZXing, SheetJS): dùng bản lưu sẵn, đỡ tải lại.
// - Mọi lệnh gọi lên Apps Script (đăng nhập, quét, báo cáo) là POST -> KHÔNG
//   đi qua cache, luôn là dữ liệu thật từ server.
//
// Khi sửa file này, tăng số phiên bản CACHE để máy bỏ cache cũ.
const CACHE = 'gs25-tote-v1';
const SHELL = [
  './',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
    event.respondWith(isPage ? networkFirst(req) : cacheFirst(req));
    return;
  }

  if (CDN_HOSTS.indexOf(url.hostname) !== -1) {
    event.respondWith(cacheFirst(req));
  }
});

function networkFirst(req) {
  return new Promise(function (resolve) {
    let settled = false;
    const finish = function (res) {
      if (!settled && res) { settled = true; resolve(res); }
    };
    const fromCache = function () {
      return caches.match(req, { ignoreSearch: true }).then(function (res) {
        return res || caches.match('./', { ignoreSearch: true });
      });
    };

    const timer = setTimeout(function () { fromCache().then(finish); }, NETWORK_TIMEOUT_MS);

    fetch(req)
      .then(function (res) {
        clearTimeout(timer);
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        if (!settled) { settled = true; resolve(res); }
      })
      .catch(function () {
        clearTimeout(timer);
        fromCache().then(function (res) {
          if (!settled) { settled = true; resolve(res || Response.error()); }
        });
      });
  });
}

function cacheFirst(req) {
  return caches.match(req).then(function (cached) {
    if (cached) return cached;
    return fetch(req).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
      }
      return res;
    });
  });
}
