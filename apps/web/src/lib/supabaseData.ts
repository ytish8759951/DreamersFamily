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
import type { KeyValueStorage } from './storage';
import {
  LocalDataError,
  LocalDataService,
  type LocalDataRepository,
  type CreateChildInput,
  type UpdateChildInput
} from './localData';
import type {
  AnnualParentNote,
  LocalChild,
  LocalDatabaseState,
  LocalDeviceBindingRecord,
  LocalDream,
  LocalDreamFund,
  LocalFamilySettings,
  LocalGrowthRecord,
  LocalMailboxMessage,
  LocalPiggyBankLog,
  LocalPiggyIncome,
  LocalPiggyProduct,
  LocalPiggyProductDisplaySettings,
  LocalPiggyPurchase,
  LocalPiggyShelfOrder,
  LocalRepositoryScope,
  LocalScreenTimeLog,
  LocalScreenTimeRequest,
  LocalScreenTimeSchedule,
  LocalShare,
  LocalShareMedia,
  LocalSpecialDay,
  LocalStarTransaction,
  MemoryPack,
  LocalTask,
  UUID
} from './localTypes';

const SUPABASE_CACHE_KEY = 'little-dreamers-family:supabase-cache:v1';
const SUPABASE_FAMILY_ID = '00000000-0000-4000-8000-000000000001';
const SUPABASE_PARENT_ID = '00000000-0000-4000-8000-000000000002';
const SUPABASE_DEVICE_FALLBACK_ID = '00000000-0000-4000-8000-000000000003';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SYNC_RETRY_DELAYS_MS = [1000, 3000, 8000, 15000, 30000];

type Listener = (state: LocalDatabaseState) => void;

class VolatileSupabaseStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

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
    family_settings?: LocalFamilySettings;
    settings_updated_at?: string;
    memory_packs?: MemoryPack[];
    annual_parent_notes?: AnnualParentNote[];
    memory_updated_at?: string | null;
    sync_error?: string | null;
  } | null;
  created_at?: string;
  updated_at?: string;
}

