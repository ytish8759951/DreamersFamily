import { startupTrace, traceStartupPromise } from './lib/startupTrace';
import { getErrorMessage, getErrorStack, serializeError } from './lib/errorDiagnostics';

type BootTraceWindow = Window & {
  __DREAMERS_BOOT_TRACE__?: (label: string, payload?: Record<string, unknown>) => void;
  __DREAMERS_MAIN_STARTED__?: boolean;
};

function bootTrace(label: string, payload: Record<string, unknown> = {}) {
  const trace = (window as BootTraceWindow).__DREAMERS_BOOT_TRACE__;
  if (typeof trace === 'function') {
    trace(label, payload);
    return;
  }
  console.log(label, payload);
}

function showBootstrapFailed(error: unknown) {
  const root = document.getElementById('root');
  const message = getErrorMessage(error);
  const stack = getErrorStack(error) ?? '';
  console.error('BOOTSTRAP FAILED', { message, stack, error });
  bootTrace('BOOTSTRAP FAILED', { message, stack, error: serializeError(error) });
  if (!root) return;
  root.textContent = '';
  const main = document.createElement('main');
  main.setAttribute('style', 'padding:24px;font-family:system-ui,sans-serif;line-height:1.5;');
  const title = document.createElement('h1');
  title.textContent = 'BOOTSTRAP FAILED';
  const copy = document.createElement('p');
  copy.textContent = message;
  const stackBlock = document.createElement('pre');
  stackBlock.setAttribute('style', 'white-space:pre-wrap;word-break:break-word;font-size:12px;');
  stackBlock.textContent = stack;
  main.append(title, copy, stackBlock);
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
    showBootstrapFailed(error);
  }
})();
