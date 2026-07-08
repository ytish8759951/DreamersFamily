import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { prepareAppRuntime } from './lib/appRuntime';
import { migrateLocalStorageMediaToRepository } from './lib/mediaMigration';
import { markReactMounted, recordPromiseError, recordWindowError } from './lib/runtimeDebug';
import { installMobileTouchInteractions } from './lib/touchInteractions';
import './styles/index.css';

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

void (async () => {
  const shouldContinue = await prepareAppRuntime();
  if (!shouldContinue) return;

  installMobileTouchInteractions();

  await migrateLocalStorageMediaToRepository();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <div>Build: {__BUILD_COMMIT__.slice(0, 8)}</div>
      <RouterProvider router={router} />
    </React.StrictMode>
  );
  markReactMounted();
  console.log('React Root Mounted');
})();
