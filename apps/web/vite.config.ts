import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

function getBuildCommit() {
  return (
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.COMMIT_SHA ||
    execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  );
}

function runtimeAssetsPlugin(buildId: string, buildTime: string): Plugin {
  return {
    name: 'runtime-version-assets',
    generateBundle() {
      const meta = {
        buildId,
        commit: buildId,
        generatedAt: buildTime
      };
      this.emitFile({
        type: 'asset',
        fileName: 'build-meta.json',
        source: `${JSON.stringify(meta, null, 2)}\n`
      });
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: createServiceWorkerSource(buildId, buildTime)
      });
      this.emitFile({
        type: 'asset',
        fileName: 'registerSW.js',
        source: createRegisterServiceWorkerSource(buildId)
      });
      this.emitFile({
        type: 'asset',
        fileName: 'manifest-child.webmanifest',
        source: `${JSON.stringify(createChildManifest(buildId), null, 2)}\n`
      });
      this.emitFile({
        type: 'asset',
        fileName: 'manifest-parent.webmanifest',
        source: `${JSON.stringify(createParentManifest(buildId), null, 2)}\n`
      });
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.webmanifest',
        source: `${JSON.stringify(createParentManifest(buildId), null, 2)}\n`
      });
    }
  };
}

const buildCommit = getBuildCommit();
const buildTime = new Date().toISOString();

export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(buildCommit),
    __BUILD_TIME__: JSON.stringify(buildTime)
  },
  plugins: [
    react(),
    runtimeAssetsPlugin(buildCommit, buildTime)
  ]
});

function createServiceWorkerSource(buildId: string, buildTime: string) {
  const cachePrefix = 'dreamers-family';
  const cacheName = `${cachePrefix}-${buildId}`;
  return `const APP_VERSION = ${JSON.stringify(buildId)};
const BUILD_TIME = ${JSON.stringify(buildTime)};
const CACHE_PREFIX = ${JSON.stringify(cachePrefix)};
const CACHE_NAME = ${JSON.stringify(cacheName)};

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((client) => {
      client.postMessage({
        type: 'DREAMERS_SW_ACTIVATED',
        version: APP_VERSION,
        buildTime: BUILD_TIME,
        cacheName: CACHE_NAME
      });
    });
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(new Request(request, { cache: 'reload' })));
});
`;
}

function createRegisterServiceWorkerSource(buildId: string) {
  return `(() => {
  const APP_VERSION = ${JSON.stringify(buildId)};
  const RELOAD_GUARD_KEY = 'little-dreamers-family:sw-reload:' + APP_VERSION;
  if (!('serviceWorker' in navigator)) return;

  const clearCaches = async () => {
    if (!('caches' in window)) return [];
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    return keys;
  };

  const register = async () => {
    try {
      const cleared = await clearCaches();
      let reloadedForControllerChange = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloadedForControllerChange) return;
        reloadedForControllerChange = true;
        if (sessionStorage.getItem(RELOAD_GUARD_KEY) === '1') return;
        sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
        window.location.reload();
      });
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type !== 'DREAMERS_SW_ACTIVATED') return;
        if (event.data.version !== APP_VERSION) return;
        if (sessionStorage.getItem(RELOAD_GUARD_KEY) === '1') return;
        sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
        window.location.reload();
      });
      const registration = await navigator.serviceWorker.register('/sw.js?v=' + encodeURIComponent(APP_VERSION), {
        updateViaCache: 'none'
      });
      await registration.update();
      if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      console.info('[app-runtime] PWA cache refresh registered', {
        version: APP_VERSION,
        clearedCaches: cleared,
        scope: registration.scope
      });
    } catch (error) {
      console.warn('[app-runtime] PWA cache refresh failed', error);
    }
  };

  window.addEventListener('load', () => {
    void register();
  });
})();
`;
}

function createChildManifest(buildId: string) {
  return {
    name: 'Dreamers Child',
    short_name: 'Dreamers Child',
    description: 'Dreamers Family child app',
    display: 'standalone',
    orientation: 'portrait',
    id: `/child/home?build=${buildId}`,
    start_url: `/child/home?build=${buildId}`,
    scope: '/child/',
    background_color: '#fff7ed',
    theme_color: '#7a8f6e',
    icons: [
      {
        src: `/app-icon-child.png?v=${buildId}`,
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any maskable'
      }
    ]
  };
}

function createParentManifest(buildId: string) {
  return {
    name: 'Dreamers Family',
    short_name: 'Dreamers Family',
    description: 'Dreamers Family parent app',
    display: 'standalone',
    orientation: 'portrait',
    id: `/parent?build=${buildId}`,
    start_url: `/parent?build=${buildId}`,
    scope: '/',
    background_color: '#fff7ed',
    theme_color: '#7a8f6e',
    icons: [
      {
        src: `/app-icon-parent-192.png?v=${buildId}`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable'
      },
      {
        src: `/app-icon-parent-512.png?v=${buildId}`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable'
      },
      {
        src: `/app-icon-parent.png?v=${buildId}`,
        sizes: '180x180',
        type: 'image/png',
        purpose: 'apple touch icon'
      }
    ]
  };
}
