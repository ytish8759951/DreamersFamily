import { useCallback, useRef, useState } from 'react';

export function useSubmitLock() {
  const locksRef = useRef(new Set<string>());
  const [locks, setLocks] = useState<ReadonlySet<string>>(() => new Set());

  const acquire = useCallback((key: string) => {
    if (locksRef.current.has(key)) return false;
    locksRef.current.add(key);
    setLocks(new Set(locksRef.current));
    return true;
  }, []);

  const release = useCallback((key: string) => {
    if (!locksRef.current.delete(key)) return;
    setLocks(new Set(locksRef.current));
  }, []);

  const isLocked = useCallback((key: string) => locksRef.current.has(key), []);

  return { acquire, release, isLocked, locks };
}
