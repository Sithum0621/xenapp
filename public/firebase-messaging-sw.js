/* Firebase Cloud Messaging service worker — background push for PWA / web.
 * Loads config from /firebase-web-config.json (synced from google-services.json).
 * Main app may postMessage FIREBASE_CONFIG with a resolved web appId at runtime. */
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

const DEFAULT_CONFIG = {
  apiKey: 'AIzaSyAB0f4aRXEYx0zbt6DtsB-GOHdTCTKLhKU',
  authDomain: 'xenv0001.firebaseapp.com',
  projectId: 'xenv0001',
  storageBucket: 'xenv0001.firebasestorage.app',
  messagingSenderId: '840326303130',
  appId: '',
};

let messaging = null;

function initFirebase(config) {
  if (!config?.appId || self.__mytuitionFcmReady) return;
  try {
    firebase.initializeApp(config);
    messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const title =
        payload.notification?.title ||
        (payload.data && payload.data.title) ||
        'MyTuition';
      const body =
        payload.notification?.body ||
        (payload.data && payload.data.body) ||
        '';
      const data = payload.data || {};
      const tag = data.notification_id || data.type || 'mytuition-push';

      return self.registration.showNotification(title, {
        body,
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag,
        data,
      });
    });
    self.__mytuitionFcmReady = true;
  } catch (err) {
    console.warn('[firebase-messaging-sw] init failed:', err);
  }
}

function loadConfig() {
  return fetch('/firebase-web-config.json')
    .then((r) => (r.ok ? r.json() : DEFAULT_CONFIG))
    .catch(() => DEFAULT_CONFIG);
}

self.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg?.type === 'FIREBASE_CONFIG' && msg.config?.appId) {
    initFirebase(msg.config);
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    loadConfig().then((config) => {
      const merged = { ...DEFAULT_CONFIG, ...config };
      if (merged.appId) initFirebase(merged);
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    loadConfig().then((config) => {
      const merged = { ...DEFAULT_CONFIG, ...config };
      if (merged.appId) initFirebase(merged);
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route = event.notification.data && event.notification.data.route;
  const url = route && typeof route === 'string' ? route : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.focus();
          if (route && 'navigate' in client) {
            return client.navigate(url);
          }
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    }),
  );
});
