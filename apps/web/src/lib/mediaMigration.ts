import { dataRepository } from './dataRepository';
import { mediaRepository, type MediaOwnerType, type UnifiedMediaType } from './mediaRepository';
import type { LocalDatabaseState, UUID } from './localTypes';
import { startupTrace, traceStartupPromise } from './startupTrace';

type MutableState = LocalDatabaseState & Record<string, unknown>;

export type MediaMigrationResult = {
  migratedCount: number;
  migratedMediaIds: string[];
};

export async function migrateLocalStorageMediaToRepository(): Promise<MediaMigrationResult> {
  startupTrace('migrateLocalStorageMediaToRepository start');
  const state = dataRepository.getState() as MutableState;
  startupTrace('migrateLocalStorage state loaded', {
    hasState: Boolean(state),
    schemaVersion: state?.schema_version ?? null
  });
  if (!state || state.schema_version !== 1) {
    startupTrace('migrateLocalStorageMediaToRepository finish', {
      migratedCount: 0,
      reason: 'no schema v1 state'
    });
    return { migratedCount: 0, migratedMediaIds: [] };
  }

  const migratedMediaIds: string[] = [];
  const migrateDataUrl = async (input: {
    dataUrl: string | null | undefined;
    mediaId?: string | null;
    ownerType: MediaOwnerType;
    ownerId: string;
    mediaType: UnifiedMediaType;
    fileName?: string;
  }) => {
    if (!isDataUrl(input.dataUrl)) return input.mediaId ?? null;
    startupTrace('migrateLocalStorage media item start', {
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      mediaType: input.mediaType,
      mediaId: input.mediaId ?? null
    });
    const blob = dataUrlToBlob(input.dataUrl);
    const mediaId = input.mediaId || createLocalId();
    await traceStartupPromise(
      `mediaRepository.saveMedia:${input.ownerType}:${input.ownerId}:${mediaId}`,
      () => mediaRepository.saveMedia({
        id: mediaId,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        mediaType: input.mediaType,
        mimeType: blob.type,
        fileName: input.fileName,
        blob
      })
    );
    migratedMediaIds.push(mediaId);
    startupTrace('migrateLocalStorage media item finish', {
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      mediaType: input.mediaType,
      mediaId
    });
    return mediaId;
  };

  startupTrace('migrateLocalStorage share_media start', { count: state.share_media?.length ?? 0 });
  for (const media of state.share_media ?? []) {
    const dataUrl = media.local_data_url;
    const mediaId = await migrateDataUrl({
      dataUrl,
      mediaId: media.id,
      ownerType: 'share',
      ownerId: media.share_id,
      mediaType: media.media_type,
      fileName: media.storage_path?.split('/').pop()
    });
    if (mediaId) {
      media.local_data_url = null;
      media.bucket = 'local-media';
      media.storage_path = media.storage_path || mediaId;
      media.mime_type = media.mime_type || dataUrlMimeType(dataUrl) || 'application/octet-stream';
      media.file_size_bytes = media.file_size_bytes || dataUrlByteSize(dataUrl);
    }
  }
  startupTrace('migrateLocalStorage share_media finish');

  startupTrace('migrateLocalStorage encouragement_cards start', { count: state.encouragement_cards?.length ?? 0 });
  for (const message of state.encouragement_cards ?? []) {
    const mediaType = mailboxMediaType(message.card_type, message.media_mime_type);
    const mediaId = await migrateDataUrl({
      dataUrl: message.local_data_url,
      mediaId: message.media_id,
      ownerType: 'mailbox',
      ownerId: message.id,
      mediaType,
      fileName: message.media_path?.split('/').pop()
    });
    if (mediaId) {
      message.media_id = mediaId;
      message.media_bucket = 'local-media';
      message.media_path = message.media_path || mediaId;
      message.media_mime_type = message.media_mime_type || dataUrlMimeType(message.local_data_url);
      message.local_data_url = null;
    }
  }
  startupTrace('migrateLocalStorage encouragement_cards finish');

  startupTrace('migrateLocalStorage special_days start', { count: state.special_days?.length ?? 0 });
  for (const day of state.special_days ?? []) {
    const mediaId = await migrateDataUrl({
      dataUrl: day.image_data_url,
      mediaId: day.image_media_id,
      ownerType: 'special-day',
      ownerId: day.id,
      mediaType: 'image',
      fileName: `${day.id}.webp`
    });
    if (mediaId) {
      day.image_media_id = mediaId;
      day.image_data_url = null;
    }
  }
  startupTrace('migrateLocalStorage special_days finish');

  startupTrace('migrateLocalStorage children start', { count: state.children?.length ?? 0 });
  for (const child of state.children ?? []) {
    const mediaId = await migrateDataUrl({
      dataUrl: child.avatar_path,
      mediaId: child.avatar_media_id,
      ownerType: 'avatar',
      ownerId: child.id,
      mediaType: 'image',
      fileName: `${child.id}-avatar.webp`
    });
    if (mediaId) {
      child.avatar_media_id = mediaId;
      child.avatar_path = null;
    }
  }
  startupTrace('migrateLocalStorage children finish');

  startupTrace('migrateLocalStorage dreams start', { count: state.dreams?.length ?? 0 });
  for (const dream of state.dreams ?? []) {
    const legacyCover = dream.cover_path || dream.coverUrl || dream.imageUrl;
    const mediaId = await migrateDataUrl({
      dataUrl: legacyCover,
      mediaId: dream.cover_media_id ?? dream.coverMediaId,
      ownerType: 'dream',
      ownerId: dream.id,
      mediaType: 'image',
      fileName: `${dream.id}-cover.webp`
    });
    if (mediaId) {
      dream.cover_media_id = mediaId;
      dream.coverMediaId = mediaId;
      dream.cover_path = null;
      dream.coverUrl = null;
      dream.imageUrl = null;
    }
  }
  startupTrace('migrateLocalStorage dreams finish');

  const settings = state.family_settings;
  startupTrace('migrateLocalStorage family_settings start', { hasSettings: Boolean(settings) });
  if (settings) {
    const familyAvatarId = await migrateDataUrl({
      dataUrl: settings.family_avatar_data_url,
      mediaId: settings.family_avatar_media_id,
      ownerType: 'avatar',
      ownerId: 'family-avatar',
      mediaType: 'image',
      fileName: 'family-avatar.webp'
    });
    if (familyAvatarId) {
      settings.family_avatar_media_id = familyAvatarId;
      settings.family_avatar_data_url = null;
    }

    const parentAvatarId = await migrateDataUrl({
      dataUrl: settings.parent_avatar_data_url,
      mediaId: settings.parent_avatar_media_id,
      ownerType: 'avatar',
      ownerId: 'parent-avatar',
      mediaType: 'image',
      fileName: 'parent-avatar.webp'
    });
    if (parentAvatarId) {
      settings.parent_avatar_media_id = parentAvatarId;
      settings.parent_avatar_data_url = null;
    }
  }
  startupTrace('migrateLocalStorage family_settings finish');

  if (migratedMediaIds.length) {
    startupTrace('migrateLocalStorage importData start', { migratedCount: migratedMediaIds.length });
    dataRepository.importData(JSON.stringify(state));
    startupTrace('migrateLocalStorage importData finish', { migratedCount: migratedMediaIds.length });
  }
  startupTrace('migrateLocalStorageMediaToRepository finish', {
    migratedCount: migratedMediaIds.length,
    migratedMediaIds
  });
  return { migratedCount: migratedMediaIds.length, migratedMediaIds };
}

function isDataUrl(value: unknown): value is string {
  return typeof value === 'string' && /^data:(image|video|audio)\//.test(value);
}

function dataUrlMimeType(value: string | null | undefined) {
  if (!isDataUrl(value)) return null;
  return value.slice(5, value.indexOf(';')) || null;
}

function dataUrlByteSize(value: string | null | undefined) {
  if (!isDataUrl(value)) return 0;
  const base64 = value.split(',')[1] ?? '';
  return Math.floor((base64.length * 3) / 4);
}

function dataUrlToBlob(dataUrl: string) {
  const [header, payload = ''] = dataUrl.split(',');
  const mimeType = header.match(/^data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

function mailboxMediaType(cardType: string, mimeType: string | null): UnifiedMediaType {
  if (cardType === 'video' || mimeType?.startsWith('video/')) return 'video';
  if (cardType === 'audio' || mimeType?.startsWith('audio/')) return 'audio';
  return 'image';
}

function createLocalId(): UUID {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
