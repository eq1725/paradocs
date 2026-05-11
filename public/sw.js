// Paradocs Service Worker — minimal, hand-rolled
// Primary purpose: satisfy Chrome PWA installability + basic app shell caching
// No workbox, no next-pwa
//
// Cache versioning — bump CACHE_NAME any time we ship a major chrome
// or layout change so existing users automatically get a clean slate.
// The activate handler below deletes any cache whose name doesn't
// match the current CACHE_NAME, evicting all stale assets in one pass.
//
// History:
//   v1 — initial install (Session 13 nav unification)
//   v2 — V9.6 account-surface unification (drop DashboardLayout from
//        /account/*, AccountNav strip, new pricing tiers)
//   v3 — V10 icon rebrand. Bump forces all clients (including iOS
//        PWA installs) to evict the cached old black-with-P icon on
//        next page load — without this bump the cache-first .png
//        rule below keeps serving stale icons forever even though
//        the network has new ones.
//   v4 — V10 favicon rebrand follow-up. Versioned favicon paths
//        (/favicon-v3.ico, /favicon-v3.svg) so the browser tab icon
//        also refreshes without users clearing their cache.
//   v5 — V10.1 icon flip (purple bg → black bg + purple P) for
//        visual coherence with the splash screen. New paths:
//        favicon-v4.{ico,svg}, apple-touch-icon-v4.png, splash/*.
//        Pre-caches the most common splash sizes so the launch
//        screen shows even on cold start.
//   v6 — Adds iPhone 16 Pro (1206×2622) and 16 Pro Max (1320×2868)
//        splash sizes + a universal fallback link tag for any
//        iOS device that doesn't match a media query.

var CACHE_NAME = 'paradocs-v6';
var APP_SHELL = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-180x180.png',
  '/apple-touch-icon-v4.png',
  '/favicon-v4.ico',
  '/favicon-v4.svg',
  // Pre-cache the most-common iPhone splash sizes so the launch
  // screen is instant on cold open. Other sizes load on first paint.
  '/splash/splash-1170x2532.png',  // iPhone 16/15/14/13/12
  '/splash/splash-1179x2556.png',  // iPhone 16 Pro / 15 Pro / 14 Pro
  '/splash/splash-1290x2796.png',  // iPhone 16 Pro Max / 15 Pro Max / 14 Pro Max
];

// Install: pre-cache app shell
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first for pages/API, cache-first for static assets
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API calls and auth — always network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  // Static assets (icons, images, fonts, CSS, JS chunks): cache-first
  if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|woff2?|css|js)$/)) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          if (response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Pages: network-first, fall back to cache
  event.respondWith(
    fetch(event.request).then(function(response) {
      if (response.ok) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone);
        });
      }
      return response;
    }).catch(function() {
      return caches.match(event.request);
    })
  );
});

// V9.4 — Web Push handlers.
// Push event: incoming notification from /api/push/send-daily-lead.
// Payload (JSON): { title, body, icon, badge, data: { url, ... } }.
self.addEventListener('push', function(event) {
  var payload;
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Paradocs', body: event.data ? event.data.text() : '' };
  }
  var title = payload.title || 'Paradocs';
  var options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: payload.badge || '/icons/icon-192x192.png',
    data: payload.data || {},
    // iOS uses requireInteraction less aggressively, but still set:
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Click event: open the URL embedded in the notification's data.url.
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) || '/discover';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If a Paradocs window is already open, focus it and navigate.
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf(self.location.origin) === 0 && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise open a new window.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