interface SupabaseTaskRow {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  title: string;
  description: string | null;
  category: LocalTask['category'];
  task_date: string;
  due_at: string | null;
  recurrence_rule: string | null;
  status: LocalTask['status'];
  reward_stars: number;
  reward_screen_minutes: number;
  completion_note: string | null;
  completed_at: string | null;
  reviewed_by: UUID | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_by: UUID;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface SupabaseTaskRecordRow {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  task_id: UUID | null;
  status: string;
  note: string | null;
  payload: { local_task?: LocalTask } | null;
  created_at: string;
}

interface SupabaseStarRow {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  amount: number;
  transaction_type: LocalStarTransaction['transaction_type'];
  reason: string | null;
  task_id: UUID | null;
  share_id: UUID | null;
  dream_id: UUID | null;
  reversal_of_id: UUID | null;
  idempotency_key: string | null;
  created_by: UUID | null;
  created_at: string;
}

interface SupabasePiggyBankRow {
  id?: UUID;
  family_id: UUID;
  child_id: UUID;
  balance: number;
  currency: string;
  updated_at: string;
}

interface SupabasePiggyBankRecordRow {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  amount: number;
  record_type: string;
  note: string | null;
  payload: {
    kind?: 'income' | 'bank_log' | 'shelf_order' | 'display_settings';
    income?: LocalPiggyIncome;
    bank_log?: LocalPiggyBankLog;
    shelf_order?: LocalPiggyShelfOrder;
    display_settings?: LocalPiggyProductDisplaySettings;
  } | null;
  created_at: string;
}

interface SupabaseStoreItemRow {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  name: string;
  price: number;
  status: string;
  payload: { local_product?: LocalPiggyProduct } | null;
  created_at: string;
  updated_at: string;
}

interface SupabasePurchaseRow {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  store_item_id: UUID | null;
  status: LocalPiggyPurchase['status'];
  amount: number;
  payload: { local_purchase?: LocalPiggyPurchase } | null;
  created_at: string;
  updated_at: string;
}

interface SupabaseDreamRow {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  title: string;
  description: string | null;
  cover_path: string | null;
  target_amount: number;
  currency: string;
  status: LocalDream['status'];
  priority: number;
  requested_by_child: boolean;
  approved_by: UUID | null;
  approved_at: string | null;
  target_date: string | null;
  completed_at: string | null;
  created_by: UUID | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface SupabaseDreamFundRow {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  dream_id: UUID;
  amount: number;
  transaction_type: LocalDreamFund['transaction_type'];
  note: string | null;
  source_star_id: UUID | null;
  reversal_of_id: UUID | null;
  idempotency_key: string | null;
  created_by: UUID | null;
  created_at: string;
}

interface SupabaseShareRow {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  title: string | null;
  caption: string | null;
  share_type: LocalShare['share_type'];
  source_type: LocalShare['source_type'];
  status: LocalShare['status'];
  submitted_at: string;
  reviewed_by: UUID | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  published_at: string | null;
  created_by_user_id: UUID | null;
  created_by_device_id: UUID | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface SupabaseShareMediaRow {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  share_id: UUID;
  media_type: LocalShareMedia['media_type'];
  bucket: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  thumbnail_path: string | null;
  sort_order: number;
  created_at: string;
}

interface SupabaseMailboxRow {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  title: string | null;
  message: string | null;
  status: LocalMailboxMessage['status'];
  sent_at: string | null;
  opened_at: string | null;
  created_by: UUID;
  created_at: string;
  updated_at: string;
  sender_user_id: UUID;
  card_type: 'text' | 'photo' | 'audio' | 'video' | 'mixed';
  template_key: string | null;
  media_bucket: string | null;
  media_path: string | null;
  media_mime_type: string | null;
  scheduled_at: string | null;
  archived_at: string | null;
}

interface SupabaseSpecialDayRow {
  id: UUID;
  family_id: UUID;
  child_id: UUID | null;
  event_type: string;
  title: string;
  description: string | null;
  event_date: string;
  is_recurring: boolean;
  recurrence_rule: string | null;
  reminder_enabled: boolean;
  remind_days_before: number;
  cover_path: string | null;
  created_by: UUID;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface SupabaseGrowthRecordRow {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  category_id: UUID | null;
  title: string;
  content: string | null;
  record_type: 'growth' | 'album' | 'special_event' | 'first_time' | 'memory';
  recorded_on: string;
  mood: string | null;
  visibility: 'family' | 'guardians_only';
  source_type: 'parent' | 'child_device' | 'system';
  created_by: UUID | null;
  source_child_device_id: UUID | null;
  created_at: string;
  updated_at: string;
}

interface SupabaseTabletTimeRow {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  entry_type: string;
  minutes: number;
  status: string | null;
  note: string | null;
  payload: {
    kind?: 'screen_time_log' | 'screen_time_request' | 'screen_time_schedule';
    screen_time_log?: LocalScreenTimeLog;
    screen_time_request?: LocalScreenTimeRequest;
    screen_time_schedule?: LocalScreenTimeSchedule;
  } | null;
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
  return isSupabaseModeRequested() && Boolean(getSupabaseConfig());
}

export function isSupabaseModeRequested() {
  return import.meta.env.VITE_DATA_MODE !== 'local';
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
  private cache = new LocalDataService(new MockDatabase(undefined, SUPABASE_CACHE_KEY));
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
    if (!client) this.cache = new LocalDataService(new MockDatabase(new VolatileSupabaseStorage(), SUPABASE_CACHE_KEY));
    if (!client) {
      console.error(
        '[supabase-repository] Supabase mode requested but VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.'
      );
    }
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
      { data: bindings, error: bindingsError },
      taskResult,
      starResult,
      piggyRecordResult,
      storeItemResult,
      purchaseResult,
      dreamResult,
      dreamFundResult,
      shareResult,
      shareMediaResult,
      mailboxResult,
      specialDayResult,
      growthResult,
      tabletTimeResult
    ] = await Promise.all([
      this.client.from('parents').select('*').eq('id', SUPABASE_PARENT_ID).maybeSingle(),
      this.client.from('children').select('*').eq('family_id', SUPABASE_FAMILY_ID).order('created_at'),
      this.client.from('device_bindings').select('*').eq('family_id', SUPABASE_FAMILY_ID).order('updated_at', { ascending: false }),
      Promise.all([
        this.client.from('tasks').select('*').eq('family_id', SUPABASE_FAMILY_ID).order('updated_at', { ascending: false }),
        this.client.from('task_records').select('*').eq('family_id', SUPABASE_FAMILY_ID).order('created_at', { ascending: false })
      ]),
      this.client.from('stars').select('*').eq('family_id', SUPABASE_FAMILY_ID).order('created_at', { ascending: false }),
      this.client.from('piggy_bank_records').select('*').eq('family_id', SUPABASE_FAMILY_ID).order('created_at', { ascending: false }),
      this.client.from('store_items').select('*').eq('family_id', SUPABASE_FAMILY_ID).order('updated_at', { ascending: false }),
      this.client.from('purchases').select('*').eq('family_id', SUPABASE_FAMILY_ID).order('updated_at', { ascending: false }),
      this.client.from('dreams').select('*').eq('family_id', SUPABASE_FAMILY_ID).order('updated_at', { ascending: false }),
      this.client.from('dream_funds').select('*').eq('family_id', SUPABASE_FAMILY_ID).order('created_at', { ascending: false }),
      this.client.from('shares').select('*').eq('family_id', SUPABASE_FAMILY_ID).order('updated_at', { ascending: false }),
      this.client.from('share_media').select('*').eq('family_id', SUPABASE_FAMILY_ID).order('created_at', { ascending: false }),
      this.client.from('encouragement_cards').select('*').eq('family_id', SUPABASE_FAMILY_ID).order('updated_at', { ascending: false }),
      this.client.from('special_days').select('*').eq('family_id', SUPABASE_FAMILY_ID).order('updated_at', { ascending: false }),
      this.client.from('growth_records').select('*').eq('family_id', SUPABASE_FAMILY_ID).order('updated_at', { ascending: false }),
      this.client.from('tablet_time').select('*').eq('family_id', SUPABASE_FAMILY_ID).order('updated_at', { ascending: false })
    ]);
    if (parentError) throw parentError;
    if (childrenError) throw childrenError;
    if (bindingsError) throw bindingsError;
    const [{ data: taskRows, error: tasksError }, { data: taskRecordRows, error: taskRecordsError }] = taskResult;
    if (tasksError) throw tasksError;
    if (taskRecordsError) throw taskRecordsError;
    if (starResult.error) throw starResult.error;
    if (piggyRecordResult.error) throw piggyRecordResult.error;
    if (storeItemResult.error) throw storeItemResult.error;
    if (purchaseResult.error) throw purchaseResult.error;
    if (dreamResult.error) throw dreamResult.error;
    if (dreamFundResult.error) throw dreamFundResult.error;
    if (shareResult.error) throw shareResult.error;
    if (shareMediaResult.error) throw shareMediaResult.error;
    if (mailboxResult.error) throw mailboxResult.error;
    if (specialDayResult.error) throw specialDayResult.error;
    if (growthResult.error) throw growthResult.error;
    if (tabletTimeResult.error) throw tabletTimeResult.error;

