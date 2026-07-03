import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import {
  createChildDeviceToken,
  createChildDeviceTokenForChild,
  parseChildDeviceToken
} from './childDeviceToken';
import {
  LOCAL_DEVICE_ID,
  MockDatabase
} from './mockDatabase';
import {
  LocalDataError,
  LocalDataService,
  type LocalDataRepository,
  type CreateChildInput,
  type UpdateChildInput
} from './localData';
import type {
  LocalChild,
  LocalDatabaseState,
  LocalDeviceBindingRecord,
  LocalRepositoryScope,
  UUID
} from './localTypes';

const SUPABASE_CACHE_KEY = 'little-dreamers-family:supabase-cache:v1';
const SUPABASE_FAMILY_ID = '00000000-0000-4000-8000-000000000001';
const SUPABASE_PARENT_ID = '00000000-0000-4000-8000-000000000002';
const SUPABASE_DEVICE_FALLBACK_ID = '00000000-0000-4000-8000-000000000003';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SYNC_RETRY_DELAYS_MS = [1000, 3000, 8000, 15000, 30000];

type Listener = (state: LocalDatabaseState) => void;

interface SupabaseConfig {
  url: string;
  anonKey: string;
}

interface SupabaseChildRow {
  id: UUID;
  parent_id: UUID | null;
  family_id: UUID;
  display_name: string;
  legal_name: string | null;
  birth_date: string | null;
  birthday: string | null;
  gender: string | null;
  avatar_path: string | null;
  avatar_media_id: UUID | null;
  theme_color: string | null;
  timezone: string;
  status: LocalChild['status'];
  notes: string | null;
  child_token: string;
  child_token_updated_at: string;
  child_token_consumed_at: string | null;
  binding_status: LocalChild['binding_status'];
  bound_device_id: UUID | null;
  bound_at: string | null;
  last_login_at: string | null;
  last_login_device: string | null;
  created_by: UUID;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface SupabaseDeviceBindingRow {
  id: string;
  family_id: UUID;
  child_id: UUID;
  device_id: UUID;
  last_login_at: string | null;
  last_login_device: string | null;
  binding_status: LocalDeviceBindingRecord['binding_status'];
  qr_token_status: LocalDeviceBindingRecord['qr_token_status'];
  created_at: string;
  updated_at: string;
}

interface SupabaseParentRow {
  id: UUID;
  family_id: UUID;
  display_name: string;
  email: string | null;
  settings: {
    repository_state?: LocalDatabaseState;
    repository_updated_at?: string;
    repository_schema_version?: 1;
    sync_error?: string | null;
  } | null;
  created_at?: string;
  updated_at?: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const env = import.meta.env;
  const url = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseModeEnabled() {
  return import.meta.env.VITE_DATA_MODE === 'supabase' && Boolean(getSupabaseConfig());
}

export function createSupabaseClient(config = getSupabaseConfig()): SupabaseClient | null {
  if (!config) return null;
  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });
}

export class SupabaseDataRepository implements LocalDataRepository {
  private readonly client: SupabaseClient | null;
  private readonly cache = new LocalDataService(new MockDatabase(undefined, SUPABASE_CACHE_KEY));
  private readonly listeners = new Set<Listener>();
  private hydratePromise: Promise<void> | null = null;
  private realtimeChannel: RealtimeChannel | null = null;
  private pendingPush = false;
  private pushPromise: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private lastRemoteUpdatedAt: string | null = null;

