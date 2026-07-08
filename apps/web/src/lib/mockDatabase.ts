import type {
  LocalChild,
  LocalChildIdentity,
  LocalDatabaseState,
  LocalFamilySettings,
  LocalRepositoryDataSummary
} from './localTypes';
import { normalizeBadgeIcon } from './badgeIcons';
import { createChildDeviceTokenForChild } from './childDeviceToken';
import {
  deleteCookieValue,
  getCookieValue,
  getLocalStorage,
  readJson,
  setCookieValue,
  writeJson,
  type KeyValueStorage
} from './storage';

export const LOCAL_DATABASE_KEY = 'little-dreamers-family:mvp-db:v1';
export const LOCAL_DATABASE_EVENT = 'little-dreamers-family:local-db-change';
export const LOCAL_FAMILY_ID = 'local-family';
export const LOCAL_PARENT_USER_ID = 'local-parent';
export const LOCAL_DEVICE_ID = 'local-device';
const LOCAL_DEVICE_ID_KEY = 'little-dreamers-family:device-id:v1';
const LOCAL_CURRENT_CHILD_IDENTITY_KEY = 'currentChildIdentity';
const LOCAL_DEVICE_BINDING_KEY = 'deviceBinding';
const LOCAL_PARENT_BOOTSTRAP_KEY = 'little-dreamers-family:parent-bootstrap:v1';

type Listener = (state: LocalDatabaseState) => void;

const listeners = new Set<Listener>();

function now() {
  return new Date().toISOString();
}

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getBrowserDeviceId() {
  if (typeof window === 'undefined') {
    console.log('[child-binding-debug] C.deviceId', {
      source: 'server',
      deviceId: LOCAL_DEVICE_ID
    });
    return LOCAL_DEVICE_ID;
  }
  const cookieDeviceId = getCookieValue(LOCAL_DEVICE_ID_KEY);
  try {
    const stored = window.localStorage.getItem(LOCAL_DEVICE_ID_KEY);
    if (stored) {
      if (!cookieDeviceId) setCookieValue(LOCAL_DEVICE_ID_KEY, stored, 60 * 60 * 24 * 365 * 2);
      console.log('[child-binding-debug] C.deviceId', {
        source: 'localStorage',
        deviceId: stored,
        cookieDeviceId: cookieDeviceId ?? null
      });
      return stored;
    }
    if (cookieDeviceId) {
      window.localStorage.setItem(LOCAL_DEVICE_ID_KEY, cookieDeviceId);
      console.log('[child-binding-debug] C.deviceId', {
        source: 'cookie',
        deviceId: cookieDeviceId
      });
      return cookieDeviceId;
    }
    const next = createId();
    window.localStorage.setItem(LOCAL_DEVICE_ID_KEY, next);
    setCookieValue(LOCAL_DEVICE_ID_KEY, next, 60 * 60 * 24 * 365 * 2);
    console.log('[child-binding-debug] C.deviceId', {
      source: 'created-localStorage-cookie',
      deviceId: next
    });
    return next;
  } catch {
    if (cookieDeviceId) {
      console.log('[child-binding-debug] C.deviceId', {
        source: 'cookie-after-localStorage-error',
        deviceId: cookieDeviceId
      });
      return cookieDeviceId;
    }
    const next = createId();
    setCookieValue(LOCAL_DEVICE_ID_KEY, next, 60 * 60 * 24 * 365 * 2);
    console.log('[child-binding-debug] C.deviceId', {
      source: 'created-cookie-after-localStorage-error',
      deviceId: next
    });
    return next;
  }
}

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function createEmptyState(): LocalDatabaseState {
  const timestamp = now();
  return {
    schema_version: 1,
    family_id: LOCAL_FAMILY_ID,
    parent_id: LOCAL_PARENT_USER_ID,
    device_id: getBrowserDeviceId(),
    deviceBinding: null,
    device_child_id: null,
    currentChildIdentity: null,
    current_user_id: LOCAL_PARENT_USER_ID,
    active_child_id: null,
    parent_bootstrap_summary: [],
    children: [],
    child_onboarding_tokens: [],
    tasks: [],
    stars: [],
    dreams: [],
    dream_funds: [],
    shares: [],
    share_media: [],
    encouragement_cards: [],
    badges: [],
    child_badges: [],
    special_days: [],
    family_settings: createDefaultSettings(timestamp),
    screen_time_schedules: [],
    screen_time_requests: [],
    screen_time_logs: [],
    growth_records: [],
    notifications: [],
    device_bindings: [],
    piggy_incomes: [],
    piggy_bank_logs: [],
    piggy_products: [],
    piggy_shelf_orders: [],
    piggyProductDisplaySettings: [],
    piggy_purchases: [],
    annual_parent_notes: [],
    memory_packs: [],
    updated_at: timestamp
  };
}

