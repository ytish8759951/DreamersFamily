import { getCookieValue, getLocalStorage, setCookieValue } from './storage';
import { startupTrace, traceStartupPromise, traceStartupPromiseAll } from './startupTrace';

export const APP_BUILD_ID = __BUILD_COMMIT__;
export const APP_BUILD_TIME = __BUILD_TIME__;
export const APP_CACHE_MARKER_KEY = 'little-dreamers-family:bundle-version';
export const APP_CACHE_CLEAR_MARKER_KEY = 'little-dreamers-family:last-cache-clear';
export const APP_BUILD_ID_KEY = 'little-dreamers-family:build-id';
const APP_BUILD_REFRESH_GUARD_KEY = 'little-dreamers-family:build-refresh-guard';
const BUILD_META_URL = '/build-meta.json';

export async function prepareAppRuntime() {
  runtimeTrace('prepareAppRuntime start');
  runtimeTrace('initSupabase start', { note: 'not used in prepareAppRuntime' });
  runtimeTrace('initSupabase finish', { note: 'not used in prepareAppRuntime' });
  runtimeTrace('initRepository start', { note: 'not used in prepareAppRuntime' });
  runtimeTrace('initRepository finish', { note: 'not used in prepareAppRuntime' });
  runtimeTrace('openIndexedDB start', { note: 'not used in prepareAppRuntime' });
  runtimeTrace('openIndexedDB finish', { note: 'not used in prepareAppRuntime' });
  runtimeTrace('migrateLocalStorage start', { note: 'runs after prepareAppRuntime in appEntry' });
  runtimeTrace('migrateLocalStorage finish', { note: 'runs after prepareAppRuntime in appEntry' });
  runtimeTrace('loadCurrentChild start', { note: 'not used in prepareAppRuntime' });
  runtimeTrace('loadCurrentChild finish', { note: 'not used in prepareAppRuntime' });

  runtimeTrace('publishAppVersion start');
  publishAppVersion();
  runtimeTrace('publishAppVersion finish');

  runtimeTrace('disableServiceWorkersAndCaches start');
  await traceStartupPromise('prepareAppRuntime disableServiceWorkersAndCaches', () => disableServiceWorkersAndCaches());
  runtimeTrace('disableServiceWorkersAndCaches finish');

  runtimeTrace('fetchLatestBuildId start');
  const latestBuildId = await traceStartupPromise('prepareAppRuntime fetchLatestBuildId', () => fetchLatestBuildId());
  runtimeTrace('fetchLatestBuildId finish', { latestBuildId });

  runtimeTrace('readVersionMarker start');
  const storedBuildId = readVersionMarker();
  runtimeTrace('readVersionMarker finish', { storedBuildId });

  if (latestBuildId && latestBuildId !== APP_BUILD_ID) {
    runtimeTrace('stale build check found newer build', { latestBuildId, currentBuildId: APP_BUILD_ID });
    const refreshGuard = readSessionValue(APP_BUILD_REFRESH_GUARD_KEY);
    const nextGuard = `${APP_BUILD_ID}:${latestBuildId}`;
    if (refreshGuard !== nextGuard) {
      writeVersionMarker(latestBuildId);
      writeSessionValue(APP_BUILD_REFRESH_GUARD_KEY, nextGuard);
      console.info('[app-runtime] Detected newer build, reloading', {
        currentBuildId: APP_BUILD_ID,
        latestBuildId
      });
      reloadWithBuildBust(latestBuildId);
      return false;
    }
    console.warn('[app-runtime] Still running stale build after refresh attempt', {
      currentBuildId: APP_BUILD_ID,
      latestBuildId
    });
    renderStaleBuildNotice(latestBuildId);
    return false;
  }

  const buildIdToPersist = latestBuildId ?? APP_BUILD_ID;
  if (storedBuildId !== buildIdToPersist) {
    runtimeTrace('writeVersionMarker start', { buildIdToPersist });
    writeVersionMarker(buildIdToPersist);
    runtimeTrace('writeVersionMarker finish', { buildIdToPersist });
  }
  runtimeTrace('deleteSessionValue start', { key: APP_BUILD_REFRESH_GUARD_KEY });
  deleteSessionValue(APP_BUILD_REFRESH_GUARD_KEY);
  runtimeTrace('deleteSessionValue finish', { key: APP_BUILD_REFRESH_GUARD_KEY });
  runtimeTrace('syncAppShellMetadata start');
  syncAppShellMetadata();
  runtimeTrace('syncAppShellMetadata finish');
  runtimeTrace('prepareAppRuntime finish');
  return true;
}