  constructor(client: SupabaseClient | null = createSupabaseClient()) {
    this.client = client;
    this.hydrateFromSupabase();
    this.subscribeToSupabaseChanges();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.hydrateFromSupabase();
      });
    }
  }

  private delegate<K extends keyof LocalDataRepository>(method: K): LocalDataRepository[K] {
    const target = this.cache[method];
    if (typeof target !== 'function') return target;
    return ((...args: unknown[]) => {
      return (target as (...values: unknown[]) => unknown).apply(this.cache, args);
    }) as LocalDataRepository[K];
  }

  private delegateWrite<K extends keyof LocalDataRepository>(method: K): LocalDataRepository[K] {
    const target = this.cache[method];
    return ((...args: unknown[]) => {
      const result = (target as (...values: unknown[]) => unknown).apply(this.cache, args);
      this.queuePush();
      return result;
    }) as LocalDataRepository[K];
  }

  getState(): LocalDatabaseState {
    this.hydrateFromSupabase();
    return this.cache.getState();
  }

  getRepositoryScope(): LocalRepositoryScope {
    return this.cache.getRepositoryScope();
  }

  resetLocalData(): LocalDatabaseState {
    return this.cache.resetLocalData();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    const unsubscribeCache = this.cache.subscribe(listener);
    this.hydrateFromSupabase();
    return () => {
      this.listeners.delete(listener);
      unsubscribeCache();
    };
  }

  createChild(input: CreateChildInput): LocalChild {
    const child = this.cache.createChild(input);
    this.upsertChildToSupabase(child);
    this.upsertDeviceBindingRecordToSupabase(child.id, 'unbound', 'active');
    this.queuePush();
    return child;
  }

  updateChild(childId: UUID, input: UpdateChildInput): LocalChild {
    const child = this.cache.updateChild(childId, input);
    this.upsertChildToSupabase(child);
    this.queuePush();
    return child;
  }

  deleteChild(childId: UUID): LocalChild {
    const child = this.cache.deleteChild(childId);
    this.upsertChildToSupabase(child);
    this.queuePush();
    return child;
  }

  switchChild(childId: UUID): LocalChild {
    const child = this.cache.switchChild(childId);
    this.queuePush();
    return child;
  }

  listChildren(includeArchived = false): LocalChild[] {
    this.hydrateFromSupabase();
    return this.cache.listChildren(includeArchived);
  }

  getChildByToken(token: string): LocalChild | null {
    this.hydrateFromSupabase();
    return this.cache.getChildByToken(token);
  }

  bindChildDeviceByToken(token: string): LocalChild {
    const normalized = token.trim();
    if (!normalized) throw new LocalDataError('Child token is empty', 'CHILD_TOKEN_EMPTY');
    const cachedChild = this.cache.getChildByToken(normalized);
    if (cachedChild) {
      const child = this.cache.bindChildDeviceByToken(normalized);
      this.upsertChildToSupabase(child);
      this.upsertDeviceBindingRecordToSupabase(child.id, 'bound', 'consumed', {
        lastLoginAt: child.last_login_at,
        lastLoginDevice: child.last_login_device
      });
      this.queuePush();
      return child;
    }

    if (!parseChildDeviceToken(normalized)) throw new LocalDataError('Child token not found', 'CHILD_TOKEN_NOT_FOUND');
    const child = this.cache.bindChildDeviceByToken(normalized);
    this.upsertChildToSupabase(child);
    this.upsertDeviceBindingRecordToSupabase(child.id, 'bound', 'consumed', {
      lastLoginAt: child.last_login_at,
      lastLoginDevice: child.last_login_device
    });
    this.queuePush();
    return child;
  }

  regenerateChildToken(childId: UUID): LocalChild {
    const child = this.cache.regenerateChildToken(childId);
    this.upsertChildToSupabase(child);
    this.upsertDeviceBindingRecordToSupabase(child.id, 'unbound', 'active');
    this.queuePush();
    return child;
  }

  unbindChildDevice(childId: UUID): LocalChild {
    const child = this.cache.unbindChildDevice(childId);
    this.upsertChildToSupabase(child);
    this.upsertDeviceBindingRecordToSupabase(child.id, 'unbound', 'revoked', {
      lastLoginAt: child.last_login_at,
      lastLoginDevice: child.last_login_device
    });
    this.queuePush();
    return child;
  }

  listDeviceBindingRecords(childId?: UUID): LocalDeviceBindingRecord[] {
    this.hydrateFromSupabase();
    return this.cache.listDeviceBindingRecords(childId);
  }

  createTask = this.delegateWrite('createTask');
  completeTask = this.delegateWrite('completeTask');
  approveTask = this.delegateWrite('approveTask');
  listTasks = this.delegate('listTasks');
  getStarBalance = this.delegate('getStarBalance');
  listStarTransactions = this.delegate('listStarTransactions');
  createDream = this.delegateWrite('createDream');
  migrateDreamCoverToMedia = this.delegateWrite('migrateDreamCoverToMedia');
  deleteDream = this.delegateWrite('deleteDream');
  addDreamDeposit = this.delegateWrite('addDreamDeposit');
  completeDream = this.delegateWrite('completeDream');
  listDreams = this.delegate('listDreams');
  createShare = this.delegateWrite('createShare');
  listShares = this.delegate('listShares');
  deleteShare = this.delegateWrite('deleteShare');
  approveShare = this.delegateWrite('approveShare');
  createMailboxMessage = this.delegateWrite('createMailboxMessage');
  markMessageRead = this.delegateWrite('markMessageRead');
  listMailboxMessages = this.delegate('listMailboxMessages');
  createBadge = this.delegateWrite('createBadge');
  deleteBadge = this.delegateWrite('deleteBadge');
  awardBadge = this.delegateWrite('awardBadge');
  getBadges = this.delegate('getBadges');
  getChildBadges = this.delegate('getChildBadges');
  createSpecialDay = this.delegateWrite('createSpecialDay');
  updateSpecialDay = this.delegateWrite('updateSpecialDay');
  deleteSpecialDay = this.delegateWrite('deleteSpecialDay');
  getSpecialDays = this.delegate('getSpecialDays');
  getUpcomingSpecialDays = this.delegate('getUpcomingSpecialDays');
  getSettings = this.delegate('getSettings');
  updateSettings = this.delegateWrite('updateSettings');
  exportData = this.delegate('exportData');
  importData = this.delegateWrite('importData');
  resetAllData = this.delegateWrite('resetAllData');
  resetDemoData = this.delegateWrite('resetDemoData');
  updateScreenTime = this.delegateWrite('updateScreenTime');
  createScreenTimeRequest = this.delegateWrite('createScreenTimeRequest');
  reviewScreenTimeRequest = this.delegateWrite('reviewScreenTimeRequest');
  listScreenTimeRequests = this.delegate('listScreenTimeRequests');
  getScreenTimeBalance = this.delegate('getScreenTimeBalance');
  listScreenTimeLogs = this.delegate('listScreenTimeLogs');
  getWeeklyScreenTime = this.delegate('getWeeklyScreenTime');
  updatePlannedScreenTime = this.delegateWrite('updatePlannedScreenTime');
  redeemStarsForScreenTime = this.delegateWrite('redeemStarsForScreenTime');
  addScreenTime = this.delegateWrite('addScreenTime');
  deductScreenTimePenalty = this.delegateWrite('deductScreenTimePenalty');
  recordScreenTimeUsed = this.delegateWrite('recordScreenTimeUsed');
  getScreenTimeLogsByChild = this.delegate('getScreenTimeLogsByChild');
  getTodayScreenTimeByChild = this.delegate('getTodayScreenTimeByChild');
  createGrowthRecord = this.delegateWrite('createGrowthRecord');
  updateGrowthRecord = this.delegateWrite('updateGrowthRecord');
  deleteGrowthRecord = this.delegateWrite('deleteGrowthRecord');
  getGrowthRecords = this.delegate('getGrowthRecords');
  getLatestGrowthRecordByChild = this.delegate('getLatestGrowthRecordByChild');
  getGrowthRecordsByChild = this.delegate('getGrowthRecordsByChild');
  listNotifications = this.delegate('listNotifications');
  markNotificationRead = this.delegateWrite('markNotificationRead');
  addPiggyIncome = this.delegateWrite('addPiggyIncome');
  depositPiggyCoin = this.delegateWrite('depositPiggyCoin');
  getPiggyBankSummary = this.delegate('getPiggyBankSummary');
  getPiggyIncomeRecords = this.delegate('getPiggyIncomeRecords');
  getPiggyBankLogs = this.delegate('getPiggyBankLogs');
  createPiggyProduct = this.delegateWrite('createPiggyProduct');
  updatePiggyProduct = this.delegateWrite('updatePiggyProduct');
  deletePiggyProduct = this.delegateWrite('deletePiggyProduct');
  listPiggyProducts = this.delegate('listPiggyProducts');
  setPiggyProductShelfStatus = this.delegateWrite('setPiggyProductShelfStatus');
  savePiggyShelfOrder = this.delegateWrite('savePiggyShelfOrder');
  getPiggyShelfProducts = this.delegate('getPiggyShelfProducts');
  getPiggyProductDisplaySettings = this.delegate('getPiggyProductDisplaySettings');
  savePiggyProductDisplaySettings = this.delegateWrite('savePiggyProductDisplaySettings');
  requestPiggyPurchase = this.delegateWrite('requestPiggyPurchase');
  cancelPiggyPurchase = this.delegateWrite('cancelPiggyPurchase');
  completePiggyPurchase = this.delegateWrite('completePiggyPurchase');
  confirmPiggyPurchaseArrived = this.delegateWrite('confirmPiggyPurchaseArrived');
  listPiggyPurchases = this.delegate('listPiggyPurchases');
  getAnnualParentNote = this.delegate('getAnnualParentNote');
  saveAnnualParentNote = this.delegateWrite('saveAnnualParentNote');
  listAnnualParentNotes = this.delegate('listAnnualParentNotes');
  saveMemoryPack = this.delegateWrite('saveMemoryPack');
  getMemoryPack = this.delegate('getMemoryPack');
  exportMemoryPack = this.delegate('exportMemoryPack');
  deleteMemoryPack = this.delegateWrite('deleteMemoryPack');
  listMemoryPacks = this.delegate('listMemoryPacks');

  private hydrateFromSupabase() {
    if (!this.client || this.hydratePromise) return;
    this.hydratePromise = this.fetchSupabaseState()
      .then((remoteState) => {
        if (!remoteState) return;
        const currentState = this.cache.getState();
        if (currentState.updated_at > remoteState.updated_at) {
          this.queuePush();
          return;
        }
        this.cache.importData(JSON.stringify(mergeRemoteState(currentState, remoteState)));
        this.emit();
      })
      .catch((error) => {
        console.warn('[supabase-repository] hydrate failed', error);
        this.scheduleRetry();
      })
      .finally(() => {
        this.hydratePromise = null;
      });
  }

  private async fetchSupabaseState(): Promise<LocalDatabaseState | null> {
    if (!this.client) return null;
    const state = this.cache.getState();
    const [
      { data: parent, error: parentError },
      { data: children, error: childrenError },
      { data: bindings, error: bindingsError }
    ] = await Promise.all([
      this.client.from('parents').select('*').eq('id', SUPABASE_PARENT_ID).maybeSingle(),
      this.client.from('children').select('*').eq('family_id', SUPABASE_FAMILY_ID).order('created_at'),
      this.client.from('device_bindings').select('*').eq('family_id', SUPABASE_FAMILY_ID).order('updated_at', { ascending: false })
    ]);
    if (parentError) throw parentError;
    if (childrenError) throw childrenError;
    if (bindingsError) throw bindingsError;

    const parentState = readRepositoryState((parent as SupabaseParentRow | null)?.settings ?? null);
    const remoteChildren = ((children ?? []) as SupabaseChildRow[]).map(fromSupabaseChild);
    const baseState = parentState ?? state;
    const mergedChildren = mergeChildren(baseState.children, remoteChildren);
    const updatedAt = maxIsoDate([
      parentState?.updated_at,
      (parent as SupabaseParentRow | null)?.settings?.repository_updated_at,
      ...mergedChildren.map((child) => child.updated_at),
      ...((bindings ?? []) as SupabaseDeviceBindingRow[]).map((binding) => binding.updated_at)
    ]) ?? new Date().toISOString();
    this.lastRemoteUpdatedAt = updatedAt;
    return {
      ...baseState,
      family_id: SUPABASE_FAMILY_ID,
      parent_id: SUPABASE_PARENT_ID,
      current_user_id: SUPABASE_PARENT_ID,
      children: mergedChildren,
      child_onboarding_tokens: mergedChildren
        .filter((child) => child.status === 'active' && !child.child_token_consumed_at)
        .map((child) => ({
          childId: child.id,
          childName: child.display_name,
          childToken: child.child_token,
          createdAt: child.child_token_updated_at
        })),
      device_binding_records: mergeDeviceBindings(
        baseState.device_binding_records,
        ((bindings ?? []) as SupabaseDeviceBindingRow[]).map(fromSupabaseDeviceBinding)
      ),
      active_child_id: baseState.active_child_id ?? mergedChildren.find((child) => child.status === 'active')?.id ?? null,
      updated_at: updatedAt
    };
  }

  private queuePush() {
    if (!this.client) return;
    this.pendingPush = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.pushPromise) return;
    this.pushPromise = this.flushPush()
      .catch((error) => {
        console.warn('[supabase-repository] sync failed', error);
        this.scheduleRetry();
      })
      .finally(() => {
        this.pushPromise = null;
        if (this.pendingPush && !this.retryTimer) this.queuePush();
      });
  }

  private async flushPush() {
    if (!this.client || !this.pendingPush) return;
    this.pendingPush = false;
    const state = toSupabaseRepositoryState(this.cache.getState());
    await this.pushRepositorySnapshot(state);
    await this.pushChildrenAndBindings(state);
    this.lastRemoteUpdatedAt = state.updated_at;
    this.retryAttempt = 0;
  }

  private async pushRepositorySnapshot(state: LocalDatabaseState) {
    if (!this.client) return;
    const parentRow: Partial<SupabaseParentRow> = {
      id: SUPABASE_PARENT_ID,
      family_id: SUPABASE_FAMILY_ID,
      display_name: state.family_settings.parent_name || 'Parent',
      email: state.family_settings.parent_email,
      settings: {
        repository_schema_version: 1,
        repository_updated_at: state.updated_at,
        repository_state: state,
        sync_error: null
      }
    };
    const { error } = await this.client.from('parents').upsert(parentRow, { onConflict: 'id' });
    if (error) throw error;
  }

  private async pushChildrenAndBindings(state: LocalDatabaseState) {
    if (!this.client) return;
    const children = state.children.map(toSupabaseChild);
    if (children.length) {
      const { error } = await this.client.from('children').upsert(children, { onConflict: 'id' });
      if (error) throw error;
    }

    const bindings = state.device_binding_records
      .filter((binding) => state.children.some((child) => child.id === binding.child_id))
      .map((binding) => toSupabaseDeviceBinding(binding));
    if (bindings.length) {
      const { error } = await this.client.from('device_bindings').upsert(bindings, { onConflict: 'child_id,device_id' });
      if (error) throw error;
    }
  }

  private scheduleRetry() {
    if (!this.client || this.retryTimer) return;
    this.pendingPush = true;
    const delay = SYNC_RETRY_DELAYS_MS[Math.min(this.retryAttempt, SYNC_RETRY_DELAYS_MS.length - 1)];
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.hydrateFromSupabase();
      this.queuePush();
    }, delay);
  }

  private subscribeToSupabaseChanges() {
    if (!this.client || this.realtimeChannel) return;
    this.realtimeChannel = this.client
      .channel('little-dreamers-family-repository')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parents', filter: `id=eq.${SUPABASE_PARENT_ID}` },
        () => this.hydrateFromSupabase()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'children', filter: `family_id=eq.${SUPABASE_FAMILY_ID}` },
        () => this.hydrateFromSupabase()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'device_bindings', filter: `family_id=eq.${SUPABASE_FAMILY_ID}` },
        () => this.hydrateFromSupabase()
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.hydrateFromSupabase();
        }
      });
  }

  private upsertChildToSupabase(child: LocalChild) {
    if (!this.client) return;
    void this.client
      .from('children')
      .upsert(toSupabaseChild(child), { onConflict: 'id' })
      .then(({ error }) => {
        if (error) console.warn('[supabase-repository] child upsert failed', error);
      });
  }

  private upsertDeviceBindingRecordToSupabase(
    childId: UUID,
    bindingStatus: LocalDeviceBindingRecord['binding_status'],
    qrTokenStatus: LocalDeviceBindingRecord['qr_token_status'],
    input: { lastLoginAt?: string | null; lastLoginDevice?: string | null } = {}
  ) {
    if (!this.client) return;
    const state = this.cache.getState();
    const child = state.children.find((item) => item.id === childId);
    if (!child) return;
    const timestamp = new Date().toISOString();
    const deviceId = toSupabaseUuid(state.device_id ?? LOCAL_DEVICE_ID, SUPABASE_DEVICE_FALLBACK_ID);
    const record: SupabaseDeviceBindingRow = {
      id: `${childId}:${deviceId}`,
      family_id: SUPABASE_FAMILY_ID,
      child_id: childId,
      device_id: deviceId,
      last_login_at: input.lastLoginAt ?? child.last_login_at,
      last_login_device: input.lastLoginDevice ?? child.last_login_device,
      binding_status: bindingStatus,
      qr_token_status: qrTokenStatus,
      created_at: timestamp,
      updated_at: timestamp
    };
    void this.client
      .from('device_bindings')
      .upsert(record, { onConflict: 'child_id,device_id' })
      .then(({ error }) => {
        if (error) console.warn('[supabase-repository] device binding upsert failed', error);
      });
  }

  private emit() {
    const state = this.cache.getState();
    this.listeners.forEach((listener) => listener(state));
  }
}