function normalizeState(state: LocalDatabaseState): LocalDatabaseState {
  const settings = state.family_settings ?? createDefaultSettings(state.updated_at ?? now());
  const timestamp = state.updated_at ?? now();
  const badges = (state.badges ?? []).map((badge) => ({
    ...badge,
    icon: normalizeBadgeIcon(badge.icon)
  }));
  const dreams = (state.dreams ?? []).map((dream) => {
    const coverMediaId = dream.cover_media_id ?? dream.coverMediaId ?? null;
    return {
      ...dream,
      cover_media_id: coverMediaId,
      coverMediaId,
      cover_mime_type: dream.cover_mime_type ?? null,
      cover_file_name: dream.cover_file_name ?? null
    };
  });
  const children = (state.children ?? []).map((child) => {
    const normalizedChild = {
      ...child,
      avatar_media_id: child.avatar_media_id ?? null,
      child_token_consumed_at: child.child_token_consumed_at ?? null
    };
    return {
      ...normalizedChild,
      child_token: child.child_token ?? createChildDeviceTokenForChild(normalizedChild),
      child_token_updated_at: child.child_token_updated_at ?? child.updated_at ?? timestamp
    };
  });
  const storedOnboardingTokens = state.child_onboarding_tokens ?? [];
  const child_onboarding_tokens = children
    .filter((child) => child.status === 'active' && !child.child_token_consumed_at)
    .map((child) => {
      const stored = storedOnboardingTokens.find((token) => token.childId === child.id);
      return {
        childId: child.id,
        childName: child.display_name,
        childToken: stored?.childToken === child.child_token ? stored.childToken : child.child_token,
        createdAt: stored?.createdAt ?? child.child_token_updated_at ?? child.created_at
      };
    });
  return {
    ...state,
    family_id: state.family_id ?? LOCAL_FAMILY_ID,
    parent_id: state.parent_id ?? state.current_user_id ?? LOCAL_PARENT_USER_ID,
    device_id: state.device_id && state.device_id !== LOCAL_DEVICE_ID ? state.device_id : getBrowserDeviceId(),
    deviceBinding: state.deviceBinding ?? state.device_child_id ?? state.currentChildIdentity?.childId ?? null,
    device_child_id: state.deviceBinding ?? state.device_child_id ?? state.currentChildIdentity?.childId ?? null,
    currentChildIdentity: state.currentChildIdentity ?? null,
    current_user_id: state.current_user_id ?? state.parent_id ?? LOCAL_PARENT_USER_ID,
    active_child_id: state.currentChildIdentity?.childId ?? state.deviceBinding ?? state.device_child_id ?? state.active_child_id ?? null,
    parent_bootstrap_summary: state.parent_bootstrap_summary ?? buildRepositorySummary({ ...state, children } as LocalDatabaseState),
    children,
    child_onboarding_tokens,
    tasks: (state.tasks ?? []).map((task) => ({
      ...task,
      task_image_media_id: task.task_image_media_id ?? null,
      thumbnail_media_id: task.thumbnail_media_id ?? null
    })),
    badges,
    dreams,
    child_badges: state.child_badges ?? [],
    special_days: (state.special_days ?? []).map((day) => ({
      ...day,
      child_id: day.child_id ?? day.childId ?? state.active_child_id ?? children.find((child) => child.status === 'active')?.id ?? children[0]?.id ?? '',
      childId: day.child_id ?? day.childId ?? state.active_child_id ?? children.find((child) => child.status === 'active')?.id ?? children[0]?.id ?? '',
      image_media_id: day.image_media_id ?? null
    })),
    family_settings: {
      ...createDefaultSettings(settings.family_created_at),
      ...settings,
      family_avatar_media_id: settings.family_avatar_media_id ?? null,
      parent_avatar_media_id: settings.parent_avatar_media_id ?? null
    },
    screen_time_schedules: (state.screen_time_schedules ?? []).map((schedule) => ({
      ...schedule,
      child_id: schedule.child_id ?? schedule.childId,
      childId: schedule.child_id ?? schedule.childId
    })),
    screen_time_requests: state.screen_time_requests ?? [],
    screen_time_logs: state.screen_time_logs ?? [],
    growth_records: (state.growth_records ?? []).map((record) => ({
      ...record,
      growth_photo_media_ids: record.growth_photo_media_ids ?? []
    })),
    notifications: state.notifications ?? [],
    device_bindings: state.device_bindings ?? [],
    piggy_incomes: state.piggy_incomes ?? [],
    piggy_bank_logs: state.piggy_bank_logs ?? [],
    piggy_products: (state.piggy_products ?? []).map((product) => ({
      ...product,
      child_id: product.child_id ?? state.piggy_purchases?.find((purchase) => purchase.product_id === product.id)?.child_id ?? state.active_child_id ?? state.children?.find((child) => child.status === 'active')?.id ?? state.children?.[0]?.id ?? '',
      gallery_media_ids: product.gallery_media_ids ?? [],
      shelf_status: product.shelf_status ?? (product.shelf_slot === null ? 'backlog' : 'shelf'),
      shelf_slot: product.shelf_slot ?? null,
      deleted_at: product.deleted_at ?? null
    })),
    piggy_shelf_orders: state.piggy_shelf_orders ?? [],
    piggyProductDisplaySettings: state.piggyProductDisplaySettings ?? [],
    piggy_purchases: state.piggy_purchases ?? [],
    annual_parent_notes: state.annual_parent_notes ?? [],
    memory_packs: state.memory_packs ?? [],
    encouragement_cards: (state.encouragement_cards ?? []).map((message) => ({
      ...message,
      sender_role: message.sender_role ?? (message.sender_user_id === LOCAL_PARENT_USER_ID ? 'parent' : 'child'),
      media_id: message.media_id ?? null
    })),
    share_media: state.share_media ?? []
  };
}

