import { dataRepository } from './dataRepository';
import { LocalDataError, type LocalDataRepository } from './localData';
import type {
  DreamWithBalance,
  ISODateTime,
  LocalDatabaseState,
  LocalMailboxMessage,
  LocalScreenTimeLog,
  LocalShareMedia,
  MemoryPack,
  MemoryPackBadgeHistoryItem,
  MemoryPackContent,
  MemoryPackDreamHistoryItem,
  MemoryPackMailboxItem,
  MemoryPackScreenTimeLogItem,
  MemoryPackShareHistoryItem,
  MemoryPackSpecialDayItem,
  MemoryPackStats,
  MemoryPackTaskHistoryItem,
  ShareWithMedia,
  UUID
} from './localTypes';
import { getLocalStorage, readJson, writeJson, type KeyValueStorage } from './storage';

const MEMORY_PACK_STORAGE_KEY = 'little-dreamers-family:memory-packs:v1';

export interface BuildMemoryPackInput {
  childId: UUID;
  title?: string;
}

export class MemoryPackRepository {
  constructor(
    private readonly localData: LocalDataRepository = dataRepository,
    private readonly storage: KeyValueStorage = getLocalStorage(),
    private readonly storageKey = MEMORY_PACK_STORAGE_KEY
  ) {}

  buildMemoryPack(input: BuildMemoryPackInput) {
    const state = this.localData.getState();
    const child = state.children.find((item) => item.id === input.childId && item.status !== 'archived');
    if (!child) throw new LocalDataError('Child not found', 'CHILD_NOT_FOUND');

    const timestamp = now();
    const content = buildContent(state, child.id);
    const stats = buildStats(content, state, child.id);
    const pack: MemoryPack = {
      id: createId(),
      childId: child.id,
      childName: child.display_name,
      title: input.title?.trim() || `${child.display_name} 的回憶包`,
      coverMediaId: chooseCoverMediaId(content),
      createdAt: timestamp,
      updatedAt: timestamp,
      summary: buildSummary(stats),
      stats,
      content
    };

    const packs = this.readPacks().filter((item) => item.id !== pack.id);
    packs.push(pack);
    this.writePacks(packs);
    return pack;
  }

  getMemoryPack(memoryPackId: UUID) {
    return this.readPacks().find((pack) => pack.id === memoryPackId) ?? null;
  }

  exportMemoryPack(memoryPackId: UUID) {
    const pack = this.getMemoryPack(memoryPackId);
    if (!pack) throw new LocalDataError('Memory pack not found', 'MEMORY_PACK_NOT_FOUND');
    return JSON.stringify(pack, null, 2);
  }

  deleteMemoryPack(memoryPackId: UUID) {
    const packs = this.readPacks();
    const target = packs.find((pack) => pack.id === memoryPackId);
    if (!target) throw new LocalDataError('Memory pack not found', 'MEMORY_PACK_NOT_FOUND');
    this.writePacks(packs.filter((pack) => pack.id !== memoryPackId));
    return target;
  }

