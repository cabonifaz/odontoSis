/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { NetworkOnly, Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

/**
 * Service worker:
 *  - Pre-cachea los assets de la app (funciona sin conexión).
 *  - Las páginas visitadas se cachean (NetworkFirst) para abrirlas offline.
 *  - La API NUNCA se cachea aquí (datos sensibles): los datos offline viven en IndexedDB.
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    { matcher: ({ url }) => url.pathname.startsWith('/api/'), handler: new NetworkOnly() },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: '/offline', matcher: ({ request }) => request.destination === 'document' }],
  },
});

// Al cerrar sesión, la app pide limpiar las páginas cacheadas
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_CACHES') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith('serwist-precache')).map((k) => caches.delete(k)))));
  }
});

serwist.addEventListeners();
