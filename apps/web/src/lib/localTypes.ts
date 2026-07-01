export type UUID = string;
export type ISODate = string;
export type ISODateTime = string;

export type ChildStatus = 'active' | 'archived';
export type TaskStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'cancelled' | 'expired';
export type DreamStatus = 'pending_approval' | 'active' | 'funded' | 'completed' | 'cancelled' | 'archived';
export type ShareStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived';
export type MailboxStatus = 'draft' | 'scheduled' | 'sent' | 'opened' | 'archived' | 'cancelled';
export type SpecialDayType = 'birthday' | 'anniversary' | 'holiday' | 'family_event' | 'other';
export type PiggyPurchaseStatus =
  | 'pendingPurchase'
  | 'arrived'
  | 'completed'
  | 'cancelled'
  | 'pending_parent_purchase'
  | 'purchased';

export interface LocalRepositoryScope {
  family_id: UUID;
  parent_id: UUID | null;
  child_id: UUID | null;
  device_id: UUID | null;
}

export interface LocalChild {
  id: UUID;
  family_id: UUID;
  display_name: string;
  legal_name: string | null;
  birth_date: ISODate | null;
  birthday: ISODate | null;
  gender: string | null;
  avatar_path: string | null;
  avatar_media_id: UUID | null;
  theme_color: string | null;
  timezone: string;
  status: ChildStatus;
  notes: string | null;
  created_by: UUID;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  archived_at: ISODateTime | null;
}

export interface LocalTask {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  title: string;
  description: string | null;
  task_image_media_id: UUID | null;
  thumbnail_media_id: UUID | null;
  category: 'daily' | 'habit' | 'household' | 'challenge';
  task_date: ISODate;
  due_at: ISODateTime | null;
  recurrence_rule: string | null;
  status: TaskStatus;
  reward_stars: number;
  reward_screen_minutes: number;
  completion_note: string | null;
  completed_at: ISODateTime | null;
  reviewed_by: UUID | null;
  reviewed_at: ISODateTime | null;
  rejection_reason: string | null;
  created_by: UUID;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  archived_at: ISODateTime | null;
}

export interface LocalStarTransaction {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  type?: 'earned' | 'spent';
  amount: number;
  transaction_type: 'task_reward' | 'share_reward' | 'encouragement' | 'dream_redeem' | 'manual_adjustment' | 'reversal';
  reason: string | null;
  sourceType?: string | null;
  sourceId?: UUID | null;
  task_id: UUID | null;
  share_id: UUID | null;
  dream_id: UUID | null;
  reversal_of_id: UUID | null;
  idempotency_key: string | null;
  created_by: UUID | null;
  created_at: ISODateTime;
}

export interface LocalDream {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  title: string;
  description: string | null;
  cover_path: string | null;
  coverUrl?: string | null;
  imageUrl?: string | null;
  cover_media_id: UUID | null;
  coverMediaId?: UUID | null;
  cover_mime_type: string | null;
  cover_file_name: string | null;
  target_amount: number;
  currency: string;
  status: DreamStatus;
  priority: number;
  requested_by_child: boolean;
  approved_by: UUID | null;
  approved_at: ISODateTime | null;
  target_date: ISODate | null;
  completed_at: ISODateTime | null;
  created_by: UUID | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  archived_at: ISODateTime | null;
}

export interface LocalDreamFund {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  dream_id: UUID;
  amount: number;
  transaction_type: 'deposit' | 'star_conversion' | 'purchase' | 'refund' | 'manual_adjustment' | 'reversal';
  note: string | null;
  source_star_id: UUID | null;
  reversal_of_id: UUID | null;
  idempotency_key: string | null;
  created_by: UUID | null;
  created_at: ISODateTime;
}

export interface LocalShareMedia {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  share_id: UUID;
  media_type: 'photo' | 'audio' | 'video';
  bucket: 'local-media';
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  thumbnail_path: string | null;
  sort_order: number;
  created_at: ISODateTime;
  local_data_url: string | null;
}

