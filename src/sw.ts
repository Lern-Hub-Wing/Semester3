/// <reference lib="webworker" />
/**
 * Service Worker von StudySpace.
 *
 *  – Offline: Precache der App-Dateien (Workbox), SPA-Fallback, Cache für Lernmaterialien
 *  – Push: zeigt echte Systembenachrichtigungen (auch wenn die App geschlossen ist)
 *  – Antippen einer Benachrichtigung öffnet die passende Stelle der App
 *    (immer innerhalb des eigenen Pfads, z. B. /Semester3/#/pruefungen → nie 404)
 *  – App-Badge: Zahl offener Aufgaben am Symbol, wo der Browser es unterstützt
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

// Neue Version sofort aktivieren (entspricht registerType: 'autoUpdate')
void self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
// Alle App-Routen liefern index.html (Hash-Router); Hilfsseiten unter /einrichtung/ bleiben eigenständig
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/\/einrichtung\//] }));

// Hochgeladene Dateien haben eindeutige, unveränderliche Pfade.
registerRoute(
  ({ url }) => url.pathname.includes('/storage/v1/object/public/'),
  new CacheFirst({
    cacheName: 'studyspace-materials',
    plugins: [new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 }), new CacheableResponsePlugin({ statuses: [0, 200] })],
  }),
);

interface PushData {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  badge?: number | null;
}

/** Nur Ziele innerhalb der App zulassen (Hash-Routen wie "#/lernplan") */
function safeHash(url: unknown): string {
  return typeof url === 'string' && /^#\/[\w\-/?=&.%]*$/.test(url) ? url : '#/';
}

const nav = self.navigator as WorkerNavigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

async function updateBadge(n: number | null | undefined) {
  if (typeof n !== 'number') return;
  try {
    if (n > 0) await nav.setAppBadge?.(n);
    else await nav.clearAppBadge?.();
  } catch {
    /* nicht unterstützt */
  }
}

self.addEventListener('push', (event) => {
  let data: PushData = {};
  try {
    data = (event.data?.json() as PushData) ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  const title = (data.title || 'StudySpace').slice(0, 120);
  const options: NotificationOptions & { renotify?: boolean; timestamp?: number } = {
    body: (data.body || '').slice(0, 400),
    icon: `${self.registration.scope}icons/icon-192.png`,
    badge: `${self.registration.scope}icons/badge-96.png`,
    lang: 'de',
    tag: data.tag || undefined,
    timestamp: Date.now(),
    data: { url: safeHash(data.url) },
  };
  // iOS/WebKit verlangt zu jeder Push-Nachricht eine sichtbare Benachrichtigung.
  event.waitUntil(Promise.all([self.registration.showNotification(title, options), updateBadge(data.badge)]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const hash = safeHash((event.notification.data as { url?: string } | null)?.url);
  const target = new URL(self.registration.scope);
  target.hash = hash.slice(1);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((c) => c.url.startsWith(self.registration.scope));
      if (existing) {
        await existing.focus().catch(() => undefined);
        existing.postMessage({ type: 'studyspace:navigate', hash });
        return;
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
