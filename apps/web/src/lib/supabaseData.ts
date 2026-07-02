import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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
  localData,
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
  id: UUID;
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
  private readonly cache: LocalDataService;
  private readonly listeners = new Set<Listener>();
  private hydratePromise: Promise<void> | null = null;

  constructor(client: SupabaseClient | null = createSupabaseClient()) {
    this.client = client;
    this.cache = new LocalDataService(new MockDatabase(undefined, SUPABASE_CACHE_KEY));
    this.hydrateFromSupabase();
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
    return child;
  }

  updateChild(childId: UUID, input: UpdateChildInput): LocalChild {
    const child = this.cache.updateChild(childId, input);
    this.upsertChildToSupabase(child);
    return child;
  }

  deleteChild(childId: UUID): LocalChild {
    const child = this.cache.deleteChild(childId);
    this.upsertChildToSupabase(child);
    return child;
  }

  switchChild(childId: UUID): LocalChild {
    return this.cache.switchChild(childId);
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
      return child;
    }

    if (!parseChildDeviceToken(normalized)) throw new LocalDataError('Child token not found', 'CHILD_TOKEN_NOT_FOUND');
    const child = this.cache.bindChildDeviceByToken(normalized);
    this.upsertChildToSupabase(child);
    this.upsertDeviceBindingRecordToSupabase(child.id, 'bound', 'consumed', {
      lastLoginAt: child.last_login_at,
      lastLoginDevice: child.last_login_device
    });
    return child;
  }

  regenerateChildToken(childId: UUID): LocalChild {
    const child = this.cache.regenerateChildToken(childId);
    this.upsertChildToSupabase(child);
    this.upsertDeviceBindingRecordToSupabase(child.id, 'unbound', 'active');
    return child;
  }

  unbindChildDevice(childId: UUID): LocalChild {
    const child = this.cache.unbindChildDevice(childId);
    this.upsertChildToSupabase(child);
    this.upsertDeviceBindingRecordToSupabase(child.id, 'unbound', 'revoked', {
      lastLoginAt: child.last_login_at,
      lastLoginDevice: child.last_login_device
    });
    return child;
  }

  listDeviceBindingRecords(childId?: UUID): LocalDeviceBindingRecord[] {
    this.hydrateFromSupabase();
    return this.cache.listDeviceBindingRecords(childId);
  }

  createTask = localData.createTask.bind(localData);
  completeTask = localData.completeTask.bind(localData);
  approveTask = localData.approveTask.bind(localData);
  listTasks = localData.listTasks.bind(localData);
  getStarBalance = localData.getStarBalance.bind(localData);
  listStarTransactions = localData.listStarTransactions.bind(localData);
  createDream = localData.createDream.bind(localData);
  migrateDreamCoverToMedia = localData.migrateDreamCoverToMedia.bind(localData);
  deleteDream = localData.deleteDream.bind(localData);
  addDreamDeposit = localData.addDreamDeposit.bind(localData);
  completeDream = localData.completeDream.bind(localData);
  listDreams = localData.listDreams.bind(localData);
  createShare = localData.createShare.bind(localData);
  listShares = localData.listShares.bind(localData);
  deleteShare = localData.deleteShare.bind(localData);
  approveShare = localData.approveShare.bind(localData);
  createMailboxMessage = localData.createMailboxMessage.bind(localData);
  markMessageRead = localData.markMessageRead.bind(localData);
  listMailboxMessages = localData.listMailboxMessages.bind(localData);
  createBadge = localData.createBadge.bind(localData);
  deleteBadge = localData.deleteBadge.bind(localData);
  awardBadge = localData.awardBadge.bind(localData);
  getBadges = localData.getBadges.bind(localData);
  getChildBadges = localData.getChildBadges.bind(localData);
  createSpecialDay = localData.createSpecialDay.bind(localData);
  updateSpecialDay = localData.updateSpecialDay.bind(localData);
  deleteSpecialDay = localData.deleteSpecialDay.bind(localData);
  getSpecialDays = localData.getSpecialDays.bind(localData);
  getUpcomingSpecialDays = localData.getUpcomingSpecialDays.bind(localData);
  getSettings = localData.getSettings.bind(localData);
  updateSettings = localData.updateSettings.bind(localData);
  exportData = localData.exportData.bind(localData);
  importData = localData.importData.bind(localData);
  resetAllData = localData.resetAllData.bind(localData);
  resetDemoData = localData.resetDemoData.bind(localData);
  updateScreenTime = localData.updateScreenTime.bind(localData);
  createScreenTimeRequest = localData.createScreenTimeRequest.bind(localData);
  reviewScreenTimeRequest = localData.reviewScreenTimeRequest.bind(localData);
  listScreenTimeRequests = localData.listScreenTimeRequests.bind(localData);
  getScreenTimeBalance = localData.getScreenTimeBalance.bind(localData);
  listScreenTimeLogs = localData.listScreenTimeLogs.bind(localData);
  getWeeklyScreenTime = localData.getWeeklyScreenTime.bind(localData);
  updatePlannedScreenTime = localData.updatePlannedScreenTime.bind(localData);
  redeemStarsForScreenTime = localData.redeemStarsForScreenTime.bind(localData);
  addScreenTime = localData.addScreenTime.bind(localData);
  deductScreenTimePenalty = localData.deductScreenTimePenalty.bind(localData);
  recordScreenTimeUsed = localData.recordScreenTimeUsed.bind(localData);
  getScreenTimeLogsByChild = localData.getScreenTimeLogsByChild.bind(localData);
  getTodayScreenTimeByChild = localData.getTodayScreenTimeByChild.bind(localData);
  createGrowthRecord = localData.createGrowthRecord.bind(localData);
  updateGrowthRecord = localData.updateGrowthRecord.bind(localData);
  deleteGrowthRecord = localData.deleteGrowthRecord.bind(localData);
  getGrowthRecords = localData.getGrowthRecords.bind(localData);
  getLatestGrowthRecordByChild = localData.getLatestGrowthRecordByChild.bind(localData);
  getGrowthRecordsByChild = localData.getGrowthRecordsByChild.bind(localData);
  listNotifications = localData.listNotifications.bind(localData);
  markNotificationRead = localData.markNotificationRead.bind(localData);
  addPiggyIncome = localData.addPiggyIncome.bind(localData);
  depositPiggyCoin = localData.depositPiggyCoin.bind(localData);
  getPiggyBankSummary = localData.getPiggyBankSummary.bind(localData);
  getPiggyIncomeRecords = localData.getPiggyIncomeRecords.bind(localData);
  getPiggyBankLogs = localData.getPiggyBankLogs.bind(localData);
  createPiggyProduct = localData.createPiggyProduct.bind(localData);
  updatePiggyProduct = localData.updatePiggyProduct.bind(localData);
  deletePiggyProduct = localData.deletePiggyProduct.bind(localData);
  listPiggyProducts = localData.listPiggyProducts.bind(localData);
  setPiggyProductShelfStatus = localData.setPiggyProductShelfStatus.bind(localData);
  savePiggyShelfOrder = localData.savePiggyShelfOrder.bind(localData);
  getPiggyShelfProducts = localData.getPiggyShelfProducts.bind(localData);
  getPiggyProductDisplaySettings = localData.getPiggyProductDisplaySettings.bind(localData);
  savePiggyProductDisplaySettings = localData.savePiggyProductDisplaySettings.bind(localData);
  requestPiggyPurchase = localData.requestPiggyPurchase.bind(localData);
  cancelPiggyPurchase = localData.cancelPiggyPurchase.bind(localData);
  completePiggyPurchase = localData.completePiggyPurchase.bind(localData);
  confirmPiggyPurchaseArrived = localData.confirmPiggyPurchaseArrived.bind(localData);
  listPiggyPurchases = localData.listPiggyPurchases.bind(localData);

  private hydrateFromSupabase() {
    if (!this.client || this.hydratePromise) return;
    this.hydratePromise = this.fetchSupabaseState()
      .then((remoteState) => {
        if (!remoteState) return;
        this.cache.importData(JSON.stringify(remoteState));
        this.emit();
      })
      .catch((error) => {
        console.warn('[supabase-repository] hydrate failed', error);
      })
      .finally(() => {
        this.hydratePromise = null;
      });
  }

  private async fetchSupabaseState(): Promise<LocalDatabaseState | null> {
    if (!this.client) return null;
    const state = this.cache.getState();
    const [{ data: children, error: childrenError }, { data: bindings, error: bindingsError }] = await Promise.all([
      this.client.from('children').select('*').eq('family_id', SUPABASE_FAMILY_ID).order('created_at'),
      this.client.from('device_bindings').select('*').eq('family_id', SUPABASE_FAMILY_ID).order('updated_at', { ascending: false })
    ]);
    if (childrenError) throw childrenError;
    if (bindingsError) throw bindingsError;

    const remoteChildren = ((children ?? []) as SupabaseChildRow[]).map(fromSupabaseChild);
    const mergedChildren = mergeChildren(state.children, remoteChildren);
    return {
      ...state,
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
        state.device_binding_records,
        ((bindings ?? []) as SupabaseDeviceBindingRow[]).map(fromSupabaseDeviceBinding)
      ),
      active_child_id: state.active_child_id ?? mergedChildren.find((child) => child.status === 'active')?.id ?? null,
      updated_at: new Date().toISOString()
    };
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
