import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { getErrorMessage, getErrorStack, serializeError } from './errorDiagnostics';
import { beginTimingTrace, startupTrace, traceStartupPromise, traceTimingPromise } from './startupTrace';
import {
  createChildDeviceToken,
  createChildDeviceTokenForChild,
  parseChildDeviceToken
} from './childDeviceToken';
import { requireBackendVerifiedChildBindingRow } from './childBindingRpcValidation';
import { childBindingTrace, hashForTrace, recordBindChildDeviceCall } from './childBindingTrace';
import { bootstrapChildDeviceSession } from './childHydration';
import { clearChildSession, getChildSession, isChildSessionValid } from './childSessionRepository';
import {
  LOCAL_DEVICE_ID,
  MockDatabase
} from './mockDatabase';
import type { KeyValueStorage } from './storage';
import { deleteCookieValue, getCookieValue, getLocalStorage, setCookieValue } from './storage';
import {
  clearParentDeviceBinding,
  readParentDeviceBinding,
  saveParentDeviceBinding,
  type ParentDeviceBinding
} from './parentDeviceBinding';
import {
  LocalDataError,
  LocalDataService,
  childLoginUrlFromChallengeToken,
  type LocalDataRepository,
  type CreateChildInput,
  type UpdateChildInput,
  type ChildLoginChallengeResult,
  type ChildLoginChallengePreview,
  type CompleteChildLoginChallengeResult,
  type ChildSessionValidationResult,
  type TestDataCleanupPreview,
  type TestDataCleanupResult
} from './localData';
import type {
  AnnualParentNote,
  LocalBadge,
  LocalChildBadge,
  LocalChild,
  LocalDatabaseState,
  LocalDeviceBinding,
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
  ShareWithMedia,
  PiggyBankSummary,
  WeeklyScreenTimeDay,
  MemoryPack,
  LocalTask,
  UUID
} from './localTypes';

const SUPABASE_CACHE_KEY = 'little-dreamers-family:supabase-cache:v1';
const SUPABASE_FAMILY_BINDING_KEY = 'little-dreamers-family:supabase-family-binding:v1';
const SUPABASE_FALLBACK_FAMILY_ID = '00000000-0000-4000-8000-000000000001';
const SUPABASE_FALLBACK_PARENT_ID = '00000000-0000-4000-8000-000000000002';
let SUPABASE_FAMILY_ID = SUPABASE_FALLBACK_FAMILY_ID;
let SUPABASE_PARENT_ID = SUPABASE_FALLBACK_PARENT_ID;
let SUPABASE_PARENT_ROLE: ParentRuntimeRole | null = null;
let SUPABASE_AUTH_STATUS: SupabaseRuntimeInfo['authStatus'] = 'initializing';
const SUPABASE_DEVICE_FALLBACK_ID = '00000000-0000-4000-8000-000000000003';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SYNC_RETRY_DELAYS_MS = [1000, 3000, 8000, 15000, 30000];

type Listener = (state: LocalDatabaseState) => void;
type ValidChildSession = NonNullable<ReturnType<typeof getChildSession>>;
export type ParentRole = 'owner' | 'admin' | 'guardian' | 'viewer';
export type ParentRuntimeRole = ParentRole | 'parent';

export interface SupabaseRuntimeInfo {
  userId: string | null;
  parentId: string | null;
  familyId: string | null;
  parentRole: ParentRuntimeRole | null;
  authStatus: 'initializing' | 'signed_out' | 'needs_family' | 'ready' | 'missing_config' | 'error';
  authError?: {
    message: string;
    stack: string | null;
  } | null;
}

let runtimeInfo: SupabaseRuntimeInfo = {
  userId: null,
  parentId: null,
  familyId: null,
  parentRole: null,
  authStatus: 'initializing'
};

const runtimeListeners = new Set<(info: SupabaseRuntimeInfo) => void>();

export function getSupabaseRuntimeInfo(): SupabaseRuntimeInfo {
  return runtimeInfo;
}

export function subscribeSupabaseRuntimeInfo(listener: (info: SupabaseRuntimeInfo) => void) {
  runtimeListeners.add(listener);
  listener(runtimeInfo);
  return () => {
    runtimeListeners.delete(listener);
  };
}

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
  created_by: UUID;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface SupabaseDeviceBindingRow {
  id: string;
  token: string | null;
  family_id: UUID;
  child_id: UUID;
  child_name: string;
  child_birth_date?: string | null;
  child_theme_color?: string | null;
  device_id: UUID;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  last_login_at: string | null;
  last_login_device: string | null;
  binding_status: LocalDeviceBinding['binding_status'];
  qr_token_status: LocalDeviceBinding['qr_token_status'];
  device_binding_status?: LocalDeviceBinding['device_binding_status'];
  challenge_id?: string | null;
  activated_at?: string | null;
  replaced_at?: string | null;
  last_heartbeat_at?: string | null;
  revoke_reason?: string | null;
  created_at: string;
  updated_at: string;
}

interface CreateChildLoginChallengeRow {
  challenge_id: UUID;
  child_id: UUID;
  child_name: string;
  challenge_token: string;
  pin: string;
  expires_at: string;
  remaining_attempts: number;
  status: ChildLoginChallengeResult['status'];
}

interface ResolveChildLoginChallengeRow {
  challenge_id: UUID;
  child_name: string;
  expires_at: string;
  remaining_attempts: number;
  status: ChildLoginChallengePreview['status'];
}

interface CompleteChildLoginChallengeRow {
  challenge_id: UUID;
  child_id: UUID;
  child_name: string;
  family_id: UUID;
  device_binding_id: string;
  device_id: UUID;
  binding_status: 'active';
  challenge_status: 'used';
  bound_at: string;
  birth_date: string | null;
  theme_color: string | null;
  remaining_attempts: number;
}

interface ValidateChildDeviceSessionRow {
  child_id: UUID;
  child_name?: string | null;
  family_id?: UUID | null;
  device_binding_id: string;
  device_id: UUID;
  binding_status: ChildSessionValidationResult['bindingStatus'];
  last_heartbeat_at: string | null;
  valid: boolean;
}

interface BindChildDeviceWithTokenRow {
  id: UUID;
  family_id: UUID;
  display_name: string;
  birth_date: string | null;
  theme_color: string | null;
  status: LocalChild['status'];
  child_token: string;
  child_token_updated_at: string;
  child_token_consumed_at: string | null;
  binding_id: string;
  binding_expires_at: string;
  binding_used_at: string;
}

interface SupabaseParentRow {
  id: UUID;
  family_id: UUID;
  display_name: string;
  email: string | null;
  parent_role?: string | null;
  relation?: string | null;
  device_label?: string | null;
  last_seen_at?: string | null;
  device_bound?: boolean | null;
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

interface SupabaseBadgeRow {
  id: UUID;
  family_id: UUID;
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  image_media_id: UUID | null;
  is_system: boolean;
  created_at: string;
  updated_at?: string | null;
}

interface SupabaseChildBadgeRow {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  badge_id: UUID;
  awarded_by: UUID | null;
  source_entity_type: string | null;
  source_entity_id: UUID | null;
  note: string | null;
  awarded_at: string;
}

interface ChildScopedRepositorySnapshot {
  family_id: UUID;
  parent_id?: UUID | null;
  child_id: UUID;
  child: SupabaseChildRow | null;
  device_binding: SupabaseDeviceBindingRow | null;
  device_bindings?: SupabaseDeviceBindingRow[];
  tasks?: SupabaseTaskRow[];
  task_records?: SupabaseTaskRecordRow[];
  stars?: SupabaseStarRow[];
  piggy_bank_records?: SupabasePiggyBankRecordRow[];
  store_items?: SupabaseStoreItemRow[];
  purchases?: SupabasePurchaseRow[];
  dreams?: SupabaseDreamRow[];
  dream_funds?: SupabaseDreamFundRow[];
  shares?: SupabaseShareRow[];
  share_media?: SupabaseShareMediaRow[];
  encouragement_cards?: SupabaseMailboxRow[];
  special_days?: SupabaseSpecialDayRow[];
  growth_records?: SupabaseGrowthRecordRow[];
  tablet_time?: SupabaseTabletTimeRow[];
  badges?: SupabaseBadgeRow[];
  child_badges?: SupabaseChildBadgeRow[];
  updated_at?: string | null;
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

function currentDeviceLabel() {
  if (typeof navigator === 'undefined') return 'Unknown device';
  return navigator.userAgent || navigator.platform || 'Unknown device';
}

class SupabaseAuthStorage implements KeyValueStorage {
  private readonly storage = getSupabaseBrowserStorage();
  private readonly chunkSize = 3000;

  getItem(key: string) {
    let stored: string | null = null;
    try {
      stored = this.storage.getItem(key);
    } catch {
      stored = null;
    }
    if (stored) return stored;
    return this.readCookieChunks(key);
  }

  setItem(key: string, value: string) {
    try {
      this.storage.setItem(key, value);
    } catch (error) {
      console.warn('[supabase-auth] localStorage session write failed; using cookie fallback', error);
    }
    this.writeCookieChunks(key, value);
  }

  removeItem(key: string) {
    try {
      this.storage.removeItem(key);
    } catch {
      // Cookie cleanup below is the durable fallback.
    }
    this.clearCookieChunks(key);
  }

  private readCookieChunks(key: string) {
    const count = Number(getCookieValue(`${key}.chunks`) ?? 0);
    if (!count) return getCookieValue(key);

    const chunks: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const chunk = getCookieValue(`${key}.${index}`);
      if (chunk === null) {
        this.clearCookieChunks(key);
        return null;
      }
      chunks.push(chunk);
    }
    const value = chunks.join('');
    try {
      this.storage.setItem(key, value);
    } catch {
      // localStorage can be isolated or unavailable in iOS standalone mode.
    }
    return value;
  }

  private writeCookieChunks(key: string, value: string) {
    this.clearCookieChunks(key);
    if (value.length <= this.chunkSize) {
      setCookieValue(key, value);
      return;
    }

    const chunks = Math.ceil(value.length / this.chunkSize);
    setCookieValue(`${key}.chunks`, String(chunks));
    for (let index = 0; index < chunks; index += 1) {
      setCookieValue(`${key}.${index}`, value.slice(index * this.chunkSize, (index + 1) * this.chunkSize));
    }
  }

  private clearCookieChunks(key: string) {
    const count = Number(getCookieValue(`${key}.chunks`) ?? 0);
    deleteCookieValue(key);
    deleteCookieValue(`${key}.chunks`);
    for (let index = 0; index < count; index += 1) {
      deleteCookieValue(`${key}.${index}`);
    }
  }
}

function getSupabaseBrowserStorage(): KeyValueStorage {
  if (typeof window === 'undefined') return getLocalStorage();
  try {
    return window.localStorage;
  } catch {
    return getLocalStorage();
  }
}

export function createSupabaseClient(config = getSupabaseConfig()): SupabaseClient | null {
  startupTrace('createClient start', {
    hasConfig: Boolean(config),
    url: config?.url ?? null
  });
  try {
    if (!config) {
      startupTrace('createClient finish', { client: null, reason: 'missing config' });
      return null;
    }
    const client = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: new SupabaseAuthStorage()
      }
    });
    startupTrace('createClient finish', { client: 'created' });
    return client;
  } catch (error) {
    startupTrace('createClient error', {
      message: getErrorMessage(error),
      stack: getErrorStack(error),
      error: serializeError(error)
    });
    throw error;
  }
}

startupTrace('SupabaseRepository.create start');
export const supabaseClient = createSupabaseClient();
startupTrace('SupabaseRepository.create finish', { hasClient: Boolean(supabaseClient) });

interface SupabaseFamilyMemberRow {
  family_id: UUID;
  user_id: UUID;
  role: ParentRole;
  status: 'active' | 'invited' | 'removed';
  created_at: string;
}

interface ProductionAuthScope {
  userId: UUID;
  parentId: UUID | null;
  familyId: UUID | null;
  role: ParentRuntimeRole | null;
}

export interface CurrentParentProfile {
  parentId: UUID;
  familyId: UUID | null;
  role: ParentRuntimeRole | null;
}

export interface CurrentFamilyScope {
  familyId: UUID;
  role: ParentRuntimeRole | null;
}

interface SavedFamilyBinding {
  userId: UUID;
  familyId: UUID;
}

interface ProductionFamilyScopeRow {
  family_id?: string;
  familyId?: string;
  parent_id?: string;
  parentId?: string;
  parent_role?: ParentRole;
  parentRole?: ParentRole;
  family_code?: string;
  familyCode?: string;
}

interface ProductionInviteRow {
  family_id: string;
  invite_code: string;
  join_path: string;
}

interface ProductionInvitePreviewRow {
  family_id: string;
  family_name: string;
  parent_role: ParentRole;
}

export interface ProductionFamilyParent {
  id: string;
  family_id: string;
  display_name: string;
  parent_role: ParentRuntimeRole;
  relation: string | null;
  device_label: string | null;
  last_seen_at: string | null;
}

function firstRpcRow<T>(data: T | T[] | null): T | null {
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

function normalizeProductionFamilyScopeRow(row: ProductionFamilyScopeRow | null) {
  if (!row) return null;
  return {
    familyId: row.family_id ?? row.familyId ?? null,
    parentId: row.parent_id ?? row.parentId ?? null,
    parentRole: row.parent_role ?? row.parentRole ?? null,
    familyCode: row.family_code ?? row.familyCode ?? null
  };
}

function formatSupabaseError(action: string, error: unknown): string {
  if (!error || typeof error !== 'object') return `${action} failed.`;
  const source = error as {
    message?: unknown;
    details?: unknown;
    hint?: unknown;
    code?: unknown;
  };
  const parts = [
    typeof source.message === 'string' ? source.message : null,
    typeof source.details === 'string' ? source.details : null,
    typeof source.hint === 'string' ? `Hint: ${source.hint}` : null,
    typeof source.code === 'string' ? `Code: ${source.code}` : null
  ].filter(Boolean);
  return parts.length ? `${action} failed: ${parts.join(' ')}` : `${action} failed.`;
}

async function refreshAuthSessionAfterScopeChange() {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.auth.refreshSession();
  if (error) console.warn('[supabase-repository] auth session refresh failed after family scope change', error);
}

async function waitForAuthSession(client: SupabaseClient, timeoutMs = 5000) {
  startupTrace('Auth.getSession wait start', { timeoutMs });
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    const { data, error } = await traceTimingPromise(
      'getSession',
      () => client.auth.getSession(),
      { attempt }
    );
    if (error) throw error;
    if (data.session?.user) {
      startupTrace('Auth.getSession wait finish', { attempt, userId: data.session.user.id });
      return data.session;
    }
    await traceStartupPromise(
      `Auth.getSession retry delay ${attempt}`,
      () => new Promise((resolve) => setTimeout(resolve, 150)),
      { attempt }
    );
  }
  startupTrace('Auth.getSession wait finish', { session: null, attempts: attempt });
  return null;
}

