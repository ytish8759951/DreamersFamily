import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseDataRepository } from './supabaseData';
import {
  clearChildSession,
  getChildSession,
  isChildSessionValid,
  saveChildSession,
  type ChildSession
} from './childSessionRepository';
import { LocalDataService } from './localData';
import { MockDatabase } from './mockDatabase';
import { hasConfirmedChildDeviceSession } from './childBindingState';
import { resolveCurrentChildId } from './childSession';
import type { KeyValueStorage } from './storage';

class TestStorage implements KeyValueStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

const childId = '00000000-0000-4000-8000-000000000101';
const familyId = '00000000-0000-4000-8000-000000000201';
const deviceId = '00000000-0000-4000-8000-000000000301';

function session(overrides: Partial<ChildSession> = {}): ChildSession {
  return {
    childId,
    childName: '0716-6',
    familyId,
    deviceBindingId: 'binding-0716-6',
    deviceId,
    bindingConfirmed: true,
    bindingStatus: 'bound',
    tokenStatus: 'consumed',
    boundAt: '2026-07-16T10:00:00.000Z',
    sessionCreatedAt: '2026-07-16T10:00:01.000Z',
    sessionVersion: 1,
    birthDate: null,
    themeColor: 'blue',
    childToken: 'token-0716-6',
    ...overrides
  };
}

function installBrowserStorage() {
  const storage = new TestStorage();
  const cookies = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: storage,
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  });
  vi.stubGlobal('CustomEvent', class {
    constructor(
      public readonly type: string,
      public readonly init?: CustomEventInit
    ) {}
  });
  vi.stubGlobal('document', {
    get cookie() {
      return Array.from(cookies.entries()).map(([key, value]) => `${key}=${value}`).join('; ');
    },
    set cookie(value: string) {
      const [pair, ...attributes] = value.split(';').map((item) => item.trim());
      const separator = pair.indexOf('=');
      if (separator < 0) return;
      const key = pair.slice(0, separator);
      const cookieValue = pair.slice(separator + 1);
      if (attributes.some((attribute) => attribute.toLowerCase() === 'max-age=0')) cookies.delete(key);
      else cookies.set(key, cookieValue);
    }
  });
  return { storage, cookies };
}

describe('child session repository', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T10:05:00.000Z'));
    installBrowserStorage();
  });

  afterEach(() => {
    clearChildSession();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stores a versioned child session as the child-device source of truth', () => {
    saveChildSession(session());

    const stored = getChildSession();

    expect(stored).toMatchObject({
      childId,
      childName: '0716-6',
      familyId,
      deviceBindingId: 'binding-0716-6',
      deviceId,
      bindingConfirmed: true,
      bindingStatus: 'bound',
      tokenStatus: 'consumed',
      sessionVersion: 1
    });
    expect(isChildSessionValid(stored, childId)).toBe(true);
    expect(isChildSessionValid(stored, '00000000-0000-4000-8000-000000000999')).toBe(false);
  });

  it('does not fall back to parent active_child_id unless legacy fallback is explicitly requested', () => {
    const fallbackChildId = '00000000-0000-4000-8000-000000000999';
    const state = {
      currentChildIdentity: null,
      deviceBinding: null,
      device_child_id: null,
      active_child_id: fallbackChildId
    };

    expect(resolveCurrentChildId(state)).toBeNull();
    expect(resolveCurrentChildId(state, { allowLegacyFallback: true })).toBe(fallbackChildId);
  });

  it('bootstraps the local cache from ChildSession after refresh', () => {
    saveChildSession(session());
    const data = new LocalDataService(new MockDatabase(undefined, 'little-dreamers-family:supabase-cache:v1'));

    const state = data.getState();

    expect(state.currentChildIdentity?.childId).toBe(childId);
    expect(state.deviceBinding).toBe(childId);
    expect(state.device_child_id).toBe(childId);
    expect(state.children).toHaveLength(1);
    expect(state.children[0]).toMatchObject({
      id: childId,
      family_id: familyId,
      display_name: '0716-6',
      status: 'active'
    });
    expect(state.device_bindings[0]).toMatchObject({
      id: 'binding-0716-6',
      child_id: childId,
      family_id: familyId,
      binding_status: 'bound',
      qr_token_status: 'consumed'
    });
  });

  it('lets production child-scoped piggy summary read from ChildSession without a parent session', () => {
    saveChildSession(session());
    const repository = new SupabaseDataRepository(null);

    expect(repository.getPiggyBankSummary(childId)).toEqual({
      currentSavings: 0,
      availableToDepositToday: 0,
      depositedToday: 0
    });
  });

  it('lets the child route guard pass immediately after a confirmed first scan before legacy cache snapshot updates', () => {
    saveChildSession(session());

    expect(hasConfirmedChildDeviceSession({
      children: [],
      currentChildIdentity: null,
      deviceBinding: null,
      device_child_id: null,
      device_bindings: []
    })).toBe(true);
  });

  it('does not let an unconfirmed child session pass the route guard', () => {
    window.localStorage.setItem('little-dreamers-family:child-session:v1', JSON.stringify({
      ...session(),
      bindingConfirmed: false
    }));

    expect(hasConfirmedChildDeviceSession({
      children: [],
      currentChildIdentity: null,
      deviceBinding: null,
      device_child_id: null,
      device_bindings: []
    })).toBe(false);
  });
});