    const parentSettings = (parent as SupabaseParentRow | null)?.settings ?? null;
    const parentState = readRepositoryState(parentSettings);
    const remoteChildren = ((children ?? []) as SupabaseChildRow[]).map(fromSupabaseChild);
    const baseState = parentState ?? state;
    const mergedChildren = mergeChildren(baseState.children, remoteChildren);
    const taskRecords = (taskRecordRows ?? []) as SupabaseTaskRecordRow[];
    const remoteTasks = mergeTasks(
      baseState.tasks,
      ((taskRows ?? []) as SupabaseTaskRow[]).map(fromSupabaseTask),
      taskRecords.map(fromSupabaseTaskRecord).filter((task): task is LocalTask => Boolean(task))
    );
    const remoteStars = mergeStars(baseState.stars, ((starResult.data ?? []) as SupabaseStarRow[]).map(fromSupabaseStar));
    const piggyState = fromSupabasePiggyRows({
      baseState,
      records: (piggyRecordResult.data ?? []) as SupabasePiggyBankRecordRow[],
      products: (storeItemResult.data ?? []) as SupabaseStoreItemRow[],
      purchases: (purchaseResult.data ?? []) as SupabasePurchaseRow[]
    });
    const remoteDreams = mergeById(
      baseState.dreams,
      ((dreamResult.data ?? []) as SupabaseDreamRow[]).map(fromSupabaseDream),
      (dream) => dream.updated_at
    ).sort((first, second) => second.created_at.localeCompare(first.created_at));
    const remoteDreamFunds = mergeById(
      baseState.dream_funds,
      ((dreamFundResult.data ?? []) as SupabaseDreamFundRow[]).map(fromSupabaseDreamFund),
      (fund) => fund.created_at
    ).sort((first, second) => second.created_at.localeCompare(first.created_at));
    const remoteShares = mergeById(
      baseState.shares,
      ((shareResult.data ?? []) as SupabaseShareRow[]).map(fromSupabaseShare),
      (share) => share.updated_at
    ).sort((first, second) => second.created_at.localeCompare(first.created_at));
    const remoteShareMedia = mergeById(
      baseState.share_media,
      ((shareMediaResult.data ?? []) as SupabaseShareMediaRow[]).map(fromSupabaseShareMedia),
      (media) => media.created_at
    ).sort((first, second) => first.sort_order - second.sort_order || first.created_at.localeCompare(second.created_at));
    const remoteMailbox = mergeById(
      baseState.encouragement_cards,
      ((mailboxResult.data ?? []) as SupabaseMailboxRow[]).map(fromSupabaseMailbox),
      (message) => message.updated_at
    ).sort((first, second) => second.created_at.localeCompare(first.created_at));
    const remoteSpecialDays = mergeById(
      baseState.special_days,
      ((specialDayResult.data ?? []) as SupabaseSpecialDayRow[]).map(fromSupabaseSpecialDay),
      (day) => day.updated_at
    ).sort((first, second) => first.date.localeCompare(second.date));
    const remoteGrowthRecords = mergeById(
      baseState.growth_records,
      ((growthResult.data ?? []) as SupabaseGrowthRecordRow[]).map((row) =>
        fromSupabaseGrowthRecord(row, baseState.growth_records.find((record) => record.id === row.id))
      ),
      (record) => record.updated_at
    ).sort((first, second) => second.date.localeCompare(first.date));
    const tabletTimeState = fromSupabaseTabletTimeRows({
      baseState,
      records: (tabletTimeResult.data ?? []) as SupabaseTabletTimeRow[]
    });
    const remoteFamilySettings = mergeFamilySettings(baseState.family_settings, parentSettings?.family_settings);
    const remoteMemoryPacks = mergeById(
      baseState.memory_packs,
      parentSettings?.memory_packs ?? [],
      (pack) => pack.updatedAt
    ).sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
    const remoteAnnualParentNotes = mergeAnnualParentNotes(
      baseState.annual_parent_notes,
      parentSettings?.annual_parent_notes ?? []
    );
    const updatedAt = maxIsoDate([
      parentState?.updated_at,
      (parent as SupabaseParentRow | null)?.settings?.repository_updated_at,
      parentSettings?.settings_updated_at,
      parentSettings?.memory_updated_at,
      ...mergedChildren.map((child) => child.updated_at),
      ...remoteTasks.map((task) => task.updated_at),
      ...remoteStars.map((star) => star.created_at),
      ...remoteDreams.map((dream) => dream.updated_at),
      ...remoteDreamFunds.map((fund) => fund.created_at),
      ...remoteShares.map((share) => share.updated_at),
      ...remoteShareMedia.map((media) => media.created_at),
      ...remoteMailbox.map((message) => message.updated_at),
      ...remoteSpecialDays.map((day) => day.updated_at),
      ...remoteGrowthRecords.map((record) => record.updated_at),
      ...tabletTimeState.screen_time_logs.map((log) => log.created_at),
      ...tabletTimeState.screen_time_requests.map((request) => request.updated_at),
      ...tabletTimeState.screen_time_schedules.map((schedule) => schedule.updatedAt),
      remoteFamilySettings.updated_at,
      ...remoteMemoryPacks.map((pack) => pack.updatedAt),
      ...remoteAnnualParentNotes.map((note) => note.updatedAt),
      ...piggyState.piggy_incomes.map((income) => income.created_at),
      ...piggyState.piggy_bank_logs.map((log) => log.created_at),
      ...piggyState.piggy_products.map((product) => product.updated_at),
      ...piggyState.piggy_shelf_orders.map((order) => order.updated_at),
      ...piggyState.piggyProductDisplaySettings.map((settings) => settings.updated_at),
      ...piggyState.piggy_purchases.map((purchase) => purchase.purchased_at ?? purchase.cancelled_at ?? purchase.requested_at),
      ...((bindings ?? []) as SupabaseDeviceBindingRow[]).map((binding) => binding.updated_at)
    ]) ?? new Date().toISOString();
    this.lastRemoteUpdatedAt = updatedAt;
    return {
      ...baseState,
      family_id: SUPABASE_FAMILY_ID,
      parent_id: SUPABASE_PARENT_ID,
      current_user_id: SUPABASE_PARENT_ID,
      children: mergedChildren,
      tasks: remoteTasks,
      stars: remoteStars,
      dreams: remoteDreams,
      dream_funds: remoteDreamFunds,
      shares: remoteShares,
      share_media: remoteShareMedia,
      encouragement_cards: remoteMailbox,
      special_days: remoteSpecialDays,
      family_settings: remoteFamilySettings,
      screen_time_schedules: tabletTimeState.screen_time_schedules,
      screen_time_requests: tabletTimeState.screen_time_requests,
      screen_time_logs: tabletTimeState.screen_time_logs,
      growth_records: remoteGrowthRecords,
      piggy_incomes: piggyState.piggy_incomes,
      piggy_bank_logs: piggyState.piggy_bank_logs,
      piggy_products: piggyState.piggy_products,
      piggy_shelf_orders: piggyState.piggy_shelf_orders,
      piggyProductDisplaySettings: piggyState.piggyProductDisplaySettings,
      piggy_purchases: piggyState.piggy_purchases,
      annual_parent_notes: remoteAnnualParentNotes,
      memory_packs: remoteMemoryPacks,
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
    await this.pushDreamShareMailboxSpecialTables(state);
    await this.pushTaskStarPiggyTables(state);
    await this.pushDreamFunds(state);
    await this.pushGrowthTabletTables(state);
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
        family_settings: state.family_settings,
        settings_updated_at: state.family_settings.updated_at,
        memory_packs: state.memory_packs,
        annual_parent_notes: state.annual_parent_notes,
        memory_updated_at: maxIsoDate([
          ...state.memory_packs.map((pack) => pack.updatedAt),
          ...state.annual_parent_notes.map((note) => note.updatedAt)
        ]),
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

  private async pushTaskStarPiggyTables(state: LocalDatabaseState) {
    if (!this.client) return;

    const tasks = state.tasks.map(toSupabaseTask);
    if (tasks.length) {
      const { error } = await this.client.from('tasks').upsert(tasks, { onConflict: 'id' });
      if (error) throw error;
      const taskRecords = state.tasks.map(toSupabaseTaskRecord);
      const { error: recordsError } = await this.client.from('task_records').upsert(taskRecords, { onConflict: 'id' });
      if (recordsError) throw recordsError;
    }

    const taskIds = new Set(state.tasks.map((task) => task.id));
    const shareIds = new Set(state.shares.map((share) => share.id));
    const dreamIds = new Set(state.dreams.map((dream) => dream.id));
    const stars = state.stars
      .filter(
        (star) =>
          (!star.task_id || taskIds.has(star.task_id)) &&
          (!star.share_id || shareIds.has(star.share_id)) &&
          (!star.dream_id || dreamIds.has(star.dream_id))
      )
      .map(toSupabaseStar);
    if (stars.length) {
      const { error } = await this.client.from('stars').upsert(stars, { onConflict: 'id' });
      if (error) throw error;
    }

    await this.pushPiggyTables(state);
  }

  private async pushDreamShareMailboxSpecialTables(state: LocalDatabaseState) {
    if (!this.client) return;

    await deleteMissingRows(this.client, 'dream_funds', state.dream_funds.map((fund) => fund.id));
    await deleteMissingRows(this.client, 'dreams', state.dreams.map((dream) => dream.id));
    await deleteMissingRows(this.client, 'share_media', state.share_media.map((media) => media.id));

    const dreams = state.dreams.map(toSupabaseDream);
    if (dreams.length) {
      const { error } = await this.client.from('dreams').upsert(dreams, { onConflict: 'id' });
      if (error) throw error;
    }

    const shares = state.shares.map(toSupabaseShare);
    if (shares.length) {
      const { error } = await this.client.from('shares').upsert(shares, { onConflict: 'id' });
      if (error) throw error;
    }

    const shareMedia = state.share_media
      .filter((media) => state.shares.some((share) => share.id === media.share_id))
      .map(toSupabaseShareMedia);
    if (shareMedia.length) {
      const { error } = await this.client.from('share_media').upsert(shareMedia, { onConflict: 'id' });
      if (error) throw error;
    }

    const mailbox = state.encouragement_cards.map(toSupabaseMailbox);
    if (mailbox.length) {
      const { error } = await this.client.from('encouragement_cards').upsert(mailbox, { onConflict: 'id' });
      if (error) throw error;
    }

    const specialDays = state.special_days.map(toSupabaseSpecialDay);
    if (specialDays.length) {
      const { error } = await this.client.from('special_days').upsert(specialDays, { onConflict: 'id' });
      if (error) throw error;
    }
  }

  private async pushDreamFunds(state: LocalDatabaseState) {
    if (!this.client) return;
    const dreamIds = new Set(state.dreams.map((dream) => dream.id));
    const starIds = new Set(state.stars.map((star) => star.id));
    const dreamFunds = state.dream_funds
      .filter((fund) => dreamIds.has(fund.dream_id) && (!fund.source_star_id || starIds.has(fund.source_star_id)))
      .map(toSupabaseDreamFund);
    if (dreamFunds.length) {
      const { error } = await this.client.from('dream_funds').upsert(dreamFunds, { onConflict: 'id' });
      if (error) throw error;
    }
  }

  private async pushGrowthTabletTables(state: LocalDatabaseState) {
    if (!this.client) return;

    await deleteMissingRows(this.client, 'growth_records', state.growth_records.map((record) => record.id));
    const growthRecords = state.growth_records.map(toSupabaseGrowthRecord);
    if (growthRecords.length) {
      const { error } = await this.client.from('growth_records').upsert(growthRecords, { onConflict: 'id' });
      if (error) throw error;
    }

    const tabletRows = [
      ...state.screen_time_logs.map(toSupabaseTabletTimeLog),
      ...state.screen_time_requests.map(toSupabaseTabletTimeRequest),
      ...state.screen_time_schedules.map(toSupabaseTabletTimeSchedule)
    ];
    await deleteMissingRows(this.client, 'tablet_time', tabletRows.map((row) => row.id));
    if (tabletRows.length) {
      const { error } = await this.client.from('tablet_time').upsert(tabletRows, { onConflict: 'id' });
      if (error) throw error;
    }
  }

  private async pushPiggyTables(state: LocalDatabaseState) {
    if (!this.client) return;

    const piggyBanks = state.children.map((child): SupabasePiggyBankRow => ({
      family_id: SUPABASE_FAMILY_ID,
      child_id: child.id,
      balance: getPiggySavingsFromState(state, child.id),
      currency: 'TWD',
      updated_at: state.updated_at
    }));
    if (piggyBanks.length) {
      const { error } = await this.client.from('piggy_banks').upsert(piggyBanks, { onConflict: 'family_id,child_id' });
      if (error) throw error;
    }

    const piggyRecords = [
      ...state.piggy_incomes.map(toSupabasePiggyIncomeRecord),
      ...state.piggy_bank_logs.map(toSupabasePiggyBankLogRecord),
      ...state.piggy_shelf_orders.map(toSupabasePiggyShelfOrderRecord),
      ...state.piggyProductDisplaySettings.map(toSupabasePiggyDisplaySettingsRecord)
    ];
    if (piggyRecords.length) {
      const { error } = await this.client.from('piggy_bank_records').upsert(piggyRecords, { onConflict: 'id' });
      if (error) throw error;
    }

    const products = state.piggy_products.map(toSupabaseStoreItem);
    if (products.length) {
      const { error } = await this.client.from('store_items').upsert(products, { onConflict: 'id' });
      if (error) throw error;
    }

    const productIds = new Set(state.piggy_products.map((product) => product.id));
    const purchases = state.piggy_purchases
      .filter((purchase) => productIds.has(purchase.product_id))
      .map(toSupabasePurchase);
    if (purchases.length) {
      const { error } = await this.client.from('purchases').upsert(purchases, { onConflict: 'id' });
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `family_id=eq.${SUPABASE_FAMILY_ID}` },
        () => this.hydrateFromSupabase()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stars', filter: `family_id=eq.${SUPABASE_FAMILY_ID}` },
        () => this.hydrateFromSupabase()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'piggy_bank_records', filter: `family_id=eq.${SUPABASE_FAMILY_ID}` },
        () => this.hydrateFromSupabase()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'store_items', filter: `family_id=eq.${SUPABASE_FAMILY_ID}` },
        () => this.hydrateFromSupabase()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchases', filter: `family_id=eq.${SUPABASE_FAMILY_ID}` },
        () => this.hydrateFromSupabase()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dreams', filter: `family_id=eq.${SUPABASE_FAMILY_ID}` },
        () => this.hydrateFromSupabase()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dream_funds', filter: `family_id=eq.${SUPABASE_FAMILY_ID}` },
        () => this.hydrateFromSupabase()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shares', filter: `family_id=eq.${SUPABASE_FAMILY_ID}` },
        () => this.hydrateFromSupabase()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'share_media', filter: `family_id=eq.${SUPABASE_FAMILY_ID}` },
        () => this.hydrateFromSupabase()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'encouragement_cards', filter: `family_id=eq.${SUPABASE_FAMILY_ID}` },
        () => this.hydrateFromSupabase()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'special_days', filter: `family_id=eq.${SUPABASE_FAMILY_ID}` },
        () => this.hydrateFromSupabase()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'growth_records', filter: `family_id=eq.${SUPABASE_FAMILY_ID}` },
        () => this.hydrateFromSupabase()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tablet_time', filter: `family_id=eq.${SUPABASE_FAMILY_ID}` },
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
    (remote.active_child_id && remote.children.some((child) => child.id === remote.active_child_id)
      ? remote.active_child_id
      : current.active_child_id && remote.children.some((child) => child.id === current.active_child_id)
        ? current.active_child_id
        : remote.children.find((child) => child.status === 'active')?.id ?? null);

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

