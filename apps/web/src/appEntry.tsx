import React, { Component, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { prepareAppRuntime } from './lib/appRuntime';
import { getErrorMessage, getErrorStack, serializeError } from './lib/errorDiagnostics';
import { migrateLocalStorageMediaToRepository } from './lib/mediaMigration';
import { markReactMounted, recordPromiseError, recordWindowError } from './lib/runtimeDebug';
import { startupTrace, traceStartupPromise } from './lib/startupTrace';
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
  const text = error ? getErrorMessage(error, 'Unknown window error') : typeof _message === 'string' ? _message : 'Unknown window error';
  recordWindowError(text);
  console.error('WINDOW ERROR', error, _message);
  bootTrace('WINDOW ERROR', {
    message: text,
    source: _source ?? null,
    line: _lineno ?? null,
    column: _colno ?? null,
    stack: getErrorStack(error),
    error: error ? serializeError(error) : null
  });
  return false;
};

window.onunhandledrejection = (event) => {
  const text = getErrorMessage(event.reason, 'Unknown promise error');
  recordPromiseError(text);
  console.error('PROMISE ERROR', event.reason);
  bootTrace('PROMISE ERROR', {
    message: text,
    stack: getErrorStack(event.reason),
    error: serializeError(event.reason)
  });
};

function showRouterFailed(error: unknown) {
  const root = document.getElementById('root');
  const message = getErrorMessage(error);
  const stack = getErrorStack(error) ?? '';
  console.error('ROUTER FAILED', { message, stack, error });
  bootTrace('ROUTER FAILED', { message, stack, error: serializeError(error) });
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

function ErrorOverlay({ error, componentStack = '' }: { error: Error; componentStack?: string }) {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', lineHeight: 1.5 }}>
      <h1>ErrorOverlay</h1>
      <p>{error.message}</p>
      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12 }}>
        {error.stack}
        {'\n'}
        {componentStack}
      </pre>
    </main>
  );
}

type AppErrorBoundaryState = {
  error: Error | null;
  componentStack: string;
};

class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null, componentStack: '' };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error, componentStack: '' };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    bootTrace('ErrorOverlay', {
      message: error.message,
      stack: error.stack ?? null,
      componentStack: info.componentStack
    });
    console.error('ErrorOverlay', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack
    });
    this.setState({ componentStack: info.componentStack });
  }

  render() {
    if (this.state.error) {
      return <ErrorOverlay error={this.state.error} componentStack={this.state.componentStack} />;
    }

    return this.props.children;
  }
}

function RouterRenderTrace() {
  bootTrace('Router render');
  return null;
}

export async function startApp() {
  try {
    startupTrace('startApp start', {
      href: window.location.href,
      pathname: window.location.pathname
    });
    bootTrace('REACT START', {
      href: window.location.href,
      pathname: window.location.pathname
    });
    bootTrace('Suspense check', {
      found: false,
      note: 'No React Suspense boundary is used in the startup route tree.'
    });

    bootTrace('ROUTER START', {
      href: window.location.href,
      pathname: window.location.pathname
    });

    const shouldContinue = await traceStartupPromise('startApp prepareAppRuntime', () => prepareAppRuntime());
    if (!shouldContinue) {
      showRouterFailed(new Error('prepareAppRuntime returned false'));
      return;
    }

    startupTrace('installMobileTouchInteractions start');
    installMobileTouchInteractions();
    startupTrace('installMobileTouchInteractions finish');

    await traceStartupPromise(
      'startApp migrateLocalStorageMediaToRepository',
      () => migrateLocalStorageMediaToRepository()
    );

    startupTrace('rootElement lookup start');
    const rootElement = document.getElementById('root');
    if (!rootElement) throw new Error('Missing #root element');
    startupTrace('rootElement lookup finish');

    rootElement.dataset.reactMounted = '1';
    bootTrace('Router render', { phase: 'before RouterProvider' });
    startupTrace('RouterProvider render start');
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <AppErrorBoundary>
          <RouterRenderTrace />
          <div>Build: {__BUILD_COMMIT__.slice(0, 8)}</div>
          <RouterProvider router={router} />
        </AppErrorBoundary>
      </React.StrictMode>
    );
    startupTrace('RouterProvider render finish');
    markReactMounted();
    bootTrace('Router render', { phase: 'after RouterProvider render call' });
    bootTrace('React Root Mounted');
    startupTrace('startApp finish');
  } catch (error) {
    startupTrace('startApp error', {
      message: getErrorMessage(error),
      stack: getErrorStack(error),
      error: serializeError(error)
    });
    showRouterFailed(error);
  }
}