async function resolveAndPublishProductionAuthScope() {
  if (!supabaseClient) throw new Error('Supabase is not configured.');
  startupTrace('resolveAndPublishProductionAuthScope start');
  await traceStartupPromise('waitForAuthSession', () => waitForAuthSession(supabaseClient));
  const scope = await resolveProductionAuthScope(supabaseClient);
  if (!scope) {
    setRuntimeInfo({
      userId: null,
      parentId: null,
      familyId: null,
      parentRole: null,
      authStatus: 'signed_out'
    });
    startupTrace('resolveAndPublishProductionAuthScope finish', { scope: null });
    return getSupabaseRuntimeInfo();
  }
  setRuntimeInfo({
    userId: scope.userId,
    parentId: scope.parentId,
    familyId: scope.familyId,
    parentRole: scope.role,
    authStatus: scope.familyId || scope.parentId ? 'ready' : 'needs_family'
  });
  startupTrace('resolveAndPublishProductionAuthScope finish', {
    userId: scope.userId,
    parentId: scope.parentId,
    familyId: scope.familyId
  });
  return getSupabaseRuntimeInfo();
}

function readSavedFamilyBinding(userId: string): SavedFamilyBinding | null {
  const local = getLocalStorage().getItem(SUPABASE_FAMILY_BINDING_KEY);
  const raw = local ?? getCookieValue(SUPABASE_FAMILY_BINDING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SavedFamilyBinding>;
    if (parsed.userId === userId && parsed.familyId && UUID_PATTERN.test(parsed.familyId)) {
      return { userId: parsed.userId, familyId: parsed.familyId };
    }
  } catch {
    // Ignore stale or malformed binding data.
  }
  return null;
}

function saveFamilyBinding(userId: string, familyId: string) {
  const serialized = JSON.stringify({ userId, familyId });
  try {
    getLocalStorage().setItem(SUPABASE_FAMILY_BINDING_KEY, serialized);
  } catch {
    // Cookie fallback still preserves the binding for PWA/WebView storage splits.
  }
  setCookieValue(SUPABASE_FAMILY_BINDING_KEY, serialized, 60 * 60 * 24 * 365 * 2);
}

function clearFamilyBinding() {
  try {
    getLocalStorage().removeItem(SUPABASE_FAMILY_BINDING_KEY);
  } catch {
    // Nothing to clear.
  }
  deleteCookieValue(SUPABASE_FAMILY_BINDING_KEY);
}

export async function signInParentWithPassword(email: string, password: string) {
  if (!supabaseClient) throw new Error('Supabase is not configured.');
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return resolveAndPublishProductionAuthScope();
}

export async function signUpParentWithPassword(email: string, password: string, displayName?: string) {
  if (!supabaseClient) throw new Error('Supabase is not configured.');
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName || email.split('@')[0] } }
  });
  if (error) throw error;
  if (!data.session) {
    const { error: signInError } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
  }
  return resolveAndPublishProductionAuthScope();
}

export async function signOutParent() {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.auth.signOut();
  if (error) throw new Error(formatSupabaseError('Sign out', error));
}

export async function getCurrentParentProfile(client: SupabaseClient | null = supabaseClient): Promise<CurrentParentProfile | null> {
  if (!client) throw new Error('Supabase is not configured.');
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const user = sessionData.session?.user;
  if (!user) return null;

  const { data, error } = await client
    .from('parents')
    .select('id,family_id,parent_role')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;

  const parent = data as { id?: string | null; family_id?: string | null; parent_role?: ParentRuntimeRole | null } | null;
  if (!parent?.id) return null;
  return {
    parentId: parent.id,
    familyId: parent.family_id ?? null,
    role: parent.parent_role ?? null
  };
}

export async function getCurrentFamily(
  client: SupabaseClient | null = supabaseClient,
  preferredFamilyId?: string | null
): Promise<CurrentFamilyScope | null> {
  if (!client) throw new Error('Supabase is not configured.');
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const user = sessionData.session?.user;
  if (!user) return null;

  const queryMembership = async (familyId?: string | null) => {
    let query = client
      .from('family_members')
      .select('family_id,user_id,role,status,created_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1);

    if (familyId) query = query.eq('family_id', familyId);

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data as SupabaseFamilyMemberRow | null;
  };

  const membership = (await queryMembership(preferredFamilyId)) ?? (preferredFamilyId ? await queryMembership() : null);
  if (!membership) return null;
  return {
    familyId: membership.family_id,
    role: membership.role
  };
}

export function bindParentDeviceToFamily(binding: ParentDeviceBinding) {
  saveParentDeviceBinding(binding);
  setRuntimeInfo({
    userId: null,
    parentId: binding.parentId,
    familyId: binding.familyId,
    parentRole: binding.parentRole,
    authStatus: 'ready'
  });
}

export function unbindParentDeviceFromFamily() {
  clearParentDeviceBinding();
  setRuntimeInfo({
    userId: runtimeInfo.userId,
    parentId: runtimeInfo.userId,
    familyId: null,
    parentRole: null,
    authStatus: runtimeInfo.userId ? 'needs_family' : 'signed_out'
  });
}

export async function createProductionFamily(familyName: string) {
  if (!supabaseClient) throw new Error('Supabase is not configured.');
  const { data, error } = await supabaseClient.rpc('create_family_for_current_user', {
    family_name: familyName.trim() || '小小夢想家 Family'
  });
  if (error) {
    console.error('[supabase-repository] create_family_for_current_user failed', error);
    if (error instanceof Error && error.stack) console.error(error.stack);
    throw new Error(formatSupabaseError('Create family RPC create_family_for_current_user', error));
  }
  const row = normalizeProductionFamilyScopeRow(firstRpcRow(data as ProductionFamilyScopeRow | ProductionFamilyScopeRow[] | null));
  if (!row?.familyId || !row.parentId) throw new Error('Create family RPC create_family_for_current_user failed: no family scope was returned.');
  if (row) {
    saveFamilyBinding(row.parentId, row.familyId);
    setRuntimeInfo({
      userId: row.parentId,
      parentId: row.parentId,
      familyId: row.familyId,
      parentRole: row.parentRole,
      authStatus: 'ready'
    });
    await refreshAuthSessionAfterScopeChange();
  }
  return row;
}

export async function joinProductionFamily(familyId: string, inviteCode: string) {
  if (!supabaseClient) throw new Error('Supabase is not configured.');
  const { data, error } = await supabaseClient.rpc('join_family_with_invite_code', {
    target_family_id: familyId,
    invite_code: inviteCode.trim()
  });
  if (error) {
    console.error('[supabase-repository] join_family_with_invite_code failed', error);
    if (error instanceof Error && error.stack) console.error(error.stack);
    throw new Error(formatSupabaseError('Join family RPC join_family_with_invite_code', error));
  }
  const row = normalizeProductionFamilyScopeRow(firstRpcRow(data as ProductionFamilyScopeRow | ProductionFamilyScopeRow[] | null));
  if (row) {
    if (!row.parentId || !row.familyId) throw new Error('Join family RPC join_family_with_invite_code failed: no family scope was returned.');
    saveFamilyBinding(row.parentId, row.familyId);
    setRuntimeInfo({
      userId: row.parentId,
      parentId: row.parentId,
      familyId: row.familyId,
      parentRole: row.parentRole,
      authStatus: 'ready'
    });
    await refreshAuthSessionAfterScopeChange();
  }
  return row;
}

export async function createProductionFamilyInvite(role: ParentRole = 'guardian') {
  if (!supabaseClient) throw new Error('Supabase is not configured.');
  const { data, error } = await supabaseClient.rpc('create_family_invite_code', {
    target_role: role
  });
  if (error) throw new Error(formatSupabaseError('Create family invite RPC create_family_invite_code', error));
  return firstRpcRow(data as ProductionInviteRow | ProductionInviteRow[] | null);
}

export async function getProductionFamilyInvitePreview(familyId: string, inviteCode: string) {
  if (!supabaseClient) throw new Error('Supabase is not configured.');
  const { data, error } = await supabaseClient.rpc('get_family_invite_preview', {
    target_family_id: familyId,
    invite_code: inviteCode.trim()
  });
  if (error) throw error;
  return firstRpcRow(data as ProductionInvitePreviewRow | ProductionInvitePreviewRow[] | null);
}

export async function listProductionFamilyParents(familyId: string): Promise<ProductionFamilyParent[]> {
  if (!supabaseClient) throw new Error('Supabase is not configured.');
  const { data, error } = await supabaseClient
    .from('parents')
    .select('id,family_id,display_name,parent_role,relation,device_label,last_seen_at')
    .eq('family_id', familyId)
    .order('created_at');
  if (error) throw error;
  return ((data ?? []) as Array<Partial<ProductionFamilyParent>>).map((parent) => ({
    id: String(parent.id),
    family_id: String(parent.family_id),
    display_name: String(parent.display_name || '家長'),
    parent_role: parent.parent_role === 'owner' ? 'owner' : 'parent',
    relation: parent.relation ?? null,
    device_label: parent.device_label ?? null,
    last_seen_at: parent.last_seen_at ?? null
  }));
}

export async function createDeviceBoundParent(input: {
  familyId: string;
  inviteCode: string;
  parentName: string;
  relation: string;
  deviceLabel: string;
}) {
  if (!supabaseClient) throw new Error('Supabase is not configured.');
  const { data, error } = await supabaseClient.rpc('bind_parent_device_with_invite', {
    target_family_id: input.familyId,
    invite_code: input.inviteCode,
    parent_name: input.parentName.trim() || input.relation || '家長',
    parent_relation: input.relation,
    device_label: input.deviceLabel
  });
  if (error) throw error;
  const row = firstRpcRow(data as { family_id: string; parent_id: string; parent_role: 'parent' } | { family_id: string; parent_id: string; parent_role: 'parent' }[] | null);
  if (!row) throw new Error('加入家庭失敗');
  const now = new Date().toISOString();
  const binding: ParentDeviceBinding = {
    familyId: row.family_id,
    parentId: row.parent_id,
    parentName: input.parentName.trim() || input.relation || '家長',
    parentRole: 'parent',
    relation: input.relation,
    deviceLabel: input.deviceLabel,
    boundAt: now
  };
  bindParentDeviceToFamily(binding);
  return binding;
}

export async function touchDeviceBoundParent() {
  if (!supabaseClient) return;
  const binding = readParentDeviceBinding();
  if (!binding) return;
  await supabaseClient
    .from('parents')
    .update({
      last_seen_at: new Date().toISOString(),
      device_label: binding.deviceLabel,
      updated_at: new Date().toISOString()
    })
    .eq('id', binding.parentId)
    .eq('family_id', binding.familyId);
}

export async function revokeDeviceBoundParent(parentId: string, familyId: string) {
  if (!supabaseClient) throw new Error('Supabase is not configured.');
  const { error } = await supabaseClient.rpc('revoke_parent_device_binding', {
    target_parent_id: parentId,
    target_family_id: familyId
  });
  if (error) throw error;
}

export async function updateProductionParentProfile(
  parentName: string,
  parentEmail: string,
  relation?: string,
  parentRole?: 'owner' | 'parent'
) {
  if (!supabaseClient) throw new Error('Supabase is not configured.');
  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError) throw sessionError;
  const user = sessionData.session?.user;
  if (!user) throw new Error('Authentication required.');
  const updates: {
    display_name: string;
    email: string | null;
    relation: string | null;
    updated_at: string;
    parent_role?: 'owner' | 'parent';
  } = {
    display_name: parentName.trim() || user.email?.split('@')[0] || 'Parent',
    email: parentEmail.trim() || user.email || null,
    relation: relation?.trim() || parentName.trim() || null,
    updated_at: new Date().toISOString()
  };
  if (parentRole) updates.parent_role = parentRole;
  const { error } = await supabaseClient
    .from('parents')
    .update(updates)
    .eq('id', user.id);
  if (error) {
    console.error('[supabase-repository] update parent profile failed', error);
    if (error instanceof Error && error.stack) console.error(error.stack);
    throw new Error(formatSupabaseError('Update parent profile', error));
  }
}

export async function leaveProductionFamily() {
  if (!supabaseClient) throw new Error('Supabase is not configured.');
  const { data, error } = await supabaseClient.rpc('leave_current_family');
  if (error) throw error;
  clearFamilyBinding();
  clearParentDeviceBinding();
  setRuntimeInfo({
    userId: runtimeInfo.userId,
    parentId: runtimeInfo.parentId,
    familyId: null,
    parentRole: null,
    authStatus: runtimeInfo.userId ? 'needs_family' : 'signed_out'
  });
  return firstRpcRow(data as { parent_id: string; family_id: string; parent_role: ParentRole } | { parent_id: string; family_id: string; parent_role: ParentRole }[] | null);
}

