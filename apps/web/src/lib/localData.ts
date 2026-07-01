import {
  LOCAL_DEVICE_ID,
  LOCAL_FAMILY_ID,
  LOCAL_PARENT_USER_ID,
  mockDatabase,
  type MockDatabase
} from './mockDatabase';
import { normalizeBadgeIcon } from './badgeIcons';
import type {
  DreamWithBalance,
  LocalBadge,
  LocalChildBadge,
  LocalChild,
  LocalDatabaseState,
  LocalDream,
  LocalDreamFund,
  LocalFamilySettings,
  LocalGrowthRecord,
  LocalMailboxMessage,
  LocalRepositoryScope,
  LocalPiggyBankLog,
  LocalPiggyIncome,
  LocalPiggyProduct,
  LocalPiggyProductDisplaySettings,
  LocalPiggyPurchase,
  LocalPiggyShelfOrder,
  LocalScreenTimeLog,
  LocalScreenTimeSchedule,
  LocalShare,
  LocalShareMedia,
  LocalSpecialDay,
  LocalStarTransaction,
  LocalTask,
  PiggyBankSummary,
  SpecialDayType,
  ShareWithMedia,
  WeeklyScreenTimeDay,
  UUID
} from './localTypes';

export class LocalDataError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'LocalDataError';
  }
}

const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const STAR_TO_SCREEN_MINUTES = 1;
const SCREEN_TIME_WEEKDAY_LABELS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

function id(): UUID {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function requiredText(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new LocalDataError(`${field} is required`, 'VALIDATION_ERROR');
  return normalized;
}

function normalizeStoredDreamCoverPath(value?: string | null) {
  const normalized = value?.trim() || null;
  if (!normalized) return null;
  return normalized.startsWith('data:image') ? null : normalized;
}

function requireChild(state: LocalDatabaseState, childId: UUID, includeArchived = false) {
  const child = state.children.find((item) => item.id === childId);
  if (!child || (!includeArchived && child.status !== 'active')) {
    throw new LocalDataError('Child not found', 'CHILD_NOT_FOUND');
  }
  return child;
}

function requireTask(state: LocalDatabaseState, taskId: UUID) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) throw new LocalDataError('Task not found', 'TASK_NOT_FOUND');
  return task;
}

function requireDream(state: LocalDatabaseState, dreamId: UUID) {
  const dream = state.dreams.find((item) => item.id === dreamId);
  if (!dream) throw new LocalDataError('Dream not found', 'DREAM_NOT_FOUND');
  return dream;
}

function requireShare(state: LocalDatabaseState, shareId: UUID) {
  const share = state.shares.find((item) => item.id === shareId);
  if (!share) throw new LocalDataError('Share not found', 'SHARE_NOT_FOUND');
  return share;
}

function requireBadge(state: LocalDatabaseState, badgeId: UUID) {
  const badge = state.badges.find((item) => item.id === badgeId && !item.deleted_at);
  if (!badge) throw new LocalDataError('Badge not found', 'BADGE_NOT_FOUND');
  return badge;
}

function requireSpecialDay(state: LocalDatabaseState, specialDayId: UUID) {
  const specialDay = state.special_days.find((item) => item.id === specialDayId && !item.deleted_at);
  if (!specialDay) throw new LocalDataError('Special day not found', 'SPECIAL_DAY_NOT_FOUND');
  return specialDay;
}

function requireGrowthRecord(state: LocalDatabaseState, growthRecordId: UUID) {
  const record = state.growth_records.find((item) => item.id === growthRecordId);
  if (!record) throw new LocalDataError('Growth record not found', 'GROWTH_RECORD_NOT_FOUND');
  return record;
}

function requirePiggyProduct(state: LocalDatabaseState, productId: UUID) {
  const product = state.piggy_products.find((item) => item.id === productId && !item.deleted_at);
  if (!product) throw new LocalDataError('Piggy product not found', 'PIGGY_PRODUCT_NOT_FOUND');
  return product;
}

function requirePiggyPurchase(state: LocalDatabaseState, purchaseId: UUID) {
  const purchase = state.piggy_purchases.find((item) => item.id === purchaseId);
  if (!purchase) throw new LocalDataError('Piggy purchase not found', 'PIGGY_PURCHASE_NOT_FOUND');
  return purchase;
}

function validateDate(value: string, field: string) {
  const normalized = requiredText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(new Date(`${normalized}T00:00:00`).getTime())) {
    throw new LocalDataError(`${field} must be YYYY-MM-DD`, 'VALIDATION_ERROR');
  }
  return normalized;
}

function daysUntilDate(date: string) {
  const start = new Date(`${today()}T00:00:00`);
  const target = new Date(`${date}T00:00:00`);
  return Math.ceil((target.getTime() - start.getTime()) / 86400000);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function getPiggySavings(state: LocalDatabaseState, childId: UUID) {
  return sum(
    state.piggy_bank_logs
      .filter((log) => log.child_id === childId)
      .map((log) => {
        if (log.type === 'coin_deposit' || log.type === 'purchase_refund') return log.amount;
        return -log.amount;
      })
  );
}

function getPiggyAvailableToday(state: LocalDatabaseState, childId: UUID) {
  const date = today();
  return sum(
    state.piggy_incomes
      .filter((income) => income.child_id === childId && income.created_at.slice(0, 10) === date)
      .map((income) => income.remaining_amount)
  );
}

function getPiggyDepositedToday(state: LocalDatabaseState, childId: UUID) {
  const date = today();
  return sum(
    state.piggy_bank_logs
      .filter((log) => log.child_id === childId && log.type === 'coin_deposit' && log.created_at.slice(0, 10) === date)
      .map((log) => log.amount)
  );
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function getWeekStartDate(date: string) {
  const [year, month, dateNumber] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, dateNumber));
  const day = value.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function screenLogTypeToEntryType(type: NonNullable<LocalScreenTimeLog['type']>): LocalScreenTimeLog['entry_type'] {
  return ({
    redeem: 'manual_grant',
    penalty: 'manual_deduction',
    manual_add: 'manual_grant',
    used: 'usage',
    schedule_edit: 'manual_grant'
  } as const)[type];
}

function normalizeScreenLogType(log: LocalScreenTimeLog): NonNullable<LocalScreenTimeLog['type']> {
  if (log.type) return log.type;
  if (log.entry_type === 'usage') return 'used';
  if (log.entry_type === 'manual_deduction') return 'penalty';
  return 'manual_add';
}

function logSignedMinutes(type: NonNullable<LocalScreenTimeLog['type']>, minutes: number) {
  const absolute = Math.abs(minutes);
  return type === 'penalty' || type === 'used' ? -absolute : absolute;
}

function createScreenTimeLog(
  state: LocalDatabaseState,
  input: {
    childId: UUID;
    date: string;
    type: NonNullable<LocalScreenTimeLog['type']>;
    minutes: number;
    starsUsed?: number | null;
    note?: string | null;
    taskId?: UUID | null;
    idempotencyKey?: string | null;
  }
): LocalScreenTimeLog {
  const signedMinutes = logSignedMinutes(input.type, input.minutes);
  const log: LocalScreenTimeLog = {
    id: id(),
    family_id: state.family_id,
    child_id: input.childId,
    date: input.date,
    type: input.type,
    minutes: signedMinutes,
    starsUsed: input.starsUsed ?? null,
    note: input.note?.trim() || null,
    operator_name: state.family_settings.parent_name || '家長',
    entry_type: screenLogTypeToEntryType(input.type),
    minutes_delta: signedMinutes,
    task_id: input.taskId ?? null,
    session_started_at: null,
    session_ended_at: null,
    device_id: null,
    reason: input.note?.trim() || null,
    reversal_of_id: null,
    idempotency_key: input.idempotencyKey ?? null,
    created_by: state.current_user_id,
    created_at: now()
  };
  state.screen_time_logs.push(log);
  return log;
}

function getLedgerBalance(state: LocalDatabaseState, childId: UUID) {
  return Math.max(
    0,
    sum(
      state.screen_time_logs
        .filter((item) => item.child_id === childId)
        .map((item) => item.minutes_delta)
    )
  );
}

function buildScreenTimeDay(state: LocalDatabaseState, childId: UUID, date: string, weekday: string): WeeklyScreenTimeDay {
  const logs = state.screen_time_logs.filter((log) => log.child_id === childId && (log.date ?? log.created_at.slice(0, 10)) === date);
  const redeemedMinutes = sum(logs.filter((log) => normalizeScreenLogType(log) === 'redeem').map((log) => Math.abs(log.minutes ?? log.minutes_delta)));
  const manualAddedMinutes = sum(logs.filter((log) => normalizeScreenLogType(log) === 'manual_add').map((log) => Math.abs(log.minutes ?? log.minutes_delta)));
  const penaltyMinutes = sum(logs.filter((log) => normalizeScreenLogType(log) === 'penalty').map((log) => Math.abs(log.minutes ?? log.minutes_delta)));
  const usedMinutes = sum(logs.filter((log) => normalizeScreenLogType(log) === 'used').map((log) => Math.abs(log.minutes ?? log.minutes_delta)));
  return {
    date,
    weekday,
    plannedMinutes: 0,
    redeemedMinutes,
    manualAddedMinutes,
    penaltyMinutes,
    usedMinutes,
    remainingMinutes: getLedgerBalance(state, childId)
  };
}

function ensureWeeklySchedules(state: LocalDatabaseState, childId: UUID, weekStartDate: string) {
  void state;
  void childId;
  void weekStartDate;
}

function validateNonNegativeNumber(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new LocalDataError(`${field} must be zero or greater`, 'VALIDATION_ERROR');
  }
  return value;
}

function validateNonNegativeInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new LocalDataError(`${field} must be a non-negative integer`, 'VALIDATION_ERROR');
  }
  return value;
}

export interface CreateChildInput {
  display_name: string;
  legal_name?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  avatar_path?: string | null;
  avatar_media_id?: string | null;
  theme_color?: string | null;
  timezone?: string;
  notes?: string | null;
}

export interface UpdateChildInput {
  display_name?: string;
  legal_name?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  avatar_path?: string | null;
  avatar_media_id?: string | null;
  theme_color?: string | null;
  timezone?: string;
  notes?: string | null;
}

