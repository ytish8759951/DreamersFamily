import { registerSW } from 'virtual:pwa-register';
import { dataMode } from './dataRepository';

export const APP_BUNDLE_VERSION = '20260704-safari-direct-tap-v1';
export const APP_CACHE_MARKER_KEY = 'little-dreamers-family:bundle-version';
export const APP_CACHE_CLEAR_MARKER_KEY = 'little-dreamers-family:last-cache-clear';

export async function prepareAppRuntime() {
  await clearStaleBrowserCaches();
  registerServiceWorkerUpdates();
}

async function clearStaleBrowserCaches() {
  if (typeof window === 'undefined') return;

  const previousVersion = readStorage(APP_CACHE_MARKER_KEY);
  const cacheClearVersion = readStorage(APP_CACHE_CLEAR_MARKER_KEY);
  const shouldClearCaches =
    previousVersion !== APP_BUNDLE_VERSION ||
    (dataMode === 'supabase' && cacheClearVersion !== APP_BUNDLE_VERSION);

  if (!shouldClearCaches) return;

  if ('caches' in window) {
    try {
      const cacheNames = await window.caches.keys();
      await Promise.all(cacheNames.map((name) => window.caches.delete(name)));
      console.info('[app-runtime] Cleared stale PWA caches', {
        bundleVersion: APP_BUNDLE_VERSION,
        dataMode,
        cacheNames
      });
    } catch (caught) {
      console.warn('[app-runtime] Failed to clear stale PWA caches', caught);
    }
  }

  writeStorage(APP_CACHE_MARKER_KEY, APP_BUNDLE_VERSION);
  writeStorage(APP_CACHE_CLEAR_MARKER_KEY, APP_BUNDLE_VERSION);
}

function registerServiceWorkerUpdates() {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      void updateSW(true);
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      void registration.update();
    },
    onRegisterError(error) {
      console.warn('[app-runtime] Service worker registration failed', error);
    }
  });
}

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Cache version markers are best-effort and are not application data.
  }
}
