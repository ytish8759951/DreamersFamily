import type { LocalDatabaseState } from './localTypes';
import { getChildSession, isChildSessionValid } from './childSessionRepository';

export function hasConfirmedChildDeviceSession(
  state: Pick<
    LocalDatabaseState,
    'children' | 'currentChildIdentity' | 'deviceBinding' | 'device_child_id' | 'device_bindings'
  >
) {
  const childSession = getChildSession();
  const sessionChildId = childSession?.childId ?? null;
  const localBinding = childSession?.deviceBindingId
    ? state.device_bindings.find((binding) => binding.id === childSession.deviceBindingId)
    : null;
  const localBindingStillActive = !localBinding || (
    localBinding.binding_status === 'bound' &&
    (localBinding.device_binding_status ?? 'active') === 'active' &&
    !localBinding.revoked_at
  );
  const confirmedSession = Boolean(sessionChildId) && isChildSessionValid(childSession) && localBindingStillActive;
  if (!confirmedSession) {
    console.warn('[child-binding] confirmed ChildSession missing or invalid', {
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
