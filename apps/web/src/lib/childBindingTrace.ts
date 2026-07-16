const callCounts = new Map<string, number>();
let traceSequence = 0;

export const CHILD_BINDING_TRACE_EVENT = 'child-binding-trace';

export type ChildBindingTraceEntry = {
  id: number;
  timestamp: string;
  label: string;
  payload: Record<string, unknown>;
};

export function hashForTrace(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function recordBindChildDeviceCall(token: string) {
  const tokenHash = hashForTrace(token);
  const nextCount = (callCounts.get(tokenHash) ?? 0) + 1;
  callCounts.set(tokenHash, nextCount);
  return { tokenHash, callCount: nextCount, secondCall: nextCount > 1 };
}

export function childBindingTrace(label: string, payload: Record<string, unknown> = {}) {
  const entry: ChildBindingTraceEntry = {
    id: traceSequence += 1,
    timestamp: new Date().toISOString(),
    label,
    payload
  };
  console.log(`[child-binding-trace] ${label}`, payload);
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(CHILD_BINDING_TRACE_EVENT, { detail: entry }));
  }
}
