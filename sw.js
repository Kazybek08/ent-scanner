// Service worker: хранит все файлы приложения в телефоне, чтобы оно работало без интернета.
// При любом изменении файлов увеличивайте номер версии — так iPhone скачает обновление.
const VERSION = 'ent-scanner-v0.1.0';

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'src/app.js',
  'src/i18n.js',
  'src/sheet-pdf.js',
  'src/subjects.js',
  'src/template.js',
  'i18n/kk.json',
  'i18n/ru.json',
  'vendor/jspdf.umd.min.js',
  'vendor/fonts/DejaVuSans.ttf',
  'vendor/fonts/DejaVuSans-Bold.ttf',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/sheet-preview.svg',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(FILES);
    // логотип необязателен
    try { await cache.add('docs/logo.png'); } catch { /* файла пока нет */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

// Сначала из памяти телефона, если нет — из сети.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      return await fetch(req);
    } catch {
      if (req.mode === 'navigate') return caches.match('index.html');
      throw new Error('offline');
    }
  })());
});
