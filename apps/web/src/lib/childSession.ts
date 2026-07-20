import type { LocalDatabaseState, UUID } from './localTypes';
import { getChildSession, isChildSessionValid } from './childSessionRepository';

export function resolveCurrentChildId(
  state: Pick<LocalDatabaseState, 'currentChildIdentity' | 'deviceBinding' | 'device_child_id' | 'active_child_id'>,
  options: { allowLegacyFallback?: boolean } = {}
): UUID | null {
  const session = getChildSession();
  if (isChildSessionValid(session)) return session.childId;
  if (!options.allowLegacyFallback) return null;
  return state.currentChildIdentity?.childId ?? state.deviceBinding ?? state.device_child_id ?? state.active_child_id ?? null;
}