  listMemoryPacks(childId?: UUID) {
    return this.readPacks()
      .filter((pack) => !childId || pack.childId === childId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private readPacks() {
    return readJson<MemoryPack[]>(this.storage, this.storageKey) ?? [];
  }

  private writePacks(packs: MemoryPack[]) {
    writeJson(this.storage, this.storageKey, packs);
  }
}

function buildContent(state: LocalDatabaseState, childId: UUID): MemoryPackContent {
  const shares = state.shares
    .filter((share) => share.child_id === childId && !share.deleted_at)
    .map((share): ShareWithMedia => ({
      ...share,
      media: state.share_media
        .filter((media) => media.share_id === share.id)
        .sort((a, b) => a.sort_order - b.sort_order)
    }));
  const dreams = state.dreams
    .filter((dream) => dream.child_id === childId)
    .map((dream): DreamWithBalance => {
      const currentAmount = sum(state.dream_funds.filter((fund) => fund.dream_id === dream.id).map((fund) => fund.amount));
      return {
        ...dream,
        current_amount: currentAmount,
        progress_percent: dream.target_amount === 0 ? 100 : Math.min(100, Math.round((currentAmount / dream.target_amount) * 100))
      };
    });
  const badgesById = new Map(state.badges.map((badge) => [badge.id, badge]));

  return {
    dreamHistory: dreams.map(toDreamHistoryItem).sort(sortByUpdatedAtDesc),
    taskHistory: state.tasks
      .filter((task) => task.child_id === childId)
      .map(toTaskHistoryItem)
      .sort(sortByUpdatedAtDesc),
    badgeHistory: state.child_badges
      .filter((record) => record.child_id === childId)
      .map((record): MemoryPackBadgeHistoryItem => {
        const badge = badgesById.get(record.badge_id);
        return {
          id: record.id,
          badgeId: record.badge_id,
          name: badge?.name ?? '已刪除徽章',
          icon: badge?.icon ?? '🏅',
          description: badge?.description ?? null,
          rewardStars: badge?.reward_stars ?? 0,
          note: record.note,
          awardedAt: record.awarded_at
        };
      })
      .sort((a, b) => b.awardedAt.localeCompare(a.awardedAt)),
    shareHistory: shares.map(toShareHistoryItem).sort(sortByCreatedAtDesc),
    screenTimeLogs: state.screen_time_logs
      .filter((log) => log.child_id === childId)
      .map(toScreenTimeLogItem)
      .sort(sortByCreatedAtDesc),
    mailbox: state.encouragement_cards
      .filter((message) => message.child_id === childId)
      .map(toMailboxItem)
      .sort(sortByCreatedAtDesc),
    specialDays: state.special_days
      .filter((day) => !day.deleted_at && (day.child_id === null || day.child_id === childId))
      .map(toSpecialDayItem)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  };
}

function buildStats(content: MemoryPackContent, state: LocalDatabaseState, childId: UUID): MemoryPackStats {
  const media = content.shareHistory.flatMap((share) => share.media);
  return {
    totalPhotos: media.filter((item) => item.mediaType === 'photo').length,
    totalVideos: media.filter((item) => item.mediaType === 'video').length,
    totalAudios: media.filter((item) => item.mediaType === 'audio').length,
    totalDreams: content.dreamHistory.length,
    completedDreams: content.dreamHistory.filter((dream) => dream.status === 'completed').length,
    totalTasks: content.taskHistory.length,
    totalStars: sum(state.stars.filter((star) => star.child_id === childId).map((star) => star.amount)),
    totalBadges: content.badgeHistory.length,
    totalScreenTimeAdded: sum(
      content.screenTimeLogs.filter((log) => log.minutesDelta > 0).map((log) => log.minutesDelta)
    ),
    totalScreenTimeUsed: sum(
      content.screenTimeLogs.filter((log) => log.minutesDelta < 0).map((log) => Math.abs(log.minutesDelta))
    ),
    totalEncouragementCards: content.mailbox.length,
    totalSpecialDays: content.specialDays.length
  };
}

function toShareHistoryItem(share: ShareWithMedia): MemoryPackShareHistoryItem {
  return {
    id: share.id,
    title: share.title,
    caption: share.caption,
    shareType: share.share_type,
    status: share.status,
    submittedAt: share.submitted_at,
    reviewedAt: share.reviewed_at,
    createdAt: share.created_at,
    updatedAt: share.updated_at,
    media: share.media.map(toMediaReference)
  };
}

function toMediaReference(media: LocalShareMedia) {
  return {
    mediaId: media.id,
    mediaType: media.media_type,
    mimeType: media.mime_type,
    fileName: fileNameFromStoragePath(media.storage_path),
    fileSizeBytes: media.file_size_bytes,
    width: media.width,
    height: media.height,
    durationSeconds: media.duration_seconds,
    createdAt: media.created_at
  };
}

function toDreamHistoryItem(dream: DreamWithBalance): MemoryPackDreamHistoryItem {
  return {
    id: dream.id,
    title: dream.title,
    description: dream.description,
    coverMediaId: dream.cover_media_id ?? dream.coverMediaId ?? null,
    targetAmount: dream.target_amount,
    currentAmount: dream.current_amount,
    currency: dream.currency,
    status: dream.status,
    completedAt: dream.completed_at,
    createdAt: dream.created_at,
    updatedAt: dream.updated_at
  };
}

function toTaskHistoryItem(task: LocalDatabaseState['tasks'][number]): MemoryPackTaskHistoryItem {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    taskImageMediaId: task.task_image_media_id ?? null,
    thumbnailMediaId: task.thumbnail_media_id ?? null,
    category: task.category,
    taskDate: task.task_date,
    status: task.status,
    rewardStars: task.reward_stars,
    rewardScreenMinutes: task.reward_screen_minutes,
    completionNote: task.completion_note,
    completedAt: task.completed_at,
    reviewedAt: task.reviewed_at,
    createdAt: task.created_at,
    updatedAt: task.updated_at
  };
}

function toScreenTimeLogItem(log: LocalScreenTimeLog): MemoryPackScreenTimeLogItem {
  return {
    id: log.id,
    date: log.date ?? log.created_at.slice(0, 10),
    type: log.type ?? null,
    entryType: log.entry_type,
    minutesDelta: log.minutes_delta,
    starsUsed: log.starsUsed ?? null,
    note: log.note ?? log.reason,
    createdAt: log.created_at
  };
}

function toMailboxItem(message: LocalMailboxMessage): MemoryPackMailboxItem {
  return {
    id: message.id,
    title: message.title,
    message: message.message,
    cardType: message.card_type,
    templateKey: message.template_key,
    mediaBucket: message.media_bucket,
    mediaPath: message.media_path,
    mediaMimeType: message.media_mime_type,
    status: message.status,
    sentAt: message.sent_at,
    openedAt: message.opened_at,
    createdAt: message.created_at
  };
}

function toSpecialDayItem(day: LocalDatabaseState['special_days'][number]): MemoryPackSpecialDayItem {
  return {
    id: day.id,
    title: day.title,
    date: day.date,
    type: day.type,
    description: day.description,
    source: day.source ?? null,
    createdAt: day.created_at,
    updatedAt: day.updated_at
  };
}

function chooseCoverMediaId(content: MemoryPackContent) {
  const latestPhotoShare = content.shareHistory.find((share) =>
    share.media.some((media) => media.mediaType === 'photo')
  );
  const photoMediaId = latestPhotoShare?.media.find((media) => media.mediaType === 'photo')?.mediaId;
  if (photoMediaId) return photoMediaId;
  return content.dreamHistory.find((dream) => dream.coverMediaId)?.coverMediaId ?? null;
}

function buildSummary(stats: MemoryPackStats) {
  return [
    '今年完成了：',
    `${stats.totalTasks} 個任務`,
    `累積 ${stats.totalStars} 顆星星`,
    `完成 ${stats.completedDreams} 個夢想`,
    `留下 ${stats.totalPhotos} 張照片`,
    `錄下 ${stats.totalAudios} 段語音`
  ].join('\n');
}

function fileNameFromStoragePath(path: string) {
  const parts = path.split('/').filter(Boolean);
  const value = parts[parts.length - 1];
  return value ?? null;
}

function sortByCreatedAtDesc<T extends { createdAt: ISODateTime }>(a: T, b: T) {
  return b.createdAt.localeCompare(a.createdAt);
}

function sortByUpdatedAtDesc<T extends { updatedAt: ISODateTime }>(a: T, b: T) {
  return b.updatedAt.localeCompare(a.updatedAt);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function now() {
  return new Date().toISOString();
}

function createId(): UUID {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `memory-pack-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const memoryPackRepository = new MemoryPackRepository();
