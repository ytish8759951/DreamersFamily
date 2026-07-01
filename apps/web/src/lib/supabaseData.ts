import type {
  AwardBadgeInput,
  AddPiggyIncomeInput,
  CreateBadgeInput,
  CreateChildInput,
  CreateDreamInput,
  CreateGrowthRecordInput,
  CreateMailboxMessageInput,
  CreatePiggyProductInput,
  CreateShareInput,
  CreateSpecialDayInput,
  CreateTaskInput,
  LocalDataRepository,
  MigrateDreamCoverInput,
  UpdateChildInput,
  UpdateGrowthRecordInput,
  UpdatePiggyProductInput,
  UpdateScreenTimeInput,
  UpdateSettingsInput,
  UpdateSpecialDayInput
} from './localData';
import type {
  DreamWithBalance,
  LocalBadge,
  LocalChild,
  LocalChildBadge,
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
  LocalSpecialDay,
  LocalStarTransaction,
  LocalTask,
  PiggyBankSummary,
  ShareWithMedia,
  WeeklyScreenTimeDay,
  UUID
} from './localTypes';

export class SupabaseDataRepository implements LocalDataRepository {
  getState(): LocalDatabaseState {
    return notEnabled();
  }

  getRepositoryScope(): LocalRepositoryScope {
    return notEnabled();
  }

  resetLocalData(): LocalDatabaseState {
    return notEnabled();
  }

  subscribe(_listener: (state: LocalDatabaseState) => void): () => void {
    return notEnabled();
  }

  createChild(_input: CreateChildInput): LocalChild {
    return notEnabled();
  }

  updateChild(_childId: UUID, _input: UpdateChildInput): LocalChild {
    return notEnabled();
  }

  deleteChild(_childId: UUID): LocalChild {
    return notEnabled();
  }

  switchChild(_childId: UUID): LocalChild {
    return notEnabled();
  }

  listChildren(_includeArchived?: boolean): LocalChild[] {
    return notEnabled();
  }

  createTask(_input: CreateTaskInput): LocalTask {
    return notEnabled();
  }

  completeTask(_taskId: UUID, _completionNote?: string | null): LocalTask {
    return notEnabled();
  }

  approveTask(_taskId: UUID): LocalTask {
    return notEnabled();
  }

  listTasks(_childId?: UUID): LocalTask[] {
    return notEnabled();
  }

  getStarBalance(_childId: UUID): number {
    return notEnabled();
  }

  listStarTransactions(_childId: UUID): LocalStarTransaction[] {
    return notEnabled();
  }

  createDream(_input: CreateDreamInput): LocalDream {
    return notEnabled();
  }

  migrateDreamCoverToMedia(_dreamId: UUID, _input: MigrateDreamCoverInput): LocalDream {
    return notEnabled();
  }

  deleteDream(_dreamId: UUID): LocalDream {
    return notEnabled();
  }

  addDreamDeposit(_dreamId: UUID, _amount: number, _note?: string | null): LocalDreamFund {
    return notEnabled();
  }

  completeDream(_dreamId: UUID): LocalDream {
    return notEnabled();
  }

  listDreams(_childId?: UUID, _includeCompleted?: boolean): DreamWithBalance[] {
    return notEnabled();
  }

  createShare(_input: CreateShareInput): ShareWithMedia {
    return notEnabled();
  }

  listShares(_childId?: UUID): ShareWithMedia[] {
    return notEnabled();
  }

  deleteShare(_shareId: UUID): LocalShare {
    return notEnabled();
  }

  approveShare(_shareId: UUID, _rewardStars?: number): LocalShare {
    return notEnabled();
  }

  createMailboxMessage(_input: CreateMailboxMessageInput): LocalMailboxMessage {
    return notEnabled();
  }

  markMessageRead(_messageId: UUID): LocalMailboxMessage {
    return notEnabled();
  }

  listMailboxMessages(_childId?: UUID): LocalMailboxMessage[] {
    return notEnabled();
  }

  createBadge(_input: CreateBadgeInput): LocalBadge {
    return notEnabled();
  }

  deleteBadge(_badgeId: UUID): LocalBadge {
    return notEnabled();
  }

  awardBadge(_input: AwardBadgeInput): LocalChildBadge {
    return notEnabled();
  }

  getBadges(_includeDeleted?: boolean): LocalBadge[] {
    return notEnabled();
  }

  getChildBadges(_childId?: UUID): LocalChildBadge[] {
    return notEnabled();
  }

  createSpecialDay(_input: CreateSpecialDayInput): LocalSpecialDay {
    return notEnabled();
  }

  updateSpecialDay(_specialDayId: UUID, _input: UpdateSpecialDayInput): LocalSpecialDay {
    return notEnabled();
  }

  deleteSpecialDay(_specialDayId: UUID): LocalSpecialDay {
    return notEnabled();
  }

  getSpecialDays(_childId?: UUID | null, _includeDeleted?: boolean): LocalSpecialDay[] {
    return notEnabled();
  }

  getUpcomingSpecialDays(_childId?: UUID | null, _limit?: number): LocalSpecialDay[] {
    return notEnabled();
  }

  getSettings(): LocalFamilySettings {
    return notEnabled();
  }

  updateSettings(_input: UpdateSettingsInput): LocalFamilySettings {
    return notEnabled();
  }

