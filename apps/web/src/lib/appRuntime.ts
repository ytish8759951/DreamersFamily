import { getCookieValue, getLocalStorage, setCookieValue } from './storage';

export const APP_BUILD_ID = __BUILD_COMMIT__;
export const APP_BUILD_TIME = __BUILD_TIME__;
export const APP_CACHE_MARKER_KEY = 'little-dreamers-family:bundle-version';
export const APP_CACHE_CLEAR_MARKER_KEY = 'little-dreamers-family:last-cache-clear';
export const APP_BUILD_ID_KEY = 'little-dreamers-family:build-id';
const APP_BUILD_REFRESH_GUARD_KEY = 'little-dreamers-family:build-refresh-guard';
const BUILD_META_URL = '/build-meta.json';

export async function prepareAppRuntime() {
  publishAppVersion();
  await disableServiceWorkersAndCaches();
  const latestBuildId = await fetchLatestBuildId();
  const storedBuildId = readVersionMarker();

  if (latestBuildId && latestBuildId !== APP_BUILD_ID) {
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
    writeVersionMarker(buildIdToPersist);
  }
  deleteSessionValue(APP_BUILD_REFRESH_GUARD_KEY);
  syncAppShellMetadata();
  return true;
}

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
        bundleVersion: APP_BUILD_ID,
        cacheNames
      });
    } catch (caught) {
      console.warn('[app-runtime] Failed to clear browser caches', caught);
    }
  }

  writeStorage(APP_CACHE_MARKER_KEY, APP_BUILD_ID);
  writeStorage(APP_CACHE_CLEAR_MARKER_KEY, APP_BUILD_ID);
}

async function fetchLatestBuildId() {
  if (typeof window === 'undefined') return APP_BUILD_ID;

  try {
    const response = await fetch(`${BUILD_META_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin'
    });
    if (!response.ok) return APP_BUILD_ID;
    const meta = (await response.json()) as Partial<{ buildId: string; commit: string }>;
    const buildId = typeof meta.buildId === 'string' && meta.buildId.trim() ? meta.buildId.trim() : null;
    const commit = typeof meta.commit === 'string' && meta.commit.trim() ? meta.commit.trim() : null;
    return buildId ?? commit ?? APP_BUILD_ID;
  } catch (error) {
    console.warn('[app-runtime] Failed to fetch latest build metadata', error);
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
