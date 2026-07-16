import type { LocalDatabaseState } from './localTypes';

export function hasConfirmedChildDeviceSession(
  state: Pick<
    LocalDatabaseState,
    'children' | 'currentChildIdentity' | 'deviceBinding' | 'device_child_id' | 'device_bindings'
  >,
  requestedChildId?: string | null
) {
  const sessionChildId = state.currentChildIdentity?.childId ?? null;
  return Boolean(sessionChildId) &&
    state.deviceBinding === sessionChildId &&
    state.device_child_id === sessionChildId &&
    (!requestedChildId || requestedChildId === sessionChildId) &&
    state.children.some((child) => child.id === sessionChildId && child.status === 'active') &&
    state.device_bindings.some(
      (record) =>
        record.child_id === sessionChildId &&
        record.binding_status === 'bound' &&
        record.qr_token_status === 'consumed' &&
        Boolean(record.used_at) &&
        !record.revoked_at
    );
}
