import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { prepareAppRuntime } from './lib/appRuntime';
import { migrateLocalStorageMediaToRepository } from './lib/mediaMigration';
import { markReactMounted, recordPromiseError, recordWindowError } from './lib/runtimeDebug';
import { installMobileTouchInteractions } from './lib/touchInteractions';
import './styles/index.css';

console.log('APP START', {
  href: window.location.href,
  pathname: window.location.pathname,
  commit: __BUILD_COMMIT__,
  buildTime: __BUILD_TIME__
});

window.onerror = (_message, _source, _lineno, _colno, error) => {
  const text = error instanceof Error ? error.message : typeof _message === 'string' ? _message : 'Unknown window error';
  recordWindowError(text);
  console.error('WINDOW ERROR', error, _message);
  return false;
};

window.onunhandledrejection = (event) => {
  const text = event.reason instanceof Error ? event.reason.message : String(event.reason ?? 'Unknown promise error');
  recordPromiseError(text);
  console.error('PROMISE ERROR', event.reason);
};

function showRouterFailed(error: unknown) {
  const root = document.getElementById('root');
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack ?? '' : '';
  console.error('ROUTER FAILED', { message, stack, error });
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

void (async () => {
  try {
    console.log('ROUTER START', {
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

    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <div>Build: {__BUILD_COMMIT__.slice(0, 8)}</div>
        <RouterProvider router={router} />
      </React.StrictMode>
    );
    markReactMounted();
    console.log('React Root Mounted');
  } catch (error) {
    showRouterFailed(error);
  }
})();