function toSupabaseTask(task: LocalTask): SupabaseTaskRow {
  return {
    id: task.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: task.child_id,
    title: task.title,
    description: task.description,
    category: task.category,
    task_date: task.task_date,
    due_at: task.due_at,
    recurrence_rule: task.recurrence_rule,
    status: task.status,
    reward_stars: task.reward_stars,
    reward_screen_minutes: task.reward_screen_minutes,
    completion_note: task.completion_note,
    completed_at: task.completed_at,
    reviewed_by: task.reviewed_by ? SUPABASE_PARENT_ID : null,
    reviewed_at: task.reviewed_at,
    rejection_reason: task.rejection_reason,
    created_by: SUPABASE_PARENT_ID,
    created_at: task.created_at,
    updated_at: task.updated_at,
    archived_at: task.archived_at
  };
}

function fromSupabaseTask(row: SupabaseTaskRow): LocalTask {
  return {
    id: row.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: row.child_id,
    title: row.title,
    description: row.description,
    task_image_media_id: null,
    thumbnail_media_id: null,
    category: row.category,
    task_date: row.task_date,
    due_at: row.due_at,
    recurrence_rule: row.recurrence_rule,
    status: row.status,
    reward_stars: row.reward_stars,
    reward_screen_minutes: row.reward_screen_minutes,
    completion_note: row.completion_note,
    completed_at: row.completed_at,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    rejection_reason: row.rejection_reason,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at
  };
}

