import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { prepareAppRuntime } from './lib/appRuntime';
import { migrateLocalStorageMediaToRepository } from './lib/mediaMigration';
import { markReactMounted, recordPromiseError, recordWindowError } from './lib/runtimeDebug';
import { installMobileTouchInteractions } from './lib/touchInteractions';
import './styles/index.css';

type BootTraceWindow = Window & {
  __DREAMERS_BOOT_TRACE__?: (label: string, payload?: Record<string, unknown>) => void;
};

function bootTrace(label: string, payload: Record<string, unknown> = {}) {
  const trace = (window as BootTraceWindow).__DREAMERS_BOOT_TRACE__;
  if (typeof trace === 'function') {
    trace(label, payload);
    return;
  }
  console.log(label, payload);
}

bootTrace('IMPORT APP', {
  href: window.location.href,
  pathname: window.location.pathname,
  commit: __BUILD_COMMIT__,
  buildTime: __BUILD_TIME__
});

window.onerror = (_message, _source, _lineno, _colno, error) => {
  const text = error instanceof Error ? error.message : typeof _message === 'string' ? _message : 'Unknown window error';
  recordWindowError(text);
  console.error('WINDOW ERROR', error, _message);
  bootTrace('WINDOW ERROR', {
    message: text,
    source: _source ?? null,
    line: _lineno ?? null,
    column: _colno ?? null,
    stack: error instanceof Error ? error.stack ?? null : null
  });
  return false;
};

window.onunhandledrejection = (event) => {
  const text = event.reason instanceof Error ? event.reason.message : String(event.reason ?? 'Unknown promise error');
  recordPromiseError(text);
  console.error('PROMISE ERROR', event.reason);
  bootTrace('PROMISE ERROR', {
    message: text,
    stack: event.reason instanceof Error ? event.reason.stack ?? null : null
  });
};

function showRouterFailed(error: unknown) {
  const root = document.getElementById('root');
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack ?? '' : '';
  console.error('ROUTER FAILED', { message, stack, error });
  bootTrace('ROUTER FAILED', { message, stack });
  if (!root) return;
  root.textContent = '';
  const main = document.createElement('main');
  main.setAttribute('style', 'padding:24px;font-family:system-ui,sans-serif;line-height:1.5;');
  const title = document.createElement('h1');
  title.textContent = 'ROUTER FAILED';
  const copy = document.createElement('p');
  copy.textContent = message;
  const stackBlock = document.createElement('pre');
  stackBlock.setAttribute('style', 'white-space:pre-wrap;word-break:break-word;font-size:12px;');
  stackBlock.textContent = stack;
  main.append(title, copy, stackBlock);
  root.append(main);
}

export async function startApp() {
  try {
    bootTrace('REACT START', {
      href: window.location.href,
      pathname: window.location.pathname
    });

    bootTrace('ROUTER START', {
      href: window.location.href,
      pathname: window.location.pathname
    });

    const shouldContinue = await prepareAppRuntime();
    if (!shouldContinue) {
      showRouterFailed(new Error('prepareAppRuntime returned false'));
      return;
    }

    installMobileTouchInteractions();

    await migrateLocalStorageMediaToRepository();

    const rootElement = document.getElementById('root');
    if (!rootElement) throw new Error('Missing #root element');

    rootElement.dataset.reactMounted = '1';
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <div>Build: {__BUILD_COMMIT__.slice(0, 8)}</div>
        <RouterProvider router={router} />
      </React.StrictMode>
    );
    markReactMounted();
    bootTrace('React Root Mounted');
  } catch (error) {
    showRouterFailed(error);
  }
}