function readRepositoryState(settings: SupabaseParentRow['settings']): LocalDatabaseState | null {
  const state = settings?.repository_state;
  if (!state || state.schema_version !== 1 || !Array.isArray(state.children)) return null;
  return state;
}

function mergeRemoteState(current: LocalDatabaseState, remote: LocalDatabaseState): LocalDatabaseState {
  const activeChildId =
    current.currentChildIdentity?.childId ??
    current.deviceBinding ??
    current.device_child_id ??
    (current.active_child_id && remote.children.some((child) => child.id === current.active_child_id)
      ? current.active_child_id
      : remote.active_child_id);

  return {
    ...remote,
    device_id: current.device_id,
    deviceBinding: current.deviceBinding,
    device_child_id: current.device_child_id,
    currentChildIdentity: current.currentChildIdentity,
    active_child_id: activeChildId
  };
}

function toSupabaseRepositoryState(state: LocalDatabaseState): LocalDatabaseState {
  const next = JSON.parse(JSON.stringify(state)) as LocalDatabaseState;
  const timestamp = new Date().toISOString();
  next.family_id = SUPABASE_FAMILY_ID;
  next.parent_id = SUPABASE_PARENT_ID;
  next.current_user_id = SUPABASE_PARENT_ID;
  next.deviceBinding = null;
  next.device_child_id = null;
  next.currentChildIdentity = null;
  next.updated_at = maxIsoDate([state.updated_at, timestamp]) ?? timestamp;
  rewriteFamilyIds(next);
  return next;
}

