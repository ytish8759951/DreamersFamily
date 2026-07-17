import { useSyncExternalStore } from 'react';
import { dataRepository } from './dataRepository';
import type { LocalDatabaseState } from './localTypes';

let repositorySnapshot = dataRepository.getState();

function timestamp() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const millis = String(now.getMilliseconds()).padStart(3, '0');
  return `[${hours}:${minutes}:${seconds}.${millis}]`;
}

function getRepositorySnapshot() {
  return repositorySnapshot;
}

function subscribeToRepository(listener: () => void) {
  repositorySnapshot = dataRepository.getState();
  const unsubscribe = dataRepository.subscribe((state) => {
    repositorySnapshot = state;
    console.log(`${timestamp()} snapshot changed`, {
      children: state.children.length,
      updatedAt: state.updated_at
    });
    listener();
  });
  listener();
  return unsubscribe;
}

export function useLocalDataState(): LocalDatabaseState {
  return useSyncExternalStore(
    subscribeToRepository,
    getRepositorySnapshot,
    getRepositorySnapshot
  );
}
