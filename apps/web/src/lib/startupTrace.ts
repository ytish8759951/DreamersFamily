import { getErrorMessage, getErrorStack, serializeError } from './errorDiagnostics';

export const STARTUP_TIMEOUT_MS = 5000;
export const TIMING_TRACE_TIMEOUT_MS = 2000;

type BootTraceWindow = Window & {
  __DREAMERS_BOOT_TRACE__?: (label: string, payload?: Record<string, unknown>) => void;
  __DREAMERS_TIMING_TRACE__?: TimingTraceStore;
};

type TimingTraceKind = 'promise' | 'span';

type TimingTracePending = {
  id: number;
  label: string;
  kind: TimingTraceKind;
  startedAt: number;
  timedOut: boolean;
  payload: Record<string, unknown>;
};

type TimingTraceCompleted = {
  id: number;
  label: string;
  kind: TimingTraceKind;
  status: 'END' | 'ERROR';
  startedAt: number;
  endedAt: number;
  durationMs: number;
  payload: Record<string, unknown>;
};

type TimingTraceStore = {
  pending: TimingTracePending[];
  completed: TimingTraceCompleted[];
  lastCompletedPromise: TimingTraceCompleted | null;
  firstPendingPromise: TimingTracePending | null;
};

let timingTraceSequence = 0;

export function startupTrace(label: string, payload: Record<string, unknown> = {}) {
  console.log(label, payload);
  if (typeof window === 'undefined') return;
  const trace = (window as BootTraceWindow).__DREAMERS_BOOT_TRACE__;
  if (typeof trace === 'function') trace(label, payload);
}

function getTimingTraceStore(): TimingTraceStore | null {
  if (typeof window === 'undefined') return null;
  const traceWindow = window as BootTraceWindow;
  if (!traceWindow.__DREAMERS_TIMING_TRACE__) {
    traceWindow.__DREAMERS_TIMING_TRACE__ = {
      pending: [],
      completed: [],
      lastCompletedPromise: null,
      firstPendingPromise: null
    };
  }
  return traceWindow.__DREAMERS_TIMING_TRACE__;
}

function refreshFirstPendingPromise(store: TimingTraceStore) {
  store.firstPendingPromise = store.pending.find((entry) => entry.kind === 'promise') ?? null;
}

function logTimingTraceSummary(reason: string) {
  const store = getTimingTraceStore();
  if (!store) return;
  refreshFirstPendingPromise(store);
  startupTrace('ASYNC TRACE SUMMARY', {
    reason,
    lastCompletedPromise: store.lastCompletedPromise
      ? {
          label: store.lastCompletedPromise.label,
          status: store.lastCompletedPromise.status,
          durationMs: store.lastCompletedPromise.durationMs
        }
      : null,
    firstPendingPromise: store.firstPendingPromise
      ? {
          label: store.firstPendingPromise.label,
          durationMs: Date.now() - store.firstPendingPromise.startedAt,
          timedOut: store.firstPendingPromise.timedOut
        }
      : null,
    pendingPromises: store.pending
      .filter((entry) => entry.kind === 'promise')
      .map((entry) => ({
        label: entry.label,
        durationMs: Date.now() - entry.startedAt,
        timedOut: entry.timedOut
      }))
  });
}

export function beginTimingTrace(
  label: string,
  payload: Record<string, unknown> = {},
  kind: TimingTraceKind = 'span'
) {
  const id = ++timingTraceSequence;
  const startedAt = Date.now();
  const store = getTimingTraceStore();
  const pending: TimingTracePending = { id, label, kind, startedAt, timedOut: false, payload };
  store?.pending.push(pending);
  if (store) refreshFirstPendingPromise(store);
  startupTrace(`${label} START`, payload);

  let completed = false;
  let handle = 0;
  if (typeof window !== 'undefined') {
    handle = window.setTimeout(() => {
      if (completed) return;
      pending.timedOut = true;
      startupTrace(`${label} TIMEOUT`, { ...payload, durationMs: Date.now() - startedAt });
      if (kind === 'promise') logTimingTraceSummary(`${label} TIMEOUT`);
    }, TIMING_TRACE_TIMEOUT_MS);
  }

  const finish = (status: 'END' | 'ERROR', extraPayload: Record<string, unknown> = {}) => {
    if (completed) return;
    completed = true;
    if (typeof window !== 'undefined') window.clearTimeout(handle);
    const durationMs = Date.now() - startedAt;
    const finalPayload = { ...payload, ...extraPayload, durationMs };
    const currentStore = getTimingTraceStore();
    if (currentStore) {
      currentStore.pending = currentStore.pending.filter((entry) => entry.id !== id);
      const completedEntry: TimingTraceCompleted = {
        id,
        label,
        kind,
        status,
        startedAt,
        endedAt: Date.now(),
        durationMs,
        payload: finalPayload
      };
      currentStore.completed.push(completedEntry);
      if (kind === 'promise' && status === 'END') currentStore.lastCompletedPromise = completedEntry;
      refreshFirstPendingPromise(currentStore);
    }
    startupTrace(`${label} ${status}`, finalPayload);
    if (kind === 'promise') logTimingTraceSummary(`${label} ${status}`);
  };

  return {
    end: (extraPayload: Record<string, unknown> = {}) => finish('END', extraPayload),
    error: (error: unknown, extraPayload: Record<string, unknown> = {}) => {
      finish('ERROR', {
        ...extraPayload,
        message: getErrorMessage(error),
        stack: getErrorStack(error),
        error: serializeError(error)
      });
    }
  };
}

export async function traceTimingPromise<T>(
  label: string,
  promiseFactory: () => PromiseLike<T> | Promise<T>,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const trace = beginTimingTrace(label, payload, 'promise');
  try {
    const result = await promiseFactory();
    trace.end();
    return result;
  } catch (error) {
    trace.error(error);
    throw error;
  }
}

export function traceStartupError(label: string, error: unknown, payload: Record<string, unknown> = {}) {
  startupTrace(`${label} error`, {
    ...payload,
    message: getErrorMessage(error),
    stack: getErrorStack(error),
    error: serializeError(error)
  });
}

export async function traceStartupPromise<T>(
  label: string,
  promiseFactory: () => Promise<T>,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const startedAt = Date.now();
  startupTrace(`${label} start`, payload);
  let handle = 0;
  try {
    const result = await Promise.race([
      promiseFactory(),
      new Promise<T>((_resolve, reject) => {
        if (typeof window === 'undefined') return;
        handle = window.setTimeout(() => {
          const error = new Error(`Timeout waiting... ${label}`);
          startupTrace(`${label} timeout`, { ...payload, durationMs: Date.now() - startedAt });
          startupTrace('Timeout waiting...', { promise: label, durationMs: Date.now() - startedAt, ...payload });
          reject(error);
        }, STARTUP_TIMEOUT_MS);
      })
    ]);
    startupTrace(`${label} finish`, { ...payload, durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    traceStartupError(label, error, { ...payload, durationMs: Date.now() - startedAt });
    throw error;
  } finally {
    if (typeof window !== 'undefined') window.clearTimeout(handle);
  }
}

export function traceStartupPromiseAll<T>(
  label: string,
  entries: Array<{ label: string; promise: Promise<T> }>
): Promise<T[]> {
  startupTrace(`${label} start`, { promises: entries.map((entry) => entry.label) });
  const wrapped = entries.map((entry) =>
    traceStartupPromise(`${label}:${entry.label}`, () => entry.promise)
  );
  return traceStartupPromise(label, () => Promise.all(wrapped), {
    promises: entries.map((entry) => entry.label)
  });
}
