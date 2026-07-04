import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { prepareAppRuntime } from './lib/appRuntime';
import { migrateLocalStorageMediaToRepository } from './lib/mediaMigration';
import './styles/index.css';

window.addEventListener('error', (event) => {
  console.error('WINDOW ERROR', event.error, event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('PROMISE ERROR', event.reason);
});

void prepareAppRuntime().finally(() => migrateLocalStorageMediaToRepository()).finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>
  );
  console.log('React Root Mounted');
});