function toSupabaseTaskRecord(task: LocalTask): SupabaseTaskRecordRow {
  return {
    id: task.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: task.child_id,
    task_id: task.id,
    status: task.status,
    note: task.completion_note,
    payload: { local_task: task },
    created_at: task.updated_at
  };
}

function fromSupabaseTaskRecord(row: SupabaseTaskRecordRow): LocalTask | null {
  const task = row.payload?.local_task;
  if (!task || task.id !== row.task_id) return null;
  return { ...task, family_id: SUPABASE_FAMILY_ID };
}

function mergeTasks(localTasks: LocalTask[], tableTasks: LocalTask[], payloadTasks: LocalTask[]) {
  const byId = new Map<string, LocalTask>();
  [...localTasks, ...tableTasks, ...payloadTasks].forEach((task) => {
    const normalized = { ...task, family_id: SUPABASE_FAMILY_ID };
    const existing = byId.get(task.id);
    if (!existing || normalized.updated_at >= existing.updated_at) byId.set(task.id, normalized);
  });
  return [...byId.values()].sort((first, second) => second.created_at.localeCompare(first.created_at));
}

function toSupabaseStar(star: LocalStarTransaction): SupabaseStarRow {
  return {
    id: star.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: star.child_id,
    amount: star.amount,
    transaction_type: star.transaction_type,
    reason: star.reason,
    task_id: star.task_id,
    share_id: star.share_id,
    dream_id: star.dream_id,
    reversal_of_id: star.reversal_of_id,
    idempotency_key: star.idempotency_key,
    created_by: star.created_by ? SUPABASE_PARENT_ID : null,
    created_at: star.created_at
  };
}

function toSupabaseDream(dream: LocalDream): SupabaseDreamRow {
  return {
    id: dream.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: dream.child_id,
    title: dream.title,
    description: dream.description,
    cover_path: dream.cover_path ?? dream.coverUrl ?? dream.imageUrl ?? null,
    target_amount: dream.target_amount,
    currency: dream.currency || 'TWD',
    status: dream.status,
    priority: dream.priority,
    requested_by_child: dream.requested_by_child,
    approved_by: dream.approved_by ? SUPABASE_PARENT_ID : null,
    approved_at: dream.approved_at,
    target_date: dream.target_date,
    completed_at: dream.completed_at,
    created_by: dream.created_by ? SUPABASE_PARENT_ID : null,
    created_at: dream.created_at,
    updated_at: dream.updated_at,
    archived_at: dream.archived_at
  };
}

function fromSupabaseDream(row: SupabaseDreamRow): LocalDream {
  return {
    id: row.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: row.child_id,
    title: row.title,
    description: row.description,
    cover_path: row.cover_path,
    coverUrl: row.cover_path,
    imageUrl: row.cover_path,
    cover_media_id: null,
    coverMediaId: null,
    cover_mime_type: null,
    cover_file_name: null,
    target_amount: Number(row.target_amount),
    currency: row.currency,
    status: row.status,
    priority: row.priority,
    requested_by_child: row.requested_by_child,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    target_date: row.target_date,
    completed_at: row.completed_at,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at
  };
}

function toSupabaseDreamFund(fund: LocalDreamFund): SupabaseDreamFundRow {
  return {
    id: fund.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: fund.child_id,
    dream_id: fund.dream_id,
    amount: fund.amount,
    transaction_type: fund.transaction_type,
    note: fund.note,
    source_star_id: fund.source_star_id,
    reversal_of_id: fund.reversal_of_id,
    idempotency_key: fund.idempotency_key,
    created_by: fund.created_by ? SUPABASE_PARENT_ID : null,
    created_at: fund.created_at
  };
}

function fromSupabaseDreamFund(row: SupabaseDreamFundRow): LocalDreamFund {
  return {
    id: row.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: row.child_id,
    dream_id: row.dream_id,
    amount: Number(row.amount),
    transaction_type: row.transaction_type,
    note: row.note,
    source_star_id: row.source_star_id,
    reversal_of_id: row.reversal_of_id,
    idempotency_key: row.idempotency_key,
    created_by: row.created_by,
    created_at: row.created_at
  };
}

