/* Atlas service worker.
 *
 * Three jobs:
 *   1. Cache the shell so Atlas opens instantly and works offline.
 *   2. Own the OS notifications, so alerts land in the action center and
 *      clicking one focuses (or opens) the app.
 *   3. Check deadlines on a Periodic Background Sync tick — this is the path
 *      that alerts the student in Chrome/Edge with every Atlas tab closed,
 *      once the app has been installed.
 */

var CACHE = 'atlas-shell-v1';
var SNAPSHOT_URL = '/__atlas_snapshot__';   // virtual key inside the cache

var SHELL = [
  './',
  './index.html',
  './assets/styles.css',
  './assets/icon.svg',
  './manifest.webmanifest',
  './js/util.js',
  './js/store.js',
  './js/managebac.js',
  './js/notify.js',
  './js/ui.js',
  './js/app.js',
  './data/managebac-feed.json'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(SHELL); })
      .catch(function (e) { console.warn('[atlas sw] precache incomplete', e); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Network-first for the app shell so edits show up immediately during
   development, with the cache as the offline safety net. */
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;   // let the CDN and fonts through untouched

  event.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});

/* ------------------------------------------------------------- snapshot */

function saveSnapshot(data) {
  return caches.open(CACHE).then(function (cache) {
    return cache.put(SNAPSHOT_URL, new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    }));
  });
}

function readSnapshot() {
  return caches.open(CACHE)
    .then(function (cache) { return cache.match(SNAPSHOT_URL); })
    .then(function (res) { return res ? res.json() : null; })
    .catch(function () { return null; });
}

self.addEventListener('message', function (event) {
  var msg = event.data || {};
  if (msg.type === 'atlas:snapshot') {
    event.waitUntil(saveSnapshot({
      assignments: msg.assignments || [],
      settings: msg.settings || {},
      savedAt: Date.now()
    }));
  }
});

/* --------------------------------------------------- background reminders */

var MIN = 60 * 1000;
var DAY = 24 * 60 * MIN;

function checkDeadlines() {
  return readSnapshot().then(function (snap) {
    if (!snap || !snap.assignments || !snap.assignments.length) return;
    var settings = snap.settings || {};
    if (settings.notificationsEnabled === false) return;

    var now = Date.now();
    /* Ascending — the tightest open window is the one worth announcing. */
    var leads = (settings.leadTimes || [1440, 60]).slice().sort(function (a, b) { return a - b; });
    var jobs = [];
    var dirty = false;

    snap.assignments.forEach(function (a) {
      var msLeft = new Date(a.dueAt).getTime() - now;
      a.notified = a.notified || {};

      if (msLeft < 0) {
        if (settings.notifyOnOverdue !== false && !a.notified.overdue && msLeft > -DAY) {
          a.notified.overdue = true; dirty = true;
          jobs.push(self.registration.showNotification('Overdue — ' + a.course, {
            body: a.title,
            icon: './assets/icon.svg',
            badge: './assets/icon.svg',
            tag: 'atlas-overdue-' + a.id,
            requireInteraction: true,
            data: { kind: 'overdue', id: a.id }
          }));
        }
        return;
      }

      var toFire = null;
      for (var i = 0; i < leads.length; i++) {
        if (msLeft > leads[i] * MIN) continue;
        var key = 'lead_' + leads[i];
        if (a.notified[key]) continue;
        if (toFire === null) toFire = leads[i];
        a.notified[key] = true; dirty = true;
      }

      if (toFire !== null) {
        jobs.push(self.registration.showNotification('Deadline approaching — ' + a.course, {
          body: a.title,
          icon: './assets/icon.svg',
          badge: './assets/icon.svg',
          tag: 'atlas-lead-' + a.id + '-' + toFire,
          requireInteraction: toFire <= 60,
          data: { kind: 'reminder', id: a.id }
        }));
      }
    });

    if (dirty) jobs.push(saveSnapshot(snap));
    return Promise.all(jobs);
  });
}

self.addEventListener('periodicsync', function (event) {
  if (event.tag === 'atlas-deadline-check') event.waitUntil(checkDeadlines());
});

self.addEventListener('sync', function (event) {
  if (event.tag === 'atlas-deadline-check') event.waitUntil(checkDeadlines());
});

/* Wired up for a future push server; harmless until one exists. */
self.addEventListener('push', function (event) {
  var payload = { title: 'New from ManageBac', body: 'Open Atlas to see what changed.' };
  try { if (event.data) payload = Object.assign(payload, event.data.json()); } catch (e) {}
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: './assets/icon.svg',
    badge: './assets/icon.svg',
    tag: payload.tag || 'atlas-push',
    data: payload.data || { kind: 'push' }
  }));
});

/* ------------------------------------------------------------- clicking */

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var data = event.notification.data || {};
  var target = new URL('./index.html' + (data.id ? '#a=' + data.id : ''), self.location).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(self.registration.scope) === 0 && 'focus' in list[i]) {
          list[i].postMessage({ type: 'atlas:focus', id: data.id || null });
          return list[i].focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