function createDefaultSettings(timestamp: string) {
  return {
    family_name: '小小夢想家 Family',
    family_intro: '一起記錄任務、夢想、分享與重要日子的家庭。',
    family_avatar_data_url: null,
    family_avatar_media_id: null,
    family_created_at: timestamp,
    parent_name: '家長',
    parent_email: 'parent@example.local',
    parent_avatar_data_url: null,
    parent_avatar_media_id: null,
    default_daily_screen_minutes: 0,
    screen_time_star_minutes_per_star: 1,
    default_daily_star_limit: 30,
    default_theme_color: 'blue',
    allow_photo_sharing: true,
    allow_video_sharing: true,
    allow_audio_sharing: true,
    notify_task_completed: true,
    notify_dream_completed: true,
    notify_share_pending: true,
    notify_special_day: true,
    updated_at: timestamp
  };
}

function readChildSessionBootstrap(): { currentChildIdentity: LocalChildIdentity; deviceBinding: string } | null {
  const identityRaw = getCookieValue(LOCAL_CURRENT_CHILD_IDENTITY_KEY);
  const deviceBinding = getCookieValue(LOCAL_DEVICE_BINDING_KEY);
  if (!identityRaw || !deviceBinding) return null;

  try {
    const parsed = JSON.parse(identityRaw) as Partial<LocalChildIdentity>;
    if (!parsed?.childId || !parsed?.displayName) return null;
    return {
      currentChildIdentity: {
        childId: parsed.childId,
        displayName: parsed.displayName,
        birthDate: parsed.birthDate ?? null,
        themeColor: parsed.themeColor ?? null,
        childToken: parsed.childToken ?? '',
        boundAt: parsed.boundAt ?? now()
      },
      deviceBinding
    };
  } catch {
    return null;
  }
}

export interface LocalParentBootstrap {
  schema_version: 1;
  family_id: string;
  parent_id: string | null;
  current_user_id: string;
  currentChildId: string | null;
  children: LocalParentBootstrapChild[];
  settings: LocalFamilySettings;
  repositorySummary: LocalRepositoryDataSummary[];
  updated_at: string;
}

export type LocalParentBootstrapChild = Pick<
  LocalChild,
  | 'id'
  | 'display_name'
  | 'legal_name'
  | 'birth_date'
  | 'birthday'
  | 'gender'
  | 'avatar_path'
  | 'avatar_media_id'
  | 'theme_color'
  | 'timezone'
  | 'status'
  | 'notes'
  | 'child_token'
  | 'child_token_updated_at'
  | 'child_token_consumed_at'
  | 'created_at'
  | 'updated_at'
  | 'archived_at'
