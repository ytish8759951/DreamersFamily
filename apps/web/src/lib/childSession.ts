import type { LocalDatabaseState, UUID } from './localTypes';

export function resolveCurrentChildId(state: Pick<LocalDatabaseState, 'currentChildIdentity' | 'deviceBinding' | 'device_child_id' | 'active_child_id'>): UUID | null {
  return state.currentChildIdentity?.childId ?? state.deviceBinding ?? state.device_child_id ?? state.active_child_id ?? null;
}