export interface CreateTaskInput {
  child_id: UUID;
  title?: string;
  description?: string | null;
  category?: LocalTask['category'];
  task_date?: string;
  due_at?: string | null;
  recurrence_rule?: string | null;
  reward_stars?: number;
  reward_screen_minutes?: number;
  task_image_media_id?: UUID | null;
  thumbnail_media_id?: UUID | null;
}

export interface CreateDreamInput {
  child_id: UUID;
  title: string;
  description?: string | null;
  cover_path?: string | null;
  cover_media_id?: UUID | null;
  cover_mime_type?: string | null;
  cover_file_name?: string | null;
  target_amount: number;
  currency?: string;
  priority?: number;
  target_date?: string | null;
}

export interface MigrateDreamCoverInput {
  cover_media_id: UUID;
  cover_mime_type?: string | null;
  cover_file_name?: string | null;
}

export interface ShareMediaInput {
  media_type: LocalShareMedia['media_type'];
  mime_type: string;
  file_name?: string;
  file_size_bytes?: number;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  thumbnail_path?: string | null;
  data_url?: string | null;
}

export interface CreateShareInput {
  child_id: UUID;
  title?: string | null;
  caption?: string | null;
  source_type?: LocalShare['source_type'];
  status?: LocalShare['status'];
  media?: ShareMediaInput[];
}

export interface CreateMailboxMessageInput {
  child_id: UUID;
  title?: string | null;
  message?: string | null;
  card_type?: LocalMailboxMessage['card_type'];
  template_key?: string | null;
  media?: {
    media_id?: string | null;
    mime_type: string;
    file_name?: string;
    data_url?: string | null;
  } | null;
  scheduled_at?: string | null;
}

export interface CreateBadgeInput {
  name: string;
  icon: string;
  description?: string | null;
  reward_stars?: number;
}

export interface AwardBadgeInput {
  child_id: UUID;
  badge_id: UUID;
  note?: string | null;
}

export interface CreateSpecialDayInput {
  child_id?: UUID | null;
  title: string;
  date: string;
  type: SpecialDayType;
  description?: string | null;
  image_media_id?: string | null;
  image_data_url?: string | null;
  createdBy?: 'parent' | 'child';
  source?: 'manual';
}

export interface UpdateSpecialDayInput {
  child_id?: UUID | null;
  title?: string;
  date?: string;
  type?: SpecialDayType;
  description?: string | null;
  image_media_id?: string | null;
  image_data_url?: string | null;
  createdBy?: 'parent' | 'child';
  source?: 'manual';
}

export type UpdateSettingsInput = Partial<Omit<LocalFamilySettings, 'family_created_at' | 'updated_at'>>;

export interface UpdateScreenTimeInput {
  child_id: UUID;
  minutes_delta: number;
  reason?: string | null;
  entry_type?: 'manual_grant' | 'manual_deduction' | 'usage' | 'expiry';
  session_started_at?: string | null;
  session_ended_at?: string | null;
}

export interface CreateGrowthRecordInput {
  child_id: UUID;
  date: string;
  height_cm: number;
  weight_kg: number;
  reading_count: number;
  note?: string | null;
}

export interface UpdateGrowthRecordInput {
  child_id?: UUID;
  date?: string;
  height_cm?: number;
  weight_kg?: number;
  reading_count?: number;
  note?: string | null;
}

export interface AddPiggyIncomeInput {
  child_id: UUID;
  source: string;
  amount: number;
}

export interface CreatePiggyProductInput {
  child_id?: UUID;
  name?: string;
  price: number;
  main_media_id: UUID | null;
  gallery_media_ids?: UUID[];
  shelf_status?: LocalPiggyProduct['shelf_status'];
}

export interface UpdatePiggyProductInput {
  name?: string;
  price?: number;
  main_media_id?: UUID | null;
  gallery_media_ids?: UUID[];
  shelf_status?: LocalPiggyProduct['shelf_status'];
}

export interface LocalDataRepository {
  getState(): LocalDatabaseState;
  getRepositoryScope(): LocalRepositoryScope;
  resetLocalData(): LocalDatabaseState;
  subscribe(listener: (state: LocalDatabaseState) => void): () => void;
  createChild(input: CreateChildInput): LocalChild;
  updateChild(childId: UUID, input: UpdateChildInput): LocalChild;
  deleteChild(childId: UUID): LocalChild;
  switchChild(childId: UUID): LocalChild;
  listChildren(includeArchived?: boolean): LocalChild[];
  createTask(input: CreateTaskInput): LocalTask;
  completeTask(taskId: UUID, completionNote?: string | null): LocalTask;
  approveTask(taskId: UUID): LocalTask;
  listTasks(childId?: UUID): LocalTask[];
  getStarBalance(childId: UUID): number;
  listStarTransactions(childId: UUID): LocalStarTransaction[];
  createDream(input: CreateDreamInput): LocalDream;
  migrateDreamCoverToMedia(dreamId: UUID, input: MigrateDreamCoverInput): LocalDream;
  deleteDream(dreamId: UUID): LocalDream;
  addDreamDeposit(dreamId: UUID, amount: number, note?: string | null): LocalDreamFund;
  completeDream(dreamId: UUID): LocalDream;
  listDreams(childId?: UUID, includeCompleted?: boolean): DreamWithBalance[];
  createShare(input: CreateShareInput): ShareWithMedia;
  listShares(childId?: UUID): ShareWithMedia[];
  deleteShare(shareId: UUID): LocalShare;
  approveShare(shareId: UUID, rewardStars?: number): LocalShare;
  createMailboxMessage(input: CreateMailboxMessageInput): LocalMailboxMessage;
  markMessageRead(messageId: UUID): LocalMailboxMessage;
  listMailboxMessages(childId?: UUID): LocalMailboxMessage[];
  createBadge(input: CreateBadgeInput): LocalBadge;
  deleteBadge(badgeId: UUID): LocalBadge;
  awardBadge(input: AwardBadgeInput): LocalChildBadge;
  getBadges(includeDeleted?: boolean): LocalBadge[];
  getChildBadges(childId?: UUID): LocalChildBadge[];
  createSpecialDay(input: CreateSpecialDayInput): LocalSpecialDay;
  updateSpecialDay(specialDayId: UUID, input: UpdateSpecialDayInput): LocalSpecialDay;
  deleteSpecialDay(specialDayId: UUID): LocalSpecialDay;
  getSpecialDays(childId?: UUID | null, includeDeleted?: boolean): LocalSpecialDay[];
  getUpcomingSpecialDays(childId?: UUID | null, limit?: number): LocalSpecialDay[];
  getSettings(): LocalFamilySettings;
  updateSettings(input: UpdateSettingsInput): LocalFamilySettings;
  exportData(): string;
  importData(raw: string): LocalDatabaseState;
  resetAllData(): LocalDatabaseState;
  updateScreenTime(input: UpdateScreenTimeInput): LocalScreenTimeLog;
  getScreenTimeBalance(childId: UUID): number;
  listScreenTimeLogs(childId: UUID): LocalScreenTimeLog[];
  getWeeklyScreenTime(childId: UUID, weekStartDate: string): WeeklyScreenTimeDay[];
  updatePlannedScreenTime(childId: UUID, date: string, plannedMinutes: number): LocalScreenTimeSchedule;
  redeemStarsForScreenTime(childId: UUID, date: string, stars: number, note?: string | null): LocalScreenTimeLog;
  addScreenTime(childId: UUID, date: string, minutes: number, note?: string | null): LocalScreenTimeLog;
  deductScreenTimePenalty(childId: UUID, date: string, minutes: number, reason?: string | null): LocalScreenTimeLog;
  recordScreenTimeUsed(childId: UUID, date: string, minutes: number): LocalScreenTimeLog;
  getScreenTimeLogsByChild(childId: UUID): LocalScreenTimeLog[];
  getTodayScreenTimeByChild(childId: UUID): WeeklyScreenTimeDay;
  createGrowthRecord(input: CreateGrowthRecordInput): LocalGrowthRecord;
  updateGrowthRecord(growthRecordId: UUID, input: UpdateGrowthRecordInput): LocalGrowthRecord;
  deleteGrowthRecord(growthRecordId: UUID): LocalGrowthRecord;
  getGrowthRecords(childId?: UUID): LocalGrowthRecord[];
  getLatestGrowthRecordByChild(childId: UUID): LocalGrowthRecord | null;
  getGrowthRecordsByChild(childId: UUID): LocalGrowthRecord[];
  addPiggyIncome(input: AddPiggyIncomeInput): LocalPiggyIncome;
  depositPiggyCoin(childId: UUID, amount: number): LocalPiggyBankLog;
  getPiggyBankSummary(childId: UUID): PiggyBankSummary;
  getPiggyIncomeRecords(childId?: UUID): LocalPiggyIncome[];
  getPiggyBankLogs(childId?: UUID): LocalPiggyBankLog[];
  createPiggyProduct(input: CreatePiggyProductInput): LocalPiggyProduct;
  updatePiggyProduct(productId: UUID, input: UpdatePiggyProductInput): LocalPiggyProduct;
  deletePiggyProduct(productId: UUID): LocalPiggyProduct;
  listPiggyProducts(childId?: UUID, includeDeleted?: boolean): LocalPiggyProduct[];
  setPiggyProductShelfStatus(productId: UUID, shelfStatus: LocalPiggyProduct['shelf_status']): LocalPiggyProduct;
  savePiggyShelfOrder(childId: UUID, productIds: UUID[]): LocalPiggyShelfOrder;
  getPiggyShelfProducts(childId: UUID): LocalPiggyProduct[];
  getPiggyProductDisplaySettings(childId: UUID): LocalPiggyProductDisplaySettings | null;
  savePiggyProductDisplaySettings(childId: UUID, settings: Pick<LocalPiggyProductDisplaySettings, 'selectedProductIds' | 'productDisplayOrder'>): LocalPiggyProductDisplaySettings;
  requestPiggyPurchase(childId: UUID, productId: UUID): LocalPiggyPurchase;
  cancelPiggyPurchase(purchaseId: UUID): LocalPiggyPurchase;
  completePiggyPurchase(purchaseId: UUID): LocalPiggyPurchase;
  confirmPiggyPurchaseArrived(purchaseId: UUID): LocalPiggyPurchase;
  listPiggyPurchases(childId?: UUID): LocalPiggyPurchase[];
}

export class LocalDataService implements LocalDataRepository {
  constructor(private readonly db: MockDatabase = mockDatabase) {}

