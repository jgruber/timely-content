/*
 * Service worker for Timely Content.
 *
 * Its only job is to make the app installable and to keep the shell usable on
 * a flaky connection. It deliberately caches almost nothing:
 *
 *   - /api/**  is NEVER cached or intercepted. Shared content is access
 *     limited and can be set to self-destruct, so a cached copy could hand
 *     someone a document after their last permitted view, or serve it without
 *     spending an access. Every API call goes to the network, always.
 *   - Only same-origin GET requests for the app shell and build assets are
 *     cached. Build assets carry a content hash, so cache-first is safe.
 *   - The shell is network-first, so a deploy is picked up on the next load
 *     rather than being pinned until the cache is cleared.
 */

const VERSION = 'v1';
const SHELL_CACHE = `tc-shell-${VERSION}`;
const ASSET_CACHE = `tc-assets-${VERSION}`;

const SHELL_URL = '/';
const PRECACHE = [
  SHELL_URL,
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

/** Hashed build output under /assets/ plus the icons we ship. */
function isBuildAsset(url) {
  return url.pathname.startsWith('/assets/')
    || /^\/(favicon\.svg|favicon\.ico|icon-[\w-]+\.png|apple-touch-icon\.png|manifest\.webmanifest)$/.test(url.pathname);
}

/** A navigation is any top-level page load; they all resolve to the shell. */
function isNavigation(request) {
  return request.mode === 'navigate';
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Anything that is not a plain same-origin GET goes straight to the network.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Hard exclusion: never touch the API. This is a security boundary, not an
  // optimisation -- see the note at the top of this file.
  if (url.pathname.startsWith('/api/')) return;

  if (isNavigation(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_URL, copy));
          }
          return response;
        })
        .catch(() => caches.match(SHELL_URL).then((hit) => hit || Response.error())),
    );
    return;
  }

  if (isBuildAsset(url)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })),
    );
  }
});

// Lets a freshly deployed worker take over without waiting for every tab to close.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
