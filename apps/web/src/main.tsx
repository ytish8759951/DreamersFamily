import { startupTrace, traceStartupPromise } from './lib/startupTrace';
import { getErrorMessage, getErrorStack, serializeError } from './lib/errorDiagnostics';

type BootTraceWindow = Window & {
  __DREAMERS_BOOT_TRACE__?: (label: string, payload?: Record<string, unknown>) => void;
  __DREAMERS_MAIN_STARTED__?: boolean;
};

const BOOT_RECOVERY_GUARD_KEY = 'little-dreamers-family:boot-module-recovery';
const BUILD_META_URL = '/build-meta.json';

function bootTrace(label: string, payload: Record<string, unknown> = {}) {
  const trace = (window as BootTraceWindow).__DREAMERS_BOOT_TRACE__;
  if (typeof trace === 'function') {
    trace(label, payload);
    return;
  }
  console.log(label, payload);
}

function isModuleImportFailure(error: unknown) {
  const message = getErrorMessage(error, '').toLowerCase();
  const stack = (getErrorStack(error) ?? '').toLowerCase();
  const combined = `${message}\n${stack}`;
  return [
    'importing a module script failed',
    'failed to fetch dynamically imported module',
    'error loading dynamically imported module',
    'chunkloaderror',
    'unable to preload css',
    'module script',
    'mime type',
    'asset chunk is no longer available'
  ].some((pattern) => combined.includes(pattern));
}

async function fetchLatestBuildIdForRecovery() {
  try {
    const response = await fetch(`${BUILD_META_URL}?recovery=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin'
    });
    if (!response.ok) return null;
    const meta = await response.json() as Partial<{ buildId: string; commit: string }>;
    return (typeof meta.buildId === 'string' && meta.buildId.trim())
      ? meta.buildId.trim()
      : (typeof meta.commit === 'string' && meta.commit.trim())
        ? meta.commit.trim()
        : null;
  } catch (error) {
    bootTrace('BOOT RECOVERY BUILD META FAILED', {
      message: getErrorMessage(error),
      error: serializeError(error)
    });
    return null;
  }
}

function reloadWithLatestBuild(buildId: string | null, reason: string) {
  const url = new URL(window.location.href);
  if (buildId) url.searchParams.set('build', buildId);
  url.searchParams.set('bootRecovery', reason);
  window.location.replace(url.toString());
}

async function recoverFromModuleImportFailure(error: unknown) {
  if (!isModuleImportFailure(error)) return false;
  const latestBuildId = await fetchLatestBuildIdForRecovery();
  const guardValue = `${latestBuildId ?? 'unknown'}:${window.location.pathname}`;
  if (sessionStorage.getItem(BOOT_RECOVERY_GUARD_KEY) === guardValue) {
    bootTrace('BOOT RECOVERY GUARD HIT', { latestBuildId, pathname: window.location.pathname });
    return false;
  }
  sessionStorage.setItem(BOOT_RECOVERY_GUARD_KEY, guardValue);
  bootTrace('BOOT RECOVERY RELOAD', {
    latestBuildId,
    pathname: window.location.pathname,
    message: getErrorMessage(error)
  });
  reloadWithLatestBuild(latestBuildId, 'module-import');
  return true;
}

async function showBootstrapFailed(error: unknown) {
  const recovered = await recoverFromModuleImportFailure(error);
  if (recovered) return;
  const root = document.getElementById('root');
  const message = getErrorMessage(error);
  const stack = getErrorStack(error) ?? '';
  console.error('BOOTSTRAP FAILED', { message, stack, error });
  bootTrace('BOOTSTRAP FAILED', { message, stack, error: serializeError(error) });
  if (!root) return;
  root.textContent = '';
  const main = document.createElement('main');
  main.setAttribute('style', 'display:grid;min-height:100vh;place-items:center;padding:24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5;background:#fff9f0;color:#2f2e2b;');
  const panel = document.createElement('section');
  panel.setAttribute('style', 'width:min(100%,460px);border:1px solid #ecdfcf;border-radius:18px;background:#fff;padding:24px;box-shadow:0 12px 30px rgba(77,59,35,.08);');
  const title = document.createElement('h1');
  title.setAttribute('style', 'margin:0 0 10px;font-size:22px;');
  title.textContent = 'DreamersFamily 載入新版時失敗';
  const copy = document.createElement('p');
  copy.setAttribute('style', 'margin:0 0 14px;color:#6f675e;');
  copy.textContent = isModuleImportFailure(error)
    ? '瀏覽器載到了舊版程式片段。請按下重新載入新版，系統只會重新整理頁面，不會清除孩子登入或本機資料。'
    : `啟動時發生錯誤：${message}`;
  const reloadButton = document.createElement('button');
  reloadButton.type = 'button';
  reloadButton.textContent = '重新載入新版';
  reloadButton.setAttribute('style', 'min-height:48px;border:0;border-radius:12px;background:#78966c;color:#fff;padding:12px 16px;font-weight:800;cursor:pointer;');
  reloadButton.addEventListener('click', async () => {
    sessionStorage.removeItem(BOOT_RECOVERY_GUARD_KEY);
    reloadWithLatestBuild(await fetchLatestBuildIdForRecovery(), 'manual');
  });
  const stackBlock = document.createElement('pre');
  stackBlock.setAttribute('style', 'margin:16px 0 0;white-space:pre-wrap;word-break:break-word;font-size:12px;color:#8a8178;max-height:180px;overflow:auto;');
  stackBlock.textContent = stack;
  panel.append(title, copy, reloadButton, stackBlock);
  main.append(panel);
  root.append(main);
}

bootTrace('MAIN START', {
  href: window.location.href,
  pathname: window.location.pathname,
  userAgent: navigator.userAgent
});
startupTrace('main.ts start', {
  href: window.location.href,
  pathname: window.location.pathname
});
(window as BootTraceWindow).__DREAMERS_MAIN_STARTED__ = true;

window.addEventListener('error', (event) => {
  bootTrace('BOOT WINDOW ERROR', {
    message: event.message,
    filename: event.filename,
    line: event.lineno,
    column: event.colno,
    stack: event.error instanceof Error ? event.error.stack ?? null : null
  });
});

window.addEventListener('unhandledrejection', (event) => {
  bootTrace('BOOT PROMISE ERROR', {
    message: getErrorMessage(event.reason, 'Unknown promise error'),
    stack: getErrorStack(event.reason),
    error: serializeError(event.reason)
  });
});

void (async () => {
  try {
    bootTrace('IMPORT APP');
    const app = await traceStartupPromise('main.ts import appEntry', () => import('./appEntry'));
    await traceStartupPromise('main.ts startApp', () => app.startApp());
    startupTrace('main.ts finish');
  } catch (error) {
    startupTrace('main.ts error', {
      message: getErrorMessage(error),
      stack: getErrorStack(error),
      error: serializeError(error)
    });
    void showBootstrapFailed(error);
  }
})();