function toSupabaseShare(share: LocalShare): SupabaseShareRow {
  const sourceType: LocalShare['source_type'] = share.source_type === 'parent' ? 'parent' : 'system';
  const reviewedAt =
    share.status === 'approved' || share.status === 'rejected'
      ? share.reviewed_at ?? share.updated_at
      : share.reviewed_at;
  return {
    id: share.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: share.child_id,
    title: share.title,
    caption: share.caption,
    share_type: share.share_type,
    source_type: sourceType,
    status: share.status,
    submitted_at: share.submitted_at,
    reviewed_by: reviewedAt ? SUPABASE_PARENT_ID : null,
    reviewed_at: reviewedAt,
    rejection_reason: share.rejection_reason,
    published_at: share.status === 'approved' ? share.published_at ?? share.updated_at : share.published_at,
    created_by_user_id: sourceType === 'parent' ? SUPABASE_PARENT_ID : null,
    created_by_device_id: null,
    created_at: share.created_at,
    updated_at: share.updated_at,
    deleted_at: share.deleted_at
  };
}

function fromSupabaseShare(row: SupabaseShareRow): LocalShare {
  return {
    id: row.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: row.child_id,
    title: row.title,
    caption: row.caption,
    share_type: row.share_type,
    type: row.share_type,
    mediaUrl: null,
    source_type: row.source_type,
    status: row.status,
    submitted_at: row.submitted_at,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    rejection_reason: row.rejection_reason,
    published_at: row.published_at,
    created_by_user_id: row.created_by_user_id,
    created_by_device_id: row.created_by_device_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at
  };
}

function toSupabaseShareMedia(media: LocalShareMedia): SupabaseShareMediaRow {
  return {
    id: media.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: media.child_id,
    share_id: media.share_id,
    media_type: media.media_type,
    bucket: media.bucket,
    storage_path: media.storage_path,
    mime_type: media.mime_type,
    file_size_bytes: media.file_size_bytes,
    width: media.width,
    height: media.height,
    duration_seconds: media.duration_seconds,
    thumbnail_path: media.thumbnail_path,
    sort_order: media.sort_order,
    created_at: media.created_at
  };
}

function fromSupabaseShareMedia(row: SupabaseShareMediaRow): LocalShareMedia {
  return {
    id: row.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: row.child_id,
    share_id: row.share_id,
    media_type: row.media_type,
    bucket: 'local-media',
    storage_path: row.storage_path,
    mime_type: row.mime_type,
    file_size_bytes: Number(row.file_size_bytes),
    width: row.width,
    height: row.height,
    duration_seconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    thumbnail_path: row.thumbnail_path,
    sort_order: row.sort_order,
    created_at: row.created_at,
    local_data_url: null
  };
}

function toSupabaseMailbox(message: LocalMailboxMessage): SupabaseMailboxRow {
  return {
    id: message.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: message.child_id,
    title: message.title,
    message: message.message,
    status: message.status,
    sent_at: message.status === 'sent' || message.status === 'opened' ? message.sent_at ?? message.created_at : message.sent_at,
    opened_at: message.status === 'opened' ? message.opened_at ?? message.updated_at : message.opened_at,
    created_by: SUPABASE_PARENT_ID,
    created_at: message.created_at,
    updated_at: message.updated_at,
    sender_user_id: SUPABASE_PARENT_ID,
    card_type: toSupabaseMailboxCardType(message.card_type),
    template_key: message.template_key,
    media_bucket: message.media_bucket,
    media_path: message.media_path,
    media_mime_type: message.media_mime_type,
    scheduled_at: message.scheduled_at,
    archived_at: message.archived_at
  };
}

