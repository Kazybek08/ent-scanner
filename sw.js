// Service worker: хранит все файлы приложения в телефоне, чтобы оно работало без интернета.
// При любом изменении файлов увеличивайте номер версии — так iPhone скачает обновление.
const VERSION = 'ent-scanner-v0.5.1';

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'src/app.js',
  'src/i18n.js',
  'src/image-input.js',
  'src/db.js',
  'src/app-settings.js',
  'src/backup.js',
  'src/backup-ui.js',
  'src/export-xlsx.js',
  'src/home.js',
  'src/report.js',
  'src/results-screen.js',
  'src/settings-screen.js',
  'vendor/exceljs/exceljs.bare.min.js',
  'src/crop.js',
  'src/editor.js',
  'src/result-list.js',
  'src/results.js',
  'src/review.js',
  'src/excel.js',
  'src/form.js',
  'src/scoring.js',
  'src/students.js',
  'src/tests-screen.js',
  'src/util.js',
  'vendor/xlsx/xlsx.mjs',
  'src/omr.js',
  'src/overlay.js',
  'src/scan.js',
  'vendor/pdfjs/pdf.min.mjs',
  'vendor/pdfjs/pdf.worker.min.mjs',
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
  'docs/students-template.xlsx',
  'docs/keys-template.xlsx',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // cache: 'reload' — брать файлы с сервера, а не из кэша браузера (GitHub Pages держит его 10 минут),
    // иначе в новую версию может попасть старый файл
    await cache.addAll(FILES.map(f => new Request(f, { cache: 'reload' })));
    // логотип необязателен
    try { await cache.add(new Request('docs/logo.png', { cache: 'reload' })); } catch { /* файла пока нет */ }
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