>;

export function loadParentBootstrap(): LocalParentBootstrap | null {
  const raw = getCookieValue(LOCAL_PARENT_BOOTSTRAP_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<LocalParentBootstrap> & {
      active_child_id?: string | null;
      family_settings?: LocalFamilySettings;
      repository_summary?: LocalRepositoryDataSummary[];
    };
    const settings = parsed.settings ?? parsed.family_settings;
    const repositorySummary = parsed.repositorySummary ?? parsed.repository_summary ?? [];
    const currentChildId = parsed.currentChildId ?? parsed.active_child_id ?? parsed.children?.[0]?.id ?? null;
    if (parsed.schema_version !== 1 || !Array.isArray(parsed.children) || !settings) return null;
    return {
      schema_version: 1,
      family_id: parsed.family_id ?? LOCAL_FAMILY_ID,
      parent_id: parsed.parent_id ?? LOCAL_PARENT_USER_ID,
      current_user_id: parsed.current_user_id ?? parsed.parent_id ?? LOCAL_PARENT_USER_ID,
      currentChildId,
      children: parsed.children,
      settings,
      repositorySummary,
      updated_at: parsed.updated_at ?? now()
    };
  } catch {
    deleteCookieValue(LOCAL_PARENT_BOOTSTRAP_KEY);
    return null;
  }
}

function buildRepositorySummary(state: LocalDatabaseState): LocalRepositoryDataSummary[] {
  return (state.children ?? [])
    .filter((child) => child.status !== 'archived')
    .map((child) => {
      const childId = child.id;
      const piggySavings = (state.piggy_bank_logs ?? [])
        .filter((log) => log.child_id === childId)
        .reduce((total, log) => total + (log.type === 'purchase_debit' ? -log.amount : log.amount), 0);
      return {
        child_id: childId,
        task_count: (state.tasks ?? []).filter((item) => item.child_id === childId).length,
        star_balance: (state.stars ?? []).filter((item) => item.child_id === childId).reduce((total, item) => total + item.amount, 0),
        dream_count: (state.dreams ?? []).filter((item) => item.child_id === childId).length,
        share_count: (state.shares ?? []).filter((item) => item.child_id === childId && !item.deleted_at).length,
        mailbox_count: (state.encouragement_cards ?? []).filter((item) => item.child_id === childId).length,
        special_day_count: (state.special_days ?? []).filter((item) => item.child_id === childId && !item.deleted_at).length,
        growth_record_count: (state.growth_records ?? []).filter((item) => item.child_id === childId).length,
        screen_time_balance: Math.max(
          0,
          (state.screen_time_logs ?? []).filter((item) => item.child_id === childId).reduce((total, item) => total + item.minutes_delta, 0)
        ),
        piggy_savings: Math.max(0, piggySavings),
        product_count: (state.piggy_products ?? []).filter((item) => item.child_id === childId && !item.deleted_at).length,
        purchase_count: (state.piggy_purchases ?? []).filter((item) => item.child_id === childId).length
      };
    });
}

function hasRepositoryDetailData(state: LocalDatabaseState) {
  return [
    state.tasks,
    state.stars,
    state.dreams,
    state.dream_funds,
    state.shares,
    state.share_media,
    state.encouragement_cards,
    state.special_days,
    state.screen_time_schedules,
    state.screen_time_requests,
    state.screen_time_logs,
    state.growth_records,
    state.piggy_incomes,
    state.piggy_bank_logs,
    state.piggy_products,
    state.piggy_purchases
  ].some((items) => (items?.length ?? 0) > 0);
}

function buildParentBootstrap(state: LocalDatabaseState): LocalParentBootstrap {
  const activeChildren = state.children.filter((child) => child.status !== 'archived');
  return {
    schema_version: 1,
    family_id: state.family_id,
    parent_id: state.parent_id ?? state.current_user_id ?? LOCAL_PARENT_USER_ID,
    current_user_id: state.current_user_id ?? state.parent_id ?? LOCAL_PARENT_USER_ID,
    currentChildId: state.active_child_id ?? activeChildren[0]?.id ?? null,
    children: activeChildren.map(toParentBootstrapChild),
    settings: state.family_settings,
    repositorySummary: buildRepositorySummary(state),
    updated_at: state.updated_at
  };
}

function toParentBootstrapChild(child: LocalChild): LocalParentBootstrapChild {
  return {
    id: child.id,
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
    created_at: child.created_at,
    updated_at: child.updated_at,
    archived_at: child.archived_at
  };
}

