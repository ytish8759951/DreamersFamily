import { useSyncExternalStore } from 'react';
import { dataRepository } from './dataRepository';
import type { LocalDatabaseState } from './localTypes';

let repositorySnapshot = dataRepository.getState();

function getRepositorySnapshot() {
  return repositorySnapshot;
}

function subscribeToRepository(listener: () => void) {
  repositorySnapshot = dataRepository.getState();
  const unsubscribe = dataRepository.subscribe((state) => {
    repositorySnapshot = state;
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
