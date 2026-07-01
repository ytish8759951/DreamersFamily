import { useEffect, useState } from 'react';
import { dataRepository } from './dataRepository';
import type { LocalDatabaseState } from './localTypes';

export function useLocalDataState(): LocalDatabaseState {
  const [state, setState] = useState<LocalDatabaseState>(() => dataRepository.getState());

  useEffect(() => dataRepository.subscribe(setState), []);

  return state;
}