function restoreChild(child: LocalParentBootstrapChild, state: LocalDatabaseState): LocalChild {
  return {
    id: child.id,
    family_id: state.family_id,
    display_name: child.display_name,
    legal_name: child.legal_name ?? null,
    birth_date: child.birth_date ?? null,
    birthday: child.birthday ?? child.birth_date ?? null,
    gender: child.gender ?? null,
    avatar_path: child.avatar_path ?? null,
    avatar_media_id: child.avatar_media_id ?? null,
    theme_color: child.theme_color ?? null,
    timezone: child.timezone || 'Asia/Taipei',
    status: child.status ?? 'active',
    notes: child.notes ?? null,
    child_token: child.child_token,
    child_token_updated_at: child.child_token_updated_at,
    child_token_consumed_at: child.child_token_consumed_at ?? null,
    created_by: state.current_user_id,
    created_at: child.created_at,
    updated_at: child.updated_at,
    archived_at: child.archived_at ?? null
  };
}

export function restoreChildren(state: LocalDatabaseState, bootstrap: LocalParentBootstrap): LocalChild[] {
  return bootstrap.children.map((child) => restoreChild(child, state));
}

export function restoreCurrentChild(state: LocalDatabaseState, bootstrap: LocalParentBootstrap) {
  const childIds = new Set(state.children.filter((child) => child.status === 'active').map((child) => child.id));
  return bootstrap.currentChildId && childIds.has(bootstrap.currentChildId)
    ? bootstrap.currentChildId
    : state.children.find((child) => child.status === 'active')?.id ?? null;
}

function applyParentBootstrap(state: LocalDatabaseState, bootstrap: LocalParentBootstrap): LocalDatabaseState {
  const baseState = {
    ...state,
    family_id: bootstrap.family_id,
    parent_id: bootstrap.parent_id,
    current_user_id: bootstrap.current_user_id,
    family_settings: bootstrap.settings,
    parent_bootstrap_summary: bootstrap.repositorySummary,
    updated_at: bootstrap.updated_at
  };
  const children = restoreChildren(baseState, bootstrap);
  const nextState: LocalDatabaseState = {
    ...baseState,
    children,
    active_child_id: null,
    child_onboarding_tokens: children
      .filter((child) => child.status === 'active' && !child.child_token_consumed_at)
      .map((child) => ({
        childId: child.id,
        childName: child.display_name,
        childToken: child.child_token,
        createdAt: child.child_token_updated_at
      }))
  };
  nextState.active_child_id = restoreCurrentChild(nextState, bootstrap);
  return normalizeState({
    ...nextState
  });
}

function createBootstrapChild(identity: LocalChildIdentity, boundDeviceId: string): LocalChild {
  const timestamp = now();
  return {
    id: identity.childId,
    family_id: LOCAL_FAMILY_ID,
    display_name: identity.displayName,
    legal_name: null,
    birth_date: identity.birthDate ?? null,
    birthday: identity.birthDate ?? null,
    gender: null,
    avatar_path: null,
    avatar_media_id: null,
    theme_color: identity.themeColor ?? null,
    timezone: 'Asia/Taipei',
    status: 'active',
    notes: null,
    child_token: identity.childToken,
    child_token_updated_at: identity.boundAt ?? timestamp,
    child_token_consumed_at: identity.boundAt ?? timestamp,
    created_by: LOCAL_PARENT_USER_ID,
    created_at: identity.boundAt ?? timestamp,
    updated_at: timestamp,
    archived_at: null
  };
}

function syncChildSessionKeys(storage: KeyValueStorage, state: LocalDatabaseState) {
  if (typeof window === 'undefined') return;

  if (state.currentChildIdentity) {
    storage.setItem(LOCAL_CURRENT_CHILD_IDENTITY_KEY, JSON.stringify(state.currentChildIdentity));
    setCookieValue(LOCAL_CURRENT_CHILD_IDENTITY_KEY, JSON.stringify(state.currentChildIdentity));
  } else {
    storage.removeItem(LOCAL_CURRENT_CHILD_IDENTITY_KEY);
    deleteCookieValue(LOCAL_CURRENT_CHILD_IDENTITY_KEY);
  }

  if (state.deviceBinding) {
    storage.setItem(LOCAL_DEVICE_BINDING_KEY, state.deviceBinding);
    setCookieValue(LOCAL_DEVICE_BINDING_KEY, state.deviceBinding);
  } else {
    storage.removeItem(LOCAL_DEVICE_BINDING_KEY);
    deleteCookieValue(LOCAL_DEVICE_BINDING_KEY);
  }
}

