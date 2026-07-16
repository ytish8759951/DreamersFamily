import type { LocalDeviceBinding, UUID } from './localTypes';

const ONLINE_HEARTBEAT_WINDOW_MS = 2 * 60 * 1000;

export type ChildDeviceStatusKind = 'unbound' | 'bound_not_logged_in' | 'online' | 'offline';

export interface ChildDeviceStatus {
  kind: ChildDeviceStatusKind;
  label: string;
  isBound: boolean;
  isOnline: boolean;
  binding: LocalDeviceBinding | null;
  lastLoginAt: string | null;
  lastHeartbeatAt: string | null;
}

function optionalTimestamp(record: LocalDeviceBinding, key: string) {
  const value = (record as unknown as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function latestTimestamp(values: Array<string | null>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((first, second) => second.localeCompare(first))[0] ?? null;
}

export function latestConfirmedDeviceBinding(records: LocalDeviceBinding[], childId: UUID): LocalDeviceBinding | null {
  return records
    .filter((record) =>
      record.child_id === childId &&
      record.binding_status === 'bound' &&
      record.qr_token_status === 'consumed' &&
      Boolean(record.used_at) &&
      !record.revoked_at
    )
    .sort((first, second) => second.updated_at.localeCompare(first.updated_at))[0] ?? null;
}

export function resolveChildDeviceStatus(
  records: LocalDeviceBinding[],
  childId: UUID,
  now = new Date()
): ChildDeviceStatus {
  const binding = latestConfirmedDeviceBinding(records, childId);
  if (!binding) {
    return {
      kind: 'unbound',
      label: '未綁定',
      isBound: false,
      isOnline: false,
      binding: null,
      lastLoginAt: null,
      lastHeartbeatAt: null
    };
  }

  const lastHeartbeatAt = latestTimestamp([
    optionalTimestamp(binding, 'last_heartbeat_at'),
    optionalTimestamp(binding, 'last_seen_at'),
    optionalTimestamp(binding, 'heartbeat_at')
  ]);
  const heartbeatTime = lastHeartbeatAt ? new Date(lastHeartbeatAt).getTime() : Number.NaN;
  const hasRecentHeartbeat =
    Number.isFinite(heartbeatTime) &&
    now.getTime() - heartbeatTime >= 0 &&
    now.getTime() - heartbeatTime <= ONLINE_HEARTBEAT_WINDOW_MS;

  if (hasRecentHeartbeat) {
    return {
      kind: 'online',
      label: '在線使用中',
      isBound: true,
      isOnline: true,
      binding,
      lastLoginAt: binding.last_login_at,
      lastHeartbeatAt
    };
  }

  if (!binding.last_login_at) {
    return {
      kind: 'bound_not_logged_in',
      label: '已綁定但未登入',
      isBound: true,
      isOnline: false,
      binding,
      lastLoginAt: null,
      lastHeartbeatAt: null
    };
  }

  return {
    kind: 'offline',
    label: '已離線',
    isBound: true,
    isOnline: false,
    binding,
    lastLoginAt: binding.last_login_at,
    lastHeartbeatAt
  };
}

