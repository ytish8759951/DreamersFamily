export const APP_BUNDLE_VERSION = '20260704-disable-pwa-v1';
export const APP_CACHE_MARKER_KEY = 'little-dreamers-family:bundle-version';
export const APP_CACHE_CLEAR_MARKER_KEY = 'little-dreamers-family:last-cache-clear';

export async function prepareAppRuntime() {
  await disableServiceWorkersAndCaches();
}

async function disableServiceWorkersAndCaches() {
  if (typeof window === 'undefined') return;

  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      console.info('[app-runtime] Unregistered service workers', { count: registrations.length });
    } catch (caught) {
      console.warn('[app-runtime] Failed to unregister service workers', caught);
    }
  }

  if ('caches' in window) {
    try {
      const cacheNames = await window.caches.keys();
      await Promise.all(cacheNames.map((name) => window.caches.delete(name)));
      console.info('[app-runtime] Cleared browser caches while PWA is disabled', {
        bundleVersion: APP_BUNDLE_VERSION,
        cacheNames
      });
    } catch (caught) {
      console.warn('[app-runtime] Failed to clear browser caches', caught);
    }
  }

  writeStorage(APP_CACHE_MARKER_KEY, APP_BUNDLE_VERSION);
  writeStorage(APP_CACHE_CLEAR_MARKER_KEY, APP_BUNDLE_VERSION);
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
