import { describe, expect, it } from 'vitest';
import { latestConfirmedDeviceBinding, resolveChildDeviceStatus } from './childDeviceStatus';
import type { LocalDeviceBinding } from './localTypes';

const childId = '00000000-0000-4000-8000-000000000109';
const familyId = '00000000-0000-4000-8000-000000000209';
const deviceId = '00000000-0000-4000-8000-000000000309';

function binding(overrides: Partial<LocalDeviceBinding> = {}): LocalDeviceBinding {
  return {
    id: 'binding-0716-9',
    token: 'token-0716-9',
    family_id: familyId,
    child_id: childId,
    child_name: '0716-9',
    device_id: deviceId,
    expires_at: '2026-07-17T12:00:00.000Z',
    used_at: '2026-07-16T12:00:00.000Z',
    revoked_at: null,
    last_login_at: '2026-07-16T12:00:00.000Z',
    last_login_device: 'iPad Safari',
    binding_status: 'bound',
    qr_token_status: 'consumed',
    created_at: '2026-07-16T12:00:00.000Z',
    updated_at: '2026-07-16T12:00:00.000Z',
    ...overrides
  };
}

describe('child device status', () => {
  it('treats parent active child as unrelated to device online state', () => {
    const status = resolveChildDeviceStatus([binding()], childId, new Date('2026-07-16T12:01:00.000Z'));

    expect(status.isBound).toBe(true);
    expect(status.isOnline).toBe(false);
    expect(status.kind).toBe('offline');
    expect(status.label).toBe('已離線');
  });

  it('requires a confirmed binding for the bound state', () => {
    expect(latestConfirmedDeviceBinding([binding({ qr_token_status: 'active' })], childId)).toBeNull();
    expect(latestConfirmedDeviceBinding([binding({ binding_status: 'unbound' })], childId)).toBeNull();
    expect(latestConfirmedDeviceBinding([binding({ used_at: null })], childId)).toBeNull();
    expect(latestConfirmedDeviceBinding([binding({ revoked_at: '2026-07-16T12:01:00.000Z' })], childId)).toBeNull();
    expect(resolveChildDeviceStatus([], childId).kind).toBe('unbound');
  });

  it('shows bound but not logged in when there is no login timestamp', () => {
    const status = resolveChildDeviceStatus([binding({ last_login_at: null, last_login_device: null })], childId);

    expect(status.kind).toBe('bound_not_logged_in');
    expect(status.label).toBe('已綁定但未登入');
    expect(status.isOnline).toBe(false);
  });

  it('only shows online when a recent heartbeat exists', () => {
    const recentHeartbeat = {
      ...binding(),
      last_heartbeat_at: '2026-07-16T12:01:30.000Z'
    } as LocalDeviceBinding;

    const status = resolveChildDeviceStatus([recentHeartbeat], childId, new Date('2026-07-16T12:02:00.000Z'));

    expect(status.kind).toBe('online');
    expect(status.label).toBe('在線使用中');
    expect(status.isOnline).toBe(true);
  });
});

