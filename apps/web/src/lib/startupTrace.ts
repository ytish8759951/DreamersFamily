const STARTUP_TIMEOUT_MS = 5000;

type BootTraceWindow = Window & {
  __DREAMERS_BOOT_TRACE__?: (label: string, payload?: Record<string, unknown>) => void;
};

export function startupTrace(label: string, payload: Record<string, unknown> = {}) {
  console.log(label, payload);
  if (typeof window === 'undefined') return;
  const trace = (window as BootTraceWindow).__DREAMERS_BOOT_TRACE__;
  if (typeof trace === 'function') trace(label, payload);
}

export function traceStartupError(label: string, error: unknown, payload: Record<string, unknown> = {}) {
  startupTrace(`${label} error`, {
    ...payload,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? null : null
  });
}

export async function traceStartupPromise<T>(
  label: string,
  promiseFactory: () => Promise<T>,
  payload: Record<string, unknown> = {}
): Promise<T> {
  startupTrace(`${label} start`, payload);
  let handle = 0;
  try {
    const result = await Promise.race([
      promiseFactory(),
      new Promise<T>((_resolve, reject) => {
        if (typeof window === 'undefined') return;
        handle = window.setTimeout(() => {
          const error = new Error(`Timeout waiting... ${label}`);
          startupTrace(`${label} timeout`, payload);
          startupTrace('Timeout waiting...', { promise: label, ...payload });
          reject(error);
        }, STARTUP_TIMEOUT_MS);
      })
    ]);
    startupTrace(`${label} finish`, payload);
    return result;
  } catch (error) {
    traceStartupError(label, error, payload);
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
