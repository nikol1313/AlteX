'use strict';
// AlteX service worker.
// - Precaches the app shell (this list) under a versioned cache; `npm run build` stamps VERSION from the files' hash,
//   so any change to the shell produces a new worker and the app offers "განახლება".
// - Serves only those same-origin shell files from cache. Every other request (the portal, anything with
//   credentials, any API) is left to the network untouched and is never stored.
const VERSION = 'dev';
const CACHE = `altex-shell-${VERSION}`;
const SHELL = [
  './',
  'index.html',
  'app.css',
  'app.js',
  'install.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  '../css/tokens.css',
  '../css/exam-strip.css',
  '../shared/util.js',
  '../shared/academic-calendar.js',
  '../shared/exam-strip.js',
  '../fonts/firago-400.woff2',
  '../fonts/firago-500.woff2',
];
const SHELL_URLS = new Set(SHELL.map((p) => new URL(p, self.location).href));
const INDEX = new URL('index.html', self.location).href;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL.map((p) => new Request(p, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('altex-shell-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data.type === 'VERSION') event.source?.postMessage({ version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch the portal or any third party
  if (req.mode === 'navigate' && url.pathname.startsWith(new URL('./', self.location).pathname)) {
    // App pages: the cached shell, so the app opens offline; network only if the cache is missing.
    event.respondWith(caches.match(INDEX).then((hit) => hit || fetch(req)));
    return;
  }
  url.search = '';
  if (!SHELL_URLS.has(url.href)) return;
  event.respondWith(caches.match(url.href).then((hit) => hit || fetch(req)));
});