async function resolveProductionAuthScope(client: SupabaseClient): Promise<ProductionAuthScope | null> {
  const trace = beginTimingTrace('resolveProductionAuthScope', {}, 'promise');
  startupTrace('AUTH START');
  try {
    const { data: sessionData, error: sessionError } = await traceTimingPromise(
      'getSession',
      () => client.auth.getSession()
    );
    if (sessionError) throw sessionError;
    const user = sessionData.session?.user;
    if (!user) {
      const deviceBinding = readParentDeviceBinding();
      startupTrace('AUTH END', { status: deviceBinding ? 'device_bound_parent' : 'signed_out' });
      trace.end({ status: deviceBinding ? 'device_bound_parent' : 'signed_out' });
      if (!deviceBinding) return null;
      void touchDeviceBoundParent();
      return {
        userId: deviceBinding.parentId,
        parentId: deviceBinding.parentId,
        familyId: deviceBinding.familyId,
        role: deviceBinding.parentRole
      };
    }

    await traceTimingPromise(
      'ensureProfile',
      () => ensureProfileForUser(client, user.id, user.user_metadata?.display_name, user.email),
      { userId: user.id }
    );

    const parentProfile = await traceTimingPromise('getCurrentParentProfile', () => getCurrentParentProfile(client), {
      userId: user.id
    });
    const savedBinding = readSavedFamilyBinding(user.id);
    const preferredFamilyId = parentProfile?.familyId ?? savedBinding?.familyId ?? null;
    const familyScope = await traceTimingPromise('getCurrentFamily', () => getCurrentFamily(client, preferredFamilyId), {
      userId: user.id,
      preferredFamilyId
    });

    if (familyScope?.familyId) {
      saveFamilyBinding(user.id, familyScope.familyId);
      await traceTimingPromise(
        'ensureParentForUser',
        () => ensureParentForUser(client, user.id, familyScope.familyId, user.user_metadata?.display_name, user.email),
        { userId: user.id, familyId: familyScope.familyId }
      );
      startupTrace('AUTH END', { status: 'ready', userId: user.id, familyId: familyScope.familyId });
      trace.end({ status: 'ready', userId: user.id, familyId: familyScope.familyId });
      return {
        userId: user.id,
        parentId: parentProfile?.parentId ?? user.id,
        familyId: familyScope.familyId,
        role: familyScope.role ?? parentProfile?.role ?? null
      };
    }

    if (parentProfile) {
      if (parentProfile.familyId) saveFamilyBinding(user.id, parentProfile.familyId);
      startupTrace('AUTH END', { status: parentProfile.familyId ? 'ready' : 'needs_family', userId: user.id, familyId: parentProfile.familyId });
      trace.end({ status: parentProfile.familyId ? 'ready' : 'needs_family', userId: user.id, familyId: parentProfile.familyId });
      return {
        userId: user.id,
        parentId: parentProfile.parentId,
        familyId: parentProfile.familyId,
        role: parentProfile.role
      };
    }

    startupTrace('AUTH END', { status: 'needs_family', userId: user.id });
    trace.end({ status: 'needs_family', userId: user.id });
    return { userId: user.id, parentId: null, familyId: null, role: null };
  } catch (error) {
    trace.error(error);
    throw error;
  }
}

async function ensureProfileForUser(client: SupabaseClient, userId: string, displayName?: unknown, email?: string) {
  const fallbackName = typeof displayName === 'string' && displayName.trim() ? displayName.trim() : email?.split('@')[0] ?? 'Parent';
  const { error } = await client.from('profiles').upsert(
    {
      id: userId,
      display_name: fallbackName,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Taipei',
      locale: navigator.language || 'zh-TW'
    },
    { onConflict: 'id' }
  );
  if (error) throw error;
}

async function ensureParentForUser(
  client: SupabaseClient,
  userId: string,
  familyId: string,
  displayName?: unknown,
  email?: string
) {
  const fallbackName = typeof displayName === 'string' && displayName.trim() ? displayName.trim() : email?.split('@')[0] ?? 'Parent';
  const { error } = await client.from('parents').upsert(
    {
      id: userId,
      family_id: familyId,
      display_name: fallbackName,
      email: email ?? null
    },
    { onConflict: 'id' }
  );
  if (error) throw error;
}