function syncParentBootstrap(state: LocalDatabaseState) {
  if (typeof window === 'undefined') return;

  const bootstrap = buildParentBootstrap(state);
  try {
    setCookieValue(LOCAL_PARENT_BOOTSTRAP_KEY, JSON.stringify(bootstrap));
  } catch (error) {
    console.warn('[parent-bootstrap] write failed', error);
  }
}

export class MockDatabase {
  constructor(
    private readonly storage: KeyValueStorage = getLocalStorage(),
    private readonly storageKey = LOCAL_DATABASE_KEY
  ) {}

  read(): LocalDatabaseState {
    const stored = readJson<LocalDatabaseState>(this.storage, this.storageKey);
    const childBootstrap = readChildSessionBootstrap();
    const parentBootstrap = loadParentBootstrap();
    const isEmptyStoredState =
      stored ? (stored.children?.length ?? 0) === 0 && !stored.currentChildIdentity && !stored.deviceBinding && !stored.device_child_id : false;
    const canApplyParentBootstrap =
      parentBootstrap &&
      (!stored?.currentChildIdentity && !stored?.deviceBinding && !stored?.device_child_id) &&
      (!stored?.updated_at || parentBootstrap.updated_at > stored.updated_at);
    if (!stored || stored.schema_version !== 1 || (childBootstrap && isEmptyStoredState) || (parentBootstrap && isEmptyStoredState) || canApplyParentBootstrap) {
      if (childBootstrap) {
        const seeded = createEmptyState();
        seeded.children = [createBootstrapChild(childBootstrap.currentChildIdentity, seeded.device_id ?? LOCAL_DEVICE_ID)];
        seeded.deviceBinding = childBootstrap.deviceBinding;
        seeded.device_child_id = childBootstrap.deviceBinding;
        seeded.currentChildIdentity = childBootstrap.currentChildIdentity;
        seeded.active_child_id = childBootstrap.deviceBinding;
        this.write(seeded);
        return clone(seeded);
      }
      if (parentBootstrap) {
        const seeded = applyParentBootstrap(stored?.schema_version === 1 ? stored : createEmptyState(), parentBootstrap);
        this.write(seeded);
        return clone(seeded);
      }
      const empty = createEmptyState();
      this.write(empty);
      return clone(empty);
    }
    const normalized = normalizeState(stored);
    if (JSON.stringify(stored) !== JSON.stringify(normalized)) this.write(normalized);
    return clone(normalized);
  }

  write(state: LocalDatabaseState): LocalDatabaseState {
    const next = { ...clone(state), updated_at: now() };
    next.parent_bootstrap_summary =
      hasRepositoryDetailData(next) || !next.parent_bootstrap_summary?.length
        ? buildRepositorySummary(next)
        : next.parent_bootstrap_summary;
    writeJson(this.storage, this.storageKey, next);
    syncChildSessionKeys(this.storage, next);
    if (!next.currentChildIdentity && !next.deviceBinding && !next.device_child_id) syncParentBootstrap(next);
    listeners.forEach((listener) => listener(clone(next)));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(LOCAL_DATABASE_EVENT, { detail: clone(next) }));
    }

    return clone(next);
  }

  transaction<T>(mutate: (draft: LocalDatabaseState) => T): T {
    const draft = this.read();
    const result = mutate(draft);
    this.write(draft);
    return result;
  }

  reset(): LocalDatabaseState {
    this.storage.removeItem(this.storageKey);
    this.storage.removeItem(LOCAL_CURRENT_CHILD_IDENTITY_KEY);
    this.storage.removeItem(LOCAL_DEVICE_BINDING_KEY);
    deleteCookieValue(LOCAL_PARENT_BOOTSTRAP_KEY);
    return this.write(createEmptyState());
  }

  exportJson(): string {
    return JSON.stringify(this.read(), null, 2);
  }

  importJson(raw: string): LocalDatabaseState {
    const parsed = JSON.parse(raw) as LocalDatabaseState;
    if (!parsed || parsed.schema_version !== 1 || !Array.isArray(parsed.children)) {
      throw new Error('Invalid local database export');
    }
    return this.write(normalizeState(parsed));
  }

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
}

export const mockDatabase = new MockDatabase();
