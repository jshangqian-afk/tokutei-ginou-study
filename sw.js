/* 特定技能1号 学習アプリ — Service Worker
   目的：電波がない工場内でもアプリが開くようにする。
   方針：アプリ本体はネットワーク優先（更新をすぐ反映）、失敗したらキャッシュ。
        アイコンなどはキャッシュ優先。
        GAS（別ドメイン）へのリクエストには一切さわらない。 */

const VERSION = 'tk1-c15d81ab28';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // GET 以外・別オリジン（GASへの送信など）は素通し
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  const isPage = req.mode === 'navigate' || req.destination === 'document';

  if (isPage) {
    // ネットワーク優先：新しい版があればそれを使い、同時にキャッシュも更新
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // それ以外はキャッシュ優先
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }))
  );
});