function rewriteFamilyIds(value: unknown) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(rewriteFamilyIds);
    return;
  }
  const record = value as Record<string, unknown>;
  if ('family_id' in record) record.family_id = SUPABASE_FAMILY_ID;
  if (record.created_by === 'local-parent') record.created_by = SUPABASE_PARENT_ID;
  if (record.sender_user_id === 'local-parent') record.sender_user_id = SUPABASE_PARENT_ID;
  Object.values(record).forEach(rewriteFamilyIds);
}

function toSupabaseDeviceBinding(binding: LocalDeviceBindingRecord): SupabaseDeviceBindingRow {
  const deviceId = toSupabaseUuid(binding.device_id, SUPABASE_DEVICE_FALLBACK_ID);
  return {
    id: `${binding.child_id}:${deviceId}`,
    family_id: SUPABASE_FAMILY_ID,
    child_id: binding.child_id,
    device_id: deviceId,
    last_login_at: binding.last_login_at,
    last_login_device: binding.last_login_device,
    binding_status: binding.binding_status,
    qr_token_status: binding.qr_token_status,
    created_at: binding.created_at,
    updated_at: binding.updated_at
  };
}

function toSupabaseChild(child: LocalChild): SupabaseChildRow {
  return {
    id: child.id,
    parent_id: SUPABASE_PARENT_ID,
    family_id: SUPABASE_FAMILY_ID,
    display_name: child.display_name,
    legal_name: child.legal_name,
    birth_date: child.birth_date,
    birthday: child.birthday,
    gender: child.gender,
    avatar_path: child.avatar_path,
    avatar_media_id: child.avatar_media_id,
    theme_color: child.theme_color,
    timezone: child.timezone,
    status: child.status,
    notes: child.notes,
    child_token: child.child_token || createChildDeviceTokenForChild(child),
    child_token_updated_at: child.child_token_updated_at,
    child_token_consumed_at: child.child_token_consumed_at,
    binding_status: child.binding_status,
    bound_device_id: child.bound_device_id,
    bound_at: child.bound_at,
    last_login_at: child.last_login_at,
    last_login_device: child.last_login_device,
    created_by: SUPABASE_PARENT_ID,
    created_at: child.created_at,
    updated_at: child.updated_at,
    archived_at: child.archived_at
  };
}