  exportData(): string {
    return notEnabled();
  }

  importData(_raw: string): LocalDatabaseState {
    return notEnabled();
  }

  resetAllData(): LocalDatabaseState {
    return notEnabled();
  }

  updateScreenTime(_input: UpdateScreenTimeInput): LocalScreenTimeLog {
    return notEnabled();
  }

  getScreenTimeBalance(_childId: UUID): number {
    return notEnabled();
  }

  listScreenTimeLogs(_childId: UUID): LocalScreenTimeLog[] {
    return notEnabled();
  }

  getWeeklyScreenTime(_childId: UUID, _weekStartDate: string): WeeklyScreenTimeDay[] {
    return notEnabled();
  }

  updatePlannedScreenTime(_childId: UUID, _date: string, _plannedMinutes: number): LocalScreenTimeSchedule {
    return notEnabled();
  }

  redeemStarsForScreenTime(_childId: UUID, _date: string, _stars: number, _note?: string | null): LocalScreenTimeLog {
    return notEnabled();
  }

  addScreenTime(_childId: UUID, _date: string, _minutes: number, _note?: string | null): LocalScreenTimeLog {
    return notEnabled();
  }

  deductScreenTimePenalty(_childId: UUID, _date: string, _minutes: number, _reason?: string | null): LocalScreenTimeLog {
    return notEnabled();
  }

  recordScreenTimeUsed(_childId: UUID, _date: string, _minutes: number): LocalScreenTimeLog {
    return notEnabled();
  }

  getScreenTimeLogsByChild(_childId: UUID): LocalScreenTimeLog[] {
    return notEnabled();
  }

  getTodayScreenTimeByChild(_childId: UUID): WeeklyScreenTimeDay {
    return notEnabled();
  }

  createGrowthRecord(_input: CreateGrowthRecordInput): LocalGrowthRecord {
    return notEnabled();
  }

  updateGrowthRecord(_growthRecordId: UUID, _input: UpdateGrowthRecordInput): LocalGrowthRecord {
    return notEnabled();
  }

  deleteGrowthRecord(_growthRecordId: UUID): LocalGrowthRecord {
    return notEnabled();
  }

  getGrowthRecords(_childId?: UUID): LocalGrowthRecord[] {
    return notEnabled();
  }

  getLatestGrowthRecordByChild(_childId: UUID): LocalGrowthRecord | null {
    return notEnabled();
  }

  getGrowthRecordsByChild(_childId: UUID): LocalGrowthRecord[] {
    return notEnabled();
  }

  addPiggyIncome(_input: AddPiggyIncomeInput): LocalPiggyIncome {
    return notEnabled();
  }

  depositPiggyCoin(_childId: UUID, _amount: number): LocalPiggyBankLog {
    return notEnabled();
  }

  getPiggyBankSummary(_childId: UUID): PiggyBankSummary {
    return notEnabled();
  }

  getPiggyIncomeRecords(_childId?: UUID): LocalPiggyIncome[] {
    return notEnabled();
  }

  getPiggyBankLogs(_childId?: UUID): LocalPiggyBankLog[] {
    return notEnabled();
  }

  createPiggyProduct(_input: CreatePiggyProductInput): LocalPiggyProduct {
    return notEnabled();
  }

  updatePiggyProduct(_productId: UUID, _input: UpdatePiggyProductInput): LocalPiggyProduct {
    return notEnabled();
  }

  deletePiggyProduct(_productId: UUID): LocalPiggyProduct {
    return notEnabled();
  }

  listPiggyProducts(_childId?: UUID, _includeDeleted?: boolean): LocalPiggyProduct[] {
    return notEnabled();
  }

  setPiggyProductShelfStatus(_productId: UUID, _shelfStatus: LocalPiggyProduct['shelf_status']): LocalPiggyProduct {
    return notEnabled();
  }

  savePiggyShelfOrder(_childId: UUID, _productIds: UUID[]): LocalPiggyShelfOrder {
    return notEnabled();
  }

  getPiggyShelfProducts(_childId: UUID): LocalPiggyProduct[] {
    return notEnabled();
  }

  getPiggyProductDisplaySettings(_childId: UUID): LocalPiggyProductDisplaySettings | null {
    return notEnabled();
  }

  savePiggyProductDisplaySettings(
    _childId: UUID,
    _settings: Pick<LocalPiggyProductDisplaySettings, 'selectedProductIds' | 'productDisplayOrder'>
  ): LocalPiggyProductDisplaySettings {
    return notEnabled();
  }

  requestPiggyPurchase(_childId: UUID, _productId: UUID): LocalPiggyPurchase {
    return notEnabled();
  }

  cancelPiggyPurchase(_purchaseId: UUID): LocalPiggyPurchase {
    return notEnabled();
  }

  completePiggyPurchase(_purchaseId: UUID): LocalPiggyPurchase {
    return notEnabled();
  }

  confirmPiggyPurchaseArrived(_purchaseId: UUID): LocalPiggyPurchase {
    return notEnabled();
  }

  listPiggyPurchases(_childId?: UUID): LocalPiggyPurchase[] {
    return notEnabled();
  }
}

function notEnabled(): never {
  throw new Error('SupabaseDataRepository is a Phase 2 skeleton and is not enabled.');
}