function fromSupabaseMailbox(row: SupabaseMailboxRow): LocalMailboxMessage {
  return {
    id: row.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: row.child_id,
    sender_user_id: row.sender_user_id,
    sender_role: 'parent',
    title: row.title,
    message: row.message,
    card_type: fromSupabaseMailboxCardType(row.card_type),
    template_key: row.template_key,
    media_bucket: row.media_bucket === 'local-media' ? 'local-media' : null,
    media_path: row.media_path,
    media_id: null,
    media_mime_type: row.media_mime_type,
    local_data_url: null,
    status: row.status,
    scheduled_at: row.scheduled_at,
    sent_at: row.sent_at,
    opened_at: row.opened_at,
    archived_at: row.archived_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function toSupabaseSpecialDay(day: LocalSpecialDay): SupabaseSpecialDayRow {
  return {
    id: day.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: day.child_id,
    event_type: toSupabaseSpecialDayType(day.type),
    title: day.title,
    description: day.description,
    event_date: day.date,
    is_recurring: day.type === 'birthday' || day.source === 'child_birthday',
    recurrence_rule: day.type === 'birthday' || day.source === 'child_birthday' ? 'FREQ=YEARLY' : null,
    reminder_enabled: true,
    remind_days_before: 7,
    cover_path: day.image_media_id ?? null,
    created_by: SUPABASE_PARENT_ID,
    created_at: day.created_at,
    updated_at: day.updated_at,
    archived_at: day.deleted_at
  };
}

function fromSupabaseSpecialDay(row: SupabaseSpecialDayRow): LocalSpecialDay {
  const type = fromSupabaseSpecialDayType(row.event_type);
  return {
    id: row.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: row.child_id ?? '',
    childId: row.child_id ?? '',
    title: row.title,
    date: row.event_date,
    type,
    description: row.description,
    image_media_id: row.cover_path,
    image_data_url: null,
    created_by: row.created_by,
    createdBy: 'parent',
    source: type === 'birthday' ? 'child_birthday' : 'manual',
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.archived_at
  };
}

function toSupabaseMailboxCardType(type: LocalMailboxMessage['card_type']) {
  if (type === 'card') return 'text';
  if (type === 'image') return 'photo';
  return type;
}

function fromSupabaseMailboxCardType(type: SupabaseMailboxRow['card_type']): LocalMailboxMessage['card_type'] {
  return type === 'photo' ? 'image' : type;
}

function toSupabaseSpecialDayType(type: LocalSpecialDay['type']) {
  if (type === 'birthday') return 'birthday';
  if (type === 'holiday') return 'holiday';
  return 'custom';
}

function fromSupabaseSpecialDayType(type: string): LocalSpecialDay['type'] {
  if (type === 'birthday') return 'birthday';
  if (type === 'holiday') return 'holiday';
  return 'other';
}

function toSupabaseGrowthRecord(record: LocalGrowthRecord): SupabaseGrowthRecordRow {
  return {
    id: record.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: record.child_id,
    category_id: null,
    title: `Growth record ${record.date}`,
    content: JSON.stringify({
      note: record.note,
      height_cm: record.height_cm,
      weight_kg: record.weight_kg,
      growth_photo_media_ids: record.growth_photo_media_ids,
      reading_count: record.reading_count
    }),
    record_type: 'growth',
    recorded_on: record.date,
    mood: null,
    visibility: 'family',
    source_type: 'parent',
    created_by: SUPABASE_PARENT_ID,
    source_child_device_id: null,
    created_at: record.created_at,
    updated_at: record.updated_at
  };
}

function fromSupabaseGrowthRecord(row: SupabaseGrowthRecordRow, fallback?: LocalGrowthRecord): LocalGrowthRecord {
  const content = parseGrowthContent(row.content);
  return {
    id: row.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: row.child_id,
    date: row.recorded_on,
    height_cm: content.height_cm ?? fallback?.height_cm ?? 0,
    weight_kg: content.weight_kg ?? fallback?.weight_kg ?? 0,
    growth_photo_media_ids: content.growth_photo_media_ids ?? fallback?.growth_photo_media_ids ?? [],
    reading_count: content.reading_count ?? fallback?.reading_count ?? 0,
    note: content.note ?? fallback?.note ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function parseGrowthContent(content: string | null): Partial<LocalGrowthRecord> {
  if (!content) return {};
  try {
    const parsed = JSON.parse(content) as Partial<LocalGrowthRecord>;
    return parsed && typeof parsed === 'object' ? parsed : { note: content };
  } catch {
    return { note: content };
  }
}

function toSupabaseTabletTimeLog(log: LocalScreenTimeLog): SupabaseTabletTimeRow {
  return {
    id: log.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: log.child_id,
    entry_type: log.entry_type,
    minutes: log.minutes_delta,
    status: log.type ?? log.entry_type,
    note: log.reason ?? log.note ?? null,
    payload: { kind: 'screen_time_log', screen_time_log: log },
    created_at: log.created_at,
    updated_at: log.created_at
  };
}

function toSupabaseTabletTimeRequest(request: LocalScreenTimeRequest): SupabaseTabletTimeRow {
  return {
    id: request.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: request.child_id,
    entry_type: 'request',
    minutes: request.requested_minutes,
    status: request.status,
    note: request.note,
    payload: { kind: 'screen_time_request', screen_time_request: request },
    created_at: request.created_at,
    updated_at: request.updated_at
  };
}

function toSupabaseTabletTimeSchedule(schedule: LocalScreenTimeSchedule): SupabaseTabletTimeRow {
  return {
    id: schedule.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: schedule.child_id,
    entry_type: 'schedule',
    minutes: schedule.plannedMinutes,
    status: schedule.source ?? 'manual',
    note: schedule.date,
    payload: { kind: 'screen_time_schedule', screen_time_schedule: schedule },
    created_at: schedule.createdAt,
    updated_at: schedule.updatedAt
  };
}

function fromSupabaseTabletTimeRows(input: {
  baseState: LocalDatabaseState;
  records: SupabaseTabletTimeRow[];
}) {
  const logs = input.records
    .map((row) => row.payload?.screen_time_log)
    .filter((item): item is LocalScreenTimeLog => Boolean(item))
    .map((item) => ({ ...item, family_id: SUPABASE_FAMILY_ID }));
  const requests = input.records
    .map((row) => row.payload?.screen_time_request)
    .filter((item): item is LocalScreenTimeRequest => Boolean(item))
    .map((item) => ({ ...item, family_id: SUPABASE_FAMILY_ID }));
  const schedules = input.records
    .map((row) => row.payload?.screen_time_schedule)
    .filter((item): item is LocalScreenTimeSchedule => Boolean(item))
    .map((item) => ({ ...item, family_id: SUPABASE_FAMILY_ID }));

  return {
    screen_time_logs: mergeById(input.baseState.screen_time_logs, logs, (item) => item.created_at).sort((first, second) =>
      second.created_at.localeCompare(first.created_at)
    ),
    screen_time_requests: mergeById(input.baseState.screen_time_requests, requests, (item) => item.updated_at).sort(
      (first, second) => second.created_at.localeCompare(first.created_at)
    ),
    screen_time_schedules: mergeById(input.baseState.screen_time_schedules, schedules, (item) => item.updatedAt).sort(
      (first, second) => first.date.localeCompare(second.date)
    )
  };
}

function mergeFamilySettings(
  localSettings: LocalFamilySettings,
  remoteSettings: LocalFamilySettings | null | undefined
): LocalFamilySettings {
  if (!remoteSettings) return localSettings;
  return remoteSettings.updated_at > localSettings.updated_at ? remoteSettings : localSettings;
}

function mergeAnnualParentNotes(localNotes: AnnualParentNote[], remoteNotes: AnnualParentNote[]) {
  const byScope = new Map<string, AnnualParentNote>();
  [...localNotes, ...remoteNotes].forEach((note) => {
    const key = `${note.childId}:${note.year}`;
    const existing = byScope.get(key);
    if (!existing || note.updatedAt > existing.updatedAt) byScope.set(key, note);
  });
  return [...byScope.values()].sort((first, second) => first.year - second.year || first.childId.localeCompare(second.childId));
}

function fromSupabaseStar(row: SupabaseStarRow): LocalStarTransaction {
  return {
    id: row.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: row.child_id,
    type: row.amount >= 0 ? 'earned' : 'spent',
    amount: row.amount,
    transaction_type: row.transaction_type,
    reason: row.reason,
    sourceType: row.task_id ? 'task' : row.share_id ? 'share' : row.dream_id ? 'dream' : null,
    sourceId: row.task_id ?? row.share_id ?? row.dream_id,
    task_id: row.task_id,
    share_id: row.share_id,
    dream_id: row.dream_id,
    reversal_of_id: row.reversal_of_id,
    idempotency_key: row.idempotency_key,
    created_by: row.created_by,
    created_at: row.created_at
  };
}

function mergeStars(localStars: LocalStarTransaction[], remoteStars: LocalStarTransaction[]) {
  const byId = new Map<string, LocalStarTransaction>();
  [...localStars, ...remoteStars].forEach((star) => {
    const normalized = { ...star, family_id: SUPABASE_FAMILY_ID };
    const existing = byId.get(star.id);
    if (!existing || normalized.created_at >= existing.created_at) byId.set(star.id, normalized);
  });
  return [...byId.values()].sort((first, second) => second.created_at.localeCompare(first.created_at));
}

function toSupabasePiggyIncomeRecord(income: LocalPiggyIncome): SupabasePiggyBankRecordRow {
  return {
    id: income.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: income.child_id,
    amount: income.amount,
    record_type: 'income',
    note: income.source,
    payload: { kind: 'income', income },
    created_at: income.created_at
  };
}

function toSupabasePiggyBankLogRecord(log: LocalPiggyBankLog): SupabasePiggyBankRecordRow {
  return {
    id: log.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: log.child_id,
    amount: log.amount,
    record_type: log.type,
    note: log.note,
    payload: { kind: 'bank_log', bank_log: log },
    created_at: log.created_at
  };
}

function toSupabasePiggyShelfOrderRecord(order: LocalPiggyShelfOrder): SupabasePiggyBankRecordRow {
  return {
    id: order.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: order.child_id,
    amount: 0,
    record_type: 'shelf_order',
    note: null,
    payload: { kind: 'shelf_order', shelf_order: order },
    created_at: order.updated_at
  };
}

function toSupabasePiggyDisplaySettingsRecord(settings: LocalPiggyProductDisplaySettings): SupabasePiggyBankRecordRow {
  return {
    id: settings.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: settings.child_id,
    amount: 0,
    record_type: 'display_settings',
    note: null,
    payload: { kind: 'display_settings', display_settings: settings },
    created_at: settings.updated_at
  };
}

function toSupabaseStoreItem(product: LocalPiggyProduct): SupabaseStoreItemRow {
  return {
    id: product.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: product.child_id,
    name: product.name || '未命名商品',
    price: product.price,
    status: product.deleted_at ? 'deleted' : product.shelf_status,
    payload: { local_product: product },
    created_at: product.created_at,
    updated_at: product.updated_at
  };
}

function toSupabasePurchase(purchase: LocalPiggyPurchase): SupabasePurchaseRow {
  return {
    id: purchase.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: purchase.child_id,
    store_item_id: purchase.product_id,
    status: purchase.status,
    amount: purchase.amount,
    payload: { local_purchase: purchase },
    created_at: purchase.requested_at,
    updated_at: purchase.purchased_at ?? purchase.cancelled_at ?? purchase.requested_at
  };
}

function fromSupabasePiggyRows(input: {
  baseState: LocalDatabaseState;
  records: SupabasePiggyBankRecordRow[];
  products: SupabaseStoreItemRow[];
  purchases: SupabasePurchaseRow[];
}) {
  const incomes = input.records
    .map((row) => row.payload?.income)
    .filter((item): item is LocalPiggyIncome => Boolean(item))
    .map((item) => ({ ...item, family_id: SUPABASE_FAMILY_ID }));
  const bankLogs = input.records
    .map((row) => row.payload?.bank_log)
    .filter((item): item is LocalPiggyBankLog => Boolean(item))
    .map((item) => ({ ...item, family_id: SUPABASE_FAMILY_ID }));
  const shelfOrders = input.records
    .map((row) => row.payload?.shelf_order)
    .filter((item): item is LocalPiggyShelfOrder => Boolean(item))
    .map((item) => ({ ...item, family_id: SUPABASE_FAMILY_ID }));
  const displaySettings = input.records
    .map((row) => row.payload?.display_settings)
    .filter((item): item is LocalPiggyProductDisplaySettings => Boolean(item))
    .map((item) => ({ ...item, family_id: SUPABASE_FAMILY_ID }));
  const products = input.products
    .map((row) => row.payload?.local_product ?? fromSupabaseStoreItem(row))
    .map((item) => ({ ...item, family_id: SUPABASE_FAMILY_ID }));
  const purchases = input.purchases
    .map((row) => row.payload?.local_purchase ?? fromSupabasePurchase(row))
    .map((item) => ({ ...item, family_id: SUPABASE_FAMILY_ID }));

  return {
    piggy_incomes: mergeById(input.baseState.piggy_incomes, incomes, (item) => item.created_at),
    piggy_bank_logs: mergeById(input.baseState.piggy_bank_logs, bankLogs, (item) => item.created_at),
    piggy_products: mergeById(input.baseState.piggy_products, products, (item) => item.updated_at),
    piggy_shelf_orders: mergeById(input.baseState.piggy_shelf_orders, shelfOrders, (item) => item.updated_at),
    piggyProductDisplaySettings: mergeById(
      input.baseState.piggyProductDisplaySettings,
      displaySettings,
      (item) => item.updated_at
    ),
    piggy_purchases: mergeById(
      input.baseState.piggy_purchases,
      purchases,
      (item) => item.purchased_at ?? item.cancelled_at ?? item.requested_at
    )
  };
}

function fromSupabaseStoreItem(row: SupabaseStoreItemRow): LocalPiggyProduct {
  return {
    id: row.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: row.child_id,
    name: row.name,
    price: Number(row.price),
    main_media_id: null,
    gallery_media_ids: [],
    shelf_status: row.status === 'shelf' ? 'shelf' : 'backlog',
    shelf_slot: null,
    created_by: SUPABASE_PARENT_ID,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.status === 'deleted' ? row.updated_at : null
  };
}

function fromSupabasePurchase(row: SupabasePurchaseRow): LocalPiggyPurchase {
  return {
    id: row.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: row.child_id,
    product_id: row.store_item_id ?? '',
    status: row.status,
    amount: Number(row.amount),
    product_snapshot: {
      name: '',
      price: Number(row.amount),
      main_media_id: null
    },
    requested_at: row.created_at,
    purchased_at: row.status === 'arrived' || row.status === 'completed' || row.status === 'purchased' ? row.updated_at : null,
    cancelled_at: row.status === 'cancelled' ? row.updated_at : null
  };
}

function mergeById<T extends { id: string }>(localItems: T[], remoteItems: T[], getTimestamp: (item: T) => string) {
  const byId = new Map<string, T>();
  [...localItems, ...remoteItems].forEach((item) => {
    const existing = byId.get(item.id);
    if (!existing || getTimestamp(item) > getTimestamp(existing)) byId.set(item.id, item);
  });
  return [...byId.values()];
}

function getPiggySavingsFromState(state: LocalDatabaseState, childId: UUID) {
  return state.piggy_bank_logs
    .filter((log) => log.child_id === childId)
    .reduce((total, log) => total + (log.type === 'purchase_debit' ? -log.amount : log.amount), 0);
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

async function deleteMissingRows(client: SupabaseClient, table: string, ids: string[]) {
  const query = client.from(table).delete().eq('family_id', SUPABASE_FAMILY_ID);
  const { error } = ids.length ? await query.not('id', 'in', `(${ids.join(',')})`) : await query;
  if (error) throw error;
}
