import type { LocalDatabaseState } from './localTypes';
import { getChildSession, isChildSessionValid } from './childSessionRepository';

export function hasConfirmedChildDeviceSession(
  state: Pick<
    LocalDatabaseState,
    'children' | 'currentChildIdentity' | 'deviceBinding' | 'device_child_id' | 'device_bindings'
  >,
  requestedChildId?: string | null
) {
  const childSession = getChildSession();
  const sessionChildId = childSession?.childId ?? null;
  const confirmedSession = Boolean(sessionChildId) && isChildSessionValid(childSession, requestedChildId);
  if (!confirmedSession) {
    console.warn('[child-binding] confirmed ChildSession missing or invalid', {
      requestedChildId,
      childSession,
      legacy: {
        currentChildIdentity: state.currentChildIdentity ?? null,
        deviceBinding: state.deviceBinding ?? null,
        deviceChildId: state.device_child_id ?? null,
        childCount: state.children.length,
        deviceBindingCount: state.device_bindings.length
      }
    });
  }
  return confirmedSession;
}