const runtimeTrace = startupTrace;

function publishAppVersion() {
  if (typeof window === 'undefined') return;
  const bundleHash = getCurrentBundleHash();
  window.__APP_VERSION__ = {
    commit: APP_BUILD_ID,
    buildTime: APP_BUILD_TIME,
    bundleHash
  };
  console.info('[app-runtime] APP_VERSION', window.__APP_VERSION__);
}

function getCurrentBundleHash() {
  if (typeof document === 'undefined') return null;
  const scripts = Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[];
  const bundle = scripts
    .map((script) => script.src)
    .find((src) => /\/assets\/index-[^/]+\.js(?:\?|$)/.test(src));
  if (!bundle) return null;
  const match = bundle.match(/\/assets\/index-([^/]+)\.js(?:\?|$)/);
  return match?.[1] ?? null;
}

function reloadWithBuildBust(buildId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('build', buildId);
  window.location.replace(url.toString());
}

function renderStaleBuildNotice(buildId: string) {
  if (typeof document === 'undefined') return;
  document.body.innerHTML = `
    <main style="display:grid;min-height:100vh;place-items:center;padding:24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff9f0;color:#2f2e2b;">
      <section style="max-width:420px;border:1px solid #ecdfcf;border-radius:18px;background:#fff;padding:24px;box-shadow:0 12px 30px rgba(77,59,35,.08);">
        <h1 style="margin:0 0 10px;font-size:22px;">正在更新 Dreamers Family</h1>
        <p style="margin:0 0 18px;line-height:1.6;color:#6f675e;">偵測到新版已部署，但目前瀏覽器仍載入舊版檔案。請重新載入最新版。</p>
        <button id="reload-latest-build" style="border:0;border-radius:12px;background:#78966c;color:#fff;padding:12px 16px;font-weight:700;cursor:pointer;">重新載入最新版</button>
        <p style="margin:14px 0 0;font-size:12px;color:#8a8178;">Latest build: ${escapeHtml(buildId.slice(0, 12))}</p>
      </section>
    </main>
  `;
  document.getElementById('reload-latest-build')?.addEventListener('click', () => {
    deleteSessionValue(APP_BUILD_REFRESH_GUARD_KEY);
    reloadWithBuildBust(buildId);
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] ?? character);
}

async function disableServiceWorkersAndCaches() {
  if (typeof window === 'undefined') return;

  if ('serviceWorker' in navigator) {
    try {
      runtimeTrace('serviceWorker.getRegistrations start');
      const registrations = await traceStartupPromise(
        'navigator.serviceWorker.getRegistrations',
        () => navigator.serviceWorker.getRegistrations()
      );
      runtimeTrace('serviceWorker.getRegistrations finish', { count: registrations.length });
      runtimeTrace('serviceWorker.unregisterAll start', { count: registrations.length });
      await traceStartupPromiseAll(
        'serviceWorker.unregisterAll',
        registrations.map((registration, index) => ({
          label: `registration-${index}:${registration.scope}`,
          promise: registration.unregister()
        }))
      );
      runtimeTrace('serviceWorker.unregisterAll finish', { count: registrations.length });
      console.info('[app-runtime] Unregistered service workers', { count: registrations.length });
    } catch (caught) {
      console.warn('[app-runtime] Failed to unregister service workers', caught);
      runtimeTrace('serviceWorker cleanup failed', {
        message: caught instanceof Error ? caught.message : String(caught),
        stack: caught instanceof Error ? caught.stack ?? null : null
      });
    }
  } else {
    runtimeTrace('serviceWorker unavailable');
  }

  if ('caches' in window) {
    try {
      runtimeTrace('caches.keys start');
      const cacheNames = await traceStartupPromise('window.caches.keys', () => window.caches.keys());
      runtimeTrace('caches.keys finish', { count: cacheNames.length, cacheNames });
      runtimeTrace('caches.deleteAll start', { count: cacheNames.length, cacheNames });
      await traceStartupPromiseAll(
        'caches.deleteAll',
        cacheNames.map((name) => ({
          label: name,
          promise: window.caches.delete(name)
        }))
      );
      runtimeTrace('caches.deleteAll finish', { count: cacheNames.length, cacheNames });
      console.info('[app-runtime] Cleared browser caches while PWA is disabled', {
        bundleVersion: APP_BUILD_ID,
        cacheNames
      });
    } catch (caught) {
      console.warn('[app-runtime] Failed to clear browser caches', caught);
      runtimeTrace('cache cleanup failed', {
        message: caught instanceof Error ? caught.message : String(caught),
        stack: caught instanceof Error ? caught.stack ?? null : null
      });
    }
  } else {
    runtimeTrace('caches unavailable');
  }

  runtimeTrace('writeStorage cache markers start');
  writeStorage(APP_CACHE_MARKER_KEY, APP_BUILD_ID);
  writeStorage(APP_CACHE_CLEAR_MARKER_KEY, APP_BUILD_ID);
  runtimeTrace('writeStorage cache markers finish');
}