function setRuntimeInfo(next: SupabaseRuntimeInfo) {
  runtimeInfo = next;
  SUPABASE_FAMILY_ID = next.familyId ?? SUPABASE_FALLBACK_FAMILY_ID;
  SUPABASE_PARENT_ID = next.parentId ?? SUPABASE_FALLBACK_PARENT_ID;
  SUPABASE_PARENT_ROLE = next.parentRole;
  SUPABASE_AUTH_STATUS = next.authStatus;
  runtimeListeners.forEach((listener) => listener(runtimeInfo));
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function runtimeTimestamp() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const millis = String(now.getMilliseconds()).padStart(3, '0');
  return `[${hours}:${minutes}:${seconds}.${millis}]`;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeScreenLogType(log: LocalScreenTimeLog): NonNullable<LocalScreenTimeLog['type']> {
  if (log.type) return log.type;
  if (log.entry_type === 'usage') return 'used';
  if (log.entry_type === 'manual_deduction') return 'penalty';
  return 'manual_add';
}

function getScreenTimeLedgerBalance(state: LocalDatabaseState, childId: UUID) {
  return Math.max(0, sum(state.screen_time_logs.filter((item) => item.child_id === childId).map((item) => item.minutes_delta)));
}

export class SupabaseDataRepository implements LocalDataRepository {
  private readonly client: SupabaseClient | null;
  private cache = new LocalDataService(new MockDatabase(undefined, SUPABASE_CACHE_KEY));
  private readonly listeners = new Set<Listener>();
  private hydratePromise: Promise<void> | null = null;
  private realtimeChannel: RealtimeChannel | null = null;
  private pendingPush = false;
  private pushPromise: Promise<void> | null = null;
  private pendingChildPush = false;
  private childPushPromise: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private lastRemoteUpdatedAt: string | null = null;
  private hasFamilyScope = false;

  constructor(client: SupabaseClient | null = supabaseClient) {
    startupTrace('SupabaseDataRepository constructor start', { hasClient: Boolean(client) });
    this.client = client;
    if (!client) this.cache = new LocalDataService(new MockDatabase(new VolatileSupabaseStorage(), SUPABASE_CACHE_KEY));
    if (!client) {
      console.error(
        '[supabase-repository] Supabase mode requested but VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.'
      );
      setRuntimeInfo({
        userId: null,
        parentId: null,
        familyId: null,
        parentRole: null,
        authStatus: 'missing_config'
      });
    }
    void this.initializeAuthScope();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.hydrateFromSupabase();
      });
      window.addEventListener('focus', () => {
        this.hydrateFromSupabase();
      });
      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.hydrateFromSupabase();
      });
    }
    startupTrace('SupabaseDataRepository constructor finish', { hasClient: Boolean(client) });
  }

  private async initializeAuthScope() {
    const trace = beginTimingTrace('initializeAuthScope', { hasClient: Boolean(this.client) }, 'promise');
    startupTrace('SupabaseDataRepository.initializeAuthScope start', { hasClient: Boolean(this.client) });
    try {
      if (!this.client) {
        startupTrace('SupabaseDataRepository.initializeAuthScope finish', { reason: 'no client' });
        trace.end({ reason: 'no client' });
        return;
      }
      await this.refreshAuthScope();
      this.client.auth.onAuthStateChange((event, session) => {
        console.log('[auth trace] auth callback', {
          event,
          userId: session?.user?.id ?? null
        });
        void this.refreshAuthScope();
      });
      startupTrace('SupabaseDataRepository.initializeAuthScope finish');
      trace.end();
    } catch (error) {
      trace.error(error);
      throw error;
    }
  }

  private async refreshAuthScope() {
    const client = this.client;
    if (!client) return;
    const trace = beginTimingTrace('refreshAuthScope', {}, 'promise');
    startupTrace('SupabaseDataRepository.refreshAuthScope start');
    try {
      const scope = await resolveProductionAuthScope(client);
      if (!scope) {
        this.hasFamilyScope = false;
        setRuntimeInfo({
          userId: null,
          parentId: null,
          familyId: null,
          parentRole: null,
          authStatus: 'signed_out'
        });
        startupTrace('SupabaseDataRepository.refreshAuthScope finish', { scope: null });
        trace.end({ scope: null });
        return;
      }
      this.hasFamilyScope = Boolean(scope.familyId);
      setRuntimeInfo({
        userId: scope.userId,
        parentId: scope.parentId,
        familyId: scope.familyId,
        parentRole: scope.role,
        authStatus: scope.familyId || scope.parentId ? 'ready' : 'needs_family'
      });
      if (scope.familyId) {
        this.subscribeToSupabaseChanges();
        this.hydrateFromSupabase();
      }
      this.emit();
      startupTrace('SupabaseDataRepository.refreshAuthScope finish', {
        userId: scope.userId,
        parentId: scope.parentId,
        familyId: scope.familyId
      });
      trace.end({
        userId: scope.userId,
        parentId: scope.parentId,
        familyId: scope.familyId
      });
    } catch (error) {
      console.warn('[supabase-repository] auth scope failed', error);
      startupTrace('SupabaseDataRepository.refreshAuthScope error', {
        message: getErrorMessage(error),
        stack: getErrorStack(error),
        error: serializeError(error)
      });
      startupTrace('AUTH END', {
        status: 'error',
        message: getErrorMessage(error),
        stack: getErrorStack(error)
      });
      trace.error(error);
      this.hasFamilyScope = false;
      setRuntimeInfo({
        userId: null,
        parentId: null,
        familyId: null,
        parentRole: null,
        authStatus: 'error',
        authError: {
          message: getErrorMessage(error),
          stack: getErrorStack(error)
        }
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
      this.queueChildScopedPush();
      return result;
    }) as LocalDataRepository[K];
  }

  private requireChildScopedSession(childId: UUID) {
    const session = getChildSession();
    if (!isChildSessionValid(session, childId)) {
      throw new LocalDataError('Child session is invalid or does not match requested child', 'CHILD_SESSION_FORBIDDEN');
    }
    return session;
  }

  private canUseChildScopedSession(childId: UUID) {
    return isChildSessionValid(getChildSession(), childId);
  }

  private getChildScopedState(childId: UUID) {
    if (!this.canUseChildScopedSession(childId) && !runtimeInfo.familyId) {
      this.requireChildScopedSession(childId);
    }
    const session = getChildSession();
    if (!runtimeInfo.familyId && isChildSessionValid(session, childId)) {
      return scopeStateToChildSession(this.cache.getState(), session);
    }
    return scopeStateToCurrentFamily(this.cache.getState());
  }

  getState(): LocalDatabaseState {
    this.hydrateFromSupabase();
    const session = getChildSession();
    if (!runtimeInfo.familyId && isChildSessionValid(session)) {
      return scopeStateToChildSession(this.cache.getState(), session);
    }
    return scopeStateToCurrentFamily(this.cache.getState());
  }

  getRepositoryScope(): LocalRepositoryScope {
    return this.cache.getRepositoryScope();
  }

  resetLocalData(): LocalDatabaseState {
    return this.cache.resetLocalData();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    const scopedListener: Listener = (state) => {
      const session = getChildSession();
      listener(!runtimeInfo.familyId && isChildSessionValid(session)
        ? scopeStateToChildSession(state, session)
        : scopeStateToCurrentFamily(state));
    };
    const unsubscribeCache = this.cache.subscribe(scopedListener);
    this.hydrateFromSupabase();
    return () => {
      this.listeners.delete(listener);
      unsubscribeCache();
    };
  }

  createChild(input: CreateChildInput): LocalChild {
    const child = this.cache.createChild(input);
    void this.upsertChildToSupabase(child).catch((error) => {
      console.warn('[supabase-repository] child create sync failed', error);
    });
    void this.upsertDeviceBindingToSupabase(child.id, 'unbound', 'active').catch((error) => {
      console.warn('[supabase-repository] device binding create sync failed', error);
    });
    this.queuePush();
    return child;
  }

  updateChild(childId: UUID, input: UpdateChildInput): LocalChild {
    const child = this.cache.updateChild(childId, input);
    void this.upsertChildToSupabase(child).catch((error) => {
      console.warn('[supabase-repository] child update sync failed', error);
    });
    this.queuePush();
    return child;
  }

  deleteChild(childId: UUID): LocalChild {
    const child = this.cache.deleteChild(childId);
    void this.upsertChildToSupabase(child).catch((error) => {
      console.warn('[supabase-repository] child delete sync failed', error);
    });
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
    return this.cache
      .listChildren(includeArchived)
      .filter((child) => child.family_id === SUPABASE_FAMILY_ID);
  }

  getChildByToken(token: string): LocalChild | null {
    this.hydrateFromSupabase();
    return this.cache.getChildByToken(token);
  }

  async createChildLoginChallenge(childId: UUID, replaceExistingBinding = false): Promise<ChildLoginChallengeResult> {
    if (!this.client) return this.cache.createChildLoginChallenge(childId, replaceExistingBinding);
    const child = this.cache.getState().children.find((item) => item.id === childId);
    if (child) await this.upsertChildToSupabase(child, 'regenerateChildToken');
    const { data, error } = await this.client.rpc('create_child_login_challenge', {
      p_child_id: childId,
      p_replace_existing_binding: replaceExistingBinding
    });
    if (error) throw error;
    const row = firstRpcRow(data as CreateChildLoginChallengeRow[] | CreateChildLoginChallengeRow | null);
    if (!row?.challenge_token || !row.challenge_id || !row.child_id) {
      throw new LocalDataError('Login challenge response is invalid', 'CHALLENGE_RESPONSE_INVALID');
    }
    return {
      challengeId: row.challenge_id,
      childId: row.child_id,
      childName: row.child_name,
      challengeToken: row.challenge_token,
      pin: row.pin,
      expiresAt: row.expires_at,
      remainingAttempts: row.remaining_attempts,
      status: row.status,
      loginUrl: childLoginUrlFromChallengeToken(row.challenge_token)
    };
  }

  async resolveChildLoginChallenge(challengeToken: string): Promise<ChildLoginChallengePreview> {
    if (!this.client) return this.cache.resolveChildLoginChallenge(challengeToken);
    const normalized = challengeToken.trim();
    if (!normalized) throw new LocalDataError('Login challenge token is empty', 'CHALLENGE_TOKEN_EMPTY');
    const { data, error } = await this.client.rpc('resolve_child_login_challenge', {
      p_challenge_token: normalized
    });
    if (error) throw error;
    const row = firstRpcRow(data as ResolveChildLoginChallengeRow[] | ResolveChildLoginChallengeRow | null);
    if (!row?.challenge_id) throw new LocalDataError('Login challenge response is invalid', 'CHALLENGE_RESPONSE_INVALID');
    return {
      challengeId: row.challenge_id,
      childName: row.child_name,
      expiresAt: row.expires_at,
      remainingAttempts: row.remaining_attempts,
      status: row.status
    };
  }

  async completeChildLoginChallenge(challengeToken: string, pin: string): Promise<CompleteChildLoginChallengeResult> {
    if (!this.client) {
      const result = this.cache.completeChildLoginChallenge(challengeToken, pin);
      bootstrapChildDeviceSession({
        token: challengeToken,
        childId: result.childId,
        childName: result.childName,
        familyId: result.familyId,
        deviceBindingId: result.deviceBindingId,
        deviceId: result.deviceId,
        boundAt: result.boundAt,
        birthDate: result.birthDate,
        themeColor: result.themeColor
      });
      return result;
    }
    const state = this.cache.getState();
    const deviceId = toSupabaseUuid(state.device_id ?? LOCAL_DEVICE_ID, SUPABASE_DEVICE_FALLBACK_ID);
    const { data, error } = await this.client.rpc('complete_child_login_challenge', {
      p_challenge_token: challengeToken.trim(),
      p_pin: pin.trim(),
      p_device_id: deviceId,
      p_device_label: currentDeviceLabel()
    });
    if (error) throw error;
    const row = firstRpcRow(data as CompleteChildLoginChallengeRow[] | CompleteChildLoginChallengeRow | null);
    if (!row?.child_id || !row.device_binding_id || row.binding_status !== 'active') {
      throw new LocalDataError('Login challenge completion response is invalid', 'CHALLENGE_RESPONSE_INVALID');
    }
    const result: CompleteChildLoginChallengeResult = {
      challengeId: row.challenge_id,
      childId: row.child_id,
      childName: row.child_name,
      familyId: row.family_id,
      deviceBindingId: row.device_binding_id,
      deviceId: row.device_id,
      bindingStatus: 'active',
      challengeStatus: 'used',
      boundAt: row.bound_at,
      birthDate: row.birth_date,
      themeColor: row.theme_color,
      remainingAttempts: row.remaining_attempts
    };
    bootstrapChildDeviceSession({
      token: challengeToken.trim(),
      childId: result.childId,
      childName: result.childName,
      familyId: result.familyId,
      deviceBindingId: result.deviceBindingId,
      deviceId: result.deviceId,
      boundAt: result.boundAt,
      birthDate: result.birthDate,
      themeColor: result.themeColor
    });
    this.cache.applyChildLoginBootstrap(result, challengeToken.trim());
    this.hydrateFromSupabase();
    return result;
  }

  applyChildLoginBootstrap(result: CompleteChildLoginChallengeResult, challengeToken = ''): LocalChild {
    return this.cache.applyChildLoginBootstrap(result, challengeToken);
  }

  async validateChildDeviceSession(childId: UUID, deviceBindingId: UUID, deviceId: UUID): Promise<ChildSessionValidationResult> {
    if (!this.client) return this.cache.validateChildDeviceSession(childId, deviceBindingId, deviceId);
    const { data, error } = await this.client.rpc('validate_child_device_session', {
      p_child_id: childId,
      p_device_binding_id: deviceBindingId,
      p_device_id: deviceId
    });
    if (error) throw error;
    const row = firstRpcRow(data as ValidateChildDeviceSessionRow[] | ValidateChildDeviceSessionRow | null);
    if (!row) {
      return {
        childId,
        deviceBindingId,
        deviceId,
        bindingStatus: 'revoked',
        lastHeartbeatAt: null,
        valid: false
      };
    }
    return {
      childId: row.child_id,
      childName: row.child_name ?? null,
      familyId: row.family_id ?? null,
      deviceBindingId: row.device_binding_id,
      deviceId: row.device_id,
      bindingStatus: row.binding_status,
      lastHeartbeatAt: row.last_heartbeat_at,
      valid: row.valid
    };
  }

  async heartbeatChildDeviceSession(childId: UUID, deviceBindingId: UUID, deviceId: UUID): Promise<ChildSessionValidationResult> {
    if (!this.client) return this.cache.heartbeatChildDeviceSession(childId, deviceBindingId, deviceId);
    const { data, error } = await this.client.rpc('heartbeat_child_device_session', {
      p_child_id: childId,
      p_device_binding_id: deviceBindingId,
      p_device_id: deviceId
    });
    if (error) throw error;
    const row = firstRpcRow(data as ValidateChildDeviceSessionRow[] | ValidateChildDeviceSessionRow | null);
    if (!row) {
      return {
        childId,
        deviceBindingId,
        deviceId,
        bindingStatus: 'revoked',
        lastHeartbeatAt: null,
        valid: false
      };
    }
    return {
      childId: row.child_id,
      deviceBindingId: row.device_binding_id,
      deviceId,
      bindingStatus: row.binding_status,
      lastHeartbeatAt: row.last_heartbeat_at,
      valid: row.valid
    };
  }

  async bindChildDeviceByToken(token: string): Promise<LocalChild> {
    const normalized = token.trim();
    if (!normalized) throw new LocalDataError('Child token is empty', 'CHILD_TOKEN_EMPTY');
    const decodedToken = parseChildDeviceToken(normalized);
    if (!decodedToken?.childId) throw new LocalDataError('Child token is invalid', 'CHILD_TOKEN_INVALID');
    const bindCall = recordBindChildDeviceCall(normalized);
    childBindingTrace('bindChildDeviceByToken() 開始呼叫', {
      tokenHash: bindCall.tokenHash,
      childId: decodedToken.childId,
      callCount: bindCall.callCount
    });
    if (bindCall.secondCall) {
      childBindingTrace('SECOND CALL DETECTED', {
        tokenHash: bindCall.tokenHash,
        childId: decodedToken.childId,
        callCount: bindCall.callCount,
        stack: new Error('SECOND CALL DETECTED').stack
      });
    }
    console.log('[child-binding-debug] B.token.repository', {
      childToken: normalized,
      tokenDecodeResult: decodedToken,
      childId: decodedToken?.childId ?? null,
      familyId: null
    });
    console.log('[child-token-entry] bindChildDeviceByToken start', { childToken: normalized });

    const binding = await this.resolveQrBindingByRpc(normalized, decodedToken.childId);
    bootstrapChildDeviceSession({
      token: normalized,
      childId: binding.child_id,
      childName: binding.child_name,
      familyId: binding.family_id,
      deviceBindingId: binding.id,
      deviceId: binding.device_id,
      boundAt: binding.used_at ?? new Date().toISOString(),
      birthDate: binding.child_birth_date ?? null,
      themeColor: binding.child_theme_color ?? null
    });
    childBindingTrace('bindChildDeviceByToken() 收到 RPC', {
      tokenHash: bindCall.tokenHash,
      childId: binding.child_id,
      familyId: binding.family_id,
      bindingStatus: binding.binding_status,
      qrTokenStatus: binding.qr_token_status,
      usedAt: binding.used_at
    });
    const child = this.cache.bindChildDeviceByToken(normalized, binding.family_id, {
      family_id: binding.family_id,
      child_id: binding.child_id,
      child_name: binding.child_name,
      expires_at: binding.expires_at,
      used_at: binding.used_at,
      revoked_at: binding.revoked_at
    });
    const state = this.cache.getState();
    childBindingTrace('create child session', {
      tokenHash: bindCall.tokenHash,
      childId: child.id,
      createdChildSession: state.device_child_id === child.id && state.deviceBinding === child.id
    });
    childBindingTrace('currentChildIdentity', {
      tokenHash: bindCall.tokenHash,
      childId: child.id,
      currentChildIdentityChildId: state.currentChildIdentity?.childId ?? null,
      currentChildIdentitySet: state.currentChildIdentity?.childId === child.id
    });
    childBindingTrace('save deviceBinding', {
      tokenHash: bindCall.tokenHash,
      childId: child.id,
      deviceBinding: state.deviceBinding,
      deviceChildId: state.device_child_id,
      saved: state.deviceBinding === child.id && state.device_child_id === child.id
    });
    childBindingTrace('bindChildDeviceByToken() 是否 navigate', {
      tokenHash: bindCall.tokenHash,
      childId: child.id,
      navigate: false,
      reason: 'navigate is executed by ChildTokenEntry after syncChildDeviceLogin'
    });
    console.log('[child-token-entry] bindChildDeviceByToken parsed token child', {
      childId: child.id,
      childToken: normalized,
      familyId: child.family_id
    });
    console.log('[child-binding-debug] D.repository.schedulePersistence', {
      repositoryName: this.constructor.name,
      method: 'bind_child_device_with_token',
      source: 'bindChildDeviceByToken',
      childId: child.id,
      familyId: child.family_id,
      skippedDirectTableWrite: true
    });
    return child;
  }

  private async resolveQrBindingByRpc(token: string, expectedChildId: UUID): Promise<SupabaseDeviceBindingRow> {
    if (!this.client) throw new LocalDataError('Supabase client is unavailable', 'SUPABASE_UNAVAILABLE');
    const state = this.cache.getState();
    const rawDeviceId = state.device_id ?? LOCAL_DEVICE_ID;
    const deviceId = toSupabaseUuid(rawDeviceId, SUPABASE_DEVICE_FALLBACK_ID);
    const request = {
      rpc: 'bind_child_device_with_token',
      payload: {
        p_token: token,
        p_device_id: deviceId,
        p_last_login_device: currentDeviceLabel()
      }
    };
    console.log('[child-binding-debug] E.supabase.bindChildDeviceWithToken.request', request);
    const tokenHash = hashForTrace(token);
    childBindingTrace('RPC Start', {
      tokenHash,
      rpc: request.rpc,
      childId: expectedChildId,
      deviceId
    });
    childBindingTrace('RPC request sent', {
      tokenHash,
      rpc: request.rpc,
      childId: expectedChildId,
      deviceId
    });
    const { data, error } = await this.client.rpc('bind_child_device_with_token', request.payload);
    childBindingTrace('RPC End', {
      tokenHash,
      rpc: request.rpc,
      childId: expectedChildId,
      error: error ? {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      } : null,
      rowCount: Array.isArray(data) ? data.length : null
    });
    childBindingTrace('RPC response received', {
      tokenHash,
      rpc: request.rpc,
      childId: expectedChildId,
      rowCount: Array.isArray(data) ? data.length : null,
      hasError: Boolean(error)
    });
    if (error) {
      childBindingTrace('RPC error', {
        tokenHash,
        rpc: request.rpc,
        childId: expectedChildId,
        errorCode: error.code ?? null,
        errorMessage: error.message ?? null,
        errorDetails: error.details ?? null,
        errorHint: error.hint ?? null
      });
    }
    console.log('[child-binding-debug] E.supabase.bindChildDeviceWithToken.response', {
      request,
      response: data,
      error
    });
    if (error) throw error;
    const rows = data as BindChildDeviceWithTokenRow[] | null;
    const row = requireBackendVerifiedChildBindingRow(rows?.[0] ?? null, expectedChildId);
    childBindingTrace('RPC success', {
      tokenHash,
      childId: row.id,
      bindingId: row.binding_id,
      tokenStatus: 'consumed',
      used_at: row.binding_used_at
    });
    childBindingTrace('binding record', {
      tokenHash,
      childId: row.id,
      bindingId: row.binding_id,
      familyId: row.family_id,
      childName: row.display_name,
      tokenStatus: 'consumed',
      bindingStatus: 'bound',
      expires_at: row.binding_expires_at,
      used_at: row.binding_used_at
    });
    return {
      id: row.binding_id,
      token,
      family_id: row.family_id,
      child_id: row.id,
      child_name: row.display_name,
      child_birth_date: row.birth_date,
      child_theme_color: row.theme_color,
      device_id: deviceId,
      expires_at: row.binding_expires_at,
      used_at: row.binding_used_at,
      revoked_at: null,
      last_login_at: row.binding_used_at,
      last_login_device: currentDeviceLabel(),
      binding_status: 'bound',
      qr_token_status: 'consumed',
      created_at: row.child_token_updated_at,
      updated_at: row.binding_used_at
    };
  }

  private async resolveQrBindingByToken(token: string, expectedChildId: UUID): Promise<SupabaseDeviceBindingRow> {
    if (!this.client) throw new LocalDataError('Supabase client is unavailable', 'SUPABASE_UNAVAILABLE');
    const request = {
      table: 'device_bindings',
      select: 'token,family_id,child_id,child_name,expires_at,used_at,revoked_at,qr_token_status,binding_status,device_id,last_login_at,last_login_device,created_at,updated_at',
      eq: { token, child_id: expectedChildId },
      maybeSingle: true
    };
    console.log('[child-binding-debug] E.supabase.qrBinding.request', request);
    const { data, error } = await this.client
      .from('device_bindings')
      .select('*')
      .eq('token', token)
      .eq('child_id', expectedChildId)
      .maybeSingle();
    console.log('[child-binding-debug] E.supabase.qrBinding.response', {
      request,
      response: data,
      error
    });
    if (error) throw error;
    const binding = data as SupabaseDeviceBindingRow | null;
    if (!binding) throw new LocalDataError('QR binding record not found', 'QR_BINDING_NOT_FOUND');
    if (binding.child_id !== expectedChildId) throw new LocalDataError('QR token does not match the requested child', 'QR_CHILD_MISMATCH');
    const timestamp = new Date().toISOString();
    if (binding.revoked_at || binding.qr_token_status === 'revoked') throw new LocalDataError('QR 已使用', 'QR_USED');
    if (binding.used_at || binding.qr_token_status === 'consumed') throw new LocalDataError('QR 已使用', 'QR_USED');
    if (binding.expires_at && binding.expires_at <= timestamp) throw new LocalDataError('QR 已過期', 'QR_EXPIRED');
    return binding;
  }

  private async resolveChildForBinding(binding: SupabaseDeviceBindingRow): Promise<SupabaseChildRow> {
    if (!this.client) throw new LocalDataError('Supabase client is unavailable', 'SUPABASE_UNAVAILABLE');
    const request = {
      table: 'children',
      select: 'id,family_id,display_name,status',
      eq: { id: binding.child_id },
      maybeSingle: true
    };
    console.log('[child-binding-debug] E.supabase.childForBinding.request', request);
    const { data, error } = await this.client
      .from('children')
      .select('*')
      .eq('id', binding.child_id)
      .maybeSingle();
    console.log('[child-binding-debug] E.supabase.childForBinding.response', {
      request,
      response: data,
      error
    });
    if (error) throw error;
    const child = data as SupabaseChildRow | null;
    if (!child || child.status !== 'active') throw new LocalDataError('找不到孩子', 'CHILD_NOT_FOUND');
    if (child.family_id !== binding.family_id) throw new LocalDataError('家庭驗證失敗', 'FAMILY_VERIFICATION_FAILED');
    return child;
  }

  private async resolveChildFamilyId(childId: UUID): Promise<UUID> {
    const cachedChild = this.cache.getState().children.find((child) => child.id === childId);
    if (cachedChild?.family_id && UUID_PATTERN.test(cachedChild.family_id)) {
      console.log('[child-binding-debug] B.familyId.cached', {
        childId,
        familyId: cachedChild.family_id,
        source: 'cache.children'
      });
      return cachedChild.family_id;
    }
    if (!this.client) throw new LocalDataError('Supabase client is unavailable', 'SUPABASE_UNAVAILABLE');
    const request = {
      table: 'children',
      select: 'family_id',
      eq: { id: childId },
      maybeSingle: true
    };
    console.log('[child-binding-debug] E.supabase.resolveFamilyId.request', request);
    const { data, error } = await this.client
      .from('children')
      .select('family_id')
      .eq('id', childId)
      .maybeSingle();
    console.log('[child-binding-debug] E.supabase.resolveFamilyId.response', {
      request,
      response: data,
      error,
      childId,
      familyId: data?.family_id ?? null
    });
    if (error) throw error;
    const familyId = data?.family_id;
    if (!familyId || !UUID_PATTERN.test(familyId)) {
      throw new LocalDataError('Child family id not found', 'CHILD_FAMILY_ID_NOT_FOUND');
    }
    return familyId;
  }

  syncChildDeviceLogin(childId: UUID): LocalChild {
    const child = this.cache.syncChildDeviceLogin(childId);
    console.log('[child-home] syncChildDeviceLogin', {
      childId,
      childToken: child.child_token,
      familyId: child.family_id,
      enteredSyncChildDeviceLogin: true
    });
    this.persistChildDeviceBindingInBackground(child, 'active', 'syncChildDeviceLogin');
    this.emit();
    return child;
  }

  private persistChildDeviceBindingInBackground(
    child: LocalChild,
    qrTokenStatus: LocalDeviceBinding['qr_token_status'],
    debugSource?: 'syncChildDeviceLogin' | 'bindChildDeviceByToken'
  ) {
    void this.persistChildDeviceBinding(child, qrTokenStatus, debugSource).catch((error) => {
      console.warn('[supabase-repository] child device binding persistence failed', error, {
        childId: child.id,
        familyId: child.family_id,
        qrTokenStatus
      });
    });
  }

  private async persistChildDeviceBinding(
    child: LocalChild,
    qrTokenStatus: LocalDeviceBinding['qr_token_status'],
    debugSource?: 'syncChildDeviceLogin' | 'bindChildDeviceByToken'
  ) {
    const binding = this.cache
      .listDeviceBindings(child.id)
      .filter((record) => record.binding_status === 'bound' && Boolean(record.used_at))
      .sort((first, second) => second.updated_at.localeCompare(first.updated_at))[0] ?? null;
    await this.upsertDeviceBindingToSupabase(child.id, 'bound', 'consumed', {
      lastLoginAt: binding?.last_login_at ?? null,
      lastLoginDevice: binding?.last_login_device ?? null
    }, debugSource);
    this.queuePush();
    this.hydrateFromSupabase();
  }

  async regenerateChildToken(childId: UUID): Promise<LocalChild> {
    const child = this.cache.regenerateChildToken(childId);
    const requestPayload = {
      childId,
      child: toSupabaseChild(child, child.family_id),
      deviceBinding: this.buildDeviceBindingRecord(child.id, 'unbound', 'active')
    };
    const childUrl = childDeviceUrlFromToken(child.child_token);
    console.log('[parent-children] regenerateChildToken request', {
      childId,
      regenerateRequestPayload: requestPayload,
      newToken: child.child_token,
      newChildUrl: childUrl
    });
    try {
      await this.upsertRevokedDeviceBindingsForChildToSupabase(child.id, 'regenerateChildToken');
      await Promise.all([
        this.upsertChildToSupabase(child, 'regenerateChildToken'),
        this.upsertDeviceBindingToSupabase(child.id, 'unbound', 'active', {}, 'regenerateChildToken')
      ]);
      this.queuePush();
      this.emit();
      this.hydrateFromSupabase();
      console.log('[parent-children] regenerateChildToken success', {
        childId,
        newToken: child.child_token,
        newChildUrl: childUrl
      });
      return child;
    } catch (error) {
      console.warn('[supabase-repository] child token regeneration sync failed', error);
      throw error;
    }
  }

  private buildDeviceBindingRecord(
    childId: UUID,
    bindingStatus: LocalDeviceBinding['binding_status'],
    qrTokenStatus: LocalDeviceBinding['qr_token_status'],
    input: { lastLoginAt?: string | null; lastLoginDevice?: string | null } = {}
  ): SupabaseDeviceBindingRow | null {
    const state = this.cache.getState();
    const child = state.children.find((item) => item.id === childId);
    if (!child) return null;
    const timestamp = new Date().toISOString();
    const rawDeviceId = state.device_id ?? LOCAL_DEVICE_ID;
    const deviceId = toSupabaseUuid(rawDeviceId, SUPABASE_DEVICE_FALLBACK_ID);
    const familyId = child.family_id;
    if (!UUID_PATTERN.test(familyId)) {
      throw new LocalDataError('Child family id must be a UUID before syncing device binding', 'CHILD_FAMILY_ID_INVALID');
    }
    console.log('[child-binding-debug] C.device.payload', {
      childId,
      rawDeviceId,
      supabaseDeviceId: deviceId,
      usedFallbackDeviceId: rawDeviceId !== deviceId,
      familyId,
      bindingStatus,
      qrTokenStatus,
      lastLoginAt: input.lastLoginAt ?? null,
      lastLoginDevice: input.lastLoginDevice ?? null
    });
    return {
      id: `${childId}:${deviceId}`,
      token: child.child_token,
      family_id: familyId,
      child_id: childId,
      child_name: child.display_name,
      device_id: deviceId,
      expires_at: child.child_token_consumed_at
        ? new Date(new Date(child.child_token_updated_at).getTime() + 24 * 60 * 60 * 1000).toISOString()
        : new Date(timestamp).getTime() > new Date(child.child_token_updated_at).getTime()
          ? new Date(new Date(child.child_token_updated_at).getTime() + 24 * 60 * 60 * 1000).toISOString()
          : new Date(new Date(timestamp).getTime() + 24 * 60 * 60 * 1000).toISOString(),
      used_at: child.child_token_consumed_at,
      revoked_at: qrTokenStatus === 'revoked' ? timestamp : null,
      last_login_at: input.lastLoginAt ?? null,
      last_login_device: input.lastLoginDevice ?? null,
      binding_status: bindingStatus,
      qr_token_status: qrTokenStatus,
      created_at: timestamp,
      updated_at: timestamp
    };
  }

  private async upsertRevokedDeviceBindingsForChildToSupabase(childId: UUID, debugSource?: 'regenerateChildToken') {
    if (!this.client) return;
    const timestamp = new Date().toISOString();
    const result = await this.client
      .from('device_bindings')
      .update({
        binding_status: 'unbound',
        qr_token_status: 'revoked',
        last_login_at: null,
        last_login_device: null,
        updated_at: timestamp
      })
      .eq('child_id', childId);
    if (debugSource === 'regenerateChildToken') {
      console.log('[parent-children] regenerateChildToken revoke Supabase result', result);
      console.log('[parent-children] regenerateChildToken revoke Supabase error', result.error ?? null);
    }
    if (result.error) throw result.error;
  }

  private async selectDeviceBindingsForDebug(childId: UUID, phase: 'before-login' | 'after-login', source?: string) {
    if (!this.client) return null;
    const request = {
      table: 'device_bindings',
      select: 'token,child_id,child_name,family_id,device_id,expires_at,used_at,revoked_at,binding_status,qr_token_status,last_login_at,last_login_device,created_at,updated_at',
      eq: { child_id: childId },
      order: { column: 'updated_at', ascending: false }
    };
    console.log('[child-binding-debug] F.device_bindings.request', {
      phase,
      source,
      request
    });
    const result = await this.client
      .from('device_bindings')
      .select(request.select)
      .eq('child_id', childId)
      .order('updated_at', { ascending: false });
    console.log('[child-binding-debug] F.device_bindings.response', {
      phase,
      source,
      request,
      rows: result.data ?? [],
      rowCount: result.count ?? result.data?.length ?? 0,
      error: result.error ?? null
    });
    return result;
  }

  unbindChildDevice(childId: UUID): LocalChild {
    const child = this.cache.unbindChildDevice(childId);
    void this.upsertDeviceBindingToSupabase(child.id, 'unbound', 'revoked', {
      lastLoginAt: null,
      lastLoginDevice: null
    }).catch((error) => {
      console.warn('[supabase-repository] device binding unbind sync failed', error);
    });
    this.queuePush();
    return child;
  }

  listDeviceBindings(childId?: UUID): LocalDeviceBinding[] {
    this.hydrateFromSupabase();
    return this.cache.listDeviceBindings(childId);
  }

  createTask = this.delegateWrite('createTask');
  completeTask = this.delegateWrite('completeTask');
  approveTask = this.delegateWrite('approveTask');
  listTasks(childId?: UUID): LocalTask[] {
    if (childId && this.canUseChildScopedSession(childId)) {
      return this.getChildScopedState(childId).tasks
        .filter((task) => task.child_id === childId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return this.cache.listTasks(childId);
  }

  getStarBalance(childId: UUID): number {
    const state = this.getChildScopedState(childId);
    return sum(state.stars.filter((item) => item.child_id === childId).map((item) => item.amount));
  }

  listStarTransactions(childId: UUID): LocalStarTransaction[] {
    const state = this.getChildScopedState(childId);
    return state.stars
      .filter((item) => item.child_id === childId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  createDream = this.delegateWrite('createDream');
  migrateDreamCoverToMedia = this.delegateWrite('migrateDreamCoverToMedia');
  deleteDream = this.delegateWrite('deleteDream');
  addDreamDeposit = this.delegateWrite('addDreamDeposit');
  completeDream = this.delegateWrite('completeDream');
  listDreams = this.delegate('listDreams');
  createShare = this.delegateWrite('createShare');
  updateShareMediaStorage = this.delegateWrite('updateShareMediaStorage');
  listShares(childId?: UUID): ShareWithMedia[] {
    if (childId && this.canUseChildScopedSession(childId)) {
      const state = this.getChildScopedState(childId);
      return state.shares
        .filter((share) => !share.deleted_at && share.child_id === childId)
        .map((share) => ({
          ...share,
          media: state.share_media
            .filter((media) => media.share_id === share.id)
            .sort((a, b) => a.sort_order - b.sort_order)
        }))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return this.cache.listShares(childId);
  }

  deleteShare = this.delegateWrite('deleteShare');
  approveShare = this.delegateWrite('approveShare');
  createMailboxMessage = this.delegateWrite('createMailboxMessage');
  markMessageRead = this.delegateWrite('markMessageRead');
  listMailboxMessages(childId?: UUID): LocalMailboxMessage[] {
    if (childId && this.canUseChildScopedSession(childId)) {
      return this.getChildScopedState(childId).encouragement_cards
        .filter((message) => message.child_id === childId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return this.cache.listMailboxMessages(childId);
  }

  createBadge = this.delegateWrite('createBadge');
  deleteBadge = this.delegateWrite('deleteBadge');
  awardBadge = this.delegateWrite('awardBadge');
  getBadges(includeDeleted = false): LocalBadge[] {
    const session = getChildSession();
    if (!runtimeInfo.familyId && isChildSessionValid(session)) {
      return scopeStateToChildSession(this.cache.getState(), session).badges
        .filter((badge) => includeDeleted || !badge.deleted_at)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return this.cache.getBadges(includeDeleted);
  }

  getChildBadges(childId?: UUID): LocalChildBadge[] {
    if (childId && this.canUseChildScopedSession(childId)) {
      return this.getChildScopedState(childId).child_badges
        .filter((badge) => badge.child_id === childId)
        .sort((a, b) => b.awarded_at.localeCompare(a.awarded_at));
    }
    return this.cache.getChildBadges(childId);
  }
  createSpecialDay = this.delegateWrite('createSpecialDay');
  updateSpecialDay = this.delegateWrite('updateSpecialDay');
  deleteSpecialDay = this.delegateWrite('deleteSpecialDay');
  getSpecialDays(childId?: UUID | null, includeDeleted = false): LocalSpecialDay[] {
    if (childId && this.canUseChildScopedSession(childId)) {
      return this.getChildScopedState(childId).special_days
        .filter((day) => (includeDeleted || !day.deleted_at) && (!day.child_id || day.child_id === childId))
        .sort((a, b) => a.date.localeCompare(b.date));
    }
    return this.cache.getSpecialDays(childId, includeDeleted);
  }

  getUpcomingSpecialDays(childId?: UUID | null, limit = 5): LocalSpecialDay[] {
    if (childId && this.canUseChildScopedSession(childId)) {
      const today = todayIsoDate();
      return this.getSpecialDays(childId)
        .filter((day) => day.date >= today)
        .slice(0, limit);
    }
    return this.cache.getUpcomingSpecialDays(childId, limit);
  }
  getSettings = this.delegate('getSettings');
  updateSettings = this.delegateWrite('updateSettings');
  exportData = this.delegate('exportData');
  importData = this.delegateWrite('importData');
  resetAllData = this.delegateWrite('resetAllData');
  resetDemoData = this.delegateWrite('resetDemoData');

  async previewTestDataCleanup(familyId?: UUID | null): Promise<TestDataCleanupPreview> {
    if (!this.client) return this.cache.previewTestDataCleanup(familyId);
    const { data, error } = await this.client.rpc('preview_test_data_cleanup', {
      p_family_id: familyId ?? SUPABASE_FAMILY_ID
    });
    if (error) throw error;
    const row = firstRpcRow(data as { family_id: UUID; counts: Record<string, number> }[] | { family_id: UUID; counts: Record<string, number> } | null);
    if (!row?.family_id || !row.counts) throw new LocalDataError('Cleanup preview response is invalid', 'CLEANUP_PREVIEW_INVALID');
    return { familyId: row.family_id, counts: row.counts };
  }

  async executeTestDataCleanup(input: { familyId?: UUID | null; removeFamily?: boolean } = {}): Promise<TestDataCleanupResult> {
    if (!this.client) {
      const result = this.cache.executeTestDataCleanup(input);
      clearChildSession();
      return result;
    }
    const { data, error } = await this.client.rpc('execute_test_data_cleanup', {
      p_family_id: input.familyId ?? SUPABASE_FAMILY_ID,
      p_remove_family: Boolean(input.removeFamily)
    });
    if (error) throw error;
    const row = firstRpcRow(data as {
      family_id: UUID;
      removed_family: boolean;
      deleted_counts: Record<string, number>;
      preserved: Record<string, string>;
    }[] | {
      family_id: UUID;
      removed_family: boolean;
      deleted_counts: Record<string, number>;
      preserved: Record<string, string>;
    } | null);
    if (!row?.family_id || !row.deleted_counts) throw new LocalDataError('Cleanup result response is invalid', 'CLEANUP_RESULT_INVALID');
    clearChildSession();
    this.cache.executeTestDataCleanup({ familyId: row.family_id, removeFamily: row.removed_family });
    this.hydrateFromSupabase();
    return {
      familyId: row.family_id,
      removedFamily: row.removed_family,
      deletedCounts: row.deleted_counts,
      preserved: row.preserved ?? {}
    };
  }

  updateScreenTime = this.delegateWrite('updateScreenTime');
  createScreenTimeRequest = this.delegateWrite('createScreenTimeRequest');
  reviewScreenTimeRequest = this.delegateWrite('reviewScreenTimeRequest');
  listScreenTimeRequests = this.delegate('listScreenTimeRequests');
  getScreenTimeBalance(childId: UUID): number {
    const state = this.getChildScopedState(childId);
    return getScreenTimeLedgerBalance(state, childId);
  }

  listScreenTimeLogs(childId: UUID): LocalScreenTimeLog[] {
    return this.getScreenTimeLogsByChild(childId);
  }
  getWeeklyScreenTime = this.delegate('getWeeklyScreenTime');
  updatePlannedScreenTime = this.delegateWrite('updatePlannedScreenTime');
  redeemStarsForScreenTime = this.delegateWrite('redeemStarsForScreenTime');
  addScreenTime = this.delegateWrite('addScreenTime');
  deductScreenTimePenalty = this.delegateWrite('deductScreenTimePenalty');
  recordScreenTimeUsed = this.delegateWrite('recordScreenTimeUsed');
  getScreenTimeLogsByChild(childId: UUID): LocalScreenTimeLog[] {
    const state = this.getChildScopedState(childId);
    return state.screen_time_logs
      .filter((item) => item.child_id === childId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  getTodayScreenTimeByChild(childId: UUID): WeeklyScreenTimeDay {
    const state = this.getChildScopedState(childId);
    const date = todayIsoDate();
    const logs = state.screen_time_logs.filter((log) => log.child_id === childId && (log.date ?? log.created_at.slice(0, 10)) === date);
    const sumMinutes = (type: NonNullable<LocalScreenTimeLog['type']>) =>
      sum(logs.filter((log) => normalizeScreenLogType(log) === type).map((log) => Math.abs(log.minutes ?? log.minutes_delta)));
    return {
      date,
      weekday: new Intl.DateTimeFormat('zh-TW', { weekday: 'short' }).format(new Date(`${date}T00:00:00`)),
      plannedMinutes: 0,
      redeemedMinutes: sumMinutes('redeem'),
      manualAddedMinutes: sumMinutes('manual_add'),
      penaltyMinutes: sumMinutes('penalty'),
      usedMinutes: sumMinutes('used'),
      remainingMinutes: getScreenTimeLedgerBalance(state, childId)
    };
  }

  createGrowthRecord = this.delegateWrite('createGrowthRecord');
  updateGrowthRecord = this.delegateWrite('updateGrowthRecord');
  deleteGrowthRecord = this.delegateWrite('deleteGrowthRecord');
  getGrowthRecords(childId?: UUID): LocalGrowthRecord[] {
    if (childId && this.canUseChildScopedSession(childId)) {
      return this.getChildScopedState(childId).growth_records
        .filter((record) => record.child_id === childId)
        .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
    }
    return this.cache.getGrowthRecords(childId);
  }

  getLatestGrowthRecordByChild(childId: UUID): LocalGrowthRecord | null {
    return this.getGrowthRecordsByChild(childId)[0] ?? null;
  }

  getGrowthRecordsByChild(childId: UUID): LocalGrowthRecord[] {
    return this.getGrowthRecords(childId);
  }

  listNotifications = this.delegate('listNotifications');
  markNotificationRead = this.delegateWrite('markNotificationRead');
  addPiggyIncome = this.delegateWrite('addPiggyIncome');
  depositPiggyCoin = this.delegateWrite('depositPiggyCoin');
  getPiggyBankSummary(childId: UUID): PiggyBankSummary {
    const state = this.getChildScopedState(childId);
    const date = todayIsoDate();
    const currentSavings = sum(
      state.piggy_bank_logs
        .filter((log) => log.child_id === childId)
        .map((log) => (log.type === 'coin_deposit' || log.type === 'purchase_refund' ? log.amount : -log.amount))
    );
    return {
      currentSavings,
      availableToDepositToday: sum(
        state.piggy_incomes
          .filter((income) => income.child_id === childId && income.created_at.slice(0, 10) === date)
          .map((income) => income.remaining_amount)
      ),
      depositedToday: sum(
        state.piggy_bank_logs
          .filter((log) => log.child_id === childId && log.type === 'coin_deposit' && log.created_at.slice(0, 10) === date)
          .map((log) => log.amount)
      )
    };
  }

  getPiggyIncomeRecords(childId?: UUID): LocalPiggyIncome[] {
    if (childId && this.canUseChildScopedSession(childId)) {
      return this.getChildScopedState(childId).piggy_incomes
        .filter((income) => income.child_id === childId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return this.cache.getPiggyIncomeRecords(childId);
  }

  getPiggyBankLogs(childId?: UUID): LocalPiggyBankLog[] {
    if (childId && this.canUseChildScopedSession(childId)) {
      return this.getChildScopedState(childId).piggy_bank_logs
        .filter((log) => log.child_id === childId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return this.cache.getPiggyBankLogs(childId);
  }

  createPiggyProduct = this.delegateWrite('createPiggyProduct');
  updatePiggyProduct = this.delegateWrite('updatePiggyProduct');
  deletePiggyProduct = this.delegateWrite('deletePiggyProduct');
  listPiggyProducts(childId?: UUID, includeDeleted = false): LocalPiggyProduct[] {
    if (childId && this.canUseChildScopedSession(childId)) {
      return this.getChildScopedState(childId).piggy_products
        .filter((product) => product.child_id === childId && (includeDeleted || !product.deleted_at))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    }
    return this.cache.listPiggyProducts(childId, includeDeleted);
  }
  setPiggyProductShelfStatus = this.delegateWrite('setPiggyProductShelfStatus');
  savePiggyShelfOrder = this.delegateWrite('savePiggyShelfOrder');
  getPiggyShelfProducts(childId: UUID): LocalPiggyProduct[] {
    return this.listPiggyProducts(childId).filter((product) => product.shelf_status === 'shelf');
  }

  getPiggyProductDisplaySettings(childId: UUID): LocalPiggyProductDisplaySettings | null {
    if (this.canUseChildScopedSession(childId)) {
      return this.getChildScopedState(childId).piggyProductDisplaySettings
        .filter((settings) => settings.child_id === childId)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;
    }
    return this.cache.getPiggyProductDisplaySettings(childId);
  }
  savePiggyProductDisplaySettings = this.delegateWrite('savePiggyProductDisplaySettings');
  requestPiggyPurchase = this.delegateWrite('requestPiggyPurchase');
  cancelPiggyPurchase = this.delegateWrite('cancelPiggyPurchase');
  completePiggyPurchase = this.delegateWrite('completePiggyPurchase');
  confirmPiggyPurchaseArrived = this.delegateWrite('confirmPiggyPurchaseArrived');
  listPiggyPurchases(childId?: UUID): LocalPiggyPurchase[] {
    if (childId && this.canUseChildScopedSession(childId)) {
      return this.getChildScopedState(childId).piggy_purchases
        .filter((purchase) => purchase.child_id === childId)
        .sort((a, b) => (b.purchased_at ?? b.cancelled_at ?? b.requested_at).localeCompare(a.purchased_at ?? a.cancelled_at ?? a.requested_at));
    }
    return this.cache.listPiggyPurchases(childId);
  }
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
    const childSession = getChildSession();
    if (!runtimeInfo.familyId && isChildSessionValid(childSession)) {
      this.hydratePromise = traceTimingPromise(
        'Child repository hydrate',
        () => this.fetchChildScopedSupabaseState(childSession),
        { childId: childSession.childId, familyId: childSession.familyId }
      )
        .then((remoteState) => {
          if (!remoteState) return;
          const currentState = scopeStateToChildSession(this.cache.getState(), childSession);
          this.cache.importData(JSON.stringify(mergeRemoteState(currentState, remoteState)));
          this.emit();
          this.subscribeToChildScopedSupabaseChanges(childSession);
        })
        .catch((error) => {
          console.warn('[supabase-repository] child hydrate failed', error);
          this.scheduleChildScopedRetry();
        })
        .finally(() => {
          this.hydratePromise = null;
        });
      return;
    }

    if (!runtimeInfo.familyId) return;
    this.hydratePromise = traceTimingPromise(
      'Repository hydrate',
      () => this.fetchSupabaseState(),
      { familyId: runtimeInfo.familyId }
    )
      .then((remoteState) => {
        if (!remoteState) return;
        const currentState = scopeStateToCurrentFamily(this.cache.getState());
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

  private async fetchChildScopedSupabaseState(session: NonNullable<ReturnType<typeof getChildSession>>): Promise<LocalDatabaseState | null> {
    if (!this.client || !isChildSessionValid(session)) return null;
    const { data, error } = await this.client.rpc('get_child_scoped_repository_state', {
      p_child_id: session.childId,
      p_device_binding_id: session.deviceBindingId,
      p_device_id: session.deviceId
    });
    if (error) throw error;
    const snapshot = data as ChildScopedRepositorySnapshot | null;
    if (!snapshot?.family_id || snapshot.child_id !== session.childId || !snapshot.child) {
      throw new LocalDataError('Child scoped repository response is invalid', 'CHILD_SYNC_RESPONSE_INVALID');
    }
    return fromChildScopedSupabaseSnapshot(snapshot, scopeStateToChildSession(this.cache.getState(), session), session);
  }

  private async fetchSupabaseState(): Promise<LocalDatabaseState | null> {
    if (!this.client || !runtimeInfo.familyId) return null;
    const state = scopeStateToCurrentFamily(this.cache.getState());
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
      traceTimingPromise(
        'Children hydrate',
        () => this.client!.from('children').select('*').eq('family_id', SUPABASE_FAMILY_ID).order('created_at'),
        { familyId: SUPABASE_FAMILY_ID }
      ),
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
    const baseState = scopeStateToCurrentFamily(parentState ?? state);
    const remoteDeviceBindings = ((bindings ?? []) as SupabaseDeviceBindingRow[]).map(fromSupabaseDeviceBinding);
    const mergedDeviceBindings = mergeDeviceBindings(baseState.device_bindings, remoteDeviceBindings);
    const mergedChildren = mergeChildren(baseState.children, remoteChildren).filter(
      (child) => child.family_id === SUPABASE_FAMILY_ID
    );
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
    return scopeStateToCurrentFamily({
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
      device_bindings: mergedDeviceBindings,
      pendingBindingChildId:
        baseState.pendingBindingChildId && mergedChildren.some((child) => child.id === baseState.pendingBindingChildId)
          ? baseState.pendingBindingChildId
          : null,
      active_child_id: baseState.active_child_id ?? mergedChildren.find((child) => child.status === 'active')?.id ?? null,
      updated_at: updatedAt
    });
  }

  private queuePush() {
    if (!this.client || !runtimeInfo.familyId) return;
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

  private queueChildScopedPush() {
    const session = getChildSession();
    if (!this.client || runtimeInfo.familyId || !isChildSessionValid(session)) return;
    this.pendingChildPush = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.childPushPromise) return;
    this.childPushPromise = this.flushChildScopedPush(session)
      .catch((error) => {
        console.warn('[supabase-repository] child sync failed', error);
        this.scheduleChildScopedRetry();
      })
      .finally(() => {
        this.childPushPromise = null;
        if (this.pendingChildPush && !this.retryTimer) this.queueChildScopedPush();
      });
  }

  private async flushChildScopedPush(session: NonNullable<ReturnType<typeof getChildSession>>) {
    if (!this.client || runtimeInfo.familyId || !this.pendingChildPush || !isChildSessionValid(session)) return;
    this.pendingChildPush = false;
    const state = toChildScopedSupabasePayload(scopeStateToChildSession(this.cache.getState(), session), session);
    const { error } = await this.client.rpc('sync_child_scoped_repository_delta', {
      p_child_id: session.childId,
      p_device_binding_id: session.deviceBindingId,
      p_device_id: session.deviceId,
      p_payload: state
    });
    if (error) throw error;
    this.lastRemoteUpdatedAt = new Date().toISOString();
    this.retryAttempt = 0;
    this.hydrateFromSupabase();
  }

  private async flushPush() {
    if (!this.client || !runtimeInfo.familyId || !this.pendingPush) return;
    this.pendingPush = false;
    const state = toSupabaseRepositoryState(scopeStateToCurrentFamily(this.cache.getState()));
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
    const children = state.children.map((child) => toSupabaseChild(child, child.family_id));
    if (children.length) {
      const { error } = await this.client.from('children').upsert(children, { onConflict: 'id' });
      if (error) throw error;
    }

    const bindings = state.device_bindings
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
    if (!this.client || !runtimeInfo.familyId || this.retryTimer) return;
    this.pendingPush = true;
    const delay = SYNC_RETRY_DELAYS_MS[Math.min(this.retryAttempt, SYNC_RETRY_DELAYS_MS.length - 1)];
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.hydrateFromSupabase();
      this.queuePush();
    }, delay);
  }

  private scheduleChildScopedRetry() {
    const session = getChildSession();
    if (!this.client || runtimeInfo.familyId || !isChildSessionValid(session) || this.retryTimer) return;
    const delay = SYNC_RETRY_DELAYS_MS[Math.min(this.retryAttempt, SYNC_RETRY_DELAYS_MS.length - 1)];
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.hydrateFromSupabase();
      if (this.pendingChildPush) this.queueChildScopedPush();
    }, delay);
  }

  private subscribeToSupabaseChanges() {
    if (!this.client || !runtimeInfo.familyId || this.realtimeChannel) return;
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

  private subscribeToChildScopedSupabaseChanges(session: NonNullable<ReturnType<typeof getChildSession>>) {
    if (!this.client || runtimeInfo.familyId || this.realtimeChannel || !isChildSessionValid(session)) return;
    const childFilter = `child_id=eq.${session.childId}`;
    this.realtimeChannel = this.client
      .channel(`little-dreamers-child-repository:${session.childId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'device_bindings', filter: childFilter }, () => this.hydrateFromSupabase())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: childFilter }, () => this.hydrateFromSupabase())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_records', filter: childFilter }, () => this.hydrateFromSupabase())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stars', filter: childFilter }, () => this.hydrateFromSupabase())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'piggy_bank_records', filter: childFilter }, () => this.hydrateFromSupabase())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_items', filter: childFilter }, () => this.hydrateFromSupabase())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases', filter: childFilter }, () => this.hydrateFromSupabase())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dreams', filter: childFilter }, () => this.hydrateFromSupabase())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dream_funds', filter: childFilter }, () => this.hydrateFromSupabase())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shares', filter: childFilter }, () => this.hydrateFromSupabase())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'share_media', filter: childFilter }, () => this.hydrateFromSupabase())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'encouragement_cards', filter: childFilter }, () => this.hydrateFromSupabase())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'special_days', filter: childFilter }, () => this.hydrateFromSupabase())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'growth_records', filter: childFilter }, () => this.hydrateFromSupabase())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tablet_time', filter: childFilter }, () => this.hydrateFromSupabase())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'child_badges', filter: childFilter }, () => this.hydrateFromSupabase())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') this.hydrateFromSupabase();
      });
  }

  private async upsertChildToSupabase(child: LocalChild, debugSource?: 'regenerateChildToken') {
    if (!this.client) return;
    const result = await this.client
      .from('children')
      .upsert(toSupabaseChild(child, child.family_id), { onConflict: 'id' });
    const { error } = result;
    if (debugSource === 'regenerateChildToken') {
      console.log('[parent-children] regenerateChildToken child Supabase result', result);
      console.log('[parent-children] regenerateChildToken child Supabase error', error ?? null);
    }
    if (error) {
      console.warn('[supabase-repository] child upsert failed', error);
      throw error;
    }
  }

  private async upsertDeviceBindingToSupabase(
    childId: UUID,
    bindingStatus: LocalDeviceBinding['binding_status'],
    qrTokenStatus: LocalDeviceBinding['qr_token_status'],
    input: { lastLoginAt?: string | null; lastLoginDevice?: string | null } = {},
    debugSource?: 'syncChildDeviceLogin' | 'regenerateChildToken' | 'bindChildDeviceByToken'
  ) {
    if (!this.client) return;
    const child = this.cache.getState().children.find((item) => item.id === childId);
    const record = this.buildDeviceBindingRecord(childId, bindingStatus, qrTokenStatus, input);
    if (!child || !record) return;
    const beforeBindings = await this.selectDeviceBindingsForDebug(childId, 'before-login', debugSource);
    if (debugSource === 'syncChildDeviceLogin' || debugSource === 'bindChildDeviceByToken') {
      console.log('[child-device-binding] deviceBinding payload', {
        source: debugSource,
        childId,
        childToken: child.child_token,
        childFamilyId: child.family_id,
        deviceBinding: record
      });
    }
    const updatePayload = {
      id: record.id,
      family_id: record.family_id,
      token: record.token,
      child_name: record.child_name,
      expires_at: record.expires_at,
      used_at: record.used_at,
      revoked_at: record.revoked_at,
      device_id: record.device_id,
      last_login_at: record.last_login_at,
      last_login_device: record.last_login_device,
      binding_status: record.binding_status,
      qr_token_status: record.qr_token_status,
      updated_at: record.updated_at
    };
    const updateRequest = {
      table: 'device_bindings',
      operation: 'update',
      payload: updatePayload,
      where: record.token && debugSource === 'bindChildDeviceByToken'
        ? { token: record.token }
        : {
            child_id: record.child_id,
            device_id: record.device_id
          },
      select: 'id'
    };
    console.log('[child-binding-debug] E.supabase.update.request', {
      source: debugSource,
      childId,
      request: updateRequest
    });
    const updateQuery = this.client
      .from('device_bindings')
      .update(updatePayload);
    const scopedUpdateQuery = record.token && debugSource === 'bindChildDeviceByToken'
      ? updateQuery.eq('token', record.token)
      : updateQuery.eq('child_id', record.child_id).eq('device_id', record.device_id);
    const updateResult = await scopedUpdateQuery.select('id');
    console.log('[child-binding-debug] E.supabase.update.response', {
      source: debugSource,
      childId,
      request: updateRequest,
      response: updateResult.data ?? [],
      affectedRows: updateResult.count ?? updateResult.data?.length ?? 0,
      error: updateResult.error ?? null
    });
    if (debugSource === 'syncChildDeviceLogin' || debugSource === 'bindChildDeviceByToken') {
      console.log('[child-device-binding] Supabase update result', {
        source: debugSource,
        childId,
        childToken: child.child_token,
        where: {
          child_id: record.child_id,
          device_id: record.device_id
        },
        updateRowCount: updateResult.count ?? updateResult.data?.length ?? 0,
        result: updateResult
      });
      console.log('[child-device-binding] Supabase update error', updateResult.error ?? null);
    }
    if (updateResult.error) {
      console.warn('[supabase-repository] device binding update failed', updateResult.error, {
        childId,
        familyId: record.family_id,
        deviceId: record.device_id,
        bindingStatus,
        qrTokenStatus
      });
      throw updateResult.error;
    }
    const updateRowCount = updateResult.count ?? updateResult.data?.length ?? 0;
    if (updateRowCount > 0) {
      const afterBindings = await this.selectDeviceBindingsForDebug(childId, 'after-login', debugSource);
      console.log('[child-binding-debug] F.device_bindings.diff', {
        source: debugSource,
        childId,
        before: beforeBindings?.data ?? [],
        after: afterBindings?.data ?? [],
        comparedFields: [
          'binding_status',
          'qr_token_status',
          'last_login_at',
          'last_login_device',
          'device_id',
          'family_id'
        ]
      });
      console.log('[child-device-binding] final affected row count', {
        source: debugSource,
        childId,
        operation: 'update',
        updateRowCount,
        insertRowCount: 0
      });
      return;
    }
    console.warn('[child-device-binding] update matched zero rows; inserting new binding', {
      source: debugSource,
      childId,
      reason: 'No device_bindings row matched child_id and device_id',
      where: {
        child_id: record.child_id,
        device_id: record.device_id
      }
    });
    const insertRequest = {
      table: 'device_bindings',
      operation: 'insert',
      payload: record,
      select: 'id'
    };
    console.log('[child-binding-debug] E.supabase.insert.request', {
      source: debugSource,
      childId,
      request: insertRequest
    });
    const insertResult = await this.client
      .from('device_bindings')
      .insert(record)
      .select('id');
    console.log('[child-binding-debug] E.supabase.insert.response', {
      source: debugSource,
      childId,
      request: insertRequest,
      response: insertResult.data ?? [],
      affectedRows: insertResult.count ?? insertResult.data?.length ?? 0,
      error: insertResult.error ?? null
    });
    if (debugSource === 'syncChildDeviceLogin' || debugSource === 'bindChildDeviceByToken') {
      console.log('[child-device-binding] Supabase insert result', {
        source: debugSource,
        childId,
        childToken: child.child_token,
        insertRowCount: insertResult.count ?? insertResult.data?.length ?? 0,
        result: insertResult
      });
      console.log('[child-device-binding] Supabase insert error', insertResult.error ?? null);
    }
    if (debugSource === 'regenerateChildToken') {
      console.log('[parent-children] regenerateChildToken binding Supabase update result', updateResult);
      console.log('[parent-children] regenerateChildToken binding Supabase insert result', insertResult);
      console.log('[parent-children] regenerateChildToken binding Supabase error', insertResult.error ?? null);
    }
    if (insertResult.error) {
      console.warn('[supabase-repository] device binding insert failed', insertResult.error, {
        childId,
        familyId: record.family_id,
        deviceId: record.device_id,
        bindingStatus,
        qrTokenStatus
      });
      throw insertResult.error;
    }
    const afterBindings = await this.selectDeviceBindingsForDebug(childId, 'after-login', debugSource);
    console.log('[child-binding-debug] F.device_bindings.diff', {
      source: debugSource,
      childId,
      before: beforeBindings?.data ?? [],
      after: afterBindings?.data ?? [],
      comparedFields: [
        'binding_status',
        'qr_token_status',
        'last_login_at',
        'last_login_device',
        'device_id',
        'family_id'
      ]
    });
    console.log('[child-device-binding] final affected row count', {
      source: debugSource,
      childId,
      operation: 'insert',
      updateRowCount,
      insertRowCount: insertResult.count ?? insertResult.data?.length ?? 0
    });
  }

  private emit() {
    const state = scopeStateToCurrentFamily(this.cache.getState());
    console.log(`${runtimeTimestamp()} repository emit`, {
      children: state.children.length,
      updatedAt: state.updated_at,
      listeners: this.listeners.size
    });
    this.listeners.forEach((listener) => listener(state));
  }
}

function readRepositoryState(settings: SupabaseParentRow['settings']): LocalDatabaseState | null {
  const state = settings?.repository_state;
  if (!state || state.schema_version !== 1 || !Array.isArray(state.children)) return null;
  return state;
}

function childDeviceUrlFromToken(token: string) {
  const productionOrigin = 'https://dreamersfamily.pages.dev';
  const origin = typeof window !== 'undefined' && !window.location.hostname.includes('localhost')
    ? window.location.origin
    : productionOrigin;
  return `${origin}/child/${token}`;
}

function scopeStateToChildSession(state: LocalDatabaseState, session: ValidChildSession): LocalDatabaseState {
  const familyId = session.familyId;
  const childId = session.childId;
  const keepChild = <T extends { family_id: UUID; child_id: UUID }>(items: T[]) =>
    items.filter((item) => item.family_id === familyId && item.child_id === childId);
  const keepOptionalChild = <T extends { family_id: UUID; child_id: UUID | null }>(items: T[]) =>
    items.filter((item) => item.family_id === familyId && (!item.child_id || item.child_id === childId));
  const keepChildId = <T extends { childId: UUID }>(items: T[]) => items.filter((item) => item.childId === childId);
  const child = state.children.find((item) => item.id === childId && item.family_id === familyId) ?? null;

  return {
    ...state,
    family_id: familyId,
    parent_id: state.parent_id,
    current_user_id: childId,
    active_child_id: childId,
    pendingBindingChildId: null,
    deviceBinding: childId,
    device_child_id: childId,
    currentChildIdentity: {
      childId,
      displayName: child?.display_name ?? session.childName,
      boundAt: session.boundAt,
      childToken: session.childToken ?? '',
      birthDate: child?.birth_date ?? session.birthDate ?? null,
      themeColor: child?.theme_color ?? session.themeColor ?? null
    },
    children: child ? [child] : [],
    child_onboarding_tokens: [],
    child_login_challenges: [],
    parent_bootstrap_summary: [],
    tasks: keepChild(state.tasks),
    stars: keepChild(state.stars),
    dreams: keepChild(state.dreams),
    dream_funds: keepChild(state.dream_funds),
    shares: keepChild(state.shares),
    share_media: keepChild(state.share_media),
    encouragement_cards: keepChild(state.encouragement_cards),
    badges: state.badges.filter((badge) => badge.family_id === familyId),
    child_badges: keepChild(state.child_badges),
    special_days: keepOptionalChild(state.special_days),
    screen_time_schedules: keepChild(state.screen_time_schedules),
    screen_time_requests: keepChild(state.screen_time_requests),
    screen_time_logs: keepChild(state.screen_time_logs),
    growth_records: keepChild(state.growth_records),
    notifications: keepChild(state.notifications),
    device_bindings: state.device_bindings.filter(
      (binding) => binding.family_id === familyId && binding.child_id === childId && binding.id === session.deviceBindingId
    ),
    piggy_incomes: keepChild(state.piggy_incomes),
    piggy_bank_logs: keepChild(state.piggy_bank_logs),
    piggy_products: keepChild(state.piggy_products),
    piggy_shelf_orders: keepChild(state.piggy_shelf_orders),
    piggyProductDisplaySettings: keepChild(state.piggyProductDisplaySettings),
    piggy_purchases: keepChild(state.piggy_purchases),
    annual_parent_notes: keepChildId(state.annual_parent_notes),
    memory_packs: keepChildId(state.memory_packs)
  };
}

function scopeStateToCurrentFamily(state: LocalDatabaseState): LocalDatabaseState {
  if (!runtimeInfo.familyId) return state;

  const children = state.children.filter((child) => child.family_id === SUPABASE_FAMILY_ID);
  const childIds = new Set(children.map((child) => child.id));
  const keepFamily = <T extends { family_id: UUID }>(items: T[]) =>
    items.filter((item) => item.family_id === SUPABASE_FAMILY_ID);
  const keepFamilyChild = <T extends { family_id: UUID; child_id: UUID }>(items: T[]) =>
    items.filter((item) => item.family_id === SUPABASE_FAMILY_ID && childIds.has(item.child_id));
  const keepFamilyOptionalChild = <T extends { family_id: UUID; child_id: UUID | null }>(items: T[]) =>
    items.filter((item) => item.family_id === SUPABASE_FAMILY_ID && (!item.child_id || childIds.has(item.child_id)));
  const keepChildId = <T extends { childId: UUID }>(items: T[]) => items.filter((item) => childIds.has(item.childId));
  const activeChildId =
    state.active_child_id && childIds.has(state.active_child_id)
      ? state.active_child_id
      : children.find((child) => child.status === 'active')?.id ?? null;

  return {
    ...state,
    family_id: SUPABASE_FAMILY_ID,
    parent_id: SUPABASE_PARENT_ID,
    current_user_id: SUPABASE_PARENT_ID,
    active_child_id: activeChildId,
    pendingBindingChildId:
      state.pendingBindingChildId && childIds.has(state.pendingBindingChildId) ? state.pendingBindingChildId : null,
    deviceBinding: state.deviceBinding && childIds.has(state.deviceBinding) ? state.deviceBinding : null,
    device_child_id: state.device_child_id && childIds.has(state.device_child_id) ? state.device_child_id : null,
    currentChildIdentity:
      state.currentChildIdentity && childIds.has(state.currentChildIdentity.childId) ? state.currentChildIdentity : null,
    parent_bootstrap_summary: state.parent_bootstrap_summary?.filter((summary) => childIds.has(summary.child_id)),
    children,
    child_onboarding_tokens: state.child_onboarding_tokens?.filter((token) => childIds.has(token.childId)),
    tasks: keepFamilyChild(state.tasks),
    stars: keepFamilyChild(state.stars),
    dreams: keepFamilyChild(state.dreams),
    dream_funds: keepFamilyChild(state.dream_funds),
    shares: keepFamilyChild(state.shares),
    share_media: keepFamilyChild(state.share_media),
    encouragement_cards: keepFamilyChild(state.encouragement_cards),
    badges: keepFamily(state.badges),
    child_badges: keepFamilyChild(state.child_badges),
    special_days: keepFamilyOptionalChild(state.special_days),
    screen_time_schedules: keepFamilyChild(state.screen_time_schedules),
    screen_time_requests: keepFamilyChild(state.screen_time_requests),
    screen_time_logs: keepFamilyChild(state.screen_time_logs),
    growth_records: keepFamilyChild(state.growth_records),
    notifications: keepFamilyChild(state.notifications),
    device_bindings: keepFamilyChild(state.device_bindings),
    piggy_incomes: keepFamilyChild(state.piggy_incomes),
    piggy_bank_logs: keepFamilyChild(state.piggy_bank_logs),
    piggy_products: keepFamilyChild(state.piggy_products),
    piggy_shelf_orders: keepFamilyChild(state.piggy_shelf_orders),
    piggyProductDisplaySettings: keepFamilyChild(state.piggyProductDisplaySettings),
    piggy_purchases: keepFamilyChild(state.piggy_purchases),
    annual_parent_notes: keepChildId(state.annual_parent_notes),
    memory_packs: keepChildId(state.memory_packs)
  };
}

function mergeRemoteState(current: LocalDatabaseState, remote: LocalDatabaseState): LocalDatabaseState {
  const scopedRemote = scopeStateToCurrentFamily(remote);
  const activeChildId =
    scopedRemote.active_child_id && scopedRemote.children.some((child) => child.id === scopedRemote.active_child_id)
      ? scopedRemote.active_child_id
      : current.active_child_id && scopedRemote.children.some((child) => child.id === current.active_child_id)
        ? current.active_child_id
        : scopedRemote.children.find((child) => child.status === 'active')?.id ?? null;
  const pendingBindingChildId =
    current.pendingBindingChildId && scopedRemote.children.some((child) => child.id === current.pendingBindingChildId)
      ? current.pendingBindingChildId
      : scopedRemote.pendingBindingChildId && scopedRemote.children.some((child) => child.id === scopedRemote.pendingBindingChildId)
        ? scopedRemote.pendingBindingChildId
        : null;

  return {
    ...scopedRemote,
    device_id: current.device_id,
    deviceBinding: current.deviceBinding,
    device_child_id: current.device_child_id,
    currentChildIdentity: current.currentChildIdentity,
    pendingBindingChildId,
    active_child_id: activeChildId
  };
}

function fromChildScopedSupabaseSnapshot(
  snapshot: ChildScopedRepositorySnapshot,
  baseState: LocalDatabaseState,
  session: ValidChildSession
): LocalDatabaseState {
  SUPABASE_FAMILY_ID = snapshot.family_id;
  SUPABASE_PARENT_ID = snapshot.parent_id ?? baseState.parent_id ?? SUPABASE_FALLBACK_PARENT_ID;
  const child = snapshot.child ? fromSupabaseChild(snapshot.child) : null;
  const childId = snapshot.child_id;
  const deviceBindings = ((snapshot.device_bindings?.length ? snapshot.device_bindings : snapshot.device_binding ? [snapshot.device_binding] : []) as SupabaseDeviceBindingRow[])
    .map(fromSupabaseDeviceBinding);
  const taskRecords = snapshot.task_records ?? [];
  const remoteTasks = mergeTasks(
    baseState.tasks,
    (snapshot.tasks ?? []).map(fromSupabaseTask),
    taskRecords.map(fromSupabaseTaskRecord).filter((task): task is LocalTask => Boolean(task))
  );
  const piggyState = fromSupabasePiggyRows({
    baseState,
    records: snapshot.piggy_bank_records ?? [],
    products: snapshot.store_items ?? [],
    purchases: snapshot.purchases ?? []
  });
  const tabletTimeState = fromSupabaseTabletTimeRows({
    baseState,
    records: snapshot.tablet_time ?? []
  });
  const remoteState: LocalDatabaseState = {
    ...baseState,
    family_id: snapshot.family_id,
    parent_id: snapshot.parent_id ?? baseState.parent_id,
    current_user_id: childId,
    active_child_id: childId,
    deviceBinding: childId,
    device_child_id: childId,
    currentChildIdentity: {
      childId,
      displayName: child?.display_name ?? session.childName,
      boundAt: session.boundAt,
      childToken: session.childToken ?? '',
      birthDate: child?.birth_date ?? session.birthDate ?? null,
      themeColor: child?.theme_color ?? session.themeColor ?? null
    },
    children: child ? [child] : [],
    device_bindings: mergeDeviceBindings(baseState.device_bindings, deviceBindings),
    tasks: remoteTasks,
    stars: mergeStars(baseState.stars, (snapshot.stars ?? []).map(fromSupabaseStar)),
    dreams: mergeById(baseState.dreams, (snapshot.dreams ?? []).map(fromSupabaseDream), (dream) => dream.updated_at),
    dream_funds: mergeById(baseState.dream_funds, (snapshot.dream_funds ?? []).map(fromSupabaseDreamFund), (fund) => fund.created_at),
    shares: mergeById(baseState.shares, (snapshot.shares ?? []).map(fromSupabaseShare), (share) => share.updated_at),
    share_media: mergeById(baseState.share_media, (snapshot.share_media ?? []).map(fromSupabaseShareMedia), (media) => media.created_at),
    encouragement_cards: mergeById(baseState.encouragement_cards, (snapshot.encouragement_cards ?? []).map(fromSupabaseMailbox), (message) => message.updated_at),
    special_days: mergeById(baseState.special_days, (snapshot.special_days ?? []).map(fromSupabaseSpecialDay), (day) => day.updated_at),
    growth_records: mergeById(
      baseState.growth_records,
      (snapshot.growth_records ?? []).map((row) =>
        fromSupabaseGrowthRecord(row, baseState.growth_records.find((record) => record.id === row.id))
      ),
      (record) => record.updated_at
    ),
    screen_time_schedules: tabletTimeState.screen_time_schedules,
    screen_time_requests: tabletTimeState.screen_time_requests,
    screen_time_logs: tabletTimeState.screen_time_logs,
    piggy_incomes: piggyState.piggy_incomes,
    piggy_bank_logs: piggyState.piggy_bank_logs,
    piggy_products: piggyState.piggy_products,
    piggy_shelf_orders: piggyState.piggy_shelf_orders,
    piggyProductDisplaySettings: piggyState.piggyProductDisplaySettings,
    piggy_purchases: piggyState.piggy_purchases,
    badges: mergeById(baseState.badges, (snapshot.badges ?? []).map(fromSupabaseBadge), (badge) => badge.updated_at),
    child_badges: mergeById(baseState.child_badges, (snapshot.child_badges ?? []).map(fromSupabaseChildBadge), (badge) => badge.awarded_at),
    updated_at: snapshot.updated_at ?? new Date().toISOString()
  };
  return scopeStateToChildSession(remoteState, session);
}

function toChildScopedSupabasePayload(state: LocalDatabaseState, session: ValidChildSession) {
  SUPABASE_FAMILY_ID = session.familyId;
  SUPABASE_PARENT_ID = state.parent_id ?? SUPABASE_FALLBACK_PARENT_ID;
  const childId = session.childId;
  const childRows = <T extends { child_id: UUID }>(items: T[]) => items.filter((item) => item.child_id === childId);
  const tasks = childRows(state.tasks);
  const shares = childRows(state.shares);
  const dreams = childRows(state.dreams);
  const piggyProducts = childRows(state.piggy_products);
  const tabletRows = [
    ...childRows(state.screen_time_logs).map(toSupabaseTabletTimeLog),
    ...childRows(state.screen_time_requests).map(toSupabaseTabletTimeRequest),
    ...childRows(state.screen_time_schedules).map(toSupabaseTabletTimeSchedule)
  ];
  return {
    tasks: tasks.map(toSupabaseTask),
    task_records: tasks.map(toSupabaseTaskRecord),
    stars: childRows(state.stars)
      .filter((star) =>
        (!star.task_id || tasks.some((task) => task.id === star.task_id)) &&
        (!star.share_id || shares.some((share) => share.id === star.share_id)) &&
        (!star.dream_id || dreams.some((dream) => dream.id === star.dream_id))
      )
      .map(toSupabaseStar),
    piggy_bank_records: [
      ...childRows(state.piggy_incomes).map(toSupabasePiggyIncomeRecord),
      ...childRows(state.piggy_bank_logs).map(toSupabasePiggyBankLogRecord),
      ...childRows(state.piggy_shelf_orders).map(toSupabasePiggyShelfOrderRecord),
      ...childRows(state.piggyProductDisplaySettings).map(toSupabasePiggyDisplaySettingsRecord)
    ],
    store_items: piggyProducts.map(toSupabaseStoreItem),
    purchases: childRows(state.piggy_purchases)
      .filter((purchase) => piggyProducts.some((product) => product.id === purchase.product_id))
      .map(toSupabasePurchase),
    dreams: dreams.map(toSupabaseDream),
    dream_funds: childRows(state.dream_funds)
      .filter((fund) => dreams.some((dream) => dream.id === fund.dream_id))
      .map(toSupabaseDreamFund),
    shares: shares.map(toSupabaseShare),
    share_media: childRows(state.share_media)
      .filter((media) => shares.some((share) => share.id === media.share_id))
      .map(toSupabaseShareMedia),
    encouragement_cards: childRows(state.encouragement_cards).map(toSupabaseMailbox),
    special_days: childRows(state.special_days).map(toSupabaseSpecialDay),
    growth_records: childRows(state.growth_records).map(toSupabaseGrowthRecord),
    tablet_time: tabletRows,
    child_badges: childRows(state.child_badges).map(toSupabaseChildBadge)
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

function toSupabaseDeviceBinding(binding: LocalDeviceBinding): SupabaseDeviceBindingRow {
  const deviceId = toSupabaseUuid(binding.device_id, SUPABASE_DEVICE_FALLBACK_ID);
  return {
    id: `${binding.child_id}:${deviceId}`,
    token: binding.token ?? null,
    family_id: binding.family_id,
    child_id: binding.child_id,
    child_name: binding.child_name,
    device_id: deviceId,
    expires_at: binding.expires_at,
    used_at: binding.used_at,
    revoked_at: binding.revoked_at,
    last_login_at: binding.last_login_at,
    last_login_device: binding.last_login_device,
    binding_status: binding.binding_status,
    qr_token_status: binding.qr_token_status,
    device_binding_status: binding.device_binding_status ?? (binding.binding_status === 'bound' ? 'active' : 'revoked'),
    challenge_id: binding.challenge_id ?? null,
    activated_at: binding.activated_at ?? null,
    replaced_at: binding.replaced_at ?? null,
    last_heartbeat_at: binding.last_heartbeat_at ?? null,
    revoke_reason: binding.revoke_reason ?? null,
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
    bucket: row.bucket === 'family-media' ? 'family-media' : 'local-media',
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

function fromSupabaseBadge(row: SupabaseBadgeRow): LocalBadge {
  return {
    id: row.id,
    family_id: SUPABASE_FAMILY_ID,
    name: row.name,
    icon: row.icon || '★',
    description: row.description,
    reward_stars: 0,
    created_by: SUPABASE_PARENT_ID,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    deleted_at: null
  };
}

function fromSupabaseChildBadge(row: SupabaseChildBadgeRow): LocalChildBadge {
  return {
    id: row.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: row.child_id,
    badge_id: row.badge_id,
    note: row.note,
    awarded_by: row.awarded_by ?? SUPABASE_PARENT_ID,
    awarded_at: row.awarded_at
  };
}

function toSupabaseChildBadge(badge: LocalChildBadge): SupabaseChildBadgeRow {
  return {
    id: badge.id,
    family_id: SUPABASE_FAMILY_ID,
    child_id: badge.child_id,
    badge_id: badge.badge_id,
    awarded_by: badge.awarded_by || SUPABASE_PARENT_ID,
    source_entity_type: null,
    source_entity_id: null,
    note: badge.note,
    awarded_at: badge.awarded_at
  };
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

function toSupabaseChild(child: LocalChild, familyId = SUPABASE_FAMILY_ID): SupabaseChildRow {
  return {
    id: child.id,
    parent_id: SUPABASE_PARENT_ID,
    family_id: familyId,
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
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at
  };
}

function fromSupabaseDeviceBinding(row: SupabaseDeviceBindingRow): LocalDeviceBinding {
  return {
    id: row.id,
    token: row.token ?? null,
    family_id: row.family_id,
    child_id: row.child_id,
    child_name: row.child_name ?? '',
    device_id: row.device_id,
    expires_at: row.expires_at ?? row.updated_at,
    used_at: row.used_at,
    revoked_at: row.revoked_at,
    last_login_at: row.last_login_at,
    last_login_device: row.last_login_device,
    binding_status: row.binding_status,
    qr_token_status: row.qr_token_status,
    device_binding_status: row.device_binding_status ?? (row.binding_status === 'bound' ? 'active' : 'revoked'),
    challenge_id: row.challenge_id ?? null,
    activated_at: row.activated_at ?? null,
    replaced_at: row.replaced_at ?? null,
    last_heartbeat_at: row.last_heartbeat_at ?? null,
    revoke_reason: row.revoke_reason ?? null,
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
  localBindings: LocalDeviceBinding[],
  remoteBindings: LocalDeviceBinding[]
) {
  const byScope = new Map<string, LocalDeviceBinding>();
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
