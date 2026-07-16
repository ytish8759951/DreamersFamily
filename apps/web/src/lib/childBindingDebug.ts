import { parseChildDeviceToken } from './childDeviceToken';
import { dataMode, dataRepository } from './dataRepository';
import { getErrorMessage } from './errorDiagnostics';

export const CHILD_BINDING_DEBUG_PREFIX = '[child-binding-debug]';

export function debugChildBinding(label: string, payload: Record<string, unknown>) {
  console.log(`${CHILD_BINDING_DEBUG_PREFIX} ${label}`, payload);
}

export function decodeChildTokenForDebug(childToken: string) {
  const decoded = parseChildDeviceToken(childToken);
  return {
    childToken,
    decoded,
    childId: decoded?.childId ?? null,
    familyId: null
  };
}

export function getRouteDebugInfo(pathname?: string) {
  if (typeof window === 'undefined') {
    return {
      href: null,
      route: pathname ?? null,
      pathname: pathname ?? null
    };
  }
  return {
    href: window.location.href,
    route: pathname ?? window.location.pathname,
    pathname: window.location.pathname
  };
}

export async function getDeviceDebugInfo() {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const platform = typeof navigator !== 'undefined' ? navigator.platform : '';
  const standaloneMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(display-mode: standalone)').matches
    : false;
  const navigatorStandalone = typeof navigator !== 'undefined'
    && 'standalone' in navigator
    && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

  return {
    deviceId: dataRepository.getState().device_id ?? null,
    platform,
    browser: userAgent,
    pwa: standaloneMedia || navigatorStandalone,
    localStorage: testLocalStorage(),
    indexedDB: await testIndexedDB(),
    cookie: testCookie()
  };
}

export function getRepositoryDebugInfo() {
  return {
    dataMode,
    repositoryName: dataRepository.constructor.name,
    source: 'dataRepository'
  };
}

function testLocalStorage() {
  if (typeof window === 'undefined') return { available: false, reason: 'no-window' };
  const key = 'child-binding-debug-localstorage';
  try {
    window.localStorage.setItem(key, '1');
    const value = window.localStorage.getItem(key);
    window.localStorage.removeItem(key);
    return { available: value === '1' };
  } catch (error) {
    return { available: false, error: getErrorMessage(error) };
  }
}

function testCookie() {
  if (typeof document === 'undefined') return { available: false, reason: 'no-document' };
  const key = 'child-binding-debug-cookie';
  try {
    document.cookie = `${key}=1; path=/; max-age=60; SameSite=Lax`;
    const available = document.cookie.includes(`${key}=1`);
    document.cookie = `${key}=; path=/; max-age=0; SameSite=Lax`;
    return { available };
  } catch (error) {
    return { available: false, error: getErrorMessage(error) };
  }
}

async function testIndexedDB() {
  if (typeof indexedDB === 'undefined') return { available: false, reason: 'no-indexeddb' };
  const dbName = 'child-binding-debug-indexeddb';
  return new Promise<{ available: boolean; error?: string }>((resolve) => {
    try {
      const request = indexedDB.open(dbName, 1);
      request.onerror = () => resolve({ available: false, error: getErrorMessage(request.error) });
      request.onsuccess = () => {
        request.result.close();
        indexedDB.deleteDatabase(dbName);
        resolve({ available: true });
      };
      request.onupgradeneeded = () => undefined;
    } catch (error) {
      resolve({ available: false, error: getErrorMessage(error) });
    }
  });
}