  getState() {
    this.ensureDailyTaskInstances();
    return this.db.read();
  }

  getRepositoryScope() {
    const state = this.db.read();
    return {
      family_id: state.family_id,
      parent_id: state.parent_id ?? state.current_user_id ?? null,
      child_id: state.active_child_id,
      device_id: state.device_id
    };
  }

  resetLocalData() {
    return this.db.reset();
  }

  subscribe(listener: (state: LocalDatabaseState) => void) {
    return this.db.subscribe(listener);
  }

  createChild(input: CreateChildInput) {
    return this.db.transaction((state) => {
      const timestamp = now();
      const child: LocalChild = {
        id: id(),
        family_id: state.family_id,
        display_name: requiredText(input.display_name, 'display_name'),
        legal_name: input.legal_name?.trim() || null,
        birth_date: input.birth_date ?? null,
        birthday: input.birth_date ?? null,
        gender: input.gender?.trim() || null,
        avatar_path: input.avatar_path ?? null,
        avatar_media_id: input.avatar_media_id ?? null,
        theme_color: input.theme_color ?? null,
        timezone: input.timezone || 'Asia/Taipei',
        status: 'active',
        notes: input.notes?.trim() || null,
        created_by: state.current_user_id,
        created_at: timestamp,
        updated_at: timestamp,
        archived_at: null
      };
      state.children.push(child);
      state.active_child_id ??= child.id;
      return child;
    });
  }

  updateChild(childId: UUID, input: UpdateChildInput) {
    return this.db.transaction((state) => {
      const child = requireChild(state, childId);
      if (input.display_name !== undefined) {
        child.display_name = requiredText(input.display_name, 'display_name');
      }
      if (input.legal_name !== undefined) child.legal_name = input.legal_name?.trim() || null;
      if (input.birth_date !== undefined) {
        child.birth_date = input.birth_date;
        child.birthday = input.birth_date;
      }
      if (input.gender !== undefined) child.gender = input.gender?.trim() || null;
      if (input.avatar_path !== undefined) child.avatar_path = input.avatar_path;
      if (input.avatar_media_id !== undefined) child.avatar_media_id = input.avatar_media_id;
      if (input.theme_color !== undefined) child.theme_color = input.theme_color;
      if (input.timezone !== undefined) child.timezone = requiredText(input.timezone, 'timezone');
      if (input.notes !== undefined) child.notes = input.notes?.trim() || null;
      child.updated_at = now();
      return child;
    });
  }

  deleteChild(childId: UUID) {
    return this.db.transaction((state) => {
      const child = requireChild(state, childId);
      child.status = 'archived';
      child.archived_at = now();
      child.updated_at = child.archived_at;

      if (state.active_child_id === childId) {
        state.active_child_id = state.children.find((item) => item.status === 'active')?.id ?? null;
      }
      return child;
    });
  }

  switchChild(childId: UUID) {
    return this.db.transaction((state) => {
      const child = requireChild(state, childId);
      state.active_child_id = child.id;
      return child;
    });
  }

