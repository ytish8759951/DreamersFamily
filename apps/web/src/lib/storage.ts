export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

class MemoryStorage implements KeyValueStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const memoryStorage = new MemoryStorage();

export function getLocalStorage(): KeyValueStorage {
  if (typeof window === 'undefined') return memoryStorage;

  try {
    const storage = window.localStorage;
    const probe = '__little_dreamers_storage_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return memoryStorage;
  }
}

export function readJson<T>(storage: KeyValueStorage, key: string): T | null {
  const raw = storage.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function writeJson<T>(storage: KeyValueStorage, key: string, value: T) {
  const serialized = JSON.stringify(value);
  try {
    storage.setItem(key, serialized);
  } catch (error) {
    logStorageError(error);
    throw error;
  }
}

export function getLocalStorageDiagnostics() {
  if (typeof window === 'undefined') {
    return {
      jsonStringifyLength: 0,
      estimatedBytes: 0,
      estimatedKb: 0
    };
  }

  const jsonStringifyLength = JSON.stringify(window.localStorage).length;
  let estimatedBytes = 0;
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index) ?? '';
    const value = window.localStorage.getItem(key) ?? '';
    estimatedBytes += (key.length + value.length) * 2;
  }

  return {
    jsonStringifyLength,
    estimatedBytes,
    estimatedKb: Math.round((estimatedBytes / 1024) * 10) / 10
  };
}

export function logStorageError(error: unknown) {
  const diagnostics = getLocalStorageDiagnostics();
  console.error('[localStorage] write failed', {
    'error.name': error instanceof DOMException || error instanceof Error ? error.name : 'UnknownError',
    'error.message': error instanceof DOMException || error instanceof Error ? error.message : String(error),
    'JSON.stringify(localStorage).length': diagnostics.jsonStringifyLength,
    estimatedLocalStorageBytes: diagnostics.estimatedBytes,
    estimatedLocalStorageKb: diagnostics.estimatedKb
  });
}
