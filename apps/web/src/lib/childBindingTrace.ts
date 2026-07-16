const callCounts = new Map<string, number>();

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
  console.log(`[child-binding-trace] ${label}`, payload);
}
