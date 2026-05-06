// Paradocs Service Worker — minimal, hand-rolled
// Primary purpose: satisfy Chrome PWA installability + basic app shell caching
// No workbox, no next-pwa

var CACHE_NAME = 'paradocs-v1';
var APP_SHELL = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
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
