import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalDataService, LocalDataError } from './localData';
import { MockDatabase } from './mockDatabase';
import type { KeyValueStorage } from './storage';
import {
  getChildHistoryTasks,
  getChildTodayTasks,
  getChildVisibleTasks,
  getParentHistoryTasks,
  getParentOpenTasks
} from './taskRules';
import { getBirthdaySpecialDays } from './specialDays';
import { hasConfirmedChildDeviceSession } from './childBindingState';

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
}

function bindingRecordForChild(child: { id: string; family_id: string; display_name: string; child_token_updated_at: string }) {
  return {
    family_id: child.family_id,
    child_id: child.id,
    child_name: child.display_name,
    expires_at: new Date(new Date(child.child_token_updated_at).getTime() + 24 * 60 * 60 * 1000).toISOString(),
    used_at: null,
    revoked_at: null
  };
}

function installCookieJar() {
  const cookies = new Map<string, string>();
  vi.stubGlobal('window', {
    dispatchEvent: vi.fn()
  });
  vi.stubGlobal('CustomEvent', class {
    constructor(
      public readonly type: string,
      public readonly init?: CustomEventInit
    ) {}
  });
  vi.stubGlobal('document', {
    get cookie() {
      return Array.from(cookies.entries())
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
    },
    set cookie(value: string) {
      const [pair, ...attributes] = value.split(';').map((item) => item.trim());
      const separator = pair.indexOf('=');
      if (separator < 0) return;
      const key = pair.slice(0, separator);
      const cookieValue = pair.slice(separator + 1);
      if (attributes.some((attribute) => attribute.toLowerCase() === 'max-age=0')) {
        cookies.delete(key);
      } else {
        cookies.set(key, cookieValue);
      }
    }
  });
  return cookies;
}
function addDaysForTest(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

describe('local MVP data flows', () => {
  let data: LocalDataService;
  let storage: TestStorage;

  beforeEach(() => {
    storage = new TestStorage();
    data = new LocalDataService(new MockDatabase(storage, 'test-db'));
    data.resetLocalData();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('exposes repository scope for future family, parent, child and device binding', () => {
    expect(data.getRepositoryScope()).toMatchObject({
      family_id: 'local-family',
      parent_id: 'local-parent',
      child_id: null,
      device_id: 'local-device'
    });

    const child = data.createChild({ display_name: '沉沉' });

    expect(data.getRepositoryScope()).toMatchObject({
      family_id: 'local-family',
      parent_id: 'local-parent',
      child_id: child.id,
      device_id: 'local-device'
    });
  });

  it('manages and switches children without deleting history', () => {
    const first = data.createChild({ display_name: '樂樂', birth_date: '2020-05-01' });
    const second = data.createChild({ display_name: '安安' });

    expect(data.getState().active_child_id).toBe(second.id);
    expect(data.getState().pendingBindingChildId).toBe(second.id);
    expect(data.updateChild(first.id, { display_name: '樂樂寶貝' }).display_name).toBe('樂樂寶貝');
    expect(data.switchChild(second.id).id).toBe(second.id);
    expect(data.getState().active_child_id).toBe(second.id);

    data.deleteChild(second.id);
    expect(data.listChildren()).toHaveLength(1);
    expect(data.listChildren(true).find((child) => child.id === second.id)?.status).toBe('archived');
    expect(data.getState().active_child_id).toBe(first.id);
  });

  it('creates a child login challenge without binding or consuming it when the QR is scanned', () => {
    const child = data.createChild({ display_name: 'Challenge Kid' });
    const challenge = data.createChildLoginChallenge(child.id);

    const preview = data.resolveChildLoginChallenge(challenge.challengeToken);
    const state = data.getState();
    const challengeRecord = state.child_login_challenges?.find((item) => item.id === challenge.challengeId);
    const activeBinding = state.device_bindings.find((item) => item.child_id === child.id && item.binding_status === 'bound');

    expect(preview).toMatchObject({
      childName: 'Challenge Kid',
      status: 'pending',
      remainingAttempts: 5
    });
    expect(challenge.loginUrl).toContain('/child/login/');
    expect(challenge.loginUrl).not.toContain(child.id);
    expect(challenge.loginUrl).not.toContain(challenge.pin);
    expect(challengeRecord?.status).toBe('pending');
    expect(challengeRecord?.used_at).toBeNull();
    expect(activeBinding).toBeUndefined();
  });

  it('does not bind or consume the challenge when the PIN is wrong', () => {
    const child = data.createChild({ display_name: 'Wrong Pin Kid' });
    const challenge = data.createChildLoginChallenge(child.id);

    expect(() => data.completeChildLoginChallenge(challenge.challengeToken, challenge.pin === '0000' ? '0001' : '0000'))
      .toThrowError(LocalDataError);

    const state = data.getState();
    const challengeRecord = state.child_login_challenges?.find((item) => item.id === challenge.challengeId);
    const activeBinding = state.device_bindings.find((item) => item.child_id === child.id && item.binding_status === 'bound');
    expect(challengeRecord?.status).toBe('pending');
    expect(challengeRecord?.used_at).toBeNull();
    expect(challengeRecord?.failed_attempts).toBe(1);
    expect(activeBinding).toBeUndefined();
  });

  it('completes a child login challenge atomically and creates an active binding', () => {
    const child = data.createChild({ display_name: 'PIN Kid' });
    const challenge = data.createChildLoginChallenge(child.id);

    const result = data.completeChildLoginChallenge(challenge.challengeToken, challenge.pin);
    const state = data.getState();
    const challengeRecord = state.child_login_challenges?.find((item) => item.id === challenge.challengeId);
    const activeBinding = state.device_bindings.find((item) =>
      item.id === result.deviceBindingId &&
      item.child_id === child.id &&
      item.binding_status === 'bound' &&
      item.device_binding_status === 'active'
    );

    expect(result).toMatchObject({
      childId: child.id,
      childName: child.display_name,
      familyId: child.family_id,
      bindingStatus: 'active',
      challengeStatus: 'used'
    });
    expect(challengeRecord?.status).toBe('used');
    expect(challengeRecord?.device_binding_id).toBe(result.deviceBindingId);
    expect(activeBinding).toBeTruthy();
    expect(state.device_child_id).toBe(child.id);
  });

  it('rebinds a child by replacing the old active binding and issuing a fresh challenge', () => {
    const child = data.createChild({ display_name: 'Rebind Kid' });
    const first = data.createChildLoginChallenge(child.id);
    const firstResult = data.completeChildLoginChallenge(first.challengeToken, first.pin);

    const second = data.createChildLoginChallenge(child.id, true);
    const state = data.getState();
    const oldBinding = state.device_bindings.find((item) => item.id === firstResult.deviceBindingId);
    const secondChallenge = state.child_login_challenges?.find((item) => item.id === second.challengeId);

    expect(oldBinding?.device_binding_status).toBe('replaced');
    expect(oldBinding?.revoked_at).toBeTruthy();
    expect(secondChallenge?.status).toBe('pending');
    expect(second.challengeToken).not.toBe(first.challengeToken);
    expect(second.pin).toHaveLength(4);
  });

  it('creates a portable child token and binds a fresh child device by token', () => {
    const child = data.createChild({ display_name: '安安', birth_date: '2021-03-04', theme_color: 'green' });

    expect(child.child_token).toMatch(/^df1_[a-f0-9]{32}_/);
    expect(data.getChildByToken(child.child_token)?.id).toBe(child.id);
    expect(data.listDeviceBindings(child.id)[0]).toMatchObject({
      child_id: child.id,
      device_id: 'local-device',
      last_login_at: null,
      last_login_device: null,
      binding_status: 'unbound',
      qr_token_status: 'active'
    });
    expect(data.getState().child_onboarding_tokens).toEqual([
      {
        childId: child.id,
        childName: '安安',
        childToken: child.child_token,
        createdAt: child.child_token_updated_at
      }
    ]);

    const childDeviceData = new LocalDataService(new MockDatabase(new TestStorage(), 'child-device-db'));
    childDeviceData.resetLocalData();
    const boundChild = childDeviceData.bindChildDeviceByToken(child.child_token, child.family_id, bindingRecordForChild(child));

    expect(boundChild.id).toBe(child.id);
    expect(boundChild.display_name).toBe('安安');
    expect(childDeviceData.getState().active_child_id).toBe(child.id);
    expect(childDeviceData.getState().device_child_id).toBe(child.id);
    expect(childDeviceData.getState().currentChildIdentity).toMatchObject({
      childId: child.id,
      displayName: '安安',
      birthDate: '2021-03-04',
      themeColor: 'green',
      childToken: child.child_token
    });
    expect(childDeviceData.getState().pendingBindingChildId).toBeNull();
    expect(childDeviceData.getState().children[0].child_token_consumed_at).toBeTruthy();
    expect(childDeviceData.getChildByToken(child.child_token)).toBeNull();
    expect(childDeviceData.listDeviceBindings(child.id)[0]).toMatchObject({
      child_id: child.id,
      device_id: 'local-device',
      binding_status: 'bound',
      qr_token_status: 'consumed'
    });
    expect(childDeviceData.listDeviceBindings(child.id)[0].last_login_at).toBeTruthy();
    expect(childDeviceData.listDeviceBindings(child.id)[0].last_login_device).toBeTruthy();
    expect(() => childDeviceData.bindChildDeviceByToken(child.child_token)).toThrowError(LocalDataError);
  });

  it('bootstraps parent home screen PWA from Safari parent data when localStorage is isolated', () => {
    const cookies = installCookieJar();
    const safariParent = new LocalDataService(new MockDatabase(new TestStorage(), 'safari-parent-db'));
    safariParent.resetLocalData();
    safariParent.updateSettings({
      family_name: 'Dreamers Family',
      parent_name: 'Mom'
    });
    const child = safariParent.createChild({
      display_name: 'Safari Kid',
      birth_date: '2020-01-02',
      theme_color: 'green'
    });
    safariParent.createTask({ child_id: child.id, title: 'Parent task', reward_stars: 3 });
    safariParent.switchChild(child.id);
    const bootstrapRaw = decodeURIComponent(cookies.get('little-dreamers-family:parent-bootstrap:v1') ?? '');
    const bootstrap = JSON.parse(bootstrapRaw);
    expect(bootstrap).toMatchObject({
      currentChildId: child.id,
      children: [expect.objectContaining({ id: child.id, display_name: 'Safari Kid' })],
      repositorySummary: [expect.objectContaining({ child_id: child.id, task_count: 1 })]
    });
    expect(bootstrapRaw.length).toBeLessThan(4000);

    const homeScreenParent = new LocalDataService(new MockDatabase(new TestStorage(), 'home-screen-parent-db'));
    const restored = homeScreenParent.getState();

    expect(restored.children).toHaveLength(1);
    expect(restored.children[0]).toMatchObject({
      id: child.id,
      display_name: 'Safari Kid',
      birth_date: '2020-01-02',
      theme_color: 'green'
    });
    expect(restored.active_child_id).toBe(child.id);
    expect(restored.family_settings).toMatchObject({
      family_name: 'Dreamers Family',
      parent_name: 'Mom'
    });
    expect(restored.parent_bootstrap_summary).toEqual([
      expect.objectContaining({
        child_id: child.id,
        task_count: 1
      })
    ]);
  });

  it('refreshes an existing parent home screen PWA from newer Safari parent bootstrap', () => {
    installCookieJar();
    const safariParent = new LocalDataService(new MockDatabase(new TestStorage(), 'safari-parent-db'));
    safariParent.resetLocalData();
    const first = safariParent.createChild({ display_name: 'First Kid' });

    const homeScreenStorage = new TestStorage();
    const homeScreenParent = new LocalDataService(new MockDatabase(homeScreenStorage, 'home-screen-parent-db'));
    expect(homeScreenParent.getState().children.map((child) => child.id)).toEqual([first.id]);

    const second = safariParent.createChild({ display_name: 'Second Kid' });
    safariParent.switchChild(second.id);
    safariParent.updateSettings({ parent_name: 'Updated Parent' });

    const relaunchedHomeScreenParent = new LocalDataService(new MockDatabase(homeScreenStorage, 'home-screen-parent-db'));
    const restored = relaunchedHomeScreenParent.getState();

    expect(restored.children.map((child) => child.id)).toEqual([first.id, second.id]);
    expect(restored.active_child_id).toBe(second.id);
    expect(restored.family_settings.parent_name).toBe('Updated Parent');
  });
  it('opens a valid child token on empty localStorage and reaches the child home identity', () => {
    const child = data.createChild({ display_name: '空白裝置孩子', birth_date: '2022-01-02' });
    const emptyDeviceData = new LocalDataService(new MockDatabase(new TestStorage(), 'empty-child-device-db'));
    emptyDeviceData.resetLocalData();

    expect(emptyDeviceData.getState().children).toHaveLength(0);

    const boundChild = emptyDeviceData.bindChildDeviceByToken(child.child_token, child.family_id, bindingRecordForChild(child));

    expect(boundChild).toMatchObject({
      id: child.id,
      display_name: '空白裝置孩子',
      child_token: child.child_token
    });
    expect(emptyDeviceData.getState().active_child_id).toBe(child.id);
    expect(emptyDeviceData.getState().device_child_id).toBe(child.id);
    expect(emptyDeviceData.getState().currentChildIdentity).toMatchObject({
      childId: child.id,
      displayName: '空白裝置孩子',
      childToken: child.child_token
    });
    expect(emptyDeviceData.getChildByToken(child.child_token)).toBeNull();
  });

  it('opens a child token whose encoded payload contains underscores', () => {
    const token = [
      'df1',
      'bd1d62560dc94401fe6f4a1b0251f729',
      'eyJjaGlsZElkIjoiZmFlN2RkNGQtODg4ZS00ZTQ3LTg0ZDctZTg4MTIwMjkwMTFhIiwiZGlzcGxheU5hbWUiOiIxMTEiLCJiaXJ0aERhdGUiOiIyMDI1LTA2LTA2IiwidGhlbWVDb2xvciI6ImJsdWUiLCJjcmVhdGVkQXQiOiIyMDI2LTA3LTAxVDE1OjMyOjAzLjk4NVoiLCJ4Ijoi4KC_In0'
    ].join('_');
    const childDeviceData = new LocalDataService(new MockDatabase(new TestStorage(), 'underscore-token-child-db'));
    childDeviceData.resetLocalData();

    const boundChild = childDeviceData.bindChildDeviceByToken(token, 'local-family', {
      family_id: 'local-family',
      child_id: 'fae7dd4d-888e-4e47-84d7-e8812029011a',
      child_name: '111',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      used_at: null,
      revoked_at: null
    });

    expect(boundChild).toMatchObject({
      id: 'fae7dd4d-888e-4e47-84d7-e8812029011a',
      display_name: '111',
      child_token: token
    });
    expect(childDeviceData.getState().active_child_id).toBe(boundChild.id);
    expect(childDeviceData.getState().device_child_id).toBe(boundChild.id);
    expect(childDeviceData.getState().currentChildIdentity).toMatchObject({
      childId: 'fae7dd4d-888e-4e47-84d7-e8812029011a',
      displayName: '111',
      birthDate: '2025-06-06',
      themeColor: 'blue',
      childToken: token
    });
  });

  it('rejects a child token after it has been consumed once', () => {
    const child = data.createChild({ display_name: '已綁定孩子' });
    const childDeviceData = new LocalDataService(new MockDatabase(new TestStorage(), 'bound-child-device-db'));
    childDeviceData.resetLocalData();

    childDeviceData.bindChildDeviceByToken(child.child_token, child.family_id, bindingRecordForChild(child));
    expect(() => childDeviceData.bindChildDeviceByToken(child.child_token)).toThrowError(LocalDataError);
    expect(childDeviceData.getChildByToken(child.child_token)).toBeNull();
  });

  it('accepts a consumed binding returned by a successful RPC only on the first scan', () => {
    const child = data.createChild({ display_name: 'RPC Bound Kid' });
    const childDeviceData = new LocalDataService(new MockDatabase(new TestStorage(), 'rpc-consumed-child-device-db'));
    childDeviceData.resetLocalData();
    const boundAt = new Date().toISOString();
    const rpcConfirmedBinding = {
      ...bindingRecordForChild(child),
      used_at: boundAt
    };

    const boundChild = childDeviceData.bindChildDeviceByToken(child.child_token, child.family_id, rpcConfirmedBinding);
    const localBinding = childDeviceData.getState().device_bindings.find((binding) => binding.token === child.child_token);

    expect(boundChild.id).toBe(child.id);
    expect(childDeviceData.getState().currentChildIdentity?.childId).toBe(child.id);
    expect(childDeviceData.getState().device_child_id).toBe(child.id);
    expect(localBinding).toMatchObject({
      child_id: child.id,
      binding_status: 'bound',
      qr_token_status: 'consumed',
      used_at: boundAt
    });
    expect(() =>
      childDeviceData.bindChildDeviceByToken(child.child_token, child.family_id, rpcConfirmedBinding)
    ).toThrowError(LocalDataError);
  });

  it('keeps a newly created child pending when the first binding fails, then retries the same child', () => {
    const child = data.createChild({ display_name: 'Retry Kid' });
    expect(data.getState().active_child_id).toBe(child.id);
    expect(data.getState().pendingBindingChildId).toBe(child.id);

    const childDeviceData = new LocalDataService(new MockDatabase(new TestStorage(), 'retry-child-device-db'));
    childDeviceData.resetLocalData();
    const expiredBinding = {
      ...bindingRecordForChild(child),
      expires_at: new Date(Date.now() - 1000).toISOString()
    };

    expect(() => childDeviceData.bindChildDeviceByToken(child.child_token, child.family_id, expiredBinding)).toThrowError(LocalDataError);
    expect(childDeviceData.getState()).toMatchObject({
      currentChildIdentity: null,
      deviceBinding: null,
      device_child_id: null,
      active_child_id: null
    });
    expect(data.getState().pendingBindingChildId).toBe(child.id);

    const retried = data.regenerateChildToken(child.id);
    expect(data.getState().pendingBindingChildId).toBe(child.id);
    const bound = childDeviceData.bindChildDeviceByToken(retried.child_token, retried.family_id, bindingRecordForChild(retried));

    expect(bound.id).toBe(child.id);
    expect(childDeviceData.getState().currentChildIdentity?.childId).toBe(child.id);
    expect(childDeviceData.getState().deviceBinding).toBe(child.id);
    expect(childDeviceData.getState().device_child_id).toBe(child.id);
    expect(childDeviceData.getState().pendingBindingChildId).toBeNull();
  });

  it('does not let stale currentChildIdentity change a failed binding target', () => {
    const oldChild = data.createChild({ display_name: 'Old Kid' });
    const newChild = data.createChild({ display_name: 'New Kid' });
    const childDeviceData = new LocalDataService(new MockDatabase(new TestStorage(), 'stale-current-identity-db'));
    childDeviceData.resetLocalData();
    childDeviceData.bindChildDeviceByToken(oldChild.child_token, oldChild.family_id, bindingRecordForChild(oldChild));

    const before = childDeviceData.getState();
    expect(before.currentChildIdentity?.childId).toBe(oldChild.id);
    const expiredBinding = {
      ...bindingRecordForChild(newChild),
      expires_at: new Date(Date.now() - 1000).toISOString()
    };

    expect(() => childDeviceData.bindChildDeviceByToken(newChild.child_token, newChild.family_id, expiredBinding)).toThrowError(LocalDataError);

    const after = childDeviceData.getState();
    expect(after.currentChildIdentity?.childId).toBe(oldChild.id);
    expect(after.deviceBinding).toBe(oldChild.id);
    expect(after.device_child_id).toBe(oldChild.id);
    expect(after.children.some((child) => child.id === newChild.id)).toBe(false);
  });

  it('requires a full confirmed child device session before child home can render', () => {
    const child = data.createChild({ display_name: 'Guard Kid' });
    const state = data.getState();

    expect(hasConfirmedChildDeviceSession({
      ...state,
      currentChildIdentity: {
        childId: child.id,
        displayName: child.display_name,
        birthDate: child.birth_date,
        themeColor: child.theme_color,
        childToken: child.child_token,
        boundAt: new Date().toISOString()
      },
      deviceBinding: null,
      device_child_id: null
    })).toBe(false);

    expect(hasConfirmedChildDeviceSession({
      ...state,
      currentChildIdentity: null,
      deviceBinding: child.id,
      device_child_id: null
    })).toBe(false);

    expect(hasConfirmedChildDeviceSession({
      ...state,
      currentChildIdentity: null,
      deviceBinding: null,
      device_child_id: child.id
    })).toBe(false);
  });

  it('rejects a token that belongs to a different child than the binding record', () => {
    const first = data.createChild({ display_name: 'First Token Kid' });
    const second = data.createChild({ display_name: 'Second Token Kid' });
    const childDeviceData = new LocalDataService(new MockDatabase(new TestStorage(), 'wrong-child-token-db'));
    childDeviceData.resetLocalData();

    expect(() =>
      childDeviceData.bindChildDeviceByToken(first.child_token, first.family_id, bindingRecordForChild(second))
    ).toThrowError(LocalDataError);
    expect(childDeviceData.getState().currentChildIdentity).toBeNull();
  });

  it('rejects a token whose binding belongs to another family', () => {
    const child = data.createChild({ display_name: 'Family Kid' });
    const childDeviceData = new LocalDataService(new MockDatabase(new TestStorage(), 'wrong-family-token-db'));
    childDeviceData.resetLocalData();

    expect(() =>
      childDeviceData.bindChildDeviceByToken(child.child_token, 'other-family', bindingRecordForChild(child))
    ).toThrowError(LocalDataError);
    expect(childDeviceData.getState().currentChildIdentity).toBeNull();
  });

  it('rejects expired and invalid child binding tokens without changing session state', () => {
    const child = data.createChild({ display_name: 'Invalid Token Kid' });
    const childDeviceData = new LocalDataService(new MockDatabase(new TestStorage(), 'invalid-token-db'));
    childDeviceData.resetLocalData();

    expect(() =>
      childDeviceData.bindChildDeviceByToken(child.child_token, child.family_id, {
        ...bindingRecordForChild(child),
        expires_at: new Date(Date.now() - 1000).toISOString()
      })
    ).toThrowError(LocalDataError);
    expect(() => childDeviceData.bindChildDeviceByToken('not-a-child-token')).toThrowError(LocalDataError);
    expect(childDeviceData.getState().currentChildIdentity).toBeNull();
    expect(childDeviceData.getState().deviceBinding).toBeNull();
    expect(childDeviceData.getState().device_child_id).toBeNull();
  });

  it('handles duplicate binding attempts by accepting only the first confirmed session', () => {
    const child = data.createChild({ display_name: 'Double Click Kid' });
    const childDeviceData = new LocalDataService(new MockDatabase(new TestStorage(), 'double-click-token-db'));
    childDeviceData.resetLocalData();

    expect(childDeviceData.bindChildDeviceByToken(child.child_token, child.family_id, bindingRecordForChild(child)).id).toBe(child.id);
    expect(() => childDeviceData.bindChildDeviceByToken(child.child_token, child.family_id, bindingRecordForChild(child))).toThrowError(LocalDataError);
    expect(childDeviceData.getState().currentChildIdentity?.childId).toBe(child.id);
  });

  it('does not treat failed binding state as a valid child home session after refresh', () => {
    const child = data.createChild({ display_name: 'Refresh Failure Kid' });
    const failedStorage = new TestStorage();
    const childDeviceData = new LocalDataService(new MockDatabase(failedStorage, 'refresh-failed-binding-db'));
    childDeviceData.resetLocalData();

    expect(() =>
      childDeviceData.bindChildDeviceByToken(child.child_token, child.family_id, {
        ...bindingRecordForChild(child),
        revoked_at: new Date().toISOString()
      })
    ).toThrowError(LocalDataError);

    const refreshedDeviceData = new LocalDataService(new MockDatabase(failedStorage, 'refresh-failed-binding-db'));
    expect(hasConfirmedChildDeviceSession(refreshedDeviceData.getState(), child.id)).toBe(false);
  });

  it('requires a regenerated child token after the original token has been consumed', () => {
    const child = data.createChild({ display_name: '換網址孩子' });
    const oldToken = child.child_token;
    const regenerated = data.regenerateChildToken(child.id);

    expect(regenerated.child_token).not.toBe(oldToken);
    expect(() => data.bindChildDeviceByToken(oldToken)).toThrowError(LocalDataError);
    expect(data.getChildByToken(oldToken)).toBeNull();
    expect(data.bindChildDeviceByToken(regenerated.child_token).id).toBe(child.id);
  });

  it('runs task completion, approval, stars and screen-time rewards once', () => {
    const child = data.createChild({ display_name: '樂樂' });
    const task = data.createTask({
      child_id: child.id,
      title: '整理玩具',
      reward_stars: 5,
      reward_screen_minutes: 10
    });

    expect(data.completeTask(task.id, '完成了').status).toBe('submitted');
    expect(data.approveTask(task.id).status).toBe('approved');
    expect(data.getStarBalance(child.id)).toBe(5);
    expect(data.getScreenTimeBalance(child.id)).toBe(0);
    expect(data.listTasks(child.id)[0].completion_note).toBe('完成了');

    data.approveTask(task.id);
    expect(data.getStarBalance(child.id)).toBe(5);
    expect(data.getScreenTimeBalance(child.id)).toBe(0);
  });

  it('allows image-only tasks and stores task media ids', () => {
    const child = data.createChild({ display_name: '樂樂' });
    const task = data.createTask({
      child_id: child.id,
      title: '',
      task_image_media_id: 'task-image-media-id',
      thumbnail_media_id: 'task-thumbnail-media-id',
      reward_stars: 3
    });

    expect(task.title).toBe('');
    expect(task.task_image_media_id).toBe('task-image-media-id');
    expect(task.thumbnail_media_id).toBe('task-thumbnail-media-id');
  });

  it('keeps tasks independent when the same task is assigned to every child', () => {
    const first = data.createChild({ display_name: '沉沉' });
    const second = data.createChild({ display_name: '安安' });
    const children = data.listChildren();

    const tasks = children.map((child) =>
      data.createTask({
        child_id: child.id,
        title: '刷牙',
        reward_stars: 1
      })
    );

    expect(data.listTasks()).toHaveLength(2);
    expect(data.listTasks(first.id)).toMatchObject([{ id: tasks[0].id, child_id: first.id, title: '刷牙' }]);
    expect(data.listTasks(second.id)).toMatchObject([{ id: tasks[1].id, child_id: second.id, title: '刷牙' }]);

    data.completeTask(tasks[0].id, '完成');
    data.approveTask(tasks[0].id);

    expect(data.listTasks(first.id)[0].status).toBe('approved');
    expect(data.listTasks(second.id)[0].status).toBe('pending');
    expect(data.getStarBalance(first.id)).toBe(1);
    expect(data.getStarBalance(second.id)).toBe(0);
  });

  it('shows only today daily task occurrences to children and keeps old unfinished tasks in history', () => {
    const child = data.createChild({ display_name: '沉沉' });
    const yesterday = '2026-06-24';
    const today = '2026-06-25';
    const oldTask = data.createTask({
      child_id: child.id,
      title: '刷牙',
      category: 'daily',
      task_date: yesterday,
      reward_stars: 1
    });
    const todayTask = data.createTask({
      child_id: child.id,
      title: '刷牙',
      category: 'daily',
      task_date: today,
      reward_stars: 1
    });

    expect(getChildVisibleTasks(data.listTasks(child.id), 'daily', yesterday).map((task) => task.id)).toEqual([
      oldTask.id
    ]);
    expect(getChildVisibleTasks(data.listTasks(child.id), 'daily', today).map((task) => task.id)).toEqual([
      todayTask.id
    ]);
    expect(getChildHistoryTasks(data.listTasks(child.id), today).map((task) => task.id)).toContain(oldTask.id);
  });

  it('keeps yesterday submitted daily tasks reviewable for parents but hidden from child today list', () => {
    const child = data.createChild({ display_name: '沉沉' });
    const yesterdayTask = data.createTask({
      child_id: child.id,
      title: '閱讀',
      category: 'daily',
      task_date: '2026-06-24',
      reward_stars: 2
    });
    const todayTask = data.createTask({
      child_id: child.id,
      title: '閱讀',
      category: 'daily',
      task_date: '2026-06-25',
      reward_stars: 2
    });

    data.completeTask(yesterdayTask.id, '昨天完成');

    expect(getChildVisibleTasks(data.listTasks(child.id), 'daily', '2026-06-25').map((task) => task.id)).toEqual([
      todayTask.id
    ]);
    expect(getParentOpenTasks(data.listTasks(child.id), '2026-06-25').map((task) => task.id)).toEqual(
      expect.arrayContaining([yesterdayTask.id, todayTask.id])
    );
    expect(getParentHistoryTasks(data.listTasks(child.id), '2026-06-25').map((task) => task.id)).not.toContain(
      yesterdayTask.id
    );
  });

  it('keeps only challenge tasks in the parent history list', () => {
    const child = data.createChild({ display_name: '沉沉' });
    const daily = data.createTask({ child_id: child.id, title: '刷牙', category: 'daily', task_date: '2026-06-25', reward_stars: 1 });
    const habit = data.createTask({ child_id: child.id, title: '背單字', category: 'habit', task_date: '2026-06-25', reward_stars: 1 });
    const household = data.createTask({ child_id: child.id, title: '收玩具', category: 'household', task_date: '2026-06-25', reward_stars: 1 });
    const challenge = data.createTask({ child_id: child.id, title: '整理書包', category: 'challenge', task_date: '2026-06-25', reward_stars: 1 });

    data.completeTask(daily.id, '完成');
    data.completeTask(habit.id, '完成');
    data.completeTask(household.id, '完成');
    data.completeTask(challenge.id, '完成挑戰');
    data.approveTask(daily.id);
    data.approveTask(habit.id);
    data.approveTask(household.id);
    data.approveTask(challenge.id);

    expect(getParentHistoryTasks(data.listTasks(child.id), '2026-06-25').map((task) => task.id)).toEqual([
      challenge.id
    ]);
  });

  it('combines all child task categories into one today list with unfinished tasks first', () => {
    const child = data.createChild({ display_name: '沉沉' });
    const daily = data.createTask({ child_id: child.id, title: '刷牙', category: 'daily', task_date: '2026-06-25', reward_stars: 1 });
    const household = data.createTask({ child_id: child.id, title: '收玩具', category: 'household', task_date: '2026-06-25', reward_stars: 1 });
    const habit = data.createTask({ child_id: child.id, title: '背單字', category: 'habit', task_date: '2026-06-25', reward_stars: 1 });
    const challenge = data.createTask({ child_id: child.id, title: '整理書包', category: 'challenge', task_date: '2026-06-25', reward_stars: 1 });

    data.completeTask(household.id, '完成');

    expect(getChildTodayTasks(data.listTasks(child.id), '2026-06-25').map((task) => task.id)).toEqual([
      daily.id,
      habit.id,
      challenge.id,
      household.id
    ]);
  });

  it('creates independent daily occurrences for every child across days', () => {
    const first = data.createChild({ display_name: '沉沉' });
    const second = data.createChild({ display_name: '安安' });
    const children = data.listChildren();

    children.forEach((child) => {
      data.createTask({
        child_id: child.id,
        title: '刷牙',
        category: 'daily',
        task_date: '2026-06-24',
        reward_stars: 1
      });
      data.createTask({
        child_id: child.id,
        title: '刷牙',
        category: 'daily',
        task_date: '2026-06-25',
        reward_stars: 1
      });
    });

    expect(getChildVisibleTasks(data.listTasks(first.id), 'daily', '2026-06-25')).toHaveLength(1);
    expect(getChildVisibleTasks(data.listTasks(second.id), 'daily', '2026-06-25')).toHaveLength(1);
    expect(getChildHistoryTasks(data.listTasks(first.id), '2026-06-25')).toHaveLength(1);
    expect(getChildHistoryTasks(data.listTasks(second.id), '2026-06-25')).toHaveLength(1);
  });

  it('auto-creates today daily instances without removing yesterday pending review tasks', () => {
    const child = data.createChild({ display_name: '沉沉' });
    const currentDate = new Date().toISOString().slice(0, 10);
    const yesterdayDate = addDaysForTest(currentDate, -1);
    const yesterdayTask = data.createTask({
      child_id: child.id,
      title: '刷牙',
      category: 'daily',
      task_date: yesterdayDate,
      reward_stars: 1
    });

    data.completeTask(yesterdayTask.id, '昨天完成');
    const state = data.getState();
    const childTasks = state.tasks.filter((task) => task.child_id === child.id && task.category === 'daily');
    const todayTask = childTasks.find((task) => task.task_date === currentDate && task.title === '刷牙');

    expect(todayTask).toMatchObject({ status: 'pending', task_date: currentDate, title: '刷牙' });
    expect(childTasks.find((task) => task.id === yesterdayTask.id)).toMatchObject({
      status: 'submitted',
      task_date: yesterdayDate
    });
    expect(getParentOpenTasks(childTasks, currentDate).map((task) => task.id)).toEqual(
      expect.arrayContaining([yesterdayTask.id, todayTask!.id])
    );
  });

  it('updates dream progress and moves funded dreams to completed', () => {
    const child = data.createChild({ display_name: '樂樂' });
    const dream = data.createDream({
      child_id: child.id,
      title: '彩虹腳踏車',
      target_amount: 1000
    });

    data.addDreamDeposit(dream.id, 400, '第一次存款');
    expect(data.listDreams(child.id)[0]).toMatchObject({
      current_amount: 400,
      progress_percent: 40,
      status: 'active'
    });

    data.addDreamDeposit(dream.id, 600, '達標');
    expect(data.listDreams(child.id)[0].status).toBe('funded');
    expect(data.completeDream(dream.id).status).toBe('completed');
    expect(data.listDreams(child.id).filter((item) => item.status === 'completed')).toHaveLength(1);
  });

  it('stores dream cover media ids without persisting image data URLs', () => {
    const child = data.createChild({ display_name: '樂樂' });
    const dream = data.createDream({
      child_id: child.id,
      title: '彩虹腳踏車',
      target_amount: 1000,
      cover_path: 'data:image/png;base64,SHOULD_NOT_BE_STORED',
      cover_media_id: 'dream-cover-1',
      cover_mime_type: 'image/webp',
      cover_file_name: 'dream-cover.webp'
    });

    expect(dream.cover_path).toBeNull();
    expect(dream.coverUrl).toBeNull();
    expect(dream.imageUrl).toBeNull();
    expect(dream.cover_media_id).toBe('dream-cover-1');
    expect(data.exportData()).not.toContain('data:image');
    expect(data.exportData()).not.toContain('SHOULD_NOT_BE_STORED');
  });

  it('deletes dreams with their local fund records', () => {
    const child = data.createChild({ display_name: '樂樂' });
    const dream = data.createDream({
      child_id: child.id,
      title: '可刪除夢想',
      target_amount: 1000,
      cover_media_id: 'dream-cover-delete'
    });
    data.addDreamDeposit(dream.id, 100, '測試存款');

    expect(data.deleteDream(dream.id).cover_media_id).toBe('dream-cover-delete');
    expect(data.listDreams(child.id)).toHaveLength(0);
    expect(data.getState().dream_funds.some((fund) => fund.dream_id === dream.id)).toBe(false);
  });

  it('stores photo, audio and video shares with history visible to parents', () => {
    const child = data.createChild({ display_name: '樂樂' });
    const photo = data.createShare({
      child_id: child.id,
      caption: '我的作品',
      media: [{ media_type: 'photo', mime_type: 'image/jpeg', file_name: 'work.jpg' }]
    });
    const audio = data.createShare({
      child_id: child.id,
      caption: '今天的故事',
      media: [{ media_type: 'audio', mime_type: 'audio/mpeg', file_name: 'story.mp3' }]
    });
    const video = data.createShare({
      child_id: child.id,
      caption: '跳舞影片',
      media: [{ media_type: 'video', mime_type: 'video/mp4', file_name: 'dance.mp4' }]
    });

    expect(data.listShares(child.id)).toHaveLength(3);
    expect(photo.media[0].storage_path).toContain('/local-family/');
    expect(photo.status).toBe('approved');
    expect(audio.share_type).toBe('audio');
    expect(video.share_type).toBe('video');
    expect(data.deleteShare(photo.id).deleted_at).not.toBeNull();
    expect(data.listShares(child.id).map((share) => share.id)).not.toContain(photo.id);
  });

  it('does not persist share media data URLs in local data', () => {
    const child = data.createChild({ display_name: 'Media Kid' });
    const share = data.createShare({
      child_id: child.id,
      title: 'Photo without base64 persistence',
      media: [
        {
          media_type: 'photo',
          mime_type: 'image/webp',
          file_name: 'photo.webp',
          file_size_bytes: 1234,
          data_url: 'data:image/webp;base64,SHOULD_NOT_BE_STORED'
        }
      ]
    });

    expect(share.media[0].local_data_url).toBeNull();
    expect(share.mediaUrl).toBeNull();
    expect(data.exportData()).not.toContain('data:image');
    expect(data.exportData()).not.toContain('SHOULD_NOT_BE_STORED');
  });

  it('delivers mailbox messages and persists read state', () => {
    const child = data.createChild({ display_name: '樂樂' });
    const message = data.createMailboxMessage({
      child_id: child.id,
      title: '你今天很棒',
      message: '謝謝你主動整理玩具。'
    });
    data.createMailboxMessage({
      child_id: child.id,
      title: '鼓勵卡',
      message: '我為你驕傲。',
      card_type: 'card'
    });
    data.createMailboxMessage({
      child_id: child.id,
      title: '語音留言',
      card_type: 'audio',
      media: {
        mime_type: 'audio/mpeg',
        file_name: 'voice.mp3',
        data_url: 'data:audio/mpeg;base64,AAAA'
      }
    });
    data.createMailboxMessage({
      child_id: child.id,
      title: '圖片留言',
      message: '這張照片送給你。',
      card_type: 'image',
      media: {
        mime_type: 'image/jpeg',
        file_name: 'card.jpg',
        data_url: 'data:image/jpeg;base64,AAAA'
      }
    });

    expect(data.listMailboxMessages(child.id)).toHaveLength(4);
    expect(data.listMailboxMessages(child.id).map((item) => item.card_type)).toEqual(
      expect.arrayContaining(['text', 'card', 'audio', 'image'])
    );
    expect(data.markMessageRead(message.id)).toMatchObject({
      status: 'opened'
    });
    expect(data.listMailboxMessages(child.id).find((item) => item.id === message.id)?.opened_at).not.toBeNull();
  });

  it('creates, awards and deletes badges while preserving child history', () => {
    const child = data.createChild({ display_name: '樂樂' });
    const badge = data.createBadge({
      name: '閱讀小達人',
      icon: '📚',
      description: '完成閱讀挑戰',
      reward_stars: 8
    });

    const awarded = data.awardBadge({
      child_id: child.id,
      badge_id: badge.id,
      note: '連續閱讀 7 天'
    });

    expect(data.getBadges()).toHaveLength(1);
    expect(data.getChildBadges(child.id)).toMatchObject([
      {
        id: awarded.id,
        child_id: child.id,
        badge_id: badge.id,
        note: '連續閱讀 7 天'
      }
    ]);
    expect(data.getStarBalance(child.id)).toBe(8);

    data.awardBadge({ child_id: child.id, badge_id: badge.id });
    expect(data.getChildBadges(child.id)).toHaveLength(1);
    expect(data.getStarBalance(child.id)).toBe(8);

    expect(data.deleteBadge(badge.id).deleted_at).not.toBeNull();
    expect(data.getBadges()).toHaveLength(0);
    expect(data.getBadges(true)).toHaveLength(1);
    expect(data.getChildBadges(child.id)).toHaveLength(1);
  });

  it('normalizes badge icons on create and when reading existing local storage data', () => {
    const defaulted = data.createBadge({
      name: '小幫手',
      icon: '',
      description: '',
      reward_stars: 5
    });
    const tooLong = data.createBadge({
      name: '錯誤圖示',
      icon: '小幫手',
      reward_stars: 1
    });

    expect(defaulted.icon).toBe('🏅');
    expect(tooLong.icon).toBe('🏅');

    const stateWithBadIcon = data.getState();
    stateWithBadIcon.badges[0].icon = '小幫手';
    storage.setItem('test-db', JSON.stringify(stateWithBadIcon));

    expect(data.getBadges(true).find((badge) => badge.id === defaulted.id)?.icon).toBe('🏅');
    expect(JSON.parse(storage.getItem('test-db') ?? '{}').badges[0].icon).toBe('🏅');
  });

  it('manages special days with child filters and upcoming sorting', () => {
    const child = data.createChild({ display_name: '樂樂' });
    const birthday = data.createSpecialDay({
      child_id: child.id,
      title: '樂樂生日',
      date: '2099-05-01',
      type: 'birthday',
      description: '準備生日卡',
      source: 'manual',
      createdBy: 'parent'
    });
    const activity = data.createSpecialDay({
      child_id: null,
      title: '家庭露營',
      date: '2099-04-20',
      type: 'family_event',
      description: '全家一起出門',
      source: 'manual',
      createdBy: 'parent'
    });

    expect(data.getSpecialDays(child.id)).toHaveLength(2);
    expect(data.getUpcomingSpecialDays(child.id).map((day) => day.id)).toEqual([
      activity.id,
      birthday.id
    ]);

    expect(data.updateSpecialDay(birthday.id, {
      title: '六歲生日',
      date: '2099-05-02',
      type: 'birthday'
    })).toMatchObject({
      title: '六歲生日',
      date: '2099-05-02'
    });
    expect(data.getSpecialDays(child.id).find((day) => day.child_id === child.id)).toMatchObject({
      childId: child.id,
      source: 'manual',
      createdBy: 'parent'
    });

    expect(data.deleteSpecialDay(activity.id).deleted_at).not.toBeNull();
    expect(data.getSpecialDays(child.id)).toHaveLength(1);
    expect(data.getSpecialDays(child.id, true)).toHaveLength(2);
  });

  it('derives birthday special days from active child birth dates', () => {
    const child = data.createChild({ display_name: '沉沉', birth_date: '2020-06-25' });

    expect(getBirthdaySpecialDays(data.listChildren(), '2026-06-25')).toEqual([
      {
        childId: child.id,
        title: '沉沉生日',
        type: 'birthday',
        date: '2026-06-25',
        recurring: 'yearly',
        source: 'child_birthday',
        daysLeft: 0
      }
    ]);

    expect(getBirthdaySpecialDays(data.listChildren(), '2026-06-26')[0]).toMatchObject({
      childId: child.id,
      date: '2027-06-25',
      daysLeft: 364
    });

    data.updateChild(child.id, { birth_date: '2020-07-01' });
    expect(getBirthdaySpecialDays(data.listChildren(), '2026-06-25')[0]).toMatchObject({
      title: '沉沉生日',
      date: '2026-07-01',
      daysLeft: 6
    });

    data.deleteChild(child.id);
    expect(getBirthdaySpecialDays(data.listChildren(), '2026-06-25')).toEqual([]);
  });

  it('updates settings and supports export, import and reset', () => {
    const child = data.createChild({ display_name: '樂樂' });
    data.updateSettings({
      family_name: '星星家庭',
      default_daily_screen_minutes: 60,
      allow_photo_sharing: false
    });

    expect(data.getSettings()).toMatchObject({
      family_name: '星星家庭',
      default_daily_screen_minutes: 60,
      allow_photo_sharing: false
    });

    const exported = data.exportData();
    data.resetAllData();
    expect(data.listChildren()).toHaveLength(0);
    expect(data.getSettings().family_name).toBe('小小夢想家 Family');

    data.importData(exported);
    expect(data.listChildren()[0].id).toBe(child.id);
    expect(data.getSettings()).toMatchObject({
      family_name: '星星家庭',
      default_daily_screen_minutes: 60,
      allow_photo_sharing: false
    });
  });

  it('resets demo data while keeping family settings', () => {
    const child = data.createChild({ display_name: '樂樂' });
    data.createTask({
      child_id: child.id,
      title: '整理書包',
      reward_stars: 3
    });
    data.updateSettings({
      family_name: '星星家庭',
      default_theme_color: 'green',
      allow_photo_sharing: false
    });

    const createdAt = data.getSettings().family_created_at;
    data.resetDemoData();

    expect(data.listChildren()).toHaveLength(0);
    expect(data.getState().tasks).toHaveLength(0);
    expect(data.getState().child_onboarding_tokens).toHaveLength(0);
    expect(data.getState().currentChildIdentity).toBeNull();
    expect(data.getSettings()).toMatchObject({
      family_name: '星星家庭',
      default_theme_color: 'green',
      allow_photo_sharing: false,
      family_created_at: createdAt
    });
  });

  it('previews test data cleanup without mutating records', () => {
    const child = data.createChild({ display_name: 'Preview Kid' });
    data.createTask({ child_id: child.id, title: 'Preview task', reward_stars: 2 });

    const before = data.exportData();
    const preview = data.previewTestDataCleanup();

    expect(preview.familyId).toBe(child.family_id);
    expect(preview.counts.children).toBe(1);
    expect(preview.counts.tasks).toBe(1);
    expect(data.exportData()).toBe(before);
  });

  it('executes scoped test data cleanup and clears stale child routing state', () => {
    const child = data.createChild({ display_name: 'Cleanup Kid' });
    data.createTask({ child_id: child.id, title: 'Cleanup task', reward_stars: 2 });
    data.bindChildDeviceByToken(child.child_token, child.family_id, bindingRecordForChild(child));

    expect(data.getState().currentChildIdentity?.childId).toBe(child.id);
    expect(data.getState().device_child_id).toBe(child.id);

    const result = data.executeTestDataCleanup({ removeFamily: false });

    expect(result.removedFamily).toBe(false);
    expect(result.deletedCounts.children).toBe(1);
    expect(result.deletedCounts.tasks).toBe(1);
    expect(data.listChildren()).toHaveLength(0);
    expect(data.getState().tasks).toHaveLength(0);
    expect(data.getState().currentChildIdentity).toBeNull();
    expect(data.getState().deviceBinding).toBeNull();
    expect(data.getState().device_child_id).toBeNull();
  });

  it('keeps screen-time balance and immutable change history', () => {
    const child = data.createChild({ display_name: '樂樂' });
    data.updateScreenTime({ child_id: child.id, minutes_delta: 30, reason: '家長增加' });
    data.updateScreenTime({ child_id: child.id, minutes_delta: -10, reason: '使用平板' });

    expect(data.getScreenTimeBalance(child.id)).toBe(20);
    expect(data.listScreenTimeLogs(child.id)).toHaveLength(2);
    expect(() =>
      data.updateScreenTime({ child_id: child.id, minutes_delta: -30 })
    ).toThrowError(LocalDataError);
    expect(data.getScreenTimeBalance(child.id)).toBe(20);
  });

  it('treats screen time as a ledger without weekend defaults or weekly planned minutes', () => {
    const child = data.createChild({ display_name: 'Screen Time Kid' });
    const weekStart = '2026-06-22';
    const saturday = '2026-06-27';

    expect(data.getScreenTimeBalance(child.id)).toBe(0);
    expect(data.getWeeklyScreenTime(child.id, weekStart)).toHaveLength(7);
    expect(data.getWeeklyScreenTime(child.id, weekStart).every((day) => day.plannedMinutes === 0)).toBe(true);
    expect(data.getState().screen_time_schedules).toHaveLength(0);

    data.updatePlannedScreenTime(child.id, saturday, 120);
    expect(data.getWeeklyScreenTime(child.id, weekStart)[5].plannedMinutes).toBe(0);
    expect(data.getScreenTimeBalance(child.id)).toBe(0);

    const task = data.createTask({
      child_id: child.id,
      title: 'Earn stars',
      reward_stars: 22,
      reward_screen_minutes: 180
    });
    data.completeTask(task.id);
    data.approveTask(task.id);

    expect(data.getStarBalance(child.id)).toBe(22);
    expect(data.getScreenTimeBalance(child.id)).toBe(0);

    data.redeemStarsForScreenTime(child.id, saturday, 22, '22 stars redeemed');
    expect(data.getStarBalance(child.id)).toBe(0);
    expect(data.getScreenTimeBalance(child.id)).toBe(22);

    data.addScreenTime(child.id, saturday, 30, 'manual add');
    expect(data.getScreenTimeBalance(child.id)).toBe(52);

    data.deductScreenTimePenalty(child.id, saturday, 20, 'manual deduct');
    expect(data.getScreenTimeBalance(child.id)).toBe(32);
    expect(data.listScreenTimeLogs(child.id)).toHaveLength(3);
  });
  it('uses one screen-time minute per redeemed star', () => {
    const child = data.createChild({ display_name: 'Ratio Kid' });
    data.updateSettings({ screen_time_star_minutes_per_star: 8 });

    const task = data.createTask({
      child_id: child.id,
      title: 'Ratio stars',
      reward_stars: 1
    });
    data.completeTask(task.id);
    data.approveTask(task.id);

    const log = data.redeemStarsForScreenTime(child.id, '2026-06-27', 1, 'ratio test');
    expect(log.minutes).toBe(1);
    expect(data.getScreenTimeBalance(child.id)).toBe(1);
  });

  it('rejects screen-time redemption when stars are insufficient', () => {
    const child = data.createChild({ display_name: 'No Stars' });
    expect(() =>
      data.redeemStarsForScreenTime(child.id, '2026-06-27', 1, 'not enough')
    ).toThrowError(LocalDataError);
  });

  it('persists screen-time ledger logs after repository refresh', () => {
    const child = data.createChild({ display_name: 'Persistent Kid' });
    data.updatePlannedScreenTime(child.id, '2026-06-27', 120);
    data.addScreenTime(child.id, '2026-06-27', 15, 'persisted');

    const refreshed = new LocalDataService(new MockDatabase(storage, 'test-db'));
    expect(refreshed.getWeeklyScreenTime(child.id, '2026-06-22')[5].plannedMinutes).toBe(0);
    expect(refreshed.getScreenTimeBalance(child.id)).toBe(15);
  });
  it('carries ledger balance forward without creating a fresh weekly allowance', () => {
    const child = data.createChild({ display_name: 'Next Week Kid' });
    const task = data.createTask({
      child_id: child.id,
      title: 'Star reward',
      reward_stars: 1
    });
    data.completeTask(task.id);
    data.approveTask(task.id);
    data.updatePlannedScreenTime(child.id, '2026-06-27', 120);
    data.redeemStarsForScreenTime(child.id, '2026-06-27', 1, 'previous week');
    data.addScreenTime(child.id, '2026-06-27', 15, 'previous week');
    data.deductScreenTimePenalty(child.id, '2026-06-27', 10, 'previous week');

    const nextWeek = data.getWeeklyScreenTime(child.id, '2026-06-29');
    expect(nextWeek[0].plannedMinutes).toBe(0);
    expect(nextWeek[5].plannedMinutes).toBe(0);
    expect(nextWeek[6].plannedMinutes).toBe(0);
    expect(nextWeek[5].redeemedMinutes).toBe(0);
    expect(nextWeek[5].penaltyMinutes).toBe(0);
    expect(nextWeek[5].manualAddedMinutes).toBe(0);
    expect(nextWeek[5].remainingMinutes).toBe(6);
  });
  it('manages growth records and returns the latest record by child', () => {
    const first = data.createChild({ display_name: '沉沉' });
    const second = data.createChild({ display_name: '安安' });
    const older = data.createGrowthRecord({
      child_id: first.id,
      date: '2026-06-20',
      height_cm: 118,
      weight_kg: 21.8,
      reading_count: 40,
      note: '第一筆'
    });
    const latest = data.createGrowthRecord({
      child_id: first.id,
      date: '2026-06-25',
      height_cm: 120,
      weight_kg: 22.5,
      reading_count: 45,
      note: '最新紀錄'
    });
    data.createGrowthRecord({
      child_id: second.id,
      date: '2026-06-25',
      height_cm: 110,
      weight_kg: 18.5,
      reading_count: 12
    });

    expect(data.getGrowthRecordsByChild(first.id).map((record) => record.id)).toEqual([
      latest.id,
      older.id
    ]);
    expect(data.getLatestGrowthRecordByChild(first.id)).toMatchObject({
      id: latest.id,
      height_cm: 120,
      weight_kg: 22.5,
      reading_count: 45
    });

    data.updateGrowthRecord(latest.id, { height_cm: 121, note: '已更新' });
    expect(data.getLatestGrowthRecordByChild(first.id)).toMatchObject({
      height_cm: 121,
      note: '已更新'
    });

    data.deleteGrowthRecord(latest.id);
    expect(data.getLatestGrowthRecordByChild(first.id)?.id).toBe(older.id);
  });

  it('keeps growth records through export and import', () => {
    const child = data.createChild({ display_name: '沉沉' });
    const record = data.createGrowthRecord({
      child_id: child.id,
      date: '2026-06-25',
      height_cm: 120,
      weight_kg: 22.5,
      reading_count: 45
    });

    const exported = data.exportData();
    data.resetAllData();
    expect(data.getGrowthRecords()).toHaveLength(0);

    data.importData(exported);
    expect(data.getLatestGrowthRecordByChild(child.id)?.id).toBe(record.id);
  });

  it('stores parent-created child data in the same childId-scoped repository', () => {
    const child = data.createChild({ display_name: '同一個孩子' });

    const task = data.createTask({
      child_id: child.id,
      title: '完成作業',
      reward_stars: 5
    });
    const income = data.addPiggyIncome({ child_id: child.id, source: '家長給的零用錢', amount: 200 });
    const product = data.createPiggyProduct({
      child_id: child.id,
      name: '積木',
      price: 120,
      main_media_id: 'product-media',
      shelf_status: 'shelf'
    });
    const growth = data.createGrowthRecord({
      child_id: child.id,
      date: '2026-06-25',
      height_cm: 118,
      weight_kg: 21.2,
      reading_count: 12
    });
    const dream = data.createDream({
      child_id: child.id,
      title: '買腳踏車',
      target_amount: 1000
    });
    const share = data.createShare({
      child_id: child.id,
      caption: '今天完成了',
      status: 'approved'
    });

    expect(task.child_id).toBe(child.id);
    expect(income.child_id).toBe(child.id);
    expect(product.child_id).toBe(child.id);
    expect(growth.child_id).toBe(child.id);
    expect(dream.child_id).toBe(child.id);
    expect(share.child_id).toBe(child.id);

    expect(data.listTasks(child.id).map((item) => item.id)).toContain(task.id);
    expect(data.getPiggyIncomeRecords(child.id).map((item) => item.id)).toContain(income.id);
    expect(data.listPiggyProducts(child.id).map((item) => item.id)).toContain(product.id);
    expect(data.getGrowthRecordsByChild(child.id).map((item) => item.id)).toContain(growth.id);
    expect(data.listDreams(child.id).map((item) => item.id)).toContain(dream.id);
    expect(data.listShares(child.id).map((item) => item.id)).toContain(share.id);
  });

  it('keeps all parent and child flows in one childId-scoped source of truth', () => {
    const first = data.createChild({ display_name: '同源孩子' });
    const second = data.createChild({ display_name: '隔離孩子' });

    const task = data.createTask({ child_id: first.id, title: '收玩具', reward_stars: 5 });
    expect(data.listTasks(first.id).map((item) => item.id)).toContain(task.id);
    expect(data.listTasks(second.id)).toHaveLength(0);

    data.completeTask(task.id, '孩子完成');
    expect(data.listTasks(first.id).find((item) => item.id === task.id)).toMatchObject({
      status: 'submitted',
      completion_note: '孩子完成'
    });

    data.approveTask(task.id);
    expect(data.listTasks(first.id).find((item) => item.id === task.id)).toMatchObject({ status: 'approved' });
    expect(data.getStarBalance(first.id)).toBe(5);
    expect(data.listNotifications(first.id, 'child').map((item) => item.type)).toEqual(
      expect.arrayContaining(['new_task', 'task_approved', 'stars_awarded'])
    );

    data.addPiggyIncome({ child_id: first.id, source: '零用錢', amount: 300 });
    expect(data.getPiggyBankSummary(first.id).availableToDepositToday).toBe(300);
    data.depositPiggyCoin(first.id, 200);
    expect(data.getPiggyBankSummary(first.id).currentSavings).toBe(200);

    const product = data.createPiggyProduct({
      child_id: first.id,
      name: '積木',
      price: 120,
      main_media_id: 'lego-media',
      shelf_status: 'shelf'
    });
    expect(data.getPiggyShelfProducts(first.id).map((item) => item.id)).toContain(product.id);
    const purchase = data.requestPiggyPurchase(first.id, product.id);
    expect(data.listPiggyPurchases(first.id).map((item) => item.id)).toContain(purchase.id);

    const share = data.createShare({
      child_id: first.id,
      caption: '分享照片影片語音',
      media: [
        { media_type: 'photo', mime_type: 'image/jpeg', file_name: 'photo.jpg' },
        { media_type: 'video', mime_type: 'video/mp4', file_name: 'video.mp4' },
        { media_type: 'audio', mime_type: 'audio/webm', file_name: 'voice.webm' }
      ]
    });
    expect(data.listShares(first.id).find((item) => item.id === share.id)?.media.map((item) => item.media_type)).toEqual([
      'photo',
      'video',
      'audio'
    ]);

    const childLetter = data.createMailboxMessage({
      child_id: first.id,
      sender_role: 'child',
      message: '孩子寫信'
    });
    const parentReply = data.createMailboxMessage({
      child_id: first.id,
      sender_role: 'parent',
      message: '家長回信'
    });
    expect(data.listMailboxMessages(first.id).map((item) => item.id)).toEqual(
      expect.arrayContaining([childLetter.id, parentReply.id])
    );

    const parentDay = data.createSpecialDay({
      child_id: first.id,
      title: '露營日',
      date: '2099-01-01',
      type: 'family_event',
      createdBy: 'parent'
    });
    const childDay = data.createSpecialDay({
      child_id: first.id,
      title: '孩子紀念日',
      date: '2099-02-01',
      type: 'anniversary',
      createdBy: 'child'
    });
    expect(data.getUpcomingSpecialDays(first.id).map((item) => item.id)).toEqual(
      expect.arrayContaining([parentDay.id, childDay.id])
    );
    expect(data.listNotifications(first.id, 'parent').map((item) => item.source_id)).toContain(childDay.id);

    const growth = data.createGrowthRecord({
      child_id: first.id,
      date: '2026-07-02',
      height_cm: 120,
      weight_kg: 22,
      growth_photo_media_ids: ['growth-photo'],
      reading_count: 10,
      note: '長高了'
    });
    expect(data.getGrowthRecordsByChild(first.id)[0]).toMatchObject({
      id: growth.id,
      growth_photo_media_ids: ['growth-photo']
    });

    const screenRequest = data.createScreenTimeRequest({
      child_id: first.id,
      requested_stars: 2,
      note: '想看卡通'
    });
    expect(data.listScreenTimeRequests(first.id)).toMatchObject([{ id: screenRequest.id, status: 'pending' }]);
    data.reviewScreenTimeRequest(screenRequest.id, { status: 'approved' });
    expect(data.listScreenTimeRequests(first.id)[0]).toMatchObject({ id: screenRequest.id, status: 'approved' });
    expect(data.getStarBalance(first.id)).toBe(3);
    expect(data.getScreenTimeBalance(first.id)).toBe(2);
    expect(data.listNotifications(first.id, 'child').map((item) => item.type)).toContain('screen_time_review');

    expect(data.listTasks(second.id)).toHaveLength(0);
    expect(data.listShares(second.id)).toHaveLength(0);
    expect(data.listMailboxMessages(second.id)).toHaveLength(0);
    expect(data.getSpecialDays(second.id)).toHaveLength(0);
    expect(data.getGrowthRecordsByChild(second.id)).toHaveLength(0);
    expect(data.listScreenTimeRequests(second.id)).toHaveLength(0);
    expect(data.getPiggyBankLogs(second.id)).toHaveLength(0);
    expect(data.listPiggyPurchases(second.id)).toHaveLength(0);
  });

  it('manages piggy income, coin deposits and silent over-limit rejection', () => {
    const child = data.createChild({ display_name: '樂樂' });
    data.addPiggyIncome({ child_id: child.id, source: '阿嬤給的', amount: 150 });

    expect(data.getPiggyBankSummary(child.id)).toMatchObject({
      currentSavings: 0,
      availableToDepositToday: 150,
      depositedToday: 0
    });

    data.depositPiggyCoin(child.id, 100);
    data.depositPiggyCoin(child.id, 50);

    expect(data.getPiggyBankSummary(child.id)).toMatchObject({
      currentSavings: 150,
      availableToDepositToday: 0,
      depositedToday: 150
    });
    expect(() => data.depositPiggyCoin(child.id, 1)).toThrowError(LocalDataError);
  });

  it('allows piggy products without names when price and main image are present', () => {
    const child = data.createChild({ display_name: '空白商品孩子' });
    const product = data.createPiggyProduct({
      child_id: child.id,
      price: 120,
      main_media_id: 'blank-name-media',
      shelf_status: 'shelf'
    });

    expect(product.name).toBe('');

    const updated = data.updatePiggyProduct(product.id, { name: '   ' });
    expect(updated.name).toBe('');
  });

  it('keeps piggy products and purchases isolated per child', () => {
    const first = data.createChild({ display_name: '沉沉' });
    const second = data.createChild({ display_name: '樂樂' });
    data.addPiggyIncome({ child_id: first.id, source: '零用錢', amount: 300 });
    data.addPiggyIncome({ child_id: second.id, source: '零用錢', amount: 300 });
    data.depositPiggyCoin(first.id, 300);
    data.depositPiggyCoin(second.id, 300);

    const firstProduct = data.createPiggyProduct({
      child_id: first.id,
      name: '沉沉的積木',
      price: 100,
      main_media_id: 'first-media',
      shelf_status: 'shelf'
    });
    const secondProduct = data.createPiggyProduct({
      child_id: second.id,
      name: '樂樂的畫筆',
      price: 100,
      main_media_id: 'second-media',
      shelf_status: 'shelf'
    });

    expect(data.listPiggyProducts(first.id).map((product) => product.id)).toEqual([firstProduct.id]);
    expect(data.listPiggyProducts(second.id).map((product) => product.id)).toEqual([secondProduct.id]);

    data.requestPiggyPurchase(first.id, firstProduct.id);

    expect(data.listPiggyPurchases(first.id)).toHaveLength(1);
    expect(data.listPiggyPurchases(second.id)).toHaveLength(0);
    expect(() => data.requestPiggyPurchase(second.id, firstProduct.id)).toThrowError(LocalDataError);
  });

  it('keeps six piggy shelf slots, saves child order and backfills after purchase', () => {
    const child = data.createChild({ display_name: '安安' });
    data.addPiggyIncome({ child_id: child.id, source: '生日紅包', amount: 1000 });
    data.depositPiggyCoin(child.id, 1000);

    const products = Array.from({ length: 7 }, (_, index) =>
      data.createPiggyProduct({
        child_id: child.id,
        name: `商品 ${index + 1}`,
        price: 100,
        main_media_id: `media-${index + 1}`,
        shelf_status: index < 6 ? 'shelf' : 'backlog'
      })
    );
    data.savePiggyShelfOrder(child.id, [
      products[1].id,
      products[0].id,
      products[2].id,
      products[3].id,
      products[4].id,
      products[5].id
    ]);

    expect(data.getPiggyShelfProducts(child.id).map((product) => product.id)).toEqual([
      products[1].id,
      products[0].id,
      products[2].id,
      products[3].id,
      products[4].id,
      products[5].id
    ]);

    const purchase = data.requestPiggyPurchase(child.id, products[1].id);
    expect(purchase.product_snapshot).toEqual({
      name: '商品 2',
      price: 100,
      main_media_id: 'media-2'
    });
    expect(data.getPiggyBankSummary(child.id).currentSavings).toBe(900);
    expect(data.getPiggyShelfProducts(child.id).map((product) => product.id)).toEqual([
      products[1].id,
      products[0].id,
      products[2].id,
      products[3].id,
      products[4].id,
      products[5].id
    ]);

    data.completePiggyPurchase(purchase.id);
    expect(data.listPiggyPurchases(child.id).find((item) => item.id === purchase.id)?.status).toBe('arrived');
    expect(data.getPiggyShelfProducts(child.id).map((product) => product.id)).toEqual([
      products[1].id,
      products[0].id,
      products[2].id,
      products[3].id,
      products[4].id,
      products[5].id
    ]);

    data.confirmPiggyPurchaseArrived(purchase.id);
    expect(data.getPiggyShelfProducts(child.id).map((product) => product.id)).toEqual([
      products[0].id,
      products[2].id,
      products[3].id,
      products[4].id,
      products[5].id,
      products[6].id
    ]);
  });

  it('refunds cancelled piggy purchases and preserves completed purchase snapshots', () => {
    const child = data.createChild({ display_name: '米米' });
    data.addPiggyIncome({ child_id: child.id, source: '考試獎勵', amount: 500 });
    data.depositPiggyCoin(child.id, 500);
    const product = data.createPiggyProduct({
      child_id: child.id,
      name: '彩色鉛筆',
      price: 200,
      main_media_id: 'pencil-media',
      shelf_status: 'shelf'
    });

    const cancelled = data.requestPiggyPurchase(child.id, product.id);
    data.cancelPiggyPurchase(cancelled.id);
    expect(data.getPiggyBankSummary(child.id).currentSavings).toBe(500);

    data.setPiggyProductShelfStatus(product.id, 'shelf');
    const completed = data.requestPiggyPurchase(child.id, product.id);
    data.updatePiggyProduct(product.id, { name: '修改後名稱', price: 999 });
    data.completePiggyPurchase(completed.id);
    data.confirmPiggyPurchaseArrived(completed.id);

    expect(data.listPiggyPurchases(child.id).find((purchase) => purchase.id === completed.id)).toMatchObject({
      status: 'completed',
      product_snapshot: {
        name: '彩色鉛筆',
        price: 200,
        main_media_id: 'pencil-media'
      }
    });
  });
});