function fromSupabaseChild(row: SupabaseChildRow): LocalChild {
  return {
    id: row.id,
    family_id: row.family_id,
    display_name: row.display_name,
    legal_name: row.legal_name,
    birth_date: row.birth_date,
    birthday: row.birthday,
    gender: row.gender,
    avatar_path: row.avatar_path,
    avatar_media_id: row.avatar_media_id,
    theme_color: row.theme_color,
    timezone: row.timezone || 'Asia/Taipei',
    status: row.status,
    notes: row.notes,
    child_token: row.child_token || createChildDeviceToken({
      childId: row.id,
      displayName: row.display_name,
      birthDate: row.birth_date,
      themeColor: row.theme_color,
      createdAt: row.created_at
    }),
    child_token_updated_at: row.child_token_updated_at,
    child_token_consumed_at: row.child_token_consumed_at,
    binding_status: row.binding_status,
    bound_device_id: row.bound_device_id,
    bound_at: row.bound_at,
    last_login_at: row.last_login_at,
    last_login_device: row.last_login_device,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at
  };
}

function fromSupabaseDeviceBinding(row: SupabaseDeviceBindingRow): LocalDeviceBindingRecord {
  return {
    id: row.id,
    family_id: row.family_id,
    child_id: row.child_id,
    device_id: row.device_id,
    last_login_at: row.last_login_at,
    last_login_device: row.last_login_device,
    binding_status: row.binding_status,
    qr_token_status: row.qr_token_status,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mergeChildren(localChildren: LocalChild[], remoteChildren: LocalChild[]) {
  const byId = new Map<string, LocalChild>();
  [...localChildren, ...remoteChildren].forEach((child) => {
    const existing = byId.get(child.id);
    if (!existing || child.updated_at >= existing.updated_at) byId.set(child.id, child);
  });
  return [...byId.values()].sort((first, second) => first.created_at.localeCompare(second.created_at));
}

function mergeDeviceBindings(
  localBindings: LocalDeviceBindingRecord[],
  remoteBindings: LocalDeviceBindingRecord[]
) {
  const byScope = new Map<string, LocalDeviceBindingRecord>();
  [...localBindings, ...remoteBindings].forEach((binding) => {
    const key = `${binding.child_id}:${binding.device_id}`;
    const existing = byScope.get(key);
    if (!existing || binding.updated_at >= existing.updated_at) byScope.set(key, binding);
  });
  return [...byScope.values()].sort((first, second) => second.updated_at.localeCompare(first.updated_at));
}

function toSupabaseUuid(value: string | null | undefined, fallback: string) {
  return value && UUID_PATTERN.test(value) ? value : fallback;
}

function maxIsoDate(values: Array<string | null | undefined>) {
  const sorted = values.filter((value): value is string => Boolean(value)).sort();
  return sorted.length ? sorted[sorted.length - 1] : null;
}