async function fetchLatestBuildId() {
  if (typeof window === 'undefined') return APP_BUILD_ID;

  try {
    runtimeTrace('fetch build-meta start', { url: BUILD_META_URL });
    const response = await traceStartupPromise(
      'fetch build-meta',
      () => fetch(`${BUILD_META_URL}?t=${Date.now()}`, {
        cache: 'no-store',
        credentials: 'same-origin'
      })
    );
    runtimeTrace('fetch build-meta finish', { ok: response.ok, status: response.status });
    if (!response.ok) return APP_BUILD_ID;
    runtimeTrace('parse build-meta start');
    const meta = (await traceStartupPromise('parse build-meta json', () => response.json())) as Partial<{ buildId: string; commit: string }>;
    runtimeTrace('parse build-meta finish', { meta });
    const buildId = typeof meta.buildId === 'string' && meta.buildId.trim() ? meta.buildId.trim() : null;
    const commit = typeof meta.commit === 'string' && meta.commit.trim() ? meta.commit.trim() : null;
    return buildId ?? commit ?? APP_BUILD_ID;
  } catch (error) {
    console.warn('[app-runtime] Failed to fetch latest build metadata', error);
    runtimeTrace('fetchLatestBuildId failed', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null
    });
    return APP_BUILD_ID;
  }
}

export function syncAppShellMetadata(pathname = typeof window !== 'undefined' ? window.location.pathname : '/') {
  if (typeof document === 'undefined') return;
  const isChild = pathname.startsWith('/child');
  const appName = isChild ? 'Dreamers Child' : 'Dreamers Family';
  const manifestHref = isChild
    ? `/manifest-child.webmanifest?v=${APP_BUILD_ID}`
    : `/manifest-parent.webmanifest?v=${APP_BUILD_ID}`;
  const iconHref = isChild
    ? `/app-icon-child.png?v=${APP_BUILD_ID}`
    : `/app-icon-parent.png?v=${APP_BUILD_ID}`;

  const existing = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  const manifestLink = existing ?? document.createElement('link');
  manifestLink.rel = 'manifest';
  manifestLink.href = manifestHref;
  if (!existing) document.head.appendChild(manifestLink);

  let iconLink = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
  if (!iconLink) {
    iconLink = document.createElement('link');
    iconLink.rel = 'apple-touch-icon';
    document.head.appendChild(iconLink);
  }
  iconLink.href = iconHref;

  const title = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (title) title.setAttribute('content', appName);
  document.title = appName;
}

function readVersionMarker() {
  const local = getLocalStorage().getItem(APP_BUILD_ID_KEY);
  return local ?? getCookieValue(APP_BUILD_ID_KEY);
}

function writeVersionMarker(value: string) {
  try {
    getLocalStorage().setItem(APP_BUILD_ID_KEY, value);
  } catch {
    // Cookie fallback preserves the marker when storage is isolated in iOS/PWA shells.
  }
  setCookieValue(APP_BUILD_ID_KEY, value, 60 * 60 * 24 * 365 * 2);
}

function readSessionValue(key: string) {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionValue(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Session storage is best-effort.
  }
}

function deleteSessionValue(key: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Session storage is best-effort.
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Cache version markers are best-effort and are not application data.
  }
}
