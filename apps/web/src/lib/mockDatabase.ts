import type { LocalDatabaseState } from './localTypes';
import { normalizeBadgeIcon } from './badgeIcons';
import { getLocalStorage, readJson, writeJson, type KeyValueStorage } from './storage';

export const LOCAL_DATABASE_KEY = 'little-dreamers-family:mvp-db:v1';
export const LOCAL_DATABASE_EVENT = 'little-dreamers-family:local-db-change';
export const LOCAL_FAMILY_ID = 'local-family';
export const LOCAL_PARENT_USER_ID = 'local-parent';
export const LOCAL_DEVICE_ID = 'local-device';
const LOCAL_DEVICE_ID_KEY = 'little-dreamers-family:device-id:v1';

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

function createChildToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint8Array(16);
    crypto.getRandomValues(values);
    return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 32);
}

function getBrowserDeviceId() {
  if (typeof window === 'undefined') return LOCAL_DEVICE_ID;
  try {
    const stored = window.localStorage.getItem(LOCAL_DEVICE_ID_KEY);
    if (stored) return stored;
    const next = createId();
    window.localStorage.setItem(LOCAL_DEVICE_ID_KEY, next);
    return next;
  } catch {
    return LOCAL_DEVICE_ID;
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
    device_child_id: null,
    current_user_id: LOCAL_PARENT_USER_ID,
    active_child_id: null,
    children: [],
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
    screen_time_logs: [],
    growth_records: [],
    piggy_incomes: [],
    piggy_bank_logs: [],
    piggy_products: [],
    piggy_shelf_orders: [],
    piggyProductDisplaySettings: [],
    piggy_purchases: [],
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
  return {
    ...state,
    family_id: state.family_id ?? LOCAL_FAMILY_ID,
    parent_id: state.parent_id ?? state.current_user_id ?? LOCAL_PARENT_USER_ID,
    device_id: state.device_id && state.device_id !== LOCAL_DEVICE_ID ? state.device_id : getBrowserDeviceId(),
    device_child_id: state.device_child_id ?? null,
    current_user_id: state.current_user_id ?? state.parent_id ?? LOCAL_PARENT_USER_ID,
    active_child_id: state.device_child_id ?? state.active_child_id ?? null,
    children: (state.children ?? []).map((child) => ({
      ...child,
      avatar_media_id: child.avatar_media_id ?? null,
      child_token: child.child_token ?? createChildToken(),
      child_token_updated_at: child.child_token_updated_at ?? child.updated_at ?? timestamp,
      bound_device_id: child.bound_device_id ?? null,
      bound_at: child.bound_at ?? null,
      last_login_at: child.last_login_at ?? null,
      last_login_device: child.last_login_device ?? null
    })),
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
      image_media_id: day.image_media_id ?? null
    })),
    family_settings: {
      ...createDefaultSettings(settings.family_created_at),
      ...settings,
      family_avatar_media_id: settings.family_avatar_media_id ?? null,
      parent_avatar_media_id: settings.parent_avatar_media_id ?? null
    },
    screen_time_schedules: state.screen_time_schedules ?? [],
    screen_time_logs: state.screen_time_logs ?? [],
    growth_records: state.growth_records ?? [],
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
    encouragement_cards: (state.encouragement_cards ?? []).map((message) => ({
      ...message,
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

export class MockDatabase {
  constructor(
    private readonly storage: KeyValueStorage = getLocalStorage(),
    private readonly storageKey = LOCAL_DATABASE_KEY
  ) {}

  read(): LocalDatabaseState {
    const stored = readJson<LocalDatabaseState>(this.storage, this.storageKey);
    if (!stored || stored.schema_version !== 1) {
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
    writeJson(this.storage, this.storageKey, next);
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