export interface LocalShare {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  title: string | null;
  caption: string | null;
  share_type: 'text' | 'photo' | 'audio' | 'video' | 'mixed';
  type?: 'text' | 'photo' | 'audio' | 'video' | 'mixed';
  mediaUrl?: string | null;
  source_type: 'child_device' | 'parent' | 'system';
  status: ShareStatus;
  submitted_at: ISODateTime;
  reviewed_by: UUID | null;
  reviewed_at: ISODateTime | null;
  rejection_reason: string | null;
  published_at: ISODateTime | null;
  created_by_user_id: UUID | null;
  created_by_device_id: UUID | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface LocalMailboxMessage {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  sender_user_id: UUID;
  title: string | null;
  message: string | null;
  card_type: 'text' | 'card' | 'audio' | 'image' | 'video' | 'mixed';
  template_key: string | null;
  media_bucket: 'local-media' | null;
  media_path: string | null;
  media_id: UUID | null;
  media_mime_type: string | null;
  local_data_url: string | null;
  status: MailboxStatus;
  scheduled_at: ISODateTime | null;
  sent_at: ISODateTime | null;
  opened_at: ISODateTime | null;
  archived_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface LocalBadge {
  id: UUID;
  family_id: UUID;
  name: string;
  icon: string;
  description: string | null;
  reward_stars: number;
  created_by: UUID;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface LocalChildBadge {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  badge_id: UUID;
  note: string | null;
  awarded_by: UUID;
  awarded_at: ISODateTime;
}

export interface LocalSpecialDay {
  id: UUID;
  family_id: UUID;
  child_id: UUID | null;
  childId?: UUID | null;
  title: string;
  date: ISODate;
  type: SpecialDayType;
  description: string | null;
  image_media_id: UUID | null;
  image_data_url: string | null;
  created_by: UUID;
  createdBy?: 'parent' | 'child' | 'system';
  source?: 'manual' | 'child_birthday';
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface LocalFamilySettings {
  family_name: string;
  family_intro: string;
  family_avatar_data_url: string | null;
  family_avatar_media_id: UUID | null;
  family_created_at: ISODateTime;
  parent_name: string;
  parent_email: string;
  parent_avatar_data_url: string | null;
  parent_avatar_media_id: UUID | null;
  default_daily_screen_minutes: number;
  screen_time_star_minutes_per_star: number;
  default_daily_star_limit: number;
  default_theme_color: string;
  allow_photo_sharing: boolean;
  allow_video_sharing: boolean;
  allow_audio_sharing: boolean;
  notify_task_completed: boolean;
  notify_dream_completed: boolean;
  notify_share_pending: boolean;
  notify_special_day: boolean;
  updated_at: ISODateTime;
}

export interface LocalScreenTimeLog {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  date?: ISODate;
  type?: 'redeem' | 'penalty' | 'manual_add' | 'used' | 'schedule_edit';
  minutes?: number;
  starsUsed?: number | null;
  note?: string | null;
  operator_name?: string | null;
  entry_type: 'task_reward' | 'manual_grant' | 'usage' | 'manual_deduction' | 'expiry' | 'reversal';
  minutes_delta: number;
  task_id: UUID | null;
  session_started_at: ISODateTime | null;
  session_ended_at: ISODateTime | null;
  device_id: UUID | null;
  reason: string | null;
  reversal_of_id: UUID | null;
  idempotency_key: string | null;
  created_by: UUID | null;
  created_at: ISODateTime;
}

export interface LocalScreenTimeSchedule {
  id: UUID;
  family_id: UUID;
  childId: UUID;
  weekStartDate: ISODate;
  date: ISODate;
  plannedMinutes: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  source?: 'default' | 'manual';
}

export interface WeeklyScreenTimeDay {
  date: ISODate;
  weekday: string;
  plannedMinutes: number;
  redeemedMinutes: number;
  manualAddedMinutes: number;
  penaltyMinutes: number;
  usedMinutes: number;
  remainingMinutes: number;
}

export interface LocalGrowthRecord {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  date: ISODate;
  height_cm: number;
  weight_kg: number;
  reading_count: number;
  note: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface LocalPiggyIncome {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  source: string;
  amount: number;
  remaining_amount: number;
  created_by: UUID;
  created_at: ISODateTime;
}

export interface LocalPiggyBankLog {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  type: 'coin_deposit' | 'purchase_debit' | 'purchase_refund';
  amount: number;
  note: string | null;
  product_id: UUID | null;
  purchase_id: UUID | null;
  created_at: ISODateTime;
}

export interface LocalPiggyProduct {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  name: string;
  price: number;
  main_media_id: UUID | null;
  gallery_media_ids: UUID[];
  shelf_status: 'shelf' | 'backlog';
  shelf_slot: number | null;
  created_by: UUID;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
}

export interface LocalPiggyShelfOrder {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  product_ids: UUID[];
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface LocalPiggyProductDisplaySettings {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  selectedProductIds: UUID[];
  productDisplayOrder: UUID[];
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface LocalPiggyPurchase {
  id: UUID;
  family_id: UUID;
  child_id: UUID;
  product_id: UUID;
  status: PiggyPurchaseStatus;
  amount: number;
  product_snapshot: {
    name: string;
    price: number;
    main_media_id: UUID | null;
  };
  requested_at: ISODateTime;
  purchased_at: ISODateTime | null;
  cancelled_at: ISODateTime | null;
}

export interface PiggyBankSummary {
  currentSavings: number;
  availableToDepositToday: number;
  depositedToday: number;
}

export interface LocalDatabaseState {
  schema_version: 1;
  family_id: UUID;
  parent_id: UUID | null;
  device_id: UUID | null;
  device_child_id: UUID | null;
  current_user_id: UUID;
  active_child_id: UUID | null;
  children: LocalChild[];
  tasks: LocalTask[];
  stars: LocalStarTransaction[];
  dreams: LocalDream[];
  dream_funds: LocalDreamFund[];
  shares: LocalShare[];
  share_media: LocalShareMedia[];
  encouragement_cards: LocalMailboxMessage[];
  badges: LocalBadge[];
  child_badges: LocalChildBadge[];
  special_days: LocalSpecialDay[];
  family_settings: LocalFamilySettings;
  screen_time_schedules: LocalScreenTimeSchedule[];
  screen_time_logs: LocalScreenTimeLog[];
  growth_records: LocalGrowthRecord[];
  piggy_incomes: LocalPiggyIncome[];
  piggy_bank_logs: LocalPiggyBankLog[];
  piggy_products: LocalPiggyProduct[];
  piggy_shelf_orders: LocalPiggyShelfOrder[];
  piggyProductDisplaySettings: LocalPiggyProductDisplaySettings[];
  piggy_purchases: LocalPiggyPurchase[];
  updated_at: ISODateTime;
}

export interface ShareWithMedia extends LocalShare {
  media: LocalShareMedia[];
}

export interface DreamWithBalance extends LocalDream {
  current_amount: number;
  progress_percent: number;
}

export interface MemoryPackStats {
  totalPhotos: number;
  totalVideos: number;
  totalAudios: number;
  totalDreams: number;
  completedDreams: number;
  totalTasks: number;
  totalStars: number;
  totalBadges: number;
  totalScreenTimeAdded: number;
  totalScreenTimeUsed: number;
  totalEncouragementCards: number;
  totalSpecialDays: number;
}

export interface MemoryPackMediaReference {
  mediaId: UUID;
  mediaType: LocalShareMedia['media_type'];
  mimeType: string;
  fileName: string | null;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  createdAt: ISODateTime;
}

export interface MemoryPackShareHistoryItem {
  id: UUID;
  title: string | null;
  caption: string | null;
  shareType: LocalShare['share_type'];
  status: ShareStatus;
  submittedAt: ISODateTime;
  reviewedAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  media: MemoryPackMediaReference[];
}

export interface MemoryPackDreamHistoryItem {
  id: UUID;
  title: string;
  description: string | null;
  coverMediaId: UUID | null;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  status: DreamStatus;
  completedAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface MemoryPackTaskHistoryItem {
  id: UUID;
  title: string;
  description: string | null;
  taskImageMediaId: UUID | null;
  thumbnailMediaId: UUID | null;
  category: LocalTask['category'];
  taskDate: ISODate;
  status: TaskStatus;
  rewardStars: number;
  rewardScreenMinutes: number;
  completionNote: string | null;
  completedAt: ISODateTime | null;
  reviewedAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface MemoryPackBadgeHistoryItem {
  id: UUID;
  badgeId: UUID;
  name: string;
  icon: string;
  description: string | null;
  rewardStars: number;
  note: string | null;
  awardedAt: ISODateTime;
}

export interface MemoryPackScreenTimeLogItem {
  id: UUID;
  date: ISODate | null;
  type: LocalScreenTimeLog['type'] | null;
  entryType: LocalScreenTimeLog['entry_type'];
  minutesDelta: number;
  starsUsed: number | null;
  note: string | null;
  createdAt: ISODateTime;
}

export interface MemoryPackMailboxItem {
  id: UUID;
  title: string | null;
  message: string | null;
  cardType: LocalMailboxMessage['card_type'];
  templateKey: string | null;
  mediaBucket: LocalMailboxMessage['media_bucket'];
  mediaPath: string | null;
  mediaMimeType: string | null;
  status: MailboxStatus;
  sentAt: ISODateTime | null;
  openedAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface MemoryPackSpecialDayItem {
  id: UUID;
  title: string;
  date: ISODate;
  type: SpecialDayType;
  description: string | null;
  source: LocalSpecialDay['source'] | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface MemoryPackContent {
  dreamHistory: MemoryPackDreamHistoryItem[];
  taskHistory: MemoryPackTaskHistoryItem[];
  badgeHistory: MemoryPackBadgeHistoryItem[];
  shareHistory: MemoryPackShareHistoryItem[];
  screenTimeLogs: MemoryPackScreenTimeLogItem[];
  mailbox: MemoryPackMailboxItem[];
  specialDays: MemoryPackSpecialDayItem[];
}

export interface MemoryPack {
  id: UUID;
  childId: UUID;
  childName: string;
  title: string;
  coverMediaId: UUID | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  summary: string;
  stats: MemoryPackStats;
  content: MemoryPackContent;
}
