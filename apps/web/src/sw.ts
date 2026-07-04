/// <reference lib="webworker" />

import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const SW_CACHE_PREFIX = 'dreamers-family-sw-redirect-v1';
const NAVIGATION_CACHE = `${SW_CACHE_PREFIX}-navigation`;
const INDEX_URL = '/index.html';

setCacheNameDetails({ prefix: SW_CACHE_PREFIX });

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => !cacheName.startsWith(SW_CACHE_PREFIX))
            .map((cacheName) => caches.delete(cacheName))
        )
      )
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
  }
});

async function networkFirstNavigation(request: Request) {
  try {
    const response = await fetch(request);
    if (isRedirectResponse(response)) {
      return fetchRedirectTarget(request, response);
    }

    if (response.ok) {
      const cache = await caches.open(NAVIGATION_CACHE);
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    return (await matchPrecache(INDEX_URL)) ?? Response.error();
  }
}

function isRedirectResponse(response: Response) {
  return response.redirected || response.status === 301 || response.status === 302 || response.type === 'opaqueredirect';
}

function fetchRedirectTarget(request: Request, response: Response) {
  const targetUrl = response.url || request.url;
  return fetch(targetUrl, {
    cache: 'no-store',
    credentials: 'include',
    headers: request.headers,
    redirect: 'follow'
  });
}