  listChildren(includeArchived = false) {
    return this.db
      .read()
      .children.filter((child) => includeArchived || child.status === 'active')
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  createTask(input: CreateTaskInput) {
    return this.db.transaction((state) => {
      requireChild(state, input.child_id);
      const rewardStars = input.reward_stars ?? 0;
      const rewardMinutes = input.reward_screen_minutes ?? 0;
      if (!Number.isInteger(rewardStars) || rewardStars < 0 || !Number.isInteger(rewardMinutes) || rewardMinutes < 0) {
        throw new LocalDataError('Task rewards must be non-negative integers', 'VALIDATION_ERROR');
      }

      const title = input.title?.trim() || '';
      if (!title && !input.task_image_media_id && !input.thumbnail_media_id) {
        throw new LocalDataError('Task title or image is required', 'VALIDATION_ERROR');
      }

      const timestamp = now();
      const task: LocalTask = {
        id: id(),
        family_id: state.family_id,
        child_id: input.child_id,
        title,
        description: input.description?.trim() || null,
        task_image_media_id: input.task_image_media_id ?? null,
        thumbnail_media_id: input.thumbnail_media_id ?? null,
        category: input.category ?? 'daily',
        task_date: input.task_date ?? today(),
        due_at: input.due_at ?? null,
        recurrence_rule: input.recurrence_rule ?? null,
        status: 'pending',
        reward_stars: rewardStars,
        reward_screen_minutes: rewardMinutes,
        completion_note: null,
        completed_at: null,
        reviewed_by: null,
        reviewed_at: null,
        rejection_reason: null,
        created_by: state.current_user_id,
        created_at: timestamp,
        updated_at: timestamp,
        archived_at: null
      };
      state.tasks.push(task);
      return task;
    });
  }

  completeTask(taskId: UUID, completionNote?: string | null) {
    return this.db.transaction((state) => {
      const task = requireTask(state, taskId);
      if (task.status !== 'pending' && task.status !== 'rejected') {
        throw new LocalDataError('Only pending or rejected tasks can be completed', 'INVALID_TASK_STATUS');
      }
      task.status = 'submitted';
      task.completion_note = completionNote?.trim() || null;
      task.completed_at = now();
      task.reviewed_by = null;
      task.reviewed_at = null;
      task.rejection_reason = null;
      task.updated_at = task.completed_at;
      return task;
    });
  }

  approveTask(taskId: UUID) {
    return this.db.transaction((state) => {
      const task = requireTask(state, taskId);
      if (task.status === 'approved') return task;
      if (task.status !== 'submitted') {
        throw new LocalDataError('Only submitted tasks can be approved', 'INVALID_TASK_STATUS');
      }

      const timestamp = now();
      task.status = 'approved';
      task.reviewed_by = state.current_user_id;
      task.reviewed_at = timestamp;
      task.updated_at = timestamp;

      const starKey = `task:${task.id}:stars`;
      if (task.reward_stars > 0 && !state.stars.some((item) => item.idempotency_key === starKey)) {
        state.stars.push({
          id: id(),
          family_id: task.family_id,
          child_id: task.child_id,
          amount: task.reward_stars,
          transaction_type: 'task_reward',
          reason: `完成任務：${task.title}`,
          task_id: task.id,
          share_id: null,
          dream_id: null,
          reversal_of_id: null,
          idempotency_key: starKey,
          created_by: state.current_user_id,
          created_at: timestamp
        });
      }

      return task;
    });
  }

  listTasks(childId?: UUID) {
    return this.db
      .read()
      .tasks.filter((task) => !childId || task.child_id === childId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  getStarBalance(childId: UUID) {
    const state = this.db.read();
    requireChild(state, childId, true);
    return sum(state.stars.filter((item) => item.child_id === childId).map((item) => item.amount));
  }

  listStarTransactions(childId: UUID) {
    return this.db
      .read()
      .stars.filter((item) => item.child_id === childId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  createDream(input: CreateDreamInput) {
    return this.db.transaction((state) => {
      requireChild(state, input.child_id);
      if (!Number.isFinite(input.target_amount) || input.target_amount < 0) {
        throw new LocalDataError('target_amount must be zero or greater', 'VALIDATION_ERROR');
      }
      const timestamp = now();
      const coverUrl = normalizeStoredDreamCoverPath(input.cover_path);
      const coverMediaId = input.cover_media_id ?? null;
      const dream: LocalDream = {
        id: id(),
        family_id: state.family_id,
        child_id: input.child_id,
        title: requiredText(input.title, 'title'),
        description: input.description?.trim() || null,
        cover_path: coverUrl,
        coverUrl,
        imageUrl: coverUrl,
        cover_media_id: coverMediaId,
        coverMediaId,
        cover_mime_type: input.cover_mime_type ?? null,
        cover_file_name: input.cover_file_name?.trim() || null,
        target_amount: input.target_amount,
        currency: input.currency ?? 'TWD',
        status: 'active',
        priority: input.priority ?? 0,
        requested_by_child: false,
        approved_by: state.current_user_id,
        approved_at: timestamp,
        target_date: input.target_date ?? null,
        completed_at: null,
        created_by: state.current_user_id,
        created_at: timestamp,
        updated_at: timestamp,
        archived_at: null
      };
      state.dreams.push(dream);
      return dream;
    });
  }

  migrateDreamCoverToMedia(dreamId: UUID, input: MigrateDreamCoverInput) {
    return this.db.transaction((state) => {
      const dream = requireDream(state, dreamId);
      dream.cover_media_id = input.cover_media_id;
      dream.coverMediaId = input.cover_media_id;
      dream.cover_mime_type = input.cover_mime_type ?? null;
      dream.cover_file_name = input.cover_file_name?.trim() || null;
      dream.cover_path = normalizeStoredDreamCoverPath(dream.cover_path);
      dream.coverUrl = normalizeStoredDreamCoverPath(dream.coverUrl);
      dream.imageUrl = normalizeStoredDreamCoverPath(dream.imageUrl);
      dream.updated_at = now();
      return dream;
    });
  }

  deleteDream(dreamId: UUID) {
    return this.db.transaction((state) => {
      const dream = requireDream(state, dreamId);
      state.dreams = state.dreams.filter((item) => item.id !== dreamId);
      state.dream_funds = state.dream_funds.filter((item) => item.dream_id !== dreamId);
      return dream;
    });
  }

  addDreamDeposit(dreamId: UUID, amount: number, note?: string | null) {
    return this.db.transaction((state) => {
      const dream = requireDream(state, dreamId);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new LocalDataError('Deposit amount must be greater than zero', 'VALIDATION_ERROR');
      }
      if (!['active', 'funded'].includes(dream.status)) {
        throw new LocalDataError('Dream cannot receive deposits in its current status', 'INVALID_DREAM_STATUS');
      }

      const timestamp = now();
      const fund: LocalDreamFund = {
        id: id(),
        family_id: dream.family_id,
        child_id: dream.child_id,
        dream_id: dream.id,
        amount,
        transaction_type: 'deposit',
        note: note?.trim() || null,
        source_star_id: null,
        reversal_of_id: null,
        idempotency_key: null,
        created_by: state.current_user_id,
        created_at: timestamp
      };
      state.dream_funds.push(fund);

      const balance = sum(
        state.dream_funds.filter((item) => item.dream_id === dream.id).map((item) => item.amount)
      );
      if (balance >= dream.target_amount && dream.status === 'active') {
        dream.status = 'funded';
        dream.updated_at = timestamp;
      }
      return fund;
    });
  }

  completeDream(dreamId: UUID) {
    return this.db.transaction((state) => {
      const dream = requireDream(state, dreamId);
      const balance = sum(
        state.dream_funds.filter((item) => item.dream_id === dream.id).map((item) => item.amount)
      );
      if (balance < dream.target_amount) {
        throw new LocalDataError('Dream target has not been funded', 'DREAM_NOT_FUNDED');
      }
      dream.status = 'completed';
      dream.completed_at = now();
      dream.updated_at = dream.completed_at;
      return dream;
    });
  }

  listDreams(childId?: UUID, includeCompleted = true) {
    const state = this.db.read();
    return state.dreams
      .filter(
        (dream) =>
          (!childId || dream.child_id === childId) &&
          (includeCompleted || dream.status !== 'completed')
      )
      .map((dream): DreamWithBalance => {
        const currentAmount = sum(
          state.dream_funds.filter((fund) => fund.dream_id === dream.id).map((fund) => fund.amount)
        );
        return {
          ...dream,
          current_amount: currentAmount,
          progress_percent:
            dream.target_amount === 0
              ? 100
              : Math.min(100, Math.round((currentAmount / dream.target_amount) * 100))
        };
      })
      .sort((a, b) => b.priority - a.priority || b.created_at.localeCompare(a.created_at));
  }

  createShare(input: CreateShareInput) {
    return this.db.transaction((state) => {
      requireChild(state, input.child_id);
      const media = input.media ?? [];
      const mediaTypes = [...new Set(media.map((item) => item.media_type))];
      const shareType: LocalShare['share_type'] =
        mediaTypes.length === 0
          ? 'text'
          : mediaTypes.length === 1
            ? mediaTypes[0]
            : 'mixed';
      if (shareType === 'text' && !input.caption?.trim()) {
        throw new LocalDataError('Text shares require a caption', 'VALIDATION_ERROR');
      }

      const timestamp = now();
      const sourceType = input.source_type ?? 'child_device';
      const share: LocalShare = {
        id: id(),
        family_id: state.family_id,
        child_id: input.child_id,
        title: input.title?.trim() || null,
        caption: input.caption?.trim() || null,
        share_type: shareType,
        type: shareType,
        mediaUrl: null,
        source_type: sourceType,
        status: input.status ?? 'approved',
        submitted_at: timestamp,
        reviewed_by: null,
        reviewed_at: null,
        rejection_reason: null,
        published_at: null,
        created_by_user_id: sourceType === 'parent' ? state.current_user_id : null,
        created_by_device_id: sourceType === 'child_device' ? `local-device:${input.child_id}` : null,
        created_at: timestamp,
        updated_at: timestamp,
        deleted_at: null
      };
      state.shares.push(share);

      const records = media.map((item, index): LocalShareMedia => {
        const mediaId = id();
        return {
          id: mediaId,
          family_id: state.family_id,
          child_id: input.child_id,
          share_id: share.id,
          media_type: item.media_type,
          bucket: 'local-media',
          storage_path: `local/${state.family_id}/${input.child_id}/${share.id}/${item.file_name ?? mediaId}`,
          mime_type: item.mime_type,
          file_size_bytes: item.file_size_bytes ?? 0,
          width: item.width ?? null,
          height: item.height ?? null,
          duration_seconds: item.duration_seconds ?? null,
          thumbnail_path: item.thumbnail_path ?? null,
          sort_order: index,
          created_at: timestamp,
          local_data_url: null
        };
      });
      state.share_media.push(...records);
      return { ...share, media: records };
    });
  }

  listShares(childId?: UUID) {
    const state = this.db.read();
    return state.shares
      .filter((share) => !share.deleted_at && (!childId || share.child_id === childId))
      .map((share): ShareWithMedia => ({
        ...share,
        media: state.share_media
          .filter((media) => media.share_id === share.id)
          .sort((a, b) => a.sort_order - b.sort_order)
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  deleteShare(shareId: UUID) {
    return this.db.transaction((state) => {
      const share = requireShare(state, shareId);
      if (share.deleted_at) return share;
      const timestamp = now();
      share.deleted_at = timestamp;
      share.updated_at = timestamp;
      return share;
    });
  }

  approveShare(shareId: UUID, rewardStars = 0) {
    return this.db.transaction((state) => {
      const share = requireShare(state, shareId);
      if (share.status === 'approved') return share;
      if (share.status !== 'pending_review') {
        throw new LocalDataError('Only pending shares can be approved', 'INVALID_SHARE_STATUS');
      }
      if (!Number.isInteger(rewardStars) || rewardStars < 0) {
        throw new LocalDataError('rewardStars must be a non-negative integer', 'VALIDATION_ERROR');
      }

      const timestamp = now();
      share.status = 'approved';
      share.reviewed_by = state.current_user_id;
      share.reviewed_at = timestamp;
      share.published_at = timestamp;
      share.updated_at = timestamp;

      const rewardKey = `share:${share.id}:stars`;
      if (rewardStars > 0 && !state.stars.some((item) => item.idempotency_key === rewardKey)) {
        state.stars.push({
          id: id(),
          family_id: share.family_id,
          child_id: share.child_id,
          amount: rewardStars,
          transaction_type: 'share_reward',
          reason: '分享獎勵',
          task_id: null,
          share_id: share.id,
          dream_id: null,
          reversal_of_id: null,
          idempotency_key: rewardKey,
          created_by: state.current_user_id,
          created_at: timestamp
        });
      }
      return share;
    });
  }

  createMailboxMessage(input: CreateMailboxMessageInput) {
    return this.db.transaction((state) => {
      requireChild(state, input.child_id);
      if (!input.message?.trim() && !input.media) {
        throw new LocalDataError('Mailbox messages require text or media', 'VALIDATION_ERROR');
      }
      const timestamp = now();
      const isScheduled = Boolean(input.scheduled_at);
      const message: LocalMailboxMessage = {
        id: id(),
        family_id: state.family_id,
        child_id: input.child_id,
        sender_user_id: state.current_user_id,
        title: input.title?.trim() || null,
        message: input.message?.trim() || null,
        card_type: input.card_type ?? (input.media ? 'mixed' : 'text'),
        template_key: input.template_key ?? null,
        media_bucket: input.media ? 'local-media' : null,
        media_path: input.media
          ? `local/${state.family_id}/${input.child_id}/mailbox/${id()}/${input.media.file_name ?? 'attachment'}`
          : null,
        media_id: input.media?.media_id ?? null,
        media_mime_type: input.media?.mime_type ?? null,
        local_data_url: null,
        status: isScheduled ? 'scheduled' : 'sent',
        scheduled_at: input.scheduled_at ?? null,
        sent_at: isScheduled ? null : timestamp,
        opened_at: null,
        archived_at: null,
        created_at: timestamp,
        updated_at: timestamp
      };
      state.encouragement_cards.push(message);
      return message;
    });
  }

  markMessageRead(messageId: UUID) {
    return this.db.transaction((state) => {
      const message = state.encouragement_cards.find((item) => item.id === messageId);
      if (!message) throw new LocalDataError('Mailbox message not found', 'MESSAGE_NOT_FOUND');
      if (message.status === 'opened') return message;
      if (message.status !== 'sent') {
        throw new LocalDataError('Only sent messages can be opened', 'INVALID_MESSAGE_STATUS');
      }
      message.status = 'opened';
      message.opened_at = now();
      message.updated_at = message.opened_at;
      return message;
    });
  }

  listMailboxMessages(childId?: UUID) {
    return this.db
      .read()
      .encouragement_cards.filter(
        (message) =>
          (!childId || message.child_id === childId) &&
          ['sent', 'opened', 'archived'].includes(message.status)
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  createBadge(input: CreateBadgeInput) {
    return this.db.transaction((state) => {
      const rewardStars = input.reward_stars ?? 0;
      if (!Number.isInteger(rewardStars) || rewardStars < 0) {
        throw new LocalDataError('reward_stars must be a non-negative integer', 'VALIDATION_ERROR');
      }
      const timestamp = now();
      const badge: LocalBadge = {
        id: id(),
        family_id: state.family_id,
        name: input.name?.trim() ?? '',
        icon: normalizeBadgeIcon(input.icon),
        description: input.description?.trim() || null,
        reward_stars: rewardStars,
        created_by: state.current_user_id,
        created_at: timestamp,
        updated_at: timestamp,
        deleted_at: null
      };
      state.badges.push(badge);
      return badge;
    });
  }

  deleteBadge(badgeId: UUID) {
    return this.db.transaction((state) => {
      const badge = requireBadge(state, badgeId);
      badge.deleted_at = now();
      badge.updated_at = badge.deleted_at;
      return badge;
    });
  }

  awardBadge(input: AwardBadgeInput) {
    return this.db.transaction((state) => {
      requireChild(state, input.child_id);
      const badge = requireBadge(state, input.badge_id);
      const existing = state.child_badges.find(
        (item) => item.child_id === input.child_id && item.badge_id === input.badge_id
      );
      if (existing) return existing;

      const timestamp = now();
      const childBadge: LocalChildBadge = {
        id: id(),
        family_id: state.family_id,
        child_id: input.child_id,
        badge_id: badge.id,
        note: input.note?.trim() || null,
        awarded_by: state.current_user_id,
        awarded_at: timestamp
      };
      state.child_badges.push(childBadge);

      const rewardKey = `badge:${childBadge.id}:stars`;
      if (badge.reward_stars > 0) {
        state.stars.push({
          id: id(),
          family_id: state.family_id,
          child_id: input.child_id,
          amount: badge.reward_stars,
          transaction_type: 'encouragement',
          reason: `獲得徽章：${badge.name}`,
          task_id: null,
          share_id: null,
          dream_id: null,
          reversal_of_id: null,
          idempotency_key: rewardKey,
          created_by: state.current_user_id,
          created_at: timestamp
        });
      }

      return childBadge;
    });
  }

  getBadges(includeDeleted = false) {
    return this.db
      .read()
      .badges.filter((badge) => includeDeleted || !badge.deleted_at)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  getChildBadges(childId?: UUID) {
    return this.db
      .read()
      .child_badges.filter((item) => !childId || item.child_id === childId)
      .sort((a, b) => b.awarded_at.localeCompare(a.awarded_at));
  }

  createSpecialDay(input: CreateSpecialDayInput) {
    return this.db.transaction((state) => {
      if (input.child_id) requireChild(state, input.child_id);
      const timestamp = now();
      const specialDay: LocalSpecialDay = {
        id: id(),
        family_id: state.family_id,
        child_id: input.child_id ?? null,
        childId: input.child_id ?? null,
        title: requiredText(input.title, 'title'),
        date: validateDate(input.date, 'date'),
        type: input.type,
        description: input.description?.trim() || null,
        image_media_id: input.image_media_id ?? null,
        image_data_url: null,
        createdBy: input.createdBy ?? 'parent',
        source: input.source ?? 'manual',
        created_by: state.current_user_id,
        created_at: timestamp,
        updated_at: timestamp,
        deleted_at: null
      };
      state.special_days.push(specialDay);
      return specialDay;
    });
  }

  updateSpecialDay(specialDayId: UUID, input: UpdateSpecialDayInput) {
    return this.db.transaction((state) => {
      const specialDay = requireSpecialDay(state, specialDayId);
      if (input.child_id !== undefined) {
        if (input.child_id) requireChild(state, input.child_id);
        specialDay.child_id = input.child_id ?? null;
        specialDay.childId = input.child_id ?? null;
      }
      if (input.title !== undefined) specialDay.title = requiredText(input.title, 'title');
      if (input.date !== undefined) specialDay.date = validateDate(input.date, 'date');
      if (input.type !== undefined) specialDay.type = input.type;
      if (input.description !== undefined) specialDay.description = input.description?.trim() || null;
      if (input.image_media_id !== undefined) specialDay.image_media_id = input.image_media_id;
      if (input.image_data_url !== undefined) specialDay.image_data_url = null;
      if (input.createdBy !== undefined) specialDay.createdBy = input.createdBy;
      if (input.source !== undefined) specialDay.source = input.source;
      specialDay.updated_at = now();
      return specialDay;
    });
  }

  deleteSpecialDay(specialDayId: UUID) {
    return this.db.transaction((state) => {
      const specialDay = requireSpecialDay(state, specialDayId);
      specialDay.deleted_at = now();
      specialDay.updated_at = specialDay.deleted_at;
      return specialDay;
    });
  }

  getSpecialDays(childId?: UUID | null, includeDeleted = false) {
    return this.db
      .read()
      .special_days.filter(
        (item) =>
          (includeDeleted || !item.deleted_at) &&
          (childId === undefined || item.child_id === null || item.child_id === childId)
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  getUpcomingSpecialDays(childId?: UUID | null, limit = 10) {
    return this.getSpecialDays(childId)
      .filter((item) => daysUntilDate(item.date) >= 0)
      .sort((a, b) => daysUntilDate(a.date) - daysUntilDate(b.date))
      .slice(0, limit);
  }

  getSettings() {
    return this.db.read().family_settings;
  }

  updateSettings(input: UpdateSettingsInput) {
    return this.db.transaction((state) => {
      const settings = state.family_settings;
      if (input.family_name !== undefined) settings.family_name = requiredText(input.family_name, 'family_name');
      if (input.family_intro !== undefined) settings.family_intro = input.family_intro.trim();
      if (input.family_avatar_data_url !== undefined) settings.family_avatar_data_url = null;
      if (input.family_avatar_media_id !== undefined) settings.family_avatar_media_id = input.family_avatar_media_id;
      if (input.parent_name !== undefined) settings.parent_name = requiredText(input.parent_name, 'parent_name');
      if (input.parent_email !== undefined) settings.parent_email = requiredText(input.parent_email, 'parent_email');
      if (input.parent_avatar_data_url !== undefined) settings.parent_avatar_data_url = null;
      if (input.parent_avatar_media_id !== undefined) settings.parent_avatar_media_id = input.parent_avatar_media_id;
      if (input.default_daily_screen_minutes !== undefined) {
        if (!Number.isInteger(input.default_daily_screen_minutes) || input.default_daily_screen_minutes < 0) {
          throw new LocalDataError('default_daily_screen_minutes must be a non-negative integer', 'VALIDATION_ERROR');
        }
        settings.default_daily_screen_minutes = input.default_daily_screen_minutes;
      }
      if (input.default_daily_star_limit !== undefined) {
        if (!Number.isInteger(input.default_daily_star_limit) || input.default_daily_star_limit < 0) {
          throw new LocalDataError('default_daily_star_limit must be a non-negative integer', 'VALIDATION_ERROR');
        }
        settings.default_daily_star_limit = input.default_daily_star_limit;
      }
      if (input.screen_time_star_minutes_per_star !== undefined) {
        if (!Number.isInteger(input.screen_time_star_minutes_per_star) || input.screen_time_star_minutes_per_star <= 0) {
          throw new LocalDataError(
            'screen_time_star_minutes_per_star must be a positive integer',
            'VALIDATION_ERROR'
          );
        }
        settings.screen_time_star_minutes_per_star = input.screen_time_star_minutes_per_star;
      }
      if (input.default_theme_color !== undefined) settings.default_theme_color = requiredText(input.default_theme_color, 'default_theme_color');
      if (input.allow_photo_sharing !== undefined) settings.allow_photo_sharing = input.allow_photo_sharing;
      if (input.allow_video_sharing !== undefined) settings.allow_video_sharing = input.allow_video_sharing;
      if (input.allow_audio_sharing !== undefined) settings.allow_audio_sharing = input.allow_audio_sharing;
      if (input.notify_task_completed !== undefined) settings.notify_task_completed = input.notify_task_completed;
      if (input.notify_dream_completed !== undefined) settings.notify_dream_completed = input.notify_dream_completed;
      if (input.notify_share_pending !== undefined) settings.notify_share_pending = input.notify_share_pending;
      if (input.notify_special_day !== undefined) settings.notify_special_day = input.notify_special_day;
      settings.updated_at = now();
      return settings;
    });
  }

  exportData() {
    return this.db.exportJson();
  }

  importData(raw: string) {
    try {
      return this.db.importJson(raw);
    } catch {
      throw new LocalDataError('Invalid local data JSON', 'INVALID_IMPORT_DATA');
    }
  }

  resetAllData() {
    return this.resetLocalData();
  }

  updateScreenTime(input: UpdateScreenTimeInput) {
    return this.db.transaction((state) => {
      requireChild(state, input.child_id);
      if (!Number.isInteger(input.minutes_delta) || input.minutes_delta === 0) {
        throw new LocalDataError('minutes_delta must be a non-zero integer', 'VALIDATION_ERROR');
      }

      const inferredType =
        input.entry_type ??
        (input.minutes_delta > 0 ? 'manual_grant' : 'manual_deduction');
      if (inferredType === 'usage' && input.minutes_delta > 0) {
        throw new LocalDataError('Usage must deduct screen time', 'VALIDATION_ERROR');
      }

      const currentBalance = sum(
        state.screen_time_logs
          .filter((item) => item.child_id === input.child_id)
          .map((item) => item.minutes_delta)
      );
      if (currentBalance + input.minutes_delta < 0) {
        throw new LocalDataError('Screen time balance cannot be negative', 'INSUFFICIENT_SCREEN_TIME');
      }

      const log: LocalScreenTimeLog = {
        id: id(),
        family_id: state.family_id,
        child_id: input.child_id,
        date: today(),
        type: inferredType === 'usage' ? 'used' : inferredType === 'manual_deduction' ? 'penalty' : 'manual_add',
        minutes: input.minutes_delta,
        starsUsed: null,
        note: input.reason?.trim() || null,
        operator_name: state.family_settings.parent_name || '家長',
        entry_type: inferredType,
        minutes_delta: input.minutes_delta,
        task_id: null,
        session_started_at: input.session_started_at ?? null,
        session_ended_at: input.session_ended_at ?? null,
        device_id: null,
        reason: input.reason?.trim() || null,
        reversal_of_id: null,
        idempotency_key: null,
        created_by: state.current_user_id,
        created_at: now()
      };
      state.screen_time_logs.push(log);
      return log;
    });
  }

  getScreenTimeBalance(childId: UUID) {
    const state = this.db.read();
    requireChild(state, childId, true);
    return getLedgerBalance(state, childId);
  }

  listScreenTimeLogs(childId: UUID) {
    return this.db
      .read()
      .screen_time_logs.filter((item) => item.child_id === childId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  getWeeklyScreenTime(childId: UUID, weekStartDate: string) {
    return this.db.transaction((state) => {
      requireChild(state, childId, true);
      const start = getWeekStartDate(validateDate(weekStartDate, 'weekStartDate'));
      return SCREEN_TIME_WEEKDAY_LABELS.map((weekday, index) =>
        buildScreenTimeDay(state, childId, addDays(start, index), weekday)
      );
    });
  }

  updatePlannedScreenTime(childId: UUID, date: string, plannedMinutes: number) {
    return this.db.transaction((state) => {
      requireChild(state, childId);
      const normalizedDate = validateDate(date, 'date');
      validateNonNegativeInteger(plannedMinutes, 'plannedMinutes');
      const weekStartDate = getWeekStartDate(normalizedDate);
      const timestamp = now();
      let schedule = state.screen_time_schedules.find((item) => item.childId === childId && item.date === normalizedDate);
      if (schedule) {
        schedule.plannedMinutes = plannedMinutes;
        schedule.updatedAt = timestamp;
      } else {
        schedule = {
          id: id(),
          family_id: state.family_id,
          childId,
          weekStartDate,
          date: normalizedDate,
          plannedMinutes,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        state.screen_time_schedules.push(schedule);
      }
      return schedule;
    });
  }

  redeemStarsForScreenTime(childId: UUID, date: string, stars: number, note?: string | null) {
    return this.db.transaction((state) => {
      requireChild(state, childId);
      const normalizedDate = validateDate(date, 'date');
      if (!Number.isInteger(stars) || stars <= 0) {
        throw new LocalDataError('stars must be a positive integer', 'VALIDATION_ERROR');
      }
      const currentStars = sum(state.stars.filter((item) => item.child_id === childId).map((item) => item.amount));
      if (currentStars < stars) {
        throw new LocalDataError('Not enough stars to redeem screen time', 'INSUFFICIENT_STARS');
      }
      const timestamp = now();
      const minutes = stars * STAR_TO_SCREEN_MINUTES;
      const log = createScreenTimeLog(state, {
        childId,
        date: normalizedDate,
        type: 'redeem',
        minutes,
        starsUsed: stars,
        note
      });
      state.stars.push({
        id: id(),
        family_id: state.family_id,
        child_id: childId,
        type: 'spent',
        amount: -stars,
        transaction_type: 'manual_adjustment',
        reason: note?.trim() || `Redeemed ${stars} stars for ${minutes} screen-time minutes`,
        sourceType: 'screen_time_log',
        sourceId: log.id,
        task_id: null,
        share_id: null,
        dream_id: null,
        reversal_of_id: null,
        idempotency_key: `screen-time-redeem:${log.id}`,
        created_by: state.current_user_id,
        created_at: timestamp
      });
      return log;
    });
  }

  addScreenTime(childId: UUID, date: string, minutes: number, note?: string | null) {
    return this.db.transaction((state) => {
      requireChild(state, childId);
      const normalizedDate = validateDate(date, 'date');
      if (!Number.isInteger(minutes) || minutes <= 0) {
        throw new LocalDataError('minutes must be a positive integer', 'VALIDATION_ERROR');
      }
      return createScreenTimeLog(state, { childId, date: normalizedDate, type: 'manual_add', minutes, note });
    });
  }

  deductScreenTimePenalty(childId: UUID, date: string, minutes: number, reason?: string | null) {
    return this.db.transaction((state) => {
      requireChild(state, childId);
      const normalizedDate = validateDate(date, 'date');
      if (!Number.isInteger(minutes) || minutes <= 0) {
        throw new LocalDataError('minutes must be a positive integer', 'VALIDATION_ERROR');
      }
      if (getLedgerBalance(state, childId) < minutes) {
        throw new LocalDataError('Screen time cannot be deducted below zero', 'INSUFFICIENT_SCREEN_TIME');
      }
      return createScreenTimeLog(state, { childId, date: normalizedDate, type: 'penalty', minutes, note: reason });
    });
  }

  recordScreenTimeUsed(childId: UUID, date: string, minutes: number) {
    return this.db.transaction((state) => {
      requireChild(state, childId);
      const normalizedDate = validateDate(date, 'date');
      if (!Number.isInteger(minutes) || minutes <= 0) {
        throw new LocalDataError('minutes must be a positive integer', 'VALIDATION_ERROR');
      }
      if (getLedgerBalance(state, childId) < minutes) {
        throw new LocalDataError('Screen time cannot be used below zero', 'INSUFFICIENT_SCREEN_TIME');
      }
      return createScreenTimeLog(state, { childId, date: normalizedDate, type: 'used', minutes, note: 'Used screen time' });
    });
  }

  getScreenTimeLogsByChild(childId: UUID) {
    return this.listScreenTimeLogs(childId);
  }

  getTodayScreenTimeByChild(childId: UUID) {
    return this.db.transaction((state) => {
      requireChild(state, childId, true);
      const date = today();
      const weekdayIndex = new Date(`${date}T00:00:00`).getDay() === 0 ? 6 : new Date(`${date}T00:00:00`).getDay() - 1;
      return buildScreenTimeDay(state, childId, date, SCREEN_TIME_WEEKDAY_LABELS[weekdayIndex]);
    });
  }

  createGrowthRecord(input: CreateGrowthRecordInput) {
    return this.db.transaction((state) => {
      requireChild(state, input.child_id);
      const timestamp = now();
      const record: LocalGrowthRecord = {
        id: id(),
        family_id: state.family_id,
        child_id: input.child_id,
        date: validateDate(input.date, 'date'),
        height_cm: validateNonNegativeNumber(input.height_cm, 'height_cm'),
        weight_kg: validateNonNegativeNumber(input.weight_kg, 'weight_kg'),
        reading_count: validateNonNegativeInteger(input.reading_count, 'reading_count'),
        note: input.note?.trim() || null,
        created_at: timestamp,
        updated_at: timestamp
      };
      state.growth_records.push(record);
      return record;
    });
  }

  updateGrowthRecord(growthRecordId: UUID, input: UpdateGrowthRecordInput) {
    return this.db.transaction((state) => {
      const record = requireGrowthRecord(state, growthRecordId);
      if (input.child_id !== undefined) {
        requireChild(state, input.child_id);
        record.child_id = input.child_id;
      }
      if (input.date !== undefined) record.date = validateDate(input.date, 'date');
      if (input.height_cm !== undefined) record.height_cm = validateNonNegativeNumber(input.height_cm, 'height_cm');
      if (input.weight_kg !== undefined) record.weight_kg = validateNonNegativeNumber(input.weight_kg, 'weight_kg');
      if (input.reading_count !== undefined) record.reading_count = validateNonNegativeInteger(input.reading_count, 'reading_count');
      if (input.note !== undefined) record.note = input.note?.trim() || null;
      record.updated_at = now();
      return record;
    });
  }

  deleteGrowthRecord(growthRecordId: UUID) {
    return this.db.transaction((state) => {
      const record = requireGrowthRecord(state, growthRecordId);
      state.growth_records = state.growth_records.filter((item) => item.id !== growthRecordId);
      return record;
    });
  }

  getGrowthRecords(childId?: UUID) {
    return this.db
      .read()
      .growth_records.filter((record) => !childId || record.child_id === childId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  }

  getLatestGrowthRecordByChild(childId: UUID) {
    const state = this.db.read();
    requireChild(state, childId, true);
    return state.growth_records
      .filter((record) => record.child_id === childId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))[0] ?? null;
  }

  getGrowthRecordsByChild(childId: UUID) {
    return this.getGrowthRecords(childId);
  }

  addPiggyIncome(input: AddPiggyIncomeInput) {
    return this.db.transaction((state) => {
      requireChild(state, input.child_id);
      validateNonNegativeInteger(input.amount, 'amount');
      if (input.amount <= 0) throw new LocalDataError('amount must be greater than zero', 'VALIDATION_ERROR');
      const timestamp = now();
      const income: LocalPiggyIncome = {
        id: id(),
        family_id: state.family_id,
        child_id: input.child_id,
        source: requiredText(input.source, 'source'),
        amount: input.amount,
        remaining_amount: input.amount,
        created_by: state.current_user_id,
        created_at: timestamp
      };
      state.piggy_incomes.push(income);
      return income;
    });
  }

  depositPiggyCoin(childId: UUID, amount: number) {
    return this.db.transaction((state) => {
      requireChild(state, childId);
      validateNonNegativeInteger(amount, 'amount');
      if (amount <= 0) throw new LocalDataError('amount must be greater than zero', 'VALIDATION_ERROR');
      if (getPiggyAvailableToday(state, childId) < amount) {
        throw new LocalDataError('Piggy deposit exceeds available income', 'INSUFFICIENT_PIGGY_AVAILABLE');
      }

      let remaining = amount;
      const todayValue = today();
      state.piggy_incomes
        .filter((income) => income.child_id === childId && income.created_at.slice(0, 10) === todayValue && income.remaining_amount > 0)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .forEach((income) => {
          if (remaining <= 0) return;
          const used = Math.min(income.remaining_amount, remaining);
          income.remaining_amount -= used;
          remaining -= used;
        });

      const log: LocalPiggyBankLog = {
        id: id(),
        family_id: state.family_id,
        child_id: childId,
        type: 'coin_deposit',
        amount,
        note: null,
        product_id: null,
        purchase_id: null,
        created_at: now()
      };
      state.piggy_bank_logs.push(log);
      return log;
    });
  }

  getPiggyBankSummary(childId: UUID) {
    const state = this.db.read();
    requireChild(state, childId, true);
    return {
      currentSavings: getPiggySavings(state, childId),
      availableToDepositToday: getPiggyAvailableToday(state, childId),
      depositedToday: getPiggyDepositedToday(state, childId)
    };
  }

  getPiggyIncomeRecords(childId?: UUID) {
    return this.db
      .read()
      .piggy_incomes.filter((income) => !childId || income.child_id === childId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  getPiggyBankLogs(childId?: UUID) {
    return this.db
      .read()
      .piggy_bank_logs.filter((log) => !childId || log.child_id === childId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  createPiggyProduct(input: CreatePiggyProductInput) {
    return this.db.transaction((state) => {
      validateNonNegativeInteger(input.price, 'price');
      if (input.price <= 0) throw new LocalDataError('price must be greater than zero', 'VALIDATION_ERROR');
      const childId = resolvePiggyProductChildId(state, input.child_id);
      requireChild(state, childId);
      const timestamp = now();
      const shelfStatus = input.shelf_status ?? 'backlog';
      const product: LocalPiggyProduct = {
        id: id(),
        family_id: state.family_id,
        child_id: childId,
        name: input.name?.trim() ?? '',
        price: input.price,
        main_media_id: input.main_media_id,
        gallery_media_ids: (input.gallery_media_ids ?? []).slice(0, 5),
        shelf_status: shelfStatus,
        shelf_slot: shelfStatus === 'shelf' ? nextPiggyShelfSlot(state, childId) : null,
        created_by: state.current_user_id,
        created_at: timestamp,
        updated_at: timestamp,
        deleted_at: null
      };
      state.piggy_products.push(product);
      normalizePiggyShelf(state, childId);
      return product;
    });
  }

  updatePiggyProduct(productId: UUID, input: UpdatePiggyProductInput) {
    return this.db.transaction((state) => {
      const product = requirePiggyProduct(state, productId);
      if (input.name !== undefined) product.name = input.name.trim();
      if (input.price !== undefined) {
        validateNonNegativeInteger(input.price, 'price');
        if (input.price <= 0) throw new LocalDataError('price must be greater than zero', 'VALIDATION_ERROR');
        product.price = input.price;
      }
      if (input.main_media_id !== undefined) product.main_media_id = input.main_media_id;
      if (input.gallery_media_ids !== undefined) product.gallery_media_ids = input.gallery_media_ids.slice(0, 5);
      if (input.shelf_status !== undefined) {
        product.shelf_status = input.shelf_status;
        product.shelf_slot = input.shelf_status === 'shelf' ? product.shelf_slot ?? nextPiggyShelfSlot(state, product.child_id) : null;
      }
      product.updated_at = now();
      normalizePiggyShelf(state, product.child_id);
      return product;
    });
  }

  deletePiggyProduct(productId: UUID) {
    return this.db.transaction((state) => {
      const product = requirePiggyProduct(state, productId);
      product.deleted_at = now();
      product.updated_at = product.deleted_at;
      product.shelf_status = 'backlog';
      product.shelf_slot = null;
      state.piggy_shelf_orders.forEach((order) => {
        order.product_ids = order.product_ids.filter((idValue) => idValue !== productId);
        order.updated_at = product.deleted_at ?? now();
      });
      state.piggyProductDisplaySettings.forEach((settings) => {
        settings.selectedProductIds = settings.selectedProductIds.filter((idValue) => idValue !== productId);
        settings.productDisplayOrder = settings.productDisplayOrder.filter((idValue) => idValue !== productId);
        settings.updated_at = product.deleted_at ?? now();
      });
      normalizePiggyShelf(state, product.child_id);
      return product;
    });
  }

  listPiggyProducts(childId?: UUID, includeDeleted = false) {
    return this.db
      .read()
      .piggy_products.filter((product) => (!childId || product.child_id === childId) && (includeDeleted || !product.deleted_at))
      .sort((a, b) => (a.shelf_slot ?? 99) - (b.shelf_slot ?? 99) || b.created_at.localeCompare(a.created_at));
  }

  setPiggyProductShelfStatus(productId: UUID, shelfStatus: LocalPiggyProduct['shelf_status']) {
    return this.updatePiggyProduct(productId, { shelf_status: shelfStatus });
  }

  savePiggyShelfOrder(childId: UUID, productIds: UUID[]) {
    return this.db.transaction((state) => {
      requireChild(state, childId);
      const shelfIds = buildPiggyShelfIds(state, childId);
      const allowed = new Set(shelfIds);
      const orderedIds = [...new Set(productIds.filter((productId) => allowed.has(productId)))];
      shelfIds.forEach((productId) => {
        if (orderedIds.length < 6 && !orderedIds.includes(productId)) orderedIds.push(productId);
      });
      const timestamp = now();
      let order = state.piggy_shelf_orders.find((item) => item.child_id === childId);
      if (order) {
        order.product_ids = orderedIds.slice(0, 6);
        order.updated_at = timestamp;
      } else {
        order = {
          id: id(),
          family_id: state.family_id,
          child_id: childId,
          product_ids: orderedIds.slice(0, 6),
          created_at: timestamp,
          updated_at: timestamp
        };
        state.piggy_shelf_orders.push(order);
      }
      return order;
    });
  }

  getPiggyShelfProducts(childId: UUID) {
    const state = this.db.read();
    requireChild(state, childId, true);
    return getPiggyShelfProductsForChild(state, childId);
  }

  getPiggyProductDisplaySettings(childId: UUID) {
    const state = this.db.read();
    requireChild(state, childId, true);
    return state.piggyProductDisplaySettings.find((item) => item.child_id === childId) ?? null;
  }

  savePiggyProductDisplaySettings(
    childId: UUID,
    settings: Pick<LocalPiggyProductDisplaySettings, 'selectedProductIds' | 'productDisplayOrder'>
  ) {
    return this.db.transaction((state) => {
      requireChild(state, childId);
      const availableIds = new Set(getPiggyDisplayCandidateProducts(state, childId).map((product) => product.id));
      const selectedProductIds = [...new Set(settings.selectedProductIds.filter((productId) => availableIds.has(productId)))].slice(0, 6);
      const selectedSet = new Set(selectedProductIds);
      const productDisplayOrder = [...new Set(settings.productDisplayOrder.filter((productId) => selectedSet.has(productId)))];
      selectedProductIds.forEach((productId) => {
        if (!productDisplayOrder.includes(productId)) productDisplayOrder.push(productId);
      });
      const timestamp = now();
      let displaySettings = state.piggyProductDisplaySettings.find((item) => item.child_id === childId);
      if (displaySettings) {
        displaySettings.selectedProductIds = selectedProductIds;
        displaySettings.productDisplayOrder = productDisplayOrder.slice(0, 6);
        displaySettings.updated_at = timestamp;
      } else {
        displaySettings = {
          id: id(),
          family_id: state.family_id,
          child_id: childId,
          selectedProductIds,
          productDisplayOrder: productDisplayOrder.slice(0, 6),
          created_at: timestamp,
          updated_at: timestamp
        };
        state.piggyProductDisplaySettings.push(displaySettings);
      }
      return displaySettings;
    });
  }

  requestPiggyPurchase(childId: UUID, productId: UUID) {
    return this.db.transaction((state) => {
      requireChild(state, childId);
      const product = requirePiggyProduct(state, productId);
      if (product.child_id !== childId) {
        throw new LocalDataError('Piggy product does not belong to child', 'PIGGY_PRODUCT_CHILD_MISMATCH');
      }
      const existingActivePurchase = state.piggy_purchases.find(
        (purchase) =>
          purchase.child_id === childId &&
          purchase.product_id === productId &&
          isActivePiggyPurchaseStatus(purchase.status)
      );
      if (existingActivePurchase) {
        throw new LocalDataError('Piggy purchase is already active', 'PIGGY_PURCHASE_ALREADY_ACTIVE');
      }
      if (getPiggySavings(state, childId) < product.price) {
        throw new LocalDataError('Piggy savings are insufficient', 'INSUFFICIENT_PIGGY_SAVINGS');
      }
      const timestamp = now();
      const purchase: LocalPiggyPurchase = {
        id: id(),
        family_id: state.family_id,
        child_id: childId,
        product_id: product.id,
        status: 'pendingPurchase',
        amount: product.price,
        product_snapshot: {
          name: product.name,
          price: product.price,
          main_media_id: product.main_media_id
        },
        requested_at: timestamp,
        purchased_at: null,
        cancelled_at: null
      };
      state.piggy_purchases.push(purchase);
      state.piggy_bank_logs.push({
        id: id(),
        family_id: state.family_id,
        child_id: childId,
        type: 'purchase_debit',
        amount: product.price,
        note: product.name,
        product_id: product.id,
        purchase_id: purchase.id,
        created_at: timestamp
      });
      return purchase;
    });
  }

  cancelPiggyPurchase(purchaseId: UUID) {
    return this.db.transaction((state) => {
      const purchase = requirePiggyPurchase(state, purchaseId);
      if (!isActivePiggyPurchaseStatus(purchase.status)) {
        throw new LocalDataError('Only active piggy purchases can be cancelled', 'INVALID_PIGGY_PURCHASE_STATUS');
      }
      const timestamp = now();
      purchase.status = 'cancelled';
      purchase.cancelled_at = timestamp;
      state.piggy_bank_logs.push({
        id: id(),
        family_id: state.family_id,
        child_id: purchase.child_id,
        type: 'purchase_refund',
        amount: purchase.amount,
        note: purchase.product_snapshot.name,
        product_id: purchase.product_id,
        purchase_id: purchase.id,
        created_at: timestamp
      });
      normalizePiggyShelf(state);
      return purchase;
    });
  }

  completePiggyPurchase(purchaseId: UUID) {
    return this.db.transaction((state) => {
      const purchase = requirePiggyPurchase(state, purchaseId);
      if (!isPendingPiggyPurchaseStatus(purchase.status)) {
        throw new LocalDataError('Only pending piggy purchases can be marked arrived', 'INVALID_PIGGY_PURCHASE_STATUS');
      }
      purchase.status = 'arrived';
      purchase.purchased_at = now();
      return purchase;
    });
  }

  confirmPiggyPurchaseArrived(purchaseId: UUID) {
    return this.db.transaction((state) => {
      const purchase = requirePiggyPurchase(state, purchaseId);
      if (!isArrivedPiggyPurchaseStatus(purchase.status)) {
        throw new LocalDataError('Only arrived piggy purchases can be confirmed', 'INVALID_PIGGY_PURCHASE_STATUS');
      }
      const timestamp = now();
      purchase.status = 'completed';
      if (!purchase.purchased_at) purchase.purchased_at = timestamp;
      state.piggy_shelf_orders.forEach((order) => {
        if (order.child_id !== purchase.child_id) return;
        order.product_ids = order.product_ids.filter((idValue) => idValue !== purchase.product_id);
        order.updated_at = timestamp;
      });
      state.piggyProductDisplaySettings.forEach((settings) => {
        if (settings.child_id !== purchase.child_id) return;
        settings.selectedProductIds = settings.selectedProductIds.filter((idValue) => idValue !== purchase.product_id);
        settings.productDisplayOrder = settings.productDisplayOrder.filter((idValue) => idValue !== purchase.product_id);
        settings.updated_at = timestamp;
      });
      normalizePiggyShelf(state);
      return purchase;
    });
  }

  listPiggyPurchases(childId?: UUID) {
    return this.db
      .read()
      .piggy_purchases.filter((purchase) => !childId || purchase.child_id === childId)
      .sort((a, b) => b.requested_at.localeCompare(a.requested_at));
  }

  private ensureDailyTaskInstances(targetDate = today()) {
    const state = this.db.read();
    const activeChildIds = new Set(state.children.filter((child) => child.status === 'active').map((child) => child.id));
    const templates = latestDailyTaskTemplates(state, targetDate).filter((task) => activeChildIds.has(task.child_id));
    const missingTemplates = templates.filter(
      (template) =>
        !state.tasks.some(
          (task) =>
            task.category === 'daily' &&
            task.child_id === template.child_id &&
            task.task_date === targetDate &&
            task.title === template.title
        )
    );
    if (!missingTemplates.length) return;

    this.db.transaction((draft) => {
      const timestamp = now();
      missingTemplates.forEach((template) => {
        if (
          draft.tasks.some(
            (task) =>
              task.category === 'daily' &&
              task.child_id === template.child_id &&
              task.task_date === targetDate &&
              task.title === template.title
          )
        ) {
          return;
        }
        draft.tasks.push({
          ...template,
          id: id(),
          task_date: targetDate,
          due_at: remapDailyDueAt(template.due_at, targetDate),
          status: 'pending',
          completion_note: null,
          completed_at: null,
          reviewed_by: null,
          reviewed_at: null,
          rejection_reason: null,
          created_at: timestamp,
          updated_at: timestamp,
          archived_at: null
        });
      });
    });
  }
}

function latestDailyTaskTemplates(state: LocalDatabaseState, targetDate: string) {
  const byChildAndTitle = new Map<string, LocalTask>();
  state.tasks
    .filter((task) => task.category === 'daily' && task.task_date < targetDate && !task.archived_at)
    .sort((a, b) => b.task_date.localeCompare(a.task_date) || b.created_at.localeCompare(a.created_at))
    .forEach((task) => {
      const key = `${task.child_id}::${task.title}`;
      if (!byChildAndTitle.has(key)) byChildAndTitle.set(key, task);
    });
  return Array.from(byChildAndTitle.values());
}

function remapDailyDueAt(dueAt: string | null, targetDate: string) {
  if (!dueAt) return null;
  const time = dueAt.includes('T') ? dueAt.split('T')[1] : '';
  return time ? `${targetDate}T${time}` : null;
}

function resolvePiggyProductChildId(state: LocalDatabaseState, childId?: UUID) {
  return childId ?? state.active_child_id ?? state.children.find((child) => child.status === 'active')?.id ?? state.children[0]?.id ?? '';
}

function nextPiggyShelfSlot(state: LocalDatabaseState, childId: UUID) {
  const used = new Set(
    state.piggy_products
      .filter((product) => product.child_id === childId && !product.deleted_at && product.shelf_status === 'shelf' && product.shelf_slot !== null)
      .map((product) => product.shelf_slot)
  );
  for (let slot = 0; slot < 6; slot += 1) {
    if (!used.has(slot)) return slot;
  }
  return null;
}

function buildPiggyShelfIds(state: LocalDatabaseState, childId: UUID) {
  normalizePiggyShelf(state, childId);
  return state.piggy_products
    .filter((product) => product.child_id === childId && !product.deleted_at && product.shelf_status === 'shelf')
    .sort((a, b) => (a.shelf_slot ?? 99) - (b.shelf_slot ?? 99) || a.created_at.localeCompare(b.created_at))
    .map((product) => product.id)
    .slice(0, 6);
}

function getPiggyDisplayCandidateProducts(state: LocalDatabaseState, childId: UUID) {
  const unavailableProductIds = new Set(
    state.piggy_purchases
      .filter((purchase) => purchase.child_id === childId && isCompletedPiggyPurchaseStatus(purchase.status))
      .map((purchase) => purchase.product_id)
  );
  return state.piggy_products
    .filter((product) => product.child_id === childId && !product.deleted_at && !unavailableProductIds.has(product.id))
    .sort((a, b) => (a.shelf_slot ?? 99) - (b.shelf_slot ?? 99) || a.created_at.localeCompare(b.created_at));
}

function normalizePiggyShelf(state: LocalDatabaseState, childId?: UUID) {
  if (!childId) {
    const childIds = new Set(state.piggy_products.map((product) => product.child_id).filter(Boolean));
    state.children.forEach((child) => childIds.add(child.id));
    childIds.forEach((idValue) => normalizePiggyShelf(state, idValue));
    return;
  }
  const unavailableProductIds = new Set(
    state.piggy_purchases
      .filter((purchase) => purchase.child_id === childId && isCompletedPiggyPurchaseStatus(purchase.status))
      .map((purchase) => purchase.product_id)
  );
  const shelfProducts = state.piggy_products
    .filter((product) => product.child_id === childId && !product.deleted_at && product.shelf_status === 'shelf' && !unavailableProductIds.has(product.id))
    .sort((a, b) => (a.shelf_slot ?? 99) - (b.shelf_slot ?? 99) || a.created_at.localeCompare(b.created_at));
  const backlogProducts = state.piggy_products
    .filter((product) => product.child_id === childId && !product.deleted_at && product.shelf_status === 'backlog' && !unavailableProductIds.has(product.id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  state.piggy_products
    .filter((product) => product.child_id === childId && unavailableProductIds.has(product.id))
    .forEach((product) => {
      product.shelf_status = 'backlog';
      product.shelf_slot = null;
    });
  while (shelfProducts.length < 6 && backlogProducts.length) {
    const product = backlogProducts.shift();
    if (product) {
      product.shelf_status = 'shelf';
      shelfProducts.push(product);
    }
  }
  shelfProducts.forEach((product, index) => {
    product.shelf_status = index < 6 ? 'shelf' : 'backlog';
    product.shelf_slot = index < 6 ? index : null;
  });
  const shelfIds = shelfProducts.slice(0, 6).map((product) => product.id);
  state.piggy_shelf_orders.forEach((order) => {
    if (order.child_id !== childId) return;
    const ordered = order.product_ids.filter((productId) => shelfIds.includes(productId));
    shelfIds.forEach((productId) => {
      if (!ordered.includes(productId)) ordered.push(productId);
    });
    order.product_ids = ordered.slice(0, 6);
  });
}

function isPendingPiggyPurchaseStatus(status: LocalPiggyPurchase['status']) {
  return status === 'pendingPurchase' || status === 'pending_parent_purchase';
}

function isArrivedPiggyPurchaseStatus(status: LocalPiggyPurchase['status']) {
  return status === 'arrived' || status === 'purchased';
}

function isCompletedPiggyPurchaseStatus(status: LocalPiggyPurchase['status']) {
  return status === 'completed';
}

function isActivePiggyPurchaseStatus(status: LocalPiggyPurchase['status']) {
  return isPendingPiggyPurchaseStatus(status) || isArrivedPiggyPurchaseStatus(status);
}

function getPiggyShelfProductsForChild(state: LocalDatabaseState, childId: UUID) {
  const shelfProducts = state.piggy_products.filter(
    (product) => product.child_id === childId && !product.deleted_at && product.shelf_status === 'shelf'
  );
  const byId = new Map(shelfProducts.map((product) => [product.id, product]));
  const shelfIds = buildPiggyShelfIds(state, childId);
  const order = state.piggy_shelf_orders.find((item) => item.child_id === childId);
  const orderedIds = order?.product_ids.filter((productId) => byId.has(productId)) ?? [];
  shelfIds.forEach((productId) => {
    if (!orderedIds.includes(productId)) orderedIds.push(productId);
  });
  return orderedIds.slice(0, 6).map((productId) => byId.get(productId)).filter((product): product is LocalPiggyProduct => Boolean(product));
}

export const localData = new LocalDataService();

export const {
  createChild,
  updateChild,
  deleteChild,
  switchChild,
  createTask,
  completeTask,
  approveTask,
  createDream,
  migrateDreamCoverToMedia,
  deleteDream,
  addDreamDeposit,
  completeDream,
  createShare,
  listShares,
  deleteShare,
  createMailboxMessage,
  markMessageRead,
  createBadge,
  deleteBadge,
  awardBadge,
  createSpecialDay,
  updateSpecialDay,
  deleteSpecialDay,
  updateSettings,
  updateScreenTime,
  updatePlannedScreenTime,
  redeemStarsForScreenTime,
  addScreenTime,
  deductScreenTimePenalty,
  recordScreenTimeUsed,
  createGrowthRecord,
  updateGrowthRecord,
  deleteGrowthRecord,
  addPiggyIncome,
  depositPiggyCoin,
  createPiggyProduct,
  updatePiggyProduct,
  deletePiggyProduct,
  setPiggyProductShelfStatus,
  savePiggyShelfOrder,
  getPiggyProductDisplaySettings,
  savePiggyProductDisplaySettings,
  requestPiggyPurchase,
  cancelPiggyPurchase,
  completePiggyPurchase,
  confirmPiggyPurchaseArrived
} = {
  createChild: localData.createChild.bind(localData),
  updateChild: localData.updateChild.bind(localData),
  deleteChild: localData.deleteChild.bind(localData),
  switchChild: localData.switchChild.bind(localData),
  createTask: localData.createTask.bind(localData),
  completeTask: localData.completeTask.bind(localData),
  approveTask: localData.approveTask.bind(localData),
  createDream: localData.createDream.bind(localData),
  migrateDreamCoverToMedia: localData.migrateDreamCoverToMedia.bind(localData),
  deleteDream: localData.deleteDream.bind(localData),
  addDreamDeposit: localData.addDreamDeposit.bind(localData),
  completeDream: localData.completeDream.bind(localData),
  createShare: localData.createShare.bind(localData),
  listShares: localData.listShares.bind(localData),
  deleteShare: localData.deleteShare.bind(localData),
  createMailboxMessage: localData.createMailboxMessage.bind(localData),
  markMessageRead: localData.markMessageRead.bind(localData),
  createBadge: localData.createBadge.bind(localData),
  deleteBadge: localData.deleteBadge.bind(localData),
  awardBadge: localData.awardBadge.bind(localData),
  createSpecialDay: localData.createSpecialDay.bind(localData),
  updateSpecialDay: localData.updateSpecialDay.bind(localData),
  deleteSpecialDay: localData.deleteSpecialDay.bind(localData),
  updateSettings: localData.updateSettings.bind(localData),
  updateScreenTime: localData.updateScreenTime.bind(localData),
  updatePlannedScreenTime: localData.updatePlannedScreenTime.bind(localData),
  redeemStarsForScreenTime: localData.redeemStarsForScreenTime.bind(localData),
  addScreenTime: localData.addScreenTime.bind(localData),
  deductScreenTimePenalty: localData.deductScreenTimePenalty.bind(localData),
  recordScreenTimeUsed: localData.recordScreenTimeUsed.bind(localData),
  createGrowthRecord: localData.createGrowthRecord.bind(localData),
  updateGrowthRecord: localData.updateGrowthRecord.bind(localData),
  deleteGrowthRecord: localData.deleteGrowthRecord.bind(localData),
  addPiggyIncome: localData.addPiggyIncome.bind(localData),
  depositPiggyCoin: localData.depositPiggyCoin.bind(localData),
  createPiggyProduct: localData.createPiggyProduct.bind(localData),
  updatePiggyProduct: localData.updatePiggyProduct.bind(localData),
  deletePiggyProduct: localData.deletePiggyProduct.bind(localData),
  setPiggyProductShelfStatus: localData.setPiggyProductShelfStatus.bind(localData),
  savePiggyShelfOrder: localData.savePiggyShelfOrder.bind(localData),
  getPiggyProductDisplaySettings: localData.getPiggyProductDisplaySettings.bind(localData),
  savePiggyProductDisplaySettings: localData.savePiggyProductDisplaySettings.bind(localData),
  requestPiggyPurchase: localData.requestPiggyPurchase.bind(localData),
  cancelPiggyPurchase: localData.cancelPiggyPurchase.bind(localData),
  completePiggyPurchase: localData.completePiggyPurchase.bind(localData),
  confirmPiggyPurchaseArrived: localData.confirmPiggyPurchaseArrived.bind(localData)
};

export { LOCAL_DEVICE_ID, LOCAL_FAMILY_ID, LOCAL_PARENT_USER_ID };


